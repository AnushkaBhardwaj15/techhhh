import { getDb } from '../../db/client.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { eventRepository, type IEventRepository } from '../events/event.repository.ts';
import { roundRepository, type IRoundRepository } from '../rounds/round.repository.ts';
import { questionRepository, type IQuestionRepository } from './question.repository.ts';
import {
  assertCanModifyRoundQuestions,
  normalizeKey,
  validateQuestionText,
} from './question.domain.ts';
import type {
  CreateKeyInput,
  CreateQuestionInput,
  KeyListResult,
  KeySummary,
  QuestionListResult,
  QuestionSummary,
  UpdateKeyInput,
  UpdateQuestionInput,
} from './question.types.ts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.ts';

export class QuestionService {
  constructor(
    private readonly repo: IQuestionRepository = questionRepository,
    private readonly eventRepo: IEventRepository = eventRepository,
    private readonly roundRepo: IRoundRepository = roundRepository,
    private readonly audit: AuditService = auditService
  ) {}

  async createKey(
    actorId: string,
    input: CreateKeyInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<KeySummary> {
    const normalized = normalizeKey(input.value);

    const event = await this.eventRepo.findById(input.eventId);
    if (!event) {
      throw new NotFoundError(`Event with id '${input.eventId}' not found`);
    }

    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
      throw new ConflictError(
        `Cannot create keys for event in '${event.status}' status`,
        'EVENT_IMMUTABLE'
      );
    }

    const existing = await this.repo.findKeyByEventAndNormalized(input.eventId, normalized);
    if (existing) {
      throw new ConflictError(
        `Key '${normalized}' already exists in this event`,
        'DUPLICATE_KEY'
      );
    }

    const db = getDb();
    let created: KeySummary;

    await db.transaction(async (tx) => {
      created = await this.repo.createKey(input.eventId, normalized, normalized, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'KEY_CREATED',
          resourceType: 'event_key',
          resourceId: created.id,
          metadata: {
            eventId: created.eventId,
            value: created.value,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return created!;
  }

  async getKeyById(id: string): Promise<KeySummary> {
    const key = await this.repo.findKeyById(id);
    if (!key) {
      throw new NotFoundError(`Key with id '${id}' not found`);
    }
    return key;
  }

  async listKeys(
    page = 1,
    limit = 20,
    eventId?: string,
    search?: string,
    used?: boolean
  ): Promise<KeyListResult> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { data, total } = await this.repo.listKeys({
      page: validPage,
      limit: validLimit,
      eventId,
      search,
      used,
    });

    return {
      data,
      filters: { search: search || null, used: used ?? null },
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  async updateKey(
    actorId: string,
    id: string,
    input: UpdateKeyInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<KeySummary> {
    const existing = await this.getKeyById(id);
    const normalized = normalizeKey(input.value);

    // If key is referenced in any round question, it cannot be modified
    const isReferenced = await this.repo.isKeyReferencedInQuestions(id);
    if (isReferenced) {
      throw new ConflictError(
        'Cannot modify a key that is referenced by round questions or draw history',
        'KEY_REFERENCED'
      );
    }

    if (normalized !== existing.normalizedValue) {
      const conflict = await this.repo.findKeyByEventAndNormalized(
        existing.eventId,
        normalized
      );
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Key '${normalized}' already exists in this event`,
          'DUPLICATE_KEY'
        );
      }
    }

    const db = getDb();
    let updated: KeySummary;

    await db.transaction(async (tx) => {
      updated = await this.repo.updateKey(id, normalized, normalized, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'KEY_CREATED', // Shared key audit
          resourceType: 'event_key',
          resourceId: id,
          metadata: {
            from: existing.value,
            to: updated.value,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }

  async createQuestion(
    actorId: string,
    input: CreateQuestionInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<QuestionSummary> {
    const validText = validateQuestionText(input.questionText);

    const round = await this.roundRepo.findById(input.roundId);
    if (!round) {
      throw new NotFoundError(`Round with id '${input.roundId}' not found`);
    }

    assertCanModifyRoundQuestions(round.status);

    const key = await this.getKeyById(input.keyId);

    // Assert key belongs to same event as round
    if (key.eventId !== round.eventId) {
      throw new ConflictError(
        'The specified key belongs to a different event than the round',
        'CROSS_EVENT_KEY'
      );
    }

    // Assert one active question per key in the round
    const existingQuestion = await this.repo.findQuestionByRoundAndKey(
      input.roundId,
      input.keyId
    );
    if (existingQuestion) {
      throw new ConflictError(
        `A question for key '${key.value}' already exists in this round`,
        'DUPLICATE_ROUND_KEY'
      );
    }

    const db = getDb();
    let created: QuestionSummary;

    await db.transaction(async (tx) => {
      created = await this.repo.createQuestion(
        input.roundId,
        input.keyId,
        validText,
        tx
      );

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'QUESTION_CREATED',
          resourceType: 'round_question',
          resourceId: created.id,
          metadata: {
            roundId: created.roundId,
            keyId: created.keyId,
            questionText: created.questionText,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return created!;
  }

  async getQuestionById(id: string): Promise<QuestionSummary> {
    const question = await this.repo.findQuestionById(id);
    if (!question) {
      throw new NotFoundError(`Question with id '${id}' not found`);
    }
    return question;
  }

  async listQuestions(
    page = 1,
    limit = 20,
    roundId?: string,
    search?: string,
    used?: boolean
  ): Promise<QuestionListResult> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { data, total } = await this.repo.listQuestions({
      page: validPage,
      limit: validLimit,
      roundId,
      search,
      used,
    });

    return {
      data,
      filters: { search: search || null, used: used ?? null },
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  async updateQuestion(
    actorId: string,
    id: string,
    input: UpdateQuestionInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<QuestionSummary> {
    const existing = await this.getQuestionById(id);
    const round = await this.roundRepo.findById(existing.roundId);
    if (round) {
      assertCanModifyRoundQuestions(round.status);
    }

    const validText = validateQuestionText(input.questionText);

    const db = getDb();
    let updated: QuestionSummary;

    await db.transaction(async (tx) => {
      updated = await this.repo.updateQuestion(id, validText, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'QUESTION_UPDATED',
          resourceType: 'round_question',
          resourceId: id,
          metadata: {
            from: existing.questionText,
            to: updated.questionText,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }

  async deleteQuestion(
    actorId: string,
    id: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<void> {
    const existing = await this.getQuestionById(id);
    const round = await this.roundRepo.findById(existing.roundId);
    if (round) {
      assertCanModifyRoundQuestions(round.status);
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      await this.repo.deleteQuestion(id, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'QUESTION_UPDATED', // Deletion lifecycle
          resourceType: 'round_question',
          resourceId: id,
          metadata: {
            deletedQuestionId: id,
            roundId: existing.roundId,
            keyId: existing.keyId,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });
  }
}

export const questionService = new QuestionService();
