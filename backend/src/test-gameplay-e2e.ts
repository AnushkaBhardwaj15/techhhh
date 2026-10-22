import { describe, expect, it } from 'bun:test';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

async function fetchJson(url: string, options: RequestInit = {}, cookies?: string) {
  const headers: Record<string, string> = {
    ...(cookies ? { Cookie: cookies } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const setCookie = res.headers.get('set-cookie');
  let data: any = null;
  const rawText = await res.text();
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }
  if (!res.ok) {
    console.error(`ERROR [${options.method || 'GET'} ${url}]: ${res.status}`, rawText);
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers, setCookie };
}

describe('Full End-to-End Gameplay & Claim Verification Flow', () => {
  let adminCookie: string;
  let playerCookie: string;
  let eventId: string;
  let roundId: string;
  let ticketId: string;
  let claimId: string;

  it('1. Admin logs in with seeded credentials', async () => {
    const res = await fetchJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@techtombola.internal',
        password: 'AdminPass123!',
      }),
    });

    console.log('Admin login status:', res.status, 'User:', res.data?.user?.email);
    expect(res.status).toBe(200);
    expect(res.data.user.role).toBe('SUPER_ADMIN');
    adminCookie = res.setCookie?.split(';')[0] || '';
    expect(adminCookie).toBeTruthy();
  });

  it('2. Player logs in with seeded credentials', async () => {
    const res = await fetchJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'player@techtombola.internal',
        password: 'PlayerPass123!',
      }),
    });

    console.log('Player login status:', res.status, 'User:', res.data?.user?.email);
    expect(res.status).toBe(200);
    expect(res.data.user.role).toBe('PARTICIPANT');
    playerCookie = res.setCookie?.split(';')[0] || '';
    expect(playerCookie).toBeTruthy();
    eventId = res.data.user.eventId;
    expect(eventId).toBeTruthy();
  });

  it('3. Admin gets or ensures LIVE Event', async () => {
    const res = await fetchJson('/admin/events', {}, adminCookie);
    expect(res.status).toBe(200);
    const events = res.data.data;
    expect(events.length).toBeGreaterThan(0);

    const targetEvent = events.find((e: any) => e.id === eventId) || events[0];
    eventId = targetEvent.id;
    if (targetEvent.status !== 'LIVE') {
      const updateRes = await fetchJson(`/admin/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'LIVE' }),
      }, adminCookie);
      expect(updateRes.status).toBe(200);
    }
    console.log('Using LIVE Event ID:', eventId, 'Title:', targetEvent.title);
  });

  it('4. Admin creates a new Round', async () => {
    const listRes = await fetchJson(`/admin/rounds?eventId=${eventId}&limit=100`, {}, adminCookie);
    expect(listRes.status).toBe(200);
    const existingRounds = listRes.data.data || [];
    const maxSeq = existingRounds.reduce((max: number, r: any) => Math.max(max, r.sequenceNumber || 0), 0);
    const nextSeq = maxSeq + 1;

    const roundName = `End-to-End Round ${Date.now()}`;
    const createRes = await fetchJson('/admin/rounds', {
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
    }, adminCookie);

    console.log('Created round status:', createRes.status, 'Round ID:', createRes.data?.round?.id);
    expect(createRes.status).toBe(201);
    roundId = createRes.data.round.id;
    expect(roundId).toBeTruthy();
  });

  it('5. Admin assigns at least 25 Questions to the new Round', async () => {
    const keysRes = await fetchJson(`/admin/keys?eventId=${eventId}&limit=100`, {}, adminCookie);
    expect(keysRes.status).toBe(200);
    const keys = keysRes.data.data;
    console.log(`Found ${keys.length} available event keys.`);
    expect(keys.length).toBeGreaterThanOrEqual(25);

    // Create 25 questions for this round
    const qCount = Math.min(keys.length, 25);
    for (let i = 0; i < qCount; i++) {
      const key = keys[i];
      const qRes = await fetchJson('/admin/questions', {
        method: 'POST',
        body: JSON.stringify({
          roundId,
          keyId: key.id,
          questionText: `What is the technical definition or primary role of ${key.value}?`,
        }),
      }, adminCookie);
      expect(qRes.status).toBe(201);
    }

    console.log(`Successfully assigned ${qCount} questions to Round`, roundId);
  });

  it('6. Admin generates Tickets for the Round', async () => {
    const genRes = await fetchJson(`/admin/rounds/${roundId}/tickets/generate`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': `gen-ticket-${Date.now()}`,
      },
      body: JSON.stringify({}),
    }, adminCookie);

    console.log('Ticket generation status:', genRes.status, 'created:', genRes.data?.created, 'existing:', genRes.data?.existing);
    expect(genRes.status).toBe(200);
    expect((genRes.data.created + genRes.data.existing)).toBeGreaterThanOrEqual(1);
  });

  it('7. Admin transitions Round from DRAFT to READY, then starts it (ACTIVE)', async () => {
    // Pause any currently ACTIVE round so our new round can start cleanly
    const activeRoundsRes = await fetchJson(`/admin/rounds?eventId=${eventId}&status=ACTIVE`, {}, adminCookie);
    for (const r of activeRoundsRes.data?.data || []) {
      if (r.id !== roundId) {
        console.log('Pausing previously active round:', r.id, r.name);
        await fetchJson(`/admin/rounds/${r.id}/pause`, {
          method: 'POST',
          body: JSON.stringify({}),
        }, adminCookie);
      }
    }

    const readyRes = await fetchJson(`/admin/rounds/${roundId}/ready`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, adminCookie);

    console.log('Ready round status:', readyRes.status, 'status:', readyRes.data?.round?.status);
    expect(readyRes.status).toBe(200);
    expect(readyRes.data.round.status).toBe('READY');

    const startRes = await fetchJson(`/admin/rounds/${roundId}/start`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': `start-round-${Date.now()}`,
      },
      body: JSON.stringify({}),
    }, adminCookie);

    console.log('Start round status:', startRes.status, 'status:', startRes.data?.round?.status);
    expect(startRes.status).toBe(200);
    expect(startRes.data.round.status).toBe('ACTIVE');
  });

  it('8. Participant enters, views active Round & gets ticket', async () => {
    const ticketRes = await fetchJson(`/participant/ticket?roundId=${roundId}`, {}, playerCookie);
    console.log('Participant ticket status:', ticketRes.status, 'cell count:', ticketRes.data?.cells?.length);
    expect(ticketRes.status).toBe(200);
    expect(ticketRes.data.cells.length).toBe(15);
    ticketId = ticketRes.data.id || ticketRes.data.ticket?.id;
    expect(ticketId).toBeTruthy();

    const cells = ticketRes.data.cells;
    const ticketKeyIds = cells.map((c: any) => c.keyId);
    console.log('Ticket contains 15 keys. First 5 keyIds:', ticketKeyIds.slice(0, 5));
  });

  it('9. Admin draws Questions corresponding to Participant Ticket keys', async () => {
    const ticketRes = await fetchJson(`/participant/ticket?roundId=${roundId}`, {}, playerCookie);
    const cells = ticketRes.data.cells;
    const ticketKeyIds = new Set(cells.map((c: any) => c.keyId));

    const qRes = await fetchJson(`/admin/questions?roundId=${roundId}&limit=50`, {}, adminCookie);
    const roundQuestions = qRes.data.data;

    const matchingQuestions = roundQuestions.filter((q: any) => ticketKeyIds.has(q.keyId));
    console.log(`Found ${matchingQuestions.length} matching questions on participant ticket`);
    expect(matchingQuestions.length).toBeGreaterThanOrEqual(5);

    // Draw at least 5 matching questions
    for (let i = 0; i < 5; i++) {
      const q = matchingQuestions[i];
      const drawRes = await fetchJson(`/admin/rounds/${roundId}/draws/manual`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': `draw-${q.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          questionId: q.id,
        }),
      }, adminCookie);

      console.log(`Draw #${i + 1} status:`, drawRes.status, 'Key:', drawRes.data?.draw?.keyValue);
      expect(drawRes.status).toBe(200);
    }
  });

  it('10. Participant marks drawn cells on their Ticket', async () => {
    const ticketRes = await fetchJson(`/participant/ticket?roundId=${roundId}`, {}, playerCookie);
    const cells = ticketRes.data.cells;

    const drawsRes = await fetchJson(`/participant/draws?roundId=${roundId}`, {}, playerCookie);
    console.log('Participant draws status:', drawsRes.status, 'count:', drawsRes.data?.data?.length);
    expect(drawsRes.status).toBe(200);
    const drawnKeyValues = new Set(drawsRes.data.data.map((d: any) => d.keyValue));

    const cellsToMark = cells.filter((c: any) => drawnKeyValues.has(c.keyValue));
    console.log(`Marking ${cellsToMark.length} eligible drawn cells on ticket:`, cellsToMark.map((c: any) => c.keyValue));
    expect(cellsToMark.length).toBeGreaterThanOrEqual(5);

    for (const cell of cellsToMark.slice(0, 5)) {
      const markRes = await fetchJson(`/participant/tickets/${ticketId}/marks`, {
        method: 'POST',
        body: JSON.stringify({ cellId: cell.id }),
      }, playerCookie);
      console.log(`Mark cell ${cell.keyValue} (${cell.id}) status:`, markRes.status);
      expect(markRes.status).toBe(200);
    }
  });

  it('11. Participant submits Claim for EARLY_5 pattern', async () => {
    const claimRes = await fetchJson('/participant/claims', {
      method: 'POST',
      body: JSON.stringify({
        roundId,
        pattern: 'EARLY_5',
      }),
    }, playerCookie);

    console.log('Participant submit claim status:', claimRes.status, claimRes.data);
    expect(claimRes.status).toBe(200);
    expect(claimRes.data.claim.patternType).toBe('EARLY_5');
    expect(claimRes.data.claim.status).toBe('PENDING_VERIFICATION');
    claimId = claimRes.data.claim.id;
    expect(claimId).toBeTruthy();
  });

  it('12. Participant lists own claims and verifies status is PENDING_VERIFICATION', async () => {
    const listRes = await fetchJson('/participant/claims', {}, playerCookie);
    console.log('Participant claims list:', listRes.status, 'total:', listRes.data?.total);
    expect(listRes.status).toBe(200);
    const myClaim = listRes.data.data.find((c: any) => c.id === claimId);
    expect(myClaim).toBeTruthy();
    expect(myClaim.status).toBe('PENDING_VERIFICATION');
  });

  it('13. Admin sees pending claim and approves/verifies it', async () => {
    const adminClaimsRes = await fetchJson(`/admin/claims?roundId=${roundId}`, {}, adminCookie);
    console.log('Admin claims list status:', adminClaimsRes.status, 'total claims:', adminClaimsRes.data?.data?.length);
    expect(adminClaimsRes.status).toBe(200);

    const pendingClaim = adminClaimsRes.data.data.find((c: any) => c.id === claimId);
    expect(pendingClaim).toBeTruthy();

    const verifyRes = await fetchJson(`/admin/claims/${claimId}/verify`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': `verify-claim-${claimId}-${Date.now()}`,
      },
      body: JSON.stringify({}),
    }, adminCookie);

    console.log('Admin verify claim status:', verifyRes.status, 'Winner ID:', verifyRes.data?.winner?.id);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.winner).toBeTruthy();
    expect(verifyRes.data.winner.patternType).toBe('EARLY_5');
  });

  it('14. Participant verifies they are now recorded as a WINNER', async () => {
    const winsRes = await fetchJson('/participant/wins', {}, playerCookie);
    console.log('Participant wins status:', winsRes.status, 'wins count:', winsRes.data?.data?.length);
    expect(winsRes.status).toBe(200);
    const win = winsRes.data.data.find((w: any) => w.claimId === claimId);
    expect(win).toBeTruthy();
    expect(win.patternType).toBe('EARLY_5');

    // Also check claim list reflects status VERIFIED
    const claimsRes = await fetchJson('/participant/claims', {}, playerCookie);
    const updatedClaim = claimsRes.data.data.find((c: any) => c.id === claimId);
    expect(updatedClaim.status).toBe('VERIFIED');
    console.log('SUCCESS: Full cycle of round creation -> entry -> draw -> ticket mark -> claim -> admin verification -> winner confirmation is WORKING PERFECTLY!');
  });
});
