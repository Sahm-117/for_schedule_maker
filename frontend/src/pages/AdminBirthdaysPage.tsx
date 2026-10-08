import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppSelect from '../components/AppSelect';
import FilterBar, { type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import Spinner from '../components/Spinner';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { birthdaysApi } from '../services/api';
import type { BirthdayList, BirthdayPerson } from '../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

const countdown = (days: number): string => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
};

// "Birthday is on the 19th", and the month too when it isn't this month.
const dateLine = (p: BirthdayPerson, todayMonth: number): string =>
  `Birthday is on the ${ordinal(p.day)}${p.month === todayMonth ? '' : ` of ${MONTHS[p.month - 1]}`}`;

const pillTone = (days: number): string => {
  if (days <= 2) return 'bg-primary text-white';
  if (days <= 7) return 'bg-[#fff1e6] text-[#9a4a12]';
  return 'bg-gray-100 text-gray-600';
};

const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const GROUPS: Array<{ label: string; test: (d: number) => boolean }> = [
  { label: 'This week', test: (d) => d <= 7 },
  { label: 'Next 30 days', test: (d) => d > 7 && d <= 30 },
  { label: 'Later', test: (d) => d > 30 },
];

const AdminBirthdaysPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, cohorts } = useAppData();
  const [cohortId, setCohortId] = useState<string>('');
  const [search, setSearch] = useState('');
  // Filter choices (see FilterBar): birthday month and how soon; several of each at once.
  const [filters, setFilters] = useState<FilterValues>({});
  const [tab, setTab] = useState<'supports' | 'participants'>('supports');
  const [data, setData] = useState<BirthdayList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Start on the cohort being worked in; "All cohorts" is one tap away.
  useEffect(() => { if (activeCohort?.id) setCohortId((prev) => prev || activeCohort.id); }, [activeCohort?.id]);

  const load = useCallback(async () => {
    try {
      setData(await birthdaysApi.list(cohortId || null));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load birthdays.');
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const cohortOptions = useMemo(
    () => [{ value: '', label: 'All cohorts' }, ...cohorts.filter((c) => !c.isPractice).map((c) => ({ value: c.id, label: c.name }))],
    [cohorts],
  );


  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const all = data ? (tab === 'supports' ? data.supports : data.participants) : [];
  const needle = search.trim().toLowerCase();
  const fits = (key: string, choice: string, p: (typeof all)[number]) => (key === 'month' ? p.month === Number(choice) : GROUPS.find((g) => g.label === choice)?.test(p.daysUntil) ?? false);
  const list = all.filter((p) => (!needle || p.name.toLowerCase().includes(needle)) && Object.entries(filters).every(([key, choices]) => choices.length === 0 || choices.some((c) => fits(key, c, p))));
  const filtering = !!needle || Object.values(filters).some((c) => c.length > 0);
  const filterGroups: FilterGroup[] = [
    { key: 'when', label: 'How soon', options: GROUPS.map((g) => ({ value: g.label, label: g.label, count: all.filter((p) => fits('when', g.label, p)).length })) },
    { key: 'month', label: 'Month', options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m, count: all.filter((p) => fits('month', String(i + 1), p)).length })) },
  ];
  const missing = data ? (tab === 'supports' ? data.missing.supports : data.missing.participants) : 0;
  const todayMonth = data ? Number(data.today.slice(5, 7)) : 0;

  return (
    <div>
      <PageHeader title="Birthdays" subtitle="Who is celebrating next, nearest first." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedTabs
          tabs={[
            { key: 'supports', label: `Supports${data ? ` (${data.supports.length})` : ''}` },
            { key: 'participants', label: `Participants${data ? ` (${data.participants.length})` : ''}` },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'supports' | 'participants')}
          className="sm:max-w-sm sm:flex-1"
        />
        <div className="sm:w-56">
          <AppSelect value={cohortId} onChange={setCohortId} options={cohortOptions} placeholder="All cohorts" compact />
        </div>
      </div>
      <div className="mb-4">
        <FilterBar
          groups={filterGroups}
          value={filters}
          onChange={setFilters}
          search={
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === 'supports' ? 'supports' : 'participants'} by name`}
              aria-label="Search by name"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-[11px] text-sm shadow-[0_2px_10px_-4px_rgba(17,24,39,0.08)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          }
          searching={!!needle}
          onClear={() => setSearch('')}
          shown={list.length}
          total={all.length}
          noun={tab === 'supports' ? 'supports' : 'participants'}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : (
        <>
          {list.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-gray-500">{filtering ? 'No one matches that search.' : 'No birthdays on file for this view yet.'}</p>
          ) : (
            <div className="space-y-5">
              {GROUPS.map((group) => {
                const rows = list.filter((p) => group.test(p.daysUntil));
                if (rows.length === 0) return null;
                return (
                  <section key={group.label}>
                    <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
                    <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.12)]">
                      {rows.map((p) => (
                        <li key={`${tab}-${p.id}`} className="flex items-center gap-3 px-4 py-3">
                          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#fff1e6] text-[13px] font-bold text-[#9a4a12]">{initials(p.name)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] font-semibold text-gray-900">{p.name}</p>
                            <p className="text-[13px] text-gray-500">{dateLine(p, todayMonth)}</p>
                            {p.cohorts.length > 0 && <p className="truncate text-[11.5px] text-gray-400">{p.cohorts.slice(0, 2).join(' · ')}</p>}
                          </div>
                          <span className={`flex-none rounded-full px-3 py-1 text-[12px] font-semibold ${pillTone(p.daysUntil)}`}>{countdown(p.daysUntil)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
          {missing > 0 && (
            <p className="mt-4 px-1 text-[12.5px] text-gray-400">
              {missing} {tab === 'supports' ? (missing === 1 ? 'support has' : 'supports have') : (missing === 1 ? 'participant has' : 'participants have')} no birthday on file yet.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminBirthdaysPage;
