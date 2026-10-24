import axios from 'axios';
import mongoose from 'mongoose';
import { Content, IContent } from '../models/Content';
import { KnowledgeService } from './knowledge.service';
import { env } from '../config/env';
import { logAuditEvent } from './audit.service';

export class ReviewOrchestratorService {
  static async triggerReview(params: {
    contentId: string;
    organisationId: string;
    userId: string;
    simulateFailover?: boolean;
  }): Promise<{ content: IContent; reviewResult: any }> {
    const orgId = new mongoose.Types.ObjectId(params.organisationId);
    const contentId = new mongoose.Types.ObjectId(params.contentId);

    // 1. Fetch content
    const content = await Content.findOne({ _id: contentId, organisationId: orgId });
    if (!content) {
      throw new Error('Content item not found or access denied.');
    }

    // 2. Fetch approved brand knowledge sources for this tenant
    const approvedSources = await KnowledgeService.getApprovedSourcesForTenant(params.organisationId);

    const evidencePayload = approvedSources.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      sourceType: s.sourceType,
      content: s.content,
      productScope: s.productScope,
    }));

    // 3. Update status to REVIEWING
    content.status = 'REVIEWING';
    await content.save();

    // 4. Call Python AI Service
    let reviewResult: any;
    try {
      const response = await axios.post(
        `${env.AI_SERVICE_URL}/api/review`,
        {
          content_id: params.contentId,
          organisation_id: params.organisationId,
          body: content.body,
          evidence: evidencePayload,
          force_failover: Boolean(params.simulateFailover),
        },
        {
          headers: {
            'X-Internal-API-Key': env.AI_SERVICE_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: (env.NODE_ENV === 'test' ? 5000 : 35000),
        }
      );
      reviewResult = response.data;
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || err.message;
      console.error('AI Service invocation failed:', errorDetail);
      content.status = 'DRAFT';
      await content.save();

      await logAuditEvent({
        organisationId: params.organisationId,
        userId: params.userId,
        action: 'AI_REVIEW_FAILED',
        resourceType: 'Content',
        resourceId: content._id.toString(),
        details: {
          error: errorDetail,
          statusCode: err.response?.status || 500,
        },
      });

      throw new Error(`AI Governance Review failed: ${errorDetail}`);
    }

    // 5. Store findings into Content document
    const findingsToStore = (reviewResult.findings || []).map((f: any) => ({
      category: f.category,
      severity: f.severity,
      flaggedText: f.flagged_text || f.flaggedText,
      explanation: f.explanation,
      guideline: f.guideline,
      sourceIds: f.source_ids || f.sourceIds || [],
      sourceExcerpts: f.source_excerpts || f.sourceExcerpts || [],
      confidence: f.confidence,
      suggestedCorrection: f.suggested_correction || f.suggestedCorrection,
      requiresHumanReview: f.requires_human_review ?? f.requiresHumanReview ?? false,
    }));

    content.findings = findingsToStore;
    content.status = findingsToStore.length > 0 ? 'NEEDS_REVISION' : 'DRAFT';
    await content.save();

    // 6. Record audit event
    await logAuditEvent({
      organisationId: params.organisationId,
      userId: params.userId,
      action: 'AI_REVIEW_COMPLETED',
      resourceType: 'Review',
      resourceId: reviewResult.review_id || content._id.toString(),
      details: {
        provider: reviewResult.provider,
        findingsCount: findingsToStore.length,
        isDemoMode: reviewResult.is_demo_mode,
        simulateFailover: params.simulateFailover,
      },
    });

    return { content, reviewResult };
  }
}
