import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewWorkspacePage } from './pages/ReviewWorkspacePage';
import { KnowledgeCentrePage } from './pages/KnowledgeCentrePage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { ReviewHistoryPage } from './pages/ReviewHistoryPage';
import { SettingsHealthPage } from './pages/SettingsHealthPage';
import { LoginPage } from './pages/LoginPage';
import { LoadingState, ErrorBanner } from './components/common/LoadingState';
import { BrandGuardApi } from './api/services';
import { 
  ContentItem, 
  KnowledgeSource, 
  AuditEvent, 
  DashboardMetrics, 
  ReviewResult 
} from './types';

function BrandGuardApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | undefined>(undefined);
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [isDemoFallback, setIsDemoFallback] = useState<boolean>(false);
  const [healthDetails, setHealthDetails] = useState<any>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const { isAuthenticated, isLoading } = useAuth();

  // Load live data from real backend APIs
  const refreshData = useCallback(async () => {
    setNetworkError(null);
    try {
      const probe = await BrandGuardApi.probeHealth();
      setIsDemoFallback(!probe.live);
      if (probe.details) {
        setHealthDetails(probe.details);
      }

      const [contentsRes, sourcesRes, auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getContents(),
        BrandGuardApi.getKnowledgeSources(),
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);

      setContents(contentsRes.contents);
      setSources(sourcesRes.sources);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);

      // Select first draft if none selected
      if (contentsRes.contents.length > 0) {
        setCurrentContent((prev) => 
          prev ? (contentsRes.contents.find((c) => c.id === prev.id) || contentsRes.contents[0]) : contentsRes.contents[0]
        );
      }
    } catch (err: any) {
      console.error('Failed to load application data from backend:', err);
      setNetworkError(err.message || 'Unable to connect to BrandGuard application backend. Please verify your connection and retry.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    }
  }, [isAuthenticated, refreshData]);

  // Save content revision
  const handleSaveContent = async (item: Partial<ContentItem>): Promise<ContentItem> => {
    const res = await BrandGuardApi.saveContent(item);
    const updated = res.content;
    setContents((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
    setCurrentContent(updated);
    
    // Refresh audit log & metrics
    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Ignored non-critical background refresh failure
    }

    return updated;
  };

  // Trigger Governance Review with Dual AI Provider & Failover Simulation
  const handleTriggerReview = async (
    contentId: string,
    simulateFailover: boolean = false
  ): Promise<ReviewResult> => {
    const result = await BrandGuardApi.triggerReview(contentId, simulateFailover);
    
    // Refresh contents and current content
    const contentsRes = await BrandGuardApi.getContents();
    setContents(contentsRes.contents);
    const updatedCurrent = contentsRes.contents.find((c) => c.id === contentId);
    if (updatedCurrent) {
      setCurrentContent(updatedCurrent);
    }

    // Refresh audit log & metrics
    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Non-critical background refresh
    }

    return result;
  };

  // Submit for Approval
  const handleSubmitForApproval = async (contentId: string) => {
    await BrandGuardApi.submitForApproval(contentId);
    const contentsRes = await BrandGuardApi.getContents();
    setContents(contentsRes.contents);
    const updated = contentsRes.contents.find((c) => c.id === contentId);
    if (updated) setCurrentContent(updated);

    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Non-critical background refresh
    }
  };

  // Human Reviewer Approval
  const handleApproveContent = async (contentId: string, versionNumber: number, comment?: string) => {
    await BrandGuardApi.recordApprovalDecision(contentId, versionNumber, 'approve', comment);
    const contentsRes = await BrandGuardApi.getContents();
    setContents(contentsRes.contents);
    const updated = contentsRes.contents.find((c) => c.id === contentId);
    if (updated) setCurrentContent(updated);

    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Non-critical background refresh
    }
  };

  // Human Reviewer Rejection
  const handleRejectContent = async (contentId: string, versionNumber: number, reason: string) => {
    await BrandGuardApi.recordApprovalDecision(contentId, versionNumber, 'reject', reason);
    const contentsRes = await BrandGuardApi.getContents();
    setContents(contentsRes.contents);
    const updated = contentsRes.contents.find((c) => c.id === contentId);
    if (updated) setCurrentContent(updated);

    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Non-critical background refresh
    }
  };

  // Human Reviewer Request Changes
  const handleRequestChanges = async (contentId: string, versionNumber: number, feedback: string) => {
    await BrandGuardApi.recordApprovalDecision(contentId, versionNumber, 'changes', feedback);
    const contentsRes = await BrandGuardApi.getContents();
    setContents(contentsRes.contents);
    const updated = contentsRes.contents.find((c) => c.id === contentId);
    if (updated) setCurrentContent(updated);

    try {
      const [auditRes, metricsRes] = await Promise.all([
        BrandGuardApi.getAuditLog(),
        BrandGuardApi.getDashboardMetrics(),
      ]);
      setAuditLog(auditRes.events);
      setMetrics(metricsRes.metrics);
    } catch {
      // Non-critical background refresh
    }
  };

  // Knowledge Source actions
  const handleAddSource = async (sourceData: Partial<KnowledgeSource>) => {
    await BrandGuardApi.addKnowledgeSource(sourceData);
    const sourcesRes = await BrandGuardApi.getKnowledgeSources();
    setSources(sourcesRes.sources);

    try {
      const auditRes = await BrandGuardApi.getAuditLog();
      setAuditLog(auditRes.events);
    } catch {
      // Non-critical
    }
  };

  const handleApproveSource = async (sourceId: string) => {
    await BrandGuardApi.approveKnowledgeSource(sourceId);
    const sourcesRes = await BrandGuardApi.getKnowledgeSources();
    setSources(sourcesRes.sources);
  };

  const handleArchiveSource = async (sourceId: string) => {
    await BrandGuardApi.archiveKnowledgeSource(sourceId);
    const sourcesRes = await BrandGuardApi.getKnowledgeSources();
    setSources(sourcesRes.sources);
  };

  const pendingApprovals = contents.filter(
    (c) => c.status === 'PENDING_APPROVAL' || c.status === 'SUBMITTED'
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <LoadingState message="Validating governance credentials..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex bg-canvas text-ink-900 font-sans antialiased selection:bg-forest/20 selection:text-forest">
      {/* Editorial Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingApprovals.length}
      />

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={
            activeTab === 'dashboard'
              ? 'Governance Overview'
              : activeTab === 'review'
              ? 'Content Review Workspace'
              : activeTab === 'knowledge'
              ? 'Brand Knowledge Centre'
              : activeTab === 'approvals'
              ? 'Human Approval Queue'
              : activeTab === 'history'
              ? 'Review History & Audit Trail'
              : 'AI Provider Mesh & System Health'
          }
          subtitle="Pre-publication editorial governance, claim verification & compliance sign-offs"
          isDemoFallback={isDemoFallback}
          providers={healthDetails?.checks?.aiService?.details?.providers}
          aiServiceStatus={healthDetails?.checks?.aiService?.status}
        />

        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          {networkError && (
            <div className="mb-6">
              <ErrorBanner
                title="Backend Connection Error"
                message={networkError}
                onRetry={refreshData}
              />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardPage
              contents={contents}
              metrics={metrics}
              isDemoFallback={isDemoFallback}
              onNewReview={() => {
                setCurrentContent(null);
                setActiveTab('review');
              }}
              onOpenContent={(c) => {
                setCurrentContent(c);
                setActiveTab('review');
              }}
            />
          )}

          {activeTab === 'review' && (
            <ReviewWorkspacePage
              currentContent={currentContent}
              onSaveContent={handleSaveContent}
              onSubmitForApproval={handleSubmitForApproval}
              onTriggerReview={handleTriggerReview}
            />
          )}

          {activeTab === 'knowledge' && (
            <KnowledgeCentrePage
              sources={sources}
              isDemoFallback={isDemoFallback}
              onAddSource={handleAddSource}
              onApproveSource={handleApproveSource}
              onArchiveSource={handleArchiveSource}
            />
          )}

          {activeTab === 'approvals' && (
            <ApprovalQueuePage
              pendingItems={pendingApprovals}
              isDemoFallback={isDemoFallback}
              onApprove={handleApproveContent}
              onReject={handleRejectContent}
              onRequestChanges={handleRequestChanges}
            />
          )}

          {activeTab === 'history' && (
            <ReviewHistoryPage 
              auditEvents={auditLog} 
              isDemoFallback={isDemoFallback}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsHealthPage />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrandGuardApp />
    </AuthProvider>
  );
}
