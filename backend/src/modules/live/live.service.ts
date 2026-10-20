import type { ILiveReadRepository } from './live.repository.ts';
import { groupWinnersByPattern, serializeLiveDraw, serializeLiveEvent, serializeLiveRound } from './live.domain.ts';

export class LiveReadService {
  constructor(private readonly repository: ILiveReadRepository) {}

  async event() {
    const event = await this.repository.findCurrentEvent();
    return { event: event ? serializeLiveEvent(event) : null };
  }

  async round() {
    const event = await this.repository.findCurrentEvent();
    if (!event) return { round: null };
    const round = await this.repository.findCurrentRound(event.id);
    return { round: round ? serializeLiveRound(round) : null };
  }

  async draws() {
    const state = await this.currentState();
    if (!state) return { roundId: null, data: [] };
    const draws = await this.repository.listDraws(state.event.id, state.round.id);
    return { roundId: state.round.id, data: draws.map(serializeLiveDraw) };
  }

  async winners() {
    const state = await this.currentState();
    if (!state) return { roundId: null, data: [] };
    const winners = await this.repository.listVerifiedWinners(state.event.id, state.round.id);
    return { roundId: state.round.id, data: groupWinnersByPattern(winners) };
  }

  private async currentState() {
    const event = await this.repository.findCurrentEvent();
    if (!event) return null;
    const round = await this.repository.findCurrentRound(event.id);
    return round ? { event, round } : null;
  }
}
