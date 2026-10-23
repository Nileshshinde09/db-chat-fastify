import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { Attachment, type IAttachment } from "../../models/attachment.model";
import {
  Conversation,
  type IConversation,
} from "../../models/conversation.model";
import { DbConnection } from "../../models/db-connection.model";
import {
  Message,
  type IMessage,
  type MessageBlock,
  type MessageStatus,
} from "../../models/message.model";
import type { LlmChatRequest, LlmFileRef } from "../../services/llm/types";
import { LlmError } from "../../services/llm/types";
import { AppError, badRequest, conflict } from "../../utils/errors";
import { signFileUrl } from "../../utils/signing";
import { loadForLlm } from "../connections/connections.service";
import type { SendMessageInput } from "./chat.schemas";
import { getOwnConversation, type Actor } from "./conversations.service";
import {
  parsePreview,
  serializeAttachment,
  serializeConversation,
  serializeMessage,
  STALE_RUN_MS,
} from "./serializers";

const MAX_FILES_IN_CONTEXT = 10;
const MAX_BLOCK_BYTES = 256 * 1024;
const MAX_BLOCKS_PER_MESSAGE = 20;
const MAX_ASSISTANT_CHARS = 100_000;

export type ChatStreamEvent =
  | {
      event: "message_start";
      data: { userMessage: ReturnType<typeof serializeMessage> };
    }
  | { event: "delta"; data: { text: string } }
  | { event: "block"; data: MessageBlock }
  | { event: "title"; data: { title: string } };

export interface ChatResult {
  assistantMessage: ReturnType<typeof serializeMessage>;
  conversation: ReturnType<typeof serializeConversation>;
}

export interface ChatRun {
  userMessage: ReturnType<typeof serializeMessage>;
  /**
   * Generates the answer and ALWAYS persists the outcome (complete, stopped or
   * error), even if the client has already disconnected. Never rejects on LLM failures.
   */
  execute(
    signal: AbortSignal,
    emit: (e: ChatStreamEvent) => void,
  ): Promise<ChatResult>;
}

/* ------------------------------------------------------------------ helpers */

/** Keeps stored structured output bounded so one huge result can't bloat the database. */
export function capBlock(block: MessageBlock): MessageBlock | null {
  if (block.type === "table" && Array.isArray(block.rows)) {
    const total = block.rows.length;
    let rows = (block.rows as unknown[][]).slice(0, env.CHAT_ROW_LIMIT);
    let truncated = Boolean(block.truncated) || rows.length < total;
    while (rows.length > 1 && JSON.stringify(rows).length > MAX_BLOCK_BYTES) {
      rows = rows.slice(0, Math.floor(rows.length / 2));
      truncated = true;
    }
    block = {
      ...block,
      rows,
      truncated,
      rowCount: typeof block.rowCount === "number" ? block.rowCount : total,
    };
  }
  return JSON.stringify(block).length > MAX_BLOCK_BYTES * 2 ? null : block;
}

