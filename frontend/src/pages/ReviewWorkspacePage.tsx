import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle, 
  Zap, 
  ShieldCheck,
  Save,
  AlertCircle,
  Sparkles,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { ContentItem, ContentType, Finding, Recommendation, ReviewJob, JobStatus } from '../types';
import { Button } from '../components/common/Button';
import { FindingCard } from '../components/findings/FindingCard';
import { RecommendationCard } from '../components/findings/RecommendationCard';
import { StatusBadge } from '../components/common/Badge';
import { BrandGuardApi } from '../api/services';

interface ReviewWorkspaceProps {
  currentContent: ContentItem | null;
  onSaveContent: (content: Partial<ContentItem>) => Promise<ContentItem>;
  onSubmitForApproval: (contentId: string) => Promise<void>;
  onTriggerReview?: (contentId: string, simulateFailover?: boolean) => Promise<any>;
}

export const ReviewWorkspacePage: React.FC<ReviewWorkspaceProps> = ({
  currentContent,
  onSaveContent,
  onSubmitForApproval,
}) => {
  const [title, setTitle] = useState(currentContent?.title || '');
  const [contentType, setContentType] = useState<ContentType>(currentContent?.contentType || 'website');
  const [body, setBody] = useState(currentContent?.body || '');
  const [version, setVersion] = useState(currentContent?.currentVersion || 1);
  const [findings, setFindings] = useState<Finding[]>(currentContent?.findings || []);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(currentContent?.recommendations || []);
  const [activeJob, setActiveJob] = useState<ReviewJob | null>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'recommendations'>('findings');
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewStep, setReviewStep] = useState<string>('');
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  const [simulateFailover, setSimulateFailover] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state if currentContent changes externally (e.g. opened from dashboard or new review)
  useEffect(() => {
    if (currentContent) {
      setTitle(currentContent.title || '');
      setContentType(currentContent.contentType || 'website');
      setBody(currentContent.body || '');
      setVersion(currentContent.currentVersion || 1);
      setFindings(currentContent.findings || []);
      setRecommendations(currentContent.recommendations || []);
    } else {
      setTitle('');
      setContentType('website');
      setBody('');
      setVersion(1);
      setFindings([]);
      setRecommendations([]);
      setActiveJob(null);
    }
    setErrorMessage(null);
  }, [currentContent]);

  // Page-refresh and draft selection reconnection: checks for active in-flight review jobs
  useEffect(() => {
    let isMounted = true;
    if (currentContent?.id) {
      BrandGuardApi.getActiveReviewJob(currentContent.id).then((job) => {
        if (isMounted && job && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
          setActiveJob(job);
          setIsReviewing(true);
          setReviewStep(
            `Reconnected to review job #${job.id.slice(-6)} (${job.status}, attempt ${job.attemptCount}/${job.maxAttempts})...`
          );
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [currentContent?.id]);

  // Durable polling loop: bounded exponential backoff with ceiling and clean terminal state exits
  useEffect(() => {
    if (!activeJob || !currentContent?.id || (activeJob.status !== 'QUEUED' && activeJob.status !== 'RUNNING')) {
      return;
    }

    let isSubscribed = true;
    let delay = 1500;
    let timeoutHandle: any = null;
    let attempts = 0;
    const maxPollAttempts = 40; // ~60 seconds max

    const poll = async () => {
      attempts++;
      try {
        const { job, content } = await BrandGuardApi.getReviewJobStatus(currentContent.id, activeJob.id);
        if (!isSubscribed) return;

        setActiveJob(job);

        if (job.status === 'SUCCEEDED') {
          setIsReviewing(false);
          setReviewStep('');
          if (content) {
            setFindings(content.findings || []);
            setRecommendations(content.recommendations || []);
          }
          if (job.result?.provider) {
            setProviderUsed(job.result.provider);
          }
          setSuccessMessage(
            `Review completed via ${job.result?.provider || 'AI Governance'}. ${job.result?.findingsCount || 0} violation(s) and ${job.result?.recommendationsCount || 0} recommendation(s) identified.`
          );
          return;
        }

        if (job.status === 'FAILED') {
          setIsReviewing(false);
          setReviewStep('');
          setErrorMessage(job.error?.message || 'Review failed.');
          return;
        }

        if (job.status === 'CANCELLED') {
          setIsReviewing(false);
          setReviewStep('');
          setErrorMessage('Review job was cancelled.');
          return;
        }

        if (attempts >= maxPollAttempts) {
          setIsReviewing(false);
          setReviewStep('');
          setErrorMessage('Review processing is taking longer than expected. Refresh the page to reconnect.');
          return;
        }

        setReviewStep(
          `Review job #${job.id.slice(-6)} in progress (${job.status}, attempt ${job.attemptCount}/${job.maxAttempts})...`
        );

        // Exponential backoff with ceiling
        delay = Math.min(delay * 1.3 + Math.random() * 200, 5000);
        timeoutHandle = setTimeout(poll, delay);
      } catch {
        if (!isSubscribed) return;
        // Network blip: keep polling with retry delay
        timeoutHandle = setTimeout(poll, Math.min(delay * 1.5, 5000));
      }
    };

    timeoutHandle = setTimeout(poll, delay);

    return () => {
      isSubscribed = false;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [activeJob?.id, activeJob?.status, currentContent?.id]);

  // Save draft without triggering review
  const handleManualSave = async () => {
    if (!title.trim()) {
      setErrorMessage('Please provide a title for the content draft.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSaveContent({
        id: currentContent?.id,
        title: title.trim(),
        contentType,
        body: body.trim(),
        currentVersion: version,
      });
      setSuccessMessage('Draft saved to database successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save draft to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Run AI Governance Review through durable hybrid workflow
  const handleRunReview = async () => {
    if (!title.trim() || !body.trim()) {
      setErrorMessage('Please provide both a title and draft publication copy before running governance review.');
      return;
    }

    setIsReviewing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Establish persistent version checkpoint in MongoDB
      setReviewStep('1/2: Saving content draft & checkpointing in database...');
      const saved = await onSaveContent({
        id: currentContent?.id,
        title: title.trim(),
        contentType,
        body: body.trim(),
        currentVersion: version,
      });

      // 2. Invoke real backend review pipeline with client idempotency key
      setReviewStep(
        simulateFailover 
          ? '2/2: Submitting review -> simulating primary timeout with OpenAI failover...' 
          : '2/2: Grounding claims with RAG against approved guidelines & benchmark facts...'
      );

      const idempotencyKey = `review_${saved.id}_v${version}_${Date.now()}`;
      const res = await BrandGuardApi.triggerReview(saved.id, simulateFailover, false, idempotencyKey);

      if (res.mode === 'sync' && res.reviewResult) {
        setFindings(res.reviewResult.findings);
        setRecommendations(res.reviewResult.recommendations || []);
        setProviderUsed(res.reviewResult.providerUsed);

        if (res.reviewResult.findings.length === 0 && (res.reviewResult.recommendations?.length || 0) > 0) {
          setActiveTab('recommendations');
        } else {
          setActiveTab('findings');
        }

        setSuccessMessage(
          `Review completed via ${res.reviewResult.providerUsed}. ${res.reviewResult.findings.length} governance finding${
            res.reviewResult.findings.length === 1 ? '' : 's'
          } and ${res.reviewResult.recommendations?.length || 0} recommendation${
            (res.reviewResult.recommendations?.length || 0) === 1 ? '' : 's'
          } identified.`
        );
        setIsReviewing(false);
        setReviewStep('');
      } else {
        // Asynchronous job queued or running
        const initialJob: ReviewJob = {
          id: res.jobId,
          contentId: saved.id,
          versionNumber: version,
          status: (res.status as JobStatus) || 'QUEUED',
          mode: 'async',
          attemptCount: 1,
          maxAttempts: 3,
        };
        setActiveJob(initialJob);
        setReviewStep(`Job #${res.jobId.slice(-6)} queued in background (polling active)...`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Governance review failed. Ensure backend and AI microservice are running.');
      setIsReviewing(false);
      setReviewStep('');
    }
  };

  // Retry an eligible failed review job
  const handleRetryJob = async () => {
    if (!activeJob || !currentContent?.id) return;
    setIsReviewing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { job } = await BrandGuardApi.retryReviewJob(currentContent.id, activeJob.id);
      setActiveJob(job);
      setReviewStep(`Job #${job.id.slice(-6)} re-queued for execution...`);
    } catch (err: any) {
      setIsReviewing(false);
      setErrorMessage(err.message || 'Failed to retry review job.');
    }
  };

  const handleApplyRecommendation = (correction: string) => {
    setBody(correction);
    const nextVer = version + 1;
    setVersion(nextVer);
    setSuccessMessage('Editorial recommendation applied to draft editor. Save draft to record a new version.');
  };

  // Accepting suggestion updates body, creates a new version checkpoint, resets approval status
  const handleAcceptSuggestion = async (correction: string) => {
    let newBody = body;
    const matchingFinding = findings.find((f) => f.suggestedCorrection === correction);

    if (matchingFinding && body.includes(matchingFinding.flaggedText)) {
      newBody = body.replace(matchingFinding.flaggedText, correction);
    } else {
      newBody = correction;
    }

    setBody(newBody);
    const nextVer = version + 1;
    setVersion(nextVer);

    if (matchingFinding) {
      setFindings((prev) =>
        prev.map((f) =>
          f.id === matchingFinding.id
            ? { ...f, resolution: 'accepted', resolutionReason: 'Accepted suggested alternative' }
            : f
        )
      );

      if (currentContent?.id) {
        try {
          await BrandGuardApi.resolveFinding(currentContent.id, matchingFinding.id, 'accepted', 'Applied AI correction');
        } catch {
          // Logged silently, checkpoint already marked in state
        }
      }
    }

    setSuccessMessage('Editorial suggestion accepted! Content draft version bumped.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Human reviewer / compliance officer manual override with mandatory audit reason
  const handleResolveFinding = async (findingId: string, reason: string) => {
    if (!currentContent?.id) return;

    try {
      await BrandGuardApi.resolveFinding(currentContent.id, findingId, 'resolved', reason);

      setFindings((prev) =>
        prev.map((f) =>
          f.id === findingId
            ? { ...f, resolution: 'resolved', resolutionReason: reason }
            : f
        )
      );

      setSuccessMessage('Finding resolved with recorded compliance justification.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record resolution on finding.');
    }
  };

  // Submit revised copy for formal Human Sign-off
  const handleSubmitApproval = async () => {
    if (!currentContent?.id) {
      setErrorMessage('Please save content draft before submitting for human sign-off.');
      return;
    }

    const unresolvedCritical = findings.filter(
      (f) => (f.severity === 'critical' || f.severity === 'high') && !f.resolution
    );

    if (unresolvedCritical.length > 0) {
      const confirmSubmit = window.confirm(
        `Warning: There are ${unresolvedCritical.length} unresolved Critical/High governance violations. Submitting will flag this version for mandatory executive review. Proceed?`
      );
      if (!confirmSubmit) return;
    }

    try {
      await onSubmitForApproval(currentContent.id);
      setSuccessMessage('Content successfully submitted to Approval Gateway.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit content draft for sign-off.');
    }
  };

  const openFindingsCount = findings.filter((f) => !f.resolution).length;
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      {/* Editorial Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-2xl border border-ink-200 shadow-card">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <span className="font-mono text-xs bg-canvas px-3 py-1 rounded-lg text-ink-800 font-bold border border-ink-200">
            Version {version}.0
          </span>
          <StatusBadge status={currentContent?.status || 'DRAFT'} />
          {providerUsed && (
            <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border flex items-center bg-forest-50 text-forest border-forest/20 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-forest"></span>
              {providerUsed}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleManualSave}
            loading={isSaving}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save Draft
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleRunReview}
            loading={isReviewing}
            disabled={isReviewing}
            icon={<Zap className="w-3.5 h-3.5" />}
          >
            {isReviewing ? 'Analyzing Claims...' : 'Run Governance Review'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleSubmitApproval}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            Submit for Sign-off
          </Button>
        </div>
      </div>

      {/* Autonomous Failover Test Toggle Banner */}
      <div className="bg-canvas border border-ink-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <span className="font-bold text-ink-900 font-mono">Autonomous Failover Mode:</span>
          <span className="text-ink-600 font-sans">
            Simulate primary Gemini provider failure/timeout to verify OpenAI failover
          </span>
        </div>
        <label className="flex items-center space-x-2 cursor-pointer self-start sm:self-auto">
          <input
            type="checkbox"
            checked={simulateFailover}
            onChange={(e) => setSimulateFailover(e.target.checked)}
            className="rounded border-ink-300 text-forest focus:ring-forest w-4 h-4"
          />
          <span className={`font-mono text-[11px] font-bold ${simulateFailover ? 'text-amberBrand' : 'text-ink-500'}`}>
            {simulateFailover ? '⚡ Failover Active (Forces Secondary)' : 'Standard (Primary Gemini 2.0 Flash)'}
          </span>
        </label>
      </div>

      {/* Active Serverless Review Job Banner */}
      {activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'RUNNING') && (
        <div className="p-4 bg-ink-950 text-white rounded-xl shadow-elevated font-mono text-xs flex items-center justify-between gap-3 border border-ink-800">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 border-2 border-forest-light border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
            <div>
              <span className="font-bold text-forest-light">Review Job #{activeJob.id.slice(-8)}</span>
              <span className="text-ink-400 mx-2">•</span>
              <span className="text-ink-300">{activeJob.status}</span>
              <span className="text-ink-400 mx-2">•</span>
              <span className="text-ink-400">Attempt {activeJob.attemptCount}/{activeJob.maxAttempts}</span>
            </div>
          </div>
          <span className="text-[11px] text-ink-400 font-sans">Durable polling active</span>
        </div>
      )}

      {/* Eligible Failed Job Retry Banner */}
      {activeJob && activeJob.status === 'FAILED' && activeJob.error?.retryable && (
        <div className="p-4 bg-amberBrand-50 border border-amberBrand/30 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-subtle">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amberBrand flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-ink-900 font-sans">
                Review Job #{activeJob.id.slice(-8)} Encountered Transient Failure
              </p>
              <p className="text-ink-600 font-sans mt-0.5">
                {activeJob.error.message} (Attempts used: {activeJob.attemptCount}/{activeJob.maxAttempts})
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRetryJob}
            loading={isReviewing}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Retry Review Job
          </Button>
        </div>
      )}

      {/* Review Progress Stepper Alert */}
      {isReviewing && !activeJob && (
        <div className="p-4 bg-ink-950 text-white rounded-xl shadow-elevated font-mono text-xs flex items-center space-x-3 border border-ink-800">
          <div className="w-4 h-4 border-2 border-forest-light border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
          <span className="tracking-wide">{reviewStep}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start space-x-3 shadow-subtle">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Notification Banner */}
      {successMessage && (
        <div className="p-3.5 bg-forest-50 border border-forest/30 text-forest text-xs rounded-xl flex items-center space-x-2.5 shadow-subtle">
          <CheckCircle className="w-4 h-4 flex-shrink-0 text-forest" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Split Pane: Editor (Left 60%) & Findings (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Editorial Content Composer */}
        <div className="lg:col-span-7 bg-surface rounded-2xl border border-ink-200 shadow-card p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono font-semibold text-ink-600 uppercase tracking-wider mb-2">
              Content Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Flagship Cloud Architecture Whitepaper"
              className="w-full text-base font-bold text-ink-900 border border-ink-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest transition bg-canvas/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-ink-600 uppercase tracking-wider mb-2">
                Publication Channel
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
                className="w-full text-xs font-sans text-ink-800 border border-ink-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest transition bg-canvas/40"
              >
                <option value="website">Public Web Copy</option>
                <option value="social">Social Media Campaign</option>
                <option value="email">Email Outreach / Newsletter</option>
                <option value="press_release">Official Press Release</option>
                <option value="advertisement">Paid Advertising Copy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-ink-600 uppercase tracking-wider mb-2">
                Document Word Count
              </label>
              <div className="text-xs font-mono font-semibold text-ink-800 border border-ink-200 rounded-xl px-3 py-2.5 bg-canvas/30">
                {wordCount} Words ({body.length} Characters)
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-mono font-semibold text-ink-600 uppercase tracking-wider">
                Publication Body
              </label>
              <span className="text-[11px] font-mono text-ink-400">
                Grounded inspection evaluates approved brand rules
              </span>
            </div>
            <textarea
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Draft your promotional marketing copy, announcement statements, or technical product descriptions here..."
              className="w-full font-serif text-sm text-ink-900 border border-ink-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest transition leading-relaxed bg-canvas/20 resize-y"
            />
          </div>

          <div className="p-3 bg-canvas border border-ink-200 rounded-lg text-xs text-ink-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="flex items-center text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-forest mr-1.5 flex-shrink-0" />
              Pre-publication review cross-references verified guideline repository
            </span>
            <span className="font-mono text-[11px] text-ink-400">Context Budget: 4,000 tokens</span>
          </div>
        </div>

        {/* Right Column: Governance Stream (Findings & Recommendations) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface rounded-2xl border border-ink-200 p-5 sm:p-6 shadow-card">
            {/* Segmented Tab Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-ink-100 gap-3">
              <div className="flex items-center space-x-1.5 p-1 bg-canvas rounded-xl border border-ink-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('findings')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === 'findings'
                      ? 'bg-surface text-ink-900 shadow-subtle font-bold border border-ink-200/60'
                      : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  Violations ({findings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('recommendations')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center space-x-1.5 ${
                    activeTab === 'recommendations'
                      ? 'bg-surface text-ink-900 shadow-subtle font-bold border border-ink-200/60'
                      : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  <span>Recommendations ({recommendations.length})</span>
                  {recommendations.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
                  )}
                </button>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-mono text-ink-500">
                  {activeTab === 'findings'
                    ? `${openFindingsCount} open violation${openFindingsCount === 1 ? '' : 's'}`
                    : `${recommendations.length} actionable advice`}
                </span>
              </div>
            </div>

            {/* Tab 1: Governance Violations */}
            {activeTab === 'findings' && (
              <>
                {findings.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-forest-50 text-forest flex items-center justify-center mx-auto mb-3 border border-forest/20">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h5 className="text-sm font-bold text-ink-900 font-sans">No Governance Issues Detected</h5>
                    <p className="text-xs text-ink-500 mt-1 max-w-xs mx-auto leading-relaxed">
                      {body.trim()
                        ? 'Click "Run Governance Review" to test submitted copy against authorized brand rules and approved benchmark facts.'
                        : 'Compose or paste draft copy to evaluate compliance against approved brand guidelines.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 mt-4 max-h-[720px] overflow-y-auto pr-1">
                    {findings.map((f) => (
                      <FindingCard
                        key={f.id}
                        finding={f}
                        onAcceptSuggestion={handleAcceptSuggestion}
                        onResolve={handleResolveFinding}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Tab 2: Actionable Recommendations */}
            {activeTab === 'recommendations' && (
              <>
                {recommendations.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3 border border-purple-200">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h5 className="text-sm font-bold text-ink-900 font-sans">No Strategic Recommendations</h5>
                    <p className="text-xs text-ink-500 mt-1 max-w-xs mx-auto leading-relaxed">
                      Run an AI governance review to generate evidence-backed editorial recommendations, impact ratings, and suggested rewrites.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 mt-4 max-h-[720px] overflow-y-auto pr-1">
                    {recommendations.map((r) => (
                      <RecommendationCard
                        key={r.id}
                        recommendation={r}
                        onApplyRecommendation={handleApplyRecommendation}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
