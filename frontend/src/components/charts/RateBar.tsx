import React from 'react';

// One "N of M" rate drawn as a bar, with the plain numbers beside it.

interface RateBarProps {
  count: number;
  total: number;
  /** What the count means, e.g. "said Got it" or "read". Used in the text and the accessible label. */
  noun: string;
  className?: string;
}

const RateBar: React.FC<RateBarProps> = ({ count, total, noun, className = '' }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={`w-full min-w-[112px] ${className}`}>
      <p className="text-[13px] tabular-nums text-gray-500"><span className="text-[15px] font-semibold text-gray-900">{count}</span> of {total} {noun}</p>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-label={`${count} of ${total} ${noun} (${pct}%)`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default RateBar;
