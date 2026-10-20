import { getDb } from '../../db/client.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { eventRepository, type IEventRepository } from './event.repository.ts';
import { assertCanEditEvent, assertValidEventTransition } from './event.domain.ts';
import type {
  CreateEventInput,
  EventListResult,
  EventStatus,
  EventSummary,
  UpdateEventInput,
} from './event.types.ts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.ts';

export class EventService {
  constructor(
    private readonly repo: IEventRepository = eventRepository,
    private readonly audit: AuditService = auditService
  ) {}

  async createEvent(
    actorId: string,
    input: CreateEventInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<EventSummary> {
    const db = getDb();
    let created: EventSummary;

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

    await db.transaction(async (tx) => {
      created = await this.repo.create(
        {
          title: input.title.trim(),
          description: input.description?.trim() || null,
          status: 'DRAFT',
          scheduledAt,
        },
        tx
      );

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_STARTED', // Domain event action
          resourceType: 'event',
          resourceId: created.id,
          metadata: { title: created.title, status: created.status },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return created!;
  }

  async getEventById(id: string): Promise<EventSummary> {
    const event = await this.repo.findById(id);
    if (!event) {
      throw new NotFoundError(`Event with id '${id}' not found`);
    }
    return event;
  }

  async listEvents(page = 1, limit = 20, status?: EventStatus): Promise<EventListResult> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { data, total } = await this.repo.list({
      page: validPage,
      limit: validLimit,
      status,
    });

    return {
      data,
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  async updateEvent(
    actorId: string,
    id: string,
    input: UpdateEventInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<EventSummary> {
    const existing = await this.getEventById(id);

    // 1. Assert metadata edit rules
    assertCanEditEvent(existing.status, input);

    const updatePayload: Record<string, any> = {};

    if (input.title !== undefined) updatePayload.title = input.title.trim();
    if (input.description !== undefined) updatePayload.description = input.description?.trim() || null;
    if (input.scheduledAt !== undefined) {
      updatePayload.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }

    // 2. Assert state transition rules if status is changing
    if (input.status && input.status !== existing.status) {
      assertValidEventTransition(existing.status, input.status);

      if (input.status === 'LIVE') {
        const liveEvent = await this.repo.findLiveEvent();
        if (liveEvent && liveEvent.id !== id) {
          throw new ConflictError(
            `Another event ('${liveEvent.title}') is already LIVE. Only one event may be LIVE at a time.`,
            'EVENT_ALREADY_LIVE'
          );
        }
        if (!existing.startedAt) {
          updatePayload.startedAt = new Date();
        }
      } else if (input.status === 'COMPLETED') {
        updatePayload.completedAt = new Date();
      }

      updatePayload.status = input.status;
    }

    const db = getDb();
    let updated: EventSummary;

    await db.transaction(async (tx) => {
      updated = await this.repo.update(id, updatePayload, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_PAUSED', // lifecycle audit
          resourceType: 'event',
          resourceId: id,
          metadata: { updates: input, fromStatus: existing.status, toStatus: updated.status },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }
}

export const eventService = new EventService();
