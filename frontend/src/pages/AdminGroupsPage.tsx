import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import FilterBar, { describeFilters, type FilterGroup } from '../components/filters/FilterBar';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { cohortsApi, groupsApi, participantsApi, settingsApi, supportKindApi, supportSessionsApi, supportTagsApi, usersApi } from '../services/api';
import type { Group, Participant, User, GroupCallPlatform, SupportKind, SupportSession, SupportTag } from '../types';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import Avatar from '../components/Avatar';
import GroupsExportPopup from '../components/groups/GroupsExportPopup';
import GroupEngineWizard from '../components/groups/GroupEngineWizard';
import NewGroupChooser from '../components/groups/NewGroupChooser';
import { nextGroupNames } from '../utils/groupingEngine';
import GroupMeetingSlotEditor, { type MeetingSlot } from '../components/GroupMeetingSlotEditor';
import PageLoader from '../components/PageLoader';
import { pickableUsers } from '../utils/testUsers';
import TestSupportsToggle from '../components/TestSupportsToggle';
import { sortByText } from '../utils/sort';
import { selectedFirst } from '../utils/selectedFirst';
import { reconcileById } from '../utils/reconcile';
import { buildTrainingCounts, trainingCountFor, DEFAULT_PROGRAMME_RULES } from '../utils/programmeRules';
import { normalizeLink } from '../utils/links';
import Spinner from '../components/Spinner';
import { genderAgeLine, hasSupportRole } from '../utils/people';

// ── Training (Phase 4) ────────────────────────────────────────────────────────
// Shared by GroupFormModal and AssignSupportModal: a support who attended fewer
// than the cohort's minimum pre-cohort trainings is shown with a notice, and can
// still be saved as a group's support (it used to need an override with a reason,
// saved as an ELIGIBILITY_OVERRIDE support note; those old notes are still read).
// Operational supports and hub leads are not expected to do the training, so they are not flagged.

const trainingLabel = (counts: Map<string, { attended: number; total: number }>, userId: string, total: number) => {
  if (total === 0) return '';
  const c = trainingCountFor(counts, userId, total);
  return ` · ${c.attended}/${c.total} trainings`;
};

// Options for the support pickers. A support who attended none of the pre-cohort
// trainings gets an amber warning line, so it is clear before they are picked.
const supportOptions = (
  users: User[],
  counts: Map<string, { attended: number; total: number }>,
  total: number,
  kinds?: Record<string, SupportKind> | null,
) => users.map((u) => {
  const c = trainingCountFor(counts, u.id, total);
  return {
    value: u.id,
    label: `${u.name}${trainingLabel(counts, u.id, total)}`,
    meta: kinds?.[u.id] === 'OPERATIONAL' ? 'Operational support' : kinds?.[u.id] === 'HUB_LEAD' ? 'Hub lead' : undefined,
    warning: c.total > 0 && c.attended === 0 && (kinds?.[u.id] ?? 'PARTICIPANT_SUPPORT') === 'PARTICIPANT_SUPPORT' ? 'Attended no training' : undefined,
  };
});

// Missing pre-cohort training is shown, never a reason to stop a support leading a group.
const TrainingNotice: React.FC<{ supportName: string; attended: number; total: number }> = ({ supportName, attended, total }) => (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
    <p className="text-sm font-semibold text-amber-700">Missed pre-cohort training</p>
    <p className="mt-0.5 text-xs text-amber-700">{supportName} attended {attended} of {total} pre-cohort training{total === 1 ? '' : 's'} this cohort. You can still make them the support.</p>
  </div>
);

const groupNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const NO_SUPPORT_OPTION = '__no_support__';

const sortGroupsByName = (groups: Group[]) =>
  [...groups].sort((a, b) => groupNameCollator.compare(a.name, b.name));

// ── Group Form Modal ──────────────────────────────────────────────────────────

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (g: Group) => void;
  cohortId: string;
  existing?: Group | null;
  supportUsers: User[];
  /** With test supports on the system, the pickers can show them on request. */
  testSupportsToggle?: { value: boolean; onChange: (value: boolean) => void };
  trainingCounts: Map<string, { attended: number; total: number }>;
  trainingsTotal: number;
  minTrainingsAttended: number;
  /** Each support's kind, to tag operational supports in the picker. */
  supportKinds?: Record<string, SupportKind> | null;
}

