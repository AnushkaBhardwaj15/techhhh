import { z } from 'zod';

export const markTicketParamsSchema = z.object({
  ticketId: z.string().uuid(),
});

export const markCellBodySchema = z.object({
  cellId: z.string().uuid(),
});

export const unmarkTicketParamsSchema = z.object({
  ticketId: z.string().uuid(),
  cellId: z.string().uuid(),
});
