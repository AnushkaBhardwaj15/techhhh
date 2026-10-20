import { z } from 'zod';

export const createAdminSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
});

export const updateAdminSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update must be provided',
  });

export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminIdParamSchema = z.object({
  id: z.string().uuid('Invalid admin ID format'),
});
