import React from 'react';

interface StatusBadgeProps {
  status: 'working' | 'error' | 'limit' | 'unknown' | 'todo' | 'in_progress' | 'done' | 'blocked';
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const displayLabel = label || status;

  switch (status) {
    case 'working':
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          {displayLabel}
        </span>
      );
    case 'limit':
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          {displayLabel}
        </span>
      );
    case 'error':
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-red-500/10 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
          {displayLabel}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
          {displayLabel}
        </span>
      );
  }
};

export const TierBadge: React.FC<{ tier: 'fast' | 'balanced' | 'strong' }> = ({ tier }) => {
  const colors = {
    fast: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    balanced: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    strong: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${colors[tier] || colors.balanced}`}>
      {tier}
    </span>
  );
};
