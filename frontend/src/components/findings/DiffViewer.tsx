import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface DiffViewerProps {
  original: string;
  replacement: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ original, replacement }) => {
  return (
    <div className="bg-canvas border border-ink-200 rounded-lg p-3 text-xs space-y-2">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-400">
        <span className="flex items-center text-red-700 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 mr-1.5"></span>
          Original Flagged Copy
        </span>
        <ArrowRight className="w-3 h-3 text-ink-300" />
        <span className="flex items-center text-forest font-semibold">
          <Sparkles className="w-3 h-3 text-forest mr-1" />
          Recommended Compliant Alternative
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="bg-red-50/70 border border-red-200/80 rounded p-2 text-red-900 font-mono break-words leading-relaxed">
          &ldquo;{original}&rdquo;
        </div>
        <div className="bg-forest-50 border border-forest/20 rounded p-2 text-forest-dark font-mono break-words leading-relaxed font-medium">
          &ldquo;{replacement}&rdquo;
        </div>
      </div>
    </div>
  );
};
