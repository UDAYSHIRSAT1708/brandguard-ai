import { apiClient } from './client';
import { 
  ContentItem, 
  KnowledgeSource, 
  AuditEvent, 
  Finding, 
  DashboardMetrics, 
  ReviewResult 
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
          },
        };
      }
    }
    throw new Error('Failed to persist content draft to database.');
  },

  // 6. Trigger Authentic AI Governance Review
  async triggerReview(contentId: string, simulateFailover: boolean = false): Promise<ReviewResult> {
    const res = await apiClient.post(`/content/${contentId}/review`, { simulateFailover });
    if (res.data?.success && res.data.data?.reviewResult) {
      const rr = res.data.data.reviewResult;
      const mappedFindings: Finding[] = (rr.findings || []).map((f: any, idx: number) => ({
        id: f.id || `find_live_${idx}`,
        category: f.category,
        severity: f.severity,
        flaggedText: f.flagged_text || f.flaggedText,
        explanation: f.explanation,
        guideline: f.guideline,
        sourceIds: f.source_ids || f.sourceIds || [],
        sourceExcerpts: f.source_excerpts || f.sourceExcerpts || [],
        confidence: f.confidence ?? 1.0,
        suggestedCorrection: f.suggested_correction || f.suggestedCorrection,
        requiresHumanReview: Boolean(f.requires_human_review ?? f.requiresHumanReview),
      }));

      return {
        findings: mappedFindings,
        providerUsed: rr.provider || (simulateFailover ? 'OpenAI GPT-4o-mini (Failover)' : 'Google Gemini 2.0 Flash (Primary)'),
        isDemoFallback: false,
        latencyMs: rr.latency_ms,
      };
    }
    throw new Error(res.data?.error?.message || 'AI Review service invocation failed.');
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
};
