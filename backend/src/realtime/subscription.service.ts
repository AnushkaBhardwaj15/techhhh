import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors/index.ts';
import type { AuthenticatedPrincipal } from '../modules/auth/auth.service.ts';
import type { EventRepository } from '../modules/events/event.repository.ts';
import type { RoundRepository } from '../modules/rounds/round.repository.ts';
import type { RoundStatus } from '../modules/rounds/round.types.ts';

export const authenticatedSubscriptionSchema = z.object({
  eventId: z.string().uuid().optional(),
  roundId: z.string().uuid(),
});

export const publicSubscriptionSchema = z.object({
  eventId: z.string().uuid(),
  roundId: z.string().uuid(),
});

const liveDisplayRoundStatuses: readonly RoundStatus[] = ['READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED'];

export interface RealtimeSubscription {
  eventId: string;
  roundId: string;
  audience: 'AUTHENTICATED' | 'ADMIN';
}

export class RealtimeSubscriptionService {
  constructor(
    private readonly eventRepo: Pick<EventRepository, 'findById'>,
    private readonly roundRepo: Pick<RoundRepository, 'findById'>
  ) {}

  async resolveAuthenticated(
    principal: AuthenticatedPrincipal['user'],
    query: unknown
  ): Promise<RealtimeSubscription> {
    const input = authenticatedSubscriptionSchema.parse(query);
    const isParticipant = principal.role === 'PARTICIPANT';
    const isAdmin = principal.role === 'ADMIN' || principal.role === 'SUPER_ADMIN';
    if (!isParticipant && !isAdmin) {
      throw new ForbiddenError('Only Participants and Administrators may subscribe to real-time events');
    }
    if (isParticipant && (!principal.eventId || (input.eventId && input.eventId !== principal.eventId))) {
      throw new ForbiddenError('Participants may only subscribe to their assigned Event');
    }
    const eventId = isParticipant ? principal.eventId : input.eventId;

    if (!eventId) {
      throw new ValidationError('eventId is required for WebSocket subscriptions');
    }

    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    await this.validateRoundScope(input.roundId, eventId);

    return {
      eventId,
      roundId: input.roundId,
      audience: isParticipant ? 'AUTHENTICATED' : 'ADMIN',
    };
  }

  async resolvePublic(query: unknown): Promise<{ eventId: string; roundId: string }> {
    const input = publicSubscriptionSchema.parse(query);
    const event = await this.eventRepo.findById(input.eventId);
    if (!event) throw new NotFoundError('Event not found');
    await this.validateRoundScope(input.roundId, input.eventId, liveDisplayRoundStatuses);
    return input;
  }

  private async validateRoundScope(
    roundId: string,
    eventId: string,
    allowedStatuses: readonly RoundStatus[] = ['ACTIVE', 'PAUSED']
  ): Promise<void> {
    const round = await this.roundRepo.findById(roundId);
    if (!round || round.eventId !== eventId) {
      throw new NotFoundError('Round not found in Event');
    }
    if (!allowedStatuses.includes(round.status)) {
      throw new ForbiddenError('Real-time subscriptions require an eligible Round');
    }
  }
}
