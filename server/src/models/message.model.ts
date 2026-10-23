import { Schema, model, type Types } from "mongoose";

export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "stopped" | "error";

/** Structured output produced next to the text: generated SQL, result tables, chart specs. */
export type MessageBlock = {
  type: "sql" | "table" | "chart";
  [key: string]: unknown;
};

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error?: { code: string; message: string };
  attachmentIds: Types.ObjectId[];
  /**
   * JSON text of MessageBlock[]. Stored as a string on purpose: result tables are arrays of
   * arrays, and chart specs (e.g. Vega-Lite) contain "$schema"-style keys that MongoDB
   * does not accept as field names.
   */
  blocksJson: string;
  /** Which database answered (snapshot, so history stays readable if the connection is deleted). */
  connectionId?: Types.ObjectId | null;
  connectionName?: string | null;
  usage?: Record<string, unknown>;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, default: "" },
    status: {
      type: String,
      enum: ["complete", "stopped", "error"],
      default: "complete",
    },
    error: {
      type: new Schema({ code: String, message: String }, { _id: false }),
    },
    attachmentIds: { type: [Schema.Types.ObjectId], default: [] },
    blocksJson: { type: String, default: "[]" },
    connectionId: { type: Schema.Types.ObjectId, default: null },
    connectionName: { type: String, default: null },
    usage: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversationId: 1, _id: 1 });

export const Message = model<IMessage>("Message", messageSchema);
