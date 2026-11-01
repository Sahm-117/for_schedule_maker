import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SegmentedTabs from '../components/SegmentedTabs';
import { Navigate, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import PageHeader from '../components/PageHeader';
import AppOverflowMenu from '../components/AppOverflowMenu';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../components/Toast';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi, faithProjectsApi, faithProjectCategoriesApi, faithProjectSettingsApi, faithHelpRequestsApi, testimoniesApi, participantsApi, groupsApi, supportHubsApi } from '../services/api';
import { FAITH_HELP_REASON_LABELS } from '../types';
import type { FaithHelpRequest, FaithProject, FaithProjectCategory, FaithProjectSettings, FaithProjectStatus, FaithProjectVersion, Group, HubMembership, Participant, SupportHub, Testimony, TestimonyStatus } from '../types';
import AppSelect from '../components/AppSelect';
import FaithProjectHistory from '../components/faithProjects/FaithProjectHistory';
import ModalShell from '../components/followups/ModalShell';
import FilterBar, { type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import FaithProjectsExportPopup from '../components/faithProjects/FaithProjectsExportPopup';
import FaithProjectSettingsModal from '../components/faithProjects/FaithProjectSettingsModal';
import { sortByText } from '../utils/sort';
import { FAITH_PROJECT_STATUS_LABEL } from '../utils/participantApp';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: FAITH_PROJECT_STATUS_LABEL.NOT_DRAFTED, cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'SAVED', label: FAITH_PROJECT_STATUS_LABEL.SAVED, cls: 'bg-emerald-100/80 text-emerald-700' },
];

const statusLabel = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
const statusCls = (s: FaithProjectStatus) => STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? 'bg-neutral-100 text-neutral-600';

const OVERDUE_CLS = 'bg-amber-100/80 text-amber-700';

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

// ── Hub > group > participant list ────────────────────────────────────────────

const naturalCompare = new Intl.Collator(undefined, { numeric: true }).compare;

interface RemindTarget { id: string; name: string; people: number }

/** One group inside a section. `all` is everyone in it (for the counts), `shown` the people the filters let through. */
interface GroupBlock {
  key: string;
  label: string;
  total: number;
  written: number;
  overdue: number;
  shown: Participant[];
  supportId: string | null;
  supportName: string | null;
}

