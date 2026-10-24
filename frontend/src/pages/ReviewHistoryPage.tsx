import React, { useState } from 'react';
import { Shield, Filter, Search, ShieldCheck } from 'lucide-react';
import { AuditEvent } from '../types';

interface ReviewHistoryProps {
  auditEvents: AuditEvent[];
  isDemoFallback?: boolean;
}

export const ReviewHistoryPage: React.FC<ReviewHistoryProps> = ({
  auditEvents,
  isDemoFallback = false,
}) => {
  const [filterAction, setFilterAction] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = auditEvents.filter((ev) => {
    const matchesAction =
      filterAction === 'all' || ev.action.toLowerCase().includes(filterAction.toLowerCase());
    const matchesSearch =
      ev.userName.toLowerCase().includes(search.toLowerCase()) ||
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(ev.details).toLowerCase().includes(search.toLowerCase());
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 sm:p-7 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-forest font-bold bg-forest-50 px-2.5 py-0.5 rounded-full border border-forest/20 inline-flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Cryptographic Audit Log
            </span>
            {isDemoFallback && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amberBrand font-semibold bg-amberBrand-50 px-2 py-0.5 rounded border border-amberBrand/30">
                Offline Mode
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight font-sans">
            Review History & Audit Trail
          </h3>
          <p className="text-xs text-ink-600 max-w-2xl leading-relaxed font-sans">
            Append-only governance trail. Every content draft revision, AI pre-flight check, reviewer decision, and guideline change is permanently timestamped for compliance auditing.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono bg-forest-50 text-forest border border-forest/20 px-3.5 py-1.5 rounded-lg font-bold flex items-center shadow-subtle">
            <Shield className="w-3.5 h-3.5 mr-1.5 text-forest" />
            Append-Only Active
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-4 rounded-xl border border-ink-200 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Search audit trail by actor, action, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3.5 py-2.5 bg-canvas border border-ink-200 rounded-lg focus:ring-1 focus:ring-forest text-ink-900 font-sans"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-ink-400" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="text-xs py-2 px-3 bg-canvas border border-ink-200 rounded-lg text-ink-800 font-sans"
          >
            <option value="all">All Events</option>
            <option value="review">Reviews Executed</option>
            <option value="approved">Approvals</option>
            <option value="rejected">Rejections</option>
            <option value="submission">Submissions</option>
            <option value="knowledge">Knowledge Changes</option>
          </select>
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-surface rounded-xl border border-ink-200 shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-ink-400">
            No audit records match the current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas border-b border-ink-200 text-ink-500 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-5">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-5">Event Payload Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 font-sans">
                {filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-canvas/60 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-ink-500 whitespace-nowrap text-[11px]">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-ink-900">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-canvas border border-ink-200 text-ink-800 font-bold">
                        {ev.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-ink-800">
                      {ev.userName}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-ink-600 text-[11px]">
                      {ev.resourceType}:{ev.resourceId.slice(-6)}
                    </td>
                    <td className="py-3.5 px-5 text-ink-600 text-[11px] font-mono leading-relaxed max-w-md truncate">
                      {JSON.stringify(ev.details).replace(/"/g, '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
