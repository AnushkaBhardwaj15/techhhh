import { z } from 'zod';

const paginationSchema = z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().positive() });
const appliedFiltersSchema = z.object({ search: z.string().nullable(), used: z.boolean().nullable() }).optional();

export const adminKeySchema = z.object({
  id: z.string().uuid(), eventId: z.string().uuid(), value: z.string(), normalizedValue: z.string(),
  used: z.boolean().optional(), canEdit: z.boolean().optional(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
});
export const adminKeyListSchema = z.object({ data: z.array(adminKeySchema), pagination: paginationSchema, filters: appliedFiltersSchema });
export const createAdminKeySchema = z.object({ eventId: z.string().uuid(), value: z.string().trim().min(2).max(50).regex(/^[a-zA-Z0-9 -]+$/) });
export const updateAdminKeySchema = z.object({ value: z.string().trim().min(2).max(50).regex(/^[a-zA-Z0-9 -]+$/) });

export const adminQuestionSchema = z.object({
  id: z.string().uuid(), roundId: z.string().uuid(), keyId: z.string().uuid(), keyValue: z.string(), questionText: z.string(),
  used: z.boolean().optional(), canEdit: z.boolean().optional(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
});
export const adminQuestionListSchema = z.object({ data: z.array(adminQuestionSchema), pagination: paginationSchema, filters: appliedFiltersSchema });
export const createAdminQuestionSchema = z.object({ roundId: z.string().uuid(), keyId: z.string().uuid(), questionText: z.string().trim().min(10).max(500) });
export const updateAdminQuestionSchema = z.object({ questionText: z.string().trim().min(10).max(500) });

export type AdminKey = z.infer<typeof adminKeySchema>;
export type AdminKeyList = z.infer<typeof adminKeyListSchema>;
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;
export type AdminQuestionList = z.infer<typeof adminQuestionListSchema>;
export type CreateAdminKey = z.infer<typeof createAdminKeySchema>;
export type UpdateAdminKey = z.infer<typeof updateAdminKeySchema>;
export type CreateAdminQuestion = z.infer<typeof createAdminQuestionSchema>;
export type UpdateAdminQuestion = z.infer<typeof updateAdminQuestionSchema>;
