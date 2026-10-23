import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Attachment } from '../../models/attachment.model';
import { openFile } from '../../services/storage';
import { AppError, notFound } from '../../utils/errors';
import { verifyFileSignature } from '../../utils/signing';
import { idParamSchema } from '../invites/invites.schemas';
import { CONTENT_TYPES } from '../chat/attachments.service';

const querySchema = z.object({
  exp: z.coerce.number().int(),
  sig: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Used by the LLM server to download an uploaded file. No login: access is granted by a
 * short-lived HMAC-signed URL that this service created for one specific file.
 */
export default async function internalFileRoutes(app: FastifyInstance) {
  app.get(
    '/files/:id',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success || !verifyFileSignature(id, parsed.data.exp, parsed.data.sig)) {
        throw new AppError(403, 'INVALID_SIGNATURE', 'This link is invalid or has expired');
      }
      const att = await Attachment.findById(id);
      if (!att) throw notFound('File not found');
      return reply
        .header('content-type', CONTENT_TYPES[att.kind])
        .header('cache-control', 'private, no-store')
        .send(openFile(att.storageKey));
    },
  );
}
