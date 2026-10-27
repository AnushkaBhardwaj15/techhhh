import { expect, test } from 'bun:test';
import { listAdminClaimsQuerySchema } from './claim.schemas.ts';

test('admin claim filters preserve a valid round and pending status with pagination', () => {
  const roundId = crypto.randomUUID();
  expect(listAdminClaimsQuerySchema.parse({ roundId, status: 'PENDING_VERIFICATION' }))
    .toEqual({ roundId, status: 'PENDING_VERIFICATION', page: 1, limit: 50 });
  expect(() => listAdminClaimsQuerySchema.parse({ roundId: 'invalid' })).toThrow();
  expect(() => listAdminClaimsQuerySchema.parse({ status: 'invented' })).toThrow();
});
