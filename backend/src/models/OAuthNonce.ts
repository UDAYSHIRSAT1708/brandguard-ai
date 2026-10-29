import mongoose, { Schema, Document } from 'mongoose';

export interface IOAuthNonce extends Document {
  nonce: string;
  createdAt: Date;
}

const OAuthNonceSchema = new Schema<IOAuthNonce>(
  {
    nonce: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 900, // 15 minutes TTL (in seconds)
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Ensure unique index on nonce
OAuthNonceSchema.index({ nonce: 1 }, { unique: true });

export const OAuthNonce =
  mongoose.models.OAuthNonce || mongoose.model<IOAuthNonce>('OAuthNonce', OAuthNonceSchema);
