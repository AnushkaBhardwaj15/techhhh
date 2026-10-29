import { describe, expect, it } from 'bun:test';
import {
  ClaimAttemptRecordedEvent,
  DrawCreatedEvent,
  ParticipantRegisteredEvent,
  WinnerVerifiedEvent,
  KAFKA_TOPICS,
} from '../../src/events/schemas.ts';
import {
  isEventProcessed,
  markEventProcessed,
} from '../../src/infrastructure/kafka/consumer.ts';

describe('Kafka Event Schemas & Consumer Deduplication', () => {
  it('validates a valid ParticipantRegisteredEvent', () => {
    const validEvent = {
      eventId: '11111111-1111-1111-1111-111111111111',
      traceId: 'trace-1234',
      timestamp: new Date().toISOString(),
      version: '1.0' as const,
      type: 'PARTICIPANT_REGISTERED' as const,
      payload: {
        participantId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        eventId: '44444444-4444-4444-4444-444444444444',
      },
    };

    const parsed = ParticipantRegisteredEvent.parse(validEvent);
    expect(parsed.type).toBe('PARTICIPANT_REGISTERED');
    expect(parsed.payload.participantId).toBe(validEvent.payload.participantId);
  });

  it('validates a ClaimAttemptRecordedEvent with attempt quotas', () => {
    const validClaimEvent = {
      eventId: '55555555-5555-5555-5555-555555555555',
      traceId: 'trace-claim-5678',
      timestamp: new Date().toISOString(),
      version: '1.0' as const,
      type: 'CLAIM_ATTEMPT_RECORDED' as const,
      payload: {
        attemptId: '66666666-6666-6666-6666-666666666666',
        roundId: '77777777-7777-7777-7777-777777777777',
        participantId: '88888888-8888-8888-8888-888888888888',
        ticketId: '99999999-9999-9999-9999-999999999999',
        patternType: 'FULL_HOUSE',
        attemptNumber: 2,
        attemptsRemaining: 1,
        status: 'INELIGIBLE' as const,
        rejectionReason: 'Ticket does not satisfy Full House requirements',
      },
    };

    const parsed = ClaimAttemptRecordedEvent.parse(validClaimEvent);
    expect(parsed.payload.attemptNumber).toBe(2);
    expect(parsed.payload.attemptsRemaining).toBe(1);
    expect(parsed.payload.status).toBe('INELIGIBLE');
  });

  it('rejects events with invalid attemptNumber outside 1-3 range', () => {
    const invalidClaimEvent = {
      eventId: '55555555-5555-5555-5555-555555555555',
      traceId: 'trace-claim-5678',
      timestamp: new Date().toISOString(),
      version: '1.0',
      type: 'CLAIM_ATTEMPT_RECORDED',
      payload: {
        attemptId: '66666666-6666-6666-6666-666666666666',
        roundId: '77777777-7777-7777-7777-777777777777',
        participantId: '88888888-8888-8888-8888-888888888888',
        ticketId: '99999999-9999-9999-9999-999999999999',
        patternType: 'FULL_HOUSE',
        attemptNumber: 5, // Invalid: exceeds max 3
        attemptsRemaining: 0,
        status: 'INELIGIBLE',
      },
    };

    expect(() => ClaimAttemptRecordedEvent.parse(invalidClaimEvent)).toThrow();
  });

  it('tracks processed events to deduplicate duplicate deliveries', () => {
    const eventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(isEventProcessed(eventId)).toBe(false);

    markEventProcessed(eventId);
    expect(isEventProcessed(eventId)).toBe(true);
  });

  it('declares all expected Kafka topics', () => {
    expect(KAFKA_TOPICS.PARTICIPANTS).toBe('tombola.participants');
    expect(KAFKA_TOPICS.DRAWS).toBe('tombola.draws');
    expect(KAFKA_TOPICS.CLAIMS).toBe('tombola.claims');
    expect(KAFKA_TOPICS.GAME_STATE).toBe('tombola.game.state');
    expect(KAFKA_TOPICS.DEAD_LETTER).toBe('tombola.dead-letter');
  });
});
