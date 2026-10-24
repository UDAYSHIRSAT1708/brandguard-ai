import React from 'react';
import { 
  FileCheck2, 
  AlertTriangle, 
  Clock, 
  PlusCircle, 
  TrendingUp, 
  CheckCircle2, 
  ArrowUpRight,
  ShieldCheck,
  BarChart2
} from 'lucide-react';
import { ContentItem, DashboardMetrics } from '../types';
import { StatusBadge, ChannelBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { useAuth } from '../context/AuthContext';

interface DashboardPageProps {
  contents: ContentItem[];
  metrics?: DashboardMetrics;
  isDemoFallback?: boolean;
  onNewReview: () => void;
  onOpenContent: (content: ContentItem) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  contents,
  metrics,
  isDemoFallback = false,
  onNewReview,
  onOpenContent,
}) => {
  const { user } = useAuth();
  const totalReviews = metrics?.totalReviews ?? contents.length;
  const pendingApprovals = metrics?.pendingApprovals ?? contents.filter(
    (c) => c.status === 'PENDING_APPROVAL' || c.status === 'SUBMITTED'
  ).length;
  const approvedCount = contents.filter((c) => c.status === 'APPROVED').length;
  
  const criticalCount = metrics?.criticalIssues ?? contents.reduce((acc, c) => {
    return acc + (c.findings?.filter((f) => f.severity === 'critical' || f.severity === 'high').length || 0);
  }, 0);

  const complianceRate = totalReviews > 0 ? Math.round((approvedCount / totalReviews) * 100) : 100;

  // Severity totals - truthfully defaults to 0 when empty
  const sevCritical = metrics?.findingsBySeverity?.critical ?? 0;
  const sevHigh = metrics?.findingsBySeverity?.high ?? 0;
  const sevMedium = metrics?.findingsBySeverity?.medium ?? 0;
  const sevLow = metrics?.findingsBySeverity?.low ?? 0;
  const totalSev = sevCritical + sevHigh + sevMedium + sevLow;

  return (
    <div className="space-y-7">
      {/* Editorial Welcome & Governance Posture Banner */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 sm:p-7 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-forest font-bold bg-forest-50 px-2.5 py-0.5 rounded-full border border-forest/20 inline-flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Active Brand Governance Posture
            </span>
            {isDemoFallback && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amberBrand font-semibold bg-amberBrand-50 px-2 py-0.5 rounded border border-amberBrand/30">
                Offline Standby
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight font-sans">
            {user?.organisationName ? `${user.organisationName} Governance Workspace` : 'Editorial Governance Workspace'}
          </h3>
          <p className="text-xs text-ink-600 max-w-2xl leading-relaxed font-sans">
            Pre-publication governance and claim verification engine active. Authoritative brand guidelines and approved benchmark facts protect enterprise reputation.
          </p>
        </div>

        <div className="flex-shrink-0 relative z-10">
          <Button
            onClick={onNewReview}
            variant="primary"
            size="md"
            icon={<PlusCircle className="w-4 h-4" />}
          >
            New Content Review
          </Button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-surface rounded-xl border border-ink-200 p-5 shadow-card hover:border-ink-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 font-sans">Total Reviews</span>
            <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center text-ink-700 border border-ink-200">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ink-900 mt-3 font-mono">{totalReviews}</p>
          <div className="flex items-center text-[11px] text-forest font-medium mt-1 font-sans">
            <TrendingUp className="w-3 h-3 mr-1" />
            <span>Active across all channels</span>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-ink-200 p-5 shadow-card hover:border-ink-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 font-sans">Pending Human Approval</span>
            <div className="w-8 h-8 rounded-lg bg-amberBrand-50 flex items-center justify-center text-amberBrand border border-amberBrand/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ink-900 mt-3 font-mono">{pendingApprovals}</p>
          <p className="text-[11px] text-amberBrand-dark font-medium mt-1 font-sans">
            Requires reviewer sign-off
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-ink-200 p-5 shadow-card hover:border-ink-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 font-sans">Flagged Risk Items</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-700 border border-red-200">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ink-900 mt-3 font-mono">{criticalCount}</p>
          <p className="text-[11px] text-red-700 font-medium mt-1 font-sans">
            Critical & High severity
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-ink-200 p-5 shadow-card hover:border-ink-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 font-sans">Compliance Rate</span>
            <div className="w-8 h-8 rounded-lg bg-forest-50 flex items-center justify-center text-forest border border-forest/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ink-900 mt-3 font-mono">{complianceRate}%</p>
          <p className="text-[11px] text-forest font-medium mt-1 font-sans">
            Approved without open violations
          </p>
        </div>
      </div>

      {/* Severity Breakdown Strip */}
      <div className="bg-surface rounded-xl border border-ink-200 p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-4 h-4 text-forest" />
            <h4 className="font-bold text-xs text-ink-900 uppercase tracking-wider font-mono">
              Findings Severity Distribution
            </h4>
          </div>
          <span className="text-[11px] font-mono text-ink-400">
            Total Issues Logged: {sevCritical + sevHigh + sevMedium + sevLow}
          </span>
        </div>

        {/* Stacked bar */}
        {totalSev === 0 ? (
          <div className="h-3 w-full bg-canvas rounded-full flex border border-ink-200 items-center justify-center">
            <span className="text-[10px] font-mono text-ink-400">Zero active findings logged</span>
          </div>
        ) : (
          <div className="h-3 w-full bg-canvas rounded-full overflow-hidden flex border border-ink-200">
            <div
              style={{ width: `${(sevCritical / totalSev) * 100}%` }}
              className="bg-red-600 transition-all duration-300"
              title={`Critical: ${sevCritical}`}
            />
            <div
              style={{ width: `${(sevHigh / totalSev) * 100}%` }}
              className="bg-amber-600 transition-all duration-300"
              title={`High: ${sevHigh}`}
            />
            <div
              style={{ width: `${(sevMedium / totalSev) * 100}%` }}
              className="bg-amber-500 transition-all duration-300"
              title={`Medium: ${sevMedium}`}
            />
            <div
              style={{ width: `${(sevLow / totalSev) * 100}%` }}
              className="bg-blue-600 transition-all duration-300"
              title={`Low: ${sevLow}`}
            />
          </div>
        )}

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs font-mono text-ink-600">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
            <span>Critical: <strong>{sevCritical}</strong></span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>High: <strong>{sevHigh}</strong></span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Medium: <strong>{sevMedium}</strong></span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span>Low: <strong>{sevLow}</strong></span>
          </div>
        </div>
      </div>

      {/* Recent Reviews Table */}
      <div className="bg-surface rounded-xl border border-ink-200 shadow-card overflow-hidden">
        <div className="p-5 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm text-ink-900 font-sans">Recent Content Reviews</h4>
            <p className="text-xs text-ink-500 mt-0.5 font-sans">
              Submissions undergoing automated AI inspection or human reviewer sign-off.
            </p>
          </div>
          <span className="text-xs font-mono text-ink-500 bg-canvas px-2.5 py-1 rounded-md border border-ink-200">
            {contents.length} Total Submissions
          </span>
        </div>

        {contents.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-400">
            No reviews registered yet. Start a review using the button above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas border-b border-ink-200 text-ink-500 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-5">Title & Channel</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Issues Found</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 font-sans">
                {contents.map((item) => {
                  const issueCount = item.findings?.length || 0;
                  return (
                    <tr key={item.id} className="hover:bg-canvas/70 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-bold text-ink-900 text-xs sm:text-sm">{item.title}</div>
                        <div className="mt-1">
                          <ChannelBadge type={item.contentType} />
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-4 px-4 font-mono font-semibold text-ink-700">
                        v{item.currentVersion}.0
                      </td>
                      <td className="py-4 px-4">
                        {issueCount > 0 ? (
                          <span className="font-mono text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded font-semibold text-[11px]">
                            {issueCount} issue{issueCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="font-mono text-forest bg-forest-50 border border-forest/20 px-2 py-0.5 rounded font-medium text-[11px]">
                            Clean
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-ink-500 font-mono text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <button
                          onClick={() => onOpenContent(item)}
                          className="inline-flex items-center space-x-1 text-xs font-semibold text-forest hover:text-forest-dark transition-colors px-2 py-1 rounded hover:bg-forest-50"
                        >
                          <span>Open in Workspace</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
