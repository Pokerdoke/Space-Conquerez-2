import React from 'react';

interface HealthBarProps {
  hp: number;
  maxHp: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const getHealthColor = (hp: number, maxHp: number) => {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  if (pct > 0.6) return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]';
  if (pct > 0.3) return 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.55)]';
  return 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.55)]';
};

export const getHealthTextColor = (hp: number, maxHp: number) => {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  if (pct > 0.6) return 'text-emerald-400';
  if (pct > 0.3) return 'text-amber-300';
  return 'text-rose-400';
};

export const HealthBar: React.FC<HealthBarProps> = ({ hp, maxHp, label = 'Hull', size = 'sm', className = '' }) => {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  const height = size === 'md' ? 'h-2' : 'h-1.5';

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-0.5 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <span className={getHealthTextColor(hp, maxHp)}>{hp}/{maxHp}</span>
      </div>
      <div className={`${height} overflow-hidden rounded-full border border-slate-700/70 bg-slate-950/90`}> 
        <div
          className={`h-full rounded-full transition-all duration-300 ${getHealthColor(hp, maxHp)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
