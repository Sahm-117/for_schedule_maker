import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, participantsApi } from '../services/api';
import type { Group, Participant } from '../types';
import { sortByText } from '../utils/sort';

const groupNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const UNASSIGNED = '__unassigned__';

// ── Draggable participant chip ─────────────────────────────────────────────────

interface ChipProps {
  participant: Participant;
  selected: boolean;
  onToggle: (id: string) => void;
  dragCount: number; // how many chips will move if this one is dragged
}

const ParticipantChip: React.FC<ChipProps> = ({ participant, selected, onToggle, dragCount }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: participant.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ touchAction: 'none' }}
      {...attributes}
      {...listeners}
      onClick={() => onToggle(participant.id)}
      className={`group relative flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.98] ${
        selected
          ? 'border-primary bg-primary/10 text-gray-900'
          : 'border-orange-100 bg-white text-gray-800 hover:border-orange-200'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[10px] ${
          selected ? 'border-primary bg-primary text-white' : 'border-orange-200 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium leading-tight">{participant.fullName}</span>
        {participant.phone && <span className="text-xs text-gray-400">{participant.phone}</span>}
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
  children: React.ReactNode;
}

const Column: React.FC<ColumnProps> = ({ id, title, subtitle, count, accent, header, fill, autoHeight, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[8rem] flex-col rounded-2xl border bg-white p-3 shadow-sm transition ${
        autoHeight ? '' : fill ? 'h-full' : 'max-h-[70vh]'
      } ${isOver ? 'border-primary ring-2 ring-primary/30' : accent ? 'border-orange-200' : 'border-orange-100'}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="min-w-0">
          <h3 className="truncate font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        <span className="ml-2 shrink-0 rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
          {count}
        </span>
      </div>
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
  participantName: string;
  currentGroupId: string | null;
  groups: Group[];
  onPick: (groupId: string | null) => void;
  onClose: () => void;
}

const GroupPickerSheet: React.FC<GroupPickerSheetProps> = ({ participantName, currentGroupId, groups, onPick, onClose }) => {
  const sorted = sortByText(groups, (g) => g.name);
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div className="relative mb-0 max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-gray-900">Move {participantName}</h3>
            <p className="text-xs text-gray-500">Tap a group to assign</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${currentGroupId === null ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            Unassigned
            {currentGroupId === null && <span className="text-primary">✓</span>}
          </button>
          {sorted.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(g.id)}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${currentGroupId === g.id ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <span className="min-w-0 truncate">{g.name}<span className="ml-2 text-xs font-normal text-gray-400">{g.supportName ?? 'No support'}</span></span>
              {currentGroupId === g.id && <span className="ml-2 shrink-0 text-primary">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────

const AdminAllocationPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [distributePlan, setDistributePlan] = useState<{ assignments: Array<{ participantId: string; groupId: string }>; summary: string; count: number } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<Participant | null>(null);
  const isTouchLayout = useIsTouchLayout();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ groups: gs }, { participants: ps }] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id }),
        participantsApi.getAll({ cohortId: activeCohort.id }),
      ]);
      setGroups([...gs].sort((a, b) => groupNameCollator.compare(a.name, b.name)));
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
    participants.forEach((p) => {
      const key = p.groupId && map.has(p.groupId) ? p.groupId : UNASSIGNED;
      map.get(key)!.push(p);
    });
    map.forEach((list, key) => map.set(key, sortByText(list, (participant) => participant.fullName)));
    return map;
  }, [groups, participants]);

  const unassigned = byGroup.get(UNASSIGNED) ?? [];
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
    async (movingIds: string[], toGroupId: string | null) => {
      const toName = toGroupId ? groups.find((g) => g.id === toGroupId)?.name ?? null : null;
      const snapshot = participants;
      setParticipants((prev) =>
        prev.map((p) => (movingIds.includes(p.id) ? { ...p, groupId: toGroupId, groupName: toName } : p))
      );
      setSelected(new Set());
      setSaving(true);
      setErr('');
      try {
        if (movingIds.length === 1) {
          await groupsApi.moveParticipant(movingIds[0], toGroupId);
        } else if (toGroupId) {
          await groupsApi.bulkAssign(movingIds.map((participantId) => ({ participantId, groupId: toGroupId })));
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
    [groups, participants]
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
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

  // Auto-distribute the unassigned evenly across groups (round-robin).
  const autoDistributeRef = useRef<HTMLButtonElement>(null);
  // Build the greedy even-distribution plan and open the confirm modal.
  const handleAutoDistribute = () => {
    if (groups.length === 0 || unassigned.length === 0) return;
    const base = groups.map((g) => byGroup.get(g.id)?.length ?? 0);
    // Greedy: always drop the next person into the currently-smallest group.
    const counts = [...base];
    const assignments: Array<{ participantId: string; groupId: string }> = [];
    unassigned.forEach((p) => {
      let min = 0;
      for (let i = 1; i < counts.length; i++) if (counts[i] < counts[min]) min = i;
      counts[min] += 1;
      assignments.push({ participantId: p.id, groupId: groups[min].id });
    });
    const summary = groups.map((g, i) => `${g.name}: ${counts[i]}`).join(' · ');
    setDistributePlan({ assignments, summary, count: unassigned.length });
  };

  const applyAutoDistribute = async () => {
    if (!distributePlan) return;
    const { assignments } = distributePlan;
    setDistributePlan(null);
    const snapshot = participants;
    const nameById = new Map(groups.map((g) => [g.id, g.name]));
    const groupById = new Map(assignments.map((a) => [a.participantId, a.groupId]));
    setParticipants((prev) =>
      prev.map((p) =>
        groupById.has(p.id)
          ? { ...p, groupId: groupById.get(p.id)!, groupName: nameById.get(groupById.get(p.id)!) ?? null }
          : p
      )
    );
    setSaving(true);
    setErr('');
    try {
      await groupsApi.bulkAssign(assignments);
    } catch (e: any) {
      setParticipants(snapshot);
      setErr(e?.message || 'Auto-distribute failed. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Allocate Participants"
        subtitle={activeCohort ? `${unassigned.length} unassigned · ${activeCohort.name}` : 'No active cohort'}
        action={
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 active:scale-95"
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
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">Create at least one group first, then come back to allocate.</p>
        </div>
      ) : (
        <>
          {err && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              {isTouchLayout
                ? 'Tap “Move” on anyone to assign them, or select several and use “Move selected”.'
                : 'Tap people to select them, then drag onto a group — or use “Move selected”.'} {saving && <span className="text-primary">Saving…</span>}
            </p>
            <button
              ref={autoDistributeRef}
              type="button"
              onClick={() => void handleAutoDistribute()}
              disabled={unassigned.length === 0 || saving}
              className="self-start rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              Auto-distribute evenly
            </button>
          </div>

          {/* Explicit move bar — reliable on every device, complements drag */}
          {selected.size > 0 && (
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
                      ...sortByText(groups, (group) => group.name).map((g) => ({ value: g.id, label: g.name })),
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
                className="w-full rounded-xl border border-orange-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {filteredAll.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-400">
                  {participants.length === 0 ? 'No participants yet.' : 'No matches.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {filteredAll.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 shadow-sm transition ${selected.has(p.id) ? 'border-primary bg-primary/5' : 'border-orange-100'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        aria-label={selected.has(p.id) ? 'Deselect' : 'Select'}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${selected.has(p.id) ? 'border-primary bg-primary text-white' : 'border-orange-200 text-transparent'}`}
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{p.fullName}</p>
                        <p className="truncate text-xs text-gray-400">
                          {p.phone ? `${p.phone} · ` : ''}
                          <span className={p.groupName ? 'text-gray-500' : 'text-amber-600'}>{p.groupName ?? 'Unassigned'}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerTarget(p)}
                        disabled={saving}
                        className="shrink-0 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-orange-50 active:scale-95 disabled:opacity-50"
                      >
                        Move
                      </button>
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
              count={unassigned.length}
              accent
              fill
              header={(
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-xl border border-orange-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            >
              {filteredUnassigned.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  {unassigned.length === 0 ? 'Everyone is allocated 🎉' : 'No matches'}
                </p>
              ) : (
                filteredUnassigned.map((p) => (
                  <ParticipantChip key={p.id} participant={p} selected={selected.has(p.id)} onToggle={toggle} dragCount={dragCount} />
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
                  <Column id={g.id} title={g.name} subtitle={g.supportName ?? 'No support assigned'} count={members.length} autoHeight>
                    {members.length === 0 ? (
                      <p className="py-4 text-center text-xs text-gray-400">Drag people here</p>
                    ) : (
                      members.map((p) => (
                        <ParticipantChip key={p.id} participant={p} selected={selected.has(p.id)} onToggle={toggle} dragCount={dragCount} />
                      ))
                    )}
                  </Column>
                  </div>
                );
              })}
              </div>
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

      {pickerTarget && (
        <GroupPickerSheet
          participantName={pickerTarget.fullName}
          currentGroupId={pickerTarget.groupId ?? null}
          groups={groups}
          onPick={(groupId) => {
            const target = pickerTarget;
            setPickerTarget(null);
            if ((target.groupId ?? null) !== groupId) void applyMove([target.id], groupId);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      <ConfirmationModal
        isOpen={!!distributePlan}
        onClose={() => setDistributePlan(null)}
        onConfirm={() => { void applyAutoDistribute(); }}
        title="Auto-distribute participants"
        message={distributePlan ? `Spread ${distributePlan.count} unassigned across ${groups.length} groups?\n\nResult → ${distributePlan.summary}` : ''}
        confirmText="Distribute"
        type="info"
      />
    </div>
  );
};

export default AdminAllocationPage;
