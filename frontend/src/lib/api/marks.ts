import { z } from 'zod';
import { apiRequest } from './client';

const markResponseSchema = z.object({
  mark: z.object({ id: z.string().uuid(), ticketId: z.string().uuid(), cellId: z.string().uuid(), markedAt: z.string().datetime({ offset: true }) }),
});

export async function markTicketCell(ticketId: string, cellId: string) {
  const response = markResponseSchema.parse(await apiRequest<unknown>(`/participant/tickets/${ticketId}/marks`, {
    method: 'POST',
    body: JSON.stringify({ cellId }),
  }));
  if (response.mark.ticketId !== ticketId || response.mark.cellId !== cellId) throw new Error('Mark response does not match the requested Ticket cell.');
  return response.mark;
}
