import { participantClaimSchema, participantClaimsPageSchema, type ClaimPattern } from '../../types/claims';
import { apiRequest } from './client';

export async function submitParticipantClaim(roundId: string, pattern: ClaimPattern, signal?: AbortSignal) {
  const response = await apiRequest<{ claim: unknown }>('/participant/claims', { method: 'POST', body: JSON.stringify({ roundId, pattern }), signal });
  return participantClaimSchema.parse(response?.claim);
}

export async function getParticipantClaims(page = 1, limit = 50, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const response = await apiRequest<unknown>(`/participant/claims?${query}`, { signal });
  return participantClaimsPageSchema.parse(response);
}
