import React, { useEffect, useMemo, useState } from 'react';
import { startPolling } from '../hooks/usePolling';
import AppSelect from './AppSelect';
import PageLoader from './PageLoader';
import { useToast } from './Toast';
import { useAppData } from '../context/AppDataContext';
import { supportSessionsApi, usersApi } from '../services/api';
import { supabase } from '../lib/supabase';
import { cohortMode } from './dashboard/healthModel';
import { sortByText } from '../utils/sort';
import type { SupportAttendanceStatus, SupportSession, User } from '../types';
import MarkCounter from './supports/MarkCounter';
import MarkRestAbsentButton from './supports/MarkRestAbsentButton';
import { pickableUsers } from '../utils/testUsers';
import { hasSupportRole } from '../utils/people';

// Trainings & get-togethers register, for the supports an admin picked on the
// Attendance page. Lists every active support (trainings are open to all, not
// just the session's cohort), marked the
// same way as the class register.

const STATUS_BUTTONS: Array<{ status: SupportAttendanceStatus; label: string; activeCls: string }> = [
  { status: 'PRESENT', label: 'Present', activeCls: 'bg-emerald-100 text-emerald-700' },
  { status: 'ABSENT', label: 'Absent', activeCls: 'bg-red-100 text-red-700' },
  { status: 'LATE', label: 'Late', activeCls: 'bg-amber-100 text-amber-700' },
  { status: 'EXCUSED', label: 'Excused', activeCls: 'bg-sky-100 text-sky-700' },
];

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');


