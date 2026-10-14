import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isProd } from '../../config/env';
import { toPublicOrg, toPublicUser } from '../../utils/serialize';
import { Organization } from '../../models/organization.model';
import { notFound } from '../../utils/errors';
import { acceptInviteSchema, createInviteSchema, idParamSchema } from './invites.schemas';
import * as invitesService from './invites.service';

const COOKIE_PATH = '/api/v1/auth';

export default async function inviteRoutes(app: FastifyInstance) {
  const manage = { preHandler: [app.authenticate, app.authorize('owner', 'admin')] };

  app.post('/', manage, async (req, reply) => {
    const input = createInviteSchema.parse(req.body);
    const { invite, inviteLink } = await invitesService.createInvite(req.user, input);
    return reply.status(201).send({
      invite: invitesService.toPublicInvite(invite),
      // Returned only outside production, until an email provider is wired up.
      ...(isProd ? {} : { inviteLink }),
    });
  });

  app.get('/', manage, async (req) => {
    const invites = await invitesService.listPendingInvites(req.user.orgId);
    return { invites: invites.map(invitesService.toPublicInvite) };
  });

  app.delete('/:id', manage, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await invitesService.revokeInvite(req.user.orgId, id);
    return reply.status(204).send();
  });

  // Public: the invited employee sets a password and gets logged in.
  app.post(
    '/accept',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply) => {
      const input = acceptInviteSchema.parse(req.body);
      const { user, session } = await invitesService.acceptInvite(app, input, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const organization = await Organization.findById(user.orgId);
      if (!organization) throw notFound('Organization not found');

      reply.setCookie('refresh_token', session.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: COOKIE_PATH,
        expires: session.refreshExpiresAt,
      });
      return reply.status(201).send({
        accessToken: session.accessToken,
        user: toPublicUser(user),
        organization: toPublicOrg(organization),
      });
    },
  );
}
