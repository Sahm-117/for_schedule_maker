import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useToast } from '../components/Toast';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { attendanceApi, participantsApi } from '../services/api';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, Participant, User, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';
import Spinner from '../components/Spinner';

const STATUS_BUTTONS: Array<{ status: AttendanceStatus; label: string; activeCls: string }> = [
  { status: 'PRESENT', label: 'Present', activeCls: 'bg-emerald-100 text-emerald-700' },
  { status: 'ABSENT', label: 'Absent', activeCls: 'bg-red-100 text-red-700' },
  { status: 'LATE', label: 'Late', activeCls: 'bg-amber-100 text-amber-700' },
  { status: 'LEFT_EARLY', label: 'Left early', activeCls: 'bg-orange-100 text-orange-700' },
  { status: 'EXCUSED', label: 'Excused', activeCls: 'bg-sky-100 text-sky-700' },
];

// Once the register is locked (closed or finalised), a support can only move
// an Absent mark to Late or Left early -- everything else needs an admin.
const allowedWhenLocked = (current: AttendanceStatus | undefined, next: AttendanceStatus) =>
  current === 'ABSENT' && (next === 'LATE' || next === 'LEFT_EARLY');

const countdownLabel = (closesAt: string, now: number) => {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Closing…';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const DEFAULT_SESSION: AttendanceSession = { weekId: 0, autoFinalizeAtNoon: true, finalizedAt: null };
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
type AttendanceWeekResult = {
  week: Week;
  total: number;
  marked: number;
  present: number;
  absent: number;
  late: number;
  leftEarly: number;
  excused: number;
  session: AttendanceSession | null;
};

const SupportAttendancePage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;
  return <SupportAttendanceContent user={user} />;
};

