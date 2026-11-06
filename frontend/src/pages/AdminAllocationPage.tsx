import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Spinner from '../components/Spinner';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, participantsApi, usersApi } from '../services/api';
import type { Group, Participant, User } from '../types';
import { sortByText } from '../utils/sort';
import { isOnTeenPath } from '../utils/followUps';
import { genderAgeLabel, genderFits, groupGenderLabel, groupGenders, type GroupGender } from '../utils/groupGender';
import GroupPickList from '../components/groups/GroupPickList';
import TeenMoveModal from '../components/groups/TeenMoveModal';
import { useToast } from '../components/Toast';

const onTeenPath = isOnTeenPath;

const groupNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const UNASSIGNED = '__unassigned__';

// ── Draggable participant chip ─────────────────────────────────────────────────

interface ChipProps {
  participant: Participant;
  selected: boolean;
  onToggle: (id: string) => void;
  dragCount: number; // how many chips will move if this one is dragged
  canMove: boolean; // without the Edit tick the chip is plain text: no drag, no select
  /** A teen: tapping opens the Teen Support picker instead of selecting. */
  onTeen?: (p: Participant) => void;
}

/** Gender and age range as small tags, e.g. "Female" "25–34", plus "Teen". */
const PersonTags: React.FC<{ gender?: string | null; ageRange?: string | null; teen?: boolean }> = ({ gender, ageRange, teen }) => {
  const label = genderAgeLabel(gender, ageRange);
  const parts = label ? label.split(' · ') : [];
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {parts.map((part) => (
        <span key={part} className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${part === 'Female' ? 'bg-pink-50 text-pink-700' : part === 'Male' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>{part}</span>
      ))}
      {!label && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">No gender or age</span>}
      {teen && <span className="rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-700">Teen</span>}
    </span>
  );
};

const ParticipantChip: React.FC<ChipProps> = ({ participant, selected, onToggle, dragCount, canMove, onTeen }) => {
  const teen = onTeenPath(participant);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: participant.id, disabled: !canMove || teen });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ touchAction: 'none' }}
      {...attributes}
      {...listeners}
      // A teen's chip cannot be dragged but is still tapped (it opens the Teen Support picker), so it is not "disabled".
      aria-disabled={teen ? !canMove : attributes['aria-disabled']}
      onClick={() => (teen ? (canMove && onTeen ? onTeen(participant) : undefined) : onToggle(participant.id))}
      title={teen && canMove ? 'Tap to choose their Teen Support' : undefined}
      className={`group relative flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.98] ${
        selected
          ? 'border-primary bg-primary/10 text-gray-900'
          : 'border-gray-100 bg-white text-gray-800 hover:border-gray-200'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[10px] ${
          selected ? 'border-primary bg-primary text-white' : 'border-gray-200 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium leading-tight">{participant.fullName}{participant.isTest ? ' (test)' : ''}</span>
        {participant.phone && <span className="text-xs text-gray-400">{participant.phone}</span>}
        <PersonTags gender={participant.gender} ageRange={participant.ageRange} teen={teen} />
      </span>
      {selected && dragCount > 1 && (
        <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{dragCount}</span>
      )}
    </button>
  );
};

// ── Droppable column ───────────────────────────────────────────────────────────

interface ColumnProps {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  accent?: boolean;
  /** Non-scrolling content pinned below the header (e.g. a search box). */
  header?: React.ReactNode;
  /** Fill the parent's height instead of capping at 70vh (used by the tray). */
  fill?: boolean;
  /** Size to content with no inner scroll (used by group cards in masonry). */
  autoHeight?: boolean;
  /** "Women", "Men", "Mixed" beside the count. */
  badge?: string;
  /** Shown under the subtitle in full (never cut off): the support's gender and age. */
  subtitleTags?: React.ReactNode;
  /** Greyed out and closed to drops (the other gender while dragging, or a teen group). */
  dimmed?: boolean;
  noDrop?: boolean;
  children: React.ReactNode;
}

const Column: React.FC<ColumnProps> = ({ id, title, subtitle, count, accent, header, fill, autoHeight, badge, subtitleTags, dimmed, noDrop, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !!dimmed || !!noDrop });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[8rem] flex-col rounded-[22px] border bg-white p-3 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] transition ${
        autoHeight ? '' : fill ? 'h-full' : 'max-h-[70vh]'
      } ${isOver ? 'border-primary ring-2 ring-primary/30' : accent ? 'border-gray-200' : 'border-transparent'} ${dimmed ? 'opacity-40' : ''}`}
      aria-disabled={dimmed || undefined}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="min-w-0">
          <h3 className="truncate font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        <span className="ml-2 flex shrink-0 items-center gap-1.5">
          {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge === 'Women' ? 'bg-pink-50 text-pink-700' : badge === 'Men' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>{badge}</span>}
          <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{count}</span>
        </span>
      </div>
      {subtitleTags && <div className="-mt-1.5 mb-2 px-1">{subtitleTags}</div>}
      {header && <div className="mb-1.5">{header}</div>}
      <div className={`flex flex-col gap-1.5 ${autoHeight ? '' : 'min-h-0 flex-1 overflow-y-auto'}`}>{children}</div>
    </div>
  );
};

