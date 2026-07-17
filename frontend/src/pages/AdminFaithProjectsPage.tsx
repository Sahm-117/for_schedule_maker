import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { faithProjectsApi, participantsApi, groupsApi } from '../services/api';
import type { FaithProject, FaithProjectReviewEntry, FaithProjectStatus, Group, Participant } from '../types';
import ModalShell from '../components/followups/ModalShell';
import AppSelect from '../components/AppSelect';
import FaithProjectsExportPopup from '../components/faithProjects/FaithProjectsExportPopup';
import { sortByText } from '../utils/sort';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: 'Not Drafted', cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'AWAITING_DRAFT', label: 'Awaiting Draft', cls: 'bg-sky-100/80 text-sky-700' },
  { value: 'UNDER_REFINEMENT', label: 'Under Refinement', cls: 'bg-amber-100/80 text-amber-700' },
  { value: 'NEEDS_REFINEMENT', label: 'Needs Refinement', cls: 'bg-orange-100/80 text-orange-700' },
  { value: 'APPROVED', label: 'Approved', cls: 'bg-emerald-100/80 text-emerald-700' },
];

const statusLabel = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
const statusCls = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? 'bg-neutral-100 text-neutral-600';

const formatReviewDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

// ── Review History Accordion ─────────────────────────────────────────────────

const ReviewHistory: React.FC<{ history: FaithProjectReviewEntry[] }> = ({ history }) => {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-gray-600"
      >
        <span>{history.length} review{history.length > 1 ? 's' : ''}</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y divide-orange-100 border-t border-orange-100">
          {[...history].reverse().map((entry, i) => (
            <div key={i} className="px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.action === 'APPROVED' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-orange-100/80 text-orange-700'}`}>
                  {entry.action === 'APPROVED' ? 'Approved' : 'Needs Refinement'}
                </span>
                <span className="text-xs text-gray-500">{entry.actorName} · {formatReviewDate(entry.at)}</span>
              </div>
              {entry.note && <p className="mt-1.5 text-xs text-gray-600">{entry.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Review Modal ──────────────────────────────────────────────────────────────

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: Participant;
  group?: Group | null;
  existing: FaithProject | null;
  onSaved: (fp: FaithProject) => void;
  currentUser: { id: string; name: string } | null;
  supportUserId?: string | null;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, participant, group, existing, onSaved, currentUser, supportUserId }) => {
  const [decision, setDecision] = useState<'APPROVED' | 'NEEDS_REFINEMENT' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) { setDecision(null); setNote(''); setErr(''); }
  }, [isOpen, existing?.id]);

  const canSubmit = decision !== null && (decision !== 'NEEDS_REFINEMENT' || note.trim().length > 0);

  const handleSubmit = async () => {
    if (!existing || !currentUser || !canSubmit || !decision) return;
    setSaving(true);
    setErr('');
    try {
      const { project } = await faithProjectsApi.reviewProject(existing.id, {
        status: decision,
        note: note.trim() || null,
        actorId: currentUser.id,
        actorName: currentUser.name,
      });

      // Notify the assigned support user (fire-and-forget — don't block on push errors)
      if (supportUserId) {
        void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-faith-project-review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            supportUserId,
            participantName: participant.fullName,
            action: decision,
            note: note.trim() || undefined,
          }),
        }).catch(() => { /* ignore push errors */ });
      }

      onSaved(project);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  const history = existing?.reviewHistory ?? [];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Review: ${participant.fullName}`}
      subtitle={group?.name}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || saving || !existing}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Submit review'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

        {/* Project content */}
        <div className="rounded-xl border border-orange-100 bg-white p-3.5">
          {existing?.title && <p className="mb-1 text-sm font-semibold text-gray-900">{existing.title}</p>}
          {existing?.body ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{existing.body}</p>
          ) : (
            <p className="text-sm italic text-gray-400">No content drafted yet.</p>
          )}
        </div>

        {/* Decision */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Your decision</p>
          <div className="flex gap-2">
            {(['APPROVED', 'NEEDS_REFINEMENT'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                  decision === d
                    ? d === 'APPROVED' ? 'border-emerald-300 bg-emerald-100/80 text-emerald-700' : 'border-orange-300 bg-orange-100/80 text-orange-700'
                    : 'border-orange-100 bg-white text-gray-500 hover:bg-orange-50'
                }`}
              >
                {d === 'APPROVED' ? 'Approve' : 'Needs Refinement'}
              </button>
            ))}
          </div>
        </div>

        {/* Reason — only when requesting refinement */}
        {decision === 'NEEDS_REFINEMENT' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Tell the support what needs to change…"
            />
          </div>
        )}

        {/* Review history accordion */}
        <ReviewHistory history={history} />
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
  const [reviewTarget, setReviewTarget] = useState<{ participant: Participant; project: FaithProject | null } | null>(null);
  const [showExportPopup, setShowExportPopup] = useState(false);

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

  const groupById = useMemo(() => {
    const map = new Map<string, Group>();
    groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [groups]);

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
        action={
          !loading && groups.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExportPopup(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-orange-50 hover:border-orange-300 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          )
        }
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
                            onClick={() => setReviewTarget({ participant: p, project: fp })}
                            className="rounded-xl border border-orange-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-orange-50 active:scale-95"
                          >
                            Review
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

      {reviewTarget && (
        <ReviewModal
          isOpen={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          participant={reviewTarget.participant}
          group={reviewTarget.participant.groupId ? (groupById.get(reviewTarget.participant.groupId) ?? null) : null}
          existing={reviewTarget.project}
          onSaved={(fp) => {
            setProjects((prev) => {
              const idx = prev.findIndex((x) => x.id === fp.id);
              const next = idx >= 0 ? prev.map((x) => x.id === fp.id ? fp : x) : [...prev, fp];
              return sortByText(next, (project) => project.title || project.participantName);
            });
            setReviewTarget(null);
          }}
          currentUser={user ? { id: user.id, name: user.name ?? user.email ?? 'Admin' } : null}
          supportUserId={reviewTarget.participant.groupId ? (groupById.get(reviewTarget.participant.groupId)?.supportId ?? null) : null}
        />
      )}

      {showExportPopup && (
        <FaithProjectsExportPopup
          groups={groups}
          participants={participants}
          projectByParticipant={projectByParticipant}
          cohortName={activeCohort?.name ?? ''}
          onClose={() => setShowExportPopup(false)}
        />
      )}
    </div>
  );
};

export default AdminFaithProjectsPage;
