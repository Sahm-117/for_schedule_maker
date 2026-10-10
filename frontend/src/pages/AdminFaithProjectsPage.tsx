import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SegmentedTabs from '../components/SegmentedTabs';
import { Navigate, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/Toast';
import { useAppData } from '../context/AppDataContext';
import { faithProjectsApi, faithProjectCategoriesApi, faithProjectSettingsApi, faithHelpRequestsApi, testimoniesApi, participantsApi, groupsApi } from '../services/api';
import { FAITH_HELP_REASON_LABELS } from '../types';
import type { FaithHelpRequest, FaithProject, FaithProjectCategory, FaithProjectSettings, FaithProjectStatus, FaithProjectVersion, Group, Participant, Testimony, TestimonyStatus } from '../types';
import AppSelect from '../components/AppSelect';
import FaithProjectHistory from '../components/faithProjects/FaithProjectHistory';
import ModalShell from '../components/followups/ModalShell';
import FilterBar, { type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import FaithProjectsExportPopup from '../components/faithProjects/FaithProjectsExportPopup';
import FaithProjectSettingsModal from '../components/faithProjects/FaithProjectSettingsModal';
import { sortByText } from '../utils/sort';
import { FAITH_PROJECT_STATUS_LABEL } from '../utils/participantApp';
import Spinner from '../components/Spinner';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: FAITH_PROJECT_STATUS_LABEL.NOT_DRAFTED, cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'SAVED', label: FAITH_PROJECT_STATUS_LABEL.SAVED, cls: 'bg-emerald-100/80 text-emerald-700' },
];

const statusLabel = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
const statusCls = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? 'bg-neutral-100 text-neutral-600';

const formatReviewDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

// ── Project modal ─────────────────────────────────────────────────────────────
// What the participant saved (they edit it themselves, there is no review step), an optional category and the
// edit history. Admins can set the category; the text is the participant's own.

const ProjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  participant: Participant;
  group?: Group | null;
  project: FaithProject | null;
  categories: FaithProjectCategory[];
  onCategoryChanged: (project: FaithProject) => void;
}> = ({ isOpen, onClose, participant, group, project, categories, onCategoryChanged }) => {
  const { can } = usePermissions();
  const canEdit = can('participants', 'edit');
  const [versions, setVersions] = useState<FaithProjectVersion[]>([]);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [categoryId, setCategoryId] = useState(project?.categoryId ?? '');
  const [err, setErr] = useState('');
  const firstName = participant.fullName.trim().split(/\s+/)[0] || 'Participant';

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setCategoryId(project?.categoryId ?? '');
    setErr('');
    faithProjectsApi.getVersions(participant.id)
      .then((res) => { if (!cancelled) { setVersions(res.versions); setHistoryFailed(false); } })
      .catch(() => { if (!cancelled) { setVersions([]); setHistoryFailed(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, participant.id]);

  const changeCategory = async (next: string) => {
    if (!project) return;
    const previous = categoryId;
    setCategoryId(next);
    setErr('');
    try {
      await faithProjectsApi.setCategory(project.id, next || null);
      onCategoryChanged({ ...project, categoryId: next || null, categoryName: categories.find((category) => category.id === next)?.name ?? null });
    } catch (e: any) {
      setCategoryId(previous);
      setErr(e?.message || 'Could not save the category.');
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={participant.fullName}
      subtitle={group?.name ?? 'Faith project'}
      footer={<button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Close</button>}
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        {participant.prayerConsent === 'OUT' && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">{firstName} opted out of corporate prayers. Their project is not shown in prayer lists.</p>
        )}
        <div className="rounded-xl border border-gray-100 bg-white p-3.5">
          {project?.body ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700">{project.body}</p>
          ) : (
            <p className="text-sm italic text-gray-400">Nothing saved yet.</p>
          )}
        </div>
        {project && (
          <AppSelect label="Category (optional)" disabled={!canEdit} value={categoryId} onChange={(value) => { void changeCategory(value); }} options={[{ value: '', label: 'No category' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} placeholder="No category" />
        )}
        <FaithProjectHistory versions={versions} participantLabel={firstName} loadFailed={historyFailed} />
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
  const showToast = useToast();
  const { can } = usePermissions();
  const canEdit = can('participants', 'edit');
  const [filter, setFilter] = useState<TestimonyStatus | ''>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  const displayed = filter ? testimonies.filter((t) => t.status === filter) : testimonies;

  // Optimistic: the chip/filter counts update immediately; a failure reverts
  // and shows an error toast, matching applyMove in AdminAllocationPage.tsx.
  const review = async (id: string, status: 'APPROVED' | 'HIDDEN') => {
    const previous = testimonies.find((t) => t.id === id);
    if (!previous) return;
    setBusyId(id);
    onReviewed({ ...previous, status });
    try {
      const { testimony } = await testimoniesApi.review(id, status);
      onReviewed({ ...previous, ...testimony });
    } catch (err) {
      onReviewed(previous);
      showToast({ message: err instanceof Error ? err.message : 'Could not update that testimony. Please try again.', tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {helpRequests.length > 0 && (
        <div className="mb-6 surface-card p-4">
          <p className="text-sm font-bold text-gray-900">Open faith project help requests ({helpRequests.length})</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {helpRequests.map((r) => (
              <div key={r.id} className="rounded-xl bg-primary/5 px-3.5 py-2.5 text-sm">
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
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${filter === f.value ? 'bg-primary text-white' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {f.label} <span className="ml-1 opacity-70">{f.value ? testimonies.filter((t) => t.status === f.value).length : testimonies.length}</span>
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
          <p className="text-sm text-gray-500">No testimonies here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map((t) => (
            <div key={t.id} className="surface-card p-4">
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
              {canEdit && (t.status === 'PENDING' || t.status === 'APPROVED') && (
                <div className="mt-3 flex gap-2">
                  {t.status === 'PENDING' && (
                    <button type="button" onClick={() => void review(t.id, 'APPROVED')} disabled={busyId === t.id} className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      {busyId === t.id ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Approve'}
                    </button>
                  )}
                  <button type="button" onClick={() => void review(t.id, 'HIDDEN')} disabled={busyId === t.id} className="rounded-xl bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60">
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
  const { activeCohort, liveRevision } = useAppData();
  const { can } = usePermissions();
  const canEdit = can('participants', 'edit');
  const [searchParams] = useSearchParams();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projects, setProjects] = useState<FaithProject[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  // Filter choices (see FilterBar): status (the chips above), group ('__UNASSIGNED__' = no group) and category; several of each at once.
  const [filters, setFilters] = useState<FilterValues>({});
  const statusFilters = filters.status ?? [];
  const [search, setSearch] = useState('');
  const [openTarget, setOpenTarget] = useState<{ participant: Participant; project: FaithProject | null } | null>(null);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [categories, setCategories] = useState<FaithProjectCategory[]>([]);
  const [settings, setSettings] = useState<FaithProjectSettings | null>(null);
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
      const [testimoniesRes, helpRequestsRes] = await Promise.all([
        testimoniesApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ testimonies: [] as Testimony[] })),
        faithHelpRequestsApi.getOpenForParticipants(ids).catch(() => ({ requests: [] as FaithHelpRequest[] })),
      ]);
      setProjects(sortByText(fps, (project) => project.title || project.participantName));
      setGroups(sortByText(gs, (group) => group.name));
      setCategories(cs);
      setSettings(projectSettings);
      setTestimonies(testimoniesRes.testimonies);
      setOpenHelpRequests(helpRequestsRes.requests);
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

  // Does this person fit one chosen choice of one filter group?
  const fits = (group: string, choice: string, p: Participant): boolean => {
    switch (group) {
      case 'status': return (projectByParticipant.get(p.id)?.status ?? 'NOT_DRAFTED') === choice;
      case 'group': return choice === '__UNASSIGNED__' ? !p.groupId : p.groupId === choice;
      case 'category': return projectByParticipant.get(p.id)?.categoryId === choice;
      default: return true;
    }
  };
  const displayed = useMemo(() => {
    let ps = participants.filter((p) => Object.entries(filters).every(([group, choices]) => choices.length === 0 || choices.some((c) => fits(group, c, p))));
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, filters, search, projectByParticipant]);
  const filterGroups: FilterGroup[] = (() => {
    const opt = (group: string, value: string, label: string) => ({ value, label, count: participants.filter((p) => fits(group, value, p)).length });
    const out: FilterGroup[] = [{
      key: 'status',
      label: 'Project status',
      options: STATUS_OPTIONS.map((o) => opt('status', o.value, o.label)),
    }, {
      key: 'group',
      label: 'Group',
      options: [
        opt('group', '__UNASSIGNED__', 'Not in a group'),
        ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => opt('group', g.id, g.name)),
      ],
    }];
    if (categories.length > 0) out.push({ key: 'category', label: 'Category', options: categories.map((c) => opt('category', c.id, c.name)) });
    return out;
  })();

  const counts = useMemo(() => {
    const c: Record<string, number> = { NOT_DRAFTED: 0, SAVED: 0 };
    participants.forEach((p) => {
      const s = projectByParticipant.get(p.id)?.status ?? 'NOT_DRAFTED';
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [participants, projectByParticipant]);

  const openProject = (p: Participant, fp: FaithProject | null) => setOpenTarget({ participant: p, project: fp });

  return (
    <div className="page-content">
      <PageHeader
        title="Faith projects"
        tourId="admin:faith-projects"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
        action={
          !loading && (
            <div className="flex items-center gap-2">
            {canEdit && <button type="button" onClick={() => setShowSettings(true)} aria-label="Faith Project settings" title="Faith Project settings" className="grid h-11 w-11 place-items-center rounded-2xl border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317a1.5 1.5 0 0 1 2.85 0l.267.879a1.5 1.5 0 0 0 1.81 1.004l.88-.267a1.5 1.5 0 0 1 2.015 2.015l-.267.88a1.5 1.5 0 0 0 1.004 1.81l.879.267a1.5 1.5 0 0 1 0 2.85l-.879.267a1.5 1.5 0 0 0-1.004 1.81l.267.88a1.5 1.5 0 0 1-2.015 2.015l-.88-.267a1.5 1.5 0 0 0-1.81 1.004l-.267.879a1.5 1.5 0 0 1-2.85 0l-.267-.879a1.5 1.5 0 0 0-1.81-1.004l-.88.267a1.5 1.5 0 0 1-2.015-2.015l.267-.88a1.5 1.5 0 0 0-1.004-1.81l-.879-.267a1.5 1.5 0 0 1 0-2.85l.879-.267a1.5 1.5 0 0 0 1.004-1.81l-.267-.88a1.5 1.5 0 0 1 2.015-2.015l.88.267a1.5 1.5 0 0 0 1.81-1.004l.267-.879Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            </button>}
            {groups.length > 0 && <button
              type="button"
              onClick={() => setShowExportPopup(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-orange-300 active:scale-95"
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
          <div className="mb-6">
            <SegmentedTabs
              tabs={[
                { key: 'projects', label: 'Faith projects' },
                { key: 'testimonies', label: `Testimonies${testimonies.filter((t) => t.status === 'PENDING').length > 0 ? ` (${testimonies.filter((t) => t.status === 'PENDING').length})` : ''}` },
              ]}
              active={pageTab}
              onChange={(k) => setPageTab(k as typeof pageTab)}
            />
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
                  onClick={() => setFilters((prev) => ({ ...prev, status: (prev.status ?? []).includes(opt.value) ? (prev.status ?? []).filter((v) => v !== opt.value) : [...(prev.status ?? []), opt.value] }))}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    statusFilters.includes(opt.value) ? opt.cls + ' ring-2 ring-offset-1 ring-primary/30' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label} <span className="ml-1 opacity-70">{counts[opt.value] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-4">
            <FilterBar
              groups={filterGroups}
              value={filters}
              onChange={setFilters}
              search={
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participant…"
                  aria-label="Search participants"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-[11px] text-sm shadow-[0_2px_10px_-4px_rgba(17,24,39,0.08)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              }
              searching={search.trim().length > 0}
              onClear={() => setSearch('')}
              shown={displayed.length}
              total={participants.length}
              noun="participants"
            />
          </div>
          {(settings?.deadlineAt || settings?.prayersStartWeekNumber) && (
            <p className="mb-4 text-sm font-semibold text-[#9a6a4b]">
              {settings?.deadlineAt ? `Write-it-by date: ${formatReviewDate(settings.deadlineAt)}` : ''}
              {settings?.deadlineAt && settings?.prayersStartWeekNumber ? ' · ' : ''}
              {settings?.prayersStartWeekNumber ? `Corporate prayers start in Week ${settings.prayersStartWeekNumber}` : ''}
            </p>
          )}

          {loading ? (
            <PageLoader />
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
              <p className="text-sm text-gray-500">No participants match your filter.</p>
            </div>
          ) : (
            <>
            {/* Phones: one card per person. From tablet size up, the table below. */}
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] md:hidden">
              {displayed.map((p) => {
                const fp = projectByParticipant.get(p.id) ?? null;
                const s: FaithProjectStatus = fp?.status ?? 'NOT_DRAFTED';
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => openProject(p, fp)} className="flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left active:bg-gray-50">
                      <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-[15px] font-semibold leading-tight text-gray-900">{p.fullName}</span>
                        <span className="block truncate text-[12.5px] text-gray-500">{p.groupName ?? 'No group yet'}</span>
                      </span>
                      <span className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls(s)}`}>
                        {statusLabel(s)}
                      </span>
                      <svg className="h-4 w-4 flex-none text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto surface-card md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-primary/5">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Participant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="sticky right-0 bg-primary/5 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayed.map((p) => {
                    const fp = projectByParticipant.get(p.id) ?? null;
                    const s: FaithProjectStatus = fp?.status ?? 'NOT_DRAFTED';
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/30">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                        <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls(s)}`}>
                            {statusLabel(s)}
                          </span>
                          {p.prayerConsent === 'OUT' && <span className="ml-1.5 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Opted out of prayers</span>}
                        </td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openProject(p, fp)}
                            className="rounded-xl bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 active:scale-95"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
          </>
          )}
        </>
      )}

      {openTarget && (
        <ProjectModal
          isOpen={!!openTarget}
          onClose={() => setOpenTarget(null)}
          participant={openTarget.participant}
          group={openTarget.participant.groupId ? (groupById.get(openTarget.participant.groupId) ?? null) : null}
          project={openTarget.project}
          categories={categories}
          onCategoryChanged={(fp) => {
            setProjects((prev) => prev.map((x) => (x.id === fp.id ? fp : x)));
            setOpenTarget((prev) => (prev ? { ...prev, project: fp } : prev));
          }}
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
