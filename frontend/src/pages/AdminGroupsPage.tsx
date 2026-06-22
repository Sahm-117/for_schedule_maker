import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, participantsApi, usersApi } from '../services/api';
import type { Group, Participant, User } from '../types';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import PageLoader from '../components/PageLoader';
import { sortByText } from '../utils/sort';

const groupNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

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
}

const GroupFormModal: React.FC<GroupFormModalProps> = ({ isOpen, onClose, onSaved, cohortId, existing, supportUsers }) => {
  const [name, setName] = useState('');
  const [supportId, setSupportId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setSupportId(existing?.supportId ?? '');
      setErr('');
    }
  }, [isOpen, existing]);

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
        }));
      } else {
        ({ group: result } = await groupsApi.create({
          cohortId,
          name: name.trim(),
          supportId: supportId || null,
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Group name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              ...supportUsers.map((u) => ({ value: u.id, label: u.name })),
            ]}
            placeholder="— None —"
            compact
          />
        </div>
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
}

const AssignSupportModal: React.FC<AssignSupportModalProps> = ({ isOpen, onClose, onSaved, group, supportUsers }) => {
  const [supportId, setSupportId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSupportId(group.supportId ?? '');
      setErr('');
    }
  }, [isOpen, group]);

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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned support</label>
          <AppSelect
            value={supportId}
            onChange={setSupportId}
            options={[
              { value: '', label: '— None —' },
              ...supportUsers.map((u) => ({ value: u.id, label: u.name })),
            ]}
            placeholder="— None —"
            compact
          />
        </div>
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
  onUpdated: (g: Group) => void;
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
      await groupsApi.setParticipants(group.id, [...selected]);
      onUpdated({ ...group, participantCount: selected.size });
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
    if (!search.trim()) return assignable;
    const q = search.toLowerCase();
    return assignable.filter((p) =>
      p.fullName.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q)
    );
  }, [assignable, search]);

  const selectedParticipants = useMemo(
    () => allParticipants.filter((participant) => selected.has(participant.id)),
    [allParticipants, selected]
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Members — ${group.name}`}
      subtitle={`${selected.size} selected`}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || loading} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save members'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        {selectedParticipants.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-orange-100 bg-orange-50/50 p-3">
            {selectedParticipants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                onClick={() => toggle(participant.id)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 shadow-sm"
              >
                <span>{participant.fullName}</span>
                <span className="text-xs text-red-500">Remove</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants…"
          className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          // On mobile the search keyboard otherwise eats the first tap on a row
          // (tap 1 blurs the input, tap 2 selects). Dismiss the keyboard as soon
          // as the user starts scrolling the list, and toggle on pointerdown so
          // the first tap always registers.
          <ul
            className="max-h-80 touch-pan-y overflow-y-auto divide-y divide-orange-50"
            onTouchMove={() => searchRef.current?.blur()}
          >
            {filtered.map((p) => (
              <li
                key={p.id}
                onPointerDown={(e) => { e.preventDefault(); searchRef.current?.blur(); toggle(p.id); }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg py-2.5 transition ${selected.has(p.id) ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}
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
  const { activeCohort, liveRevision } = useAppData();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [membersTarget, setMembersTarget] = useState<Group | null>(null);
  const [supportTarget, setSupportTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [noSupportOnly, setNoSupportOnly] = useState(false);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // `silent` background refreshes (triggered by realtime liveRevision bumps)
  // update the data in place WITHOUT flipping `loading`, so the grid doesn't
  // flash a full-page "Loading…" every time anything changes in the cohort.
  const load = useCallback(async (silent = false) => {
    if (!activeCohort) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [{ groups: gs }, { participants: ps }, { users }] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id }),
        participantsApi.getAll({ cohortId: activeCohort.id }),
        usersApi.getAll(),
      ]);
      setGroups(sortGroupsByName(gs));
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      setSupportUsers(sortByText(users.filter((u) => u.role === 'SUPPORT'), (user) => user.name));
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [activeCohort]);

  // Initial / cohort-change load shows the loader.
  useEffect(() => { void load(false); }, [load]);
  // Realtime updates refresh silently (no flash). Skip the very first run since
  // the load above already covers it.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!didInitialLoad.current) { didInitialLoad.current = true; return; }
    void load(true);
  }, [liveRevision, load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const g = deleteTarget;
    try {
      await groupsApi.delete(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch { /* ignore */ }
    finally { setDeleteTarget(null); }
  };

  const noSupportCount = groups.filter((g) => !g.supportId).length;
  const displayedGroups = noSupportOnly ? groups.filter((g) => !g.supportId) : groups;

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

  return (
    <div className="page-content">
      <PageHeader
        title="Groups"
        subtitle={activeCohort ? `${groups.length} groups · ${participants.length} participants · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            <div className="flex gap-2">
              <button type="button" onClick={() => navigate('/allocation')} className="rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 active:scale-95">
                Allocate participants
              </button>
              <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + New Group
              </button>
            </div>
          )
        }
      />

      {activeCohort && !loading && groups.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNoSupportOnly(false)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${!noSupportOnly ? 'bg-primary/10 text-primary' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            All groups
          </button>
          <button
            type="button"
            onClick={() => setNoSupportOnly(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${noSupportOnly ? 'bg-amber-100/80 text-amber-700' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            No support assigned <span className="ml-1 opacity-70">{noSupportCount}</span>
          </button>
        </div>
      )}

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No groups yet. Create one and assign a Support member.</p>
        </div>
      ) : displayedGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">All groups have a support assigned. 🎉</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedGroups.map((g) => {
            const members = membersByGroupId.get(g.id) ?? [];
            return (
              <div key={g.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                {/* Header: name + support subtitle on the left; count badge +
                    overflow menu on the right (mirrors the allocation columns). */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-gray-900">{g.name}</h3>
                    <p className={`truncate text-xs ${g.supportName ? 'text-gray-500' : 'text-neutral-400'}`}>
                      {g.supportName || 'No support assigned'}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                      {g.participantCount ?? members.length}
                    </span>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Manage members', onClick: () => setMembersTarget(g) },
                        { label: 'Assign support', onClick: () => setSupportTarget(g) },
                        { label: 'Edit', onClick: () => { setEditing(g); setFormOpen(true); } },
                        { label: 'Delete', onClick: () => setDeleteTarget(g), tone: 'danger' },
                      ]}
                    />
                  </div>
                </div>

                {/* Members always visible at a glance — name + phone cards. */}
                {members.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-orange-200 px-3 py-4 text-center text-xs text-gray-400">No members yet</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {members.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-orange-100 bg-white px-3 py-2 shadow-sm"
                      >
                        <p className="truncate text-sm font-semibold leading-tight text-gray-900">{p.fullName}</p>
                        {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
        supportUsers={supportUsers}
      />

      {supportTarget && (
        <AssignSupportModal
          isOpen={!!supportTarget}
          onClose={() => setSupportTarget(null)}
          group={supportTarget}
          supportUsers={supportUsers}
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
          onUpdated={(g) => {
            setGroups((prev) => sortGroupsByName(prev.map((x) => x.id === g.id ? g : x)));
            setMembersTarget(null);
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete group"
        message={`Delete "${deleteTarget?.name}"? This also removes all member assignments.`}
        confirmText="Delete"
      />
    </div>
  );
};

export default AdminGroupsPage;
