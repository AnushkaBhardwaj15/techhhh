export const EVENT_STATUSES = [
  'DRAFT',
  'READY',
  'LIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventSummary {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  scheduledAt?: Date | string | null;
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  scheduledAt?: Date | string | null;
  status?: EventStatus;
}

export interface EventListResult {
  data: EventSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
