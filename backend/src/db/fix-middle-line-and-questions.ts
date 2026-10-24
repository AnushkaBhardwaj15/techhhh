import { getSqlClient } from './client.ts';

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

async function main() {
  const sql = getSqlClient();

  // Find all rounds that are ACTIVE
  const activeRounds = await sql`SELECT id, name, status, event_id FROM rounds WHERE status = 'ACTIVE'`;
  console.log(`Found ${activeRounds.length} active round(s).`);

  for (const r of activeRounds) {
    const roundId = r.id;
    const eventId = r.event_id;
    console.log(`\nConfiguring Round: ${r.name} (${roundId})`);

    // 1. Ensure all 5 patterns exist and are OPEN (or keep existing verified status if closed)
    const patterns = ['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE'];
    for (const pt of patterns) {
      const existing = await sql`SELECT id, status FROM round_patterns WHERE round_id = ${roundId} AND pattern_type = ${pt}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO round_patterns (round_id, pattern_type, enabled, max_winners, status)
          VALUES (${roundId}, ${pt}, true, 1, 'OPEN')
        `;
        console.log(`+ Added pattern ${pt} (OPEN) to round.`);
      } else {
        console.log(`  Pattern ${pt} already exists (status: ${existing[0].status})`);
      }
    }

    // 2. Ensure all 25 technology keys exist in event_keys
    const keyMap = new Map<string, string>();
    for (const item of SAMPLE_QUESTIONS) {
      const existingKey = await sql`SELECT id FROM event_keys WHERE event_id = ${eventId} AND normalized_value = ${item.key}`;
      if (existingKey.length > 0) {
        keyMap.set(item.key, existingKey[0].id);
      } else {
        const [insertedKey] = await sql`
          INSERT INTO event_keys (event_id, value, normalized_value)
          VALUES (${eventId}, ${item.key}, ${item.key})
          RETURNING id
        `;
        keyMap.set(item.key, insertedKey.id);
        console.log(`+ Created event key: ${item.key}`);
      }
    }

    // 3. Ensure all 25 questions are in round_questions
    let addedQCount = 0;
    for (const item of SAMPLE_QUESTIONS) {
      const keyId = keyMap.get(item.key)!;
      const existingQ = await sql`SELECT id FROM round_questions WHERE round_id = ${roundId} AND key_id = ${keyId}`;
      if (existingQ.length === 0) {
        await sql`
          INSERT INTO round_questions (round_id, key_id, question_text)
          VALUES (${roundId}, ${keyId}, ${item.question})
        `;
        addedQCount++;
      }
    }
    console.log(`+ Added ${addedQCount} questions to round. Total pool now has 25 questions.`);

    // 4. Verify count
    const totalQ = await sql`SELECT count(*) FROM round_questions WHERE round_id = ${roundId}`;
    const totalD = await sql`SELECT count(*) FROM draws WHERE round_id = ${roundId}`;
    console.log(`✓ Verification: ${totalQ[0].count} total questions in round, ${totalD[0].count} already drawn, ${totalQ[0].count - totalD[0].count} remaining.`);
  }

  await sql.end();
  console.log('\n--- Setup Complete ---');
}

main().catch(console.error);
