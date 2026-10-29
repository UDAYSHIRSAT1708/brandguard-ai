import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'admin' | 'creator' | 'reviewer';
export type AuthProviderType = 'local' | 'google';

export interface IUser extends Document {
  organisationId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  authProvider: AuthProviderType;
  googleId?: string;
  avatarUrl?: string;
  refreshTokenVersion: number;
  previousRefreshTokenVersion?: number;
  previousVersionExpiresAt?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false },
    role: { type: String, enum: ['admin', 'creator', 'reviewer'], required: true, default: 'creator' },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleId: { type: String },
    avatarUrl: { type: String },
    refreshTokenVersion: { type: Number, default: 1 },
    previousRefreshTokenVersion: { type: Number },
    previousVersionExpiresAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique index: email is unique across the application for reliable single-identifier authentication
UserSchema.index({ email: 1 }, { unique: true });
// Sparse unique index: multiple local users without a googleId must not collide on null/undefined
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });

export const User = (mongoose.models.User as mongoose.Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
