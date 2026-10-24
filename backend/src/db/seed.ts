import { getSqlClient, getDb } from './client.ts';
import { hashPassword } from '../modules/auth/auth.domain.ts';
import { users, adminProfiles, participantProfiles } from './schema/users.ts';
import { events } from './schema/events.ts';
import { rounds, roundPatterns } from './schema/rounds.ts';
import { eventKeys, roundQuestions } from './schema/questions.ts';
import { tickets, ticketCells } from './schema/tickets.ts';
import { generateTicketLayout } from '../modules/tickets/ticket.domain.ts';
import { eq } from 'drizzle-orm';

const SAMPLE_QUESTIONS: { key: string; question: string }[] = [
  { key: 'DOCKER', question: 'Container platform that packages apps into standardized executable units' },
  { key: 'KUBERNETES', question: 'Open-source container orchestration engine originally developed by Google' },
  { key: 'POSTGRESQL', question: 'Powerful open-source object-relational database system known for reliability' },
  { key: 'PYTHON', question: 'Interpreted programming language known for readability, AI, and Guido van Rossum' },
  { key: 'TYPESCRIPT', question: 'Typed superset of JavaScript that compiles to plain JavaScript' },
  { key: 'REACT', question: 'JavaScript library for building user interfaces with components and hooks' },
  { key: 'LINUX', question: 'Open-source Unix-like operating system kernel created by Linus Torvalds' },
  { key: 'REDIS', question: 'In-memory data structure store used as a database, cache, and message broker' },
  { key: 'GIT', question: 'Distributed version control system designed to handle projects with speed' },
  { key: 'RUST', question: 'Language empowering everyone to build reliable and efficient memory-safe software' },
  { key: 'GRAPHQL', question: 'Query language for your API and runtime for fulfilling those queries' },
  { key: 'GOOGLE', question: 'Tech giant behind Chromium, Android, V8, Go, and Antigravity' },
  { key: 'FASTIFY', question: 'Fast and low overhead web framework for Node.js' },
  { key: 'NODEJS', question: 'JavaScript runtime built on Chrome\'s V8 engine' },
  { key: 'NGINX', question: 'High-performance web server, reverse proxy, and load balancer' },
  { key: 'TAILWIND', question: 'Utility-first CSS framework for rapidly building modern designs' },
  { key: 'DRIZZLE', question: 'TypeScript ORM with SQL-like query builder and zero dependencies' },
  { key: 'WEBSOCKET', question: 'Computer communications protocol providing full-duplex communication channels' },
  { key: 'BROWSER', question: 'Application software for accessing the World Wide Web' },
  { key: 'ARGON2', question: 'Password-hashing function selected as the winner of the Password Hashing Competition' },
  { key: 'JSON', question: 'Lightweight data-interchange format easy for humans to read and machines to parse' },
  { key: 'API', question: 'Application Programming Interface defining interactions between multiple software intermediaries' },
  { key: 'DATABASE', question: 'Organized collection of data stored and accessed electronically' },
  { key: 'SERVER', question: 'Computer program or device providing a service to another computer program' },
  { key: 'CLOUD', question: 'On-demand availability of computer system resources without direct active management' },
];

