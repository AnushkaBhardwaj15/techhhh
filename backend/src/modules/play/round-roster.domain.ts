import { ConflictError } from '../../shared/errors/app-error.ts';

export function assertRoundAcceptsJoin(status: string): void {
  if (!['READY', 'ACTIVE', 'PAUSED'].includes(status)) {
    throw new ConflictError('This game is no longer accepting participants.');
  }
}
