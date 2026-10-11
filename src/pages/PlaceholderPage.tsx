import React from 'react';
import { LucideIcon, Lock } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  stageBadge: string;
  description: string;
  icon: LucideIcon;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  stageBadge,
  description,
  icon: Icon
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 mb-2">
          <Lock className="w-3 h-3 text-zinc-500" />
          {stageBadge}
        </div>
        <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
        <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-lg max-w-md mx-auto text-xs text-zinc-500 font-mono text-left">
        <p className="text-zinc-400 font-semibold mb-1">Upcoming capabilities:</p>
        <ul className="list-disc list-inside space-y-1">
          {stageBadge.includes('3') && (
            <>
              <li>Sequential isolated step runners (Run next, Run branch)</li>
              <li>Per-branch state.json and outputs/step-*.md</li>
              <li>Directives to selected branches</li>
            </>
          )}
          {stageBadge.includes('4') && (
            <>
              <li>Project file assembly & binary-safe assets</li>
              <li>Sandboxed iframe preview (/index.html)</li>
              <li>Download project as ZIP archive</li>
            </>
          )}
          {stageBadge.includes('5') && (
            <>
              <li>Interactive n8n-style React Flow canvas</li>
              <li>Live edge animations during inference</li>
              <li>Model slot assignments with confirmation</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
};
