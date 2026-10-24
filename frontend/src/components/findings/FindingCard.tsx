import React, { useState } from 'react';
import { Finding, FindingSeverity } from '../../types';
import { SeverityBadge } from '../common/Badge';
import { Check, ShieldAlert, BookOpen, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../common/Button';
import { DiffViewer } from './DiffViewer';

interface FindingCardProps {
  finding: Finding;
  onAcceptSuggestion?: (correction: string) => void;
  onResolve?: (findingId: string, reason: string) => void;
  readOnly?: boolean;
}

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  onAcceptSuggestion,
  onResolve,
  readOnly = false,
}) => {
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionReason, setResolutionReason] = useState('');
  const [showEvidence, setShowEvidence] = useState(true);

  const severityBorderColors: Record<FindingSeverity, string> = {
    critical: 'border-l-critical-border',
    high: 'border-l-warning-border',
    medium: 'border-l-caution-border',
    low: 'border-l-info-border',
    info: 'border-l-ink-400',
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onResolve && resolutionReason.trim()) {
      onResolve(finding.id, resolutionReason.trim());
      setShowResolveModal(false);
    }
  };

  const isResolved = finding.resolution === 'resolved' || finding.resolution === 'accepted';

  return (
    <div
      className={`bg-surface rounded-xl border border-ink-200 border-l-4 ${
        severityBorderColors[finding.severity]
      } p-4 sm:p-5 shadow-card transition-all duration-150 ${
        isResolved ? 'opacity-65 bg-canvas/60' : 'hover:border-ink-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <SeverityBadge severity={finding.severity} />
          <span className="text-[11px] font-mono font-medium text-ink-600 uppercase tracking-wider bg-canvas px-2 py-0.5 rounded border border-ink-200/80">
            {finding.category.replace(/_/g, ' ')}
          </span>
          {finding.requiresHumanReview && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amberBrand-50 text-amberBrand border border-amberBrand/30">
              <ShieldAlert className="w-3 h-3 mr-1" />
              Sign-off Required
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-ink-500">
          <span>Confidence:</span>
          <span className="font-semibold text-ink-800">
            {Math.round(finding.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Flagged Substring Box */}
      <div className="bg-canvas border border-ink-200 rounded-lg p-3 my-2.5">
        <span className="text-[10px] font-mono text-ink-400 uppercase tracking-wider block mb-1">
          Flagged Text in Content:
        </span>
        <code className="text-xs font-mono text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-semibold break-words border border-red-200/60">
          &ldquo;{finding.flaggedText}&rdquo;
        </code>
      </div>

      {/* Explanation */}
      <p className="text-xs text-ink-700 leading-relaxed font-sans mt-2">{finding.explanation}</p>

      {/* Guideline Citation */}
      <div className="mt-2.5 flex items-start space-x-1.5 text-xs text-ink-600 bg-canvas/60 p-2 rounded border border-ink-100">
        <BookOpen className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-forest" />
        <span className="italic font-sans">{finding.guideline}</span>
      </div>

      {/* Expandable Approved Evidence Section */}
      {finding.sourceExcerpts && finding.sourceExcerpts.length > 0 && (
        <div className="mt-2.5 bg-forest-50/70 border border-forest/20 rounded-lg p-2.5 text-xs">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowEvidence(!showEvidence)}
          >
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-forest flex items-center">
              Approved Evidence Cited ({finding.sourceExcerpts.length})
            </span>
            <button className="text-forest hover:text-forest-dark p-0.5">
              {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showEvidence && (
            <div className="mt-2 space-y-1.5 pt-1.5 border-t border-forest/15">
              {finding.sourceExcerpts.map((excerpt, idx) => (
                <p key={idx} className="text-forest-dark italic text-[11px] leading-relaxed">
                  &ldquo;{excerpt}&rdquo;
                </p>
              ))}
              {finding.sourceIds.length > 0 && (
                <div className="mt-2 flex gap-1.5 flex-wrap pt-1">
                  {finding.sourceIds.map((id) => (
                    <span
                      key={id}
                      className="bg-white border border-forest/30 text-forest text-[10px] font-mono px-1.5 py-0.5 rounded shadow-subtle"
                    >
                      Source #{id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suggested Editorial Replacement with Diff View */}
      {finding.suggestedCorrection && (
        <div className="mt-3 space-y-2">
          <DiffViewer original={finding.flaggedText} replacement={finding.suggestedCorrection} />

          {!readOnly && !isResolved && onAcceptSuggestion && (
            <div className="flex items-center justify-end space-x-2 pt-1">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onAcceptSuggestion(finding.suggestedCorrection!)}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Accept Suggestion & Bump Version
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Resolution Footer */}
      {!readOnly && (
        <div className="mt-3 pt-2.5 border-t border-ink-100 flex items-center justify-between text-xs">
          {isResolved ? (
            <div className="flex items-center space-x-1.5 text-forest font-semibold text-xs font-mono">
              <Check className="w-4 h-4" />
              <span>Resolved: {finding.resolutionReason || 'Accepted suggestion'}</span>
            </div>
          ) : (
            <div className="flex items-center justify-end w-full space-x-2">
              <button
                onClick={() => setShowResolveModal(true)}
                className="text-xs text-ink-500 hover:text-ink-900 flex items-center space-x-1 py-1 px-2 rounded-lg hover:bg-canvas transition-colors font-medium"
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                <span>Dismiss / Resolve with Justification</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resolution Justification Dialog */}
      {showResolveModal && (
        <div className="mt-3 p-3.5 bg-canvas rounded-lg border border-ink-300 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-ink-900">State reason for resolving this finding:</p>
          <input
            type="text"
            value={resolutionReason}
            onChange={(e) => setResolutionReason(e.target.value)}
            placeholder="e.g. Authorized exception granted by Legal & Compliance"
            className="w-full text-xs p-2 border border-ink-300 rounded-md bg-surface text-ink-900 focus:ring-1 focus:ring-forest"
            autoFocus
          />
          <div className="flex justify-end space-x-2 pt-1">
            <button
              onClick={() => setShowResolveModal(false)}
              className="text-xs text-ink-600 px-2.5 py-1 hover:bg-ink-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" variant="secondary" onClick={handleResolveSubmit}>
              Confirm Resolution
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
