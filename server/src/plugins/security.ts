import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';

export default fp(async (app) => {
  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(cookie);
  // Sensible global default; sensitive routes override this with stricter limits.
  await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' });
});
