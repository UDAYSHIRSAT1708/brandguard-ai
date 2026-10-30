import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from './User';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface IInvitation extends Document {
  organisationId: mongoose.Types.ObjectId;
  email: string;
  role: UserRole;
  permissions: string[];
  tokenHash: string;
  invitedBy: mongoose.Types.ObjectId;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'brand_manager', 'editor', 'reviewer', 'viewer', 'creator'],
      required: true,
      default: 'editor',
    },
    permissions: { type: [String], default: [] },
    tokenHash: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound index to quickly find pending invitations for an email within an organisation
InvitationSchema.index({ organisationId: 1, email: 1, status: 1 });
InvitationSchema.index({ tokenHash: 1 }, { unique: true });

export const Invitation =
  (mongoose.models.Invitation as mongoose.Model<IInvitation>) ||
  mongoose.model<IInvitation>('Invitation', InvitationSchema);
