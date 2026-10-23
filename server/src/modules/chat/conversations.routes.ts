import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { idParamSchema } from "../invites/invites.schemas";
import {
  createConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from "./chat.schemas";
import * as conversations from "./conversations.service";
import * as messages from "./messages.service";
import { serializeConversation } from "./serializers";

export default async function conversationRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/", auth, async (req) => {
    const query = listConversationsQuerySchema.parse(req.query);
    const { conversations: rows, nextCursor } =
      await conversations.listConversations(req.user, query);
    return { conversations: rows.map(serializeConversation), nextCursor };
  });

  app.post("/", auth, async (req, reply) => {
    const input = createConversationSchema.parse(req.body ?? {});
    const conv = await conversations.createConversation(req.user, input);
    return reply
      .status(201)
      .send({ conversation: serializeConversation(conv) });
  });

  app.get("/:id", auth, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return {
      conversation: serializeConversation(
        await conversations.getOwnConversation(req.user, id),
      ),
    };
  });

  // Rename, pin, archive, or switch the active database (connectionId, or null to detach).
  app.patch("/:id", auth, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const patch = updateConversationSchema.parse(req.body);
    return {
      conversation: serializeConversation(
        await conversations.updateConversation(req.user, id, patch),
      ),
    };
  });

  app.delete("/:id", auth, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await conversations.deleteConversation(req.user, id);
    return reply.status(204).send();
  });

  app.get("/:id/messages", auth, async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const { limit, before } = listMessagesQuerySchema.parse(req.query);
    return messages.listMessages(req.user, id, limit, before);
  });

  /**
   * Send a message and get the answer.
   *  - default: Server-Sent Events (message_start, delta*, block*, title?, done)
   *  - ?stream=false: one JSON response
   * Closing the connection stops generation; whatever was produced is saved as a "stopped" answer.
   */
  app.post(
    "/:id/messages",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: { max: env.CHAT_RATE_LIMIT_MAX, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const input = sendMessageSchema.parse(req.body);
      const { stream } = sendMessageQuerySchema.parse(req.query);

      // Validation, permissions and locking happen BEFORE streaming starts,
      // so these failures come back as ordinary JSON errors.
      const run = await messages.prepareChat(app, req.user, id, input);

      const ac = new AbortController();
      const raw = reply.raw;
      let finished = false;
      raw.on("close", () => {
        if (!finished) ac.abort(); // client disconnected / pressed "stop"
      });

      if (!stream) {
        try {
          const result = await run.execute(ac.signal, () => undefined);
          return reply
            .status(201)
            .send({ userMessage: run.userMessage, ...result });
        } finally {
          finished = true;
        }
      }

      reply.hijack();
      // Headers set by earlier hooks (CORS, helmet, rate-limit) must be copied by hand after hijack().
      raw.writeHead(200, {
        ...(reply.getHeaders() as Record<string, string | number | string[]>),
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      raw.flushHeaders();

      const write = (event: string, data: unknown) => {
        if (!raw.destroyed && !raw.writableEnded)
          raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const heartbeat = setInterval(() => {
        if (!raw.destroyed && !raw.writableEnded) raw.write(": ping\n\n");
      }, 15_000);

      try {
        const result = await run.execute(ac.signal, (e) =>
          write(e.event, e.data),
        );
        write("done", result);
      } catch (err) {
        app.log.error({ err }, "failed to finish chat stream");
        write("fatal", {
          code: "INTERNAL_ERROR",
          message: "Something went wrong while saving the answer.",
        });
      } finally {
        finished = true;
        clearInterval(heartbeat);
        raw.end();
      }
    },
  );
}