export async function seed() {
  console.log('--- Starting Tech Tombola Database Seed ---');
  const db = getDb();
  const sql = getSqlClient();

  // 1. Seed 3 Admin Accounts
  const adminAccounts = [
    { email: 'admin1@techtombola.internal', password: 'AdminPass123!', name: 'Admin 1', role: 'SUPER_ADMIN' },
    { email: 'admin2@techtombola.internal', password: 'AdminPass123!', name: 'Admin 2', role: 'ADMIN' },
    { email: 'admin3@techtombola.internal', password: 'AdminPass123!', name: 'Admin 3', role: 'ADMIN' },
    { email: 'admin@techtombola.internal', password: 'AdminPass123!', name: 'Tombola Super Admin', role: 'SUPER_ADMIN' },
  ];

  for (const acc of adminAccounts) {
    const existing = await db.select().from(users).where(eq(users.email, acc.email));
    const passwordHash = await hashPassword(acc.password);
    if (existing.length === 0) {
      const [created] = await db.insert(users).values({
        email: acc.email,
        passwordHash,
        name: acc.name,
        status: 'ACTIVE',
      }).returning({ id: users.id });
      await db.insert(adminProfiles).values({
        userId: created.id,
        role: acc.role,
      });
      console.log(`Created Admin: ${acc.email} (password: ${acc.password})`);
    } else {
      await db.update(users).set({ passwordHash, status: 'ACTIVE' }).where(eq(users.id, existing[0].id));
      console.log(`Updated Admin password: ${acc.email}`);
    }
  }

  // 2. Seed Default Event
  const existingEvents = await db.select().from(events);
  let eventId: string;
  if (existingEvents.length === 0) {
    const [created] = await db.insert(events).values({
      title: 'Tech Tombola 2026',
      description: 'Official MUACM Annual Tech Tombola Tournament',
      status: 'LIVE',
    }).returning({ id: events.id });
    eventId = created.id;
    console.log(`Created Live Event: Tech Tombola 2026 (id: ${eventId})`);
  } else {
    eventId = existingEvents[0].id;
    await db.update(events).set({ status: 'LIVE' }).where(eq(events.id, eventId));
    console.log(`Found existing Event (id: ${eventId}), ensured status LIVE`);
  }

  // 3. Seed 3 Participant / Player Accounts
  const playerAccounts = [
    { email: 'player1@techtombola.internal', password: 'PlayerPass123!', name: 'Player 1' },
    { email: 'player2@techtombola.internal', password: 'PlayerPass123!', name: 'Player 2' },
    { email: 'player3@techtombola.internal', password: 'PlayerPass123!', name: 'Player 3' },
    { email: 'player@techtombola.internal', password: 'PlayerPass123!', name: 'Alex Player' },
  ];

  let playerId: string = '';
  let participantProfileId: string = '';

  for (const acc of playerAccounts) {
    const existing = await db.select().from(users).where(eq(users.email, acc.email));
    const passwordHash = await hashPassword(acc.password);
    let currentUserId: string;

    if (existing.length === 0) {
      const [createdUser] = await db.insert(users).values({
        email: acc.email,
        passwordHash,
        name: acc.name,
        status: 'ACTIVE',
      }).returning({ id: users.id });
      currentUserId = createdUser.id;

      const [createdProfile] = await db.insert(participantProfiles).values({
        userId: currentUserId,
        eventId,
        status: 'ACTIVE',
      }).returning({ id: participantProfiles.id });

      if (!participantProfileId) {
        participantProfileId = createdProfile.id;
        playerId = currentUserId;
      }
      console.log(`Created Player: ${acc.email} (password: ${acc.password})`);
    } else {
      currentUserId = existing[0].id;
      await db.update(users).set({ passwordHash, status: 'ACTIVE' }).where(eq(users.id, currentUserId));
      const profiles = await db.select().from(participantProfiles).where(eq(participantProfiles.userId, currentUserId));
      if (profiles.length === 0) {
        const [createdProfile] = await db.insert(participantProfiles).values({
          userId: currentUserId,
          eventId,
          status: 'ACTIVE',
        }).returning({ id: participantProfiles.id });
        if (!participantProfileId) participantProfileId = createdProfile.id;
      } else if (!participantProfileId) {
        participantProfileId = profiles[0].id;
      }
      if (!playerId) playerId = currentUserId;
      console.log(`Updated Player password: ${acc.email}`);
    }
  }

  // 4. Seed Questions & Keys for Event
  const keyMap = new Map<string, string>(); // value -> keyId
  for (const item of SAMPLE_QUESTIONS) {
    const existing = await sql`SELECT id FROM event_keys WHERE event_id = ${eventId} AND normalized_value = ${item.key}`;
    if (existing.length > 0) {
      keyMap.set(item.key, existing[0].id);
    } else {
      const [inserted] = await db.insert(eventKeys).values({
        eventId,
        value: item.key,
        normalizedValue: item.key,
      }).returning({ id: eventKeys.id });
      keyMap.set(item.key, inserted.id);
    }
  }
  console.log(`Seeded ${keyMap.size} technology keys.`);

  // 5. Seed Round
  const existingRounds = await db.select().from(rounds).where(eq(rounds.eventId, eventId));
  let roundId: string;
  if (existingRounds.length === 0) {
    const [created] = await db.insert(rounds).values({
      eventId,
      sequenceNumber: 1,
      name: 'Round 1 - Technology Pioneers',
      status: 'ACTIVE',
    }).returning({ id: rounds.id });
    roundId = created.id;
    console.log(`Created Round 1 (status: ACTIVE, id: ${roundId})`);
  } else {
    roundId = existingRounds[0].id;
    await db.update(rounds).set({ status: 'ACTIVE' }).where(eq(rounds.id, roundId));
    console.log(`Found Round 1 (id: ${roundId}), ensured status ACTIVE`);
  }

  // 6. Ensure Patterns for Round
  const patternTypes = ['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE'];
  for (const pt of patternTypes) {
    const existing = await db.select().from(roundPatterns).where(eq(roundPatterns.roundId, roundId));
    if (!existing.some((p) => p.patternType === pt)) {
      await db.insert(roundPatterns).values({
        roundId,
        patternType: pt,
        enabled: true,
        maxWinners: 1,
        status: 'OPEN',
      });
    }
  }

  // 7. Attach Questions to Round
  const eligibleKeys: { id: string; value: string }[] = [];
  for (const item of SAMPLE_QUESTIONS) {
    const kId = keyMap.get(item.key)!;
    eligibleKeys.push({ id: kId, value: item.key });
    const existing = await sql`SELECT id FROM round_questions WHERE round_id = ${roundId} AND key_id = ${kId}`;
    if (existing.length === 0) {
      await db.insert(roundQuestions).values({
        roundId,
        keyId: kId,
        questionText: item.question,
      });
    }
  }
  console.log(`Attached ${SAMPLE_QUESTIONS.length} questions to Round 1.`);

  // 8. Generate Ticket for Player if not exists
  const existingTicket = await db.select().from(tickets).where(eq(tickets.participantId, participantProfileId));
  if (existingTicket.length === 0) {
    const layout = generateTicketLayout({ keys: eligibleKeys });
    const [createdTicket] = await db.insert(tickets).values({
      roundId,
      participantId: participantProfileId,
      eventId,
    }).returning({ id: tickets.id });

    for (const cell of layout.cells) {
      await db.insert(ticketCells).values({
        ticketId: createdTicket.id,
        keyId: cell.keyId,
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
      });
    }
    console.log(`Generated 15-cell ticket for Alex Player (ticket id: ${createdTicket.id})`);
  } else {
    console.log(`Alex Player already has a ticket: ${existingTicket[0].id}`);
  }

  console.log('--- Database Seed Complete! ---');
  console.log('Summary:');
  console.log(`- 3 Admin Accounts seeded (admin1..admin3@techtombola.internal / AdminPass123!)`);
  console.log(`- 3 Player Accounts seeded (player1..player3@techtombola.internal / PlayerPass123!)`);
  console.log(`- Event: Tech Tombola 2026 (status: LIVE, id: ${eventId})`);
  console.log(`- Round: Round 1 - Technology Pioneers (status: ACTIVE, id: ${roundId})`);
}

if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
