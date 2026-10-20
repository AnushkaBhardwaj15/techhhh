import { participantTicketSchema } from '../../types/ticket';
import { apiRequest } from './client';

export async function getParticipantTicket(roundId: string, eventId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ roundId });
  const response = await apiRequest<{ ticket: unknown }>(`/participant/ticket?${query}`, { signal });
  const ticket = participantTicketSchema.parse(response?.ticket);
  if (ticket.roundId !== roundId || ticket.eventId !== eventId) throw new Error('Ticket response does not match the requested Event and Round.');
  return ticket;
}
