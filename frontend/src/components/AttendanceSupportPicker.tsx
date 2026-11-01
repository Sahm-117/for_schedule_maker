import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import AppSelect from './AppSelect';
import ConfirmReachModal from './ConfirmReachModal';
import ModalShell from './followups/ModalShell';
import PageLoader from './PageLoader';
import { useToast } from './Toast';
import { cohortsApi, groupsApi, supportTagsApi, usersApi } from '../services/api';
import { hasSupportRole } from '../utils/people';
import { pickableUsers } from '../utils/testUsers';
import { sortByText } from '../utils/sort';
import type { Group, Participant, SupportTag, User } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cohortId: string;
  groups: Group[];
  /** Absent this week with no follow-up task, so nobody is chasing them yet. */
  people: Participant[];
  /** Told after groups were given a support, so the page can read the week again. */
  onAssigned: () => void;
}

const collator = new Intl.Collator(undefined, { numeric: true });

// "N need a support assignment" on Attendance. A follow-up task goes to the support who leads the absent person's
// group, so the way to give these people a support is to give their group one (groupsApi.update, the same call as
// Groups → Assign support). Who may be offered follows the Groups page: active, in this cohort, not a Teen Support,
// not already leading another group. Nothing here changes an attendance mark.
const AttendanceSupportPicker: React.FC<Props> = ({ isOpen, onClose, cohortId, groups, people, onAssigned }) => {
  const toast = useToast();
  const [supportUsers, setSupportUsers] = useState<User[] | null>(null);
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null);
  const [tags, setTags] = useState<SupportTag[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPicks({});
    setConfirming(false);
    setFailed(false);
    Promise.all([
      usersApi.getAll(),
      cohortsApi.getMembers(cohortId).then((r) => new Set(r.users.map((u) => u.id))),
      supportTagsApi.getAll().then((r) => r.tags),
    ]).then(([{ users }, members, allTags]) => {
      if (cancelled) return;
      setSupportUsers(sortByText(users.filter((u) => hasSupportRole(u)), (u) => u.name));
      setMemberIds(members);
      setTags(allTags);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [isOpen, cohortId]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Split the people by what can be done for them here.
  const split = useMemo(() => {
    const open = new Map<string, Participant[]>(); // group with no support: pick one
    const covered: Array<{ person: Participant; group: Group }> = []; // group already has a support
    const noGroup: Participant[] = [];
    const elsewhere: Participant[] = []; // a group not listed here (a teen group follows its Teen Support)
    people.forEach((p) => {
      if (!p.groupId) { noGroup.push(p); return; }
      const group = groupById.get(p.groupId);
      if (!group) { elsewhere.push(p); return; }
      if (group.supportId) { covered.push({ person: p, group }); return; }
      open.set(group.id, [...(open.get(group.id) ?? []), p]);
    });
    const openGroups = [...open.entries()]
      .map(([id, ps]) => ({ group: groupById.get(id) as Group, people: ps }))
      .sort((a, b) => collator.compare(a.group.name, b.group.name));
    return { openGroups, covered, noGroup, elsewhere };
  }, [people, groupById]);

  const optionsFor = (groupId: string) => {
    if (!supportUsers || !memberIds || !tags) return [];
    const teenSupportIds = new Set(tags.filter((t) => t.systemKey === 'TEEN_SUPPORT').flatMap((t) => t.userIds));
    const leading = new Set(groups.filter((g) => !g.archivedAt && g.supportId).map((g) => g.supportId as string));
    const pickedElsewhere = new Set(Object.entries(picks).filter(([gid, uid]) => gid !== groupId && uid).map(([, uid]) => uid));
    return pickableUsers(supportUsers)
      .filter((u) => u.isActive !== false && memberIds.has(u.id) && !teenSupportIds.has(u.id) && !leading.has(u.id) && !pickedElsewhere.has(u.id))
      .map((u) => ({ value: u.id, label: u.name }));
  };

  const chosen = split.openGroups.filter((g) => picks[g.group.id]);
  const reached = chosen.flatMap((g) => g.people.map((p) => ({ person: p, group: g.group, support: supportUsers?.find((u) => u.id === picks[g.group.id])?.name ?? 'the support' })));

  const save = async () => {
    if (chosen.length === 0) return;
    setSaving(true);
    let done = 0;
    try {
      for (const g of chosen) {
        await groupsApi.update(g.group.id, { supportId: picks[g.group.id] });
        done += 1;
      }
      toast({ message: `${done} ${done === 1 ? 'group has' : 'groups have'} a support now (${reached.length} ${reached.length === 1 ? 'person' : 'people'}).` });
      setConfirming(false);
      onAssigned();
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: `${err instanceof Error && err.message ? err.message : 'Could not assign the support.'}${done > 0 ? ` ${done} of ${chosen.length} groups were saved.` : ''}` });
      if (done > 0) onAssigned();
    } finally {
      setSaving(false);
    }
  };

  const nobodyHere = split.openGroups.length === 0;

  return (
    <>
      <ModalShell
        isOpen={isOpen && !confirming}
        onClose={onClose}
        title="Assign a support"
        subtitle={`${people.length} absent ${people.length === 1 ? 'person has' : 'people have'} no support following up yet.`}
        footer={(
          <>
            <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Close</button>
            <button type="button" onClick={() => setConfirming(true)} disabled={chosen.length === 0} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
              {chosen.length === 0 ? 'Assign' : `Assign ${chosen.length} ${chosen.length === 1 ? 'group' : 'groups'}`}
            </button>
          </>
        )}
      >
        {failed ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">Could not load the supports. Please close this and try again.</p>
        ) : !supportUsers ? (
          <PageLoader />
        ) : (
          <div className="space-y-5">
            {nobodyHere && <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-600">None of these people are in a group that is missing a support, so there is nothing to pick here.</p>}
            {split.openGroups.map(({ group, people: ps }) => (
              <section key={group.id} className="rounded-2xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">{group.name} <span className="text-xs font-normal text-gray-500">has no support</span></p>
                <p className="mt-0.5 text-xs text-gray-500">{ps.map((p) => p.fullName).join(', ')}</p>
                <div className="mt-3">
                  <AppSelect
                    value={picks[group.id] ?? ''}
                    onChange={(value) => setPicks((prev) => ({ ...prev, [group.id]: value }))}
                    options={[{ value: '', label: 'Leave for now' }, ...optionsFor(group.id)]}
                    placeholder="Choose a support"
                    label="Support for this group"
                  />
                </div>
              </section>
            ))}
            {split.covered.length > 0 && (
              <p className="rounded-2xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
                {split.covered.map(({ person, group }) => `${person.fullName} (${group.name}, led by ${group.supportName ?? 'a support'})`).join(', ')}
                {' '}already {split.covered.length === 1 ? 'has' : 'have'} a support through their group; nothing to pick.
              </p>
            )}
            {split.noGroup.length > 0 && (
              <p className="rounded-2xl bg-amber-100/80 px-4 py-3 text-xs leading-relaxed text-amber-700">
                {split.noGroup.map((p) => p.fullName).join(', ')} {split.noGroup.length === 1 ? 'is' : 'are'} in no group, so no support can follow them up. Add them to a group on the{' '}
                <NavLink to="/participants" className="font-semibold underline">Participants page</NavLink> first.
              </p>
            )}
            {split.elsewhere.length > 0 && (
              <p className="rounded-2xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
                {split.elsewhere.map((p) => p.fullName).join(', ')} {split.elsewhere.length === 1 ? 'is' : 'are'} in a group managed elsewhere (a teen's group follows their Teen Support).
              </p>
            )}
            <p className="text-xs text-gray-500">A support leads one group. This gives the group a support, the same as Groups → Assign support; it does not change any attendance mark.</p>
          </div>
        )}
      </ModalShell>

      <ConfirmReachModal
        isOpen={isOpen && confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { void save(); }}
        title="Assign these supports?"
        message={chosen.map((g) => `${g.group.name} will be led by ${supportUsers?.find((u) => u.id === picks[g.group.id])?.name ?? 'the support'}.`).join('\n')}
        names={reached.map((r) => `${r.person.fullName} · ${r.group.name} → ${r.support}`)}
        confirmText="Assign"
        busy={saving}
      />
    </>
  );
};

export default AttendanceSupportPicker;
