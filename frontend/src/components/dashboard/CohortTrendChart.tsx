import React, { useEffect, useRef, useState } from 'react';
import type { WeekStat } from './healthModel';

// The whole cohort's arc on one scale: the share of groups that recorded Sunday
// attendance and the share that submitted a meeting report, week by week.
// Both are "% of groups", so they share one axis honestly.

const SERIES = [
  { key: 'recordingRate', label: 'Recorded Sunday attendance', color: '#2a78d6' },
  { key: 'meetingRate', label: 'Submitted a meeting report', color: '#eb6834' },
] as const;

const TARGET = 0.8;
const HEIGHT = 230;
const PAD = { top: 16, right: 16, bottom: 30, left: 38 };

const pct = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

const CohortTrendChart: React.FC<{ stats: WeekStat[]; lastWeek: number }> = ({ stats, lastWeek }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [showTable]);

  const shown = stats.filter((s) => s.weekNumber <= lastWeek);
  const count = stats.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (count <= 1 ? innerW / 2 : (i * innerW) / (count - 1));
  const y = (v: number) => PAD.top + innerH - v * innerH;
  const wide = width >= 560;

  const path = (key: typeof SERIES[number]['key']) =>
    shown
      .map((s, i) => ({ v: s[key], i }))
      .filter((p) => p.v !== null)
      .map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v as number).toFixed(1)}`)
      .join(' ');

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left + PAD.left;
    const i = count <= 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (count - 1));
    setHover(Math.min(Math.max(i, 0), shown.length - 1));
  };

  const hovered = hover !== null ? shown[hover] : null;
  const lastIndex = shown.length - 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200"
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Week</th>
                <th className="py-1.5 pr-3 font-semibold">Groups recording attendance</th>
                <th className="py-1.5 pr-3 font-semibold">Present of those marked</th>
                <th className="py-1.5 font-semibold">Meeting reports</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              {shown.map((s) => (
                <tr key={s.weekId} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3 font-semibold">{s.weekNumber}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.recordedGroups} of {s.groupsWithMembers} ({pct(s.recordingRate)})</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.marked ? `${pct(s.attendanceRate)} of ${s.marked}` : '–'}</td>
                  <td className="py-1.5 tabular-nums">{s.meetingsSubmitted} of {s.groupsWithMembers} ({pct(s.meetingRate)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          <svg width={width} height={HEIGHT} role="img" aria-label="Weekly share of groups recording attendance and submitting meeting reports" className="block overflow-visible">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#eceef2" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-400 text-[10px]">{Math.round(t * 100)}%</text>
              </g>
            ))}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(TARGET)} y2={y(TARGET)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
            <text x={width - PAD.right} y={y(TARGET) - 5} textAnchor="end" className="fill-gray-500 text-[10px] font-medium">Target 80%</text>

            {stats.map((s, i) => (
              <text key={s.weekId} x={x(i)} y={HEIGHT - 10} textAnchor="middle" className={`text-[10px] ${s.weekNumber <= lastWeek ? 'fill-gray-500' : 'fill-gray-300'}`}>
                {count > 12 && i % 2 === 1 ? '' : `W${s.weekNumber}`}
              </text>
            ))}

            {hovered && (
              <line x1={x(hover as number)} x2={x(hover as number)} y1={PAD.top} y2={PAD.top + innerH} stroke="#cbd5e1" strokeWidth={1} />
            )}

            {SERIES.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {SERIES.map((s) =>
              shown.map((w, i) => {
                const v = w[s.key];
                if (v === null) return null;
                const active = hover === i;
                if (!active && i !== lastIndex) return null;
                return <circle key={`${s.key}-${w.weekId}`} cx={x(i)} cy={y(v)} r={active ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth={2} />;
              }),
            )}

            {wide && lastIndex >= 0 && hover === null && (() => {
              const ends = SERIES.map((s) => ({ s, v: shown[lastIndex][s.key] })).filter((e) => e.v !== null) as Array<{ s: typeof SERIES[number]; v: number }>;
              // Nudge labels apart when the two lines finish close together.
              const ys = ends.map((e) => y(e.v));
              if (ys.length === 2 && Math.abs(ys[0] - ys[1]) < 14) {
                const mid = (ys[0] + ys[1]) / 2;
                const up = ys[0] <= ys[1] ? 0 : 1;
                ys[up] = mid - 7;
                ys[1 - up] = mid + 7;
              }
              const anchorRight = x(lastIndex) > width - 90;
              return ends.map((e, n) => (
                <text
                  key={e.s.key}
                  x={x(lastIndex) + (anchorRight ? -10 : 10)}
                  y={ys[n]}
                  dy="0.32em"
                  textAnchor={anchorRight ? 'end' : 'start'}
                  className="fill-gray-700 text-[11px] font-semibold"
                >
                  {pct(e.v)}
                </text>
              ));
            })()}

            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl bg-[#1f2430] px-3 py-2.5 text-xs text-white shadow-lg"
              style={x(hover as number) > width / 2 ? { right: width - x(hover as number) + 12 } : { left: x(hover as number) + 12 }}
            >
              <p className="font-semibold">Week {hovered.weekNumber}</p>
              <div className="mt-1.5 space-y-1">
                <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES[0].color }} />Attendance recorded: {hovered.recordedGroups} of {hovered.groupsWithMembers} groups</p>
                <p className="pl-3.5 text-white/70">{hovered.marked ? `${pct(hovered.attendanceRate)} present of ${hovered.marked} marked` : 'No one marked'}</p>
                <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES[1].color }} />Reports: {hovered.meetingsSubmitted} of {hovered.groupsWithMembers} groups</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CohortTrendChart;
