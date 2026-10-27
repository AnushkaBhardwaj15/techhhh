import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.ts';
import { RoundRosterRepository } from './round-roster.repository.ts';
import { assertRoundAcceptsJoin } from './round-roster.domain.ts';
import type { PlayActor } from './play.types.ts';

export class RoundRosterService {
  constructor(private readonly repository: RoundRosterRepository = new RoundRosterRepository()) {}

  async recordJoin(id: string, actor: PlayActor) {
    if (actor.role !== 'PARTICIPANT') throw new ForbiddenError();
    await this.repository.withLockedRound(id, async (round, tx) => {
      if (!round) throw new NotFoundError('Round not found');
      if (actor.eventId && actor.eventId !== round.eventId) throw new ForbiddenError('Participant belongs to another Event');
      assertRoundAcceptsJoin(round.status);
      const participant = await this.repository.findParticipant(round.eventId, actor.userId, tx);
      if (!participant || participant.status !== 'ACTIVE' || participant.userStatus !== 'ACTIVE' || participant.adminRole) {
        throw new ForbiddenError('Participant account is unavailable for this Event');
      }
      if (!await this.repository.hasTicket(id, participant.id, tx)) throw new NotFoundError('Participant ticket not found');
      await this.repository.record(id, participant.id, tx);
    });
  }

  async list(id: string, actor: PlayActor) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenError();
    const participants = await this.repository.list(id);
    if (participants === null) throw new NotFoundError('Round not found');
    return { roundId: id, total: participants.length, participants };
  }
}

export const roundRosterService = new RoundRosterService();
