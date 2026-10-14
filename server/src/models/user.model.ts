import { Schema, model, type Types } from 'mongoose';

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface IUser {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  lastLoginAt?: Date;
  twoFactor: {
    enabled: boolean;
    secret?: string; // TODO(prod): encrypt at rest (e.g. AES-GCM with a KMS-managed key)
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // Email is globally unique: a user belongs to exactly one organization,
    // and login only needs email + password.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    lastLoginAt: { type: Date },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
    },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);
