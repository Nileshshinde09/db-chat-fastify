import { Schema, model, type Types } from 'mongoose';

export const ATTACHMENT_KINDS = ['csv', 'xlsx'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface SheetPreview {
  name: string;
  columns: string[];
  rowCount: number;
  sampleRows: unknown[][];
}

export interface IAttachment {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Set when the file is sent with a chat message. */
  conversationId: Types.ObjectId | null;
  messageId: Types.ObjectId | null;
  originalName: string;
  kind: AttachmentKind;
  size: number;
  storageKey: string;
  /** JSON text of { sheets: SheetPreview[] } (sample rows are arrays of arrays). */
  previewJson: string;
  createdAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    originalName: { type: String, required: true },
    kind: { type: String, enum: ATTACHMENT_KINDS, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true },
    previewJson: { type: String, default: '{"sheets":[]}' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

attachmentSchema.index({ orgId: 1, userId: 1, messageId: 1 });
attachmentSchema.index({ conversationId: 1 });

export const Attachment = model<IAttachment>('Attachment', attachmentSchema);
