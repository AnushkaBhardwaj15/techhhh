import { z } from 'zod';

export const roundRosterSchema = z.object({
  roundId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  participants: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    joinedAt: z.string().datetime({ offset: true }),
  })),
});
export type RoundRoster = z.infer<typeof roundRosterSchema>;
