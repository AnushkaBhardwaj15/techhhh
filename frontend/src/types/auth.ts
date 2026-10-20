import { z } from 'zod';

const userIdentitySchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['PARTICIPANT', 'ADMIN', 'SUPER_ADMIN']),
  eventId: z.string().nullable().optional(),
});

export const loginUserSchema = userIdentitySchema;
export const authenticatedUserSchema = userIdentitySchema.extend({ status: z.string() });

export type LoginUser = z.infer<typeof loginUserSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
