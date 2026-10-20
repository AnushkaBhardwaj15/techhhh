import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.ts';
import {
  createKeySchema,
  createQuestionSchema,
  keyIdParamSchema,
  keyPaginationSchema,
  questionIdParamSchema,
  questionPaginationSchema,
  updateKeySchema,
  updateQuestionSchema,
} from './question.schemas.ts';
import { questionService } from './question.service.ts';

export const questionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdmin);

  // --- Keys ---
  fastify.get('/admin/keys', async (request) => {
    const query = keyPaginationSchema.parse(request.query);
    return questionService.listKeys(
      query.page,
      query.limit,
      query.eventId,
      query.search,
      query.used
    );
  });

  fastify.get('/admin/keys/:id', async (request) => {
    const params = keyIdParamSchema.parse(request.params);
    const key = await questionService.getKeyById(params.id);
    return { key };
  });

  fastify.post('/admin/keys', async (request, reply) => {
    const body = createKeySchema.parse(request.body);

    const created = await questionService.createKey(request.user!.id, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(201);
    return { key: created };
  });

  fastify.patch('/admin/keys/:id', async (request) => {
    const params = keyIdParamSchema.parse(request.params);
    const body = updateKeySchema.parse(request.body);

    const updated = await questionService.updateKey(
      request.user!.id,
      params.id,
      body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    return { key: updated };
  });

  // --- Questions ---
  fastify.get('/admin/questions', async (request) => {
    const query = questionPaginationSchema.parse(request.query);
    return questionService.listQuestions(
      query.page,
      query.limit,
      query.roundId,
      query.search,
      query.used
    );
  });

  fastify.get('/admin/questions/:id', async (request) => {
    const params = questionIdParamSchema.parse(request.params);
    const question = await questionService.getQuestionById(params.id);
    return { question };
  });

  fastify.post('/admin/questions', async (request, reply) => {
    const body = createQuestionSchema.parse(request.body);

    const created = await questionService.createQuestion(request.user!.id, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(201);
    return { question: created };
  });

  fastify.patch('/admin/questions/:id', async (request) => {
    const params = questionIdParamSchema.parse(request.params);
    const body = updateQuestionSchema.parse(request.body);

    const updated = await questionService.updateQuestion(
      request.user!.id,
      params.id,
      body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    return { question: updated };
  });

  fastify.delete('/admin/questions/:id', async (request, reply) => {
    const params = questionIdParamSchema.parse(request.params);

    await questionService.deleteQuestion(request.user!.id, params.id, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(204);
    return;
  });
};
