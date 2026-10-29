export type UserRole = 'admin' | 'creator' | 'reviewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  authProvider?: 'local' | 'google';
  isGoogleLinked?: boolean;
  avatarUrl?: string;
  organisationId: string;
  organisationName?: string;
  organisationSlug?: string;
}

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

export type FindingCategory = 
  | 'prohibited_phrase'
  | 'unsupported_claim'
  | 'tone'
  | 'terminology'
  | 'guarantee'
  | 'accessibility'
  | 'disclaimer'
  | 'factual_error';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  flaggedText: string;
  explanation: string;
  guideline: string;
  sourceIds: string[];
  sourceExcerpts: string[];
  confidence: number;
  suggestedCorrection?: string;
  requiresHumanReview: boolean;
  resolution?: 'open' | 'accepted' | 'rejected' | 'resolved';
  resolutionReason?: string;
}

export interface Recommendation {
  id: string;
  issue: string;
  rationale: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceSources: string[];
  evidenceExcerpts: string[];
  suggestedCorrection: string;
  isEvidenceBacked: boolean;
  confidence: number;
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface ReviewJob {
  id: string;
  contentId: string;
  versionNumber: number;
  status: JobStatus;
  mode: 'sync' | 'async';
  attemptCount: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
    statusCode?: number;
  } | null;
  result?: {
    reviewId: string;
    provider: string;
    model: string;
    latencyMs: number;
    findingsCount: number;
    recommendationsCount: number;
  } | null;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  versionNumber: number;
  body: string;
  createdAt: string;
  submittedBy?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  contentType: ContentType;
  status: ContentStatus;
  currentVersion: number;
  body: string;
  organisationId: string;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
  findings?: Finding[];
  recommendations?: Recommendation[];
  versions?: ContentVersion[];
}

export type SourceType = 'guideline' | 'fact' | 'claim' | 'terminology' | 'disclaimer' | 'prohibited_phrase' | 'campaign';
export type SourceStatus = 'draft' | 'pending_review' | 'approved' | 'superseded' | 'archived';

export interface KnowledgeSource {
  id: string;
  title: string;
  sourceType: SourceType;
  status: SourceStatus;
  content: string;
  productScope?: string;
  campaignScope?: string;
  version: number;
  effectiveDate?: string;
  expiryDate?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  id: string;
  contentId: string;
  contentTitle: string;
  versionNumber: number;
  reviewerName: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  reason?: string;
  decidedAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userName: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface DashboardMetrics {
  totalReviews: number;
  pendingApprovals: number;
  revisionRate: number;
  criticalIssues: number;
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  mostFrequentCategories: Array<{ category: string; count: number }>;
}

export interface ReviewResult {
  findings: Finding[];
  recommendations?: Recommendation[];
  providerUsed: string;
  isDemoFallback: boolean;
  latencyMs?: number;
}
