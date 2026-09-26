import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { faithProjectsApi, faithProjectCategoriesApi, faithProjectSettingsApi, faithThreadReadsApi, faithHelpRequestsApi, testimoniesApi, participantNotesApi, participantsApi, groupsApi } from '../services/api';
import { FAITH_HELP_REASON_LABELS } from '../types';
import type { FaithHelpRequest, FaithProject, FaithProjectCategory, FaithProjectReviewEntry, FaithProjectSettings, FaithProjectStatus, Group, Participant, ParticipantNote, Testimony, TestimonyStatus } from '../types';
import { unreadTrails } from '../utils/faithThread';
import ModalShell from '../components/followups/ModalShell';
import AppSelect from '../components/AppSelect';
import FaithProjectsExportPopup from '../components/faithProjects/FaithProjectsExportPopup';
import FaithProjectSettingsModal from '../components/faithProjects/FaithProjectSettingsModal';
import { sortByText } from '../utils/sort';
import Spinner from '../components/Spinner';

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

// ── Conversation with the support ─────────────────────────────────────────────
// The "back office" trail: review decisions plus notes from the support or the
// back office. The support sees the same trail on their faith project sheet.

const SupportConversation: React.FC<{
  history: FaithProjectReviewEntry[];
  notes: ParticipantNote[];
  canReply: boolean;
  onReply: (body: string) => Promise<void>;
}> = ({ history, notes, canReply, onReply }) => {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const entries = [
    ...history.map((entry, i) => ({ key: `r-${i}`, at: entry.at, who: entry.actorName, role: 'Back office', decision: entry.action, text: entry.note ?? '' })),
    ...notes.map((note) => ({ key: note.id, at: note.createdAt, who: note.byParticipant ? 'Participant' : note.authorName || 'Support', role: (note.byParticipant ? 'Participant app' : null) as string | null, decision: null as FaithProjectReviewEntry['action'] | null, text: note.body })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await onReply(reply.trim());
      setReply('');
    } catch (e: any) {
      setError(e?.message || 'Could not send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-orange-100">
      <p className="border-b border-orange-100 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation with the support</p>
      {entries.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-gray-400">No messages yet.</p>
      ) : (
        <div className="max-h-72 divide-y divide-orange-50 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.key} className="px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">{entry.who}</span>
                {entry.decision && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.decision === 'APPROVED' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-orange-100/80 text-orange-700'}`}>
                    {entry.decision === 'APPROVED' ? 'Approved' : 'Needs refinement'}
                  </span>
                )}
                <span className="text-xs text-gray-400">{formatReviewDate(entry.at)}</span>
              </div>
              {entry.text && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{entry.text}</p>}
            </div>
          ))}
        </div>
      )}
      {canReply && (
        <div className="flex flex-wrap gap-2 border-t border-orange-100 p-2.5">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            placeholder="Reply to the support…"
            className="min-w-0 flex-1 rounded-xl border border-orange-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button type="button" onClick={() => void send()} disabled={!reply.trim() || sending} className="rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {sending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send'}
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
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
  officeNotes: ParticipantNote[];
  onNoteAdded: (note: ParticipantNote) => void;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, participant, group, existing, onSaved, currentUser, supportUserId, officeNotes, onNoteAdded }) => {
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
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Submit review'}
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

        <SupportConversation
          history={history}
          notes={officeNotes}
          canReply={!!currentUser}
          onReply={async (body) => {
            if (!currentUser) return;
            const { note: saved } = await participantNotesApi.create({
              participantId: participant.id,
              body,
              authorId: currentUser.id,
              groupId: participant.groupId ?? null,
              noteType: 'FAITH_OFFICE',
            });
            onNoteAdded({ ...saved, authorName: saved.authorName ?? currentUser.name });
          }}
        />
      </div>
    </ModalShell>
  );
};

// ── Testimonies panel ────────────────────────────────────────────────────────

const TESTIMONY_FILTERS: Array<{ value: TestimonyStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Shared' },
  { value: 'HIDDEN', label: 'Hidden' },
];

const TESTIMONY_STATUS_CLS: Record<TestimonyStatus, string> = {
  PENDING: 'bg-amber-100/80 text-amber-700',
  APPROVED: 'bg-emerald-100/80 text-emerald-700',
  HIDDEN: 'bg-neutral-100 text-neutral-600',
};

