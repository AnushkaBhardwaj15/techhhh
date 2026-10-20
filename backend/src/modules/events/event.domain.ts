import { ConflictError, ValidationError } from '../../shared/errors/app-error.ts';
import type { EventStatus, UpdateEventInput } from './event.types.ts';

export const ALLOWED_EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['DRAFT', 'LIVE', 'CANCELLED'],
  LIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['LIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionEvent(current: EventStatus, next: EventStatus): boolean {
  if (current === next) return true;
  const allowed = ALLOWED_EVENT_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function assertValidEventTransition(current: EventStatus, next: EventStatus): void {
  if (current === next) return;

  if (!canTransitionEvent(current, next)) {
    throw new ConflictError(
      `Invalid event state transition from '${current}' to '${next}'`,
      'INVALID_STATE_TRANSITION'
    );
  }
}

export function assertCanEditEvent(currentStatus: EventStatus, updates: UpdateEventInput): void {
  if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
    throw new ConflictError(
      `Cannot modify an event in '${currentStatus}' status. Historical events are immutable.`,
      'EVENT_IMMUTABLE'
    );
  }

  if ((currentStatus === 'LIVE' || currentStatus === 'PAUSED') && updates.scheduledAt !== undefined) {
    throw new ValidationError(
      'Cannot reschedule an event that has already been started or is currently live'
    );
  }
}
