import { Schema, model, type Types } from "mongoose";

export const DEFAULT_TITLE = "New chat";

export interface IConversation {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  /** "default" -> may be auto-titled, "auto" -> already auto-titled, "user" -> renamed by the user. */
  titleSource: "default" | "auto" | "user";
  /** The database this chat currently talks to. Can be switched at any time. */
  connectionId: Types.ObjectId | null;
  connectionName: string | null;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessageAt: Date;
  /** Set while an answer is being generated; guards against concurrent runs. */
  activeRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: DEFAULT_TITLE, trim: true, maxlength: 120 },
    titleSource: {
      type: String,
      enum: ["default", "auto", "user"],
      default: "default",
    },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "DbConnection",
      default: null,
    },
    connectionName: { type: String, default: null },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: () => new Date() },
    activeRunAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({
  orgId: 1,
  userId: 1,
  archived: 1,
  lastMessageAt: -1,
});
conversationSchema.index({ orgId: 1, connectionId: 1 });

export const Conversation = model<IConversation>(
  "Conversation",
  conversationSchema,
);
