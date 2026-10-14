import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { User, type Role } from '../models/user.model';
import { forbidden, unauthorized } from '../utils/errors';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; orgId: string; role: Role };
    user: { sub: string; orgId: string; role: Role };
  }
}

type Hook = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifies the access token and that the user is still active. */
    authenticate: Hook;
    /** Use after `authenticate`: allows only the listed roles. */
    authorize: (...roles: Role[]) => Hook;
  }
}

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('Invalid or missing access token');
    }

    // One cheap lookup so that disabling a user or changing a role takes
    // effect immediately instead of waiting for the access token to expire.
    const user = await User.findOne({ _id: req.user.sub, orgId: req.user.orgId })
      .select('status role')
      .lean();
    if (!user || user.status !== 'active') {
      throw unauthorized('Account is not active');
    }
    req.user.role = user.role;
  });

  app.decorate('authorize', (...roles: Role[]): Hook => {
    return async (req: FastifyRequest) => {
      if (!roles.includes(req.user.role)) throw forbidden();
    };
  });
});
