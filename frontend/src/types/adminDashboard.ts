import { z } from 'zod';

export const adminDashboardSchema = z.object({
  event: z.object({ id: z.string(), title: z.string(), status: z.enum(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']) }).nullable(),
  round: z.object({
    id: z.string(), name: z.string(), sequenceNumber: z.number().int().positive(),
    status: z.enum(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED']),
  }).nullable(),
  participants: z.number().int().nonnegative(),
  connectedConnections: z.number().int().nonnegative(),
  drawCount: z.number().int().nonnegative(),
  pendingClaims: z.number().int().nonnegative(),
  verifiedWinners: z.number().int().nonnegative(),
  recoveryRequired: z.boolean(),
  systemStatus: z.enum(['operational', 'recovery_required']),
});

export type AdminDashboardData = z.infer<typeof adminDashboardSchema>;
