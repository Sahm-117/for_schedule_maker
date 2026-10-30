import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import OpenRecordingModal from '../components/hubs/OpenRecordingModal';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import FilterBar, { describeFilters, type FilterGroup } from '../components/filters/FilterBar';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { cohortsApi, groupDiscussionApi, groupsApi, participantPushApi, participantsApi, settingsApi, supportHubsApi, supportKindApi, supportSessionsApi, supportTagsApi, usersApi } from '../services/api';
import type { Group, OnboardingProgressParticipant, Participant, ParticipantAppInfo, User, GroupCallPlatform, SupportKind, SupportSession, SupportTag } from '../types';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import Avatar from '../components/Avatar';
import AccessChip from '../components/groups/AccessChip';
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
import { REGISTRATION_STATUS_META } from '../utils/followUps';
import { AGE_RANGE_OPTIONS } from '../constants/departments';
import TeenMoveModal from '../components/groups/TeenMoveModal';
import GroupCard from '../components/groups/GroupCard';
import SupportStepsOverrideModal from '../components/groups/SupportStepsOverrideModal';
import { ONBOARDING_CHIP_LABEL, summarizeGroupOnboarding, type GroupOnboardingSummary, type OnboardingChip } from '../utils/groupOnboarding';
import { useToast } from '../components/Toast';
import { isTeenAgeRange, normaliseAgeRange, normaliseGender } from '../utils/groupingRules';

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
const ONBOARDING_CHIPS: OnboardingChip[] = ['overdue', 'in_progress', 'not_started', 'onboarded'];
const NO_SUPPORT_OPTION = '__no_support__';
const NO_HUB_OPTION = '__no_hub__';

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
  const [slot, setSlot] = useState<MeetingSlot>({ meetingDay: null, meetingTime: null });
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
  /** The group's support's gender ('Male' / 'Female'), so the list starts with people who match; null when unknown. */
  supportGender: string | null;
  /** Teen handling is on: teens are grouped through a Teen Support, so an adult group does not offer them. */
  hideTeens: boolean;
  onUpdated: (g: Group, memberIds: string[]) => void;
}

// Sign-up statuses of people not joining this cohort; hidden by default when assigning members.
const NOT_JOINING_STATUSES = new Set<string>(['NO_RESPONSE', 'NEXT_COHORT']);
const isNotJoining = (p: Participant) => !!p.followUpNoResponse || (!!p.followUpStatus && NOT_JOINING_STATUSES.has(p.followUpStatus));
// Readiest first: confirmed access, then login shared, then registered, then everyone else, then those not joining.
const readinessRank = (p: Participant) => {
  if (isNotJoining(p)) return 4;
  switch (p.followUpStatus) {
    case 'ACCESS_CONFIRMED': case 'ATTENDED': return 0;
    case 'LOGIN_SHARED': return 1;
    case 'REGISTERED': return 2;
    default: return 3;
  }
};

