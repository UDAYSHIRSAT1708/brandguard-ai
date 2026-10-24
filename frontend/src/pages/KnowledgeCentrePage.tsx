import React, { useState } from 'react';
import { 
  PlusCircle, 
  Search, 
  Tag,
  BookOpen,
  ShieldCheck,
  Archive,
  Check
} from 'lucide-react';
import { KnowledgeSource, SourceType } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';

interface KnowledgeCentreProps {
  sources: KnowledgeSource[];
  isDemoFallback?: boolean;
  onAddSource: (source: Partial<KnowledgeSource>) => Promise<void>;
  onApproveSource: (sourceId: string) => Promise<void>;
  onArchiveSource: (sourceId: string) => Promise<void>;
}

export const KnowledgeCentrePage: React.FC<KnowledgeCentreProps> = ({
  sources,
  isDemoFallback = false,
  onAddSource,
  onApproveSource,
  onArchiveSource,
}) => {
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<SourceType>('guideline');
  const [newContent, setNewContent] = useState('');
  const [newScope, setNewScope] = useState('');

  const isAdmin = role === 'admin';

  const filteredSources = sources.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.toLowerCase().includes(search.toLowerCase()) ||
      (s.productScope && s.productScope.toLowerCase().includes(search.toLowerCase()));
    const matchesType = selectedType === 'all' || s.sourceType === selectedType;
    const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    await onAddSource({
      title: newTitle.trim(),
      sourceType: newType,
      content: newContent.trim(),
      productScope: newScope.trim() || 'Global',
      status: isAdmin ? 'approved' : 'pending_review',
      version: 1,
    });

    setIsModalOpen(false);
    setNewTitle('');
    setNewContent('');
    setNewScope('');
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 sm:p-7 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-forest font-bold bg-forest-50 px-2.5 py-0.5 rounded-full border border-forest/20 inline-flex items-center">
              <BookOpen className="w-3 h-3 mr-1" />
              Authoritative Grounding Knowledge
            </span>
            {isDemoFallback && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amberBrand font-semibold bg-amberBrand-50 px-2 py-0.5 rounded border border-amberBrand/30">
                Offline Seed Data
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight font-sans">
            Brand Knowledge Centre
          </h3>
          <p className="text-xs text-ink-600 max-w-2xl leading-relaxed font-sans">
            Central repository of approved product claims, prohibited phrase lists, benchmark facts, and editorial guidelines. AI inspection strictly grounds all findings in approved entries.
          </p>
        </div>

        <div>
          <Button
            onClick={() => setIsModalOpen(true)}
            size="md"
            variant="primary"
            icon={<PlusCircle className="w-4 h-4" />}
          >
            Add Knowledge Source
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-4 rounded-xl border border-ink-200 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Search guidelines, facts, rules, or citations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3.5 py-2.5 bg-canvas border border-ink-200 rounded-lg focus:ring-1 focus:ring-forest text-ink-900 font-sans"
          />
        </div>

        <div className="flex items-center space-x-2.5 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs py-2 px-3 bg-canvas border border-ink-200 rounded-lg text-ink-800 font-sans capitalize"
          >
            <option value="all">All Source Types</option>
            <option value="guideline">Brand Guidelines</option>
            <option value="fact">Approved Facts</option>
            <option value="claim">Approved Claims</option>
            <option value="prohibited_phrase">Prohibited Phrases</option>
            <option value="terminology">Terminology Standards</option>
            <option value="disclaimer">Required Disclaimers</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs py-2 px-3 bg-canvas border border-ink-200 rounded-lg text-ink-800 font-sans capitalize"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved Only</option>
            <option value="draft">Draft / Pending</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Sources Grid */}
      {filteredSources.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-ink-200 p-12 text-center shadow-card space-y-3">
          <div className="w-12 h-12 rounded-full bg-forest-50 text-forest flex items-center justify-center mx-auto border border-forest/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-ink-900 font-sans">No Brand Knowledge Sources Found</h4>
          <p className="text-xs text-ink-500 max-w-sm mx-auto leading-relaxed font-sans">
            {sources.length === 0
              ? 'Your brand rule repository is empty. Add authoritative guidelines, approved product claims, or prohibited phrases to power AI verification.'
              : 'No knowledge sources match your active search or filter criteria.'}
          </p>
          {isAdmin && (
            <div className="pt-2">
              <Button size="sm" variant="primary" onClick={() => setIsModalOpen(true)} icon={<PlusCircle className="w-4 h-4" />}>
                Add First Guideline
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSources.map((source) => (
            <div
              key={source.id}
              className="bg-surface rounded-2xl border border-ink-200 p-5 sm:p-6 shadow-card hover:border-ink-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[11px] font-mono font-bold text-forest uppercase tracking-wider bg-forest-50 px-2.5 py-0.5 rounded border border-forest/20">
                    {source.sourceType.replace(/_/g, ' ')}
                  </span>
                  <StatusBadge status={source.status} />
                </div>

                <h4 className="text-sm sm:text-base font-bold text-ink-900 tracking-tight font-sans">
                  {source.title}
                </h4>
                <p className="text-xs text-ink-700 mt-2.5 font-mono leading-relaxed bg-canvas p-3.5 rounded-xl border border-ink-200/80">
                  &ldquo;{source.content}&rdquo;
                </p>
              </div>

              <div className="mt-4 pt-3.5 border-t border-ink-100 flex items-center justify-between text-[11px] text-ink-500 font-mono">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center font-mono">
                    <Tag className="w-3.5 h-3.5 mr-1 text-ink-400" />
                    {source.productScope || 'Global'}
                  </span>
                  <span className="font-mono">v{source.version}.0</span>
                </div>

                {/* Admin Actions */}
                {isAdmin && (
                  <div className="flex items-center space-x-1">
                    {source.status !== 'approved' && (
                      <button
                        onClick={() => onApproveSource(source.id)}
                        className="text-forest hover:text-forest-dark font-semibold text-xs px-2.5 py-1 rounded hover:bg-forest-50 flex items-center space-x-1 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                    )}
                    {source.status !== 'archived' && (
                      <button
                        onClick={() => onArchiveSource(source.id)}
                        className="text-ink-500 hover:text-red-700 font-semibold text-xs px-2.5 py-1 rounded hover:bg-red-50 flex items-center space-x-1 transition-colors"
                      >
                        <Archive className="w-3 h-3" />
                        <span>Archive</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Knowledge Source Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Authoritative Knowledge Source"
        subtitle="New rules are indexed for AI retrieval and citation verification."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-900 mb-1 font-sans">
              Rule Title / Identifier
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Prohibition of Absolute Guarantees"
              className="w-full text-xs p-2.5 bg-canvas border border-ink-200 rounded-lg text-ink-900 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-900 mb-1 font-sans">
                Source Category
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as SourceType)}
                className="w-full text-xs p-2.5 bg-canvas border border-ink-200 rounded-lg text-ink-900 capitalize font-medium"
              >
                <option value="guideline">Brand Guideline</option>
                <option value="fact">Approved Product Fact</option>
                <option value="claim">Approved Marketing Claim</option>
                <option value="prohibited_phrase">Prohibited Phrase</option>
                <option value="terminology">Terminology Standard</option>
                <option value="disclaimer">Required Disclaimer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-900 mb-1 font-sans">
                Product / Regional Scope
              </label>
              <input
                type="text"
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                placeholder="Global / Core Platform"
                className="w-full text-xs p-2.5 bg-canvas border border-ink-200 rounded-lg text-ink-900 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-900 mb-1 font-sans">
              Exact Authoritative Policy or Benchmark Text
            </label>
            <textarea
              rows={4}
              required
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Provide exact approved wording, benchmark figures, or legal limitation..."
              className="w-full text-xs p-3 bg-canvas border border-ink-200 rounded-lg text-ink-900 font-mono"
            />
          </div>

          <div className="p-3 bg-forest-50 border border-forest/20 rounded-lg text-xs text-forest flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-forest" />
            <div>
              <span className="font-bold block">Authoritative Evidence Guarantee:</span>
              <span>
                Once approved, this rule will immediately enter the retrieval index to verify or flag claims in future content drafts.
              </span>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-ink-100">
            <Button variant="secondary" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Knowledge Source
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
