import { z } from 'zod';

export const adminParticipantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  externalId: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  emailDeliveryStatus: z.enum(['PENDING', 'SENT', 'FAILED', 'NOT_REQUIRED']),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminParticipantListSchema = z.object({
  data: z.array(adminParticipantSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
});

export const createAdminParticipantSchema = z.object({
  eventId: z.string().uuid().optional(),
  password: z.string().min(8).max(128),
  email: z.string().trim().email().max(255),
  name: z.string().trim().min(1).max(255),
  externalId: z.string().trim().min(1).max(255).optional().nullable(),
});

export const updateAdminParticipantSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field to update must be provided' });

export const participantImportReportSchema = z.object({
  totalReceived: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  errors: z.array(z.object({ rowIndex: z.number().int().positive(), email: z.string().optional(), reason: z.string() })),
});

export type AdminParticipant = z.infer<typeof adminParticipantSchema>;
export type CreateAdminParticipant = z.infer<typeof createAdminParticipantSchema>;
export type UpdateAdminParticipant = z.infer<typeof updateAdminParticipantSchema>;
export type ParticipantImportReport = z.infer<typeof participantImportReportSchema>;
