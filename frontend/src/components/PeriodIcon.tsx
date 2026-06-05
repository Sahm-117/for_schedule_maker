import React from 'react';
import type { Activity } from '../types';

type Period = Activity['period'];

const PERIOD_STYLES: Record<Period, { label: string; text: string; bg: string; border: string }> = {
  MORNING: {
    label: 'Morning',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  AFTERNOON: {
    label: 'Afternoon',
    text: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
  },
  EVENING: {
    label: 'Evening',
    text: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
};

export const getPeriodStyle = (period: Period) => PERIOD_STYLES[period];

const PeriodGlyph: React.FC<{ period: Period; className?: string }> = ({ period, className = 'h-4 w-4' }) => {
  if (period === 'MORNING') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 17h16M6 13a6 6 0 0 1 12 0M12 3v3M5.6 6.6l2.1 2.1M18.4 6.6l-2.1 2.1" />
      </svg>
    );
  }

  if (period === 'AFTERNOON') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    );
  }

  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M18 15.5A6.5 6.5 0 1 1 9.5 7 5.5 5.5 0 0 0 18 15.5Z" />
    </svg>
  );
};

const PeriodIcon: React.FC<{ period: Period; className?: string }> = ({ period, className }) => (
  <PeriodGlyph period={period} className={className} />
);

export const PeriodBadge: React.FC<{ period: Period; compact?: boolean }> = ({ period, compact = false }) => {
  const style = getPeriodStyle(period);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${style.bg} ${style.border} ${style.text} ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'} font-semibold`}>
      <PeriodGlyph period={period} className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {style.label}
    </span>
  );
};

export default PeriodIcon;
