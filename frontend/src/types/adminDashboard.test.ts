import { describe, expect, it } from 'vitest';
import { adminDashboardSchema } from './adminDashboard';

const emptyDashboard = {
  event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0,
  pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational',
};

describe('admin dashboard DTO', () => {
  it('accepts the empty dashboard returned when no event is live', () => {
    expect(adminDashboardSchema.parse(emptyDashboard)).toEqual(emptyDashboard);
  });

  it('accepts authoritative recovery and populated operational metrics', () => {
    expect(adminDashboardSchema.parse({
      ...emptyDashboard,
      event: { id: 'event-1', title: 'Tech Tombola', status: 'LIVE' },
      round: { id: 'round-1', name: 'Round 1', sequenceNumber: 1, status: 'RECOVERY_REQUIRED' },
      participants: 500, connectedConnections: 420, drawCount: 12, pendingClaims: 2, verifiedWinners: 4,
      recoveryRequired: true, systemStatus: 'recovery_required',
    })).toMatchObject({ participants: 500, recoveryRequired: true });
  });

  it('rejects missing and malformed metrics rather than inventing dashboard values', () => {
    expect(adminDashboardSchema.safeParse({ ...emptyDashboard, connectedConnections: undefined }).success).toBe(false);
    expect(adminDashboardSchema.safeParse({ ...emptyDashboard, pendingClaims: -1 }).success).toBe(false);
    expect(adminDashboardSchema.safeParse({ ...emptyDashboard, round: { id: 'round-1', name: 'Round 1', sequenceNumber: 1, status: 'UNKNOWN' } }).success).toBe(false);
  });
});
