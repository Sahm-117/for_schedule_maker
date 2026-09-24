import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, supportHubsApi, supportSessionsApi, usersApi } from '../services/api';
import type { Cohort, Group, HubMembership, SupportAttendanceStatus, SupportHub, SupportSession, SupportSessionType, User, Week } from '../types';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import PageLoader from '../components/PageLoader';
import { sortByText } from '../utils/sort';
import { selectedFirst } from '../utils/selectedFirst';
import { getIdealWeekNumberForCohort } from '../utils/weekFocus';
import { cohortMode } from '../components/dashboard/healthModel';

// ── Recap Attendance Modal ────────────────────────────────────────────────────
// Same controls and API calls as the hub lead's Recap tab in SupportMyHubPage.

const STATUS_OPTIONS: Array<{ value: SupportAttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'EXCUSED', label: 'Excused' },
];

const RecapAttendanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  hub: SupportHub;
  members: User[];
  weeks: Week[];
  defaultWeekId: number | null;
  onMarked: (hubId: string, weekId: number, marks: Record<string, SupportAttendanceStatus>) => void;
}> = ({ isOpen, onClose, hub, members, weeks, defaultWeekId, onMarked }) => {
  const sortedWeeks = useMemo(() => [...weeks].sort((a, b) => b.weekNumber - a.weekNumber), [weeks]);
  const [weekId, setWeekId] = useState<number | null>(defaultWeekId);
  const [marks, setMarks] = useState<Record<string, SupportAttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setWeekId(defaultWeekId ?? (sortedWeeks[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultWeekId]);

  useEffect(() => {
    if (!isOpen || weekId == null) return;
    setLoading(true);
    supportSessionsApi.getForHubWeek(hub.id, weekId)
      .then(({ attendance }) => {
        const map: Record<string, SupportAttendanceStatus> = {};
        attendance.forEach((a) => { map[a.userId] = a.status; });
        setMarks(map);
      })
      .catch(() => setMarks({}))
      .finally(() => setLoading(false));
  }, [isOpen, hub.id, weekId]);

  const handleMark = async (userId: string, status: SupportAttendanceStatus) => {
    if (weekId == null) return;
    setSaving(userId);
    try {
      await supportSessionsApi.mark({ status, userId, hubId: hub.id, weekId });
      const next = { ...marks, [userId]: status };
      setMarks(next);
      onMarked(hub.id, weekId, next);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Recap attendance — ${hub.name}`} wide>
      <div className="flex flex-col gap-4">
        <div className="w-full sm:w-64">
          <AppSelect
            value={weekId != null ? String(weekId) : ''}
            onChange={(v) => setWeekId(v ? Number(v) : null)}
            options={sortedWeeks.map((w) => ({ value: String(w.id), label: `Week ${w.weekNumber}` }))}
            placeholder="Pick a week"
            compact
          />
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                <div className="w-40">
                  <AppSelect
                    value={marks[m.id] ?? ''}
                    onChange={(v) => v && void handleMark(m.id, v as SupportAttendanceStatus)}
                    options={STATUS_OPTIONS}
                    placeholder={saving === m.id ? 'Saving…' : 'Not marked'}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
};

// ── Hub Form Modal (create / rename) ──────────────────────────────────────────

const HubFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: (h: SupportHub) => void;
  cohortId: string;
  existing?: SupportHub | null;
}> = ({ isOpen, onClose, onSaved, cohortId, existing }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) { setName(existing?.name ?? ''); setErr(''); }
  }, [isOpen, existing]);

  const handleSave = async () => {
    if (!name.trim()) { setErr('Hub name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const { hub } = existing
        ? await supportHubsApi.update(existing.id, { name: name.trim() })
        : await supportHubsApi.create({ cohortId, name: name.trim() });
      onSaved(hub);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save hub');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Hub' : 'Create Hub'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Hub name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Hub A"
          />
        </div>
      </div>
    </ModalShell>
  );
};

// ── Assign Lead Modal ──────────────────────────────────────────────────────────

const AssignLeadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: (h: SupportHub) => void;
  hub: SupportHub;
  members: User[];
}> = ({ isOpen, onClose, onSaved, hub, members }) => {
  const [leadUserId, setLeadUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) { setLeadUserId(hub.leadUserId ?? ''); setErr(''); }
  }, [isOpen, hub]);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { hub: updated } = await supportHubsApi.update(hub.id, { leadUserId: leadUserId || null });
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to assign lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Pick lead — ${hub.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">Add supports to this hub first.</p>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Hub lead</label>
            <AppSelect
              value={leadUserId}
              onChange={setLeadUserId}
              options={[{ value: '', label: '— None —' }, ...members.map((u) => ({ value: u.id, label: u.name }))]}
              placeholder="— None —"
              compact
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// ── Manage Members Modal ──────────────────────────────────────────────────────

const HubMembersModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  hub: SupportHub;
  cohortId: string;
  allSupports: User[];
  currentMemberIds: string[];
  otherHubUserIds: Set<string>;
  onSaved: (userIds: string[]) => void;
}> = ({ isOpen, onClose, hub, cohortId, allSupports, currentMemberIds, otherHubUserIds, onSaved }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) { setSelected(new Set(currentMemberIds)); setErr(''); setSearch(''); }
  }, [isOpen, currentMemberIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? allSupports.filter((u) => u.name.toLowerCase().includes(q)) : allSupports;
    return selectedFirst(list, (u) => selected.has(u.id));
  }, [allSupports, search, selected]);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      await supportHubsApi.setMembers(hub.id, cohortId, [...selected]);
      onSaved([...selected]);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save members');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Members — ${hub.name}`}
      subtitle={`${selected.size} selected`}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save members'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supports…"
          className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <ul className="max-h-80 overflow-y-auto divide-y divide-orange-50">
          {filtered.map((u) => {
            const inOtherHub = otherHubUserIds.has(u.id) && !currentMemberIds.includes(u.id);
            return (
              <li
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg py-2.5 transition ${selected.has(u.id) ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}
              >
                <input type="checkbox" checked={selected.has(u.id)} readOnly tabIndex={-1} className="pointer-events-none h-4 w-4 accent-primary" />
                <span className="flex-1 text-sm text-gray-800">
                  {u.name}
                  {inOtherHub && <span className="ml-2 text-xs text-amber-600">Moves from another hub</span>}
                </span>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="py-4 text-center text-sm text-gray-400">No supports found</li>}
        </ul>
      </div>
    </ModalShell>
  );
};

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
            {saving ? 'Saving…' : 'Save'}
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
  const [saving, setSaving] = useState<string | null>(null);

  const handleMark = async (userId: string, status: SupportAttendanceStatus) => {
    setSaving(userId);
    try {
      await supportSessionsApi.mark({ status, userId, sessionId: session.id });
      onMarked(session.id, userId, status);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Mark attendance — ${session.title}`} wide>
      <div className="flex flex-col gap-2">
        {supportUsers.length === 0 ? (
          <p className="text-sm text-gray-400">No active supports.</p>
        ) : (
          <ul className="space-y-2">
            {supportUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                <span className="text-sm font-semibold text-gray-900">{u.name}</span>
                <div className="w-40">
                  <AppSelect
                    value={marks[u.id] ?? ''}
                    onChange={(v) => v && void handleMark(u.id, v as SupportAttendanceStatus)}
                    options={STATUS_OPTIONS}
                    placeholder={saving === u.id ? 'Saving…' : 'Not marked'}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminHubsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, cohorts, liveRevision, weeks } = useAppData();

  const [tab, setTab] = useState<'hubs' | 'trainings'>('hubs');
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [memberships, setMemberships] = useState<HubMembership[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [sessionAttendance, setSessionAttendance] = useState<Array<{ sessionId: string; userId: string; status: SupportAttendanceStatus }>>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupportHub | null>(null);
  const [leadTarget, setLeadTarget] = useState<SupportHub | null>(null);
  const [membersTarget, setMembersTarget] = useState<SupportHub | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupportHub | null>(null);
  const [recapTarget, setRecapTarget] = useState<SupportHub | null>(null);
  const [recapByHub, setRecapByHub] = useState<Record<string, { weekId: number; weekNumber: number; marked: number; total: number; absent: number }>>({});
  const [search, setSearch] = useState('');
  const [recapFilter, setRecapFilter] = useState<'all' | 'behind' | 'complete'>('all');
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SupportSession | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<SupportSession | null>(null);
  const [markSessionTarget, setMarkSessionTarget] = useState<SupportSession | null>(null);

  // Pre-cohort trainings are held BEFORE the cohort they're for starts, so the
  // create/edit picker offers every cohort that hasn't ended yet (running or
  // upcoming), defaulting to the soonest upcoming one — that's almost always
  // what's being trained for next, falling back to the active cohort when
  // nothing is upcoming. The list on this tab shows the active cohort plus any
  // upcoming ones, so admins see trainings they're currently running.
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
    setLoading(true);
    try {
      const [{ hubs: hs }, { memberships: ms }, { users }, { groups: gs }, { sessions: ss, attendance: sa }] = await Promise.all([
        supportHubsApi.getAll(activeCohort.id),
        supportHubsApi.getMembershipsForCohort(activeCohort.id),
        usersApi.getAll(),
        groupsApi.getAll({ cohortId: activeCohort.id }),
        supportSessionsApi.getForCohort(trainingListCohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER']),
      ]);
      setHubs(hs);
      setMemberships(ms);
      setSupportUsers(sortByText(users.filter((u) => u.role === 'SUPPORT'), (u) => u.name));
      setGroups(gs);
      setSessions(ss);
      setSessionAttendance(sa);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, trainingListCohortIds]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  // Recap summary for the card: the latest week that's actually over and fair
  // to judge — same "judged weeks" rule as the Supports page and dashboard
  // (the in-progress current week isn't judged yet, so absences in it don't
  // show up as "missed recap" elsewhere until the week is over).
  const summaryWeek = useMemo(() => {
    if (!activeCohort || weeks.length === 0) return null;
    const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
    const mode = cohortMode(activeCohort);
    if (mode === 'upcoming') return null;
    if (mode === 'completed') return sorted[sorted.length - 1];
    const idealNumber = getIdealWeekNumberForCohort(activeCohort, new Date());
    const judged = sorted.filter((w) => w.weekNumber < idealNumber);
    return judged.length > 0 ? judged[judged.length - 1] : null;
  }, [activeCohort, weeks]);

  useEffect(() => {
    if (!summaryWeek || hubs.length === 0) { setRecapByHub({}); return; }
    let cancelled = false;
    const membersByHubLocal = new Map<string, string[]>();
    memberships.forEach((m) => {
      membersByHubLocal.set(m.hubId, [...(membersByHubLocal.get(m.hubId) ?? []), m.userId]);
    });
    (async () => {
      try {
        const entries = await Promise.all(hubs.map(async (h) => {
          const memberIds = membersByHubLocal.get(h.id) ?? [];
          if (memberIds.length === 0) {
            return [h.id, { weekId: summaryWeek.id, weekNumber: summaryWeek.weekNumber, marked: 0, total: 0, absent: 0 }] as const;
          }
          const { attendance } = await supportSessionsApi.getForHubWeek(h.id, summaryWeek.id);
          const byUser = new Map(attendance.map((a) => [a.userId, a.status]));
          let marked = 0;
          let absent = 0;
          memberIds.forEach((id) => {
            const status = byUser.get(id);
            if (status) marked += 1;
            if (status === 'ABSENT') absent += 1;
          });
          return [h.id, { weekId: summaryWeek.id, weekNumber: summaryWeek.weekNumber, marked, total: memberIds.length, absent }] as const;
        }));
        if (!cancelled) setRecapByHub(Object.fromEntries(entries));
      } catch {
        if (!cancelled) setRecapByHub({});
      }
    })();
    return () => { cancelled = true; };
  }, [hubs, memberships, summaryWeek]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const userById = new Map(supportUsers.map((u) => [u.id, u]));
  const groupBySupportId = new Map(groups.filter((g) => !g.archivedAt && g.supportId).map((g) => [g.supportId as string, g]));
  const membersByHub = new Map<string, string[]>();
  memberships.forEach((m) => {
    membersByHub.set(m.hubId, [...(membersByHub.get(m.hubId) ?? []), m.userId]);
  });
  const allHubUserIds = new Set(memberships.map((m) => m.userId));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const h = deleteTarget;
    try {
      await supportHubsApi.remove(h.id);
      setHubs((prev) => prev.filter((x) => x.id !== h.id));
      setMemberships((prev) => prev.filter((m) => m.hubId !== h.id));
    } catch { /* ignore */ }
    finally { setDeleteTarget(null); }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionTarget) return;
    const s = deleteSessionTarget;
    try {
      await supportSessionsApi.remove(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      setSessionAttendance((prev) => prev.filter((a) => a.sessionId !== s.id));
    } catch { /* ignore */ }
    finally { setDeleteSessionTarget(null); }
  };

  const marksBySession = (sessionId: string) => {
    const map: Record<string, SupportAttendanceStatus> = {};
    sessionAttendance.forEach((a) => { if (a.sessionId === sessionId) map[a.userId] = a.status; });
    return map;
  };

  // Keeps the card's summary line in step right after a mark in the panel,
  // without waiting for the next full reload.
  const handleRecapMarked = (hubId: string, weekId: number, marks: Record<string, SupportAttendanceStatus>) => {
    if (!summaryWeek || weekId !== summaryWeek.id) return;
    const memberIds = membersByHub.get(hubId) ?? [];
    let marked = 0;
    let absent = 0;
    memberIds.forEach((id) => {
      const status = marks[id];
      if (status) marked += 1;
      if (status === 'ABSENT') absent += 1;
    });
    setRecapByHub((prev) => ({ ...prev, [hubId]: { weekId, weekNumber: summaryWeek.weekNumber, marked, total: memberIds.length, absent } }));
  };

  const searchQuery = search.trim().toLowerCase();
  const filteredHubs = hubs.filter((h) => {
    if (recapFilter !== 'all') {
      const summary = recapByHub[h.id];
      const behind = !!summary && summary.total > 0 && summary.marked < summary.total;
      if (recapFilter === 'behind' && !behind) return false;
      if (recapFilter === 'complete' && (behind || !summary || summary.total === 0)) return false;
    }
    if (!searchQuery) return true;
    if (h.name.toLowerCase().includes(searchQuery)) return true;
    if (h.leadName && h.leadName.toLowerCase().includes(searchQuery)) return true;
    const memberIds = membersByHub.get(h.id) ?? [];
    return memberIds.some((id) => userById.get(id)?.name.toLowerCase().includes(searchQuery));
  });

  return (
    <div className="page-content">
      <PageHeader
        title="Hubs"
        subtitle={activeCohort ? `${hubs.length} hubs · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            tab === 'hubs' ? (
              <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + New Hub
              </button>
            ) : (
              <button type="button" onClick={() => { setEditingSession(null); setSessionFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + New session
              </button>
            )
          )
        }
      />

      {activeCohort && (
        <div className="mb-4">
          <SegmentedTabs
            tabs={[
              { key: 'hubs', label: 'Hubs' },
              { key: 'trainings', label: 'Trainings & get-togethers', shortLabel: 'Trainings' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as 'hubs' | 'trainings')}
          />
        </div>
      )}

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : tab === 'trainings' ? (
        sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
            <p className="text-sm text-gray-500">No trainings or get-togethers yet. Create one to start marking attendance.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => {
              const marks = marksBySession(s.id);
              const marked = supportUsers.filter((u) => marks[u.id]).length;
              return (
                <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SESSION_TYPE_PILL[s.type]}`}>{SESSION_TYPE_LABEL[s.type]}</span>
                      <span className="ml-1.5 inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">{cohortById.get(s.cohortId)?.name ?? 'Cohort'}</span>
                      <h3 className="mt-1 truncate font-bold text-gray-900">{s.title}</h3>
                      <p className="text-xs text-gray-500">{new Date(s.sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Mark attendance', onClick: () => setMarkSessionTarget(s) },
                        { label: 'Edit', onClick: () => { setEditingSession(s); setSessionFormOpen(true); } },
                        { label: 'Delete', onClick: () => setDeleteSessionTarget(s), tone: 'danger' },
                      ]}
                    />
                  </div>
                  <p className="inline-flex w-fit items-center rounded-full bg-sky-100/80 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {marked} of {supportUsers.length} marked
                  </p>
                </div>
              );
            })}
          </div>
        )
      ) : hubs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No hubs yet. Create one and add supports.</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hub, lead or member…"
              className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
            />
            <div className="w-full sm:w-56">
              <AppSelect
                value={recapFilter}
                onChange={(v) => setRecapFilter(v as 'all' | 'behind' | 'complete')}
                options={[
                  { value: 'all', label: 'All hubs' },
                  { value: 'behind', label: 'Recap behind' },
                  { value: 'complete', label: 'Recap all marked' },
                ]}
                placeholder="All hubs"
                compact
              />
            </div>
          </div>

          {filteredHubs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">No hubs match.</p>
            </div>
          ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredHubs.map((h) => {
            const memberIds = membersByHub.get(h.id) ?? [];
            const memberUsers = memberIds.map((id) => userById.get(id)).filter(Boolean) as User[];
            return (
              <div key={h.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-gray-900">{h.name}</h3>
                    <p className={`truncate text-xs ${h.leadName ? 'text-gray-500' : 'text-neutral-400'}`}>
                      {h.leadName ? `Lead: ${h.leadName}` : 'No lead assigned'}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{memberUsers.length}</span>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Manage members', onClick: () => setMembersTarget(h) },
                        { label: 'Pick lead', onClick: () => setLeadTarget(h) },
                        { label: 'Recap attendance', onClick: () => setRecapTarget(h) },
                        { label: 'Edit name', onClick: () => { setEditing(h); setFormOpen(true); } },
                        { label: 'Delete hub', onClick: () => setDeleteTarget(h), tone: 'danger' },
                      ]}
                    />
                  </div>
                </div>

                {memberUsers.length > 0 && recapByHub[h.id] && (() => {
                  const summary = recapByHub[h.id];
                  const behind = summary.marked < summary.total;
                  return (
                    <p className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${behind ? 'bg-amber-100/80 text-amber-700' : 'bg-emerald-100/80 text-emerald-700'}`}>
                      Week {summary.weekNumber} recap: {summary.marked} of {summary.total} marked{summary.absent > 0 ? ` · ${summary.absent} absent` : ''}
                    </p>
                  );
                })()}

                {memberUsers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-orange-200 px-3 py-4 text-center text-xs text-gray-400">No supports yet</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {memberUsers.map((u) => {
                      const led = groupBySupportId.get(u.id);
                      return (
                        <div key={u.id} className="rounded-xl border border-orange-100 bg-white px-3 py-2 shadow-sm">
                          <p className="truncate text-sm font-semibold leading-tight text-gray-900">
                            {u.name}
                            {u.id === h.leadUserId && (
                              <span className="ml-2 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>
                            )}
                          </p>
                          {led && <p className="text-xs text-gray-400">Leads {led.name}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
          )}
        </>
      )}

      <HubFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={(h) => setHubs((prev) => {
          const idx = prev.findIndex((x) => x.id === h.id);
          return idx >= 0 ? prev.map((x) => (x.id === h.id ? h : x)) : sortByText([...prev, h], (x) => x.name);
        })}
        cohortId={activeCohort?.id ?? ''}
        existing={editing}
      />

      {leadTarget && (
        <AssignLeadModal
          isOpen={!!leadTarget}
          onClose={() => setLeadTarget(null)}
          hub={leadTarget}
          members={(membersByHub.get(leadTarget.id) ?? []).map((id) => userById.get(id)).filter(Boolean) as User[]}
          onSaved={(h) => { setHubs((prev) => prev.map((x) => (x.id === h.id ? h : x))); setLeadTarget(null); }}
        />
      )}

      {membersTarget && (
        <HubMembersModal
          isOpen={!!membersTarget}
          onClose={() => setMembersTarget(null)}
          hub={membersTarget}
          cohortId={activeCohort?.id ?? ''}
          allSupports={supportUsers}
          currentMemberIds={membersByHub.get(membersTarget.id) ?? []}
          otherHubUserIds={allHubUserIds}
          onSaved={(userIds) => {
            setMemberships((prev) => [
              ...prev.filter((m) => m.hubId !== membersTarget.id && !userIds.includes(m.userId)),
              ...userIds.map((userId) => ({ id: `${membersTarget.id}:${userId}`, hubId: membersTarget.id, userId, cohortId: activeCohort?.id ?? '' })),
            ]);
            setMembersTarget(null);
          }}
        />
      )}

      {recapTarget && (
        <RecapAttendanceModal
          isOpen={!!recapTarget}
          onClose={() => setRecapTarget(null)}
          hub={recapTarget}
          members={(membersByHub.get(recapTarget.id) ?? []).map((id) => userById.get(id)).filter(Boolean) as User[]}
          weeks={weeks}
          defaultWeekId={summaryWeek?.id ?? null}
          onMarked={handleRecapMarked}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete hub"
        message={`Delete "${deleteTarget?.name}"? Its members, recap records, notes and messages are removed too. This can't be undone.`}
        confirmText="Delete"
      />

      <SessionFormModal
        isOpen={sessionFormOpen}
        onClose={() => { setSessionFormOpen(false); setEditingSession(null); }}
        onSaved={(s) => setSessions((prev) => {
          const idx = prev.findIndex((x) => x.id === s.id);
          return idx >= 0 ? prev.map((x) => (x.id === s.id ? s : x)) : [s, ...prev];
        })}
        cohorts={notEndedCohorts}
        defaultCohortId={defaultTrainingCohortId}
        existing={editingSession}
      />

      {markSessionTarget && (
        <SessionAttendanceModal
          isOpen={!!markSessionTarget}
          onClose={() => setMarkSessionTarget(null)}
          session={markSessionTarget}
          supportUsers={supportUsers}
          marks={marksBySession(markSessionTarget.id)}
          onMarked={(sessionId, userId, status) => setSessionAttendance((prev) => [...prev.filter((a) => !(a.sessionId === sessionId && a.userId === userId)), { sessionId, userId, status }])}
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
    </div>
  );
};

export default AdminHubsPage;
