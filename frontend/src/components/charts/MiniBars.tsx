import React from 'react';

// A short list of horizontal bars (one per row), drawn with plain markup. A row with no value shows its
// `note` text instead of a bar (for example "3 of 5 needed" while answers are still hidden).

export type MiniBarRow = {
  key: string;
  label: string;
  /** null = nothing to draw; the note is shown instead. */
  value: number | null;
  /** Shown at the end of the row, e.g. "4.2/5 · 12". */
  valueLabel?: string;
  note?: string;
};

interface MiniBarsProps {
  rows: MiniBarRow[];
  /** The value that fills a whole bar. */
  max: number;
  ariaLabel: string;
  className?: string;
}

const MiniBars: React.FC<MiniBarsProps> = ({ rows, max, ariaLabel, className = '' }) => (
  <ul className={`space-y-1.5 ${className}`} aria-label={ariaLabel}>
    {rows.map((row) => {
      const pct = row.value === null ? 0 : Math.max(0, Math.min(100, (row.value / max) * 100));
      return (
        <li key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-16 flex-none text-gray-600">{row.label}</span>
          {row.value === null ? (
            <span className="flex-1 text-xs text-gray-500">{row.note}</span>
          ) : (
            <>
              <span
                className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={row.value}
                aria-label={`${row.label}: ${row.valueLabel ?? row.value}`}
              >
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-20 flex-none text-right text-xs tabular-nums text-gray-500">{row.valueLabel ?? row.value}</span>
            </>
          )}
        </li>
      );
    })}
  </ul>
);

export default MiniBars;
