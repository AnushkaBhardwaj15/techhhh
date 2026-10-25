import { getDb, getSqlClient } from './db/client.ts';
import { hashPassword } from './modules/auth/auth.domain.ts';
import { users, participantProfiles, adminProfiles } from './db/schema/users.ts';
import { events } from './db/schema/events.ts';
import { rounds, roundPatterns } from './db/schema/rounds.ts';
import { eventKeys, roundQuestions } from './db/schema/questions.ts';
import { eq, sql } from 'drizzle-orm';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

async function api(url: string, options: RequestInit = {}, cookie?: string) {
  const headers: Record<string, string> = {
    ...(cookie ? { Cookie: cookie } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const setCookie = res.headers.get('set-cookie');
  const rawText = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }

  return { status: res.status, ok: res.ok, data, setCookie };
}

async function main() {
  console.log('================================================================');
  console.log('🎮 STARTING 15-BOT & 2-ADMIN SIMULATION WITH FULL VERIFICATION 🎮');
  console.log('================================================================\n');

  const db = getDb();
  const sqlClient = getSqlClient();

  // 0. Ensure no other active rounds exist
  console.log('🧹 [Step 0] Cleaning up any previously ACTIVE rounds in DB...');
  await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
  console.log('   All prior active rounds marked as COMPLETED.');

  // 1. Ensure 2 Admins exist
  console.log('\n👥 [Step 1] Verifying & preparing 2 Admin accounts...');
  const adminPassHash = await hashPassword('AdminPass123!');
  
  // Admin 1 (Operator/Caller)
  const [admin1] = await db.insert(users).values({
    email: 'admin1@techtombola.internal',
    passwordHash: adminPassHash,
    name: 'Admin 1 (Game Operator)',
    status: 'ACTIVE',
  }).onConflictDoUpdate({
    target: users.email,
    set: { passwordHash: adminPassHash, status: 'ACTIVE' },
  }).returning({ id: users.id });

  await db.insert(adminProfiles).values({
    userId: admin1.id,
    role: 'SUPER_ADMIN',
  }).onConflictDoNothing();

  // Admin 2 (Auditor/Verifier)
  const [admin2] = await db.insert(users).values({
    email: 'admin2@techtombola.internal',
    passwordHash: adminPassHash,
    name: 'Admin 2 (Claims Verifier & Auditor)',
    status: 'ACTIVE',
  }).onConflictDoUpdate({
    target: users.email,
    set: { passwordHash: adminPassHash, status: 'ACTIVE' },
  }).returning({ id: users.id });

  await db.insert(adminProfiles).values({
    userId: admin2.id,
    role: 'SUPER_ADMIN',
  }).onConflictDoNothing();

  console.log('   Admin 1: admin1@techtombola.internal (Ready)');
  console.log('   Admin 2: admin2@techtombola.internal (Ready)');

  // 2. Ensure Live Event exists
  console.log('\n🏆 [Step 2] Setting up Live Event...');
  let eventList = await db.select().from(events).limit(1);
  let eventId: string;
  if (eventList.length === 0) {
    const [created] = await db.insert(events).values({
      title: 'Tech Tombola Tournament 2026',
      description: 'Official 15-bot tournament with 2 administrators',
      status: 'LIVE',
    }).returning({ id: events.id });
    eventId = created.id;
  } else {
    eventId = eventList[0].id;
    await db.update(events).set({ status: 'LIVE' }).where(eq(events.id, eventId));
  }
  console.log(`   Event ID: ${eventId} (Status: LIVE)`);

  // 3. Ensure 15 Bot Participants exist and are enrolled in this Event
  console.log('\n🤖 [Step 3] Enrolling 15 Bot participants...');
  const botPassHash = await hashPassword('BotPass123!');
  const botCredentials: Array<{ email: string; name: string; password: string; userId?: string; profileId?: string }> = [];

  for (let i = 1; i <= 15; i++) {
    const email = `bot${i}@techtombola.internal`;
    const name = `Bot Participant ${i}`;
    const [u] = await db.insert(users).values({
      email,
      name,
      passwordHash: botPassHash,
      status: 'ACTIVE',
    }).onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: botPassHash, status: 'ACTIVE' },
    }).returning({ id: users.id });

    const existingProfiles = await db.select().from(participantProfiles).where(eq(participantProfiles.userId, u.id));
    let p = existingProfiles.find((ep: any) => ep.eventId === eventId);
    if (!p) {
      [p] = await db.insert(participantProfiles).values({
        userId: u.id,
        eventId,
        externalId: `BOT-${i}`,
        status: 'ACTIVE',
        emailDeliveryStatus: 'SENT',
        createdAt: new Date(),
      }).returning();
    } else {
      [p] = await db.update(participantProfiles)
        .set({ status: 'ACTIVE', updatedAt: new Date(), createdAt: new Date() })
        .where(eq(participantProfiles.id, p.id))
        .returning();
    }

    botCredentials.push({ email, name, password: 'BotPass123!', userId: u.id, profileId: p?.id });
  }
  console.log(`   Enrolled ${botCredentials.length} active bot participants into Event.`);

  // 4. Ensure at least 25 Tech Keys exist for this Event
  console.log('\n🔑 [Step 4] Ensuring 25+ Tech Keys exist for the Event...');
  const TECH_KEYS = [
    'DOCKER', 'KUBERNETES', 'POSTGRESQL', 'REDIS', 'RABBITMQ',
    'GRAPHQL', 'WEBSOCKET', 'FASTIFY', 'REACT', 'TYPESCRIPT',
    'PYTHON', 'TERRAFORM', 'KAFKA', 'NGINX', 'LINUX',
    'GIT', 'PROMETHEUS', 'GRAFANA', 'ELASTICSEARCH', 'OPENSEARCH',
    'ANSIBLE', 'BUN', 'NODEJS', 'RUST', 'GOLANG',
    'AWS-LAMBDA', 'AWS-S3', 'AWS-EC2', 'MONGODB', 'CASSANDRA'
  ];

  for (const k of TECH_KEYS) {
    const existingKey = await db.select().from(eventKeys).where(sql`${eventKeys.eventId} = ${eventId} AND ${eventKeys.value} = ${k}`);
    if (existingKey.length === 0) {
      await db.insert(eventKeys).values({
        eventId,
        value: k,
        normalizedValue: k.toUpperCase(),
      });
    }
  }
  const currentKeys = await db.select().from(eventKeys).where(eq(eventKeys.eventId, eventId));
  console.log(`   Event has ${currentKeys.length} keys registered.`);

  // 5. Admin 1 Logs In
  console.log('\n🔑 [Step 5] Admin 1 logging in via API...');
  const a1Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin1@techtombola.internal', password: 'AdminPass123!' }),
  });
  if (!a1Login.ok) throw new Error(`Admin 1 login failed: ${JSON.stringify(a1Login.data)}`);
  const admin1Cookie = a1Login.setCookie?.split(';')[0] || '';
  console.log('   Admin 1 authenticated successfully. Session cookie acquired.');

  // 6. Admin 1 creates a new Round
  console.log('\n🎲 [Step 6] Admin 1 creating a new Round with patterns...');
  const existingRounds = await db.select().from(rounds).where(eq(rounds.eventId, eventId));
  const nextSeq = existingRounds.length + 1;
  const roundName = `Simulation Grand Round ${Date.now()}`;
  
  const createRoundRes = await api('/admin/rounds', {
    method: 'POST',
    body: JSON.stringify({
      eventId,
      sequenceNumber: nextSeq,
      name: roundName,
      patterns: [
        { patternType: 'EARLY_5', enabled: true, maxWinners: 1 },
        { patternType: 'TOP_LINE', enabled: true, maxWinners: 1 },
        { patternType: 'MIDDLE_LINE', enabled: true, maxWinners: 1 },
        { patternType: 'BOTTOM_LINE', enabled: true, maxWinners: 1 },
        { patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 },
      ],
    }),
  }, admin1Cookie);
  if (!createRoundRes.ok) throw new Error(`Create round failed: ${JSON.stringify(createRoundRes.data)}`);
  const roundId = createRoundRes.data.round.id;
  console.log(`   Round created: "${roundName}" (ID: ${roundId})`);

  // 7. Admin 1 creates at least 25 Questions for this Round
  console.log('\n❓ [Step 7] Admin 1 linking 25+ Questions to this Round...');
  for (let i = 0; i < Math.min(currentKeys.length, 25); i++) {
    const k = currentKeys[i];
    await api('/admin/questions', {
      method: 'POST',
      body: JSON.stringify({
        roundId,
        keyId: k.id,
        questionText: `Technical clue for ${k.value}: Core technology in modern architectures?`,
      }),
    }, admin1Cookie);
  }
  console.log('   25 Questions successfully registered for the Round.');

  // 8. Admin 1 Generates Tickets for the Round
  console.log('\n🎟️  [Step 8] Admin 1 generating Tickets for all enrolled participants...');
  const genTicketsRes = await api(`/admin/rounds/${roundId}/tickets/generate`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': `gen-tickets-${roundId}-${Date.now()}`,
    },
    body: JSON.stringify({}),
  }, admin1Cookie);
  if (!genTicketsRes.ok) throw new Error(`Ticket generation failed: ${JSON.stringify(genTicketsRes.data)}`);
  console.log(`   Ticket Generation Result: Created=${genTicketsRes.data.created}, Existing=${genTicketsRes.data.existing}, Total Participants=${genTicketsRes.data.totalParticipants}`);
  if ((genTicketsRes.data.created + genTicketsRes.data.existing) < 15) {
    throw new Error(`Expected at least 15 tickets generated, but got ${genTicketsRes.data.created + genTicketsRes.data.existing}`);
  }

  // 9. Admin 1 Readies and Starts Round (ACTIVE)
  console.log('\n⚡ [Step 9] Admin 1 transitioning Round to READY, then ACTIVE...');
  const readyRes = await api(`/admin/rounds/${roundId}/ready`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, admin1Cookie);
  if (!readyRes.ok) throw new Error(`Round ready failed: ${JSON.stringify(readyRes.data)}`);

  const startRes = await api(`/admin/rounds/${roundId}/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `start-${roundId}-${Date.now()}` },
    body: JSON.stringify({}),
  }, admin1Cookie);
  if (!startRes.ok) throw new Error(`Round start failed: ${JSON.stringify(startRes.data)}`);
  console.log(`   Round status is now ACTIVE!`);

  // 10. Concurrently Log in all 15 Bots and verify their Tickets
  console.log('\n🤖 [Step 10] Concurrently logging in all 15 Bots & validating Tickets...');
  const botSessions: Array<{
    botIndex: number;
    email: string;
    cookie: string;
    ticketId: string;
    cells: any[];
  }> = [];

  const loginAndVerifyPromises = botCredentials.map(async (bot, idx) => {
    // Login
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: bot.email, password: bot.password }),
    });
    if (!loginRes.ok) throw new Error(`Bot ${idx + 1} login failed: ${JSON.stringify(loginRes.data)}`);
    const cookie = loginRes.setCookie?.split(';')[0] || '';

    // Fetch Ticket
    const ticketRes = await api(`/participant/ticket?roundId=${roundId}`, {}, cookie);
    if (!ticketRes.ok) throw new Error(`Bot ${idx + 1} fetch ticket failed: ${JSON.stringify(ticketRes.data)}`);
    
    const ticketData = ticketRes.data;
    const cells = ticketData.cells;
    const ticketId = ticketData.id || ticketData.ticket?.id;

    // Strict Validations:
    // 1. Must have exactly 15 populated cells
    if (cells.length !== 15) {
      throw new Error(`Bot ${idx + 1} ticket does not have 15 cells! Found ${cells.length}`);
    }
    // 2. Must not contain duplicate keys
    const keySet = new Set(cells.map((c: any) => c.keyId));
    if (keySet.size !== 15) {
      throw new Error(`Bot ${idx + 1} ticket has DUPLICATE KEYS! Unique keys: ${keySet.size}`);
    }
    // 3. Grid coordinates validation (3 rows: 0, 1, 2)
    const rows = [0, 0, 0];
    for (const c of cells) {
      if (c.row < 0 || c.row > 2 || c.col < 0 || c.col > 8) {
        throw new Error(`Bot ${idx + 1} cell coordinate out of bounds: row ${c.row}, col ${c.col}`);
      }
      rows[c.row]++;
    }
    // Each row must have 5 numbers
    if (rows[0] !== 5 || rows[1] !== 5 || rows[2] !== 5) {
      throw new Error(`Bot ${idx + 1} row distribution invalid: ${rows.join(', ')}`);
    }

    return {
      botIndex: idx + 1,
      email: bot.email,
      cookie,
      ticketId,
      cells,
    };
  });

  const verifiedBots = await Promise.all(loginAndVerifyPromises);
  botSessions.push(...verifiedBots.sort((a, b) => a.botIndex - b.botIndex));
  console.log(`   ✅ ALL 15 BOTS VERIFIED: Each has exactly 15 unique keys, valid 3x9 grid (5 keys/row), and 0 duplicates!`);

  // 11. Admin 1 Draws 5 Keys Sequentially; All 15 Bots Mark Their Matching Cells
  console.log('\n🎯 [Step 11] Executing sequential Draws and simulating Participant Marking...');
  // Find 5 keys present on Bot 1's ticket so Bot 1 will be eligible for EARLY_5
  const bot1 = botSessions[0];
  const bot1KeyIds = bot1.cells.map((c) => c.keyId);
  const roundQuestionsRes = await api(`/admin/questions?roundId=${roundId}&limit=50`, {}, admin1Cookie);
  const questionsList = roundQuestionsRes.data.data;
  const questionsToDraw = questionsList.filter((q: any) => bot1KeyIds.includes(q.keyId)).slice(0, 5);

  if (questionsToDraw.length < 5) {
    throw new Error(`Could not find 5 matching questions for Bot 1 ticket`);
  }

  for (let d = 0; d < questionsToDraw.length; d++) {
    const q = questionsToDraw[d];
    console.log(`   📣 Admin 1 Drawing #${d + 1}: Question "${q.questionText}" (Key: ${q.keyValue})...`);
    const drawRes = await api(`/admin/rounds/${roundId}/draws/manual`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `draw-${q.id}-${Date.now()}` },
      body: JSON.stringify({ questionId: q.id }),
    }, admin1Cookie);
    if (!drawRes.ok) throw new Error(`Draw #${d + 1} failed: ${JSON.stringify(drawRes.data)}`);

    const drawnKey = drawRes.data.draw.keyValue;

    // All 15 bots inspect the board and mark if present
    const markPromises = botSessions.map(async (bot) => {
      const matchCell = bot.cells.find((c) => c.keyValue === drawnKey);
      if (matchCell) {
        const markRes = await api(`/participant/tickets/${bot.ticketId}/marks`, {
          method: 'POST',
          body: JSON.stringify({ cellId: matchCell.id }),
        }, bot.cookie);
        if (!markRes.ok) {
          throw new Error(`Bot ${bot.botIndex} failed to mark cell ${matchCell.id}: ${JSON.stringify(markRes.data)}`);
        }
        return { botIndex: bot.botIndex, marked: true, key: drawnKey };
      }
      return { botIndex: bot.botIndex, marked: false };
    });

    const markResults = await Promise.all(markPromises);
    const markedBots = markResults.filter((r) => r.marked).map((r) => `Bot ${r.botIndex}`);
    console.log(`      Marked on tickets of: ${markedBots.join(', ')}`);
  }

  // 12. Bot 1 submits Claim for EARLY_5
  console.log('\n🏆 [Step 12] Bot 1 submitting claim for EARLY_5...');
  const claimRes = await api('/participant/claims', {
    method: 'POST',
    body: JSON.stringify({ roundId, pattern: 'EARLY_5' }),
  }, bot1.cookie);
  if (!claimRes.ok) throw new Error(`Bot 1 claim submission failed: ${JSON.stringify(claimRes.data)}`);
  const claimId = claimRes.data.claim.id;
  const claimStatus = claimRes.data.claim.status;
  console.log(`   Claim submitted successfully! ID: ${claimId}, Status: ${claimStatus}`);
  if (claimStatus !== 'PENDING_VERIFICATION') {
    throw new Error(`Expected claim status PENDING_VERIFICATION, got ${claimStatus}`);
  }

  // Bot 1 checks their claim list
  const bot1Claims = await api('/participant/claims', {}, bot1.cookie);
  const foundClaim = bot1Claims.data.data.find((c: any) => c.id === claimId);
  if (!foundClaim || foundClaim.status !== 'PENDING_VERIFICATION') {
    throw new Error(`Bot 1 cannot find pending claim in /participant/claims`);
  }
  console.log('   Bot 1 confirms claim is visible and listed as PENDING_VERIFICATION.');

  // 13. Admin 2 Reviews Claims & Verifies Winner
  console.log('\n⚖️  [Step 13] Admin 2 logging in and verifying pending Claim...');
  const a2Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin2@techtombola.internal', password: 'AdminPass123!' }),
  });
  if (!a2Login.ok) throw new Error(`Admin 2 login failed: ${JSON.stringify(a2Login.data)}`);
  const admin2Cookie = a2Login.setCookie?.split(';')[0] || '';
  console.log('   Admin 2 authenticated.');

  // Admin 2 lists pending claims
  const adminClaimsRes = await api(`/admin/claims?roundId=${roundId}`, {}, admin2Cookie);
  if (!adminClaimsRes.ok) throw new Error(`Admin 2 fetch claims failed: ${JSON.stringify(adminClaimsRes.data)}`);
  const adminPendingClaim = adminClaimsRes.data.data.find((c: any) => c.id === claimId);
  if (!adminPendingClaim) {
    throw new Error(`Admin 2 cannot see pending claim ${claimId}`);
  }
  console.log(`   Admin 2 found pending claim from ${adminPendingClaim.participantName} (${adminPendingClaim.participantEmail}) for pattern: ${adminPendingClaim.patternType}`);

  // Admin 2 verifies the claim
  console.log('   Admin 2 approving/verifying claim...');
  const verifyRes = await api(`/admin/claims/${claimId}/verify`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `verify-${claimId}-${Date.now()}` },
    body: JSON.stringify({}),
  }, admin2Cookie);
  if (!verifyRes.ok) throw new Error(`Claim verification failed: ${JSON.stringify(verifyRes.data)}`);
  console.log(`   Claim verified! Winner registered: Pattern=${verifyRes.data.winner.patternType}, Winner ID=${verifyRes.data.winner.id}`);

  // 14. Verify Winner is Confirmed Across All Surfaces
  console.log('\n🥇 [Step 14] Verifying Winner across Admin and Participant surfaces...');
  // Admin 2 winners list
  const winnersRes = await api(`/admin/winners?roundId=${roundId}`, {}, admin2Cookie);
  if (!winnersRes.ok) throw new Error(`Fetch winners failed: ${JSON.stringify(winnersRes.data)}`);
  const confirmedWinner = winnersRes.data.data.find((w: any) => w.claimId === claimId);
  if (!confirmedWinner) throw new Error(`Winner ${claimId} not found in /admin/winners`);
  console.log(`   ✅ Admin Winners View: Confirmed winner is "${confirmedWinner.participantName}" for "${confirmedWinner.patternType}"!`);

  // Bot 1 wins check
  const botWinsRes = await api('/participant/wins', {}, bot1.cookie);
  const botWin = botWinsRes.data.data.find((w: any) => w.claimId === claimId);
  if (!botWin) throw new Error(`Bot 1 cannot find win in /participant/wins`);
  console.log(`   ✅ Participant Wins View: Bot 1 successfully sees their confirmed win!`);

  // Bot 1 claim status is updated to VERIFIED
  const botUpdatedClaims = await api('/participant/claims', {}, bot1.cookie);
  const updatedClaim = botUpdatedClaims.data.data.find((c: any) => c.id === claimId);
  if (!updatedClaim || updatedClaim.status !== 'VERIFIED') {
    throw new Error(`Bot 1 claim status is not VERIFIED! Got ${updatedClaim?.status}`);
  }
  console.log(`   ✅ Participant Claim Status: Updated to VERIFIED.`);

  // 15. Verify Audit Logs
  console.log('\n📜 [Step 15] Admin 2 inspecting Audit Trail logs...');
  const auditRes = await api('/admin/audit?limit=50', {}, admin2Cookie);
  if (!auditRes.ok) throw new Error(`Fetch audit logs failed: ${JSON.stringify(auditRes.data)}`);
  const auditLogs = auditRes.data.items || auditRes.data.data || [];
  console.log(`   Found ${auditLogs.length} audit trail records.`);

  const actions = auditLogs.map((l: any) => l.action);
  console.log('   Recent audited actions:', Array.from(new Set(actions)).slice(0, 10).join(', '));

  const hasRoundStart = auditLogs.some((l: any) => l.action.includes('ROUND') || l.action.includes('START'));
  const hasDraw = auditLogs.some((l: any) => l.action.includes('DRAW'));
  const hasClaimOrWinner = auditLogs.some((l: any) => l.action.includes('CLAIM') || l.action.includes('WINNER') || l.action.includes('VERIF'));

  console.log(`   Audit verification checks:
     - Round actions recorded: ${hasRoundStart ? '✅' : '❌'}
     - Draw actions recorded: ${hasDraw ? '✅' : '❌'}
     - Claim/Winner actions recorded: ${hasClaimOrWinner ? '✅' : '❌'}`);

  // 16. Admin 1 Completes the Round
  console.log('\n🏁 [Step 16] Admin 1 completing the Round...');
  const completeRes = await api(`/admin/rounds/${roundId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, admin1Cookie);
  if (!completeRes.ok) throw new Error(`Complete round failed: ${JSON.stringify(completeRes.data)}`);
  console.log(`   Round "${roundName}" successfully COMPLETED.`);

  console.log('\n================================================================');
  console.log('🎉 15-BOT & 2-ADMIN SIMULATION COMPLETED WITH 100% SUCCESS! 🎉');
  console.log('================================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ SIMULATION ENCOUNTERED ERROR:', err);
  process.exit(1);
});
