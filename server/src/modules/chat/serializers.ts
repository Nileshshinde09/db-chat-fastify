import { env } from "../../config/env";
import type { IAttachment } from "../../models/attachment.model";
import type { IConversation } from "../../models/conversation.model";
import type { IMessage, MessageBlock } from "../../models/message.model";

function parseJson<T>(text: string | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const parsePreview = (a: Pick<IAttachment, "previewJson">) =>
  parseJson<{ sheets: unknown[] }>(a.previewJson, { sheets: [] });

/** A run older than this is considered dead (crashed server) and no longer blocks the chat. */
export const STALE_RUN_MS = env.LLM_REQUEST_TIMEOUT_MS + 60_000;

export function isBusy(c: Pick<IConversation, "activeRunAt">): boolean {
  return Boolean(
    c.activeRunAt && Date.now() - c.activeRunAt.getTime() < STALE_RUN_MS,
  );
}

export function serializeConversation(c: IConversation) {
  return {
    id: c._id.toString(),
    title: c.title,
    connectionId: c.connectionId ? c.connectionId.toString() : null,
    connectionName: c.connectionName ?? null,
    pinned: c.pinned,
    archived: c.archived,
    messageCount: c.messageCount,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    busy: isBusy(c),
  };
}

export function serializeAttachment(a: IAttachment) {
  return {
    id: a._id.toString(),
    name: a.originalName,
    kind: a.kind,
    size: a.size,
    createdAt: a.createdAt,
    attached: Boolean(a.messageId),
    conversationId: a.conversationId ? a.conversationId.toString() : null,
    preview: parsePreview(a),
  };
}

export function serializeMessage(
  m: IMessage,
  attachmentsById: Map<string, IAttachment>,
) {
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    role: m.role,
    content: m.content,
    status: m.status,
    error: m.error ? { code: m.error.code, message: m.error.message } : null,
    attachments: (m.attachmentIds ?? [])
      .map((id) => attachmentsById.get(id.toString()))
      .filter((a): a is IAttachment => Boolean(a))
      .map(serializeAttachment),
    blocks: parseJson<MessageBlock[]>(m.blocksJson, []),
    connectionId: m.connectionId ? m.connectionId.toString() : null,
    connectionName: m.connectionName ?? null,
    createdAt: m.createdAt,
  };
}
