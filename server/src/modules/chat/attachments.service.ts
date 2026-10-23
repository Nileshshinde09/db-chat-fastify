import { stat } from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import { env } from "../../config/env";
import { Attachment, type AttachmentKind } from "../../models/attachment.model";
import { buildPreview, FilePreviewError } from "../../services/file-preview";
import {
  newStorageKey,
  pathFor,
  removeFile,
  saveStream,
} from "../../services/storage";
import { AppError, conflict, notFound } from "../../utils/errors";
import type { Actor } from "./conversations.service";

export const MAX_PENDING_UPLOADS = 20;

const KIND_BY_EXT: Record<string, AttachmentKind> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
};
export const CONTENT_TYPES: Record<AttachmentKind, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Strips path parts and control characters from a client-supplied file name. */
function safeName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = path
    .basename(raw)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (name || "upload").slice(0, 200);
}

const PREVIEW_STATUS: Record<FilePreviewError["code"], number> = {
  EMPTY_FILE: 422,
  UNREADABLE_FILE: 422,
  INVALID_FILE_TYPE: 415,
};

export async function saveUpload(actor: Actor, part: MultipartFile) {
  const kind = KIND_BY_EXT[path.extname(part.filename).toLowerCase()];
  if (!kind) {
    part.file.resume(); // drain so the request can finish
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Only .csv and .xlsx files are supported",
    );
  }

  const pending = await Attachment.countDocuments({
    orgId: actor.orgId,
    userId: actor.sub,
    messageId: null,
  });
  if (pending >= MAX_PENDING_UPLOADS) {
    part.file.resume();
    throw conflict(
      "Too many files waiting to be sent. Send a message or remove some files first.",
      "TOO_MANY_PENDING_UPLOADS",
    );
  }

  const key = newStorageKey(kind);
  try {
    await saveStream(key, part.file);
    // The multipart parser stops at the size limit and flags the stream instead of failing,
    // so a too-large file would otherwise be silently cut off and accepted.
    if (part.file.truncated) {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        `Files can be at most ${env.MAX_UPLOAD_MB} MB`,
      );
    }
    const file = pathFor(key);
    const preview = await buildPreview(file, kind);
    const { size } = await stat(file);
    return await Attachment.create({
      orgId: actor.orgId,
      userId: actor.sub,
      originalName: safeName(part.filename),
      kind,
      size,
      storageKey: key,
      previewJson: JSON.stringify(preview),
    });
  } catch (err) {
    await removeFile(key).catch(() => undefined);
    if (err instanceof FilePreviewError)
      throw new AppError(PREVIEW_STATUS[err.code], err.code, err.message);
    if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        `Files can be at most ${env.MAX_UPLOAD_MB} MB`,
      );
    }
    throw err;
  }
}

export async function getOwnAttachment(actor: Actor, id: string) {
  const att = await Attachment.findOne({
    _id: id,
    orgId: actor.orgId,
    userId: actor.sub,
  });
  if (!att) throw notFound("File not found");
  return att;
}

/** Only files that were never sent can be removed; sent files belong to the chat history. */
export async function deletePendingAttachment(
  actor: Actor,
  id: string,
): Promise<void> {
  const att = await getOwnAttachment(actor, id);
  if (att.messageId)
    throw conflict(
      "This file is part of a conversation. Delete the conversation to remove it.",
      "ATTACHMENT_IN_USE",
    );
  await Attachment.deleteOne({ _id: att._id });
  await removeFile(att.storageKey).catch(() => undefined);
}

/** Housekeeping: uploads that were never sent are dropped after 24 hours. */
export async function cleanupOrphanAttachments(
  olderThanMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const orphans = await Attachment.find({
    messageId: null,
    createdAt: { $lt: cutoff },
  }).select("storageKey");
  for (const o of orphans) {
    await removeFile(o.storageKey).catch(() => undefined);
    await Attachment.deleteOne({ _id: o._id });
  }
  return orphans.length;
}
