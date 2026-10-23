import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env';
import { badRequest } from '../../utils/errors';
import { openFile } from '../../services/storage';
import { idParamSchema } from '../invites/invites.schemas';
import * as attachments from './attachments.service';
import { serializeAttachment } from './serializers';

export default async function attachmentRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // multipart/form-data with one "file" field (.csv or .xlsx). The file stays "pending"
  // until you reference its id in POST /conversations/:id/messages.
  app.post(
    '/',
    { ...auth, config: { rateLimit: { max: env.UPLOAD_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (!req.isMultipart()) throw badRequest('Send multipart/form-data with a "file" field', 'INVALID_UPLOAD');
      const part = await req.file();
      if (!part) throw badRequest('No file was uploaded', 'NO_FILE');
      const attachment = await attachments.saveUpload(req.user, part);
      return reply.status(201).send({ attachment: serializeAttachment(attachment) });
    },
  );

  app.get('/:id', auth, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return { attachment: serializeAttachment(await attachments.getOwnAttachment(req.user, id)) };
  });

  app.get('/:id/download', auth, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const att = await attachments.getOwnAttachment(req.user, id);
    return reply
      .header('content-type', attachments.CONTENT_TYPES[att.kind])
      .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`)
      .send(openFile(att.storageKey));
  });

  app.delete('/:id', auth, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await attachments.deletePendingAttachment(req.user, id);
    return reply.status(204).send();
  });
}
