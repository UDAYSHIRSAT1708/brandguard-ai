import React, { useState } from 'react';
import { Recommendation } from '../../types';
import { Check, ShieldCheck, Sparkles, BookOpen, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '../common/Button';

interface RecommendationCardProps {
  recommendation: Recommendation;
  onApplyRecommendation?: (correction: string) => void;
  readOnly?: boolean;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  onApplyRecommendation,
  readOnly = false,
}) => {
  const [showEvidence, setShowEvidence] = useState(true);

  const impactStyles: Record<string, { badge: string; border: string }> = {
    HIGH: {
      badge: 'bg-red-50 text-red-700 border-red-200',
      border: 'border-l-red-500',
    },
    MEDIUM: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      border: 'border-l-amber-500',
    },
    LOW: {
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      border: 'border-l-blue-400',
    },
  };

  const currentImpact = impactStyles[recommendation.impact] || impactStyles.MEDIUM;

  return (
    <div
      className={`bg-surface rounded-xl border border-ink-200 border-l-4 ${currentImpact.border} p-4 sm:p-5 shadow-card hover:border-ink-300 transition-all duration-150`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${currentImpact.badge}`}
          >
            {recommendation.impact} IMPACT
          </span>

          {recommendation.isEvidenceBacked ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-forest-50 text-forest border border-forest/30">
              <ShieldCheck className="w-3 h-3 mr-1 text-forest" />
              Verified Source Evidence
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <Sparkles className="w-3 h-3 mr-1 text-purple-600" />
              Model Inference
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 font-mono text-[11px] text-ink-500">
          <span>Confidence:</span>
          <span className="font-semibold text-ink-800">
            {Math.round(recommendation.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Core Issue */}
      <div className="my-2">
        <h5 className="text-xs font-bold text-ink-900 font-sans flex items-start">
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>{recommendation.issue}</span>
        </h5>
      </div>

      {/* Editorial Rationale */}
      <p className="text-xs text-ink-700 leading-relaxed font-sans mt-1.5">
        {recommendation.rationale}
      </p>

      {/* Grounded Evidence Excerpts */}
      {recommendation.evidenceExcerpts && recommendation.evidenceExcerpts.length > 0 && (
        <div className="mt-3 bg-forest-50/70 border border-forest/20 rounded-lg p-2.5 text-xs">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowEvidence(!showEvidence)}
          >
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-forest flex items-center">
              <BookOpen className="w-3 h-3 mr-1 text-forest" />
              Retrieved Guideline Evidence ({recommendation.evidenceExcerpts.length})
            </span>
            <button className="text-forest hover:text-forest-dark p-0.5">
              {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showEvidence && (
            <div className="mt-2 space-y-1.5 pt-1.5 border-t border-forest/15">
              {recommendation.evidenceExcerpts.map((excerpt, idx) => (
                <p key={idx} className="text-forest-dark italic text-[11px] leading-relaxed">
                  &ldquo;{excerpt}&rdquo;
                </p>
              ))}
              {recommendation.evidenceSources && recommendation.evidenceSources.length > 0 && (
                <div className="mt-2 flex gap-1.5 flex-wrap pt-1">
                  {recommendation.evidenceSources.map((id) => (
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

      {/* Concrete Suggested Revision */}
      {recommendation.suggestedCorrection && (
        <div className="mt-3 bg-canvas border border-ink-200 rounded-lg p-3">
          <span className="text-[10px] font-mono text-ink-500 uppercase tracking-wider block mb-1">
            Suggested Editorial Correction:
          </span>
          <p className="text-xs font-mono text-forest-dark bg-forest-50/60 p-2 rounded border border-forest/20 leading-relaxed break-words">
            {recommendation.suggestedCorrection}
          </p>

          {!readOnly && onApplyRecommendation && (
            <div className="flex items-center justify-end pt-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onApplyRecommendation(recommendation.suggestedCorrection)}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Apply Recommendation
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
