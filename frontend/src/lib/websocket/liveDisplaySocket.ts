import { socketUrl } from './socketUrl';

export function liveDisplaySocketUrl(eventId: string, roundId: string) {
  return socketUrl('/api/v1/live/ws', new URLSearchParams({ eventId, roundId }));
}
