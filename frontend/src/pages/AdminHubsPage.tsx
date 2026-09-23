import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupsApi, supportHubsApi, usersApi } from '../services/api';
import type { Group, HubMembership, SupportHub, User } from '../types';
import ModalShell from '../components/followups/ModalShell';
import ConfirmationModal from '../components/ConfirmationModal';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import PageLoader from '../components/PageLoader';
import { sortByText } from '../utils/sort';

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
    if (!q) return allSupports;
    return allSupports.filter((u) => u.name.toLowerCase().includes(q));
  }, [allSupports, search]);

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

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminHubsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();

  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [memberships, setMemberships] = useState<HubMembership[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupportHub | null>(null);
  const [leadTarget, setLeadTarget] = useState<SupportHub | null>(null);
  const [membersTarget, setMembersTarget] = useState<SupportHub | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupportHub | null>(null);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ hubs: hs }, { memberships: ms }, { users }, { groups: gs }] = await Promise.all([
        supportHubsApi.getAll(activeCohort.id),
        supportHubsApi.getMembershipsForCohort(activeCohort.id),
        usersApi.getAll(),
        groupsApi.getAll({ cohortId: activeCohort.id }),
      ]);
      setHubs(hs);
      setMemberships(ms);
      setSupportUsers(sortByText(users.filter((u) => u.role === 'SUPPORT'), (u) => u.name));
      setGroups(gs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

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

  return (
    <div className="page-content">
      <PageHeader
        title="Hubs"
        subtitle={activeCohort ? `${hubs.length} hubs · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
              + New Hub
            </button>
          )
        }
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : hubs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No hubs yet. Create one and add supports.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hubs.map((h) => {
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
                        { label: 'Edit name', onClick: () => { setEditing(h); setFormOpen(true); } },
                        { label: 'Delete hub', onClick: () => setDeleteTarget(h), tone: 'danger' },
                      ]}
                    />
                  </div>
                </div>

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