const GroupFormModal: React.FC<GroupFormModalProps> = ({ isOpen, onClose, onSaved, cohortId, existing, supportUsers, testSupportsToggle, trainingCounts, trainingsTotal, minTrainingsAttended, supportKinds }) => {
  const [name, setName] = useState('');
  const [supportId, setSupportId] = useState('');
  const [slot, setSlot] = useState<MeetingSlot>({ meetingDay: null, meetingTime: null, meetingDurationMins: null });
  const [callPlatform, setCallPlatform] = useState<GroupCallPlatform>('WHATSAPP');
  const [callLink, setCallLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setSupportId(existing?.supportId ?? '');
      setSlot({
        meetingDay: existing?.meetingDay ?? null,
        meetingTime: existing?.meetingTime ?? null,
        meetingDurationMins: existing?.meetingDurationMins ?? null,
      });
      setCallPlatform(existing?.callPlatform ?? 'WHATSAPP');
      setCallLink(existing?.callLink ?? '');
      setErr('');
    }
  }, [isOpen, existing]);

  const selectedSupport = supportUsers.find((u) => u.id === supportId);
  const counts = supportId ? trainingCountFor(trainingCounts, supportId, trainingsTotal) : null;
  const missedTraining = !!counts && counts.total > 0 && counts.attended < minTrainingsAttended && (supportKinds?.[supportId] ?? 'PARTICIPANT_SUPPORT') === 'PARTICIPANT_SUPPORT';

  const handleSave = async () => {
    if (!name.trim()) { setErr('Group name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      let result: Group;
      if (existing) {
        ({ group: result } = await groupsApi.update(existing.id, {
          name: name.trim(),
          supportId: supportId || null,
          ...slot,
          callPlatform,
          callLink: callLink.trim() ? normalizeLink(callLink) : null,
        }));
      } else {
        ({ group: result } = await groupsApi.create({
          cohortId,
          name: name.trim(),
          supportId: supportId || null,
          ...slot,
        }));
      }
      onSaved(result);
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
      title={existing ? 'Edit Group' : 'Create Group'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Group name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Group A"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned support</label>
          <AppSelect
            value={supportId}
            onChange={setSupportId}
            options={[
              { value: '', label: '— None —' },
              ...supportOptions(supportUsers, trainingCounts, trainingsTotal, supportKinds),
            ]}
            placeholder="— None —"
            compact
          />
          {testSupportsToggle && <TestSupportsToggle checked={testSupportsToggle.value} onChange={testSupportsToggle.onChange} className="mt-2" />}
        </div>
        {missedTraining && counts && selectedSupport && (
          <TrainingNotice supportName={selectedSupport.name} attended={counts.attended} total={counts.total} />
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Weekly meeting slot</label>
          <GroupMeetingSlotEditor value={slot} onChange={setSlot} />
        </div>
        {existing && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Group Call Link</label>
            <input
              type="url"
              value={callLink}
              onChange={(e) => setCallLink(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Paste the group call link"
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// ── Assign Support Modal ──────────────────────────────────────────────────────
// A focused action: pick (or clear) the support person for one group. Reuses
// groupsApi.update — the same mechanism the Edit modal uses — so it's just a
// quicker path to the support field.

interface AssignSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (g: Group) => void;
  group: Group;
  supportUsers: User[];
  /** With test supports on the system, the pickers can show them on request. */
  testSupportsToggle?: { value: boolean; onChange: (value: boolean) => void };
  trainingCounts: Map<string, { attended: number; total: number }>;
  trainingsTotal: number;
  minTrainingsAttended: number;
  /** Each support's kind, to tag operational supports in the picker. */
  supportKinds?: Record<string, SupportKind> | null;
}

const AssignSupportModal: React.FC<AssignSupportModalProps> = ({ isOpen, onClose, onSaved, group, supportUsers, testSupportsToggle, trainingCounts, trainingsTotal, minTrainingsAttended, supportKinds }) => {
  const [supportId, setSupportId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSupportId(group.supportId ?? '');
      setErr('');
    }
  }, [isOpen, group]);

  const selectedSupport = supportUsers.find((u) => u.id === supportId);
  const counts = supportId ? trainingCountFor(trainingCounts, supportId, trainingsTotal) : null;
  const missedTraining = !!counts && counts.total > 0 && counts.attended < minTrainingsAttended && (supportKinds?.[supportId] ?? 'PARTICIPANT_SUPPORT') === 'PARTICIPANT_SUPPORT';

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { group: result } = await groupsApi.update(group.id, { supportId: supportId || null });
      onSaved(result);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to assign support');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign support — ${group.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned support</label>
          <AppSelect
            value={supportId}
            onChange={setSupportId}
            options={[
              { value: '', label: '— None —' },
              ...supportOptions(supportUsers, trainingCounts, trainingsTotal, supportKinds),
            ]}
            placeholder="— None —"
            compact
          />
          {testSupportsToggle && <TestSupportsToggle checked={testSupportsToggle.value} onChange={testSupportsToggle.onChange} className="mt-2" />}
        </div>
        {missedTraining && counts && selectedSupport && (
          <TrainingNotice supportName={selectedSupport.name} attended={counts.attended} total={counts.total} />
        )}
      </div>
    </ModalShell>
  );
};

// ── Manage Members Modal ──────────────────────────────────────────────────────

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group;
  allParticipants: Participant[];
  onUpdated: (g: Group, memberIds: string[]) => void;
}

const MembersModal: React.FC<MembersModalProps> = ({ isOpen, onClose, group, allParticipants, onUpdated }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setErr('');
    void groupsApi.getParticipants(group.id)
      .then(({ participants }) => {
        setSelected(new Set(participants.map((p) => p.id)));
      })
      .catch(() => setErr('Failed to load members'))
      .finally(() => setLoading(false));
  }, [isOpen, group.id]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const memberIds = [...selected];
      await groupsApi.setParticipants(group.id, memberIds);
      onUpdated({ ...group, participantCount: selected.size }, memberIds);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save members');
    } finally {
      setSaving(false);
    }
  };

  const [search, setSearch] = useState('');
  // Only offer participants who aren't already in another group — assignable
  // means unassigned, or already a member of THIS group (so current members
  // still show and can be toggled off). Anyone in a different group is hidden.
  const assignable = useMemo(
    () => allParticipants.filter((p) => !p.groupId || p.groupId === group.id || selected.has(p.id)),
    [allParticipants, group.id, selected]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? assignable.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q))
      : assignable;
    return selectedFirst(list, (p) => selected.has(p.id));
  }, [assignable, search, selected]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Members — ${group.name}`}
      subtitle={`${selected.size} selected`}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || loading} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save members'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants…"
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading ? (
          <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
        ) : (
          // On mobile the search keyboard otherwise eats the first tap on a row
          // (tap 1 blurs the input, tap 2 selects). Dismiss the keyboard as soon
          // as the user starts scrolling the list, and toggle on pointerdown so
          // the first tap always registers.
          <ul
            className="max-h-80 touch-pan-y overflow-y-auto divide-y divide-gray-100"
            onTouchMove={() => searchRef.current?.blur()}
          >
            {filtered.map((p) => (
              <li
                key={p.id}
                onPointerDown={(e) => { e.preventDefault(); searchRef.current?.blur(); toggle(p.id); }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg py-2.5 transition ${selected.has(p.id) ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  readOnly
                  tabIndex={-1}
                  className="pointer-events-none h-4 w-4 accent-primary"
                />
                <span className="flex-1 text-sm text-gray-800">
                  {p.fullName}
                  {p.phone && <span className="ml-2 text-xs text-gray-400">{p.phone}</span>}
                </span>
              </li>
            ))}
            {filtered.length === 0 && <li className="py-4 text-center text-sm text-gray-400">No participants found</li>}
          </ul>
        )}
      </div>
    </ModalShell>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminGroupsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminGroupsContent />;
};

const AdminGroupsContent: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  // A Teen Support's teens, kept apart: no meetings or recaps, Sunday attendance only.
  const [teenGroups, setTeenGroups] = useState<Group[]>([]);
  const [teenFlowOn, setTeenFlowOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  // Every support; test accounts are hidden from the pickers unless asked for.
  const [allSupportUsers, setAllSupportUsers] = useState<User[]>([]);
  const [showTestSupports, setShowTestSupports] = useState(false);
  const supportUsers = useMemo(
    () => pickableUsers(allSupportUsers, { includeTest: showTestSupports, keepIds: groups.map((g) => g.supportId) }),
    [allSupportUsers, showTestSupports, groups],
  );
  const hasTestSupports = allSupportUsers.some((u) => u.isTest);
  // What decides who can be put on a group: who is in this cohort, their kind
  // and tags. If any of these fail to load the list is not narrowed by it.
  const [cohortMemberIds, setCohortMemberIds] = useState<Set<string> | null>(null);
  const [supportKinds, setSupportKinds] = useState<Record<string, SupportKind> | null>(null);
  const [supportTags, setSupportTags] = useState<SupportTag[] | null>(null);
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Array<{ sessionId: string; userId: string; status: string }>>([]);
  const [minTrainingsAttended, setMinTrainingsAttended] = useState(DEFAULT_PROGRAMME_RULES.minTrainingsAttended);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [membersTarget, setMembersTarget] = useState<Group | null>(null);
  const [supportTarget, setSupportTarget] = useState<Group | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Group | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);

  // "Open group" elsewhere (the Supports page) links straight to one group as
  // /groups?group=<id>, so the URL — not local state — decides what's in view.
  // That keeps the link shareable and survives a refresh.
  // Each filter takes several choices at once and lives in the address (`?group=` is what the Supports page links to).
  const [filters, setFilters] = useUrlFilters(['group', 'support', 'type', 'people']);

  // `silent` background refreshes (triggered by realtime liveRevision bumps)
  // update the data in place WITHOUT flipping `loading`, so the grid doesn't
  // flash a full-page "Loading…" every time anything changes in the cohort.
  const load = useCallback(async (silent = false) => {
    if (!activeCohort) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [{ groups: allGs }, { participants: ps }, { users }, { sessions: ts, attendance: ta }, rules, teenOn, members, kindMap, tagList] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id, includeArchived: showArchived, includeTeenGroups: true }),
        participantsApi.getAll({ cohortId: activeCohort.id }),
        usersApi.getAll(),
        supportSessionsApi.getForCohort(activeCohort.id, ['PRE_COHORT_TRAINING']),
        settingsApi.getProgrammeRules(),
        settingsApi.getTeenFlowEnabled().catch(() => false),
        cohortsApi.getMembers(activeCohort.id).then((r) => new Set(r.users.map((u) => u.id))).catch(() => null),
        supportKindApi.getForCohort(activeCohort.id).then((r) => r.kinds).catch(() => null),
        supportTagsApi.getAll().then((r) => r.tags).catch(() => null),
      ]);
      setCohortMemberIds(members);
      setSupportKinds(kindMap);
      setSupportTags(tagList);
      const gs = allGs.filter((g) => !g.isTeenGroup);
      const sortedTeenGs = sortGroupsByName(allGs.filter((g) => g.isTeenGroup));
      setTeenFlowOn(teenOn);
      const sortedGs = sortGroupsByName(gs);
      const sortedPs = sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName);
      const sortedUsers = sortByText(users.filter((u) => hasSupportRole(u)), (user) => user.name);
      if (silent) {
        // Merge by id so unchanged rows keep their reference — avoids the
        // full-grid re-render / scroll-jump on every realtime refresh.
        setGroups((prev) => reconcileById(prev, sortedGs));
        setTeenGroups((prev) => reconcileById(prev, sortedTeenGs));
        setParticipants((prev) => reconcileById(prev, sortedPs));
        setAllSupportUsers((prev) => reconcileById(prev, sortedUsers));
      } else {
        setGroups(sortedGs);
        setTeenGroups(sortedTeenGs);
        setParticipants(sortedPs);
        setAllSupportUsers(sortedUsers);
      }
      setTrainingSessions(ts);
      setTrainingAttendance(ta);
      setMinTrainingsAttended(rules.minTrainingsAttended);
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [activeCohort, showArchived]);

  const trainingsTotal = trainingSessions.length;
  const trainingCounts = useMemo(
    () => buildTrainingCounts(trainingSessions.map((s) => s.id), trainingAttendance),
    [trainingSessions, trainingAttendance]
  );

  // Who the group pickers offer. Left out: people who are inactive or not in this
  // cohort, Teen Supports (they look after teens in their own groups) and anyone who
  // already leads another group. Operational supports and hub leads are offered
  // (tagged), and a support who missed the pre-cohort training is offered too (shown
  // in the list and on a notice, never blocked). Whoever is on the group being edited stays.
  const supportsFor = useCallback((group: Group | null): User[] => {
    const teenSupportIds = new Set((supportTags ?? []).filter((t) => t.systemKey === 'TEEN_SUPPORT').flatMap((t) => t.userIds));
    const leading = new Set(groups.filter((g) => g.id !== group?.id && !g.archivedAt && g.supportId).map((g) => g.supportId as string));
    return supportUsers.filter((u) => {
      if (u.id === group?.supportId) return true;
      if (u.isActive === false) return false;
      if (cohortMemberIds && !cohortMemberIds.has(u.id)) return false;
      if (teenSupportIds.has(u.id)) return false;
      return !leading.has(u.id);
    });
  }, [supportUsers, supportTags, cohortMemberIds, groups]);

  // Initial / cohort-change load shows the loader.
  useEffect(() => { void load(false); }, [load]);
  // Realtime updates refresh silently (no flash). Skip the very first run since
  // the load above already covers it.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!didInitialLoad.current) { didInitialLoad.current = true; return; }
    void load(true);
  }, [liveRevision, load]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const g = archiveTarget;
    try {
      await groupsApi.archive(g.id, user?.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch { /* ignore */ }
    finally { setArchiveTarget(null); }
  };

  const handleRestore = async (group: Group) => {
    try {
      const { group: restored } = await groupsApi.unarchive(group.id);
      setGroups((prev) => sortGroupsByName(prev.map((entry) => entry.id === restored.id ? restored : entry)));
    } catch { /* ignore */ }
  };

  // Members per group, derived from the already-loaded participants list (no
  // extra fetch). Used to render the inline expandable member chips.
  const membersByGroupId = useMemo(() => {
    const map = new Map<string, Participant[]>();
    participants.forEach((p) => {
      if (!p.groupId) return;
      const list = map.get(p.groupId);
      if (list) list.push(p); else map.set(p.groupId, [p]);
    });
    return map;
  }, [participants]);

  // Does this group fit one chosen choice of one filter group?
  const groupFits = (key: string, choice: string, g: Group): boolean => {
    switch (key) {
      case 'group': return g.id === choice;
      case 'support': return choice === NO_SUPPORT_OPTION ? !g.supportId : g.supportId === choice;
      case 'type': return choice === 'teen' ? !!g.isTeenGroup : !g.isTeenGroup;
      case 'people': return choice === 'empty' ? (membersByGroupId.get(g.id)?.length ?? 0) === 0 : (membersByGroupId.get(g.id)?.length ?? 0) > 0;
      default: return true;
    }
  };
  // Within a filter any chosen choice matches; every filter that has a choice must match.
  const displayedGroups = groups.filter((g) => Object.entries(filters).every(([key, choices]) => choices.length === 0 || choices.some((c) => groupFits(key, c, g))));
  const filterGroups: FilterGroup[] = (() => {
    const opt = (key: string, value: string, label: string) => ({ value, label, count: groups.filter((g) => groupFits(key, value, g)).length });
    const out: FilterGroup[] = [];
    if (groups.some((g) => g.isTeenGroup)) out.push({ key: 'type', label: 'Adults or teens', options: [opt('type', 'adult', 'Adult groups'), opt('type', 'teen', 'Teen groups')] });
    out.push({ key: 'group', label: 'Group', options: groups.map((g) => opt('group', g.id, g.name)) });
    if (supportUsers.length > 0) {
      out.push({
        key: 'support',
        label: 'Support',
        options: [opt('support', NO_SUPPORT_OPTION, 'No support assigned'), ...supportUsers.map((u) => opt('support', u.id, u.name))],
      });
    }
    out.push({ key: 'people', label: 'Members', options: [opt('people', 'empty', 'Empty'), opt('people', 'has', 'Has participants')] });
    return out;
  })();

  // Teens (18 and below) are grouped by their Teen Support, never by the builder, so
  // once teen handling is on they are left out of the "not in a group yet" counts.
  const groupablePeople = useMemo(
    () => (teenFlowOn ? participants.filter((p) => p.ageRange !== '18 and below') : participants),
    [participants, teenFlowOn]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Groups"
        tourId="admin:groups"
        subtitle={activeCohort ? `${groups.length} groups · ${participants.filter((p) => !p.isTest).length} participants · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigate('/allocation')} className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">
                Allocate participants
              </button>
              <button type="button" onClick={() => setChooserOpen(true)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + New Group
              </button>
              <AppOverflowMenu
                align="right"
                items={[
                  { label: 'Export for WhatsApp', onClick: () => setExportOpen(true) },
                ]}
              />
            </div>
          )
        }
      />

      {activeCohort && !loading && (
        <div data-wt="groups-filters" className="mb-4">
          <FilterBar
            groups={filterGroups}
            value={filters}
            onChange={setFilters}
            toggles={[{ key: 'archived', label: 'Show archived groups', value: showArchived, onChange: setShowArchived, hint: 'Include groups that were archived.' }]}
            shown={displayedGroups.length}
            total={groups.length}
            noun="groups"
          />
        </div>
      )}

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">No groups yet.</p>
          <button type="button" onClick={() => setChooserOpen(true)} className="mt-3 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
            Build groups
          </button>
        </div>
      ) : displayedGroups.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">All groups have a support assigned.</p>
        </div>
      ) : (
        <div data-wt="groups-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedGroups.map((g) => {
            const members = membersByGroupId.get(g.id) ?? [];
            return (
              <div key={g.id} className="flex flex-col gap-3 surface-card p-5">
                {/* Header: name + support subtitle on the left; count badge +
                    overflow menu on the right (mirrors the allocation columns). */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-gray-900">{g.name}</h3>
                    <p className={`truncate text-xs ${g.supportName ? 'text-gray-500' : 'text-neutral-400'}`}>
                      {g.supportName || 'No support assigned'}
                    </p>
                    {g.archivedAt && <p className="mt-1 text-[11px] font-semibold text-amber-700">Archived</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                      {g.participantCount ?? members.length}
                    </span>
                    <AppOverflowMenu
                      align="right"
                      items={g.archivedAt
                        ? [{ label: 'Restore group', onClick: () => void handleRestore(g) }]
                        : [
                            ...(g.supportId ? [{ label: 'Open group & discussion', onClick: () => navigate(`/group-view/${g.supportId}?cohort=${g.cohortId}`) }] : []),
                            { label: 'Manage members', onClick: () => setMembersTarget(g) },
                            { label: 'Assign support', onClick: () => setSupportTarget(g) },
                            { label: 'Edit', onClick: () => { setEditing(g); setFormOpen(true); } },
                            { label: 'Archive group', onClick: () => setArchiveTarget(g), tone: 'danger' },
                          ]}
                    />
                  </div>
                </div>

                {/* Members always visible at a glance — name + phone cards. */}
                {members.length === 0 ? (
                  <p className="rounded-xl bg-gray-50/80 px-3 py-4 text-center text-xs text-gray-400">No members yet</p>
                ) : (
                  <div className="flex flex-col">
                    {members.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1.5">
                        <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight text-gray-900">{p.fullName}</p>
                          <p className="truncate text-xs text-gray-400">{[p.phone, genderAgeLine(p)].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeCohort && !loading && teenGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-gray-900">Teen groups</h2>
          <p className="mb-3 text-xs text-gray-500">Each Teen Support's teens. No meetings or recaps; Sunday attendance only.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teenGroups.map((g) => {
              const members = membersByGroupId.get(g.id) ?? [];
              return (
                <div key={g.id} className="flex flex-col gap-3 surface-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-gray-900">{g.name}</h3>
                      <p className="truncate text-xs text-gray-500">{g.supportName || 'No support assigned'}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-pink-100/80 px-2.5 py-0.5 text-xs font-semibold text-pink-700">Teen</span>
                      <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{g.participantCount ?? members.length}</span>
                    </div>
                  </div>
                  {members.length === 0 ? (
                    <p className="rounded-xl bg-gray-50/80 px-3 py-4 text-center text-xs text-gray-400">No teens yet</p>
                  ) : (
                    <div className="flex flex-col">
                      {members.map((p) => (
                        <div key={p.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1.5">
                          <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight text-gray-900">{p.fullName}</p>
                            <p className="truncate text-xs text-gray-400">{[p.guardianPhone ?? p.phone, genderAgeLine(p)].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <GroupFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={(g) => {
          setGroups((prev) => {
            const idx = prev.findIndex((x) => x.id === g.id);
            const next = idx >= 0 ? prev.map((x) => x.id === g.id ? g : x) : [...prev, g];
            return sortGroupsByName(next);
          });
        }}
        cohortId={activeCohort?.id ?? ''}
        existing={editing}
        supportUsers={supportsFor(editing)}
        supportKinds={supportKinds}
        testSupportsToggle={hasTestSupports ? { value: showTestSupports, onChange: setShowTestSupports } : undefined}
        trainingCounts={trainingCounts}
        trainingsTotal={trainingsTotal}
        minTrainingsAttended={minTrainingsAttended}
      />

      {supportTarget && (
        <AssignSupportModal
          isOpen={!!supportTarget}
          onClose={() => setSupportTarget(null)}
          group={supportTarget}
          supportUsers={supportsFor(supportTarget)}
          supportKinds={supportKinds}
        testSupportsToggle={hasTestSupports ? { value: showTestSupports, onChange: setShowTestSupports } : undefined}
          trainingCounts={trainingCounts}
          trainingsTotal={trainingsTotal}
          minTrainingsAttended={minTrainingsAttended}
          onSaved={(g) => {
            setGroups((prev) => sortGroupsByName(prev.map((x) => x.id === g.id ? g : x)));
            setSupportTarget(null);
          }}
        />
      )}

      {membersTarget && (
        <MembersModal
          isOpen={!!membersTarget}
          onClose={() => setMembersTarget(null)}
          group={membersTarget}
          allParticipants={participants}
          onUpdated={(g, memberIds) => {
            setGroups((prev) => sortGroupsByName(prev.map((x) => x.id === g.id ? g : x)));
            // Reflect the new membership in `participants` immediately so the
            // group cards (derived from this list) update without a reload.
            const memberSet = new Set(memberIds);
            setParticipants((prev) => prev.map((p) => {
              if (memberSet.has(p.id)) {
                return p.groupId === g.id ? p : { ...p, groupId: g.id, groupName: g.name };
              }
              if (p.groupId === g.id) {
                return { ...p, groupId: null, groupName: null };
              }
              return p;
            }));
            setMembersTarget(null);
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { void handleArchive(); }}
        title="Archive group"
        message={`Archive "${archiveTarget?.name}"? Its members and history stay preserved, but it will be hidden from active group and allocation views.`}
        confirmText="Archive"
      />

      <NewGroupChooser
        isOpen={chooserOpen}
        onClose={() => setChooserOpen(false)}
        ungroupedCount={groupablePeople.filter((p) => !p.groupId).length}
        onEngine={() => { setChooserOpen(false); setEngineOpen(true); }}
        onManual={() => { setChooserOpen(false); setEditing(null); setFormOpen(true); }}
        onEmpty={async (count) => {
          if (!activeCohort) return;
          const names = nextGroupNames(groups.map((g) => g.name), count);
          for (const name of names) {
            await groupsApi.create({ cohortId: activeCohort.id, name, supportId: null });
          }
          setChooserOpen(false);
          await load(true);
        }}
      />

      {activeCohort && (
        <GroupEngineWizard
          isOpen={engineOpen}
          onClose={() => setEngineOpen(false)}
          onCreated={() => void load(true)}
          cohortId={activeCohort.id}
          cohortName={activeCohort.name}
          participants={groupablePeople}
          groups={groups}
          // The automatic builder never places a test support.
          supportUsers={pickableUsers(allSupportUsers)}
          trainingCounts={trainingCounts}
          trainingsTotal={trainingsTotal}
          minTrainingsAttended={minTrainingsAttended}
        />
      )}

      {exportOpen && (
        <GroupsExportPopup
          groups={displayedGroups}
          membersByGroupId={membersByGroupId}
          cohortName={activeCohort?.name ?? 'Cohort'}
          unassignedParticipants={groupablePeople.filter((p) => !p.groupId).length}
          filters={[
            ...describeFilters(filterGroups, filters),
            showArchived ? 'Including archived' : '',
          ].filter(Boolean)}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminGroupsPage;
