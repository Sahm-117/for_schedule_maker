import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, participantsApi } from '../services/api';
import type { Group, Participant } from '../types';

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
      <span className="flex-1 truncate font-medium">{participant.fullName}</span>
      {participant.phone && <span className="hidden text-xs text-gray-400 sm:inline">{participant.phone}</span>}
      {selected && dragCount > 1 && (
        <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{dragCount}</span>
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
  children: React.ReactNode;
}

const Column: React.FC<ColumnProps> = ({ id, title, subtitle, count, accent, header, fill, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[8rem] flex-col rounded-2xl border bg-white p-3 shadow-sm transition ${
        fill ? 'h-full' : 'max-h-[70vh]'
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
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">{children}</div>
    </div>
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
      setParticipants(ps.filter((p) => p.status === 'ACTIVE'));
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
    map.forEach((list) => list.sort((a, b) => a.fullName.localeCompare(b.fullName)));
    return map;
  }, [groups, participants]);

  const unassigned = byGroup.get(UNASSIGNED) ?? [];
  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    const q = search.toLowerCase();
    return unassigned.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
  }, [unassigned, search]);

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
  const handleAutoDistribute = async () => {
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
    if (!window.confirm(`Spread ${unassigned.length} unassigned across ${groups.length} groups?\n\nResult → ${summary}`)) return;

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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {err && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Tap people to select them, then drag onto a group — or use “Move selected”. {saving && <span className="text-primary">Saving…</span>}
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
                      ...groups.map((g) => ({ value: g.id, label: g.name })),
                    ]}
                    placeholder="Choose group…"
                    compact
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fixed-height board: each pane scrolls internally, so the page itself
              doesn't double-scroll. */}
          <div className="grid h-[calc(100vh-17rem)] min-h-[24rem] items-stretch gap-4 lg:grid-cols-[minmax(22rem,26rem)_1fr]">
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

            {/* Group columns — the whole right pane scrolls internally */}
            <div className="grid h-full grid-cols-1 content-start gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => {
                const members = byGroup.get(g.id) ?? [];
                return (
                  <Column key={g.id} id={g.id} title={g.name} subtitle={g.supportName ?? 'No support assigned'} count={members.length}>
                    {members.length === 0 ? (
                      <p className="py-4 text-center text-xs text-gray-400">Drag people here</p>
                    ) : (
                      members.map((p) => (
                        <ParticipantChip key={p.id} participant={p} selected={selected.has(p.id)} onToggle={toggle} dragCount={dragCount} />
                      ))
                    )}
                  </Column>
                );
              })}
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
    </div>
  );
};

export default AdminAllocationPage;
