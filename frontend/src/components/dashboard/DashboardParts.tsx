import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import type { AttentionItem, GroupEngagement, HealthStatus } from './healthModel';
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
      <div className="flex flex-col items-start gap-2">
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
        {visible.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label} <span className="font-semibold tabular-nums text-gray-800">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const AttentionList: React.FC<{ items: AttentionItem[]; onAction: (item: AttentionItem) => void }> = ({ items, onAction }) => {
  const [showAll, setShowAll] = useState(false);
  const preview = items.slice(0, 4);
  const renderItems = (entries: AttentionItem[], closeAfterAction = false) => (
    <ul className="divide-y divide-gray-100">
      {entries.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-2.5">
            <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-white ${STATUS_DOT[item.status]}`} title={STATUS_LABEL[item.status]}>
              <StatusIcon status={item.status} className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 text-sm text-gray-800">{item.text}</span>
            {item.to ? (
              <NavLink to={item.to} onClick={() => closeAfterAction && setShowAll(false)} className="flex-none rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">{item.actionLabel}</NavLink>
            ) : (
              <button type="button" onClick={() => { if (closeAfterAction) setShowAll(false); onAction(item); }} className="flex-none rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">{item.actionLabel}</button>
            )}
          </li>
      ))}
    </ul>
  );

  return <>
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
      ) : <>
        {renderItems(preview)}
        {items.length > preview.length && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-semibold text-primary hover:text-primary-dark">
            + {items.length - preview.length} more issues
          </button>
        )}
      </>}
    </section>
    {showAll && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="attention-panel-title">
        <button type="button" aria-label="Close needs attention panel" onClick={() => setShowAll(false)} className="absolute inset-0 cursor-default bg-slate-950/30" />
        <aside className="relative flex h-full w-full max-w-[28rem] flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 id="attention-panel-title" className="text-lg font-bold text-gray-900">Needs attention</h2>
              <p className="mt-0.5 text-sm text-gray-500">{items.length} open issues</p>
            </div>
            <button type="button" onClick={() => setShowAll(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 text-xl leading-none text-gray-500 hover:bg-gray-50">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">{renderItems(items, true)}</div>
        </aside>
      </div>, document.body,
    )}
  </>;
};

export const GroupHeatGrid: React.FC<{
  groups: GroupEngagement[];
  weekNumbers: number[];
}> = ({ groups, weekNumbers }) => {
  const submitted = groups.reduce((sum, g) => sum + g.reportsSubmitted, 0);
  const expected = groups.reduce((sum, g) => sum + g.weeksCounted, 0);
  const behind = groups.filter((g) => g.score < 1).length;

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Group meeting reports</h3>
        <NavLink to="/group-prayers" className="text-xs font-semibold text-primary hover:text-primary-dark">See all</NavLink>
      </div>
      <p className="mb-4 text-xs text-gray-500">Completed weeks · outstanding first.</p>

      {weekNumbers.length === 0 || groups.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No finished weeks to judge yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{submitted}/{expected}</p>
            <p className="text-xs text-gray-500">Reports submitted</p>
          </div>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${behind > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{behind}</p>
            <p className="text-xs text-gray-500">{behind === 1 ? 'group behind' : 'groups behind'}</p>
          </div>
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
