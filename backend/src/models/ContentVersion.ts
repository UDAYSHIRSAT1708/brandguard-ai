import mongoose, { Schema, Document } from 'mongoose';

export interface IContentVersion extends Document {
  contentId: mongoose.Types.ObjectId;
  organisationId: mongoose.Types.ObjectId;
  versionNumber: number;
  body: string;
  metadata: Record<string, any>;
  submittedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ContentVersionSchema = new Schema<IContentVersion>(
  {
    contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true, index: true },
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    versionNumber: { type: Number, required: true },
    body: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Unique compound index: versionNumber is unique per content item
ContentVersionSchema.index({ contentId: 1, versionNumber: 1 }, { unique: true });

export const ContentVersion = mongoose.model<IContentVersion>('ContentVersion', ContentVersionSchema);