const TestimoniesPanel: React.FC<{
  testimonies: Testimony[];
  helpRequests: FaithHelpRequest[];
  onReviewed: (testimony: Testimony) => void;
}> = ({ testimonies, helpRequests, onReviewed }) => {
  const [filter, setFilter] = useState<TestimonyStatus | ''>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  const displayed = filter ? testimonies.filter((t) => t.status === filter) : testimonies;

  const review = async (id: string, status: 'APPROVED' | 'HIDDEN') => {
    setBusyId(id);
    try {
      const { testimony } = await testimoniesApi.review(id, status);
      onReviewed({ ...testimonies.find((t) => t.id === id)!, ...testimony });
    } catch { /* stays visible to try again */ } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {helpRequests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-gray-900">Open faith project help requests ({helpRequests.length})</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {helpRequests.map((r) => (
              <div key={r.id} className="rounded-xl bg-orange-50/60 px-3.5 py-2.5 text-sm">
                <span className="font-semibold text-gray-900">{r.participantName}</span>
                <span className="text-gray-500"> · {FAITH_HELP_REASON_LABELS[r.reason]} · {formatReviewDate(r.createdAt)}</span>
                {r.note && <p className="mt-1 text-xs text-gray-600">{r.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TESTIMONY_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${filter === f.value ? 'bg-primary text-white' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {f.label} <span className="ml-1 opacity-70">{f.value ? testimonies.filter((t) => t.status === f.value).length : testimonies.length}</span>
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No testimonies here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map((t) => (
            <div key={t.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{t.participantName}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TESTIMONY_STATUS_CLS[t.status]}`}>
                  {t.status === 'PENDING' ? 'Waiting for approval' : t.status === 'APPROVED' ? 'Shared' : 'Hidden'}
                </span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">{t.visibility === 'COHORT' ? 'Cohort' : t.visibility === 'GROUP' ? 'Group' : 'Support only'}</span>
                <span className="ml-auto text-xs text-gray-400">{formatReviewDate(t.createdAt)}</span>
              </div>
              {t.title && <p className="mt-2 text-sm font-semibold text-gray-800">{t.title}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{t.body}</p>
              {(t.status === 'PENDING' || t.status === 'APPROVED') && (
                <div className="mt-3 flex gap-2">
                  {t.status === 'PENDING' && (
                    <button type="button" onClick={() => void review(t.id, 'APPROVED')} disabled={busyId === t.id} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      {busyId === t.id ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Approve'}
                    </button>
                  )}
                  <button type="button" onClick={() => void review(t.id, 'HIDDEN')} disabled={busyId === t.id} className="rounded-xl border border-orange-200 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-60">
                    Hide
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminFaithProjectsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminFaithProjectsContent />;
};

const AdminFaithProjectsContent: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const [searchParams] = useSearchParams();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projects, setProjects] = useState<FaithProject[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FaithProjectStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState(''); // '' = all, '__UNASSIGNED__' = no group
  const [search, setSearch] = useState('');
  const [reviewTarget, setReviewTarget] = useState<{ participant: Participant; project: FaithProject | null } | null>(null);
  const [officeNotes, setOfficeNotes] = useState<ParticipantNote[]>([]);
  // When this admin last read each faith project's support conversation (drives the dot).
  const [threadReads, setThreadReads] = useState<Map<string, string>>(new Map());
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [categories, setCategories] = useState<FaithProjectCategory[]>([]);
  const [settings, setSettings] = useState<FaithProjectSettings | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pageTab, setPageTab] = useState<'projects' | 'testimonies'>(
    searchParams.get('tab') === 'testimonies' ? 'testimonies' : 'projects'
  );
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [openHelpRequests, setOpenHelpRequests] = useState<FaithHelpRequest[]>([]);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { projects: fps }, { groups: gs }, { categories: cs }, { settings: projectSettings }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        faithProjectsApi.getAll({ cohortId: activeCohort.id }),
        groupsApi.getAll({ cohortId: activeCohort.id }),
        faithProjectCategoriesApi.getAll(activeCohort.id),
        faithProjectSettingsApi.get(activeCohort.id),
      ]);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      const ids = ps.filter((p) => p.status === 'ACTIVE').map((p) => p.id);
      const [notesRes, readsRes, testimoniesRes, helpRequestsRes] = await Promise.all([
        participantNotesApi.getForParticipants(ids).catch(() => ({ notes: [] as ParticipantNote[] })),
        user ? faithThreadReadsApi.getForUser(user.id).catch(() => ({ reads: new Map<string, string>() })) : Promise.resolve({ reads: new Map<string, string>() }),
        testimoniesApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ testimonies: [] as Testimony[] })),
        faithHelpRequestsApi.getOpenForParticipants(ids).catch(() => ({ requests: [] as FaithHelpRequest[] })),
      ]);
      setOfficeNotes(notesRes.notes.filter((n) => n.noteType === 'FAITH_OFFICE'));
      setThreadReads(readsRes.reads);
      setProjects(sortByText(fps, (project) => project.title || project.participantName));
      setGroups(sortByText(gs, (group) => group.name));
      setCategories(cs);
      setSettings(projectSettings);
      setTestimonies(testimoniesRes.testimonies);
      setOpenHelpRequests(helpRequestsRes.requests);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, user]);

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
    if (categoryFilter) ps = ps.filter((p) => projectByParticipant.get(p.id)?.categoryId === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
  }, [participants, filterStatus, search, projectByParticipant, groupFilter, categoryFilter]);

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
        tourId="admin:faith-projects"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
        action={
          !loading && (
            <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowSettings(true)} aria-label="Faith Project settings" title="Faith Project settings" className="grid h-11 w-11 place-items-center rounded-2xl border border-orange-200 bg-white text-gray-700 shadow-sm transition hover:bg-orange-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317a1.5 1.5 0 0 1 2.85 0l.267.879a1.5 1.5 0 0 0 1.81 1.004l.88-.267a1.5 1.5 0 0 1 2.015 2.015l-.267.88a1.5 1.5 0 0 0 1.004 1.81l.879.267a1.5 1.5 0 0 1 0 2.85l-.879.267a1.5 1.5 0 0 0-1.004 1.81l.267.88a1.5 1.5 0 0 1-2.015 2.015l-.88-.267a1.5 1.5 0 0 0-1.81 1.004l-.267.879a1.5 1.5 0 0 1-2.85 0l-.267-.879a1.5 1.5 0 0 0-1.81-1.004l-.88.267a1.5 1.5 0 0 1-2.015-2.015l.267-.88a1.5 1.5 0 0 0-1.004-1.81l-.879-.267a1.5 1.5 0 0 1 0-2.85l.879-.267a1.5 1.5 0 0 0 1.004-1.81l-.267-.88a1.5 1.5 0 0 1 2.015-2.015l.88.267a1.5 1.5 0 0 0 1.81-1.004l.267-.879Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            </button>
            {groups.length > 0 && <button
              type="button"
              onClick={() => setShowExportPopup(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-orange-50 hover:border-orange-300 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>}
            </div>
          )
        }
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : (
        <>
          <div className="mb-6 flex gap-2" role="tablist" aria-label="Faith projects sections">
            {([
              { key: 'projects', label: 'Faith projects' },
              { key: 'testimonies', label: `Testimonies${testimonies.filter((t) => t.status === 'PENDING').length > 0 ? ` (${testimonies.filter((t) => t.status === 'PENDING').length})` : ''}` },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={pageTab === t.key}
                onClick={() => setPageTab(t.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${pageTab === t.key ? 'bg-primary text-white' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {pageTab === 'testimonies' ? (
            <TestimoniesPanel
              testimonies={testimonies}
              helpRequests={openHelpRequests}
              onReviewed={(updated) => setTestimonies((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
            />
          ) : (
          <>
          {/* Summary */}
          {!loading && (
            <div data-wt="faith-status" className="mb-6 flex flex-wrap gap-3">
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

          <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search participant…"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-md sm:flex-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
              <div className="min-w-0">
                <AppSelect
                  value={groupFilter}
                  onChange={setGroupFilter}
                  options={groupOptions}
                  placeholder="All groups"
                  compact
                />
              </div>
              <div className="min-w-0">
                <AppSelect value={categoryFilter} onChange={setCategoryFilter} options={[{ value: '', label: 'All categories' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} placeholder="All categories" compact />
              </div>
            </div>
          </div>
          {settings?.deadlineAt && <p className="mb-4 text-sm font-semibold text-[#9a6a4b]">Submission deadline: {formatReviewDate(settings.deadlineAt)}</p>}

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
                    <th className="sticky right-0 bg-orange-50/60 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {displayed.map((p) => {
                    const fp = projectByParticipant.get(p.id) ?? null;
                    const s: FaithProjectStatus = fp?.status ?? 'NOT_DRAFTED';
                    const newMessages = !!user && unreadTrails(p.id, fp, officeNotes, user.id, threadReads).has('office');
                    return (
                      <tr key={p.id} className="hover:bg-orange-50/30">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                        <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls(s)}`}>
                            {statusLabel(s)}
                            {newMessages && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="New message from the support" title="New message from the support" />}
                          </span>
                        </td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewTarget({ participant: p, project: fp });
                              if (newMessages && user) {
                                setThreadReads((prev) => new Map(prev).set(`${p.id}:office`, new Date().toISOString()));
                                void faithThreadReadsApi.markRead(user.id, p.id, 'office').catch(() => undefined);
                              }
                            }}
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
          officeNotes={officeNotes.filter((n) => n.participantId === reviewTarget.participant.id)}
          onNoteAdded={(note) => setOfficeNotes((prev) => [...prev, note])}
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
      {activeCohort && settings && <FaithProjectSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} cohortId={activeCohort.id} categories={categories} settings={settings} onChanged={(nextSettings, nextCategories) => { setSettings(nextSettings); setCategories(nextCategories); }} />}
    </div>
  );
};

export default AdminFaithProjectsPage;
