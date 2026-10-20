import { participantDrawPageSchema } from '../../types/draw';
import { apiRequest } from './client';

export async function getParticipantDraws(roundId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ roundId, limit: '100' });
  const page = participantDrawPageSchema.parse(await apiRequest<unknown>(`/participant/draws?${query}`, { signal }));
  if (page.data.some((draw) => draw.roundId !== roundId)) throw new Error('Draw response does not match the requested Round.');
  return page;
}
