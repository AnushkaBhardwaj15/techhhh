import { liveWinnersSchema, participantWinsPageSchema } from '../../types/winners';
import { apiRequest } from './client';

export async function getParticipantWins(page = 1, limit = 50, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return participantWinsPageSchema.parse(await apiRequest<unknown>(`/participant/wins?${query}`, { signal }));
}

export async function getLiveWinners(signal?: AbortSignal) {
  return liveWinnersSchema.parse(await apiRequest<unknown>('/live/winners', { signal }));
}
