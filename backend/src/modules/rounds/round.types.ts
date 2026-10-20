export const ROUND_STATUSES = [
  'DRAFT',
  'READY',
  'ACTIVE',
  'PAUSED',
  'RECOVERY_REQUIRED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const PATTERN_TYPES = [
  'EARLY_5',
  'TOP_LINE',
  'MIDDLE_LINE',
  'BOTTOM_LINE',
  'FULL_HOUSE',
] as const;

export type PatternType = (typeof PATTERN_TYPES)[number];

export const PATTERN_STATUSES = ['OPEN', 'CLOSED'] as const;
export type PatternStatus = (typeof PATTERN_STATUSES)[number];

export interface PatternConfig {
  patternType: PatternType;
  enabled: boolean;
  maxWinners: number;
}

export interface PatternSummary extends PatternConfig {
  id: string;
  roundId: string;
  status: PatternStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundSummary {
  id: string;
  eventId: string;
  sequenceNumber: number;
  name: string;
  status: RoundStatus;
  patterns: PatternSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoundInput {
  eventId: string;
  sequenceNumber: number;
  name: string;
  patterns?: PatternConfig[];
}

export interface UpdateRoundInput {
  sequenceNumber?: number;
  name?: string;
  patterns?: PatternConfig[];
}

export interface RoundListResult {
  data: RoundSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
