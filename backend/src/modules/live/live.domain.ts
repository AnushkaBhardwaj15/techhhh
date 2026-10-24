import type {
  LiveDrawRecord,
  LiveEventRecord,
  LiveRoundRecord,
  LiveWinnerRecord,
  PublicLiveDrawDto,
  PublicLiveEventDto,
  PublicLiveRoundDto,
  PublicLiveWinnerDto,
  PublicWinnersByPattern,
} from './live.types.ts';

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function serializeLiveEvent(event: LiveEventRecord): PublicLiveEventDto {
  return { id: event.id, title: event.title, description: event.description, status: event.status, scheduledAt: iso(event.scheduledAt), startedAt: iso(event.startedAt), completedAt: iso(event.completedAt) };
}

export function serializeLiveRound(round: LiveRoundRecord): PublicLiveRoundDto {
  return { id: round.id, eventId: round.eventId, sequenceNumber: round.sequenceNumber, name: round.name, status: round.status, updatedAt: round.updatedAt.toISOString() };
}

export function serializeLiveDraw(draw: LiveDrawRecord): PublicLiveDrawDto {
  return { id: draw.id, roundId: draw.roundId, sequenceNumber: draw.sequenceNumber, drawMode: draw.drawMode, question: draw.questionText, key: draw.keyValue, drawnAt: draw.drawnAt.toISOString() };
}

export function serializeLiveWinner(winner: LiveWinnerRecord): PublicLiveWinnerDto {
  return { id: winner.id, roundId: winner.roundId, pattern: winner.patternType, participantName: winner.participantName, verifiedAt: winner.verifiedAt.toISOString() };
}

export function groupWinnersByPattern(winners: LiveWinnerRecord[]): PublicWinnersByPattern {
  const grouped: PublicWinnersByPattern = { EARLY_5: [], FOUR_CORNERS: [], SECOND_FULL_HOUSE: [], TOP_LINE: [], MIDDLE_LINE: [], BOTTOM_LINE: [], FULL_HOUSE: [] };
  for (const winner of winners) grouped[winner.patternType].push(serializeLiveWinner(winner));
  return grouped;
}