const MembersModal: React.FC<MembersModalProps> = ({ isOpen, onClose, group, allParticipants, supportGender, hideTeens, onUpdated }) => {
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
  // Starts on the support's gender; "Everyone" shows all. People already ticked always stay in the list.
  const [genderView, setGenderView] = useState<string>('all');
  const [hideNotJoining, setHideNotJoining] = useState(true);
  // Age ranges to show; empty = every age. Several at once.
  const [ageView, setAgeView] = useState<Set<string>>(new Set());
  // Reset on opening. The support's gender may arrive a moment later (supports load separately): it then sets the gender
  // view only if the admin has not picked one yet, and never clears what they typed or chose.
  const genderPicked = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    genderPicked.current = false;
    setGenderView('all');
    setHideNotJoining(true);
    setAgeView(new Set());
    setSearch('');
  }, [isOpen, group.id]);
  useEffect(() => {
    if (isOpen && !genderPicked.current) setGenderView(supportGender ?? 'all');
  }, [isOpen, supportGender]);
  const pickGender = (g: string) => { genderPicked.current = true; setGenderView(g); };
  // Only offer participants who aren't already in another group — assignable
  // means unassigned, or already a member of THIS group (so current members
  // still show and can be toggled off). Anyone in a different group is hidden.
  // Teens (10 - 17) are grouped through a Teen Support, so an adult group does not offer them (unless already in it).
  const assignable = useMemo(
    () => allParticipants.filter((p) => (!p.groupId || p.groupId === group.id || selected.has(p.id))
      && (!hideTeens || group.isTeenGroup || !isTeenAgeRange(p.ageRange) || selected.has(p.id))),
    [allParticipants, group.id, group.isTeenGroup, hideTeens, selected]
  );
  // Each person's gender and age range, tidied once ('18-24', 'Below 18' and the like map to the standard ranges).
  const norm = useMemo(
    () => new Map(assignable.map((p) => [p.id, { gender: normaliseGender(p.gender), age: normaliseAgeRange(p.ageRange) }])),
    [assignable]
  );
  const genderOf = (p: Participant) => norm.get(p.id)?.gender ?? null;
  const ageOf = (p: Participant) => norm.get(p.id)?.age ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = assignable.filter((p) => selected.has(p.id) || (
      (!q || p.fullName.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q))
      && (genderView === 'all' || genderOf(p) === genderView)
      && (ageView.size === 0 || ageView.has(ageOf(p) ?? ''))
      && !(hideNotJoining && isNotJoining(p))
    ));
    const ranked = [...list].sort((a, b) => readinessRank(a) - readinessRank(b) || a.fullName.localeCompare(b.fullName));
    return selectedFirst(ranked, (p) => selected.has(p.id));
  }, [assignable, search, selected, genderView, ageView, hideNotJoining, norm]); // eslint-disable-line react-hooks/exhaustive-deps
  // People on offer under the not-joining switch; the chip counts are taken from them.
  const offered = useMemo(() => assignable.filter((p) => !(hideNotJoining && isNotJoining(p))), [assignable, hideNotJoining]);
  // Age chips: ranges among those on offer for the chosen gender, with how many each.
  const ageCounts = AGE_RANGE_OPTIONS
    .map((range) => ({ range, count: offered.filter((p) => ageOf(p) === range && (genderView === 'all' || genderOf(p) === genderView)).length }))
    .filter((x) => x.count > 0 || ageView.has(x.range));
  const toggleAge = (range: string) => setAgeView((prev) => { const next = new Set(prev); if (next.has(range)) next.delete(range); else next.add(range); return next; });
  // Gender chip counts follow the age choice, so a chip's number is what that chip would show.
  const countGender = (g: string) => offered.filter((p) => genderOf(p) === g && (ageView.size === 0 || ageView.has(ageOf(p) ?? ''))).length;
  const notJoiningCount = assignable.filter((p) => isNotJoining(p) && !selected.has(p.id)).length;
  // "3 selected · 2 women, 1 man", so the balance is visible while picking.
  const picked = assignable.filter((p) => selected.has(p.id));
  const pickedWomen = picked.filter((p) => genderOf(p) === 'Female').length;
  const pickedMen = picked.filter((p) => genderOf(p) === 'Male').length;
  const subtitle = [
    `${selected.size} selected`,
    selected.size > 0 ? [pickedWomen ? `${pickedWomen} ${pickedWomen === 1 ? 'woman' : 'women'}` : '', pickedMen ? `${pickedMen} ${pickedMen === 1 ? 'man' : 'men'}` : ''].filter(Boolean).join(', ') : '',
    supportGender ? `Support: ${supportGender === 'Female' ? 'woman' : 'man'}` : '',
  ].filter(Boolean).join(' · ');
  const chipClass = (on: boolean) => `inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold active:scale-95 ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Members — ${group.name}`}
      subtitle={subtitle}
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
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter participants">
          {(['Female', 'Male'] as const).map((g) => (
            <button key={g} type="button" aria-pressed={genderView === g} onClick={() => pickGender(g)} className={chipClass(genderView === g)}>
              {g === 'Female' ? 'Women' : 'Men'}{supportGender === g ? ' (like the support)' : ''} <span className="opacity-70">{countGender(g)}</span>
            </button>
          ))}
          <button type="button" aria-pressed={genderView === 'all'} onClick={() => pickGender('all')} className={chipClass(genderView === 'all')}>Everyone</button>
          <button type="button" aria-pressed={!hideNotJoining} onClick={() => setHideNotJoining((v) => !v)} className={`ml-auto ${chipClass(!hideNotJoining)}`}>
            {hideNotJoining ? `Show no response and next cohort${notJoiningCount ? ` (${notJoiningCount})` : ''}` : 'Hide no response and next cohort'}
          </button>
        </div>
        {(ageCounts.length > 1 || ageView.size > 0) && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by age range">
            <button type="button" aria-pressed={ageView.size === 0} onClick={() => setAgeView(new Set())} className={chipClass(ageView.size === 0)}>All ages</button>
            {ageCounts.map(({ range, count }) => (
              <button key={range} type="button" aria-pressed={ageView.has(range)} onClick={() => toggleAge(range)} className={chipClass(ageView.has(range))}>
                {range.replace(/\s*-\s*/, '–')} <span className="opacity-70">{count}</span>
              </button>
            ))}
          </div>
        )}
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
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-gray-800">{p.fullName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {[genderOf(p), ageOf(p)?.replace(/\s*-\s*/, '–')].filter(Boolean).map((part) => (
                      <span key={part} className="rounded-[5px] border border-gray-200 px-1 text-[10px] font-medium leading-[15px] text-gray-500">{part}</span>
                    ))}
                    {(() => {
                      const status = p.followUpNoResponse ? 'NO_RESPONSE' : p.followUpStatus;
                      const meta = status ? REGISTRATION_STATUS_META[status] : null;
                      return meta ? <span className={`rounded-full px-1.5 text-[10px] font-semibold leading-[16px] ${meta.tone}`}>{meta.label}</span> : null;
                    })()}
                  </span>
                </span>
                {p.phone && <span className="hidden flex-none text-xs text-gray-400 sm:inline">{p.phone}</span>}
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
  const { activeCohort, liveRevision, weeks } = useAppData();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canAdd = can('groups', 'add');
  const canEdit = can('groups', 'edit');

  const [groups, setGroups] = useState<Group[]>([]);
  // A Teen Support's teens, kept apart: no meetings or recaps, Sunday attendance only.
  const [teenGroups, setTeenGroups] = useState<Group[]>([]);
  // Who has chosen their own password (access confirmed). Null until it loads; if it fails no chip is shown.
  const [signedIn, setSignedIn] = useState<{ cohortId: string; ids: Set<string> } | null>(null);
  // Phone and last-seen for each participant (for the group sheet). Empty or failed: those chips are left out.
  const [appDetails, setAppDetails] = useState<Record<string, ParticipantAppInfo> | null>(null);
  const signedInIds = signedIn && signedIn.cohortId === activeCohort?.id ? signedIn.ids : null;
  const [movingTeen, setMovingTeen] = useState<{ participantId: string; name: string } | null>(null);
  const toast = useToast();
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
  // The newest load, and the cohort whose extras are on screen (load below).
  const loadSeq = useRef(0);
  const extrasCohort = useRef<string | null>(null);
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Array<{ sessionId: string; userId: string; status: string }>>([]);
  const [minTrainingsAttended, setMinTrainingsAttended] = useState(DEFAULT_PROGRAMME_RULES.minTrainingsAttended);
  // Onboarding progress for the glance on each card. null = could not be loaded: the cards simply show no strip.
  const [onboardingProgress, setOnboardingProgress] = useState<Map<string, OnboardingProgressParticipant> | null>(null);
  // Which groups' supports have posted their introduction (from the same onboarding read). Unknown when missing.
  const [supportIntroByGroup, setSupportIntroByGroup] = useState<Record<string, boolean>>({});
  const [meetingOverrideGroups, setMeetingOverrideGroups] = useState<Set<string>>(new Set());
  const [readyOverrideGroups, setReadyOverrideGroups] = useState<Set<string>>(new Set());
  // Which hub each support belongs to (a card names it next to the support). Empty if it could not be loaded.
  const [hubNameByUser, setHubNameByUser] = useState<Record<string, string>>({});
  // The cohort's hubs and which hub(s) each support is in, for the hub chips beside Filters.
  const [hubOptions, setHubOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [hubIdsByUser, setHubIdsByUser] = useState<Record<string, string[]>>({});
  const [assignedAtByGroup, setAssignedAtByGroup] = useState<Record<string, string>>({});
  // False when the assigned dates could not be read: day counts and Overdue are then unknown, and the page says so.
  const [assignedDatesKnown, setAssignedDatesKnown] = useState(true);
  const [onboardingMaxDays, setOnboardingMaxDays] = useState(DEFAULT_PROGRAMME_RULES.onboardingMaxDays);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [membersTarget, setMembersTarget] = useState<Group | null>(null);
  const [supportTarget, setSupportTarget] = useState<Group | null>(null);
  // Admin: the group's support steps, to mark one done by hand.
  const [stepsTarget, setStepsTarget] = useState<Group | null>(null);
  const [openRecTarget, setOpenRecTarget] = useState<Group | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Group | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  // Every group name in the cohort, archived and teen groups included. The database keeps names unique per cohort,
  // so a new "Group N" must skip an archived one too. Read when the chooser or the builder opens.
  const [takenNames, setTakenNames] = useState<string[]>([]);
  // Throws when the names cannot be read, so nothing is named blind.
  const readTakenNames = useCallback(async () => {
    if (!activeCohort) return [] as string[];
    const names = await groupsApi.getAll({ cohortId: activeCohort.id, includeArchived: true, includeTeenGroups: true })
      .then((r) => r.groups.map((g) => g.name))
      .catch(() => { setTakenNames([]); throw new Error('Could not check the group names already used. Please try again.'); });
    setTakenNames(names);
    return names;
  }, [activeCohort]);
  const [engineOpen, setEngineOpen] = useState(false);

  // "Open group" elsewhere (the Supports page) links straight to one group as
  // /groups?group=<id>, so the URL — not local state — decides what's in view.
  // That keeps the link shareable and survives a refresh.
  // Each filter takes several choices at once and lives in the address (`?group=` is what the Supports page links to).
  const [filters, setFilters] = useUrlFilters(['group', 'support', 'type', 'people', 'onboarding', 'gender', 'hub', 'discussion']);
  // Posts and replies this week per group (admin_discussion_summary.byGroup); null until loaded or if it fails.
  const [discussionByGroup, setDiscussionByGroup] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    setDiscussionByGroup(null);
    if (!activeCohort?.id) return;
    let cancelled = false;
    groupDiscussionApi.summary(activeCohort.id).then((s) => { if (!cancelled) setDiscussionByGroup(s.byGroup ?? {}); }).catch(() => { if (!cancelled) setDiscussionByGroup(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

  // `silent` background refreshes (triggered by realtime liveRevision bumps)
  // update the data in place WITHOUT flipping `loading`, so the grid doesn't
  // flash a full-page "Loading…" every time anything changes in the cohort.
  const load = useCallback(async (silent = false) => {
    if (!activeCohort) { setLoading(false); return; }
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    // A different cohort: drop the last one's extras so its onboarding, hubs and members never show on these cards.
    if (!silent && extrasCohort.current !== activeCohort.id) {
      extrasCohort.current = activeCohort.id;
      setCohortMemberIds(null); setSupportKinds(null); setSupportTags(null); setOnboardingProgress(null);
      setHubNameByUser({}); setHubIdsByUser({}); setAssignedAtByGroup({}); setAssignedDatesKnown(false);
    }
    try {
      // The assigned dates need the group ids, so they start as soon as the groups arrive and overlap the other requests.
      const groupsRequest = groupsApi.getAll({ cohortId: activeCohort.id, includeArchived: showArchived, includeTeenGroups: true });
      const assignedRequest = groupsRequest
        .then((res) => groupsApi.getAssignedDates(res.groups.filter((g) => !g.isTeenGroup).map((g) => g.id)))
        .catch(() => null);
      // Everything starts at once, but the cards show as soon as groups, people and supports are in; onboarding,
      // hubs, trainings and tags fill in after (they used to hold the whole page back).
      const extrasRequest = Promise.all([
        supportSessionsApi.getForCohort(activeCohort.id, ['PRE_COHORT_TRAINING']).catch(() => null),
        cohortsApi.getMembers(activeCohort.id).then((r) => new Set(r.users.map((u) => u.id))).catch(() => null),
        supportKindApi.getForCohort(activeCohort.id).then((r) => r.kinds).catch(() => null),
        supportTagsApi.getAll().then((r) => r.tags).catch(() => null),
        groupDiscussionApi.cohortOnboardingProgress(activeCohort.id).catch(() => null),
        supportHubsApi.getAll(activeCohort.id).then((r) => r.hubs).catch(() => null),
        supportHubsApi.getMembershipsForCohort(activeCohort.id).then((r) => r.memberships).catch(() => null),
        assignedRequest,
      ]);
      // Handled below; this only stops an early failure being reported as unhandled while the core loads.
      extrasRequest.catch(() => undefined);
      const [{ groups: allGs }, { participants: ps }, { users }, rules, teenOn] = await Promise.all([
        groupsRequest,
        participantsApi.getAll({ cohortId: activeCohort.id }),
        usersApi.getAll(),
        settingsApi.getProgrammeRules(),
        settingsApi.getTeenFlowEnabled().catch(() => false),
      ]);
      if (seq !== loadSeq.current) return;
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
      setMinTrainingsAttended(rules.minTrainingsAttended);
      setOnboardingMaxDays(rules.onboardingMaxDays);
      // Whichever load is newest ends the spinner, even a background one that took over from the first.
      setLoading(false);

      const [trainings, members, kindMap, tagList, progressRes, hubList, hubMemberships, assignedDates] = await extrasRequest;
      // A newer load (another cohort, or a later refresh) has started: its extras win.
      if (seq !== loadSeq.current) return;
      setCohortMemberIds(members);
      setSupportKinds(kindMap);
      setSupportTags(tagList);
      if (trainings) { setTrainingSessions(trainings.sessions); setTrainingAttendance(trainings.attendance); }
      else if (!silent) { setTrainingSessions([]); setTrainingAttendance([]); }
      // A background refresh that fails keeps what the page already had; only a first load clears it.
      if (hubList && hubMemberships) {
        const hubNames = new Map(hubList.map((hub) => [hub.id, hub.name]));
        const byUser: Record<string, string> = {};
        const idsByUser: Record<string, string[]> = {};
        hubMemberships.forEach((m) => {
          const name = hubNames.get(m.hubId);
          if (name) byUser[m.userId] = byUser[m.userId] ? `${byUser[m.userId]}, ${name}` : name;
          if (name) idsByUser[m.userId] = [...(idsByUser[m.userId] ?? []), m.hubId];
        });
        setHubNameByUser(byUser);
        setHubIdsByUser(idsByUser);
        setHubOptions(sortByText(hubList.map((hub) => ({ id: hub.id, name: hub.name })), (hub) => hub.name));
      } else if (!silent) { setHubNameByUser({}); setHubIdsByUser({}); setHubOptions([]); }
      if (progressRes) {
        setOnboardingProgress(new Map(progressRes.participants.map((row) => [row.participantId, row])));
        // An admin can mark a support's step done by hand (SupportOnboardingOverride); it counts as done here too.
        setSupportIntroByGroup(Object.fromEntries((progressRes.groups ?? []).map((row) => [row.groupId, !!row.supportIntroPosted || !!row.overrides?.includes('INTRO')])));
        setMeetingOverrideGroups(new Set((progressRes.groups ?? []).filter((row) => row.overrides?.includes('MEETING')).map((row) => row.groupId)));
        setReadyOverrideGroups(new Set((progressRes.groups ?? []).filter((row) => row.overrides?.includes('READY')).map((row) => row.groupId)));
      } else if (!silent) { setOnboardingProgress(null); setSupportIntroByGroup({}); setMeetingOverrideGroups(new Set()); setReadyOverrideGroups(new Set()); }
      if (assignedDates) { setAssignedAtByGroup(assignedDates); setAssignedDatesKnown(true); }
      else if (!silent) { setAssignedAtByGroup({}); setAssignedDatesKnown(false); }
    } catch { /* ignore */ }
    finally { if (seq === loadSeq.current) setLoading(false); }
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
  // Access confirmed: refreshed with the page, quietly (a failure just hides the chips).
  useEffect(() => {
    const cohortId = activeCohort?.id;
    if (!cohortId) return undefined;
    let cancelled = false;
    participantPushApi.getSignedInIds(cohortId)
      .then((ids) => { if (!cancelled) setSignedIn({ cohortId, ids: new Set(ids) }); })
      .catch(() => { if (!cancelled) setSignedIn(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id, liveRevision]);
  useEffect(() => {
    // The app details cover participants of active cohorts only; for any other cohort "never opened"
    // would be a guess, so the phone and last-seen chips are left out.
    setAppDetails(null);
    if (!activeCohort?.id || activeCohort.status !== 'ACTIVE') return undefined;
    let cancelled = false;
    participantPushApi.getAppDetails()
      .then((details) => { if (!cancelled) setAppDetails(Object.keys(details).length > 0 ? details : null); })
      .catch(() => { if (!cancelled) setAppDetails(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id, activeCohort?.status, liveRevision]);

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

  // Onboarding glance per adult group (teen groups have no onboarding).
  const onboardingByGroup = useMemo(() => {
    const map = new Map<string, GroupOnboardingSummary>();
    if (!onboardingProgress) return map;
    groups.forEach((g) => {
      if (g.isTeenGroup) return;
      const memberIds = (membersByGroupId.get(g.id) ?? []).map((p) => p.id);
      // The support's own steps: have they introduced themselves, and have they set a meeting time (a group without a support has nothing to wait on).
      const supportSteps = { introduced: g.supportId && g.id in supportIntroByGroup ? supportIntroByGroup[g.id] : null, meetingSet: !g.supportId || !!(g.meetingDay && g.meetingTime && g.callLink?.trim()) || meetingOverrideGroups.has(g.id), readyOverride: readyOverrideGroups.has(g.id) };
      const summary = summarizeGroupOnboarding(memberIds, onboardingProgress, g.supportId ? (assignedAtByGroup[g.id] ?? null) : null, onboardingMaxDays, supportSteps);
      if (summary) map.set(g.id, summary);
    });
    return map;
  }, [groups, membersByGroupId, onboardingProgress, assignedAtByGroup, onboardingMaxDays, supportIntroByGroup, meetingOverrideGroups, readyOverrideGroups]);

  const onboardingCounts = useMemo(() => {
    const counts: Record<OnboardingChip, number> = { overdue: 0, in_progress: 0, not_started: 0, onboarded: 0 };
    onboardingByGroup.forEach((summary) => { counts[summary.chip] += 1; });
    return counts;
  }, [onboardingByGroup]);

  // A group's gender for the Gender filter: the members' gender (people with none on file are skipped),
  // 'Mixed' when they differ, and the support's gender for a group with no gendered members yet.
  const genderByGroup = useMemo(() => {
    const map = new Map<string, string>();
    [...groups, ...teenGroups].forEach((g) => {
      const genders = new Set((membersByGroupId.get(g.id) ?? []).map((p) => normaliseGender(p.gender)).filter(Boolean));
      const gender = genders.size > 1 ? 'Mixed' : [...genders][0] ?? normaliseGender(supportUsers.find((u) => u.id === g.supportId)?.gender);
      if (gender) map.set(g.id, gender);
    });
    return map;
  }, [groups, teenGroups, membersByGroupId, supportUsers]);

  // Does this group fit one chosen choice of one filter group?
  const groupFits = (key: string, choice: string, g: Group): boolean => {
    switch (key) {
      case 'group': return g.id === choice;
      case 'support': return choice === NO_SUPPORT_OPTION ? !g.supportId : g.supportId === choice;
      case 'type': return choice === 'teen' ? !!g.isTeenGroup : !g.isTeenGroup;
      case 'onboarding': return onboardingByGroup.get(g.id)?.chip === choice;
      case 'gender': return genderByGroup.get(g.id) === choice;
      case 'hub': {
        const hubIds = g.supportId ? hubIdsByUser[g.supportId] ?? [] : [];
        return choice === NO_HUB_OPTION ? hubIds.length === 0 : hubIds.includes(choice);
      }
      case 'people': return choice === 'empty' ? (membersByGroupId.get(g.id)?.length ?? 0) === 0 : (membersByGroupId.get(g.id)?.length ?? 0) > 0;
      case 'discussion': return choice === 'active' ? (discussionByGroup?.[g.id] ?? 0) > 0 : (discussionByGroup?.[g.id] ?? 0) === 0;
      default: return true;
    }
  };
  // Within a filter any chosen choice matches; every filter that has a choice must match.
  // Hub chips sit beside the Filters button, not inside the sheet, so the sheet gets every filter except the hub.
  // A hub from another cohort (an old link) has no chip to clear it, so it is ignored rather than hiding every group.
  const hubChoices = (filters.hub ?? []).filter((v) => v === NO_HUB_OPTION || hubOptions.some((hub) => hub.id === v));
  const sheetFilters = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== 'hub'));
  const displayedGroups = groups.filter((g) => Object.entries({ ...sheetFilters, hub: hubChoices }).every(([key, choices]) => choices.length === 0 || (key === 'onboarding' && onboardingByGroup.size === 0) || (key === 'discussion' && !discussionByGroup) || choices.some((c) => groupFits(key, c, g))));
  const hubChipOptions = [
    ...hubOptions.map((hub) => ({ value: hub.id, label: hub.name })),
    { value: NO_HUB_OPTION, label: 'No hub' },
  // Counts include teen groups, since a chip filters the Teen groups section too.
  ].map((o) => ({ ...o, count: [...groups, ...teenGroups].filter((g) => groupFits('hub', o.value, g)).length }))
    .filter((o) => o.value !== NO_HUB_OPTION || o.count > 0 || hubChoices.includes(NO_HUB_OPTION));
  // Teen groups sit in their own section; the hub chips filter it too (a teen group's hub is its Teen Support's).
  // The Gender and Discussion filters apply to the Teen groups section as well.
  const genderChoices = filters.gender ?? [];
  const discussionChoices = discussionByGroup ? filters.discussion ?? [] : [];
  const displayedTeenGroups = teenGroups.filter((g) => (hubChoices.length === 0 || hubChoices.some((c) => groupFits('hub', c, g))) && (genderChoices.length === 0 || genderChoices.some((c) => groupFits('gender', c, g))) && (discussionChoices.length === 0 || discussionChoices.some((c) => groupFits('discussion', c, g))));
  const toggleHub = (value: string) => setFilters({ ...filters, hub: hubChoices.includes(value) ? hubChoices.filter((v) => v !== value) : [...hubChoices, value] });
  const filterGroups: FilterGroup[] = (() => {
    const opt = (key: string, value: string, label: string) => ({ value, label, count: groups.filter((g) => groupFits(key, value, g)).length });
    const out: FilterGroup[] = [];
    if (groups.some((g) => g.isTeenGroup)) out.push({ key: 'type', label: 'Adults or teens', options: [opt('type', 'adult', 'Adult groups'), opt('type', 'teen', 'Teen groups')] });
    out.push({ key: 'group', label: 'Group', options: groups.map((g) => opt('group', g.id, g.name)) });
    // Counts include teen groups, since the Gender filter applies to the Teen groups section too.
    const genderOpt = (value: string, label: string) => ({ value, label, count: [...groups, ...teenGroups].filter((g) => groupFits('gender', value, g)).length });
    const genderOptions = [genderOpt('Female', 'Women'), genderOpt('Male', 'Men'), genderOpt('Mixed', 'Mixed')]
      .filter((o) => o.value !== 'Mixed' || o.count > 0 || genderChoices.includes('Mixed'));
    out.push({ key: 'gender', label: 'Gender', options: genderOptions });
    if (supportUsers.length > 0) {
      out.push({
        key: 'support',
        label: 'Support',
        options: [opt('support', NO_SUPPORT_OPTION, 'No support assigned'), ...supportUsers.map((u) => opt('support', u.id, u.name))],
      });
    }
    if (onboardingByGroup.size > 0) {
      out.push({ key: 'onboarding', label: 'Onboarding', options: ONBOARDING_CHIPS.map((chip) => opt('onboarding', chip, ONBOARDING_CHIP_LABEL[chip])), hint: assignedDatesKnown ? undefined : 'Day counts unavailable, so Overdue can’t be shown.' });
    }
    out.push({ key: 'people', label: 'Members', options: [opt('people', 'empty', 'Empty'), opt('people', 'has', 'Has participants')] });
    if (discussionByGroup) out.push({ key: 'discussion', label: 'Discussion this week', options: [opt('discussion', 'active', 'Posted this week'), opt('discussion', 'quiet', 'Quiet this week')] });
    return out;
  })();

  // Teens (10 - 17) are grouped by their Teen Support, never by the builder, so
  // once teen handling is on they are left out of the "not in a group yet" counts.
  const groupablePeople = useMemo(
    () => (teenFlowOn ? participants.filter((p) => !isTeenAgeRange(p.ageRange)) : participants),
    [participants, teenFlowOn]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Groups"
        tourId="admin:groups"
        subtitle={!activeCohort ? 'No active cohort' : [
          // The same group count everywhere (rule 127): groups, with teen groups said separately.
          `${groups.filter((g) => !g.archivedAt).length} groups${teenGroups.filter((g) => !g.archivedAt).length > 0 ? ` (+${teenGroups.filter((g) => !g.archivedAt).length} teen)` : ''}`,
          onboardingByGroup.size > 0 && onboardingCounts.overdue > 0 ? `${onboardingCounts.overdue} overdue` : null,
          onboardingByGroup.size > 0 && onboardingCounts.in_progress > 0 ? `${onboardingCounts.in_progress} in progress` : null,
          `${participants.filter((p) => !p.isTest).length} participants`,
        ].filter(Boolean).join(' · ')}
        action={
          activeCohort && (
            <div className="flex items-center gap-2">
              {canAdd && (
                <button type="button" onClick={() => setChooserOpen(true)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                  + New Group
                </button>
              )}
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

      {activeCohort && !loading && onboardingCounts.overdue > 0 && !(filters.onboarding ?? []).includes('overdue') && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span><span className="font-semibold">{onboardingCounts.overdue} group{onboardingCounts.overdue === 1 ? ' is' : 's are'} overdue</span> on onboarding.</span>
          <button type="button" onClick={() => setFilters({ onboarding: ['overdue'], hub: [] })} className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">Show them</button>
        </div>
      )}
      {activeCohort && !loading && (
        <div data-wt="groups-filters" className="mb-4">
          <FilterBar
            groups={filterGroups}
            value={sheetFilters}
            onChange={(next) => setFilters({ ...next, hub: hubChoices })}
            searching={hubChoices.length > 0}
            extra={hubOptions.length > 0 && (
              <div data-wt="groups-hub-chips" className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by hub">
                <button
                  type="button"
                  aria-pressed={hubChoices.length === 0}
                  onClick={() => setFilters({ ...filters, hub: [] })}
                  className={`inline-flex min-h-[32px] items-center rounded-full border px-2.5 text-xs font-semibold active:scale-95 ${hubChoices.length === 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  All hubs
                </button>
                {hubChipOptions.map((o) => {
                  const active = hubChoices.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleHub(o.value)}
                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold active:scale-95 ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'} ${o.count === 0 && !active ? 'opacity-50' : ''}`}
                    >
                      {o.label}
                      <span className={`rounded-full px-1.5 text-[11px] ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{o.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            toggles={[{ key: 'archived', label: 'Show archived groups', value: showArchived, onChange: setShowArchived, hint: 'Include groups that were archived.' }]}
            shown={displayedGroups.length}
            total={groups.length}
            noun="groups"
          />
          {/* Onboarding status is chosen in the Filters sheet; this only warns when Overdue cannot be worked out. */}
          {onboardingByGroup.size > 0 && !assignedDatesKnown && <p className="mt-1 px-0.5 text-[11px] text-amber-700">Day counts unavailable, so Overdue can’t be shown.</p>}
        </div>
      )}

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">No groups yet.</p>
          {canAdd && (
            <button type="button" onClick={() => setChooserOpen(true)} className="mt-3 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
              Build groups
            </button>
          )}
        </div>
      ) : displayedGroups.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">All groups have a support assigned.</p>
        </div>
      ) : (
        <div data-wt="groups-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedGroups.map((g) => {
            const members = membersByGroupId.get(g.id) ?? [];
            const menuItems = g.archivedAt
              ? (canEdit ? [{ label: 'Restore group', onClick: () => void handleRestore(g) }] : [])
              : [
                  ...(g.supportId ? [{ label: 'Open group & discussion', onClick: () => navigate(`/group-view/${g.supportId}?cohort=${g.cohortId}`) }] : []),
                  ...(canEdit ? [
                    { label: 'Manage members', onClick: () => setMembersTarget(g) },
                    { label: 'Assign support', onClick: () => setSupportTarget(g) },
                    ...(g.supportId && !g.isTeenGroup ? [{ label: 'Support steps', onClick: () => setStepsTarget(g) }] : []),
                    { label: 'Open meeting', onClick: () => setOpenRecTarget(g) },
                    { label: 'Edit', onClick: () => { setEditing(g); setFormOpen(true); } },
                    { label: 'Archive group', onClick: () => setArchiveTarget(g), tone: 'danger' as const },
                  ] : []),
                ];
            return (
              <GroupCard
                key={g.id}
                group={g}
                members={members}
                summary={onboardingByGroup.get(g.id)}
                maxDays={onboardingMaxDays}
                hubName={g.supportId ? hubNameByUser[g.supportId] : null}
                menu={menuItems.length > 0 ? <AppOverflowMenu align="right" items={menuItems} /> : null}
                signedInIds={signedInIds}
                progress={onboardingProgress}
                appDetails={appDetails}
                discussionThisWeek={discussionByGroup ? discussionByGroup[g.id] ?? 0 : undefined}
              />
            );
          })}
        </div>
      )}

      {activeCohort && !loading && teenGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-gray-900">
            Teen groups
            {(hubChoices.length > 0 || genderChoices.length > 0 || discussionChoices.length > 0) && <span className="ml-1.5 text-xs font-medium text-gray-500">{displayedTeenGroups.length} of {teenGroups.length} {hubChoices.length > 0 && genderChoices.length === 0 && discussionChoices.length === 0 ? 'in the chosen hubs' : 'match the filters'}</span>}
          </h2>
          <p className="mb-3 text-xs text-gray-500">Each Teen Support's teens. No meetings or recaps; Sunday attendance only.</p>
          {displayedTeenGroups.length === 0 && <p className="text-sm text-gray-500">{hubChoices.length > 0 && genderChoices.length === 0 && discussionChoices.length === 0 ? 'No teen groups in the chosen hubs.' : 'No teen groups match the filters.'}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedTeenGroups.map((g) => {
              const members = membersByGroupId.get(g.id) ?? [];
              return (
                <div key={g.id} className="flex flex-col gap-3 surface-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-gray-900">{g.name}</h3>
                      <p className="truncate text-xs text-gray-500">
                        {g.supportName || 'No support assigned'}
                        {g.supportId && hubNameByUser[g.supportId] && <span className="text-gray-400"> · {hubNameByUser[g.supportId]}</span>}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {g.supportId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/group-view/${g.supportId}?cohort=${g.cohortId}`)}
                          aria-label={`Read the discussion of ${g.name}`}
                          title="Open group & discussion"
                          className="grid h-8 w-8 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-3.9A8 8 0 1 1 20 12Z" /></svg>
                        </button>
                      )}
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
                            <p className="truncate text-xs text-gray-400">{[(p.phone ?? p.guardianPhone) ? `Guardian ${p.phone ?? p.guardianPhone}` : null, genderAgeLine(p)].filter(Boolean).join(' · ')}</p>
                          </div>
                          <AccessChip confirmed={signedInIds ? signedInIds.has(p.id) : null} />
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setMovingTeen({ participantId: p.id, name: p.fullName })}
                              className="min-h-[36px] flex-none rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 active:scale-95"
                              aria-label={`Move ${p.fullName} to another Teen Support`}
                            >
                              Move
                            </button>
                          )}
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

      <TeenMoveModal
        teen={movingTeen}
        onClose={() => setMovingTeen(null)}
        onMoved={(message) => { toast({ message }); void load(true); }}
      />

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

      {openRecTarget && (
        <OpenRecordingModal isOpen onClose={() => setOpenRecTarget(null)} name={openRecTarget.name} target={{ groupId: openRecTarget.id }} weeks={weeks} defaultWeekId={getIdealWeekForCohort(activeCohort, weeks)?.id ?? null} />
      )}

      {stepsTarget && (
        <SupportStepsOverrideModal group={stepsTarget} onClose={() => setStepsTarget(null)} onChanged={() => { void load(true); }} />
      )}
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
          supportGender={normaliseGender(supportUsers.find((u) => u.id === membersTarget.supportId)?.gender)}
          hideTeens={teenFlowOn}
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
        onEngine={() => {
          // The chooser stays up while the names are read, then the builder opens.
          void readTakenNames()
            .catch(() => toast({ tone: 'error', message: 'Could not check the group names already used, so new group names may clash. Check them before creating.' }))
            .finally(() => { setChooserOpen(false); setEngineOpen(true); });
        }}
        onManual={() => { setChooserOpen(false); setEditing(null); setFormOpen(true); }}
        onEmpty={async (count) => {
          if (!activeCohort) return;
          const names = nextGroupNames([...groups.map((g) => g.name), ...await readTakenNames()], count);
          let made = 0;
          try {
            for (const name of names) {
              await groupsApi.create({ cohortId: activeCohort.id, name, supportId: null });
              made += 1;
            }
          } catch (err) {
            // Some may already exist: show them, and say how far it got.
            await load(true);
            const reason = err instanceof Error ? err.message : 'Please try again.';
            throw new Error(made > 0 ? `Made ${made} of ${names.length} groups, then stopped: ${reason}` : reason);
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
          takenNames={takenNames}
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
            ...describeFilters(filterGroups, sheetFilters),
            ...hubChoices.map((v) => `Hub: ${hubChipOptions.find((o) => o.value === v)?.label ?? v}`),
            showArchived ? 'Including archived' : '',
          ].filter(Boolean)}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminGroupsPage;
