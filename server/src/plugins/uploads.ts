import multipart from '@fastify/multipart';
import fp from 'fastify-plugin';
import { env } from '../config/env';
import { ensureUploadDir } from '../services/storage';

export default fp(async (app) => {
  await ensureUploadDir();
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 5,
      parts: 6,
    },
  });
});