const TrainingAttendancePanel: React.FC = () => {
  const { cohorts, activeCohort } = useAppData();
  const toast = useToast();
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, SupportAttendanceStatus>>>({});
  const [sessionId, setSessionId] = useState('');
  const [supportsByCohort, setSupportsByCohort] = useState<Record<string, User[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Map<string, SupportAttendanceStatus>>(new Map());
  const [search, setSearch] = useState('');
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);

  // Pre-cohort trainings happen before their cohort starts: list the active
  // cohort plus any upcoming ones, like the admin Supports page does.
  const cohortIds = useMemo(() => {
    const ids = new Set(cohorts.filter((c) => c.status !== 'ARCHIVED' && cohortMode(c) === 'upcoming').map((c) => c.id));
    if (activeCohort) ids.add(activeCohort.id);
    return [...ids];
  }, [cohorts, activeCohort]);
  const cohortById = useMemo(() => new Map(cohorts.map((c) => [c.id, c])), [cohorts]);

  useEffect(() => {
    if (cohortIds.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supportSessionsApi.getForCohort(cohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER']),
      usersApi.getAll().then((res) => res.users).catch(() => [] as User[]),
    ])
      .then(([{ sessions: ss, attendance }, users]) => {
        if (cancelled) return;
        const byMap: Record<string, Record<string, SupportAttendanceStatus>> = {};
        attendance.forEach((a) => { (byMap[a.sessionId] ??= {})[a.userId] = a.status; });
        setSessions(ss);
        setMarks(byMap);
        const everyone = sortByText(pickableUsers(users.filter((u) => hasSupportRole(u) && u.isActive !== false)), (u) => u.name);
        setSupportsByCohort(Object.fromEntries(cohortIds.map((id) => [id, everyone])));
        setSessionId((prev) => prev || ss[0]?.id || '');
      })
      .catch(() => { if (!cancelled) { setSessions([]); setMarks({}); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortIds]);

  // Live: several people can mark the same training at once. Each mark is
  // broadcast (postgres_changes can't see these staff-only rows, see
  // HubMeetingPanel), with a 15s refetch in case a channel drops.
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    const ch = supabase
      .channel(`training-attendance:${sessionId}`)
      .on('broadcast', { event: 'mark' }, ({ payload }) => {
        const { userId, status } = (payload ?? {}) as { userId?: string; status?: SupportAttendanceStatus };
        if (userId && status) setMarks((prev) => ({ ...prev, [sessionId]: { ...prev[sessionId], [userId]: status } }));
      })
      .subscribe();
    setChannel(ch);
    const stopPolling = startPolling(() => {
      return supportSessionsApi.getForCohort(cohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER'])
        .then(({ attendance }) => {
          const fresh: Record<string, SupportAttendanceStatus> = {};
          attendance.forEach((a) => { if (a.sessionId === sessionId) fresh[a.userId] = a.status; });
          setMarks((prev) => ({ ...prev, [sessionId]: { ...prev[sessionId], ...fresh } }));
        })
        .catch(() => { /* try again next tick */ });
    }, 15000);
    return () => { stopPolling(); void supabase.removeChannel(ch); setChannel(null); };
  }, [sessionId, cohortIds]);

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const supports = session ? supportsByCohort[session.cohortId] ?? [] : [];
  const sessionMarks = session ? marks[session.id] ?? {} : {};
  const q = search.trim().toLowerCase();
  const visible = supports
    .filter((u) => !q || u.name.toLowerCase().includes(q))
    .filter((u) => !onlyUnmarked || !sessionMarks[u.id]);
  const summary = STATUS_BUTTONS.map(({ status, label, activeCls }) => ({
    label, activeCls, value: supports.filter((u) => sessionMarks[u.id] === status).length,
  }));
  const markedCount = supports.filter((u) => sessionMarks[u.id]).length;

  const mark = async (user: User, status: SupportAttendanceStatus) => {
    if (!session) return;
    setSaving((current) => new Map(current).set(user.id, status));
    try {
      await supportSessionsApi.mark({ status, userId: user.id, sessionId: session.id });
      setMarks((prev) => ({ ...prev, [session.id]: { ...prev[session.id], [user.id]: status } }));
      void channel?.send({ type: 'broadcast', event: 'mark', payload: { userId: user.id, status } });
    } catch (error) {
      toast({ tone: 'error', message: error instanceof Error ? error.message : `Couldn’t save ${user.name}.` });
    } finally {
      setSaving((current) => { const next = new Map(current); next.delete(user.id); return next; });
    }
  };

  if (loading) return <PageLoader />;
  if (sessions.length === 0) {
    return <p className="rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">No trainings or get-togethers yet — an admin creates these on the Supports page.</p>;
  }

  return (
    <>
      <section className="mb-4 rounded-[20px] border border-[#ffdeca] bg-white p-4 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1 sm:max-w-sm">
            <AppSelect
              value={sessionId}
              onChange={setSessionId}
              options={sessions.map((s) => ({
                value: s.id,
                label: `${s.title} · ${new Date(s.sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${cohortById.get(s.cohortId)?.name ?? 'Cohort'}`,
              }))}
              placeholder="Pick a session"
              compact
            />
          </div>
          {session && <MarkCounter marked={markedCount} notMarked={supports.length - markedCount} onlyUnmarked={onlyUnmarked} onToggle={setOnlyUnmarked} />}
        </div>
        {supports.length > 0 && (
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…" className="mt-3 w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        )}
      </section>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {summary.map((s) => <div key={s.label} className={`rounded-xl px-2 py-2 text-center ${s.activeCls}`}><p className="text-[11px] font-semibold">{s.label}</p><p className="text-lg font-bold">{s.value}</p></div>)}
      </div>
      {supports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">No supports in this cohort yet.</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">{onlyUnmarked && !q ? 'Everyone is marked.' : 'No one matches.'}</p>
      ) : (
        <section className="rounded-[20px] border border-[#eef0f4] bg-white p-3 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
          <div className="flex flex-col gap-2">
            {visible.map((u) => {
              const current = sessionMarks[u.id];
              const busy = saving.has(u.id);
              return (
                <div key={u.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 rounded-[14px] border border-[#f1f2f5] px-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff1e7] text-xs font-bold text-[#c2410c]">{initialsOf(u.name)}</span>
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{u.name}</p>
                  <div className="col-span-2 grid w-full grid-cols-4 gap-1 sm:flex sm:gap-1.5">
                    {STATUS_BUTTONS.map(({ status, label, activeCls }) => {
                      const pending = saving.get(u.id) === status;
                      return (
                        <button key={status} type="button" disabled={busy} aria-busy={pending} onClick={() => void mark(u, status)} className={`flex min-h-9 items-center justify-center gap-1 rounded-lg px-0.5 text-center text-[10.5px] font-semibold leading-tight transition disabled:cursor-wait sm:inline-flex sm:rounded-full sm:px-2.5 sm:text-xs ${pending || current === status ? activeCls : 'bg-[#f4f5f7] text-gray-500 hover:bg-gray-200/70'} ${busy && !pending ? 'opacity-50' : ''}`}>
                          {pending && <span className="h-3 w-3 flex-none animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden="true" />}<span className="truncate">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {onlyUnmarked && !q && session && (
            <MarkRestAbsentButton
              count={visible.length}
              sessionTitle={session.title}
              onConfirm={async () => { for (const u of visible) await mark(u, 'ABSENT'); }}
            />
          )}
        </section>
      )}
    </>
  );
};

export default TrainingAttendancePanel;
