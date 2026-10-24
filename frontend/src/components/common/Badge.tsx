import React from 'react';
import { FindingSeverity, ContentStatus, SourceStatus, ContentType } from '../../types';

interface SeverityBadgeProps {
  severity: FindingSeverity;
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, className = '' }) => {
  const styles: Record<FindingSeverity, { container: string; dot: string }> = {
    critical: {
      container: 'bg-critical-bg text-critical-text border-critical-border/50',
      dot: 'bg-critical-text',
    },
    high: {
      container: 'bg-warning-bg text-warning-text border-warning-border/50',
      dot: 'bg-warning-text',
    },
    medium: {
      container: 'bg-caution-bg text-caution-text border-caution-border/50',
      dot: 'bg-caution-text',
    },
    low: {
      container: 'bg-info-bg text-info-text border-info-border/50',
      dot: 'bg-info-text',
    },
    info: {
      container: 'bg-ink-100 text-ink-700 border-ink-200',
      dot: 'bg-ink-500',
    },
  };

  const current = styles[severity] || styles.info;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold border uppercase tracking-wider ${current.container} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot} mr-1.5`}></span>
      {severity}
    </span>
  );
};

interface StatusBadgeProps {
  status: ContentStatus | SourceStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  let style = 'bg-ink-100 text-ink-700 border-ink-200';

  switch (status) {
    case 'APPROVED':
    case 'approved':
      style = 'bg-forest-50 text-forest border-forest/20 font-semibold';
      break;
    case 'SUBMITTED':
    case 'pending_review':
    case 'PENDING_APPROVAL':
      style = 'bg-amberBrand-50 text-amberBrand-dark border-amberBrand/30 font-medium';
      break;
    case 'REVIEWING':
    case 'IN_HUMAN_REVIEW':
      style = 'bg-amber-50 text-amber-800 border-amber-300 font-medium animate-pulse';
      break;
    case 'NEEDS_REVISION':
    case 'REJECTED':
      style = 'bg-red-50 text-red-800 border-red-200 font-medium';
      break;
    case 'DRAFT':
    case 'draft':
      style = 'bg-ink-100 text-ink-600 border-ink-200';
      break;
    case 'PUBLISHED':
      style = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
      break;
    case 'archived':
    case 'superseded':
      style = 'bg-ink-200 text-ink-500 border-ink-300 line-through';
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-sans border ${style} ${className}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const ChannelBadge: React.FC<{ type: ContentType }> = ({ type }) => {
  const map: Record<ContentType, string> = {
    website: 'Website Copy',
    social: 'Social Media',
    email: 'Marketing Email',
    press_release: 'Press Release',
    advertisement: 'Paid Ad',
  };

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono text-ink-600 bg-canvas border border-ink-200">
      {map[type] || type}
    </span>
  );
};
