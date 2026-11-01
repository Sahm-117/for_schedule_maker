import React from 'react';

// A small trend line drawn as inline SVG (the app has no chart library). Colour comes from the theme
// (text-primary -> currentColor), so it follows the runtime accent. The dots carry the exact value in
// their tooltip, and the chart's accessible label lists every number, so nothing depends on seeing the line.

export type MiniLinePoint = { label: string; value: number };

interface MiniLineProps {
  points: MiniLinePoint[];
  /** Describes the chart for screen readers, e.g. "Attendance by week". */
  ariaLabel: string;
  /** How a value reads in tooltips and the accessible label, e.g. (v) => `${v}%`. */
  format?: (value: number) => string;
  /** Fix the vertical range (e.g. 0 to 100 for percentages). Otherwise it fits the data. */
  min?: number;
  max?: number;
  height?: number;
  className?: string;
}

const MiniLine: React.FC<MiniLineProps> = ({ points, ariaLabel, format = (v) => String(v), min, max, height = 64, className = '' }) => {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const lo = min ?? Math.min(...values);
  const hiRaw = max ?? Math.max(...values);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;
  const xOf = (i: number) => (points.length === 1 ? 50 : 4 + (i / (points.length - 1)) * 92); // percent, with side padding
  const yOf = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * 84; // percent, with top/bottom padding
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(p.value).toFixed(2)}`).join(' ');
  const last = points.length - 1;
  return (
    <div className={className}>
      <div className="relative w-full text-primary" style={{ height }} role="img" aria-label={`${ariaLabel}: ${points.map((p) => `${p.label} ${format(p.value)}`).join(', ')}`}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {points.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {points.map((p, i) => (
          <span
            key={`${p.label}-${i}`}
            title={`${p.label}: ${format(p.value)}`}
            className={`absolute rounded-full bg-current ring-2 ring-white ${i === last ? 'h-2.5 w-2.5' : 'h-2 w-2'}`}
            style={{ left: `${xOf(i)}%`, top: `${yOf(p.value)}%`, transform: 'translate(-50%, -50%)' }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500" aria-hidden="true">
        <span>{points[0].label}</span>
        {points.length > 1 && <span>{points[last].label}</span>}
      </div>
    </div>
  );
};

export default MiniLine;
