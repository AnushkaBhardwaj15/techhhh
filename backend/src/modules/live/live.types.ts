import type { PatternType, RoundStatus } from '../rounds/round.types.ts';
import type { EventStatus } from '../events/event.types.ts';

export interface LiveEventRecord {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface LiveRoundRecord {
  id: string;
  eventId: string;
  sequenceNumber: number;
  name: string;
  status: RoundStatus;
  updatedAt: Date;
}

export interface LiveDrawRecord {
  id: string;
  roundId: string;
  sequenceNumber: number;
  drawMode: string;
  questionText: string;
  keyValue: string;
  drawnAt: Date;
}

export interface LiveWinnerRecord {
  id: string;
  roundId: string;
  patternType: PatternType;
  participantName: string;
  verifiedAt: Date;
}

export interface PublicLiveEventDto {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PublicLiveRoundDto {
  id: string;
  eventId: string;
  sequenceNumber: number;
  name: string;
  status: RoundStatus;
  updatedAt: string;
}

export interface PublicLiveDrawDto {
  id: string;
  roundId: string;
  sequenceNumber: number;
  drawMode: string;
  question: string;
  key: string;
  drawnAt: string;
}

export interface PublicLiveWinnerDto {
  id: string;
  roundId: string;
  pattern: PatternType;
  participantName: string;
  verifiedAt: string;
}

export type PublicWinnersByPattern = Record<PatternType, PublicLiveWinnerDto[]>;