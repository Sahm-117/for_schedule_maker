import React from 'react';

// Small radial bar: how many open follow-ups a support holds against the max
// set in Settings. Green under 80%, amber from 80%, red once full.
const loadTone = (value: number, max: number): 'good' | 'near' | 'full' =>
  max > 0 && value >= max ? 'full' : max > 0 && value / max >= 0.8 ? 'near' : 'good';

const STROKE = { good: '#10b981', near: '#f59e0b', full: '#ef4444' } as const;
const TEXT = { good: 'text-gray-500', near: 'text-amber-700', full: 'text-red-700' } as const;

const LoadRing: React.FC<{ value: number; max: number; className?: string }> = ({ value, max, className = '' }) => {
  const tone = loadTone(value, max);
  const r = 7;
  const c = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${TEXT[tone]} ${className}`} title={`${value} of ${max} follow-ups`}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        {share > 0 && <circle
          cx="9" cy="9" r={r} fill="none" stroke={STROKE[tone]} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 9 9)"
        />}
      </svg>
      {value}/{max}
    </span>
  );
};

export default LoadRing;
