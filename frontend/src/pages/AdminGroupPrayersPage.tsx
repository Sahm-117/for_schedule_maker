import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupPrayerFocusApi, groupPrayerStatusApi, groupsApi } from '../services/api';
import type { Group, GroupPrayerFocus, GroupPrayerStatus, Week } from '../types';

const AdminGroupPrayersPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [groups, setGroups] = useState<Group[]>([]);
  const [focuses, setFocuses] = useState<GroupPrayerFocus[]>([]);
  const [statuses, setStatuses] = useState<GroupPrayerStatus[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ groups: gs }, { focuses: fs }, { statuses: ss }] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id }),
        groupPrayerFocusApi.getForCohort(activeCohort.id),
        groupPrayerStatusApi.getForCohort(activeCohort.id),
      ]);
      setGroups(gs);
      setFocuses(fs);
      setStatuses(ss);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load]);

  // Fast lookup: `${groupId}:${weekId}` -> done
  const doneMap = useMemo(() => {
    const map = new Map<string, boolean>();
    statuses.forEach((s) => map.set(`${s.groupId}:${s.weekId}`, s.done));
    return map;
  }, [statuses]);

  const isDone = (groupId: string, weekId: number) => doneMap.get(`${groupId}:${weekId}`) === true;

  const focusMap = useMemo(() => {
    const map = new Map<string, GroupPrayerFocus>();
    focuses.forEach((focus) => map.set(`${focus.groupId}:${focus.weekId}`, focus));
    return map;
  }, [focuses]);

  const getFocus = (groupId: string, weekId: number) => focusMap.get(`${groupId}:${weekId}`) ?? null;

  const visibleGroups = useMemo(
    () => (selectedGroupId ? groups.filter((g) => g.id === selectedGroupId) : groups),
    [groups, selectedGroupId]
  );

  // Trend: per week, count of groups marked done out of all groups
  const trend = useMemo(
    () => cohortWeeks.map((w) => ({
      weekId: w.id,
      weekNumber: w.weekNumber,
      done: groups.filter((g) => isDone(g.id, w.id)).length,
      total: groups.length,
    })),
    [cohortWeeks, groups, doneMap]
  );

  const groupOptions = useMemo(
    () => [{ value: '', label: 'All groups' }, ...groups.map((g) => ({ value: g.id, label: g.name }))],
    [groups]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Group prayers"
        subtitle={activeCohort ? `${activeCohort.name} · Weekly focus and completion` : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks in this cohort yet.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No groups in this cohort yet.</p>
          <p className="mt-1 text-xs text-gray-400">Create groups and assign supports to track prayer completion.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Trend strip */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Weekly trend</p>
            <div className="flex flex-wrap gap-2">
              {trend.map((t) => {
                const all = t.total > 0 && t.done === t.total;
                const none = t.done === 0;
                const cls = all
                  ? 'bg-emerald-100/80 text-emerald-700'
                  : none
                    ? 'bg-neutral-100 text-neutral-600'
                    : 'bg-amber-100/80 text-amber-700';
                return (
                  <div key={t.weekId} className={`rounded-2xl px-4 py-2 ${cls}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Week {t.weekNumber}</p>
                    <p className="mt-0.5 text-lg font-bold">{t.done}/{t.total}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group filter */}
          <div className="max-w-xs">
            <AppSelect
              label="Filter by group"
              value={selectedGroupId}
              onChange={setSelectedGroupId}
              options={groupOptions}
              placeholder="All groups"
            />
          </div>

          {/* Status grid */}
          <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-orange-100 bg-orange-50/60">
                  <th className="sticky left-0 z-10 bg-orange-50/60 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                  {cohortWeeks.map((w) => (
                    <th key={w.id} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Week {w.weekNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50">
                {visibleGroups.map((g) => (
                  <tr key={g.id} className="hover:bg-orange-50/30">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {g.name}
                      {g.supportName && <span className="ml-2 text-xs text-gray-400">{g.supportName}</span>}
                    </td>
                    {cohortWeeks.map((w) => {
                      const done = isDone(g.id, w.id);
                      const focus = getFocus(g.id, w.id);
                      return (
                        <td key={w.id} className="px-4 py-3 text-center">
                          <div className="flex min-w-[120px] flex-col items-center gap-1">
                            <span className="text-xs font-semibold text-gray-800">
                              {focus?.participantName || '—'}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              done ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {done ? 'Done' : 'Not done'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGroupPrayersPage;
