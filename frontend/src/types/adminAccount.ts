import { z } from 'zod';

export const adminAccountSchema = z.strictObject({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminAccountListSchema = z.strictObject({
  data: z.array(adminAccountSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
});

export const createAdminAccountSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
});

export const updateAdminAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field to update must be provided' });

export const createdAdminAccountSchema = z.strictObject({
  admin: adminAccountSchema,
  temporaryPassword: z.string().min(1),
});

export type AdminAccount = z.infer<typeof adminAccountSchema>;
export type CreateAdminAccount = z.infer<typeof createAdminAccountSchema>;
export type UpdateAdminAccount = z.infer<typeof updateAdminAccountSchema>;
export type CreatedAdminAccount = z.infer<typeof createdAdminAccountSchema>;
