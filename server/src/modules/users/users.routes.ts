import type { FastifyInstance } from 'fastify';
import { toPublicUser } from '../../utils/serialize';
import { idParamSchema } from '../invites/invites.schemas';
import { updateRoleSchema, updateStatusSchema } from './users.schemas';
import * as usersService from './users.service';

export default async function userRoutes(app: FastifyInstance) {
  const manage = { preHandler: [app.authenticate, app.authorize('owner', 'admin')] };
  const ownerOnly = { preHandler: [app.authenticate, app.authorize('owner')] };

  app.get('/', manage, async (req) => {
    const users = await usersService.listUsers(req.user.orgId);
    return { users: users.map(toPublicUser) };
  });

  app.patch('/:id/role', ownerOnly, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const { role } = updateRoleSchema.parse(req.body);
    return { user: toPublicUser(await usersService.updateRole(req.user, id, role)) };
  });

  app.patch('/:id/status', manage, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const { status } = updateStatusSchema.parse(req.body);
    return { user: toPublicUser(await usersService.updateStatus(req.user, id, status)) };
  });
}