function deriveTitle(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** Client-safe description of a failure; details stay in the server log. */
function describeFailure(err: unknown): { code: string; message: string } {
  if (err instanceof LlmError) {
    const messages: Record<string, string> = {
      LLM_UNREACHABLE: "The AI service is unreachable. Please try again.",
      LLM_UPSTREAM_ERROR: "The AI service returned an error. Please try again.",
      LLM_STREAM_BROKEN: "The answer was interrupted. Please try again.",
    };
    return {
      code: err.code,
      message: messages[err.code] ?? "The AI service failed to answer.",
    };
  }
  return {
    code: "CHAT_FAILED",
    message: "Something went wrong while generating the answer.",
  };
}

async function attachmentMap(
  ids: Types.ObjectId[],
): Promise<Map<string, IAttachment>> {
  if (ids.length === 0) return new Map();
  const found = await Attachment.find({ _id: { $in: ids } });
  return new Map(found.map((a) => [a._id.toString(), a]));
}

/* --------------------------------------------------------------- listing */

export async function listMessages(
  actor: Actor,
  conversationId: string,
  limit: number,
  before?: string,
) {
  const conv = await getOwnConversation(actor, conversationId);
  const filter: Record<string, unknown> = { conversationId: conv._id };
  if (before) filter._id = { $lt: new Types.ObjectId(before) };

  // Newest page first from the DB, returned oldest -> newest like a chat window.
  const rows = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const files = await attachmentMap(page.flatMap((m) => m.attachmentIds ?? []));
  return {
    messages: page.map((m) => serializeMessage(m, files)),
    nextCursor: hasMore && page[0] ? page[0]._id.toString() : null,
  };
}

/* ------------------------------------------------------------------ chat */

export async function prepareChat(
  app: FastifyInstance,
  actor: Actor,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatRun> {
  const conv = await getOwnConversation(actor, conversationId);

  // 1. Attachments being sent now must be this user's, and not already used.
  const attachmentIds = [...new Set(input.attachmentIds)];
  const newFiles = attachmentIds.length
    ? await Attachment.find({
        _id: { $in: attachmentIds },
        orgId: actor.orgId,
        userId: actor.sub,
        messageId: null,
      })
    : [];
  if (newFiles.length !== attachmentIds.length) {
    throw badRequest(
      "One or more files are invalid or were already sent",
      "INVALID_ATTACHMENT",
    );
  }

  // 2. Load the active database (with its decrypted password) before taking the lock.
  const connection = conv.connectionId
    ? await loadForLlm(actor.orgId, conv.connectionId.toString())
    : null;

  // 3. There must be something to query: a database, or at least one file in this chat.
  const existingFiles = await Attachment.countDocuments({
    conversationId: conv._id,
  });
  if (!connection && existingFiles + newFiles.length === 0) {
    throw badRequest(
      "Select a database connection or attach a CSV/Excel file first",
      "NO_DATA_SOURCE",
    );
  }

  // 4. One answer at a time per conversation. The claim is a single atomic update.
  const now = new Date();
  const claimed = await Conversation.findOneAndUpdate(
    {
      _id: conv._id,
      orgId: actor.orgId,
      userId: actor.sub,
      $or: [
        { activeRunAt: null },
        { activeRunAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
      ],
    },
    { activeRunAt: now },
    { new: true },
  );
  if (!claimed)
    throw conflict(
      "An answer is already being generated in this conversation",
      "CONVERSATION_BUSY",
    );

  const release = () =>
    Conversation.updateOne({ _id: conv._id }, { activeRunAt: null }).catch(
      () => undefined,
    );

  let userDoc;
  let request: LlmChatRequest;
  try {
    // 5. Save the user's message and link its files.
    userDoc = await Message.create({
      conversationId: conv._id,
      orgId: actor.orgId,
      userId: actor.sub,
      role: "user",
      content: input.content,
      attachmentIds: newFiles.map((f) => f._id),
      connectionId: conv.connectionId,
      connectionName: conv.connectionName,
    });
    if (newFiles.length) {
      await Attachment.updateMany(
        { _id: { $in: newFiles.map((f) => f._id) } },
        { conversationId: conv._id, messageId: userDoc._id },
      );
    }
    await Conversation.updateOne(
      { _id: conv._id },
      { $inc: { messageCount: 1 }, lastMessageAt: new Date() },
    );

    // 6. Build what the LLM server receives: recent history + files + database.
    const recent = await Message.find({ conversationId: conv._id })
      .sort({ _id: -1 })
      .limit(env.CHAT_HISTORY_LIMIT);
    const history = recent
      .reverse()
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    const contextFiles = await Attachment.find({ conversationId: conv._id })
      .sort({ _id: -1 })
      .limit(MAX_FILES_IN_CONTEXT);
    const files: LlmFileRef[] = contextFiles.map((f) => ({
      id: f._id.toString(),
      name: f.originalName,
      kind: f.kind,
      size: f.size,
      url: signFileUrl(f._id.toString()),
      preview: parsePreview(f),
    }));

    request = {
      conversationId: conv._id.toString(),
      messageId: userDoc._id.toString(),
      orgId: actor.orgId,
      userId: actor.sub,
      messages: history,
      connection,
      files,
      options: { readOnly: true, rowLimit: env.CHAT_ROW_LIMIT },
    };
    // Honor the per-connection read-only flag (defaults to true when unknown).
    if (connection) {
      const c = await DbConnection.findById(connection.id).select("readOnly");
      request.options.readOnly = c ? c.readOnly : true;
    }
  } catch (err) {
    await release();
    throw err;
  }

  const attachedMap = new Map(
    newFiles.map((f) => [
      f._id.toString(),
      { ...f.toObject(), messageId: userDoc._id } as IAttachment,
    ]),
  );
  const userMessage = serializeMessage(userDoc, attachedMap);
  const connectionSnapshot = {
    id: conv.connectionId,
    name: conv.connectionName,
  };
  const wasUntitled = conv.titleSource === "default";

  return {
    userMessage,
    async execute(signal, emit) {
      const safeEmit = (e: ChatStreamEvent) => {
        try {
          emit(e);
        } catch {
          /* the client went away; keep generating so the answer is still saved */
        }
      };

      let text = "";
      const blocks: MessageBlock[] = [];
      let status: MessageStatus = "complete";
      let error: { code: string; message: string } | undefined;
      let usage: Record<string, unknown> | undefined;
      let llmTitle: string | undefined;

      try {
        safeEmit({ event: "message_start", data: { userMessage } });
        for await (const ev of app.llm.streamChat(request, signal)) {
          if (signal.aborted) break;
          if (ev.type === "delta") {
            text += ev.text;
            safeEmit({ event: "delta", data: { text: ev.text } });
          } else if (
            ev.type === "sql" ||
            ev.type === "table" ||
            ev.type === "chart"
          ) {
            const capped =
              blocks.length < MAX_BLOCKS_PER_MESSAGE
                ? capBlock(ev as MessageBlock)
                : null;
            if (capped) {
              blocks.push(capped);
              safeEmit({ event: "block", data: capped });
            }
          } else if (ev.type === "title") {
            llmTitle = ev.title;
          } else if (ev.type === "done") {
            usage = ev.usage;
          } else if (ev.type === "error") {
            status = "error";
            error = { code: ev.code, message: ev.message.slice(0, 300) };
            break;
          }
        }
        if (signal.aborted && status === "complete") status = "stopped";
      } catch (err) {
        if (signal.aborted) {
          status = "stopped";
        } else {
          app.log.error({ err }, "chat generation failed");
          status = "error";
          error = describeFailure(err);
        }
      }

      try {
        const assistant = await Message.create({
          conversationId: conv._id,
          orgId: actor.orgId,
          userId: actor.sub,
          role: "assistant",
          content: text.slice(0, MAX_ASSISTANT_CHARS),
          status,
          error,
          blocksJson: JSON.stringify(blocks),
          usage,
          connectionId: connectionSnapshot.id,
          connectionName: connectionSnapshot.name,
        });

        const set: Partial<IConversation> = {
          lastMessageAt: new Date(),
          activeRunAt: null,
        };
        let title: string | undefined;
        if (wasUntitled) {
          title = (llmTitle ?? deriveTitle(input.content)).slice(0, 120);
          set.title = title;
          set.titleSource = "auto";
        }
        const updated = await Conversation.findOneAndUpdate(
          { _id: conv._id },
          { $set: set, $inc: { messageCount: 1 } },
          { new: true },
        );
        if (title) safeEmit({ event: "title", data: { title } });
        if (!updated)
          throw new AppError(404, "NOT_FOUND", "Conversation not found");

        return {
          assistantMessage: serializeMessage(assistant, new Map()),
          conversation: serializeConversation(updated),
        };
      } finally {
        await release();
      }
    },
  };
}

export type { IMessage };
export { serializeAttachment };
