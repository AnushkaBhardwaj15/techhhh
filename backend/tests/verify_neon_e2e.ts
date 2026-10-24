import postgres from 'postgres';
import { getDb, getSqlClient, checkDbHealth } from '../src/db/client.ts';
import { users } from '../src/db/schema/users.ts';
import { events } from '../src/db/schema/events.ts';
import { rounds } from '../src/db/schema/rounds.ts';
import { authService } from '../src/modules/auth/auth.service.ts';
import { eq } from 'drizzle-orm';

async function verifyNeonE2E() {
  console.log('=== Neon Postgres End-to-End Verification ===\n');

  // 1. Health check
  console.log('1. Checking Neon DB Health...');
  const health = await checkDbHealth();
  console.log(`   Health: ${health.ok ? 'OK' : 'FAILED'} (Latency: ${health.latencyMs}ms)`);
  if (!health.ok) throw new Error('Health check failed: ' + health.error);

  // 2. Query Neon Database via Drizzle
  console.log('\n2. Querying Neon DB Schema & Rows...');
  const db = getDb();
  const dbUsers = await db.select({ id: users.id, email: users.email, name: users.name }).from(users);
  console.log(`   Found ${dbUsers.length} users in Neon DB:`);
  for (const u of dbUsers) {
    console.log(`     - ${u.name} <${u.email}> (id: ${u.id})`);
  }

  const liveEvents = await db.select().from(events);
  console.log(`\n   Found ${liveEvents.length} event(s) in Neon DB:`);
  for (const e of liveEvents) {
    console.log(`     - ${e.title} [Status: ${e.status}] (id: ${e.id})`);
  }

  const activeRounds = await db.select().from(rounds);
  console.log(`\n   Found ${activeRounds.length} round(s) in Neon DB:`);
  for (const r of activeRounds) {
    console.log(`     - ${r.name} [Status: ${r.status}] (id: ${r.id})`);
  }

  // 3. Test Full Auth against Neon DB
  console.log('\n3. Testing End-to-End Login against Neon DB...');

  // Admin login
  const adminLogin = await authService.login({
    email: 'admin1@techtombola.internal',
    password: 'AdminPass123!',
  });
  console.log(`   Admin Login: SUCCESS (${adminLogin.user.name}, role: ${adminLogin.user.role})`);

  // Player login
  const playerLogin = await authService.login({
    email: 'player1@techtombola.internal',
    password: 'PlayerPass123!',
  });
  console.log(`   Player Login: SUCCESS (${playerLogin.user.name}, role: ${playerLogin.user.role}, eventId: ${playerLogin.user.eventId})`);

  console.log('\n=== All Neon Database E2E Checks Passed Successfully! ===');
  process.exit(0);
}

verifyNeonE2E().catch((err) => {
  console.error('\nNeon E2E check failed:', err);
  process.exit(1);
});
