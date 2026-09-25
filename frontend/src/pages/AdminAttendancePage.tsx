import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ModalShell from '../components/followups/ModalShell';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { attendanceApi, attendanceFollowUpTasksApi, groupsApi, participantsApi } from '../services/api';
import type { AttendanceFollowUpTask, AttendanceRecord, AttendanceSession, AttendanceStatus, Group, Participant, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';
import { sundayMarkAttended } from '../utils/programmeRules';

const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  LEFT_EARLY: 'bg-orange-500',
  ABSENT: 'bg-red-500',
  EXCUSED: 'bg-sky-500',
};

// Read-only status pill shown on each card (admin view is look-only).
const STATUS_PILL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100/80 text-emerald-700',
  LATE: 'bg-amber-100/80 text-amber-700',
  LEFT_EARLY: 'bg-orange-100/80 text-orange-700',
  ABSENT: 'bg-red-100/80 text-red-700',
  EXCUSED: 'bg-sky-100/80 text-sky-700',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  LEFT_EARLY: 'Left early',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
};

const countdownLabel = (closesAt: string, now: number) => {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Closing…';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const AdminAttendancePage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminAttendanceContent />;
};

const AdminAttendanceContent: React.FC = () => {
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [allWeeks, setAllWeeks] = useState(false);
  const [weekSummaries, setWeekSummaries] = useState<Array<{ id: number; number: number; present: number; absent: number; late: number; leftEarly: number; excused: number; sent: boolean }>>([]);
  useEffect(() => {
    if (!allWeeks) return;
    let cancelled = false;
    void Promise.all(cohortWeeks.map(async (week) => {
      const [{ records }, { session }] = await Promise.all([attendanceApi.getForWeek({ weekId: week.id }), attendanceApi.getSession(week.id)]);
      const count = (status: AttendanceStatus) => records.filter((record) => record.status === status).length;
      return { id: week.id, number: week.weekNumber, present: count('PRESENT'), absent: count('ABSENT'), late: count('LATE'), leftEarly: count('LEFT_EARLY'), excused: count('EXCUSED'), sent: !!session?.finalizedAt };
    })).then((rows) => { if (!cancelled) setWeekSummaries(rows); });
    return () => { cancelled = true; };
  }, [allWeeks, cohortWeeks]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [followUpTasks, setFollowUpTasks] = useState<AttendanceFollowUpTask[]>([]);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AttendanceStatus | 'UNMARKED'>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [sessionSaving, setSessionSaving] = useState(false);
  const [startingWindow, setStartingWindow] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [excuseTarget, setExcuseTarget] = useState<{ recordId: string; participantName: string } | null>(null);
  const [excuseNote, setExcuseNote] = useState('');
  const [excuseSaving, setExcuseSaving] = useState(false);
  const [excuseError, setExcuseError] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
      const [{ participants: ps }, { records: rs }, { session: attendanceSession }, { tasks }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        attendanceApi.getForWeek({ weekId: selectedWeekId }),
        attendanceApi.getSession(selectedWeekId),
        attendanceFollowUpTasksApi.getForWeek(selectedWeekId),
      ]);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      const map = new Map<string, AttendanceRecord>();
      rs.forEach((r) => map.set(r.participantId, r));
      setRecords(map);
      setSession(attendanceSession);
      setFollowUpTasks(tasks);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, selectedWeekId]);

  useEffect(() => { void load(); }, [load]);

  const handleMark = async (participantId: string, status: AttendanceStatus) => {
    // Admins can still correct a record after the report is sent (that's the
    // whole point of the appeal flow) -- the RPC/trigger enforce this, not the UI.
    if (selectedWeekId === null) return;
    setSaving((prev) => new Set(prev).add(participantId));
    try {
      const { record } = await attendanceApi.mark(participantId, selectedWeekId, status);
      setRecords((prev) => new Map(prev).set(participantId, record));
    } catch { /* ignore */ }
    finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(participantId); return next; });
    }
  };

  const startAttendance = async () => {
    if (selectedWeekId === null || startingWindow) return;
    setStartingWindow(true);
    try {
      const { session: saved } = await attendanceApi.startWindow(selectedWeekId);
      setSession(saved);
    } catch { /* ignore */ }
    finally { setStartingWindow(false); }
  };

  const openExcuseModal = (participant: Participant) => {
    const record = records.get(participant.id);
    if (!record) return;
    setExcuseTarget({ recordId: record.id, participantName: participant.fullName });
    setExcuseNote('');
    setExcuseError('');
  };

  const submitExcuse = async () => {
    if (!excuseTarget || !excuseNote.trim()) return;
    setExcuseSaving(true);
    setExcuseError('');
    try {
      const { record } = await attendanceApi.excuseLateness(excuseTarget.recordId, excuseNote.trim());
      setRecords((prev) => {
        const next = new Map(prev);
        const existing = [...next.values()].find((r) => r.id === record.id);
        if (existing) next.set(existing.participantId, { ...existing, lateExcused: true, lateExcusedAt: record.lateExcusedAt, lateExcusedById: record.lateExcusedById });
        return next;
      });
      setExcuseTarget(null);
    } catch (err) {
      setExcuseError(err instanceof Error ? err.message : 'Could not save this excusal.');
    } finally {
      setExcuseSaving(false);
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

  // Status filter applies only to the card list (summary tiles keep counting
  // the whole week). 'UNMARKED' = no attendance record for the participant.
  const displayedParticipants = useMemo(() => {
    if (!statusFilter) return visibleParticipants;
    return visibleParticipants.filter((p) => {
      const status = records.get(p.id)?.status;
      return statusFilter === 'UNMARKED' ? !status : status === statusFilter;
    });
  }, [visibleParticipants, statusFilter, records]);

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: 'All statuses' },
      { value: 'PRESENT', label: 'Present' },
      { value: 'LATE', label: 'Late' },
      { value: 'LEFT_EARLY', label: 'Left early' },
      { value: 'ABSENT', label: 'Absent' },
      { value: 'EXCUSED', label: 'Excused' },
      { value: 'UNMARKED', label: 'Unmarked' },
    ],
    []
  );

  const summary = useMemo(() => {
    const total = visibleParticipants.length;
    const visibleIds = new Set(visibleParticipants.map((p) => p.id));
    const visibleRecords = [...records.values()].filter((r) => visibleIds.has(r.participantId));
    const present = visibleRecords.filter((r) => r.status === 'PRESENT').length;
    const late = visibleRecords.filter((r) => r.status === 'LATE').length;
    const leftEarly = visibleRecords.filter((r) => r.status === 'LEFT_EARLY').length;
    const absent = visibleRecords.filter((r) => r.status === 'ABSENT').length;
    const excused = visibleRecords.filter((r) => r.status === 'EXCUSED').length;
    const unmarked = total - (present + late + leftEarly + absent + excused);
    const attended = visibleRecords.filter(sundayMarkAttended).length;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, present, late, leftEarly, absent, excused, unmarked, attended, pct };
  }, [visibleParticipants, records]);

  const allMarked = participants.length > 0 && participants.every((participant) => records.has(participant.id));
  const finalised = !!session?.finalizedAt;
  const autoFinalizeAtNoon = session?.autoFinalizeAtNoon ?? true;
  const openFollowUps = followUpTasks.filter((task) => task.status === 'OPEN').length;
  const doneFollowUps = followUpTasks.filter((task) => task.status === 'DONE').length;
  const absenceCount = [...records.values()].filter((record) => record.status === 'ABSENT').length;
  const unassignedAbsences = Math.max(0, absenceCount - followUpTasks.length);
  const windowClosesAt = session?.closesAt ?? null;
  const windowOpen = !!session?.startedAt && !finalised && !!windowClosesAt && new Date(windowClosesAt).getTime() > now;

  const setAutoFinalize = async (enabled: boolean) => {
    if (selectedWeekId === null) return;
    setSessionSaving(true);
    try {
      const { session: saved } = await attendanceApi.setAutoFinalize(selectedWeekId, enabled);
      setSession(saved);
    } catch { /* keep the prior state */ }
    finally { setSessionSaving(false); }
  };

  const finalise = async () => {
    if (selectedWeekId === null || !allMarked || finalised) return;
    setSessionSaving(true);
    try {
      const { session: saved } = await attendanceApi.finalize(selectedWeekId);
      setSession(saved);
      await load();
    } catch { /* the register may have changed in another browser */ }
    finally { setSessionSaving(false); }
  };

  const reopen = async () => {
    if (selectedWeekId === null || !finalised) return;
    setSessionSaving(true);
    try {
      const { session: saved } = await attendanceApi.reopen(selectedWeekId);
      setSession(saved);
    } catch { /* keep the finalised state if reopening was rejected */ }
    finally { setSessionSaving(false); }
  };

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
                <button type="button" onClick={() => setAllWeeks(true)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${allWeeks ? 'bg-primary text-white' : 'border border-orange-200 bg-white text-gray-600'}`}>All weeks</button>
                {cohortWeeks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { setAllWeeks(false); setSelectedWeekId(w.id); }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
                      !allWeeks && selectedWeekId === w.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'
                    }`}
                  >
                    Week {w.weekNumber}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto">
              <div className="w-full sm:w-48">
                <AppSelect
                  label="Filter by status"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as '' | AttendanceStatus | 'UNMARKED')}
                  options={statusFilterOptions}
                  placeholder="All statuses"
                />
              </div>
              {groups.length > 0 && (
                <div className="w-full sm:w-64">
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
          </div>

          {allWeeks ? <section className="mb-4 overflow-hidden rounded-2xl border border-orange-100 bg-white">{weekSummaries.map((week) => <button key={week.id} type="button" onClick={() => { setSelectedWeekId(week.id); setAllWeeks(false); }} className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-orange-50"><span className="text-sm font-bold">Week {week.number}</span><span className="text-xs text-gray-600">{week.present} present · {week.late} late · {week.leftEarly} left early · {week.absent} absent · {week.excused} excused</span><span className="text-xs font-semibold text-gray-500">{week.sent ? 'Report sent' : 'In progress'} →</span></button>)}</section> : <>
          {/* Search */}
          {!loading && visibleParticipants.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
              />
            </div>
          )}

          <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${finalised ? 'bg-emerald-100 text-emerald-700' : allMarked ? 'bg-sky-100 text-sky-700' : 'bg-neutral-100 text-neutral-600'}`}>{finalised ? 'Report sent' : allMarked ? 'Attendance taken' : `${participants.length - records.size} still unmarked`}</span>
            {!session?.startedAt && !finalised ? (
              <button type="button" onClick={() => void startAttendance()} disabled={startingWindow} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{startingWindow ? 'Starting…' : 'Start attendance'}</button>
            ) : windowOpen && windowClosesAt ? (
              <span className="rounded-full bg-sky-100/80 px-2.5 py-1 text-xs font-bold text-sky-700">Closes in {countdownLabel(windowClosesAt, now)}</span>
            ) : session?.startedAt && !finalised ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">Register closed</span>
            ) : null}
            <button type="button" onClick={() => void setAutoFinalize(!autoFinalizeAtNoon)} disabled={sessionSaving || finalised} className="rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">Auto-finalise at noon: {autoFinalizeAtNoon ? 'On' : 'Off'}</button>
            {finalised ? <button type="button" onClick={() => void reopen()} disabled={sessionSaving} className="ml-auto rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">Reopen</button> : !autoFinalizeAtNoon ? <button type="button" onClick={() => void finalise()} disabled={!allMarked || sessionSaving} className="ml-auto rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Send report</button> : <p className="ml-auto text-xs font-medium text-gray-500">Sends automatically at noon Sunday</p>}
          </section>
          {/* Summary cards */}
          {!loading && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Present', value: summary.present, cls: 'bg-emerald-100/80 text-emerald-700' },
                { label: 'Late', value: summary.late, cls: 'bg-amber-100/80 text-amber-700' },
                { label: 'Left early', value: summary.leftEarly, cls: 'bg-orange-100/80 text-orange-700' },
                { label: 'Absent', value: summary.absent, cls: 'bg-red-100/80 text-red-700' },
                { label: 'Excused', value: summary.excused, cls: 'bg-sky-100/80 text-sky-700' },
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

          {finalised && <section className="mb-4 rounded-2xl border border-[#d9f2e2] bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-gray-900">Attendance results</p><p className="text-sm font-semibold text-emerald-700">{summary.attended} attended · {absenceCount} absent</p></div>
            {absenceCount > 0 && <p className="mt-1.5 text-[13px] text-gray-500">{openFollowUps} follow-up {openFollowUps === 1 ? 'task' : 'tasks'} assigned{doneFollowUps ? ` · ${doneFollowUps} complete` : ''}{unassignedAbsences ? ` · ${unassignedAbsences} need a support assignment` : ''}.</p>}
            {followUpTasks.length > 0 && <div className="mt-3 border-t border-[#e7f5eb] pt-3">
              <button
                type="button"
                onClick={() => setFollowUpOpen((v) => !v)}
                aria-expanded={followUpOpen}
                className="text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-700"
              >
                Follow-up status ({followUpTasks.length}) {followUpOpen ? '▾' : '▸'}
              </button>
              {followUpOpen && <div className="mt-2 space-y-2">
                {followUpTasks.map((task) => {
                  const complete = task.status === 'DONE';
                  return <div key={task.id} className="rounded-xl bg-[#f8faf9] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-sm font-semibold text-gray-900">{task.participantName ?? 'Participant'}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{complete ? 'Done' : 'Waiting'}</span></div>
                    <p className="mt-0.5 text-xs text-gray-500">Assigned to {task.supportName ?? 'support'}</p>
                    {complete && <p className="mt-2 text-xs leading-relaxed text-gray-600">{task.completionNote || 'No absence note recorded.'}</p>}
                  </div>;
                })}
              </div>}
            </div>}
          </section>}

          {loading ? (
            <PageLoader />
          ) : displayedParticipants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">{statusFilter ? 'No participants match this status.' : selectedGroupId ? 'No active participants in this group.' : (search.trim() ? 'No participants match your search.' : 'No active participants in this cohort.')}</p>
            </div>
          ) : (
            // Card grid: READ-ONLY for admins. Attendance is support-driven, so
            // the status is shown as a pill (no dropdown to fat-finger) and any
            // change goes through the per-card menu (deliberate action only).
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedParticipants.map((p) => {
                const rec = records.get(p.id);
                const isSaving = saving.has(p.id);
                const status = rec?.status;
                const excused = !!rec?.lateExcused && (status === 'LATE' || status === 'LEFT_EARLY');
                const pillCls = excused ? 'bg-emerald-100/80 text-emerald-700' : status ? STATUS_PILL[status] : 'bg-neutral-100 text-neutral-500';
                const pillLabel = isSaving ? 'Saving…' : status ? (excused ? `${STATUS_LABEL[status]} · excused` : STATUS_LABEL[status]) : 'Not marked';
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
                      <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillCls}`}>
                        {pillLabel}
                      </span>
                    </div>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Mark present', onClick: () => void handleMark(p.id, 'PRESENT') },
                        { label: 'Mark late', onClick: () => void handleMark(p.id, 'LATE') },
                        { label: 'Mark left early', onClick: () => void handleMark(p.id, 'LEFT_EARLY') },
                        { label: 'Mark absent', onClick: () => void handleMark(p.id, 'ABSENT') },
                        { label: 'Mark excused', onClick: () => void handleMark(p.id, 'EXCUSED') },
                        ...((status === 'LATE' || status === 'LEFT_EARLY') && !excused
                          ? [{ label: 'Excuse lateness (appeal)', onClick: () => openExcuseModal(p) }]
                          : []),
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          )}
          </>}
        </>
      )}
      <ModalShell
        isOpen={!!excuseTarget}
        onClose={() => { if (!excuseSaving) setExcuseTarget(null); }}
        title="Excuse lateness"
        subtitle={excuseTarget ? `${excuseTarget.participantName} · this note is admin-only.` : undefined}
        footer={(
          <>
            <button type="button" onClick={() => setExcuseTarget(null)} disabled={excuseSaving} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void submitExcuse()} disabled={excuseSaving || !excuseNote.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{excuseSaving ? 'Saving…' : 'Excuse lateness'}</button>
          </>
        )}
      >
        <textarea
          value={excuseNote}
          onChange={(e) => setExcuseNote(e.target.value)}
          rows={3}
          placeholder="Why is this being excused? (required)"
          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          autoFocus
        />
        {excuseError && <p className="mt-2 text-sm text-red-600">{excuseError}</p>}
      </ModalShell>
    </div>
  );
};

export default AdminAttendancePage;
