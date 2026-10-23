import { Types, type HydratedDocument } from "mongoose";
import { Attachment } from "../../models/attachment.model";
import {
  Conversation,
  type IConversation,
} from "../../models/conversation.model";
import { DbConnection } from "../../models/db-connection.model";
import { Message } from "../../models/message.model";
import type { Role } from "../../models/user.model";
import { removeFile } from "../../services/storage";
import { AppError, badRequest, conflict, notFound } from "../../utils/errors";
import type {
  CreateConversationInput,
  ListConversationsQuery,
  UpdateConversationInput,
} from "./chat.schemas";
import { isBusy } from "./serializers";

export interface Actor {
  sub: string;
  orgId: string;
  role: Role;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Conversations are private: only the user who created one can see it (owners included). */
export async function getOwnConversation(
  actor: Actor,
  id: string,
): Promise<HydratedDocument<IConversation>> {
  const conv = await Conversation.findOne({
    _id: id,
    orgId: actor.orgId,
    userId: actor.sub,
  });
  if (!conv) throw notFound("Conversation not found");
  return conv;
}

async function resolveConnection(orgId: string, connectionId: string) {
  const conn = await DbConnection.findOne({ _id: connectionId, orgId }).select(
    "name",
  );
  if (!conn) throw notFound("Connection not found", "CONNECTION_NOT_FOUND");
  return conn;
}

export async function createConversation(
  actor: Actor,
  input: CreateConversationInput,
) {
  const connection = input.connectionId
    ? await resolveConnection(actor.orgId, input.connectionId)
    : null;
  return Conversation.create({
    orgId: actor.orgId,
    userId: actor.sub,
    ...(input.title ? { title: input.title, titleSource: "user" } : {}),
    connectionId: connection?._id ?? null,
    connectionName: connection?.name ?? null,
  });
}

function encodeCursor(c: IConversation): string {
  return Buffer.from(
    `${c.lastMessageAt.getTime()}_${c._id.toString()}`,
  ).toString("base64url");
}

function decodeCursor(cursor: string): { time: Date; id: Types.ObjectId } {
  const [t, id] = Buffer.from(cursor, "base64url").toString("utf8").split("_");
  if (!t || !id || !/^\d+$/.test(t) || !Types.ObjectId.isValid(id)) {
    throw badRequest("Invalid cursor", "INVALID_CURSOR");
  }
  return { time: new Date(Number(t)), id: new Types.ObjectId(id) };
}

/** Newest first, keyset-paginated so long histories stay fast and stable. */
export async function listConversations(
  actor: Actor,
  query: ListConversationsQuery,
) {
  const filter: Record<string, unknown> = {
    orgId: actor.orgId,
    userId: actor.sub,
    archived: query.archived,
  };
  if (query.pinned !== undefined) filter.pinned = query.pinned;
  if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: "i" };
  if (query.cursor) {
    const { time, id } = decodeCursor(query.cursor);
    filter.$or = [
      { lastMessageAt: { $lt: time } },
      { lastMessageAt: time, _id: { $lt: id } },
    ];
  }

  const rows = await Conversation.find(filter)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  return {
    conversations: page,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

export async function updateConversation(
  actor: Actor,
  id: string,
  patch: UpdateConversationInput,
) {
  const conv = await getOwnConversation(actor, id);

  if (patch.connectionId !== undefined) {
    // Switching the database while an answer is being generated would be confusing.
    if (isBusy(conv))
      throw conflict(
        "Wait for the current answer to finish first",
        "CONVERSATION_BUSY",
      );
    if (patch.connectionId === null) {
      conv.connectionId = null;
      conv.connectionName = null;
    } else {
      const connection = await resolveConnection(
        actor.orgId,
        patch.connectionId,
      );
      conv.connectionId = connection._id;
      conv.connectionName = connection.name;
    }
  }
  if (patch.title !== undefined) {
    conv.title = patch.title;
    conv.titleSource = "user";
  }
  if (patch.pinned !== undefined) conv.pinned = patch.pinned;
  if (patch.archived !== undefined) conv.archived = patch.archived;

  await conv.save();
  return conv;
}

export async function deleteConversation(
  actor: Actor,
  id: string,
): Promise<void> {
  const conv = await getOwnConversation(actor, id);
  if (isBusy(conv))
    throw conflict(
      "Wait for the current answer to finish first",
      "CONVERSATION_BUSY",
    );

  const files = await Attachment.find({ conversationId: conv._id }).select(
    "storageKey",
  );
  await Promise.all(
    files.map((f) => removeFile(f.storageKey).catch(() => undefined)),
  );
  await Attachment.deleteMany({ conversationId: conv._id });
  await Message.deleteMany({ conversationId: conv._id });
  const res = await Conversation.deleteOne({ _id: conv._id });
  if (res.deletedCount === 0)
    throw new AppError(404, "NOT_FOUND", "Conversation not found");
}
