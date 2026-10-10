import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useTeenSupportIds } from '../hooks/useTeenSupportIds';
import TeenSupportPill from '../components/supports/TeenSupportPill';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, myHubApi, supportHubsApi, supportKindApi, supportSessionsApi, usersApi } from '../services/api';
import type { Group, HubItSupportEntry, HubJob, HubLeadsMeeting, HubMembership, SupportAttendanceStatus, SupportHub, SupportKind, User, Week } from '../types';
import { HUB_JOB_INFO, sortHubJobs } from '../components/hubs/hubJobs';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import FilterBar, { type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import SaveStatus, { type SaveState } from '../components/SaveStatus';
import PageLoader from '../components/PageLoader';
import { sortByText } from '../utils/sort';
import { selectedFirst } from '../utils/selectedFirst';
import { getIdealWeekForCohort, getIdealWeekNumberForCohort } from '../utils/weekFocus';
import { cohortMode } from '../components/dashboard/healthModel';
import AttendanceSummaryStrip from '../components/hubs/AttendanceSummaryStrip';
import MeetingSetModal from '../components/hubs/MeetingSetModal';
import { formatMeetingSlot } from '../components/groups/GroupCallCard';
import Spinner from '../components/Spinner';
import SupportNotesStar from '../components/hubs/SupportNotesStar';
import Avatar from '../components/Avatar';
import HubAuthorProfileModal from '../components/HubAuthorProfileModal';
import { pickableUsers } from '../utils/testUsers';
import { hasSupportRole } from '../utils/people';

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
  // Per-person save feedback on the recap marks, keyed by userId.
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});

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
    const setState = (state?: SaveState) => setSaveState((prev) => {
      const next = { ...prev };
      if (state) next[userId] = state; else delete next[userId];
      return next;
    });
    setState('saving');
    try {
      await supportSessionsApi.mark({ status, userId, hubId: hub.id, weekId });
      const next = { ...marks, [userId]: status };
      setMarks(next);
      onMarked(hub.id, weekId, next);
      setState('saved');
      setTimeout(() => setSaveState((prev) => {
        if (prev[userId] !== 'saved') return prev;
        const next2 = { ...prev };
        delete next2[userId];
        return next2;
      }), 2000);
    } catch {
      setState('error');
    }
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
          <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                  <SaveStatus state={saveState[m.id]} />
                </div>
                <div className="w-40 flex-none">
                  <AppSelect
                    value={marks[m.id] ?? ''}
                    onChange={(v) => v && void handleMark(m.id, v as SupportAttendanceStatus)}
                    options={STATUS_OPTIONS}
                    placeholder="Not marked"
                    disabled={saveState[m.id] === 'saving'}
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
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
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

// ── Hub Roles Modal ────────────────────────────────────────────────────────────
// Single picks for Hub Lead and Assistant, multi-picks for Recap Leads and
// Prayer Leads (candidates = the hub's own members), plus a multi-pick for IT
// support — an operational support who can cover this hub without being a
// member of it, so its candidate pool is every support in the cohort, not just
// this hub's members.

const toggleIn = (set: Set<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};

// Checkbox list, same look as the IT support picker.
const RoleCheckList: React.FC<{ users: User[]; selected: Set<string>; onToggle: (id: string) => void }> = ({ users, selected, onToggle }) => (
  <ul className="max-h-48 overflow-y-auto divide-y divide-orange-50 rounded-xl border border-orange-100">
    {users.map((u) => (
      <li
        key={u.id}
        onClick={() => onToggle(u.id)}
        className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition ${selected.has(u.id) ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}
      >
        <input type="checkbox" checked={selected.has(u.id)} readOnly tabIndex={-1} className="pointer-events-none h-4 w-4 accent-primary" />
        <span className="flex-1 text-sm text-gray-800">{u.name}</span>
      </li>
    ))}
  </ul>
);

const HubRolesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: (h: SupportHub) => void;
  hub: SupportHub;
  members: User[];
  itSupportCandidates: User[];
  currentItSupportIds: string[];
  onItSupportsSaved: (userIds: string[]) => void;
}> = ({ isOpen, onClose, onSaved, hub, members, itSupportCandidates, currentItSupportIds, onItSupportsSaved }) => {
  const [leadUserId, setLeadUserId] = useState('');
  const [assistantLeadUserId, setAssistantLeadUserId] = useState('');
  const [recapLeadIds, setRecapLeadIds] = useState<Set<string>>(new Set());
  const [prayerLeadIds, setPrayerLeadIds] = useState<Set<string>>(new Set());
  const [itSupportIds, setItSupportIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLeadUserId(hub.leadUserId ?? '');
      setAssistantLeadUserId(hub.assistantLeadUserId ?? '');
      setRecapLeadIds(new Set(hub.recapLeadUserIds ?? []));
      setPrayerLeadIds(new Set(hub.prayerLeadUserIds ?? []));
      setItSupportIds(new Set(currentItSupportIds));
      setErr('');
    }
  }, [isOpen, hub, currentItSupportIds]);

  const toggleItSupport = (id: string) => setItSupportIds((prev) => toggleIn(prev, id));

  const sortedItSupportCandidates = useMemo(
    () => selectedFirst(itSupportCandidates, (u) => itSupportIds.has(u.id)),
    [itSupportCandidates, itSupportIds]
  );

  const memberOptions = [{ value: '', label: '— None —' }, ...members.map((u) => ({ value: u.id, label: u.name }))];
  // The same person can't hold both jobs: each picker excludes whoever is
  // currently picked for the other one — except when they're already the same
  // (an existing saved hub), so that current selection still shows its real
  // name instead of falling back to "— None —".
  const leadOptions = memberOptions.filter((o) => o.value === '' || o.value !== assistantLeadUserId || o.value === leadUserId);
  const assistantOptions = memberOptions.filter((o) => o.value === '' || o.value !== leadUserId || o.value === assistantLeadUserId);
  const sameLeadAndAssistant = !!leadUserId && leadUserId === assistantLeadUserId;

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { hub: updated } = await supportHubsApi.update(hub.id, {
        leadUserId: leadUserId || null,
        assistantLeadUserId: assistantLeadUserId || null,
        // Only current members can hold these, same as the pickers show.
        recapLeadUserIds: members.filter((u) => recapLeadIds.has(u.id)).map((u) => u.id),
        prayerLeadUserIds: members.filter((u) => prayerLeadIds.has(u.id)).map((u) => u.id),
      });
      await supportHubsApi.setItSupports(hub.id, [...itSupportIds]);
      onSaved(updated);
      onItSupportsSaved([...itSupportIds]);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save hub roles');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Hub roles — ${hub.name}`}
      wide
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
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">Add supports to this hub first.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Hub lead</label>
              <AppSelect value={leadUserId} onChange={setLeadUserId} options={leadOptions} placeholder="— None —" compact />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Assistant hub lead</label>
              <AppSelect value={assistantLeadUserId} onChange={setAssistantLeadUserId} options={assistantOptions} placeholder="— None —" compact />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Recap leads</label>
              <RoleCheckList users={members} selected={recapLeadIds} onToggle={(id) => setRecapLeadIds((prev) => toggleIn(prev, id))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Prayer leads</label>
              <RoleCheckList users={members} selected={prayerLeadIds} onToggle={(id) => setPrayerLeadIds((prev) => toggleIn(prev, id))} />
            </div>
          </div>
        )}
        {sameLeadAndAssistant && (
          <p className="-mt-2 rounded-xl bg-amber-100/80 px-3 py-2 text-xs font-semibold text-amber-700">Hub Lead and Assistant should be different people</p>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">IT support</label>
          {itSupportCandidates.length === 0 ? (
            <p className="text-sm text-gray-500">
              No operational supports yet. Set someone's type to Operational support on the{' '}
              <Link to="/supports" className="font-semibold text-primary underline">Supports page</Link> first.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-orange-50 rounded-xl border border-orange-100">
              {sortedItSupportCandidates.map((u) => (
                <li
                  key={u.id}
                  onClick={() => toggleItSupport(u.id)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition ${itSupportIds.has(u.id) ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}
                >
                  <input type="checkbox" checked={itSupportIds.has(u.id)} readOnly tabIndex={-1} className="pointer-events-none h-4 w-4 accent-primary" />
                  <span className="flex-1 text-sm text-gray-800">{u.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save members'}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminHubsPage: React.FC = () => {
  const { ids: teenSupportIds } = useTeenSupportIds(true);
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision, weeks } = useAppData();
  const { can } = usePermissions();
  const canAdd = can('hubs', 'add');
  const canEdit = can('hubs', 'edit');
  const canDelete = can('hubs', 'delete');

  const [hubs, setHubs] = useState<SupportHub[]>([]);
  // Admins set every meeting time and link: each hub's weekly meeting, and the one for Hub Leads.
  const [leadsMeeting, setLeadsMeeting] = useState<HubLeadsMeeting | null>(null);
  const [leadsMeetingOpen, setLeadsMeetingOpen] = useState(false);
  const [meetingTarget, setMeetingTarget] = useState<SupportHub | null>(null);
  // Card columns follow the sm/lg breakpoints. Hubs are dealt across them in
  // turn so they read 1, 2, 3 along each row (CSS columns filled downwards).
  const columnCountFor = (width: number) => (width >= 1024 ? 3 : width >= 640 ? 2 : 1);
  const [columnCount, setColumnCount] = useState(() => columnCountFor(window.innerWidth));
  useEffect(() => {
    const onResize = () => setColumnCount(columnCountFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [memberships, setMemberships] = useState<HubMembership[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupportHub | null>(null);
  const [leadTarget, setLeadTarget] = useState<SupportHub | null>(null);
  const [membersTarget, setMembersTarget] = useState<SupportHub | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupportHub | null>(null);
  // Tap a support's photo or name to see their profile, as on Community.
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [recapTarget, setRecapTarget] = useState<SupportHub | null>(null);
  const [recapByHub, setRecapByHub] = useState<Record<string, { weekId: number; weekNumber: number; marked: number; total: number; absent: number }>>({});
  const [itSupportsByHub, setItSupportsByHub] = useState<Record<string, HubItSupportEntry[]>>({});
  // Members with a note about them, per hub — they get a ★ on the hub card.
  const [notedIdsByHub, setNotedIdsByHub] = useState<Record<string, string[]>>({});
  // A support's kind for this cohort (missing entry = PARTICIPANT_SUPPORT) — used
  // to offer only operational supports as IT-support candidates.
  const [kinds, setKinds] = useState<Record<string, SupportKind>>({});
  // Recap marks for the summary strip, keyed "hubId:weekId" -> { userId: status },
  // covering every week of the cohort (not just summaryWeek) for the "week by
  // week" disclosure. Kept in step by handleRecapMarked.
  const [recapMarksByHubWeek, setRecapMarksByHubWeek] = useState<Record<string, Record<string, SupportAttendanceStatus>>>({});
  const [search, setSearch] = useState('');
  // Filter choices (see FilterBar): hub, lead, recap, teen.
  const [filters, setFilters] = useState<FilterValues>({});

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ hubs: hs }, { memberships: ms }, { users }, { groups: gs }, { sessions: rs, attendance: ra }, { kinds: ks }] = await Promise.all([
        supportHubsApi.getAll(activeCohort.id),
        supportHubsApi.getMembershipsForCohort(activeCohort.id),
        usersApi.getAll(),
        groupsApi.getAll({ cohortId: activeCohort.id }),
        supportSessionsApi.getForCohort(activeCohort.id, ['SUNDAY_RECAP']),
        supportKindApi.getForCohort(activeCohort.id).catch(() => ({ kinds: {} as Record<string, SupportKind> })),
      ]);
      setHubs(hs);
      setMemberships(ms);
      // Test supports stay out of the pickers, unless they already hold a place.
      const heldIds = [...ms.map((m) => m.userId), ...hs.flatMap((h) => [h.leadUserId, h.assistantLeadUserId, ...(h.recapLeadUserIds ?? []), ...(h.prayerLeadUserIds ?? [])])];
      setSupportUsers(sortByText(pickableUsers(users.filter((u) => hasSupportRole(u)), { keepIds: heldIds }), (u) => u.name));
      setGroups(gs);
      setKinds(ks);
      const itSupportEntries = await Promise.all(hs.map((h) => supportHubsApi.getItSupports(h.id).then((res) => res.itSupports).catch(() => [] as HubItSupportEntry[])));
      setItSupportsByHub(Object.fromEntries(hs.map((h, i) => [h.id, itSupportEntries[i]])));
      const notedEntries = await Promise.all(hs.map((h) => supportHubsApi.getMembersWithNotes(h.id).then((res) => res.userIds).catch(() => [] as string[])));
      setNotedIdsByHub(Object.fromEntries(hs.map((h, i) => [h.id, notedEntries[i]])));
      // Fold recap sessions + marks into "hubId:weekId" -> marks for the
      // summary strip's week-by-week table.
      const sessionHubWeek = new Map(rs.map((s) => [s.id, `${s.hubId}:${s.weekId}`]));
      const marksByHubWeek: Record<string, Record<string, SupportAttendanceStatus>> = {};
      ra.forEach((a) => {
        const key = sessionHubWeek.get(a.sessionId);
        if (!key) return;
        (marksByHubWeek[key] ??= {})[a.userId] = a.status;
      });
      setRecapMarksByHubWeek(marksByHubWeek);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  useEffect(() => {
    if (!activeCohort?.id) { setLeadsMeeting(null); return; }
    let cancelled = false;
    myHubApi.getLeadsMeeting(activeCohort.id)
      .then((m) => { if (!cancelled) setLeadsMeeting(m); })
      .catch(() => { if (!cancelled) setLeadsMeeting(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

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
    const idealNumber = getIdealWeekNumberForCohort(activeCohort, new Date(), weeks);
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

  // Keeps the card's summary line in step right after a mark in the panel,
  // without waiting for the next full reload.
  const handleRecapMarked = (hubId: string, weekId: number, marks: Record<string, SupportAttendanceStatus>) => {
    setRecapMarksByHubWeek((prev) => ({ ...prev, [`${hubId}:${weekId}`]: marks }));
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
  // Does this hub fit one chosen choice of one filter group?
  const hubFits = (group: string, choice: string, h: SupportHub): boolean => {
    switch (group) {
      case 'hub': return h.id === choice;
      case 'lead': return choice === 'none' ? !h.leadName : !!h.leadName;
      case 'recap': {
        const summary = recapByHub[h.id];
        const behind = !!summary && summary.total > 0 && summary.marked < summary.total;
        return choice === 'behind' ? behind : !behind && !!summary && summary.total > 0;
      }
      case 'teen': {
        const has = (membersByHub.get(h.id) ?? []).some((id) => !!teenSupportIds?.has(id));
        return choice === 'has' ? has : !has;
      }
      default: return true;
    }
  };
  const matchesSearch = (h: SupportHub) => {
    if (!searchQuery) return true;
    if (h.name.toLowerCase().includes(searchQuery)) return true;
    if (h.leadName && h.leadName.toLowerCase().includes(searchQuery)) return true;
    const memberIds = membersByHub.get(h.id) ?? [];
    return memberIds.some((id) => userById.get(id)?.name.toLowerCase().includes(searchQuery));
  };
  const filteredHubs = hubs.filter((h) =>
    Object.entries(filters).every(([group, choices]) => choices.length === 0 || choices.some((c) => hubFits(group, c, h))) && matchesSearch(h));
  const filterGroups: FilterGroup[] = (() => {
    const opt = (group: string, value: string, label: string) => ({ value, label, count: hubs.filter((h) => hubFits(group, value, h)).length });
    const out: FilterGroup[] = [{ key: 'hub', label: 'Hub', options: hubs.map((h) => opt('hub', h.id, h.name)) }];
    out.push({ key: 'lead', label: 'Hub lead', options: [opt('lead', 'has', 'Has a lead'), opt('lead', 'none', 'No lead yet')] });
    if (Object.keys(recapByHub).length > 0) out.push({ key: 'recap', label: 'Recap', options: [opt('recap', 'behind', 'Recap behind'), opt('recap', 'complete', 'Recap all marked')] });
    if (teenSupportIds && teenSupportIds.size > 0) out.push({ key: 'teen', label: 'Teen Supports', options: [opt('teen', 'has', 'Has a Teen Support'), opt('teen', 'none', 'No Teen Support')] });
    return out;
  })();

  return (
    <div className="page-content">
      <PageHeader
        title="Hubs"
        subtitle={activeCohort ? `${hubs.length} hubs · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && canAdd && (
            <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
              + New Hub
            </button>
          )
        }
      />

      {activeCohort && (
        <>
          <AttendanceSummaryStrip
            hubs={hubs}
            membersByHub={membersByHub}
            weeks={weeks}
            summaryWeek={summaryWeek}
            recapMarksByHubWeek={recapMarksByHubWeek}
          />
          <section className="mb-5 flex items-center gap-4 rounded-[28px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full bg-violet-100/80 px-2.5 py-1 text-xs font-semibold text-violet-700">Hub Leads meeting</span>
              <p className="mt-2 text-[17px] font-bold text-gray-900">
                {formatMeetingSlot(leadsMeeting?.meetingDay, leadsMeeting?.meetingTime, leadsMeeting?.meetingDurationMins) ?? 'Not set yet'}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                {leadsMeeting?.callLink ? 'Link set. Hub Leads meet once a week.' : 'Add a time and link so Hub Leads can join.'}
              </p>
            </div>
            {canEdit && (
              <button type="button" onClick={() => setLeadsMeetingOpen(true)} className="flex-none rounded-full bg-[#f5f5f7] px-4 py-2 text-[13px] font-semibold text-gray-800 active:scale-[0.98]">
                {leadsMeeting?.meetingDay ? 'Edit' : 'Set up'}
              </button>
            )}
          </section>
        </>
      )}

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : hubs.length === 0 ? (
        <div className="rounded-[28px] bg-white py-12 text-center shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
          <p className="text-[15px] text-gray-500">No hubs yet. Create one and add supports.</p>
        </div>
      ) : (
        <>
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
                  placeholder="Search hub, lead or member…"
                  aria-label="Search hubs"
                  className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-[15px] shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-16px_rgba(17,24,39,0.18)] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              }
              searching={searchQuery.length > 0}
              onClear={() => setSearch('')}
              shown={filteredHubs.length}
              total={hubs.length}
              noun="hubs"
            />
          </div>

          {filteredHubs.length === 0 ? (
            <div className="rounded-[28px] bg-white py-12 text-center shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
              <p className="text-[15px] text-gray-500">No hubs match.</p>
            </div>
          ) : (
        // Masonry: each card keeps its own height, hubs dealt across columns in order.
        <div className="flex items-start gap-5">
          {Array.from({ length: columnCount }, (_, col) => filteredHubs.filter((_h, i) => i % columnCount === col)).map((columnHubs, col) => (
          <div key={col} className="flex min-w-0 flex-1 flex-col">
          {columnHubs.map((h) => {
            const memberIds = membersByHub.get(h.id) ?? [];
            // Hub lead, assistant, prayer leads, recap leads, other members, then
            // anyone whose only job here is IT support (IT-only non-members follow).
            const itIds = new Set((itSupportsByHub[h.id] ?? []).map((s) => s.userId));
            const memberRank = (id: string) =>
              id === h.leadUserId ? 0
              : id === h.assistantLeadUserId ? 1
              : (h.prayerLeadUserIds ?? []).includes(id) ? 2
              : (h.recapLeadUserIds ?? []).includes(id) ? 3
              : itIds.has(id) ? 5
              : 4;
            const memberUsers = (memberIds.map((id) => userById.get(id)).filter(Boolean) as User[])
              .map((u, i) => ({ u, i }))
              .sort((a, b) => memberRank(a.u.id) - memberRank(b.u.id) || a.i - b.i)
              .map(({ u }) => u);
            return (
              <div key={h.id} className="mb-5 flex break-inside-avoid flex-col gap-3 rounded-[28px] bg-white px-6 pb-4 pt-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-gray-500">
                      <span className={`h-1.5 w-1.5 flex-none rounded-full ${h.leadName ? 'bg-emerald-500' : 'bg-gray-300'}`} aria-hidden="true" />
                      <span className="truncate">{h.leadName ? `Led by ${h.leadName}` : 'No lead yet'}</span>
                    </span>
                    <h3 className="mt-1 flex items-baseline gap-2 text-[24px] font-bold leading-tight tracking-[-0.02em] text-gray-900">
                      <span className="truncate">{h.name}</span>
                      <span className="flex-none text-[14px] font-normal tracking-normal text-gray-400">{memberUsers.length} {memberUsers.length === 1 ? 'support' : 'supports'}</span>
                    </h3>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {(canEdit || canDelete) && (
                      <AppOverflowMenu
                        align="right"
                        items={[
                          ...(canEdit ? [
                            { label: 'Manage members', onClick: () => setMembersTarget(h) },
                            { label: 'Hub roles', onClick: () => setLeadTarget(h) },
                            { label: 'Meeting time & link', onClick: () => setMeetingTarget(h) },
                            { label: 'Recap attendance', onClick: () => setRecapTarget(h) },
                            { label: 'Edit name', onClick: () => { setEditing(h); setFormOpen(true); } },
                          ] : []),
                          ...(canDelete ? [{ label: 'Delete hub', onClick: () => setDeleteTarget(h), tone: 'danger' as const }] : []),
                        ]}
                      />
                    )}
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

                {memberUsers.length === 0 && (itSupportsByHub[h.id] ?? []).length === 0 ? (
                  <p className="rounded-2xl bg-[#f5f5f7] px-3 py-4 text-center text-[13px] text-gray-500">No supports yet</p>
                ) : (
                  <div className="flex flex-col">
                    {memberUsers.map((u) => {
                      const led = groupBySupportId.get(u.id);
                      const jobs = sortHubJobs(([
                        u.id === h.leadUserId ? 'HUB_LEAD' : null,
                        u.id === h.assistantLeadUserId ? 'ASSISTANT_HUB_LEAD' : null,
                        (h.recapLeadUserIds ?? []).includes(u.id) ? 'RECAP_LEAD' : null,
                        (h.prayerLeadUserIds ?? []).includes(u.id) ? 'PRAYER_LEAD' : null,
                        (itSupportsByHub[h.id] ?? []).some((s) => s.userId === u.id) ? 'IT_SUPPORT' : null,
                      ].filter(Boolean) as HubJob[]));
                      const isPoi = (notedIdsByHub[h.id] ?? []).includes(u.id);
                      return (
                        <div key={u.id} className="flex items-center gap-3 border-t border-[#f0f0f2] py-2.5 first:border-t-0">
                          <button type="button" onClick={() => setProfileUserId(u.id)} aria-label={`View ${u.name}'s profile`} className="flex-none rounded-full">
                            <Avatar name={u.name} avatarUrl={u.avatarUrl} size="md" />
                          </button>
                          <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => setProfileUserId(u.id)} className="block max-w-full truncate text-left text-[15px] font-medium leading-tight text-gray-900 hover:underline">{u.name}</button>
                          {(jobs.length > 0 || isPoi || !!teenSupportIds?.has(u.id)) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {jobs.map((job) => (
                                <span key={job} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${HUB_JOB_INFO[job].pill}`}>{HUB_JOB_INFO[job].label}</span>
                              ))}
                              {!!teenSupportIds?.has(u.id) && <TeenSupportPill />}
                              {isPoi && <SupportNotesStar supportId={u.id} name={u.name} hubId={h.id} />}
                            </div>
                          )}
                          {led && <p className="mt-0.5 text-[12.5px] text-gray-400">Leads {led.name}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {(itSupportsByHub[h.id] ?? [])
                      .filter((s) => !memberUsers.some((u) => u.id === s.userId))
                      .map((s) => (
                        <div key={`it-${s.userId}`} className="flex items-center gap-3 border-t border-[#f0f0f2] py-2.5 first:border-t-0">
                          <button type="button" onClick={() => setProfileUserId(s.userId)} aria-label={`View ${s.name}'s profile`} className="flex-none rounded-full">
                            <Avatar name={s.name} avatarUrl={userById.get(s.userId)?.avatarUrl} size="md" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <button type="button" onClick={() => setProfileUserId(s.userId)} className="block max-w-full truncate text-left text-[15px] font-medium leading-tight text-gray-900 hover:underline">{s.name}</button>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${HUB_JOB_INFO.IT_SUPPORT.pill}`}>{HUB_JOB_INFO.IT_SUPPORT.label}</span>
                              {!!teenSupportIds?.has(s.userId) && <TeenSupportPill />}
                              {(() => {
                                const homeHubs = hubs.filter((x) => (membersByHub.get(x.id) ?? []).includes(s.userId)).map((x) => x.name);
                                return <span className="text-[12.5px] text-gray-400">{homeHubs.length ? `Member of ${homeHubs.join(', ')}` : 'Not in a hub'}</span>;
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
          ))}
        </div>
          )}
        </>
      )}

      <MeetingSetModal
        isOpen={leadsMeetingOpen}
        onClose={() => setLeadsMeetingOpen(false)}
        title="Hub Leads meeting"
        subtitle="One meeting a week for all Hub Leads. Only admins can change it."
        slot={{ meetingDay: leadsMeeting?.meetingDay ?? null, meetingTime: leadsMeeting?.meetingTime ?? null, meetingDurationMins: leadsMeeting?.meetingDurationMins ?? null }}
        callPlatform={leadsMeeting?.callPlatform ?? null}
        callLink={leadsMeeting?.callLink ?? null}
        resetKey={activeCohort?.id ?? ''}
        linkLabel="Meeting Call Link"
        tellLabel="Tell the Hub Leads"
        onSave={async (input, notify) => {
          if (!activeCohort) return;
          setLeadsMeeting(await myHubApi.setLeadsMeeting(activeCohort.id, input, notify));
        }}
      />

      <MeetingSetModal
        isOpen={!!meetingTarget}
        onClose={() => setMeetingTarget(null)}
        title={meetingTarget ? `${meetingTarget.name} meeting` : 'Hub meeting'}
        subtitle="The hub's weekly meeting. Only admins can change it."
        slot={{ meetingDay: meetingTarget?.meetingDay ?? null, meetingTime: meetingTarget?.meetingTime ?? null, meetingDurationMins: meetingTarget?.meetingDurationMins ?? null }}
        callPlatform={meetingTarget?.callPlatform ?? null}
        callLink={meetingTarget?.callLink ?? null}
        resetKey={meetingTarget?.id ?? ''}
        linkLabel="Meeting Call Link"
        tellLabel="Tell the hub"
        onSave={async (input, notify) => {
          if (!meetingTarget) return;
          await myHubApi.updateMeeting(meetingTarget.id, input, notify);
          const patch = { meetingDay: input.meetingDay, meetingTime: input.meetingTime, meetingDurationMins: input.meetingDurationMins, callPlatform: input.callPlatform, callLink: input.callLink };
          setHubs((prev) => prev.map((x) => (x.id === meetingTarget.id ? { ...x, ...patch } : x)));
        }}
      />

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
        <HubRolesModal
          isOpen={!!leadTarget}
          onClose={() => setLeadTarget(null)}
          hub={leadTarget}
          members={(membersByHub.get(leadTarget.id) ?? []).map((id) => userById.get(id)).filter(Boolean) as User[]}
          itSupportCandidates={(() => {
            const currentIds = new Set((itSupportsByHub[leadTarget.id] ?? []).map((s) => s.userId));
            // Operational supports are the intended pool; a support already
            // ticked keeps showing even if their kind isn't (yet) Operational,
            // so changing kind elsewhere never silently drops them here.
            return supportUsers.filter((u) => kinds[u.id] === 'OPERATIONAL' || currentIds.has(u.id));
          })()}
          currentItSupportIds={(itSupportsByHub[leadTarget.id] ?? []).map((s) => s.userId)}
          onSaved={(h) => { setHubs((prev) => prev.map((x) => (x.id === h.id ? h : x))); setLeadTarget(null); }}
          onItSupportsSaved={(userIds) => setItSupportsByHub((prev) => ({
            ...prev,
            [leadTarget.id]: userIds.map((id) => ({ userId: id, name: userById.get(id)?.name ?? '' })),
          }))}
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
          defaultWeekId={summaryWeek?.id ?? getIdealWeekForCohort(activeCohort, weeks)?.id ?? null}
          onMarked={handleRecapMarked}
        />
      )}

      <HubAuthorProfileModal userId={profileUserId} isOpen={!!profileUserId} onClose={() => setProfileUserId(null)} />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete hub"
        message={`Delete "${deleteTarget?.name}"? Its members, recap records, notes and messages are removed too. This can't be undone.`}
        confirmText="Delete"
      />

    </div>
  );
};

export default AdminHubsPage;
