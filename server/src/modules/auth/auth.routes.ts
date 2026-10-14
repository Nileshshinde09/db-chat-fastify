import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isProd } from '../../config/env';
import { toPublicOrg, toPublicUser } from '../../utils/serialize';
import { unauthorized } from '../../utils/errors';
import { loginSchema, otpSchema, registerOrgSchema } from './auth.schemas';
import * as authService from './auth.service';
import type { RequestMeta, Session } from './auth.service';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/';

const metaOf = (req: FastifyRequest): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

function setRefreshCookie(reply: FastifyReply, session: Session): void {
  reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: COOKIE_PATH,
    expires: session.refreshExpiresAt,
  });
}

// Stricter limits for credential-handling endpoints.
const strictLimit = { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } };

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register-organization', strictLimit, async (req, reply) => {
    const input = registerOrgSchema.parse(req.body);
    const { organization, user, session } = await authService.registerOrganization(
      app,
      input,
      metaOf(req),
    );
    setRefreshCookie(reply, session);
    return reply.status(201).send({
      accessToken: session.accessToken,
      user: toPublicUser(user),
      organization: toPublicOrg(organization),
    });
  });

  app.post('/login', strictLimit, async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const { user, session } = await authService.login(app, input, metaOf(req));
    setRefreshCookie(reply, session);
    return { accessToken: session.accessToken, user: toPublicUser(user) };
  });

  app.post('/refresh', async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) throw unauthorized('Missing refresh token', 'INVALID_REFRESH_TOKEN');
    const { user, session } = await authService.refreshSession(app, raw, metaOf(req));
    setRefreshCookie(reply, session);
    return { accessToken: session.accessToken, user: toPublicUser(user) };
  });

  app.post('/logout', async (req, reply) => {
    await authService.logout(req.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const { user, organization } = await authService.getMe(req.user.sub);
    return { user: toPublicUser(user), organization: toPublicOrg(organization) };
  });

  // --- Two-factor (TOTP). Returns 403 TWO_FACTOR_DISABLED unless TWO_FACTOR_ENABLED=true ---
  app.post('/2fa/setup', { preHandler: [app.authenticate] }, async (req) => {
    return authService.setupTwoFactor(req.user.sub);
  });

  app.post('/2fa/confirm', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { otp } = otpSchema.parse(req.body);
    await authService.confirmTwoFactor(req.user.sub, otp);
    return reply.status(204).send();
  });
}
