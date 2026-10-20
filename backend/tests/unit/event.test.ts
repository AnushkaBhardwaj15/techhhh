import { describe, expect, it } from 'bun:test';
import {
  ALLOWED_EVENT_TRANSITIONS,
  assertCanEditEvent,
  assertValidEventTransition,
  canTransitionEvent,
} from '../../src/modules/events/event.domain.ts';
import { EVENT_STATUSES, type EventStatus } from '../../src/modules/events/event.types.ts';
import { ConflictError, ValidationError } from '../../src/shared/errors/app-error.ts';

describe('Event Lifecycle State Machine', () => {
  it('allows all approved transitions in the state machine table', () => {
    const validPairs: [EventStatus, EventStatus][] = [
      ['DRAFT', 'READY'],
      ['DRAFT', 'CANCELLED'],
      ['READY', 'DRAFT'],
      ['READY', 'LIVE'],
      ['READY', 'CANCELLED'],
      ['LIVE', 'PAUSED'],
      ['LIVE', 'COMPLETED'],
      ['PAUSED', 'LIVE'],
      ['PAUSED', 'CANCELLED'],
      // Self-transition (no-op)
      ['DRAFT', 'DRAFT'],
      ['READY', 'READY'],
      ['LIVE', 'LIVE'],
      ['PAUSED', 'PAUSED'],
      ['COMPLETED', 'COMPLETED'],
      ['CANCELLED', 'CANCELLED'],
    ];

    for (const [from, to] of validPairs) {
      expect(canTransitionEvent(from, to)).toBe(true);
      expect(() => assertValidEventTransition(from, to)).not.toThrow();
    }
  });

  it('rejects illegal transitions including resurrecting COMPLETED or CANCELLED events', () => {
    const invalidPairs: [EventStatus, EventStatus][] = [
      ['DRAFT', 'LIVE'],
      ['DRAFT', 'COMPLETED'],
      ['READY', 'COMPLETED'],
      ['LIVE', 'DRAFT'],
      ['LIVE', 'CANCELLED'],
      ['COMPLETED', 'LIVE'],
      ['COMPLETED', 'DRAFT'],
      ['COMPLETED', 'READY'],
      ['COMPLETED', 'PAUSED'],
      ['COMPLETED', 'CANCELLED'],
      ['CANCELLED', 'LIVE'],
      ['CANCELLED', 'DRAFT'],
      ['CANCELLED', 'READY'],
      ['CANCELLED', 'PAUSED'],
      ['CANCELLED', 'COMPLETED'],
    ];

    for (const [from, to] of invalidPairs) {
      expect(canTransitionEvent(from, to)).toBe(false);
      expect(() => assertValidEventTransition(from, to)).toThrow(ConflictError);
    }
  });

  it('allows editing metadata in DRAFT and READY states', () => {
    expect(() =>
      assertCanEditEvent('DRAFT', { title: 'New Title', scheduledAt: new Date().toISOString() })
    ).not.toThrow();

    expect(() =>
      assertCanEditEvent('READY', { title: 'New Title', scheduledAt: new Date().toISOString() })
    ).not.toThrow();
  });

  it('prevents rescheduling once an event is LIVE or PAUSED', () => {
    expect(() =>
      assertCanEditEvent('LIVE', { scheduledAt: new Date().toISOString() })
    ).toThrow(ValidationError);

    expect(() =>
      assertCanEditEvent('PAUSED', { scheduledAt: new Date().toISOString() })
    ).toThrow(ValidationError);

    // Title/description edits while LIVE or PAUSED are allowed
    expect(() =>
      assertCanEditEvent('LIVE', { title: 'Updated Announcement Title' })
    ).not.toThrow();
  });

  it('strictly rejects any modification of COMPLETED or CANCELLED historical events', () => {
    expect(() => assertCanEditEvent('COMPLETED', { title: 'Hacked Title' })).toThrow(
      ConflictError
    );
    expect(() => assertCanEditEvent('CANCELLED', { title: 'Hacked Title' })).toThrow(
      ConflictError
    );
  });
});
