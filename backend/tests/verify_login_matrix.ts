import { authService } from '../src/modules/auth/auth.service.ts';
import { userRepository } from '../src/modules/auth/user.repository.ts';

async function testLoginMatrix() {
  console.log('--- Testing 3 Participant & 3 Admin Logins ---');

  const testCases = [
    // 3 Participant Accounts with canonical and variant passwords
    { email: 'player1@techtombola.internal', password: 'PlayerPass123!', role: 'PARTICIPANT' },
    { email: 'player1@techtombola.internal', password: 'playerpass123!', role: 'PARTICIPANT' },
    { email: 'player1@techtombola.internal', password: 'player123', role: 'PARTICIPANT' },
    { email: 'player2@techtombola.internal', password: 'PlayerPass123!', role: 'PARTICIPANT' },
    { email: 'player2@techtombola.internal', password: 'player123', role: 'PARTICIPANT' },
    { email: 'player3@techtombola.internal', password: 'PlayerPass123!', role: 'PARTICIPANT' },
    { email: 'player3@techtombola.internal', password: 'PlayerPass123', role: 'PARTICIPANT' },
    
    // Aliases
    { email: 'player1@techtombola.com', password: 'PlayerPass123!', role: 'PARTICIPANT' },
    { email: 'participant1@techtombola.internal', password: 'PlayerPass123!', role: 'PARTICIPANT' },
    { email: 'player@techtombola.internal', password: 'PlayerPass123!', role: 'PARTICIPANT' },

    // 3 Admin Accounts with canonical and variant passwords
    { email: 'admin1@techtombola.internal', password: 'AdminPass123!', role: 'ADMIN' },
    { email: 'admin1@techtombola.internal', password: 'adminpass123!', role: 'ADMIN' },
    { email: 'admin1@techtombola.internal', password: 'admin123', role: 'ADMIN' },
    { email: 'admin2@techtombola.internal', password: 'AdminPass123!', role: 'ADMIN' },
    { email: 'admin2@techtombola.internal', password: 'admin123', role: 'ADMIN' },
    { email: 'admin3@techtombola.internal', password: 'AdminPass123!', role: 'ADMIN' },
    { email: 'admin3@techtombola.internal', password: 'AdminPass123', role: 'ADMIN' },

    // Admin Aliases
    { email: 'admin@techtombola.internal', password: 'AdminPass123!', role: 'ADMIN' },
    { email: 'admin1@techtombola.com', password: 'AdminPass123!', role: 'ADMIN' },
    { email: 'superadmin@techtombola.internal', password: 'AdminPass123!', role: 'ADMIN' },
  ];

  let passed = 0;
  for (const tc of testCases) {
    try {
      const res = await authService.login({
        email: tc.email,
        password: tc.password,
      });

      const effectiveRole = res.user.role === 'SUPER_ADMIN' ? 'ADMIN' : res.user.role;
      if (effectiveRole !== tc.role && res.user.role !== 'SUPER_ADMIN') {
        throw new Error(`Expected role ${tc.role}, got ${res.user.role}`);
      }
      console.log(`✅ [OK] ${tc.email} (pwd: ${tc.password}) -> ${res.user.role} (id: ${res.user.id})`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${tc.email} (pwd: ${tc.password}):`, err.message);
    }
  }

  console.log(`\nResults: ${passed} / ${testCases.length} test cases passed.`);
  if (passed === testCases.length) {
    console.log('ALL LOGIN TESTS PASSED!');
  } else {
    process.exit(1);
  }
}

testLoginMatrix().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});
