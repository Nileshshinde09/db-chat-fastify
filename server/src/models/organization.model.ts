import { Schema, model, type Types } from 'mongoose';

export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  ownerId?: Types.ObjectId;
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true },
);

export const Organization = model<IOrganization>('Organization', organizationSchema);
