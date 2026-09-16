import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { AttentionItem, CohortHealthPayload, GroupEngagement, HealthStatus } from './healthModel';
import { STATUS_LABEL } from './healthModel';

// Building blocks for the admin home page. Status always carries an icon and a
// label, never colour alone.

const STATUS_PILL: Record<HealthStatus, string> = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warning: 'bg-amber-100/80 text-amber-700',
  critical: 'bg-red-100/80 text-red-700',
  neutral: 'bg-neutral-100 text-neutral-600',
};

const STATUS_DOT: Record<HealthStatus, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  neutral: 'bg-neutral-400',
};

export const StatusIcon: React.FC<{ status: HealthStatus; className?: string }> = ({ status, className = 'h-3.5 w-3.5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    {status === 'good' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="m5 13 4 4L19 7" />}
    {status === 'warning' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M12 7v6m0 4h.01" />}
    {status === 'critical' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M7 7l10 10M17 7 7 17" />}
    {status === 'neutral' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M7 12h10" />}
  </svg>
);

export const HealthPill: React.FC<{ status: HealthStatus; label?: string }> = ({ status, label }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[status]}`}>
    <StatusIcon status={status} className="h-3 w-3" />
    {label ?? STATUS_LABEL[status]}
  </span>
);

export const Sparkline: React.FC<{ values: Array<number | null>; color: string; label: string }> = ({ values, color, label }) => {
  const points = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as Array<{ v: number; i: number }>;
  if (points.length < 2) return <div className="h-8" />;
  const w = 120;
  const h = 32;
  const x = (i: number) => 4 + (i * (w - 8)) / Math.max(values.length - 1, 1);
  const y = (v: number) => 4 + (1 - v) * (h - 8);
  const d = points.map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={3} fill={color} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const VitalTile: React.FC<{
  title: string;
  status: HealthStatus;
  statusLabel?: string;
  value: React.ReactNode;
  unit?: string;
  detail: React.ReactNode;
  to?: string;
  children?: React.ReactNode;
}> = ({ title, status, statusLabel, value, unit, detail, to, children }) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        <HealthPill status={status} label={statusLabel} />
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{value}</span>
        {unit && <span className="text-sm font-medium text-gray-500">{unit}</span>}
      </p>
      <p className="mt-1 text-sm text-gray-600">{detail}</p>
      {children && <div className="mt-3">{children}</div>}
    </>
  );
  const cls = 'surface-card block p-5 transition';
  return to ? <NavLink to={to} className={`${cls} hover:-translate-y-0.5`}>{body}</NavLink> : <div className={cls}>{body}</div>;
};

/** A thin segmented bar; segments sit 2px apart and each carries a text label below. */
export const SegmentBar: React.FC<{ segments: Array<{ label: string; value: number; color: string }> }> = ({ segments }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {visible.map((s) => (
          <span key={s.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label} <span className="font-semibold tabular-nums text-gray-800">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const AttentionList: React.FC<{ items: AttentionItem[]; onAction: (item: AttentionItem) => void }> = ({ items, onAction }) => (
  <section className="surface-card p-5 sm:p-6">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold text-gray-900">Needs attention</h3>
      {items.length > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 tabular-nums">{items.length}</span>}
    </div>
    {items.length === 0 ? (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50/70 px-4 py-4 text-sm text-emerald-800">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700"><StatusIcon status="good" /></span>
        Nothing needs attention right now.
      </div>
    ) : (
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-2.5">
            <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-white ${STATUS_DOT[item.status]}`} title={STATUS_LABEL[item.status]}>
              <StatusIcon status={item.status} className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 text-sm text-gray-800">{item.text}</span>
            {item.to ? (
              <NavLink to={item.to} className="flex-none rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">{item.actionLabel}</NavLink>
            ) : (
              <button type="button" onClick={() => onAction(item)} className="flex-none rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">{item.actionLabel}</button>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
);

// Heat grid cell shades: one hue, light to dark, for 0 / 1 / 2 of the week's two tasks done.
const CELL = ['#eceef2', '#a9c9ef', '#2a78d6'];
const CELL_TEXT = ['Neither done', 'One of two', 'Both done'];

export const GroupHeatGrid: React.FC<{
  groups: GroupEngagement[];
  data: CohortHealthPayload;
  weekNumbers: number[];
}> = ({ groups, data, weekNumbers }) => {
  const [showAll, setShowAll] = useState(false);
  const struggling = groups.filter((g) => g.score < 0.8);
  const rows = showAll ? groups : struggling.slice(0, 8);
  const weeks = data.weeks.filter((w) => weekNumbers.includes(w.weekNumber)).sort((a, b) => a.weekNumber - b.weekNumber);

  const cellValue = (groupId: string, weekId: number) => {
    const recorded = data.attendance.some((a) => a.groupId === groupId && a.weekId === weekId);
    const report = data.meetings.some((m) => m.groupId === groupId && m.weekId === weekId);
    return { level: Number(recorded) + Number(report), recorded, report };
  };

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Groups that need support</h3>
        {groups.length > 0 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-primary hover:text-primary-dark">
            {showAll ? 'Only those behind' : `All ${groups.length} groups`}
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-500">Each week: Sunday attendance recorded, and a meeting report submitted. Weakest first.</p>

      {weeks.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No finished weeks to judge yet.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50/70 px-4 py-6 text-center text-sm text-emerald-800">Every group is keeping up.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: '0 2px' }}>
            <thead>
              <tr>
                <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">Group</th>
                {weeks.map((w) => (
                  <th key={w.id} className="w-[18px] px-px pb-1 text-center text-[10px] font-medium text-gray-400">{w.weekNumber}</th>
                ))}
                <th className="pb-1 pl-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td className="max-w-[7.5rem] pr-2">
                    <p className="truncate text-xs font-semibold text-gray-800">{g.name}</p>
                    <p className={`truncate text-[11px] ${g.supportName ? 'text-gray-500' : 'font-semibold text-amber-700'}`}>{g.supportName ?? 'No support'}</p>
                  </td>
                  {weeks.map((w) => {
                    const cell = cellValue(g.id, w.id);
                    const title = `${g.name}, Week ${w.weekNumber}: attendance ${cell.recorded ? 'recorded' : 'not recorded'}, report ${cell.report ? 'submitted' : 'not submitted'}`;
                    return (
                      <td key={w.id} className="px-px">
                        <span className="mx-auto block h-4 w-4 rounded-[4px]" style={{ backgroundColor: CELL[cell.level] }} title={title} aria-label={title} />
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right text-xs font-semibold tabular-nums text-gray-700">{Math.round(g.score * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {weeks.length > 0 && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {CELL.map((color, i) => (
            <span key={color} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
              {CELL_TEXT[i]}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export const ChecklistRow: React.FC<{ done: boolean; label: string; detail?: string; to?: string }> = ({ done, label, detail, to }) => (
  <li className="flex items-center gap-3 py-2.5">
    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
      <StatusIcon status={done ? 'good' : 'neutral'} className="h-3 w-3" />
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block text-sm ${done ? 'text-gray-500' : 'font-medium text-gray-800'}`}>{label}</span>
      {detail && <span className="block text-xs text-gray-500">{detail}</span>}
    </span>
    {!done && to && (
      <NavLink to={to} className="flex-none rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Open</NavLink>
    )}
  </li>
);
