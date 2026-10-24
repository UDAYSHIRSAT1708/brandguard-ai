import mongoose, { Schema, Document } from 'mongoose';

export type ContentType = 'website' | 'social' | 'email' | 'press_release' | 'advertisement';
export type ContentStatus = 
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'NEEDS_REVISION'
  | 'IN_HUMAN_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED';

export interface IContent extends Document {
  organisationId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  title: string;
  contentType: ContentType;
  status: ContentStatus;
  currentVersion: number;
  body: string;
  findings: Array<{
    category: string;
    severity: string;
    flaggedText: string;
    explanation: string;
    guideline: string;
    sourceIds: string[];
    sourceExcerpts: string[];
    confidence: number;
    suggestedCorrection?: string;
    requiresHumanReview: boolean;
    resolution?: string;
    resolutionReason?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    contentType: {
      type: String,
      enum: ['website', 'social', 'email', 'press_release', 'advertisement'],
      default: 'website',
      required: true,
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'REVIEWING',
        'NEEDS_REVISION',
        'IN_HUMAN_REVIEW',
        'PENDING_APPROVAL',
        'APPROVED',
        'PUBLISHED',
        'REJECTED',
      ],
      default: 'DRAFT',
      required: true,
      index: true,
    },
    currentVersion: { type: Number, default: 1 },
    body: { type: String, required: true },
    findings: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

ContentSchema.index({ organisationId: 1, status: 1 });

export const Content = mongoose.model<IContent>('Content', ContentSchema);
