import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { faithProjectsApi, participantsApi, groupsApi } from '../services/api';
import type { FaithProject, FaithProjectStatus, Participant, Group } from '../types';
import ModalShell from '../components/followups/ModalShell';
import AppSelect from '../components/AppSelect';
import { sortByText } from '../utils/sort';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: 'Not Drafted', cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'UNDER_REFINEMENT', label: 'Under Refinement', cls: 'bg-amber-100/80 text-amber-700' },
  { value: 'APPROVED', label: 'Approved', cls: 'bg-emerald-100/80 text-emerald-700' },
];

const statusLabel = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
const statusCls = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? 'bg-neutral-100 text-neutral-600';

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: Participant;
  existing: FaithProject | null;
  onSaved: (fp: FaithProject) => void;
  currentUserId?: string;
}

const EditModal: React.FC<EditModalProps> = ({ isOpen, onClose, participant, existing, onSaved, currentUserId }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<FaithProjectStatus>('NOT_DRAFTED');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(existing?.title ?? '');
      setBody(existing?.body ?? '');
      setStatus(existing?.status ?? 'NOT_DRAFTED');
      setErr('');
    }
  }, [isOpen, existing]);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { project } = await faithProjectsApi.upsertForParticipant(participant.id, {
        title: title.trim() || null,
        body: body.trim() || null,
        status,
        updatedById: currentUserId ?? null,
      });
      onSaved(project);
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
      title={`Faith project: ${participant.fullName}`}
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  status === opt.value ? opt.cls + ' ring-2 ring-offset-1 ring-primary/40' : 'border border-orange-100 bg-white text-gray-500 hover:bg-orange-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Optional project title"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Description / Notes</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="What is this participant working on?"
          />
        </div>
      </div>
    </ModalShell>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminFaithProjectsPage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { activeCohort, liveRevision } = useAppData();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projects, setProjects] = useState<FaithProject[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FaithProjectStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState(''); // '' = all, '__UNASSIGNED__' = no group
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<{ participant: Participant; project: FaithProject | null } | null>(null);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { projects: fps }, { groups: gs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        faithProjectsApi.getAll({ cohortId: activeCohort.id }),
        groupsApi.getAll({ cohortId: activeCohort.id }),
      ]);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      setProjects(sortByText(fps, (project) => project.title || project.participantName));
      setGroups(sortByText(gs, (group) => group.name));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  const projectByParticipant = useMemo(() => {
    const map = new Map<string, FaithProject>();
    projects.forEach((fp) => map.set(fp.participantId, fp));
    return map;
  }, [projects]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      { value: '__UNASSIGNED__', label: 'Unassigned' },
      ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  const displayed = useMemo(() => {
    let ps = participants;
    if (groupFilter === '__UNASSIGNED__') {
      ps = ps.filter((p) => !p.groupId);
    } else if (groupFilter) {
      ps = ps.filter((p) => p.groupId === groupFilter);
    }
    if (filterStatus) {
      ps = ps.filter((p) => {
        const fp = projectByParticipant.get(p.id);
        return (fp?.status ?? 'NOT_DRAFTED') === filterStatus;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
  }, [participants, filterStatus, search, projectByParticipant, groupFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { NOT_DRAFTED: 0, UNDER_REFINEMENT: 0, APPROVED: 0 };
    participants.forEach((p) => {
      const s = projectByParticipant.get(p.id)?.status ?? 'NOT_DRAFTED';
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [participants, projectByParticipant]);

  return (
    <div className="page-content">
      <PageHeader
        title="Faith projects"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : (
        <>
          {/* Summary */}
          {!loading && (
            <div className="mb-6 flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterStatus((prev) => prev === opt.value ? '' : opt.value)}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    filterStatus === opt.value ? opt.cls + ' ring-2 ring-offset-1 ring-primary/30' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'
                  }`}
                >
                  {opt.label} <span className="ml-1 opacity-70">{counts[opt.value] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search participant…"
              className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
            />
            <div className="w-full sm:w-52">
              <AppSelect
                value={groupFilter}
                onChange={setGroupFilter}
                options={groupOptions}
                placeholder="All groups"
                compact
              />
            </div>
          </div>

          {loading ? (
            <PageLoader />
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">No participants match your filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-100 bg-orange-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Participant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                    <th className="sticky right-0 bg-orange-50/60 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {displayed.map((p) => {
                    const fp = projectByParticipant.get(p.id) ?? null;
                    const s: FaithProjectStatus = fp?.status ?? 'NOT_DRAFTED';
                    return (
                      <tr key={p.id} className="hover:bg-orange-50/30">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                        <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls(s)}`}>
                            {statusLabel(s)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{fp?.title ?? '—'}</td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditTarget({ participant: p, project: fp })}
                            className="rounded-xl border border-orange-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-orange-50 active:scale-95"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editTarget && (
        <EditModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          participant={editTarget.participant}
          existing={editTarget.project}
          onSaved={(fp) => {
            setProjects((prev) => {
              const idx = prev.findIndex((x) => x.id === fp.id);
              const next = idx >= 0 ? prev.map((x) => x.id === fp.id ? fp : x) : [...prev, fp];
              return sortByText(next, (project) => project.title || project.participantName);
            });
            setEditTarget(null);
          }}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
};

export default AdminFaithProjectsPage;
