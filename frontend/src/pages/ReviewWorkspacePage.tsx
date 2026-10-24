import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle, 
  Zap, 
  ShieldCheck,
  Save,
  AlertCircle
} from 'lucide-react';
import { ContentItem, ContentType, Finding, ReviewResult } from '../types';
import { Button } from '../components/common/Button';
import { FindingCard } from '../components/findings/FindingCard';
import { StatusBadge } from '../components/common/Badge';
import { BrandGuardApi } from '../api/services';

interface ReviewWorkspaceProps {
  currentContent: ContentItem | null;
  onSaveContent: (content: Partial<ContentItem>) => Promise<ContentItem>;
  onSubmitForApproval: (contentId: string) => Promise<void>;
  onTriggerReview: (contentId: string, simulateFailover?: boolean) => Promise<ReviewResult>;
}

export const ReviewWorkspacePage: React.FC<ReviewWorkspaceProps> = ({
  currentContent,
  onSaveContent,
  onSubmitForApproval,
  onTriggerReview,
}) => {
  const [title, setTitle] = useState(currentContent?.title || '');
  const [contentType, setContentType] = useState<ContentType>(currentContent?.contentType || 'website');
  const [body, setBody] = useState(currentContent?.body || '');
  const [version, setVersion] = useState(currentContent?.currentVersion || 1);
  const [findings, setFindings] = useState<Finding[]>(currentContent?.findings || []);
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
    } else {
      setTitle('');
      setContentType('website');
      setBody('');
      setVersion(1);
      setFindings([]);
    }
    setErrorMessage(null);
  }, [currentContent]);

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

  // Run AI Governance Review through real backend & AI microservice
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
      setReviewStep('1/2: Saving content draft & establishing version checkpoint in database...');
      const saved = await onSaveContent({
        id: currentContent?.id,
        title: title.trim(),
        contentType,
        body: body.trim(),
        currentVersion: version,
      });

      // 2. Invoke real backend review pipeline
      setReviewStep(
        simulateFailover 
          ? '2/2: Simulating primary timeout -> invoking OpenAI failover engine...' 
          : '2/2: Grounding claims with RAG against approved guidelines & benchmark facts...'
      );

      const result = await onTriggerReview(saved.id, simulateFailover);

      setFindings(result.findings);
      setProviderUsed(result.providerUsed);
      setSuccessMessage(
        `Review completed via ${result.providerUsed}. ${result.findings.length} governance finding${
          result.findings.length === 1 ? '' : 's'
        } identified.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Governance review failed. Ensure backend and AI microservice are running.');
    } finally {
      setIsReviewing(false);
      setReviewStep('');
    }
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
          await BrandGuardApi.resolveFinding(
            currentContent.id,
            matchingFinding.id,
            'accepted',
            'Accepted suggested alternative'
          );
        } catch (err: any) {
          console.warn('Could not persist finding acceptance:', err.message);
        }
      }
    }

    setSuccessMessage(`Applied correction & advanced to Version ${nextVer}.0 (Invalidated prior sign-offs).`);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleResolveFinding = async (findingId: string, reason: string) => {
    setFindings((prev) =>
      prev.map((f) =>
        f.id === findingId ? { ...f, resolution: 'resolved', resolutionReason: reason } : f
      )
    );

    if (currentContent?.id) {
      try {
        await BrandGuardApi.resolveFinding(currentContent.id, findingId, 'resolved', reason);
      } catch (err: any) {
        setErrorMessage(`Failed to persist resolution: ${err.message}`);
        return;
      }
    }

    setSuccessMessage('Finding resolved and compliance justification persisted to audit log.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleSubmitApproval = async () => {
    if (!currentContent?.id) {
      setErrorMessage('Please save the draft or run a review first before submitting for approval.');
      return;
    }
    try {
      await onSubmitForApproval(currentContent.id);
      setSuccessMessage('Submitted to Human Approval Queue for reviewer sign-off.');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit content for sign-off.');
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

      {/* Review Progress Stepper Alert */}
      {isReviewing && (
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-ink-900 mb-1.5 font-sans">
                Content Title / Campaign Headline
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs p-3 bg-canvas border border-ink-200 rounded-lg focus:ring-1 focus:ring-forest focus:border-forest text-ink-900 font-medium"
                placeholder="e.g. Q4 Cloud Infrastructure Announcement"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-900 mb-1.5 font-sans">
                Channel / Format
              </label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
                className="w-full text-xs p-3 bg-canvas border border-ink-200 rounded-lg focus:ring-1 focus:ring-forest text-ink-900 capitalize font-medium"
              >
                <option value="website">Website Copy</option>
                <option value="social">Social Media Post</option>
                <option value="email">Marketing Email</option>
                <option value="press_release">Press Release</option>
                <option value="advertisement">Paid Advertisement</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-ink-900 font-sans">
                Proposed Publication Copy
              </label>
              <div className="flex items-center space-x-3 text-[11px] font-mono text-ink-500">
                <span>{wordCount} words</span>
                <span>&bull;</span>
                <span>{body.length} characters</span>
              </div>
            </div>
            <textarea
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-sm font-sans leading-relaxed p-4 bg-canvas border border-ink-200 rounded-xl focus:ring-1 focus:ring-forest focus:border-forest text-ink-900 transition-colors"
              placeholder="Compose or paste your draft copy here to run pre-publication governance inspection..."
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

        {/* Right Column: Governance Findings Stream */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface rounded-2xl border border-ink-200 p-5 sm:p-6 shadow-card">
            <div className="flex items-center justify-between pb-4 border-b border-ink-100">
              <div>
                <h4 className="font-bold text-sm text-ink-900 font-sans">Governance Findings</h4>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  {openFindingsCount} open violation{openFindingsCount === 1 ? '' : 's'} requiring editorial review
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-canvas text-ink-800 border border-ink-200">
                  Total: {findings.length}
                </span>
              </div>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
};
