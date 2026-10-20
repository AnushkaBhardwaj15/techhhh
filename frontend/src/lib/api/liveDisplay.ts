import { liveDrawListSchema, liveEventSchema, liveRoundSchema } from '../../types/liveDisplay';
import { apiRequest } from './client';

export async function getLiveEvent(signal?: AbortSignal) {
  const response = await apiRequest<{ event: unknown }>('/live/event', { signal });
  return response?.event == null ? null : liveEventSchema.parse(response.event);
}

export async function getLiveRound(signal?: AbortSignal) {
  const response = await apiRequest<{ round: unknown }>('/live/round', { signal });
  return response?.round == null ? null : liveRoundSchema.parse(response.round);
}

export async function getLiveDraws(signal?: AbortSignal) {
  return liveDrawListSchema.parse(await apiRequest<unknown>('/live/draws', { signal }));
}
