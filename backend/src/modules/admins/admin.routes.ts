import type { FastifyPluginAsync } from 'fastify';
import { requireSuperAdmin } from '../../middleware/auth.ts';
import {
  adminIdParamSchema,
  adminPaginationSchema,
  createAdminSchema,
  updateAdminSchema,
} from './admin.schemas.ts';
import { adminService } from './admin.service.ts';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Super Admin only
  fastify.addHook('preHandler', requireSuperAdmin);

  fastify.get('/super-admin/admins', async (request) => {
    const query = adminPaginationSchema.parse(request.query);
    return adminService.listAdmins(query.page, query.limit);
  });

  fastify.get('/super-admin/admins/:id', async (request) => {
    const params = adminIdParamSchema.parse(request.params);
    const admin = await adminService.getAdminById(params.id);
    return { admin };
  });

  fastify.post('/super-admin/admins', async (request, reply) => {
    const body = createAdminSchema.parse(request.body);

    const result = await adminService.createAdmin(request.user!.id, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(201);
    return result;
  });

  fastify.patch('/super-admin/admins/:id', async (request) => {
    const params = adminIdParamSchema.parse(request.params);
    const body = updateAdminSchema.parse(request.body);

    const updated = await adminService.updateAdmin(
      request.user!.id,
      params.id,
      body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    return { admin: updated };
  });

  fastify.delete('/super-admin/admins/:id', async (request) => {
    const params = adminIdParamSchema.parse(request.params);

    await adminService.deleteAdmin(request.user!.id, params.id, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    return { message: 'Administrator deleted successfully' };
  });
};
