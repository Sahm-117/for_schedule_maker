import React, { useState } from 'react';
import AppSelect from '../AppSelect';

// Search and filters for a group's discussion: words, person, mine, unreplied and a date range.

export type DiscussionRange = 'any' | 'today' | '3d' | '7d' | 'custom';

export interface DiscussionFilterState {
  q: string;
  /** `${kind}:${id}` of one person; '' = everyone. */
  person: string;
  mine: boolean;
  unreplied: boolean;
  range: DiscussionRange;
  /** Custom range, YYYY-MM-DD (either end can be empty). */
  from: string;
  to: string;
}

export const EMPTY_DISCUSSION_FILTERS: DiscussionFilterState = { q: '', person: '', mine: false, unreplied: false, range: 'any', from: '', to: '' };

/** How many filters are on (the search words count as one). */
export const countDiscussionFilters = (f: DiscussionFilterState): number =>
  (f.q.trim() ? 1 : 0) + (f.person ? 1 : 0) + (f.mine ? 1 : 0) + (f.unreplied ? 1 : 0) + (f.range !== 'any' ? 1 : 0);

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** The time window a range stands for, in the viewer's own day boundaries. Null ends are open. */
export const discussionRangeBounds = (f: DiscussionFilterState): { from: number | null; to: number | null } => {
  const today = startOfDay(new Date());
  const daysBack = (n: number) => { const x = new Date(today); x.setDate(x.getDate() - n); return x.getTime(); };
  if (f.range === 'today') return { from: today.getTime(), to: null };
  if (f.range === '3d') return { from: daysBack(2), to: null };
  if (f.range === '7d') return { from: daysBack(6), to: null };
  if (f.range === 'custom') {
    const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
    const to = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;
    return { from: from !== null && !Number.isNaN(from) ? from : null, to: to !== null && !Number.isNaN(to) ? to : null };
  }
  return { from: null, to: null };
};

const RANGES: Array<{ value: DiscussionRange; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
];

const chip = (on: boolean) => `min-h-[34px] rounded-full px-3.5 text-[13px] font-semibold ${on ? 'bg-primary text-white' : 'bg-[#f2f2f4] text-gray-700'}`;
const DATE_INPUT = 'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

interface DiscussionFiltersBarProps {
  value: DiscussionFilterState;
  onChange: (next: DiscussionFilterState) => void;
  people: Array<{ value: string; label: string; meta?: string }>;
  /** Shown under the bar while filters are on, e.g. "3 of 40 messages". */
  summary?: string;
  /** Older messages are still being searched. */
  searching?: boolean;
}

const DiscussionFiltersBar: React.FC<DiscussionFiltersBarProps> = ({ value, onChange, people, summary, searching }) => {
  const [open, setOpen] = useState(false);
  const active = countDiscussionFilters(value);
  const set = (patch: Partial<DiscussionFilterState>) => onChange({ ...value, ...patch });
  // The search words are on the bar itself, so the badge on the button counts only what is inside the panel.
  const inPanel = active - (value.q.trim() ? 1 : 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" /></svg>
          <input
            type="search"
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search messages"
            aria-label="Search messages"
            className="h-10 w-full rounded-full border border-gray-200 bg-white pl-10 pr-3 text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Filters"
          className={`relative grid h-10 w-10 flex-none place-items-center rounded-full border ${open || inPanel > 0 ? 'border-primary/40 bg-primary/10 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6h18M7 12h10M10 18h4" /></svg>
          {inPanel > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{inPanel}</span>}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)]">
          <AppSelect
            label="Person"
            value={value.person}
            onChange={(person) => set({ person })}
            options={[{ value: '', label: 'Everyone' }, ...people]}
            placeholder="Everyone"
            compact
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={value.unreplied} onClick={() => set({ unreplied: !value.unreplied })} className={chip(value.unreplied)}>Unreplied</button>
            <button type="button" aria-pressed={value.mine} onClick={() => set({ mine: !value.mine })} className={chip(value.mine)}>Mine</button>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-gray-500">Date</p>
            <div className="flex flex-wrap gap-2">
              {RANGES.map((range) => (
                <button key={range.value} type="button" aria-pressed={value.range === range.value} onClick={() => set({ range: range.value })} className={chip(value.range === range.value)}>{range.label}</button>
              ))}
            </div>
            {value.range === 'custom' && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <label className="text-[12px] font-semibold text-gray-500">From
                  <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} className={`${DATE_INPUT} mt-1`} />
                </label>
                <label className="text-[12px] font-semibold text-gray-500">To
                  <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className={`${DATE_INPUT} mt-1`} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {active > 0 && (
        <div className="flex items-center justify-between gap-3 px-1 text-[12.5px] text-gray-500">
          <span>{searching ? 'Searching older messages…' : summary}</span>
          <button type="button" onClick={() => onChange(EMPTY_DISCUSSION_FILTERS)} className="flex-none font-semibold text-primary">Clear</button>
        </div>
      )}
    </div>
  );
};

export default DiscussionFiltersBar;
