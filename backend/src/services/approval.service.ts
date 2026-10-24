import mongoose from 'mongoose';
import { Content } from '../models/Content';
import { ContentVersion } from '../models/ContentVersion';
import { ApprovalDecision, IApprovalDecision, DecisionType } from '../models/ApprovalDecision';
import { logAuditEvent } from './audit.service';

export class ApprovalService {
  static async recordDecision(params: {
    contentId: string;
    organisationId: string;
    reviewerId: string;
    reviewerRole: string;
    versionNumber: number;
    decision: DecisionType;
    reason?: string;
  }): Promise<IApprovalDecision> {
    const orgId = new mongoose.Types.ObjectId(params.organisationId);
    const contentId = new mongoose.Types.ObjectId(params.contentId);
    const reviewerId = new mongoose.Types.ObjectId(params.reviewerId);

    // 1. Role verification
    if (params.reviewerRole !== 'admin' && params.reviewerRole !== 'reviewer') {
      throw new Error(`Unauthorized. Only reviewers or admins can approve content.`);
    }

    // 2. Fetch content
    const content = await Content.findOne({ _id: contentId, organisationId: orgId });
    if (!content) {
      throw new Error('Content not found or access denied.');
    }

    // 3. Separation of duties: Creator cannot approve their own content (unless admin in small org)
    if (params.reviewerRole !== 'admin' && content.creatorId.equals(reviewerId)) {
      throw new Error('Separation of duties violation: Creators cannot approve their own submissions.');
    }

    // 4. Verify exact version exists
    const versionRecord = await ContentVersion.findOne({
      contentId,
      organisationId: orgId,
      versionNumber: params.versionNumber,
    });
    if (!versionRecord) {
      throw new Error(`Content version ${params.versionNumber} does not exist.`);
    }

    // 5. Update content status according to decision
    if (params.decision === 'approved') {
      content.status = 'APPROVED';
    } else if (params.decision === 'rejected') {
      content.status = 'REJECTED';
    } else if (params.decision === 'changes_requested') {
      content.status = 'NEEDS_REVISION';
    }
    await content.save();

    // 6. Record immutable ApprovalDecision bound to exact version
    const decisionRecord = await ApprovalDecision.create({
      contentId,
      contentVersionId: versionRecord._id,
      organisationId: orgId,
      reviewerId,
      versionNumber: params.versionNumber,
      decision: params.decision,
      reason: params.reason || '',
    });

    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.reviewerId,
      action: `APPROVAL_DECISION_${params.decision.toUpperCase()}`,
      resourceType: 'ApprovalDecision',
      resourceId: decisionRecord._id.toString(),
      details: {
        contentId: params.contentId,
        version: params.versionNumber,
        decision: params.decision,
        reason: params.reason,
      },
    });

    return decisionRecord;
  }

  static async getPendingApprovals(organisationId: string) {
    return Content.find({
      organisationId: new mongoose.Types.ObjectId(organisationId),
      status: { $in: ['PENDING_APPROVAL', 'SUBMITTED', 'IN_HUMAN_REVIEW'] },
    }).sort({ updatedAt: -1 });
  }
}