const SupportAttendanceContent: React.FC<{ user: User }> = ({ user }) => {
  const { activeCohort, weeks } = useAppData();
  const toast = useToast();
  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((week) => week.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [activeCohort, weeks]
  );
  const [selectedWeekId, setSelectedWeekId] = useState<number | 'ALL' | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [weekResults, setWeekResults] = useState<AttendanceWeekResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Map<string, AttendanceStatus>>(new Map());
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (cohortWeeks.length === 0) return;
    if (selectedWeekId !== 'ALL' && (!selectedWeekId || !cohortWeeks.some((week) => week.id === selectedWeekId))) {
      setSelectedWeekId(getIdealWeekForCohort(activeCohort, cohortWeeks)?.id ?? cohortWeeks[0].id);
    }
  }, [activeCohort, cohortWeeks, selectedWeekId]);

  const load = useCallback(async (silent = false) => {
    if (!activeCohort || !selectedWeekId) { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      if (selectedWeekId === 'ALL') {
        const { participants: people } = await participantsApi.getAll({ cohortId: activeCohort.id });
        const activePeople = sortByText(people.filter((person) => person.status === 'ACTIVE'), (person) => person.fullName);
        const results = await Promise.all(cohortWeeks.map(async (week) => {
          const [{ records: saved }, { session: attendanceSession }] = await Promise.all([
            attendanceApi.getForWeek({ weekId: week.id }),
            attendanceApi.getSession(week.id),
          ]);
          const count = (status: AttendanceStatus) => saved.filter((record) => record.status === status).length;
          return { week, total: activePeople.length, marked: saved.length, present: count('PRESENT'), absent: count('ABSENT'), late: count('LATE'), leftEarly: count('LEFT_EARLY'), excused: count('EXCUSED'), session: attendanceSession };
        }));
        setParticipants(activePeople);
        setWeekResults(results);
        setRecords(new Map());
        setSession(null);
        return;
      }
      const [{ participants: people }, { records: saved }, { session: attendanceSession }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        attendanceApi.getForWeek({ weekId: selectedWeekId }),
        attendanceApi.getSession(selectedWeekId),
      ]);
      setParticipants(sortByText(people.filter((person) => person.status === 'ACTIVE'), (person) => person.fullName));
      setRecords(new Map(saved.map((record) => [record.participantId, record])));
      setSession(attendanceSession);
      setWeekResults([]);
    } catch {
      if (!silent) toast({ tone: 'error', message: 'Couldn’t load attendance. Try again.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeCohort, selectedWeekId, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const allWeeks = selectedWeekId === 'ALL';
  const selectedWeek = typeof selectedWeekId === 'number' ? cohortWeeks.find((week) => week.id === selectedWeekId) ?? null : null;
  const activeSession = session ?? { ...DEFAULT_SESSION, weekId: typeof selectedWeekId === 'number' ? selectedWeekId : 0 };
  const finalised = !!activeSession.finalizedAt;
  const windowClosesAt = activeSession.closesAt ?? null;
  const windowClosed = !!windowClosesAt && new Date(windowClosesAt).getTime() <= now;
  const windowOpen = !!activeSession.startedAt && !finalised && !windowClosed;
  const locked = finalised || windowClosed;
  const markedCount = participants.filter((participant) => records.has(participant.id)).length;
  const allMarked = participants.length > 0 && markedCount === participants.length;
  const summary = useMemo(() => {
    const values = Array.from(records.values());
    const count = (status: AttendanceStatus) => values.filter((record) => record.status === status).length;
    return { present: count('PRESENT'), absent: count('ABSENT'), late: count('LATE'), leftEarly: count('LEFT_EARLY'), excused: count('EXCUSED') };
  }, [records]);

  const startAttendance = async () => {
    if (typeof selectedWeekId !== 'number' || starting) return;
    setStarting(true);
    try {
      const { session: saved } = await attendanceApi.startWindow(selectedWeekId);
      setSession(saved);
    } catch (error) {
      toast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not start attendance.' });
    } finally {
      setStarting(false);
    }
  };

  const groupOptions = useMemo(() => {
    const names = new Map<string, string>();
    participants.forEach((participant) => { if (participant.groupId && participant.groupName) names.set(participant.groupId, participant.groupName); });
    return [
      { value: '', label: 'All groups' },
      ...Array.from(names, ([value, label]) => ({ value, label }))
        .sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.label, b.label)),
    ];
  }, [participants]);

  const visibleParticipants = useMemo(() => {
    let ps = selectedGroupId ? participants.filter((p) => p.groupId === selectedGroupId) : participants;
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
    }
    return ps;
  }, [participants, selectedGroupId, search]);

  const mark = async (participant: Participant, status: AttendanceStatus) => {
    if (typeof selectedWeekId !== 'number' || saving.has(participant.id)) return;
    if (locked && !allowedWhenLocked(records.get(participant.id)?.status, status)) return;
    const previous = records.get(participant.id);
    setSaving((current) => new Map(current).set(participant.id, status));
    setRecords((current) => new Map(current).set(participant.id, {
      id: previous?.id ?? `pending-${participant.id}`,
      participantId: participant.id,
      weekId: selectedWeekId,
      status,
      markedById: user.id,
      markedAt: new Date().toISOString(),
    }));
    try {
      const { record } = await attendanceApi.mark(participant.id, selectedWeekId, status);
      setRecords((current) => new Map(current).set(participant.id, record));
    } catch (error) {
      setRecords((current) => {
        const next = new Map(current);
        if (previous) next.set(participant.id, previous);
        else next.delete(participant.id);
        return next;
      });
      toast({ tone: 'error', message: error instanceof Error ? error.message : `Couldn’t save ${participant.fullName}.` });
    } finally {
      setSaving((current) => { const next = new Map(current); next.delete(participant.id); return next; });
    }
  };

  return (
    <div className="page-content max-w-4xl">
      <PageHeader title="Attendance" subtitle={allWeeks ? 'Attendance results for this cohort' : selectedWeek ? `Week ${selectedWeek.weekNumber} · everyone in ${activeCohort?.name ?? 'this cohort'}` : 'Everyone in this cohort'} />
      {!activeCohort ? <p className="text-sm text-gray-500">Choose a cohort first.</p> : cohortWeeks.length === 0 ? <p className="text-sm text-gray-500">No weeks are set up yet.</p> : (
        <>
          <section className="mb-4 rounded-[20px] border border-[#ffdeca] bg-white p-4 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[10rem] flex-1 sm:max-w-xs"><AppSelect value={selectedWeekId === 'ALL' ? 'ALL' : selectedWeekId ? String(selectedWeekId) : ''} onChange={(value) => setSelectedWeekId(value === 'ALL' ? 'ALL' : Number(value))} options={[{ value: 'ALL', label: 'All weeks' }, ...cohortWeeks.map((week) => ({ value: String(week.id), label: `Week ${week.weekNumber}` }))]} placeholder="Choose week" compact /></div>
              {!allWeeks && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${finalised ? 'bg-emerald-100 text-emerald-700' : allMarked ? 'bg-sky-100 text-sky-700' : 'bg-neutral-100 text-neutral-600'}`}>{finalised ? 'Report sent' : `${markedCount} of ${participants.length} marked`}</span>}
              {!allWeeks && !activeSession.startedAt && !finalised && (
                <button type="button" onClick={() => void startAttendance()} disabled={starting} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{starting ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Starting…</span>) : 'Start attendance'}</button>
              )}
              {!allWeeks && windowOpen && windowClosesAt && (
                <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-700">Closes in {countdownLabel(windowClosesAt, now)}</span>
              )}
              {!allWeeks && windowClosed && !finalised && (
                <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-600">Register closed</span>
              )}
            </div>
            {!allWeeks && participants.length > 0 && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…" className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:flex-1" />
              {groupOptions.length > 1 && <div className="w-full sm:w-56"><AppSelect value={selectedGroupId} onChange={setSelectedGroupId} options={groupOptions} placeholder="All groups" compact /></div>}
            </div>}
            {!allWeeks && finalised && <p className="mt-2 text-[13px] font-medium text-emerald-700">Attendance report sent.</p>}
            {!allWeeks && !finalised && allMarked && <p className="mt-2 text-[13px] font-medium text-emerald-700">Attendance taken.{activeSession.autoFinalizeAtNoon ? ' It will be sent automatically at noon on Sunday.' : ' Waiting for the admin to send the report.'}</p>}
            {!allWeeks && locked && <p className="mt-2 text-[13px] font-medium text-gray-500">The register is locked. You can still move an Absent mark to Late or Left early.</p>}
          </section>
          {allWeeks ? (loading ? <PageLoader /> : <section className="overflow-hidden rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">{weekResults.map((result) => {
            const reportSent = !!result.session?.finalizedAt;
            return <div key={result.week.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#f1f2f5] px-4 py-3 last:border-b-0"><div className="min-w-20"><p className="text-sm font-bold text-gray-900">Week {result.week.weekNumber}</p><p className="text-xs text-gray-500">{result.marked} of {result.total} marked</p></div><div className="flex flex-wrap gap-1.5 text-xs font-semibold"><span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">{result.present} present</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">{result.late} late</span><span className="rounded-full bg-red-100 px-2 py-1 text-red-700">{result.absent} absent</span></div><span className={`ml-auto text-xs font-semibold ${reportSent ? 'text-emerald-700' : result.marked === result.total && result.total > 0 ? 'text-sky-700' : 'text-gray-500'}`}>{reportSent ? 'Report sent' : result.marked === result.total && result.total > 0 ? 'Taken' : 'In progress'}</span></div>;
          })}</section>) : <>
          {!loading && <div className="mb-4 grid grid-cols-5 gap-2">{[
            ['Present', summary.present, 'bg-emerald-100 text-emerald-700'], ['Absent', summary.absent, 'bg-red-100 text-red-700'], ['Late', summary.late, 'bg-amber-100 text-amber-700'], ['Left early', summary.leftEarly, 'bg-orange-100 text-orange-700'], ['Excused', summary.excused, 'bg-sky-100 text-sky-700'],
          ].map(([label, value, cls]) => <div key={String(label)} className={`rounded-xl px-2 py-2 text-center ${cls}`}><p className="text-[11px] font-semibold">{label}</p><p className="text-lg font-bold">{value}</p></div>)}</div>}
          {loading ? <PageLoader /> : participants.length === 0 ? <p className="rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">No active participants in this cohort.</p> : visibleParticipants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center"><p className="text-sm text-gray-500">No one matches.</p><button type="button" onClick={() => { setSearch(''); setSelectedGroupId(''); }} className="mt-2 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">Clear</button></div>
          ) : (
            <section className="rounded-[20px] border border-[#eef0f4] bg-white p-3 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]"><div className="flex flex-col gap-2">{visibleParticipants.map((participant) => {
              const current = records.get(participant.id)?.status;
              const busy = saving.has(participant.id);
              return <div key={participant.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 rounded-[14px] border border-[#f1f2f5] px-3 py-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff1e7] text-xs font-bold text-[#c2410c]">{initialsOf(participant.fullName)}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{participant.fullName}</p>{participant.groupName && <p className="truncate text-[11px] text-gray-400">{participant.groupName}</p>}</div>
                <div className="col-span-2 grid w-full grid-cols-5 gap-1 sm:col-span-1 sm:w-auto sm:flex sm:flex-wrap sm:gap-1.5">{STATUS_BUTTONS.map(({ status, label, activeCls }) => {
                  const pending = saving.get(participant.id) === status;
                  const disallowed = locked && !allowedWhenLocked(current, status);
                  return <button key={status} type="button" disabled={disallowed || busy} aria-busy={pending} onClick={() => void mark(participant, status)} className={`flex min-h-9 items-center justify-center gap-1 rounded-lg px-0.5 text-center text-[10.5px] font-semibold leading-tight transition disabled:cursor-wait disabled:opacity-40 sm:inline-flex sm:rounded-full sm:px-2.5 sm:text-xs ${pending || current === status ? activeCls : 'bg-[#f4f5f7] text-gray-500 hover:bg-gray-200/70'} ${busy && !pending ? 'opacity-50' : ''}`}>
                    {pending && <span className="h-3 w-3 flex-none animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden="true" />}<span className="truncate">{label}</span>
                  </button>;
                })}</div>
              </div>;
            })}</div></section>
          )}
          </>}
        </>
      )}
    </div>
  );
};

export default SupportAttendancePage;
