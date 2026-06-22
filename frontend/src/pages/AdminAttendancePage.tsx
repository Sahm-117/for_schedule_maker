import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { attendanceApi, groupsApi, participantsApi } from '../services/api';
import type { AttendanceRecord, AttendanceStatus, Group, Participant, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';

const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  ABSENT: 'bg-red-500',
};

// Read-only status pill shown on each card (admin view is look-only).
const STATUS_PILL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100/80 text-emerald-700',
  LATE: 'bg-amber-100/80 text-amber-700',
  ABSENT: 'bg-red-100/80 text-red-700',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
};

const AdminAttendancePage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // Groups change per cohort, not per week — load once per cohort.
  useEffect(() => {
    if (!activeCohort) { setGroups([]); return; }
    let cancelled = false;
    void groupsApi.getAll({ cohortId: activeCohort.id })
      .then(({ groups: gs }) => { if (!cancelled) setGroups(sortByText(gs, (group) => group.name)); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [activeCohort]);

  useEffect(() => {
    if (cohortWeeks.length === 0) return;
    const selectedStillExists = selectedWeekId !== null && cohortWeeks.some((week) => week.id === selectedWeekId);
    if (!selectedStillExists) {
      setSelectedWeekId(getIdealWeekForCohort(activeCohort, cohortWeeks)?.id ?? cohortWeeks[0].id);
    }
  }, [activeCohort, cohortWeeks, selectedWeekId]);

  const load = useCallback(async () => {
    if (!activeCohort || selectedWeekId === null) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { records: rs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        attendanceApi.getForWeek({ weekId: selectedWeekId }),
      ]);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      const map = new Map<string, AttendanceRecord>();
      rs.forEach((r) => map.set(r.participantId, r));
      setRecords(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, selectedWeekId]);

  useEffect(() => { void load(); }, [load]);

  const handleMark = async (participantId: string, status: AttendanceStatus) => {
    if (selectedWeekId === null) return;
    setSaving((prev) => new Set(prev).add(participantId));
    try {
      const { record } = await attendanceApi.mark(participantId, selectedWeekId, status, user?.id);
      setRecords((prev) => new Map(prev).set(participantId, record));
    } catch { /* ignore */ }
    finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(participantId); return next; });
    }
  };

  const visibleParticipants = useMemo(() => {
    let ps = selectedGroupId ? participants.filter((p) => p.groupId === selectedGroupId) : participants;
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
  }, [participants, selectedGroupId, search]);

  // Mark every still-unmarked visible participant as PRESENT in one batch.
  const handleMarkAllPresent = async () => {
    if (selectedWeekId === null) return;
    const unmarked = visibleParticipants.filter((p) => !records.has(p.id));
    if (unmarked.length === 0) return;
    setBulkSaving(true);
    try {
      const { records: saved } = await attendanceApi.bulkMark(
        unmarked.map((p) => ({ participantId: p.id, weekId: selectedWeekId, status: 'PRESENT' as AttendanceStatus })),
        user?.id,
      );
      setRecords((prev) => {
        const next = new Map(prev);
        saved.forEach((r) => next.set(r.participantId, r));
        return next;
      });
    } catch { /* ignore */ }
    finally { setBulkSaving(false); }
  };

  const summary = useMemo(() => {
    const total = visibleParticipants.length;
    const visibleIds = new Set(visibleParticipants.map((p) => p.id));
    const visibleRecords = [...records.values()].filter((r) => visibleIds.has(r.participantId));
    const present = visibleRecords.filter((r) => r.status === 'PRESENT').length;
    const late = visibleRecords.filter((r) => r.status === 'LATE').length;
    const absent = visibleRecords.filter((r) => r.status === 'ABSENT').length;
    const unmarked = total - (present + late + absent);
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, unmarked, pct };
  }, [visibleParticipants, records]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      ...[...groups]
        .sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name))
        .map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  // Group → assigned support name, so each card can show who supports that
  // participant's group.
  const supportByGroupId = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => { if (g.supportName) map.set(g.id, g.supportName); });
    return map;
  }, [groups]);

  return (
    <div className="page-content">
      <PageHeader
        title="Attendance"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks in this cohort yet.</p>
      ) : (
        <>
          {/* Week selector + group filter */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Week</label>
              <div className="flex flex-wrap gap-2">
                {cohortWeeks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWeekId(w.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
                      selectedWeekId === w.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'
                    }`}
                  >
                    Week {w.weekNumber}
                  </button>
                ))}
              </div>
            </div>
            {groups.length > 0 && (
              <div className="w-full lg:w-64">
                <AppSelect
                  label="Filter by group"
                  value={selectedGroupId}
                  onChange={setSelectedGroupId}
                  options={groupOptions}
                  placeholder="All groups"
                />
                {selectedGroup && (
                  <p className="mt-2 text-xs text-gray-500">
                    Support:{' '}
                    <span className="font-semibold text-gray-700">
                      {selectedGroup.supportName || 'None assigned'}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Search + bulk action */}
          {!loading && visibleParticipants.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
              />
              {summary.unmarked > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllPresent()}
                  disabled={bulkSaving}
                  className="rounded-2xl bg-emerald-100/80 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition active:scale-95 hover:bg-emerald-200/80 disabled:opacity-60"
                >
                  {bulkSaving ? 'Marking…' : `Mark all present (${summary.unmarked})`}
                </button>
              )}
            </div>
          )}

          {/* Summary cards */}
          {!loading && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Present', value: summary.present, cls: 'bg-emerald-100/80 text-emerald-700' },
                { label: 'Late', value: summary.late, cls: 'bg-amber-100/80 text-amber-700' },
                { label: 'Absent', value: summary.absent, cls: 'bg-red-100/80 text-red-700' },
                { label: 'Unmarked', value: summary.unmarked, cls: 'bg-neutral-100 text-neutral-600' },
                { label: 'Attendance', value: `${summary.pct}%`, cls: 'bg-sky-100/80 text-sky-700' },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`rounded-2xl px-4 py-3 ${cls}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <PageLoader />
          ) : visibleParticipants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">{selectedGroupId ? 'No active participants in this group.' : (search.trim() ? 'No participants match your search.' : 'No active participants in this cohort.')}</p>
            </div>
          ) : (
            // Card grid: READ-ONLY for admins. Attendance is support-driven, so
            // the status is shown as a pill (no dropdown to fat-finger) and any
            // change goes through the per-card menu (deliberate action only).
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleParticipants.map((p) => {
                const rec = records.get(p.id);
                const isSaving = saving.has(p.id);
                const status = rec?.status;
                return (
                  <div key={p.id} className="flex items-start justify-between gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm transition hover:bg-orange-50/30">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-gray-900">
                        {status && <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status]}`} />}
                        <span className="truncate">{p.fullName}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">{p.groupName ?? 'No group'}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        Support: <span className="font-medium text-gray-600">{(p.groupId && supportByGroupId.get(p.groupId)) || 'None'}</span>
                      </p>
                      <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status ? STATUS_PILL[status] : 'bg-neutral-100 text-neutral-500'}`}>
                        {isSaving ? 'Saving…' : status ? STATUS_LABEL[status] : 'Not marked'}
                      </span>
                    </div>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Mark present', onClick: () => void handleMark(p.id, 'PRESENT') },
                        { label: 'Mark late', onClick: () => void handleMark(p.id, 'LATE') },
                        { label: 'Mark absent', onClick: () => void handleMark(p.id, 'ABSENT') },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminAttendancePage;
