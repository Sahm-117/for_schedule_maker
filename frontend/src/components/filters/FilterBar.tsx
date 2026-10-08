import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

// One compact filter control for list pages, the same as Follow-ups: a Filters button with a badge, a sheet of
// chips where each group takes several choices at once, the chosen filters as removable chips, and a line saying
// how many are shown ("Showing 24 of 77 participants"), so nobody has to count by hand. Within a group a row
// matches if it fits ANY chosen choice; across groups it must fit every group that has a choice.

export interface FilterOption {
  value: string;
  label: string;
  /** How many rows this choice would match, shown on the chip. */
  count?: number;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  /** One line under the group's name. */
  hint?: string;
}

/** The chosen values, by group key. */
export type FilterValues = Record<string, string[]>;

/** A yes/no switch shown in the sheet (and as a chip while it is on). */
export interface FilterToggle {
  key: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  count?: number;
  /** What the switch does, one line. */
  hint?: string;
}

const pillBtn = (active: boolean, dim: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
    active ? 'bg-primary text-white shadow-sm' : `border border-gray-100 bg-white hover:bg-gray-50 ${dim ? 'text-gray-300' : 'text-gray-600'}`
  }`;

const FilterIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full" aria-hidden="true">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);

/** How many choices (and switches) are on, for the badge. */
export const countActiveFilters = (value: FilterValues, toggles: FilterToggle[] = []): number =>
  Object.values(value).reduce((n, list) => n + list.length, 0) + toggles.filter((t) => t.value).length;

/** Match helper: true when `choices` is empty or contains `candidate`. */
export const matchesAny = (choices: string[] | undefined, ...candidates: Array<string | null | undefined>): boolean =>
  !choices || choices.length === 0 || candidates.some((c) => c !== null && c !== undefined && choices.includes(c));

const FilterBar: React.FC<{
  groups: FilterGroup[];
  value: FilterValues;
  onChange: (next: FilterValues) => void;
  toggles?: FilterToggle[];
  /** The search box, if the page has one; it sits on the same row as the Filters button. */
  search?: React.ReactNode;
  /** Whether a search is typed, so the count line shows "Showing …" for it too. */
  searching?: boolean;
  /** Extra buttons on the same row. */
  extra?: React.ReactNode;
  shown: number;
  total: number;
  /** Plural noun for the count line, e.g. "participants". */
  noun: string;
  /** Called after Clear, for anything the page keeps outside the groups (e.g. a search box). */
  onClear?: () => void;
  title?: string;
}> = ({ groups, value, onChange, toggles = [], search, searching = false, extra, shown, total, noun, onClear, title = 'Filters' }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(value);
  const [draftToggles, setDraftToggles] = useState<Record<string, boolean>>({});

  const activeCount = countActiveFilters(value, toggles);
  const filtered = activeCount > 0 || searching;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const openSheet = () => {
    setDraft({ ...value });
    setDraftToggles(Object.fromEntries(toggles.map((t) => [t.key, t.value])));
    setOpen(true);
  };
  const toggleChoice = (group: string, choice: string) =>
    setDraft((prev) => {
      const list = prev[group] ?? [];
      return { ...prev, [group]: list.includes(choice) ? list.filter((v) => v !== choice) : [...list, choice] };
    });
  const apply = () => {
    onChange({ ...draft });
    toggles.forEach((t) => { if ((draftToggles[t.key] ?? t.value) !== t.value) t.onChange(draftToggles[t.key] ?? t.value); });
    setOpen(false);
  };
  const clear = () => {
    onChange({});
    toggles.forEach((t) => { if (t.value) t.onChange(false); });
    onClear?.();
    setOpen(false);
  };

  const chips = useMemo(
    () => [
      ...groups.flatMap((g) => (value[g.key] ?? []).map((v) => ({
        id: `${g.key}:${v}`,
        label: g.options.find((o) => o.value === v)?.label ?? v,
        remove: () => onChange({ ...value, [g.key]: (value[g.key] ?? []).filter((x) => x !== v) }),
      }))),
      ...toggles.filter((t) => t.value).map((t) => ({ id: `toggle:${t.key}`, label: t.label, remove: () => t.onChange(false) })),
    ],
    [groups, value, toggles, onChange],
  );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {search && <div className="min-w-0 sm:max-w-md sm:flex-1">{search}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSheet}
            aria-haspopup="dialog"
            className={`relative inline-flex h-[44px] flex-none items-center gap-2 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-[0_2px_10px_-4px_rgba(17,24,39,0.08)] transition hover:bg-gray-50 active:scale-95 ${activeCount > 0 ? 'border-primary/40 text-primary' : 'border-gray-200 text-gray-600'}`}
          >
            <span className="h-[18px] w-[18px]">{FilterIcon}</span>
            {title}
            {activeCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                {activeCount}
              </span>
            )}
          </button>
          {extra}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.remove}
              title={`Clear ${chip.label}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#3f4757] py-1.5 pl-3 pr-2 text-xs font-semibold text-white transition hover:bg-[#333a49] active:scale-95"
            >
              {chip.label}
              <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full bg-white/20 text-[10px] leading-none">×</span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 px-0.5 text-xs text-gray-500" aria-live="polite">
        {filtered
          ? <>Showing <b className="font-semibold text-gray-800">{shown}</b> of {total} {noun}</>
          : <>{total} {noun}</>}
      </p>

      {open && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/35" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] bg-white p-6 pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:rounded-[28px]">
            <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</p>
                  {group.hint && <p className="mb-2 text-[11px] text-gray-400">{group.hint}</p>}
                  <div className={`flex flex-wrap gap-1.5 ${group.hint ? '' : 'mt-2'}`}>
                    {group.options.map((opt) => {
                      const on = (draft[group.key] ?? []).includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleChoice(group.key, opt.value)}
                          className={pillBtn(on, opt.count === 0)}
                        >
                          {opt.label}{opt.count !== undefined && <span className={`ml-1.5 tabular-nums ${on ? 'text-white/80' : 'text-gray-400'}`}>{opt.count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {toggles.map((t) => {
                const on = draftToggles[t.key] ?? t.value;
                return (
                  <div key={t.key} className="flex items-center justify-between gap-3 rounded-2xl bg-primary/5 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-700">{t.label}{t.count !== undefined && <span className="ml-1.5 tabular-nums text-gray-400">{t.count}</span>}</span>
                      {t.hint && <span className="block text-[11px] text-gray-500">{t.hint}</span>}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={t.label}
                      onClick={() => setDraftToggles((prev) => ({ ...prev, [t.key]: !on }))}
                      className={`relative h-6 w-11 flex-none rounded-full transition ${on ? 'bg-primary' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${on ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={clear} className="flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 active:scale-[0.98]">
                Clear filters
              </button>
              <button type="button" onClick={apply} className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark active:scale-[0.98]">
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default FilterBar;