// ── Touch-layout detection ─────────────────────────────────────────────────────
// Drag-and-drop across columns is awkward on phones, so below the desktop
// breakpoint we swap the board for a tap-to-assign list. Mirrors the
// "(pointer: fine) + width >= 768" heuristic used elsewhere (AppSelect).
const useIsTouchLayout = (): boolean => {
  const query = '(pointer: fine) and (min-width: 768px)';
  const [isTouch, setIsTouch] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : !window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(query);
    const update = () => setIsTouch(!mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return isTouch;
};

// ── Mobile group-picker bottom sheet ────────────────────────────────────────────
interface GroupPickerSheetProps {
  person: Participant;
  groups: Group[];
  genders: Map<string, GroupGender>;
  supportsById: Map<string, User>;
  memberCounts: Map<string, number>;
  onPick: (groupId: string | null) => void;
  onClose: () => void;
}

// Only groups of the person's gender, each with its support's gender and age; "Show all groups" for the rare case.
const GroupPickerSheet: React.FC<GroupPickerSheetProps> = ({ person, groups, genders, supportsById, memberCounts, onPick, onClose }) => {
  const [showAll, setShowAll] = useState(false);
  const about = genderAgeLabel(person.gender, person.ageRange);
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div className="relative mb-0 max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-gray-900">Move {person.fullName}</h3>
            <p className="text-xs text-gray-500">{about ? `${about} · ` : ''}Tap a group to assign</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-3 py-3">
          <GroupPickList
            personGender={person.gender}
            groups={groups}
            genders={genders}
            supportsById={supportsById}
            memberCounts={memberCounts}
            value={person.groupId ?? ''}
            onChange={(id) => onPick(id || null)}
            showAll={showAll}
            onShowAllChange={setShowAll}
            allowUnassigned
            currentGroupId={person.groupId ?? ''}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────

const AdminAllocationPage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminAllocationContent />;
};

const AdminAllocationContent: React.FC = () => {
  const { activeCohort, liveRevision } = useAppData();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can('groups', 'edit');

  const [groups, setGroups] = useState<Group[]>([]);
  // Teen groups are shown (read-only) so teens in them do not look unassigned; a teen's group follows their Teen Support.
  const [teenGroups, setTeenGroups] = useState<Group[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  // "Show all groups": allow a placement in a group of the other gender, on purpose (rule 135).
  const [showAll, setShowAll] = useState(false);
  const [movingTeen, setMovingTeen] = useState<{ participantId: string; name: string } | null>(null);
  const toast = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<Participant | null>(null);
  const isTouchLayout = useIsTouchLayout();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ groups: gs }, { participants: ps }, users] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id, includeTeenGroups: true }),
        participantsApi.getAll({ cohortId: activeCohort.id }),
        usersApi.getAll().then((r) => r.users).catch(() => [] as User[]),
      ]);
      const sorted = [...gs].sort((a, b) => groupNameCollator.compare(a.name, b.name));
      setGroups(sorted.filter((g) => !g.isTeenGroup));
      setTeenGroups(sorted.filter((g) => g.isTeenGroup));
      setSupportUsers(users);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
    } catch {
      setErr('Failed to load. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  const byGroup = useMemo(() => {
    const map = new Map<string, Participant[]>();
    map.set(UNASSIGNED, []);
    groups.forEach((g) => map.set(g.id, []));
    teenGroups.forEach((g) => map.set(g.id, []));
    participants.forEach((p) => {
      const key = p.groupId && map.has(p.groupId) ? p.groupId : UNASSIGNED;
      map.get(key)!.push(p);
    });
    map.forEach((list, key) => map.set(key, sortByText(list, (participant) => participant.fullName)));
    return map;
  }, [groups, teenGroups, participants]);

  const supportsById = useMemo(() => new Map(supportUsers.map((u) => [u.id, u])), [supportUsers]);
  const genders = useMemo(() => groupGenders(groups, participants, supportsById), [groups, participants, supportsById]);
  const memberCounts = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => map.set(g.id, byGroup.get(g.id)?.length ?? 0));
    return map;
  }, [groups, byGroup]);
  // A group card's support: their name, then their gender and age as tags on a line of their own.
  const supportLine = (g: Group) => (!g.supportName && !g.supportId ? 'No support assigned' : `Support: ${g.supportName ?? supportsById.get(g.supportId ?? '')?.name ?? '—'}`);
  const supportTags = (g: Group) => {
    if (!g.supportId) return undefined;
    const u = supportsById.get(g.supportId);
    return <PersonTags gender={u?.gender} ageRange={u?.ageRange} />;
  };
  // Do all these people fit this group's gender? (Each is judged without themselves, as the database does.)
  const fitsAll = useCallback((ids: string[], groupId: string) => ids.every((id) => {
    const person = participants.find((x) => x.id === id);
    if (!person) return true;
    const g = groupGenders(groups.filter((x) => x.id === groupId), participants, supportsById, id).get(groupId);
    return genderFits(person.gender, g);
  }), [groups, participants, supportsById]);

  const unassigned = useMemo(() => byGroup.get(UNASSIGNED) ?? [], [byGroup]);
  // Test participants (e.g. a demo login) aren't counted and aren't auto-placed
  // into a real group; an admin can still move one by hand.
  const unassignedReal = useMemo(() => unassigned.filter((p) => !p.isTest), [unassigned]);
  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    const q = search.toLowerCase();
    return unassigned.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
  }, [unassigned, search]);

  // Mobile list works over EVERY participant (assigned + unassigned), unlike the
  // desktop tray which only shows unassigned. Unassigned float to the top.
  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? participants.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q))
      : participants;
    return [...base].sort((a, b) => {
      const au = a.groupId ? 1 : 0;
      const bu = b.groupId ? 1 : 0;
      if (au !== bu) return au - bu;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [participants, search]);

  // Every tap toggles that one person on/off and keeps all other selections.
  // (Searching only filters the list; it never clears the current selection.)
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Apply an optimistic group change locally, then persist; rollback on failure.
  const applyMove = useCallback(
    async (requestedIds: string[], toGroupId: string | null, allowOther: boolean = showAll) => {
      // Teens get a Teen Support instead of a group (rule 22); they are left out of group moves.
      const teens = requestedIds.filter((id) => { const x = participants.find((y) => y.id === id); return !!x && onTeenPath(x); });
      const movingIds = requestedIds.filter((id) => !teens.includes(id));
      if (teens.length > 0) setErr(`${teens.length === 1 ? 'A teen was' : `${teens.length} teens were`} left out: tap a teen to choose their Teen Support.`);
      if (movingIds.length === 0) return;
      // Other-gender placements only with "Show all groups" on; only those people are recorded as on purpose (rule 135).
      const otherIds = toGroupId ? movingIds.filter((id) => !fitsAll([id], toGroupId)) : [];
      const override = otherIds.length > 0;
      if (override && !allowOther) {
        setErr('That group is for the other gender. Turn on “Show all groups” if this is on purpose.');
        return;
      }
      const toName = toGroupId ? groups.find((g) => g.id === toGroupId)?.name ?? null : null;
      const snapshot = participants;
      setParticipants((prev) =>
        prev.map((p) => (movingIds.includes(p.id) ? { ...p, groupId: toGroupId, groupName: toName } : p))
      );
      setSelected(new Set());
      setSaving(true);
      if (teens.length === 0) setErr('');
      try {
        if (movingIds.length === 1) {
          await groupsApi.moveParticipant(movingIds[0], toGroupId, { override });
        } else if (toGroupId) {
          await groupsApi.bulkAssign(movingIds.map((participantId) => ({ participantId, groupId: toGroupId })), { overrideIds: otherIds });
        } else {
          await Promise.all(movingIds.map((id) => groupsApi.moveParticipant(id, null)));
        }
      } catch (e: any) {
        setParticipants(snapshot); // rollback
        setErr(e?.message || 'Move failed. Please retry.');
      } finally {
        setSaving(false);
      }
    },
    [groups, participants, fitsAll, showAll]
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!canEdit) return;
    const draggedId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const toGroupId = overId === UNASSIGNED ? null : overId;
    // Move the whole selection if the dragged chip is part of it; else just it.
    const movingIds = selected.has(draggedId) ? [...selected] : [draggedId];
    // Skip no-op (already in target group).
    const meaningful = movingIds.filter((id) => {
      const p = participants.find((x) => x.id === id);
      return (p?.groupId ?? null) !== toGroupId;
    });
    if (meaningful.length === 0) return;
    void applyMove(meaningful, toGroupId);
  };

  const activeParticipant = activeId ? participants.find((p) => p.id === activeId) ?? null : null;
  const dragCount = activeId && selected.has(activeId) ? selected.size : 1;
  const draggingIds = activeId ? (selected.has(activeId) ? [...selected] : [activeId]) : [];
  // While dragging, groups of the other gender are greyed out and closed (unless "Show all groups" is on).
  const dimmedWhileDragging = (groupId: string) => draggingIds.length > 0 && !showAll && !fitsAll(draggingIds, groupId);
  const openTeen = (p: Participant) => setMovingTeen({ participantId: p.id, name: p.fullName });
  // The move bar offers only groups everyone selected fits, unless "Show all groups" is on.
  const selectedIds = [...selected];
  const moveBarGroups = sortByText(groups, (group) => group.name).filter((g) => showAll || fitsAll(selectedIds, g.id));

  return (
    <div className="page-content">
      <PageHeader
        title="Allocation"
        subtitle={activeCohort ? `${unassignedReal.length} unassigned · ${activeCohort.name}` : 'No active cohort'}
        action={
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95"
          >
            ← Back to Groups
          </button>
        }
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">Create at least one group first, then come back to allocate.</p>
        </div>
      ) : (
        <>
          {err && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              {!canEdit ? 'You can view who is in each group.' : isTouchLayout
                ? 'Tap “Move” on anyone to assign them, or select several and use “Move selected”.'
                : 'Tap people to select them, then drag onto a group — or use “Move selected”.'} {canEdit && 'Only groups of the same gender take someone; tap a teen to choose their Teen Support.'} {saving && <span className="inline-flex items-center gap-1 text-primary"><Spinner className="h-3 w-3" />Saving…</span>}
            </p>
            {canEdit && !isTouchLayout && (
              <label className="flex flex-none cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700" title="Lets you put someone in a group of the other gender, on purpose. It is recorded.">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-[#ff914d]" />
                Show all groups
              </label>
            )}
          </div>

          {/* Explicit move bar — reliable on every device, complements drag */}
          {canEdit && selected.size > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-gray-800">
                {selected.size} selected
                <button type="button" onClick={() => setSelected(new Set())} className="ml-3 text-xs font-medium text-gray-500 underline">
                  Clear
                </button>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Move to</span>
                <div className="w-48">
                  <AppSelect
                    value=""
                    onChange={(groupId) => {
                      const target = groupId === UNASSIGNED ? null : groupId;
                      const movingIds = [...selected].filter((id) => {
                        const p = participants.find((x) => x.id === id);
                        return (p?.groupId ?? null) !== target;
                      });
                      if (movingIds.length > 0) void applyMove(movingIds, target);
                    }}
                    options={[
                      { value: UNASSIGNED, label: 'Unassigned' },
                      ...moveBarGroups.map((g) => {
                        const badge = groupGenderLabel(genders.get(g.id));
                        return { value: g.id, label: `${g.name}${badge ? ` · ${badge}` : ''}` };
                      }),
                    ]}
                    placeholder="Choose group…"
                    compact
                  />
                </div>
              </div>
            </div>
          )}

          {isTouchLayout ? (
            /* Mobile / touch: a single tap-to-assign list (no drag board). */
            <div className="flex flex-col gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {filteredAll.length === 0 ? (
                <p className="rounded-2xl bg-gray-50/80 py-10 text-center text-sm text-gray-400">
                  {participants.length === 0 ? 'No participants yet.' : 'No matches.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {filteredAll.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 shadow-sm transition ${selected.has(p.id) ? 'border-primary bg-primary/5' : 'border-gray-100'}`}
                    >
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          aria-label={selected.has(p.id) ? 'Deselect' : 'Select'}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${selected.has(p.id) ? 'border-primary bg-primary text-white' : 'border-gray-200 text-transparent'}`}
                        >
                          ✓
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{p.fullName}{p.isTest ? ' (test)' : ''}</p>
                        <p className="truncate text-xs text-gray-400">
                          {p.phone ? `${p.phone} · ` : ''}
                          <span className={p.groupName ? 'text-gray-500' : 'text-amber-600'}>{p.groupName ?? (onTeenPath(p) ? 'No Teen Support yet' : 'Unassigned')}</span>
                        </p>
                        <PersonTags gender={p.gender} ageRange={p.ageRange} teen={onTeenPath(p)} />
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => (onTeenPath(p) ? openTeen(p) : setPickerTarget(p))}
                          disabled={saving}
                          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95 disabled:opacity-50"
                        >
                          Move
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Fixed-height board: each pane scrolls internally, so the page itself
              doesn't double-scroll. */}
          <div className="grid h-[calc(100vh-17rem)] min-h-[24rem] items-stretch gap-4 lg:grid-cols-[minmax(19rem,22rem)_1fr]">
            {/* Unassigned tray — fills height; search pinned, list scrolls */}
            <Column
              id={UNASSIGNED}
              title="Unassigned"
              count={unassignedReal.length}
              accent
              fill
              header={(
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            >
              {filteredUnassigned.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  {unassigned.length === 0 ? 'Everyone is allocated' : 'No matches'}
                </p>
              ) : (
                filteredUnassigned.map((p) => (
                  <ParticipantChip key={p.id} participant={p} selected={selected.has(p.id)} onToggle={toggle} dragCount={dragCount} canMove={canEdit} onTeen={openTeen} />
                ))
              )}
            </Column>

            {/* Group columns — masonry via CSS columns, full card heights, with
                the pane scrolling VERTICALLY only (no fixed inner height). */}
            <div className="h-full overflow-x-hidden overflow-y-auto pr-1">
              <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
              {groups.map((g) => {
                const members = byGroup.get(g.id) ?? [];
                return (
                  <div key={g.id} className="mb-4 break-inside-avoid">
                  <Column id={g.id} title={g.name} subtitle={supportLine(g)} subtitleTags={supportTags(g)} count={members.length} autoHeight badge={groupGenderLabel(genders.get(g.id)) || undefined} dimmed={dimmedWhileDragging(g.id)}>
                    {members.length === 0 ? (
                      <p className="py-4 text-center text-xs text-gray-400">Drag people here</p>
                    ) : (
                      members.map((p) => (
                        <ParticipantChip key={p.id} participant={p} selected={selected.has(p.id)} onToggle={toggle} dragCount={dragCount} canMove={canEdit} onTeen={openTeen} />
                      ))
                    )}
                  </Column>
                  </div>
                );
              })}
              </div>
              {teenGroups.length > 0 && (
                <>
                  <h3 className="mb-2 mt-2 px-1 text-sm font-bold text-gray-900">Teen groups <span className="font-normal text-gray-500">· a teen's group follows their Teen Support; tap a teen to change it</span></h3>
                  <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
                    {teenGroups.map((g) => {
                      const members = byGroup.get(g.id) ?? [];
                      return (
                        <div key={g.id} className="mb-4 break-inside-avoid">
                          <Column id={g.id} title={g.name} subtitle={supportLine(g)} subtitleTags={supportTags(g)} count={members.length} autoHeight noDrop>
                            {members.length === 0 ? (
                              <p className="py-4 text-center text-xs text-gray-400">No teens yet</p>
                            ) : (
                              members.map((p) => (
                                <ParticipantChip key={p.id} participant={p} selected={false} onToggle={toggle} dragCount={1} canMove={canEdit} onTeen={openTeen} />
                              ))
                            )}
                          </Column>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeParticipant && (
              <div className="flex items-center gap-2 rounded-xl border border-primary bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-lg">
                {activeParticipant.fullName}
                {dragCount > 1 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{dragCount}</span>}
              </div>
            )}
          </DragOverlay>
          </DndContext>
          )}
        </>
      )}

      <TeenMoveModal
        teen={movingTeen}
        supportsById={supportsById}
        onClose={() => setMovingTeen(null)}
        onMoved={(message) => { toast({ message }); void load(); }}
      />

      {pickerTarget && (
        <GroupPickerSheet
          person={pickerTarget}
          groups={groups}
          genders={genders}
          supportsById={supportsById}
          memberCounts={memberCounts}
          onPick={(groupId) => {
            const target = pickerTarget;
            setPickerTarget(null);
            // The sheet only offers another gender's group after its own "Show all groups", so that pick is on purpose.
            if ((target.groupId ?? null) !== groupId) void applyMove([target.id], groupId, true);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

    </div>
  );
};

export default AdminAllocationPage;
