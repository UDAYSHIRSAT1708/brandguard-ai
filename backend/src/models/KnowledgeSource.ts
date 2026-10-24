import mongoose, { Schema, Document } from 'mongoose';

export type SourceType = 'guideline' | 'fact' | 'claim' | 'terminology' | 'disclaimer' | 'prohibited_phrase' | 'campaign';
export type SourceStatus = 'draft' | 'pending_review' | 'approved' | 'superseded' | 'archived';

export interface IKnowledgeSource extends Document {
  organisationId: mongoose.Types.ObjectId;
  title: string;
  sourceType: SourceType;
  status: SourceStatus;
  content: string;
  metadata: Record<string, any>;
  productScope?: string;
  campaignScope?: string;
  version: number;
  effectiveDate?: Date;
  expiryDate?: Date;
  uploadedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeSourceSchema = new Schema<IKnowledgeSource>(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    title: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      enum: ['guideline', 'fact', 'claim', 'terminology', 'disclaimer', 'prohibited_phrase', 'campaign'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'superseded', 'archived'],
      default: 'draft',
      required: true,
      index: true,
    },
    content: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    productScope: { type: String, default: 'Global', index: true },
    campaignScope: { type: String, default: null },
    version: { type: Number, default: 1 },
    effectiveDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for tenant-isolated querying and search
KnowledgeSourceSchema.index({ organisationId: 1, status: 1, sourceType: 1 });
KnowledgeSourceSchema.index({ content: 'text', title: 'text' });

export const KnowledgeSource = (mongoose.models.KnowledgeSource as mongoose.Model<IKnowledgeSource>) || mongoose.model<IKnowledgeSource>('KnowledgeSource', KnowledgeSourceSchema);
