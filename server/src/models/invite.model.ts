import { Schema, model, type Types } from "mongoose";

export interface IInvite {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  email: string;
  role: "admin" | "member";
  tokenHash: string;
  invitedBy: Types.ObjectId;
  encryptedToken: string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "member"], required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    encryptedToken: {
      type: String,
      required: true,
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// MongoDB removes the document automatically once expiresAt has passed.
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = model<IInvite>("Invite", inviteSchema);