/** One top-level section: a hub, "No hub", Teens or "Not in a group". */
interface TopBlock {
  key: string;
  title: string;
  written: number;
  overdue: number;
  groups: GroupBlock[];
  /** People listed straight under the section (only "Not in a group"). */
  rows: Participant[];
  /** Only hubs have a Remind button; an empty list disables it. */
  remindTargets: RemindTarget[] | null;
}

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <span className={`inline-flex h-8 w-8 flex-none items-center justify-center text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
    </svg>
  </span>
);

const ParticipantRow: React.FC<{
  participant: Participant;
  project: FaithProject | null;
  overdue: boolean;
  onOpen: () => void;
}> = ({ participant, project, overdue, onOpen }) => {
  const s: FaithProjectStatus = project?.status ?? 'NOT_DRAFTED';
  return (
    <li className="flex items-center gap-3 py-2.5 pl-4 pr-3 sm:pl-5 sm:pr-4">
      <Avatar name={participant.fullName} avatarUrl={participant.avatarUrl} size="md" />
      <span className="min-w-0 flex-1 line-clamp-2 text-[15px] font-semibold leading-tight text-gray-900">{participant.fullName}</span>
      {participant.prayerConsent === 'OUT' && <span className="hidden flex-none rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 sm:inline">Opted out of prayers</span>}
      <span className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${overdue ? OVERDUE_CLS : statusCls(s)}`}>
        {overdue ? 'Overdue' : statusLabel(s)}
      </span>
      <button type="button" onClick={onOpen} className="flex-none rounded-xl bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">
        Open
      </button>
    </li>
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
  const { user } = useAuth();
  const showToast = useToast();
  const { can } = usePermissions();
  const canEdit = can('participants', 'edit');
  const [searchParams] = useSearchParams();

  const [participants, setParticipants] = useState<Participant[]>([]);
  // A failed load leaves participants empty; only a successful one may say the cohort has nobody.
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [projects, setProjects] = useState<FaithProject[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  // Teen Supports' groups, kept apart from `groups` (rule 22): only the grouped list below uses them.
  const [teenGroups, setTeenGroups] = useState<Group[]>([]);
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [hubMemberships, setHubMemberships] = useState<HubMembership[]>([]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
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
  const [supportFilter, setSupportFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  // Set when the Remind button on a hub opened the confirmation: it then lists that hub's supports instead of the page's.
  const [remindHub, setRemindHub] = useState<{ name: string; targets: RemindTarget[] } | null>(null);
  const [reminding, setReminding] = useState(false);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { projects: fps }, { groups: allGroups }, { categories: cs }, { settings: projectSettings }, hubList, hubMembers] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        faithProjectsApi.getAll({ cohortId: activeCohort.id }),
        groupsApi.getAll({ cohortId: activeCohort.id, includeTeenGroups: true }),
        faithProjectCategoriesApi.getAll(activeCohort.id),
        faithProjectSettingsApi.get(activeCohort.id),
        // Same two reads the Groups page makes for a group's hub; a failure just leaves every group under "No hub".
        supportHubsApi.getAll(activeCohort.id).then((r) => r.hubs).catch(() => [] as SupportHub[]),
        supportHubsApi.getMembershipsForCohort(activeCohort.id).then((r) => r.memberships).catch(() => [] as HubMembership[]),
      ]);
      const gs = allGroups.filter((g) => !g.isTeenGroup);
      setParticipants(sortByText(ps.filter((p) => p.status === 'ACTIVE'), (participant) => participant.fullName));
      setParticipantsLoaded(true);
      const ids = ps.filter((p) => p.status === 'ACTIVE').map((p) => p.id);
      const [testimoniesRes, helpRequestsRes] = await Promise.all([
        testimoniesApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ testimonies: [] as Testimony[] })),
        faithHelpRequestsApi.getOpenForParticipants(ids).catch(() => ({ requests: [] as FaithHelpRequest[] })),
      ]);
      setProjects(sortByText(fps, (project) => project.title || project.participantName));
      setGroups(sortByText(gs, (group) => group.name));
      setTeenGroups(allGroups.filter((g) => g.isTeenGroup));
      setHubs(hubList);
      setHubMemberships(hubMembers);
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

  // Past the write-by date with nothing saved yet.
  const deadlinePassed = !!settings?.deadlineAt && new Date(settings.deadlineAt).getTime() < Date.now();
  const isOverdue = (p: Participant) => deadlinePassed && (projectByParticipant.get(p.id)?.status ?? 'NOT_DRAFTED') === 'NOT_DRAFTED';
  const supportOf = (p: Participant) => (p.groupId ? groupById.get(p.groupId) : undefined)?.supportId ?? null;
  const supportOptions = useMemo(() => {
    const seen = new Map<string, string>();
    groups.forEach((g) => { if (g.supportId && g.supportName) seen.set(g.supportId, g.supportName); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
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
    if (supportFilter) ps = ps.filter((p) => supportOf(p) === supportFilter);
    if (overdueOnly) ps = ps.filter(isOverdue);
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, filters, search, projectByParticipant, supportFilter, overdueOnly, deadlinePassed, groupById]);
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

  const overdueCount = participants.filter((p) => isOverdue(p) && (!supportFilter || supportOf(p) === supportFilter)).length;

  // Who "Remind supports" reaches: the support of every overdue person on screen (a group with no support has nobody to remind).
  const remindTargets = (() => {
    const byId = new Map<string, { name: string; people: number }>();
    displayed.filter(isOverdue).forEach((p) => {
      const g = p.groupId ? groupById.get(p.groupId) : undefined;
      if (!g?.supportId) return;
      const entry = byId.get(g.supportId) ?? { name: g.supportName ?? 'Support', people: 0 };
      entry.people += 1;
      byId.set(g.supportId, entry);
    });
    return [...byId.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const activeRemindTargets = remindHub?.targets ?? remindTargets;
  const closeRemind = () => { setRemindOpen(false); setRemindHub(null); };

  const remindSupports = async () => {
    if (!user || activeRemindTargets.length === 0) return;
    const ids = activeRemindTargets.map((t) => t.id);
    setReminding(true);
    try {
      await announcementsApi.send(
        'Faith projects: a reminder',
        `The write-it-by date${settings?.deadlineAt ? ` (${formatReviewDate(settings.deadlineAt)})` : ''} has passed and some people in your group have not written their faith project yet. Please check in with them this week.`,
        user.id,
        {
          scope: activeCohort ? 'ACTIVE_COHORT' : 'ALL_USERS',
          cohortId: activeCohort?.id ?? null,
          audience: 'SUPPORTS',
          ...(ids.length === 1 ? { targetUserId: ids[0] } : { targetUserIds: ids }),
        },
      );
      showToast({ message: `Reminder sent to ${ids.length} support${ids.length === 1 ? '' : 's'}` });
      closeRemind();
    } catch (err) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not send the reminder.' });
    } finally {
      setReminding(false);
    }
  };

  const openProject = (p: Participant, fp: FaithProject | null) => setOpenTarget({ participant: p, project: fp });

  // ── Grouped list: hub > group > person ──
  // A group's hub is its support's hub (rule 53), read the way the Groups page does: HubMembership by the support's user id.
  // A support who sits in several hubs is listed under the first one by name.
  const hubIdBySupport = useMemo(() => {
    const nameById = new Map(hubs.map((h) => [h.id, h.name]));
    const idsBySupport = new Map<string, string[]>();
    hubMemberships.forEach((m) => { if (nameById.has(m.hubId)) idsBySupport.set(m.userId, [...(idsBySupport.get(m.userId) ?? []), m.hubId]); });
    const out = new Map<string, string>();
    idsBySupport.forEach((ids, supportId) => {
      out.set(supportId, [...ids].sort((a, b) => naturalCompare(nameById.get(a) ?? '', nameById.get(b) ?? ''))[0]);
    });
    return out;
  }, [hubs, hubMemberships]);

  const blocks: TopBlock[] = (() => {
    const isWritten = (p: Participant) => (projectByParticipant.get(p.id)?.status ?? 'NOT_DRAFTED') === 'SAVED';
    // Counts are over everyone in the section (the support filter still scopes them); the filters and search only pick who is listed.
    const scoped = supportFilter ? participants.filter((p) => supportOf(p) === supportFilter) : participants;
    const shownIds = new Set(displayed.map((p) => p.id));
    const byGroup = new Map<string, Participant[]>();
    scoped.forEach((p) => { if (p.groupId) byGroup.set(p.groupId, [...(byGroup.get(p.groupId) ?? []), p]); });

    const groupBlock = (g: Group, label: string): GroupBlock | null => {
      const members = byGroup.get(g.id) ?? [];
      if (members.length === 0) return null;
      return {
        key: `group:${g.id}`,
        label,
        total: members.length,
        written: members.filter(isWritten).length,
        overdue: members.filter(isOverdue).length,
        shown: members.filter((p) => shownIds.has(p.id)),
        supportId: g.supportId ?? null,
        supportName: g.supportName ?? null,
      };
    };
    const labelFor = (g: Group, prefix: string) => `${prefix}${g.supportName ? ` · Support: ${g.supportName}` : ' · No support yet'}`;
    const byWrittenThenName = (a: GroupBlock, b: GroupBlock) => a.written - b.written || naturalCompare(a.label, b.label);
    const topBlock = (key: string, title: string, list: GroupBlock[], withRemind: boolean): TopBlock | null => {
      const visible = list.filter((g) => g.shown.length > 0).sort(byWrittenThenName);
      if (visible.length === 0) return null;
      let remindTargets: RemindTarget[] | null = null;
      if (withRemind) {
        const byId = new Map<string, RemindTarget>();
        list.forEach((g) => {
          if (!g.supportId || g.overdue === 0) return;
          const entry = byId.get(g.supportId) ?? { id: g.supportId, name: g.supportName ?? 'Support', people: 0 };
          entry.people += g.overdue;
          byId.set(g.supportId, entry);
        });
        remindTargets = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      }
      return { key, title, written: list.reduce((n, g) => n + g.written, 0), overdue: list.reduce((n, g) => n + g.overdue, 0), groups: visible, rows: [], remindTargets };
    };

    const perHub = new Map<string, GroupBlock[]>();
    const noHub: GroupBlock[] = [];
    groups.forEach((g) => {
      const block = groupBlock(g, labelFor(g, g.name));
      if (!block) return;
      const hubId = g.supportId ? hubIdBySupport.get(g.supportId) : undefined;
      if (hubId) perHub.set(hubId, [...(perHub.get(hubId) ?? []), block]);
      else noHub.push(block);
    });
    const hubBlocks = hubs
      .map((h) => topBlock(`hub:${h.id}`, h.name, perHub.get(h.id) ?? [], true))
      .filter((b): b is TopBlock => !!b)
      .sort((a, b) => b.overdue - a.overdue || naturalCompare(a.title, b.title));
    const out = [...hubBlocks];
    const noHubBlock = topBlock('hub:none', 'No hub', noHub, true);
    if (noHubBlock) out.push(noHubBlock);
    const teenBlocks = teenGroups.map((g) => groupBlock(g, g.supportName ? `Teen Support: ${g.supportName}` : g.name)).filter((b): b is GroupBlock => !!b);
    const teensBlock = topBlock('teens', 'Teens', teenBlocks, false);
    if (teensBlock) out.push(teensBlock);
    const groupIds = new Set([...groups, ...teenGroups].map((g) => g.id));
    const loose = scoped.filter((p) => !p.groupId || !groupIds.has(p.groupId));
    const looseShown = loose.filter((p) => shownIds.has(p.id));
    if (looseShown.length > 0) {
      out.push({ key: 'nogroup', title: 'Not in a group', written: loose.filter(isWritten).length, overdue: loose.filter(isOverdue).length, groups: [], rows: looseShown, remindTargets: null });
    }
    return out;
  })();

  // Typing in the search box opens every section with a match.
  useEffect(() => {
    if (!search.trim()) return;
    setOpenKeys((prev) => {
      const next = new Set(prev);
      blocks.forEach((b) => { next.add(b.key); b.groups.forEach((g) => next.add(g.key)); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const toggleKey = (key: string) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const countsLine = (written: number, overdue: number) => (
    <>
      {written} written
      {deadlinePassed && overdue > 0 && <span className="text-amber-700"> · {overdue} overdue</span>}
    </>
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Faith projects"
        tourId="admin:faith-projects"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
        action={
          !loading && (canEdit || groups.length > 0) && (
            <AppOverflowMenu
              align="right"
              items={[
                ...(canEdit ? [{ label: 'Faith Project settings', onClick: () => setShowSettings(true) }] : []),
                ...(groups.length > 0 ? [{ label: 'Export', onClick: () => setShowExportPopup(true) }] : []),
              ]}
            />
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
                { key: 'testimonies', label: `Testimonies${testimonies.length > 0 ? ` (${testimonies.length})` : ''}` },
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
              {deadlinePassed && overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOverdueOnly((prev) => !prev)}
                  aria-pressed={overdueOnly}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    overdueOnly ? OVERDUE_CLS + ' ring-2 ring-offset-1 ring-primary/30' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Overdue <span className="ml-1 opacity-70">{overdueCount}</span>
                </button>
              )}
            </div>
          )}

          {supportOptions.length > 0 && (
            <div className="mb-4 max-w-xs">
              <AppSelect
                compact
                value={supportFilter}
                onChange={setSupportFilter}
                options={[{ value: '', label: 'All supports' }, ...supportOptions]}
                placeholder="All supports"
              />
            </div>
          )}

          {overdueOnly && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-100/60 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                {displayed.length} {displayed.length === 1 ? 'person has' : 'people have'} not started and the write-it-by date has passed.
              </p>
              {canEdit && remindTargets.length > 0 && (
                <button type="button" onClick={() => setRemindOpen(true)} className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-dark">
                  Remind supports
                </button>
              )}
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
              <p className="text-sm text-gray-500">{participantsLoaded && participants.length === 0 ? 'No participants in this cohort yet.' : 'No participants match your filter.'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="faith-groups">
              {blocks.map((block) => {
                const open = openKeys.has(block.key);
                const bodyId = `faith-${block.key.replace(/[^a-z0-9]/gi, '-')}`;
                const renderRows = (list: Participant[]) => (
                  <ul className="divide-y divide-gray-100">
                    {list.map((p) => {
                      const fp = projectByParticipant.get(p.id) ?? null;
                      return <ParticipantRow key={p.id} participant={p} project={fp} overdue={isOverdue(p)} onOpen={() => openProject(p, fp)} />;
                    })}
                  </ul>
                );
                return (
                  <section key={block.key} className="surface-card min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 pr-4 sm:pr-5">
                      <button type="button" onClick={() => toggleKey(block.key)} aria-expanded={open} aria-controls={bodyId} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left sm:pl-5">
                        <Chevron open={open} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-gray-900">{block.title}</span>
                          <span className="block text-[13px] text-gray-600 tabular-nums">{countsLine(block.written, block.overdue)}</span>
                        </span>
                      </button>
                      {canEdit && block.remindTargets && (
                        <button
                          type="button"
                          disabled={block.remindTargets.length === 0}
                          onClick={() => { setRemindHub({ name: block.title, targets: block.remindTargets ?? [] }); setRemindOpen(true); }}
                          aria-label={`Remind supports in ${block.title}`}
                          className="inline-flex h-9 flex-none items-center rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remind
                        </button>
                      )}
                    </div>
                    {open && (
                      <div id={bodyId} className="border-t border-gray-100">
                        {block.groups.length === 0 ? renderRows(block.rows) : (
                          <div className="divide-y divide-gray-100">
                            {block.groups.map((g) => {
                              const gOpen = openKeys.has(g.key);
                              const gBodyId = `faith-${g.key.replace(/[^a-z0-9]/gi, '-')}`;
                              const allWritten = g.total > 0 && g.written === g.total;
                              return (
                                <div key={g.key}>
                                  <button type="button" onClick={() => toggleKey(g.key)} aria-expanded={gOpen} aria-controls={gBodyId} className="flex w-full items-center gap-2 bg-gray-50/70 py-2.5 pl-6 pr-4 text-left sm:pl-8 sm:pr-5">
                                    <Chevron open={gOpen} />
                                    <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{g.label}</span>
                                    <span className={`flex-none text-xs tabular-nums ${allWritten ? 'font-semibold text-emerald-700' : 'text-gray-600'}`}>
                                      {g.written} of {g.total} written{allWritten ? ' ✓' : ''}
                                    </span>
                                  </button>
                                  {gOpen && <div id={gBodyId}>{renderRows(g.shown)}</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
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

      <ConfirmationModal
        isOpen={remindOpen}
        onClose={() => { if (!reminding) closeRemind(); }}
        onConfirm={() => { void remindSupports(); }}
        title={remindHub ? `Remind ${remindHub.name} supports about faith projects?` : 'Remind supports about faith projects?'}
        message={`${activeRemindTargets.length} support${activeRemindTargets.length === 1 ? '' : 's'} will get a reminder on their bell and phone. It also shows under Announcements.`}
        confirmText="Send reminder"
        type="info"
        confirmLoading={reminding}
      >
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-gray-700">
          {activeRemindTargets.map((t) => (
            <li key={t.id}>{t.name} <span className="text-gray-400">· {t.people} not started</span></li>
          ))}
        </ul>
      </ConfirmationModal>

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
