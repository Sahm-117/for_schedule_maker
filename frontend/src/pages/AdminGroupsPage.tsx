import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const filtered = useMemo(() => {
    if (!search.trim()) return allParticipants;
    const q = search.toLowerCase();
    return allParticipants.filter((p) =>
      p.fullName.toLowerCase().includes(q) || (p.phone ?? '').toLowerCase().includes(q)
    );
  }, [allParticipants, search]);

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
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants…"
          className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto divide-y divide-orange-50">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  id={`mp-${p.id}`}
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor={`mp-${p.id}`} className="flex-1 cursor-pointer text-sm text-gray-800">
                  {p.fullName}
                  {p.phone && <span className="ml-2 text-xs text-gray-400">{p.phone}</span>}
                </label>
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
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ groups: gs }, { participants: ps }, { users }] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id }),
        participantsApi.getAll({ cohortId: activeCohort.id }),
        usersApi.getAll(),
      ]);
      setGroups(sortGroupsByName(gs));
      setParticipants(ps.filter((p) => p.status === 'ACTIVE'));
      setSupportUsers(users.filter((u) => u.role === 'SUPPORT'));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const g = deleteTarget;
    try {
      await groupsApi.delete(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch { /* ignore */ }
    finally { setDeleteTarget(null); }
  };

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

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No groups yet. Create one and assign a Support member.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-gray-900">{g.name}</h3>
                <AppOverflowMenu
                  align="right"
                  items={[
                    { label: 'Manage members', onClick: () => setMembersTarget(g) },
                    { label: 'Edit', onClick: () => { setEditing(g); setFormOpen(true); } },
                    { label: 'Delete', onClick: () => setDeleteTarget(g), tone: 'danger' },
                  ]}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 font-semibold text-sky-700">
                  {g.participantCount ?? 0} members
                </span>
                {g.supportName ? (
                  <span className="rounded-full bg-violet-100/80 px-2.5 py-0.5 font-semibold text-violet-700">
                    {g.supportName}
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-semibold text-neutral-500">No support assigned</span>
                )}
              </div>
            </div>
          ))}
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
