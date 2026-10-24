import mongoose, { Schema, Document } from 'mongoose';

export type DecisionType = 'approved' | 'rejected' | 'changes_requested';

export interface IApprovalDecision extends Document {
  contentId: mongoose.Types.ObjectId;
  contentVersionId: mongoose.Types.ObjectId;
  organisationId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  versionNumber: number;
  decision: DecisionType;
  reason?: string;
  decidedAt: Date;
}

const ApprovalDecisionSchema = new Schema<IApprovalDecision>(
  {
    contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true, index: true },
    contentVersionId: { type: Schema.Types.ObjectId, ref: 'ContentVersion', required: true },
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    versionNumber: { type: Number, required: true },
    decision: {
      type: String,
      enum: ['approved', 'rejected', 'changes_requested'],
      required: true,
    },
    reason: { type: String, default: '' },
    decidedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ApprovalDecision = mongoose.model<IApprovalDecision>('ApprovalDecision', ApprovalDecisionSchema);
