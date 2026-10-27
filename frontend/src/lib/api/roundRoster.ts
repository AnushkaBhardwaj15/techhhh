import { apiRequest } from './client';
import { roundRosterSchema } from '../../types/roundRoster';

export async function getRoundRoster(id: string, signal?: AbortSignal) {
  const roster = roundRosterSchema.parse(await apiRequest(`/admin/play/rounds/${encodeURIComponent(id)}/participants`, { signal }));
  if (roster.roundId !== id) throw new Error('Roster does not belong to the selected game');
  return roster;
}
