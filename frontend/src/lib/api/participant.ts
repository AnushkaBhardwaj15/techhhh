import { apiRequest } from './client';
import { participantEventSchema, participantRoundSchema } from '../../types/participant';

export async function getParticipantEvent(signal?: AbortSignal) {
  const response = await apiRequest<{ event: unknown }>('/participant/event', { signal });
  return participantEventSchema.parse(response?.event);
}

export async function getCurrentRound(signal?: AbortSignal) {
  const response = await apiRequest<{ round: unknown }>('/participant/round/current', { signal });
  return participantRoundSchema.parse(response?.round);
}
