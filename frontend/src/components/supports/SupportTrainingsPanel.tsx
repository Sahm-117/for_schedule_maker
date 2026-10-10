import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Cohort, SupportAttendanceStatus, SupportSession, SupportSessionType, User } from '../../types';
import { cohortsApi, supportSessionsApi, usersApi } from '../../services/api';
import { useAppData } from '../../context/AppDataContext';
import { usePermissions } from '../../hooks/usePermissions';
import ModalShell from '../followups/ModalShell';
import ConfirmationModal from '../ConfirmationModal';
import AppOverflowMenu from '../AppOverflowMenu';
import AppSelect from '../AppSelect';
import SaveStatus, { type SaveState } from '../SaveStatus';
import PageLoader from '../PageLoader';
import Spinner from '../Spinner';
import TrainingMarkersModal from '../TrainingMarkersModal';
import LearnedAnswers from './LearnedAnswers';
import { sortByText } from '../../utils/sort';
import { cohortMode } from '../dashboard/healthModel';
import MarkCounter from './MarkCounter';
import MarkRestAbsentButton from './MarkRestAbsentButton';
import { pickableUsers } from '../../utils/testUsers';
import { hasSupportRole } from '../../utils/people';

// Trainings & get-togethers tab on the admin Supports page (moved from Hubs,
// which now keeps only Sunday recaps). Admins create sessions and mark
// attendance here; "Who can mark" picks the supports who can mark too.

const STATUS_OPTIONS: Array<{ value: SupportAttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'EXCUSED', label: 'Excused' },
];

// ── Trainings & get-togethers ────────────────────────────────────────────────

const SESSION_TYPE_OPTIONS: Array<{ value: SupportSessionType; label: string }> = [
  { value: 'PRE_COHORT_TRAINING', label: 'Pre-cohort training' },
  { value: 'GET_TOGETHER', label: 'Get-together' },
];

const SESSION_TYPE_PILL: Record<SupportSessionType, string> = {
  SUNDAY_RECAP: 'bg-neutral-100 text-neutral-600',
  PRE_COHORT_TRAINING: 'bg-sky-100/80 text-sky-700',
  GET_TOGETHER: 'bg-violet-100/80 text-violet-700',
};

const SESSION_TYPE_LABEL: Record<SupportSessionType, string> = {
  SUNDAY_RECAP: 'Sunday recap',
  PRE_COHORT_TRAINING: 'Pre-cohort training',
  GET_TOGETHER: 'Get-together',
};

const toDateInputValue = (iso?: string) => (iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10));

const SessionFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: (s: SupportSession) => void;
  cohorts: Cohort[];
  defaultCohortId: string;
  existing?: SupportSession | null;
}> = ({ isOpen, onClose, onSaved, cohorts, defaultCohortId, existing }) => {
  const [type, setType] = useState<'PRE_COHORT_TRAINING' | 'GET_TOGETHER'>('PRE_COHORT_TRAINING');
  const [title, setTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setType((existing?.type as 'PRE_COHORT_TRAINING' | 'GET_TOGETHER') ?? 'PRE_COHORT_TRAINING');
      setTitle(existing?.title ?? '');
      setSessionDate(toDateInputValue(existing?.sessionDate));
      setCohortId(existing?.cohortId ?? defaultCohortId);
      setErr('');
    }
  }, [isOpen, existing, defaultCohortId]);

  const handleSave = async () => {
    if (!title.trim()) { setErr('Title is required'); return; }
    if (!sessionDate) { setErr('Date is required'); return; }
    if (!cohortId) { setErr('Cohort is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const { session } = existing
        ? await supportSessionsApi.update(existing.id, { title: title.trim(), sessionDate })
        : await supportSessionsApi.create({ cohortId, type, title: title.trim(), sessionDate });
      onSaved(session);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit session' : 'New session'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Type *</label>
          {existing ? (
            <p className="text-sm text-gray-700">{SESSION_TYPE_LABEL[type]}</p>
          ) : (
            <AppSelect value={type} onChange={(v) => setType(v as 'PRE_COHORT_TRAINING' | 'GET_TOGETHER')} options={SESSION_TYPE_OPTIONS} placeholder="Pick a type" compact />
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Onboarding & facilitation training"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date *</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cohort *</label>
          {existing ? (
            <p className="rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">{cohorts.find((c) => c.id === cohortId)?.name ?? '—'}</p>
          ) : (
            <AppSelect
              value={cohortId}
              onChange={setCohortId}
              options={cohorts.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Pick a cohort"
              compact
            />
          )}
        </div>
      </div>
    </ModalShell>
  );
};


// Marking screen for a training/get-together session — every active support
// (not just hub members: "new supports may not be in the cohort yet").
const SessionAttendanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  session: SupportSession;
  supportUsers: User[];
  marks: Record<string, SupportAttendanceStatus>;
  onMarked: (sessionId: string, userId: string, status: SupportAttendanceStatus) => void;
}> = ({ isOpen, onClose, session, supportUsers, marks, onMarked }) => {
  // Per-person save feedback on the marks, keyed by userId.
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const markedCount = supportUsers.filter((u) => marks[u.id]).length;
  const shown = onlyUnmarked ? supportUsers.filter((u) => !marks[u.id]) : supportUsers;

  const handleMark = async (userId: string, status: SupportAttendanceStatus) => {
    const setState = (state?: SaveState) => setSaveState((prev) => {
      const next = { ...prev };
      if (state) next[userId] = state; else delete next[userId];
      return next;
    });
    setState('saving');
    try {
      await supportSessionsApi.mark({ status, userId, sessionId: session.id });
      onMarked(session.id, userId, status);
      setState('saved');
      setTimeout(() => setSaveState((prev) => {
        if (prev[userId] !== 'saved') return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      }), 2000);
    } catch {
      setState('error');
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Mark attendance — ${session.title}`} wide>
      <div className="flex flex-col gap-2">
        {supportUsers.length > 0 && (
          <MarkCounter marked={markedCount} notMarked={supportUsers.length - markedCount} onlyUnmarked={onlyUnmarked} onToggle={setOnlyUnmarked} />
        )}
        {supportUsers.length === 0 ? (
          <p className="text-sm text-gray-400">No active supports.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400">Everyone is marked.</p>
        ) : (
          <>
          <ul className="space-y-2">
            {shown.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                  <SaveStatus state={saveState[u.id]} />
                </div>
                <div className="w-40 flex-none">
                  <AppSelect
                    value={marks[u.id] ?? ''}
                    onChange={(v) => v && void handleMark(u.id, v as SupportAttendanceStatus)}
                    options={STATUS_OPTIONS}
                    placeholder="Not marked"
                    disabled={saveState[u.id] === 'saving'}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
          {onlyUnmarked && (
            <MarkRestAbsentButton
              count={shown.length}
              sessionTitle={session.title}
              onConfirm={async () => { for (const u of shown) await handleMark(u.id, 'ABSENT'); }}
            />
          )}
          </>
        )}
      </div>
    </ModalShell>
  );
};

// Results for one session: stat cards (Present / Late / Absent / Excused / Not
// marked) that double as filters, and the matching supports underneath with
// what they wrote they learned.
type ResultKey = 'ALL' | SupportAttendanceStatus | 'NOT_MARKED';
const RESULT_CARDS: Array<{ key: ResultKey; label: string; tone: string }> = [
  { key: 'PRESENT', label: 'Present', tone: 'bg-emerald-100/80 text-emerald-700' },
  { key: 'LATE', label: 'Late', tone: 'bg-sky-100/80 text-sky-700' },
  { key: 'ABSENT', label: 'Absent', tone: 'bg-red-100/80 text-red-700' },
  { key: 'EXCUSED', label: 'Excused', tone: 'bg-violet-100/80 text-violet-700' },
  { key: 'NOT_MARKED', label: 'Not marked', tone: 'bg-neutral-100 text-neutral-600' },
];

const SessionResultsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  session: SupportSession;
  people: User[];
  attendance: Array<{ sessionId: string; userId: string; status: SupportAttendanceStatus; learned?: string | null; willApply?: string | null }>;
  onMark: () => void;
  canMark: boolean;
}> = ({ isOpen, onClose, session, people, attendance, onMark, canMark }) => {
  const [filter, setFilter] = useState<ResultKey>('ALL');
  // Which "what I learned" chip is filtering the list, if any.
  const [sharedFilter, setSharedFilter] = useState<'ALL' | 'SHARED' | 'NOT_SHARED'>('ALL');
  const byUser = new Map(attendance.filter((a) => a.sessionId === session.id).map((a) => [a.userId, a]));
  const keyFor = (userId: string): ResultKey => byUser.get(userId)?.status ?? 'NOT_MARKED';
  const counts = RESULT_CARDS.map((c) => ({ ...c, count: people.filter((u) => keyFor(u.id) === c.key).length }));
  // "What I learned" is asked of everyone present or late at a pre-cohort training.
  const asksLearning = session.type === 'PRE_COHORT_TRAINING';
  const attended = people.filter((u) => keyFor(u.id) === 'PRESENT' || keyFor(u.id) === 'LATE');
  const notShared = attended.filter((u) => !byUser.get(u.id)?.learned);
  const notSharedIds = new Set(notShared.map((u) => u.id));
  const sharedIds = new Set(attended.filter((u) => !notSharedIds.has(u.id)).map((u) => u.id));
  const shown = (filter === 'ALL' ? people : people.filter((u) => keyFor(u.id) === filter))
    .filter((u) => sharedFilter === 'ALL' || (sharedFilter === 'SHARED' ? sharedIds : notSharedIds).has(u.id));
  const toneFor = (key: ResultKey) => RESULT_CARDS.find((c) => c.key === key)?.tone ?? '';
  const labelFor = (key: ResultKey) => RESULT_CARDS.find((c) => c.key === key)?.label ?? '';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={session.title}
      subtitle={`${SESSION_TYPE_LABEL[session.type]} · ${new Date(session.sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Close</button>
          {canMark && <button type="button" onClick={onMark} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95">Mark attendance</button>}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded-2xl p-3 text-left transition ${filter === 'ALL' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Everyone</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{people.length}</p>
          </button>
          {counts.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(filter === c.key ? 'ALL' : c.key)}
              className={`rounded-2xl p-3 text-left transition ${c.tone} ${filter === c.key ? 'ring-2 ring-current' : 'hover:brightness-95'}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide">{c.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{c.count}</p>
            </button>
          ))}
        </div>
        {asksLearning && attended.length > 0 && (
          <MarkCounter
            marked={attended.length - notShared.length}
            notMarked={notShared.length}
            onlyUnmarked={sharedFilter === 'NOT_SHARED'}
            onToggle={(only) => setSharedFilter(only ? 'NOT_SHARED' : 'ALL')}
            onlyDone={sharedFilter === 'SHARED'}
            onToggleDone={(only) => setSharedFilter(only ? 'SHARED' : 'ALL')}
            doneLabel="shared what they learned"
            todoLabel="haven't shared"
          />
        )}
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No one here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((u) => {
              const key = keyFor(u.id);
              const learned = byUser.get(u.id)?.learned;
              const willApply = byUser.get(u.id)?.willApply;
              return (
                <li key={u.id} className="rounded-xl border border-orange-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{u.name}</p>
                    <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneFor(key)}`}>{labelFor(key)}</span>
                  </div>
                  {learned && <LearnedAnswers learned={learned} willApply={willApply} />}
                  {!learned && session.type === 'PRE_COHORT_TRAINING' && (key === 'PRESENT' || key === 'LATE') && (
                    <p className="mt-1 text-xs text-gray-400">Hasn't shared what they learned yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalShell>
  );
};

// ── Panel ─────────────────────────────────────────────────────────────────────

const SupportTrainingsPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { activeCohort, cohorts, liveRevision } = useAppData();
  const { can } = usePermissions();
  const canAdd = can('supports', 'add');
  const canEdit = can('supports', 'edit');
  const canDelete = can('supports', 'delete');
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [sessionAttendance, setSessionAttendance] = useState<Array<{ sessionId: string; userId: string; status: SupportAttendanceStatus; learned?: string | null; willApply?: string | null }>>([]);
  const [resultsTarget, setResultsTarget] = useState<SupportSession | null>(null);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  // Supports enrolled in each listed cohort, so a training is counted against
  // its own cohort's supports rather than every support in the app.
  const [supportIdsByCohort, setSupportIdsByCohort] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SupportSession | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<SupportSession | null>(null);
  const [markSessionTarget, setMarkSessionTarget] = useState<SupportSession | null>(null);
  const [markersOpen, setMarkersOpen] = useState(false);

  // Pre-cohort trainings are held BEFORE the cohort they're for starts, so the
  // create/edit picker offers every cohort that hasn't ended yet (running or
  // upcoming), defaulting to the soonest upcoming one — that's almost always
  // what's being trained for next, falling back to the active cohort when
  // nothing is upcoming. The list shows the active cohort plus any upcoming
  // ones, so admins see trainings they're currently running.
  const notEndedCohorts = useMemo(
    () => sortByText(cohorts.filter((c) => c.status !== 'ARCHIVED' && cohortMode(c) !== 'completed'), (c) => c.name),
    [cohorts]
  );
  const upcomingCohorts = useMemo(
    () => notEndedCohorts
      .filter((c) => cohortMode(c) === 'upcoming')
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
    [notEndedCohorts]
  );
  const defaultTrainingCohortId = upcomingCohorts[0]?.id ?? activeCohort?.id ?? '';
  const trainingListCohortIds = useMemo(() => {
    const ids = new Set(upcomingCohorts.map((c) => c.id));
    if (activeCohort) ids.add(activeCohort.id);
    return [...ids];
  }, [upcomingCohorts, activeCohort]);
  const cohortById = useMemo(() => new Map(cohorts.map((c) => [c.id, c])), [cohorts]);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    try {
      const [{ users }, { sessions: ss, attendance: sa }, cohortMembers] = await Promise.all([
        usersApi.getAll(),
        supportSessionsApi.getForCohort(trainingListCohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER']),
        Promise.all(trainingListCohortIds.map((id) => cohortsApi.getMembers(id))),
      ]);
      setSupportIdsByCohort(new Map(trainingListCohortIds.map((id, i) => [
        id,
        new Set(cohortMembers[i].users.filter((u) => hasSupportRole(u)).map((u) => u.id)),
      ])));
      setSupportUsers(sortByText(pickableUsers(users.filter((u) => hasSupportRole(u) && u.isActive !== false)), (u) => u.name));
      setSessions(ss);
      setSessionAttendance(sa);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, trainingListCohortIds]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  const handleDeleteSession = async () => {
    if (!deleteSessionTarget) return;
    const s = deleteSessionTarget;
    try {
      await supportSessionsApi.remove(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      setSessionAttendance((prev) => prev.filter((a) => a.sessionId !== s.id));
      onChanged?.();
    } catch { /* ignore */ }
    finally { setDeleteSessionTarget(null); }
  };

  const marksBySession = (sessionId: string) => {
    const map: Record<string, SupportAttendanceStatus> = {};
    sessionAttendance.forEach((a) => { if (a.sessionId === sessionId) map[a.userId] = a.status; });
    return map;
  };

  if (!activeCohort) return <p className="text-sm text-gray-500">Select or create a cohort first.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit && (
          <button type="button" onClick={() => setMarkersOpen(true)} className="rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 active:scale-95">
            Who can mark
          </button>
        )}
        {canAdd && (
          <button type="button" onClick={() => { setEditingSession(null); setSessionFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
            + New session
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No trainings or get-togethers yet. Create one to start marking attendance.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => {
            const marks = marksBySession(s.id);
            // Trainings are open to every active support, not just this cohort's.
            const cohortSupportIds = new Set(supportUsers.map((u) => u.id));
            const marked = [...cohortSupportIds].filter((id) => marks[id]).length;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setResultsTarget(s)}
                onKeyDown={(e) => { if (e.key === 'Enter') setResultsTarget(s); }}
                className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SESSION_TYPE_PILL[s.type]}`}>{SESSION_TYPE_LABEL[s.type]}</span>
                    <span className="ml-1.5 inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">{cohortById.get(s.cohortId)?.name ?? 'Cohort'}</span>
                    <h3 className="mt-1 truncate font-bold text-gray-900">{s.title}</h3>
                    <p className="text-xs text-gray-500">{new Date(s.sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                  <AppOverflowMenu
                    align="right"
                    items={[
                      { label: 'See results', onClick: () => setResultsTarget(s) },
                      ...(canEdit ? [
                        { label: 'Mark attendance', onClick: () => setMarkSessionTarget(s) },
                        { label: 'Edit', onClick: () => { setEditingSession(s); setSessionFormOpen(true); } },
                      ] : []),
                      ...(canDelete ? [{ label: 'Delete', onClick: () => setDeleteSessionTarget(s), tone: 'danger' as const }] : []),
                    ]}
                  />
                  </div>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-sky-100/80 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {marked} of {cohortSupportIds.size} marked
                  </span>
                  {(() => {
                    const ids = [...cohortSupportIds];
                    const present = ids.filter((id) => marks[id] === 'PRESENT' || marks[id] === 'LATE').length;
                    const absent = ids.filter((id) => marks[id] === 'ABSENT').length;
                    return (
                      <>
                        <span className="rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">{present} present</span>
                        {absent > 0 && <span className="rounded-full bg-red-100/80 px-2.5 py-1 text-xs font-semibold text-red-700">{absent} absent</span>}
                      </>
                    );
                  })()}
                </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setResultsTarget(s); }}
                    className="flex-none rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-orange-100"
                  >
                    See results →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SessionFormModal
        isOpen={sessionFormOpen}
        onClose={() => { setSessionFormOpen(false); setEditingSession(null); }}
        onSaved={(s) => {
          setSessions((prev) => {
            const idx = prev.findIndex((x) => x.id === s.id);
            return idx >= 0 ? prev.map((x) => (x.id === s.id ? s : x)) : [s, ...prev];
          });
          onChanged?.();
        }}
        cohorts={notEndedCohorts}
        defaultCohortId={defaultTrainingCohortId}
        existing={editingSession}
      />

      {markSessionTarget && (
        <SessionAttendanceModal
          isOpen={!!markSessionTarget}
          onClose={() => { setMarkSessionTarget(null); onChanged?.(); }}
          session={markSessionTarget}
          supportUsers={supportUsers}
          marks={marksBySession(markSessionTarget.id)}
          onMarked={(sessionId, userId, status) => setSessionAttendance((prev) => {
            const old = prev.find((a) => a.sessionId === sessionId && a.userId === userId);
            return [...prev.filter((a) => a !== old), { sessionId, userId, status, learned: old?.learned ?? null, willApply: old?.willApply ?? null }];
          })}
        />
      )}

      {resultsTarget && (
        <SessionResultsModal
          isOpen={!!resultsTarget}
          onClose={() => setResultsTarget(null)}
          session={resultsTarget}
          people={supportUsers}
          attendance={sessionAttendance}
          onMark={() => { setMarkSessionTarget(resultsTarget); setResultsTarget(null); }}
          canMark={canEdit}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteSessionTarget}
        onClose={() => setDeleteSessionTarget(null)}
        onConfirm={() => { void handleDeleteSession(); }}
        title="Delete session"
        message={`Delete "${deleteSessionTarget?.title}"? Its attendance marks are removed too. This can't be undone.`}
        confirmText="Delete"
      />

      <TrainingMarkersModal isOpen={markersOpen} onClose={() => setMarkersOpen(false)} cohortId={activeCohort.id} />
    </div>
  );
};

export default SupportTrainingsPanel;
