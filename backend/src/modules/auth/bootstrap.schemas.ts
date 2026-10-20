import { z } from 'zod';

export const bootstrapSuperAdminSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(128),
});

export type BootstrapSuperAdminInput = z.infer<typeof bootstrapSuperAdminSchema>;
