import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'admin' | 'creator' | 'reviewer';

export interface IUser extends Document {
  organisationId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'creator', 'reviewer'], required: true, default: 'creator' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique index: email is unique across the application for reliable single-identifier authentication
UserSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', UserSchema);
