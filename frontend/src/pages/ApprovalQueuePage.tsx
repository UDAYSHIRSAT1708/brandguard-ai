import React, { useState } from 'react';
import { 
  CheckSquare, 
  Check, 
  X, 
  MessageSquare, 
  AlertCircle, 
  ShieldAlert,
  ShieldCheck 
} from 'lucide-react';
import { ContentItem } from '../types';
import { Button } from '../components/common/Button';
import { StatusBadge, ChannelBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';

interface ApprovalQueueProps {
  pendingItems: ContentItem[];
  isDemoFallback?: boolean;
  onApprove: (contentId: string, versionNumber: number, comment?: string) => Promise<void>;
  onReject: (contentId: string, versionNumber: number, reason: string) => Promise<void>;
  onRequestChanges: (contentId: string, versionNumber: number, feedback: string) => Promise<void>;
}

export const ApprovalQueuePage: React.FC<ApprovalQueueProps> = ({
  pendingItems,
  isDemoFallback = false,
  onApprove,
  onReject,
  onRequestChanges,
}) => {
  const { role } = useAuth();
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'changes' | null>(null);
  const [justification, setJustification] = useState('');

  const isReviewerOrAdmin = role === 'reviewer' || role === 'admin';

  const handleActionClick = (item: ContentItem, type: 'approve' | 'reject' | 'changes') => {
    setSelectedItem(item);
    setActionType(type);
    setJustification('');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !actionType) return;

    if (actionType === 'approve') {
      await onApprove(selectedItem.id, selectedItem.currentVersion, justification);
    } else if (actionType === 'reject') {
      await onReject(selectedItem.id, selectedItem.currentVersion, justification);
    } else if (actionType === 'changes') {
      await onRequestChanges(selectedItem.id, selectedItem.currentVersion, justification);
    }

    setActionType(null);
    setSelectedItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 sm:p-7 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-forest font-bold bg-forest-50 px-2.5 py-0.5 rounded-full border border-forest/20 inline-flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Pre-Publication Gateway
            </span>
            {isDemoFallback && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amberBrand font-semibold bg-amberBrand-50 px-2 py-0.5 rounded border border-amberBrand/30">
                Offline Mode
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight font-sans">
            Human Approval Queue
          </h3>
          <p className="text-xs text-ink-600 max-w-2xl leading-relaxed font-sans">
            Pre-publication governance gateway. Reviewers evaluate automated findings, inspect evidence citations, and register legally binding publication approvals bound to exact content versions.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono bg-amberBrand-50 text-amberBrand-dark border border-amberBrand/30 px-3.5 py-1.5 rounded-lg font-bold shadow-subtle">
            {pendingItems.length} Item{pendingItems.length === 1 ? '' : 's'} Pending Sign-off
          </span>
        </div>
      </div>

      {/* Role Warning for Content Creators */}
      {!isReviewerOrAdmin && (
        <div className="p-4 sm:p-5 bg-amberBrand-50 border border-amberBrand/30 text-amberBrand-dark rounded-xl text-xs flex items-start space-x-3.5 shadow-subtle">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amberBrand mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">Role Access Restriction (Creator Active)</p>
            <p className="leading-relaxed">
              You are currently logged in as a <strong>Content Creator</strong>. Under governance policy, creators cannot approve their own submissions. Please have an authorized <strong>Brand Reviewer</strong> or <strong>Admin</strong> in your organization review and sign off on pending submissions.
            </p>
          </div>
        </div>
      )}

      {/* Pending Items List */}
      {pendingItems.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-dashed border-ink-200 p-16 text-center max-w-lg mx-auto shadow-card">
          <div className="w-12 h-12 rounded-full bg-forest-50 text-forest flex items-center justify-center mx-auto mb-3 border border-forest/20">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-ink-900 font-sans">All Review Queues Clear</h4>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto leading-relaxed">
            There are currently no items awaiting human sign-off. Submissions sent from the Review Workspace will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {pendingItems.map((item) => {
            const openFindings = item.findings?.filter((f) => !f.resolution) || [];
            return (
              <div
                key={item.id}
                className="bg-surface rounded-2xl border border-ink-200 shadow-card p-6 space-y-4 hover:border-ink-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-ink-100">
                  <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                    <span className="font-mono text-xs font-bold bg-canvas text-ink-800 px-2.5 py-1 rounded-md border border-ink-200">
                      Version {item.currentVersion}.0
                    </span>
                    <h4 className="font-bold text-base text-ink-900 font-sans">{item.title}</h4>
                    <ChannelBadge type={item.contentType} />
                  </div>
                  <div className="flex items-center space-x-3">
                    <StatusBadge status={item.status} />
                    <span className="text-xs text-ink-500 font-mono">
                      Submitted: {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Content Excerpt Box */}
                <div className="bg-canvas border border-ink-200 rounded-xl p-4 font-sans text-xs text-ink-900 leading-relaxed">
                  <div className="text-[10px] font-mono text-ink-400 uppercase tracking-wider mb-1.5 font-semibold">
                    Submitted Copy Excerpt:
                  </div>
                  <p className="whitespace-pre-wrap font-sans text-xs sm:text-sm">{item.body}</p>
                </div>

                {/* Open Findings Alert */}
                {openFindings.length > 0 && (
                  <div className="p-4 bg-amberBrand-50 border border-amberBrand/30 rounded-xl text-xs text-amberBrand-dark flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amberBrand mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold">
                        {openFindings.length} Open Finding{openFindings.length === 1 ? '' : 's'} Detected:
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                        {openFindings.map((f) => (
                          <li key={f.id}>
                            <strong className="capitalize">{f.category.replace(/_/g, ' ')}:</strong> &ldquo;{f.flaggedText}&rdquo; &bull; {f.explanation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Action Controls */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-[11px] font-mono text-ink-500">
                    Target Publication Version: v{item.currentVersion}.0
                  </span>

                  <div className="flex items-center space-x-2.5">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!isReviewerOrAdmin}
                      onClick={() => handleActionClick(item, 'reject')}
                      icon={<X className="w-3.5 h-3.5" />}
                    >
                      Reject Submission
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!isReviewerOrAdmin}
                      onClick={() => handleActionClick(item, 'changes')}
                      icon={<MessageSquare className="w-3.5 h-3.5" />}
                    >
                      Request Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!isReviewerOrAdmin}
                      onClick={() => handleActionClick(item, 'approve')}
                      icon={<Check className="w-3.5 h-3.5" />}
                    >
                      Approve Version {item.currentVersion}.0
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Justification Modal */}
      <Modal
        isOpen={Boolean(actionType)}
        onClose={() => setActionType(null)}
        title={
          actionType === 'approve'
            ? 'Certify Editorial Approval'
            : actionType === 'reject'
            ? 'Reject Content Submission'
            : 'Request Changes from Creator'
        }
        subtitle={`Action targeted on Version ${selectedItem?.currentVersion}.0 of "${selectedItem?.title}"`}
      >
        <form onSubmit={handleModalSubmit} className="space-y-4">
          <p className="text-xs text-ink-600 leading-relaxed font-sans">
            {actionType === 'approve'
              ? `You are certifying Version ${selectedItem?.currentVersion}.0. This sign-off will be immutably recorded in the security audit trail.`
              : `State your justification for ${actionType === 'reject' ? 'rejecting' : 'requesting revisions on'} Version ${selectedItem?.currentVersion}.0.`}
          </p>

          <div>
            <label className="block text-xs font-bold text-ink-900 mb-1 font-sans">
              Reviewer Notes & Justification {actionType !== 'approve' && <span className="text-red-600">*</span>}
            </label>
            <textarea
              rows={3}
              required={actionType !== 'approve'}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Confirmed all claims align with authorized Q3 accuracy benchmarks..."
              className="w-full text-xs p-3 bg-canvas border border-ink-200 rounded-lg text-ink-900 font-sans"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-ink-100">
            <Button size="sm" variant="secondary" type="button" onClick={() => setActionType(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={actionType === 'reject' ? 'danger' : 'primary'}
              type="submit"
            >
              Confirm {actionType ? actionType.toUpperCase() : ''}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
