import { z } from 'zod';

export const generateTicketsParamsSchema = z.object({
  id: z.string().uuid('Round ID must be a valid UUID'),
});

export const getParticipantTicketQuerySchema = z.object({
  roundId: z.string().uuid('Round ID must be a valid UUID').optional(),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type GenerateTicketsParams = z.infer<typeof generateTicketsParamsSchema>;
export type GetParticipantTicketQuery = z.infer<typeof getParticipantTicketQuerySchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
