import { apiClient } from './client';
import { 
  ContentItem, 
  KnowledgeSource, 
  AuditEvent, 
  Finding, 
  Recommendation,
  ReviewJob,
  DashboardMetrics, 
  ReviewResult,
  OrgMember,
  OrgInvitation,
  UserRole
} from '../types';

export const BrandGuardApi = {
  // 1. Health Probe
  async probeHealth(activeProbe: boolean = false): Promise<{ live: boolean; details?: any }> {
    try {
      const endpoint = activeProbe ? '/health?probe=true' : '/health';
      const res = await apiClient.get(endpoint, { timeout: 5000 });
      return { live: true, details: res.data };
    } catch {
      return { live: false };
    }
  },

  // 1b. Deep Production Diagnostic Suite (Authenticated 5-Tier Verification)
  async runDeepDiagnostics(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await apiClient.post('/health/diagnostics', {}, { timeout: 20000 });
      if (res.data?.success && res.data?.data) {
        return { success: true, data: res.data.data };
      }
      return { success: false, error: res.data?.error?.message || 'Deep diagnostics failed.' };
    } catch (err: any) {
      return { 
        success: false, 
        error: err.response?.data?.error?.message || err.message || 'Diagnostic request failed.' 
      };
    }
  },

  // 2. Real Dashboard Metrics from MongoDB
  async getDashboardMetrics(): Promise<{ metrics: DashboardMetrics }> {
    const res = await apiClient.get('/analytics/dashboard');
    if (res.data?.success && res.data?.data) {
      return { metrics: res.data.data };
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve dashboard governance metrics.');
  },

  // 3. Content Drafts List
  async getContents(): Promise<{ contents: ContentItem[] }> {
    const res = await apiClient.get('/content');
    if (res.data?.success && Array.isArray(res.data.data?.contents)) {
      return {
        contents: res.data.data.contents.map((item: any) => ({
          id: item._id || item.id,
          title: item.title,
          contentType: item.contentType,
          status: item.status,
          currentVersion: item.currentVersion,
          body: item.body,
          organisationId: item.organisationId,
          creatorId: item.creatorId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          findings: (item.findings || []).map((f: any, idx: number) => ({
            id: f.id || f._id || `find_${idx}`,
            category: f.category,
            severity: f.severity,
            flaggedText: f.flaggedText,
            explanation: f.explanation,
            guideline: f.guideline,
            sourceIds: f.sourceIds || [],
            sourceExcerpts: f.sourceExcerpts || [],
            confidence: f.confidence ?? 1.0,
            suggestedCorrection: f.suggestedCorrection,
            requiresHumanReview: Boolean(f.requiresHumanReview),
            resolution: f.resolution,
            resolutionReason: f.resolutionReason,
          })),
          recommendations: (item.recommendations || []).map((r: any, idx: number) => ({
            id: r.id || `rec_${idx}`,
            issue: r.issue || '',
            rationale: r.rationale || '',
            impact: r.impact || 'MEDIUM',
            evidenceSources: r.evidenceSources || [],
            evidenceExcerpts: r.evidenceExcerpts || [],
            suggestedCorrection: r.suggestedCorrection || '',
            isEvidenceBacked: Boolean(r.isEvidenceBacked),
            confidence: r.confidence ?? 1.0,
          })),
        })),
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve content list from server.');
  },

  // 4. Get Content by ID
  async getContentById(contentId: string): Promise<ContentItem> {
    const res = await apiClient.get(`/content/${contentId}`);
    if (res.data?.success && res.data.data?.content) {
      const item = res.data.data.content;
      return {
        id: item._id || item.id,
        title: item.title,
        contentType: item.contentType,
        status: item.status,
        currentVersion: item.currentVersion,
        body: item.body,
        organisationId: item.organisationId,
        creatorId: item.creatorId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        findings: item.findings || [],
        recommendations: item.recommendations || [],
        versions: res.data.data.versions || [],
      };
    }
    throw new Error(res.data?.error?.message || 'Content draft not found.');
  },

  // 5. Save or Revise Content Draft (POST if new, PUT if existing)
  async saveContent(item: Partial<ContentItem>): Promise<{ content: ContentItem }> {
    if (item.id) {
      const res = await apiClient.put(`/content/${item.id}`, {
        title: item.title,
        contentType: item.contentType,
        body: item.body,
      });
      if (res.data?.success && res.data.data?.content) {
        const c = res.data.data.content;
        return {
          content: {
            id: c._id || c.id,
            title: c.title,
            contentType: c.contentType,
            status: c.status,
            currentVersion: c.currentVersion,
            body: c.body,
            organisationId: c.organisationId,
            creatorId: c.creatorId,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            findings: c.findings || [],
            recommendations: c.recommendations || [],
          },
        };
      }
    } else {
      const res = await apiClient.post('/content', {
        title: item.title || 'Untitled Draft',
        contentType: item.contentType || 'website',
        body: item.body || '',
      });
      if (res.data?.success && res.data.data?.content) {
        const c = res.data.data.content;
        return {
          content: {
            id: c._id || c.id,
            title: c.title,
            contentType: c.contentType,
            status: c.status,
            currentVersion: c.currentVersion,
            body: c.body,
            organisationId: c.organisationId,
            creatorId: c.creatorId,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            findings: [],
            recommendations: [],
          },
        };
      }
    }
    throw new Error('Failed to persist content draft to database.');
  },

  // 6. Trigger Authentic AI Governance Review (Hybrid sync or async with durable job tracking)
  async triggerReview(
    contentId: string,
    simulateFailover: boolean = false,
    preferAsync: boolean = false,
    idempotencyKey?: string
  ): Promise<{
    mode: 'sync' | 'async';
    jobId: string;
    status: string;
    reviewResult?: ReviewResult;
    content?: ContentItem;
  }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await apiClient.post(
      `/content/${contentId}/review`,
      { simulateFailover, preferAsync, idempotencyKey },
      { timeout: 45000, headers }
    );

    if (res.data?.success && res.data?.data) {
      const d = res.data.data;
      if (d.mode === 'sync' && (d.reviewResult || d.content)) {
        const rr = d.reviewResult || {};
        const mappedFindings: Finding[] = (d.content?.findings || rr.findings || []).map((f: any, idx: number) => ({
          id: f.id || f._id || `find_live_${idx}`,
          category: f.category || 'tone',
          severity: f.severity || 'medium',
          flaggedText: f.flaggedText || f.flagged_text || '',
          explanation: f.explanation || '',
          guideline: f.guideline || '',
          sourceIds: f.sourceIds || f.source_ids || [],
          sourceExcerpts: f.sourceExcerpts || f.source_excerpts || [],
          confidence: typeof f.confidence === 'number' ? f.confidence : 1.0,
          suggestedCorrection: f.suggestedCorrection || f.suggested_correction,
          requiresHumanReview: Boolean(f.requiresHumanReview ?? f.requires_human_review ?? false),
        }));

        const mappedRecommendations: Recommendation[] = (d.content?.recommendations || rr.recommendations || []).map((r: any, idx: number) => ({
          id: r.id || `rec_live_${idx}`,
          issue: r.issue || '',
          rationale: r.rationale || '',
          impact: (['HIGH', 'MEDIUM', 'LOW'].includes(r.impact?.toUpperCase()) ? r.impact.toUpperCase() : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
          evidenceSources: r.evidenceSources || r.evidence_sources || [],
          evidenceExcerpts: r.evidenceExcerpts || r.evidence_excerpts || [],
          suggestedCorrection: r.suggestedCorrection || r.suggested_correction || '',
          isEvidenceBacked: Boolean(r.isEvidenceBacked ?? r.is_evidence_backed ?? false),
          confidence: typeof r.confidence === 'number' ? r.confidence : 1.0,
        }));

        return {
          mode: 'sync',
          jobId: d.jobId,
          status: d.status || 'SUCCEEDED',
          content: d.content,
          reviewResult: {
            findings: mappedFindings,
            recommendations: mappedRecommendations,
            providerUsed: rr.provider || (simulateFailover ? 'Groq Llama 3.3 (Failover)' : 'Google Gemini 2.0 Flash (Primary)'),
            isDemoFallback: false,
            latencyMs: rr.latencyMs || rr.latency_ms,
          },
        };
      }

      // Async job initiated
      return {
        mode: 'async',
        jobId: d.jobId,
        status: d.status || 'QUEUED',
      };
    }
    throw new Error(res.data?.error?.message || 'AI Review submission failed.');
  },

  // 6a. Get Active Review Job (for reconnection after browser refresh)
  async getActiveReviewJob(contentId: string): Promise<ReviewJob | null> {
    try {
      const res = await apiClient.get(`/content/${contentId}/review/jobs/active`);
      if (res.data?.success && res.data.data?.activeJob) {
        const j = res.data.data.activeJob;
        return {
          id: j._id || j.id,
          contentId: j.contentId,
          versionNumber: j.versionNumber,
          status: j.status,
          mode: j.mode,
          attemptCount: j.attemptCount,
          maxAttempts: j.maxAttempts,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          error: j.error,
          result: j.result,
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  // 6b. Get Review Job Status and Result
  async getReviewJobStatus(contentId: string, jobId: string): Promise<{ job: ReviewJob; content?: ContentItem }> {
    const res = await apiClient.get(`/content/${contentId}/review/jobs/${jobId}`);
    if (res.data?.success && res.data.data?.job) {
      const j = res.data.data.job;
      return {
        job: {
          id: j._id || j.id,
          contentId: j.contentId,
          versionNumber: j.versionNumber,
          status: j.status,
          mode: j.mode,
          attemptCount: j.attemptCount,
          maxAttempts: j.maxAttempts,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          error: j.error,
          result: j.result,
        },
        content: res.data.data.content,
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve review job status.');
  },

  // 6c. Retry Failed Review Job
  async retryReviewJob(contentId: string, jobId: string): Promise<{ job: ReviewJob }> {
    const res = await apiClient.post(`/content/${contentId}/review/jobs/${jobId}/retry`);
    if (res.data?.success && res.data.data?.job) {
      const j = res.data.data.job;
      return {
        job: {
          id: j._id || j.id,
          contentId: j.contentId,
          versionNumber: j.versionNumber,
          status: j.status,
          mode: j.mode,
          attemptCount: j.attemptCount,
          maxAttempts: j.maxAttempts,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          error: j.error,
          result: j.result,
        },
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to retry review job.');
  },

  // 7. Submit Content for Human Approval
  async submitForApproval(contentId: string): Promise<void> {
    const res = await apiClient.post(`/content/${contentId}/submit`);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to submit content draft for sign-off.');
    }
  },

  // 8. Pending Approval Queue
  async getPendingApprovals(): Promise<{ items: ContentItem[] }> {
    const res = await apiClient.get('/approvals/queue');
    if (res.data?.success && Array.isArray(res.data.data?.items)) {
      return {
        items: res.data.data.items.map((item: any) => ({
          id: item._id || item.id,
          title: item.title,
          contentType: item.contentType,
          status: item.status,
          currentVersion: item.currentVersion,
          body: item.body,
          organisationId: item.organisationId,
          creatorId: item.creatorId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          findings: item.findings || [],
        })),
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to fetch approval queue from server.');
  },

  // 9. Record Approval Decision
  async recordApprovalDecision(
    contentId: string,
    versionNumber: number,
    decision: 'approve' | 'reject' | 'changes',
    reason?: string
  ): Promise<void> {
    const endpoint =
      decision === 'approve'
        ? `/approvals/${contentId}/approve`
        : decision === 'reject'
        ? `/approvals/${contentId}/reject`
        : `/approvals/${contentId}/request-changes`;

    const res = await apiClient.post(endpoint, { versionNumber, reason });
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || `Failed to record approval decision (${decision}).`);
    }
  },

  // 10. Knowledge Sources (Authoritative Brand Guidelines & Benchmark Facts)
  async getKnowledgeSources(params?: { status?: string; sourceType?: string; search?: string }): Promise<{ sources: KnowledgeSource[] }> {
    const res = await apiClient.get('/knowledge', { params });
    if (res.data?.success && Array.isArray(res.data.data?.sources)) {
      return {
        sources: res.data.data.sources.map((s: any) => ({
          id: s._id || s.id,
          title: s.title,
          sourceType: s.sourceType,
          status: s.status,
          content: s.content,
          productScope: s.productScope,
          campaignScope: s.campaignScope,
          version: s.version || 1,
          effectiveDate: s.effectiveDate,
          expiryDate: s.expiryDate,
          approvedBy: s.approvedBy,
          approvedAt: s.approvedAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve knowledge sources.');
  },

  // 11. Add Authoritative Knowledge Source
  async addKnowledgeSource(sourceData: Partial<KnowledgeSource>): Promise<void> {
    const res = await apiClient.post('/knowledge', sourceData);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to save knowledge source to server.');
    }
  },

  // 12. Approve Knowledge Source (Admin only)
  async approveKnowledgeSource(sourceId: string): Promise<void> {
    const res = await apiClient.post(`/knowledge/${sourceId}/approve`);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to approve knowledge source.');
    }
  },

  // 13. Archive Knowledge Source (Admin only)
  async archiveKnowledgeSource(sourceId: string): Promise<void> {
    const res = await apiClient.post(`/knowledge/${sourceId}/archive`);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to archive knowledge source.');
    }
  },

  // 14. Append-Only Cryptographic Audit Log
  async getAuditLog(limit: number = 50): Promise<{ events: AuditEvent[] }> {
    const res = await apiClient.get('/audit-log', { params: { limit } });
    if (res.data?.success && Array.isArray(res.data.data?.events)) {
      return {
        events: res.data.data.events.map((e: any) => ({
          id: e._id || e.id,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          userName: e.userId?.name || e.userName || 'System Actor',
          details: e.details || {},
          createdAt: e.createdAt,
        })),
      };
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve audit trail.');
  },

  // 15. Organization Members Directory
  async getUsers(): Promise<{ users: any[] }> {
    const res = await apiClient.get('/auth/users');
    if (res.data?.success && Array.isArray(res.data.data?.users)) {
      return { users: res.data.data.users };
    }
    return { users: [] };
  },

  async createUser(data: { name: string; email: string; password: string; role: 'admin' | 'creator' | 'reviewer' }): Promise<{ user: any }> {
    const res = await apiClient.post('/auth/users', data);
    if (res.data?.success && res.data.data?.user) {
      return { user: res.data.data.user };
    }
    throw new Error(res.data?.error?.message || 'Failed to create user member.');
  },

  // 16. Persist Finding Resolution with Audit Justification
  async resolveFinding(
    contentId: string, 
    findingId: string, 
    resolution: 'resolved' | 'accepted', 
    reason: string
  ): Promise<void> {
    const res = await apiClient.patch(`/content/${contentId}/findings/${findingId}`, {
      resolution,
      resolutionReason: reason,
    });
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to persist finding resolution.');
    }
  },

  // 17. Organisation Details & Settings
  async getOrganisationDetails(): Promise<any> {
    const res = await apiClient.get('/organisations/current');
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to retrieve organisation details.');
  },

  async updateOrganisationSettings(updates: { name?: string; settings?: Record<string, any> }): Promise<any> {
    const res = await apiClient.patch('/organisations/current', updates);
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to update organisation settings.');
  },

  // 18. Members Management
  async getMembers(): Promise<OrgMember[]> {
    const res = await apiClient.get('/organisations/members');
    if (res.data?.success && Array.isArray(res.data.data?.members)) {
      return res.data.data.members;
    }
    return [];
  },

  async updateMemberRole(userId: string, role: UserRole, permissions?: string[]): Promise<any> {
    const res = await apiClient.patch(`/organisations/members/${userId}`, { role, permissions });
    if (res.data?.success && res.data.data) {
      return res.data.data.member;
    }
    throw new Error(res.data?.error?.message || 'Failed to update member role.');
  },

  async removeMember(userId: string): Promise<void> {
    const res = await apiClient.delete(`/organisations/members/${userId}`);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to remove member.');
    }
  },

  async transferOwnership(newOwnerId: string): Promise<any> {
    const res = await apiClient.post('/organisations/transfer-ownership', {
      newOwnerId,
      confirmation: 'CONFIRM_TRANSFER',
    });
    if (res.data?.success) {
      return res.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to transfer ownership.');
  },

  // 19. Invitations
  async getInvitations(): Promise<OrgInvitation[]> {
    const res = await apiClient.get('/organisations/invitations');
    if (res.data?.success && Array.isArray(res.data.data?.invitations)) {
      return res.data.data.invitations;
    }
    return [];
  },

  async createInvitation(email: string, role: UserRole, permissions?: string[]): Promise<any> {
    const res = await apiClient.post('/organisations/invitations', { email, role, permissions });
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to create invitation.');
  },

  async revokeInvitation(invitationId: string): Promise<void> {
    const res = await apiClient.delete(`/organisations/invitations/${invitationId}`);
    if (!res.data?.success) {
      throw new Error(res.data?.error?.message || 'Failed to revoke invitation.');
    }
  },

  async resendInvitation(invitationId: string): Promise<any> {
    const res = await apiClient.post(`/organisations/invitations/${invitationId}/resend`);
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to resend invitation.');
  },

  async verifyInvitation(token: string): Promise<any> {
    const res = await apiClient.get('/organisations/invitations/verify', { params: { token } });
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Invalid or expired invitation token.');
  },

  async acceptInvitation(payload: { token: string; name?: string; password?: string }): Promise<any> {
    const res = await apiClient.post('/organisations/invitations/accept', payload);
    if (res.data?.success && res.data.data) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Failed to accept invitation.');
  },
};
