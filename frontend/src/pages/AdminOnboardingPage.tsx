import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/followups/ModalShell';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  groupOnboardingStatusApi,
  messageTemplatesApi,
  onboardingEventsApi,
  participantOnboardingStatusApi,
  usersApi,
} from '../services/api';
import { buildTemplatePlaceholderSummary } from '../utils/followUps';
import type { GroupOnboardingStatus, MessageTemplate, OnboardingEvent, ParticipantOnboardingStatus, User } from '../types';

const inputClass =
  'w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

type TemplateTab = 'ONBOARDING' | 'COORDINATOR';
type ParticipantKey = 'contacted' | 'addedToGroup' | 'introductionDone' | 'venueAcknowledged';

const PARTICIPANT_KEYS: ParticipantKey[] = ['contacted', 'addedToGroup', 'introductionDone', 'venueAcknowledged'];

const countChecklistSteps = (status: GroupOnboardingStatus, participantStatuses: ParticipantOnboardingStatus[]) =>
  [
    !!status.groupCreated,
    participantStatuses.length > 0 && participantStatuses.every((entry) => entry.contacted),
    participantStatuses.length > 0 && participantStatuses.every((entry) => entry.addedToGroup),
    participantStatuses.length > 0 && participantStatuses.every((entry) => entry.introductionDone),
    participantStatuses.length > 0 && participantStatuses.every((entry) => entry.venueAcknowledged),
  ].filter(Boolean).length;

const describeEvent = (event: OnboardingEvent) => {
  switch (event.type) {
    case 'GROUP_ASSIGNED':
      return `${event.groupName || 'A group'} was assigned to ${event.supportName || 'a support'}.`;
    case 'PARTICIPANTS_ASSIGNED': {
      const count = Number(event.payload?.participantCount || 0);
      return count > 0
        ? `${count} participant${count === 1 ? '' : 's'} were added to ${event.groupName || 'a group'}.`
        : `Participants were added to ${event.groupName || 'a group'}.`;
    }
    case 'GROUP_COMPLETED':
      return `${event.actorName || 'A support'} fully onboarded ${event.groupName || 'a group'}.`;
    case 'GROUP_CREATED_UPDATED':
      return `${event.actorName || 'A support'} updated group setup for ${event.groupName || 'a group'}.`;
    case 'PARTICIPANT_STATUS_UPDATED':
      return `${event.actorName || 'A support'} updated participant onboarding in ${event.groupName || 'a group'}.`;
    default:
      return `${event.actorName || 'A support'} updated onboarding progress for ${event.groupName || 'a group'}.`;
  }
};

const AdminOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort } = useAppData();
  const [templateTab, setTemplateTab] = useState<TemplateTab>('ONBOARDING');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [statuses, setStatuses] = useState<GroupOnboardingStatus[]>([]);
  const [participantStatuses, setParticipantStatuses] = useState<ParticipantOnboardingStatus[]>([]);
  const [events, setEvents] = useState<OnboardingEvent[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [useCase, setUseCase] = useState('');
  const [body, setBody] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);
  const [updatingCoordinatorId, setUpdatingCoordinatorId] = useState<string | null>(null);
  const [coordinatorCandidateId, setCoordinatorCandidateId] = useState('');
  const [groupFilter, setGroupFilter] = useState(''); // '' = all groups
  const [eventLimit, setEventLimit] = useState(10); // infinite scroll page size
  const [coordinatorOpen, setCoordinatorOpen] = useState(false); // settings modal
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user || user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const placeholderSummary = buildTemplatePlaceholderSummary(user);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [templateRes, usersRes] = await Promise.all([
          messageTemplatesApi.getAll(),
          usersApi.getAll(),
        ]);
        setTemplates(templateRes.templates);
        const supports = usersRes.users.filter((entry) => entry.role === 'SUPPORT');
        setSupportUsers(supports);
        setCoordinatorCandidateId((current) => {
          if (current && supports.some((entry) => entry.id === current && !entry.isCoordinator)) return current;
          return supports.find((entry) => !entry.isCoordinator)?.id ?? '';
        });

        if (activeCohort) {
          const [statusRes, participantStatusRes, eventRes] = await Promise.all([
            groupOnboardingStatusApi.getForCohort(activeCohort.id),
            participantOnboardingStatusApi.getForCohort(activeCohort.id),
            onboardingEventsApi.getForCohort(activeCohort.id),
          ]);
          setStatuses(statusRes.statuses);
          setParticipantStatuses(participantStatusRes.statuses);
          setEvents(eventRes.events);
        } else {
          setStatuses([]);
          setParticipantStatuses([]);
          setEvents([]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCohort?.id]);

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.category === templateTab),
    [templateTab, templates]
  );

  const groupedParticipantStatuses = useMemo(() => {
    const map = new Map<string, ParticipantOnboardingStatus[]>();
    participantStatuses.forEach((status) => {
      if (!status.groupId) return;
      const existing = map.get(status.groupId) ?? [];
      existing.push(status);
      map.set(status.groupId, existing);
    });
    return map;
  }, [participantStatuses]);

  const groupSummaries = useMemo(() => statuses.map((status) => {
    const members = groupedParticipantStatuses.get(status.groupId) ?? [];
    const stepsDone = countChecklistSteps(status, members);
    const participantCount = status.participantCount ?? members.length;
    const completedParticipants = members.filter((entry) => PARTICIPANT_KEYS.every((key) => !!entry[key])).length;
    return {
      status,
      members,
      stepsDone,
      pct: Math.round((stepsDone / 5) * 100),
      participantCount,
      completedParticipants,
      completed: !!status.groupCreated && participantCount > 0 && completedParticipants === participantCount,
    };
  }), [groupedParticipantStatuses, statuses]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      ...[...statuses]
        .sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.groupName || '', b.groupName || ''))
        .map((s) => ({ value: s.groupId, label: s.groupName || 'Group' })),
    ],
    [statuses]
  );

  const visibleGroupSummaries = useMemo(
    () => (groupFilter ? groupSummaries.filter((s) => s.status.groupId === groupFilter) : groupSummaries),
    [groupSummaries, groupFilter]
  );

  const visibleEvents = useMemo(
    () => (groupFilter ? events.filter((e) => e.groupId === groupFilter) : events),
    [events, groupFilter]
  );

  const progress = useMemo(() => {
    const totalParticipants = groupSummaries.reduce((sum, summary) => sum + summary.participantCount, 0);
    const onboardedParticipants = groupSummaries.reduce((sum, summary) => sum + (summary.completed ? summary.participantCount : 0), 0);
    const completedGroups = groupSummaries.filter((summary) => summary.completed).length;
    return {
      totalParticipants,
      onboardedParticipants,
      completedGroups,
      totalGroups: groupSummaries.length,
      pct: totalParticipants > 0 ? Math.round((onboardedParticipants / totalParticipants) * 100) : 0,
    };
  }, [groupSummaries]);

  // Infinite scroll for the activity feed: reveal 10 more as the user nears the bottom.
  const handleFeedScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      setEventLimit((prev) => (prev < visibleEvents.length ? prev + 10 : prev));
    }
  };

  useEffect(() => { setEventLimit(10); }, [groupFilter]);

  const openForm = (template?: MessageTemplate) => {
    setEditing(template ?? null);
    setUseCase(template?.useCase ?? '');
    setBody(template?.body ?? '');
    setWhenToUse(template?.whenToUse ?? '');
    setImageUrl(template?.imageUrl ?? null);
    setImageName(template?.imageName ?? null);
    setError('');
    setShowForm(true);
  };

  const templateTypeLabel = templateTab === 'ONBOARDING' ? 'Support -> Participant' : 'Coordinator -> Support';
  const templateTypeHint = templateTab === 'ONBOARDING'
    ? 'This template appears when a support opens a participant inside onboarding.'
    : 'This template is reserved for coordinators sending onboarding prompts to other support users.';
  const labelPlaceholder = templateTab === 'ONBOARDING' ? 'e.g. Day 1 - Intro message' : 'e.g. Coordinator welcome message';
  const timingPlaceholder = templateTab === 'ONBOARDING' ? 'e.g. Day 1 - first contact' : 'e.g. Send when assigning a new support';
  const messagePlaceholder = templateTab === 'ONBOARDING'
    ? 'Hi {{first_name}}!\n\nMy name is {{user.name}}...'
    : 'Hi {{full_name}}!\n\nYou will be onboarding support users for this cohort...';
  const coordinatorUsers = supportUsers.filter((entry) => !!entry.isCoordinator);
  const availableCoordinatorCandidates = supportUsers.filter((entry) => !entry.isCoordinator);
  const coordinatorOptions = availableCoordinatorCandidates.map((entry) => ({
    value: entry.id,
    label: entry.name,
    meta: entry.email || entry.phone || 'Support user',
  }));

  const addCoordinator = async () => {
    if (!coordinatorCandidateId) return;
    const target = supportUsers.find((entry) => entry.id === coordinatorCandidateId);
    if (!target) return;
    await handleCoordinatorToggle(target);
    setCoordinatorCandidateId('');
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url, name } = await messageTemplatesApi.uploadTemplateImage(file);
      setImageUrl(url);
      setImageName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!useCase.trim() || !body.trim()) {
      setError('Label and message body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const input = {
        useCase: useCase.trim(),
        body,
        whenToUse: whenToUse.trim() || null,
        imageUrl: imageUrl || null,
        imageName: imageName || null,
      };
      if (editing) {
        const { template } = await messageTemplatesApi.update(editing.id, input);
        setTemplates((prev) => prev.map((entry) => (entry.id === template.id ? template : entry)));
      } else {
        const { template } = await messageTemplatesApi.create({ ...input, category: templateTab });
        setTemplates((prev) => [...prev, template]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await messageTemplatesApi.delete(deleting.id);
      setTemplates((prev) => prev.filter((entry) => entry.id !== deleting.id));
    } finally {
      setDeleting(null);
    }
  };

  const handleCoordinatorToggle = async (supportUser: User) => {
    setUpdatingCoordinatorId(supportUser.id);
    try {
      const { user: updated } = await usersApi.update(supportUser.id, { isCoordinator: !supportUser.isCoordinator });
      setSupportUsers((prev) => prev.map((entry) => (entry.id === supportUser.id ? { ...entry, isCoordinator: updated.isCoordinator } : entry)));
    } finally {
      setUpdatingCoordinatorId(null);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Onboarding"
        subtitle="Track onboarding progress, manage message templates, and set up coordinator access."
        action={(
          <button
            type="button"
            onClick={() => openForm()}
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {templateTab === 'ONBOARDING' ? 'Add support template' : 'Add coordinator template'}
          </button>
        )}
      />

      <div className="space-y-6">
        <section className="surface-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cohort progress</p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                {activeCohort ? `${progress.pct}% of participants onboarded` : 'Select an active cohort'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {activeCohort
                  ? `${progress.onboardedParticipants} of ${progress.totalParticipants} participants are in fully onboarded groups.`
                  : 'Progress cards fill in when an active cohort is selected.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TabButton label="Support -> Participant" active={templateTab === 'ONBOARDING'} onClick={() => setTemplateTab('ONBOARDING')} />
              <TabButton label="Coordinator -> Support" active={templateTab === 'COORDINATOR'} onClick={() => setTemplateTab('COORDINATOR')} />
              {templateTab === 'COORDINATOR' && (
                <button
                  type="button"
                  onClick={() => setCoordinatorOpen(true)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-orange-200 bg-white text-gray-500 hover:bg-orange-50 hover:text-primary"
                  title="Manage coordinators"
                  aria-label="Manage coordinators"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Groups completed" value={`${progress.completedGroups}/${progress.totalGroups}`} tone="bg-emerald-50 text-emerald-700" />
            <MetricCard label="Participants onboarded" value={progress.onboardedParticipants} tone="bg-sky-50 text-sky-700" />
            <MetricCard label="Groups in progress" value={Math.max(progress.totalGroups - progress.completedGroups, 0)} tone="bg-amber-50 text-amber-700" />
            <MetricCard label="Completion rate" value={`${progress.pct}%`} tone="bg-violet-50 text-violet-700" />
          </div>
        </section>

        {/* Template library — placed above group status for quicker access. */}
        <section className="surface-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Template library</p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">
                {templateTab === 'ONBOARDING' ? 'Support -> Participant templates' : 'Coordinator -> Support templates'}
              </h3>
            </div>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-dashed border-orange-200 py-16 text-center">
              <p className="text-sm text-gray-500">No templates in this section yet.</p>
              <p className="mt-1 text-xs text-gray-400">Add your first template to get started.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div key={template.id} className="surface-card flex flex-col overflow-hidden rounded-2xl shadow-sm">
                  {template.imageUrl ? (
                    <img src={template.imageUrl} alt={template.imageName ?? ''} loading="lazy" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-orange-50/60">
                      <svg className="h-7 w-7 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-3 3v-3Z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex flex-1 items-start justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{template.useCase}</p>
                      {template.whenToUse && (
                        <span className="mt-1.5 inline-block rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{template.whenToUse}</span>
                      )}
                    </div>
                    <AppOverflowMenu
                      align="right"
                      items={[
                        { label: 'Edit', onClick: () => openForm(template) },
                        { label: 'Delete', onClick: () => setDeleting(template), tone: 'danger' },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Group filter for the status + feed below. */}
        {statuses.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Filter</span>
            <div className="w-56">
              <AppSelect value={groupFilter} onChange={setGroupFilter} options={groupOptions} placeholder="All groups" compact />
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Group status</p>
                <h3 className="mt-1 text-lg font-bold text-gray-900">Progress by group</h3>
              </div>
            </div>

            {loading ? (
              <PageLoader />
            ) : visibleGroupSummaries.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center">
                <p className="text-sm text-gray-500">No group progress yet.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {visibleGroupSummaries.map(({ status, pct, participantCount, completed, completedParticipants, members }) => {
                  return (
                    <div key={status.groupId} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-bold text-gray-900">{status.groupName}</p>
                          <p className="mt-1 text-sm text-gray-500">{status.supportName || 'No support assigned'} • {participantCount} participant{participantCount === 1 ? '' : 's'}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {completed ? 'Completed' : `${pct}% done`}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-600">
                        <StatusLine label="Group created" checked={status.groupCreated} />
                        <StatusLine label="All contacted" checked={members.length > 0 && members.every((entry) => entry.contacted)} />
                        <StatusLine label="All added to group" checked={members.length > 0 && members.every((entry) => entry.addedToGroup)} />
                        <StatusLine label="All introductions done" checked={members.length > 0 && members.every((entry) => entry.introductionDone)} />
                        <StatusLine label="All venue acknowledged" checked={members.length > 0 && members.every((entry) => entry.venueAcknowledged)} />
                      </div>
                      <p className="mt-4 text-xs text-gray-500">
                        {completedParticipants} of {participantCount} participants fully onboarded.
                      </p>
                      {status.updatedAt && (
                        <p className="mt-4 text-xs text-gray-400">
                          Last updated by {status.updatedByName || 'a support'} on {new Date(status.updatedAt).toLocaleString()}.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="surface-card flex max-h-[36rem] flex-col p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Recent activity</p>
            <h3 className="mt-1 text-lg font-bold text-gray-900">Onboarding event feed</h3>
            {visibleEvents.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">
                No onboarding updates yet.
              </div>
            ) : (
              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" onScroll={handleFeedScroll}>
                {visibleEvents.slice(0, eventLimit).map((event) => (
                  <div key={event.id} className="rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{describeEvent(event)}</p>
                    <p className="mt-1 text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                {eventLimit < visibleEvents.length && (
                  <p className="py-2 text-center text-xs text-gray-400">Scroll for more…</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <ModalShell
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit template' : 'Add template'}
        wide
        footer={(
          <>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
            <button type="button" onClick={() => { void handleSave(); }} disabled={saving || uploading} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Template type</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${templateTab === 'ONBOARDING' ? 'bg-primary text-white' : 'bg-violet-100 text-violet-700'}`}>
                {templateTypeLabel}
              </span>
              <span className="text-sm text-gray-500">{templateTypeHint}</span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Label</label>
            <input className={inputClass} value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder={labelPlaceholder} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">When to send (optional)</label>
            <input className={inputClass} value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} placeholder={timingPlaceholder} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Message</label>
            <textarea className={`${inputClass} min-h-[160px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={messagePlaceholder} />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {placeholderSummary.map((token) => {
                const bare = token.split(' =')[0];
                return (
                  <button
                    key={bare}
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(bare);
                      setCopiedToken(bare);
                      setTimeout(() => setCopiedToken(null), 1500);
                    }}
                    title="Click to copy"
                    className="rounded-lg border border-orange-100 bg-orange-50 px-1.5 py-0.5 font-mono text-xs text-orange-700 hover:bg-orange-100 active:scale-95"
                  >
                    {copiedToken === bare ? 'Copied!' : token}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Graphic / image (optional)</label>
            {imageUrl ? (
              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-3">
                <img src={imageUrl} alt={imageName ?? ''} loading="lazy" className="h-16 w-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{imageName}</p>
                  <button type="button" onClick={() => { setImageUrl(null); setImageName(null); }} className="mt-1 text-xs text-red-600 hover:underline">Remove</button>
                </div>
              </div>
            ) : (
              <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-200 bg-orange-50/30 py-8 transition hover:bg-orange-50" onClick={() => fileRef.current?.click()}>
                {uploading ? (
                  <p className="text-sm text-gray-500">Uploading…</p>
                ) : (
                  <>
                    <svg className="h-8 w-8 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4-4m0 0 4 4m-4-4v9M8 7a4 4 0 0 1 8 0M12 3v4" />
                    </svg>
                    <p className="text-sm text-gray-500">Click to upload image</p>
                    <p className="text-xs text-gray-400">PNG, JPG, WEBP</p>
                  </>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleImagePick(e); }} />
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={coordinatorOpen}
        onClose={() => setCoordinatorOpen(false)}
        title="Coordinators"
        subtitle="Support users who can onboard other supports"
        footer={(
          <button type="button" onClick={() => setCoordinatorOpen(false)} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">Done</button>
        )}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <AppSelect
                value={coordinatorCandidateId}
                onChange={setCoordinatorCandidateId}
                options={coordinatorOptions}
                placeholder="Select a support user"
                label="Add coordinator"
              />
            </div>
            <button
              type="button"
              onClick={() => { void addCoordinator(); }}
              disabled={!coordinatorCandidateId}
              className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add coordinator
            </button>
          </div>

          {coordinatorUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-500">
              No coordinators selected yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {coordinatorUsers.map((supportUser) => (
                <button
                  key={supportUser.id}
                  type="button"
                  onClick={() => { void handleCoordinatorToggle(supportUser); }}
                  disabled={updatingCoordinatorId === supportUser.id}
                  className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
                >
                  <span>{supportUser.name}</span>
                  <span className="text-xs text-gray-500">{supportUser.email || supportUser.phone}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-red-500">Remove</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </ModalShell>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete template"
        message={`Delete "${deleting?.useCase}"? This cannot be undone.`}
        confirmText="Delete"
      />
    </div>
  );
};

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-primary text-white' : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'}`}
  >
    {label}
  </button>
);

const MetricCard: React.FC<{ label: string; value: React.ReactNode; tone: string }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl px-4 py-3 ${tone}`}>
    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
    <p className="mt-1 text-2xl font-bold">{value}</p>
  </div>
);

const StatusLine: React.FC<{ label: string; checked: boolean }> = ({ label, checked }) => (
  <div className="flex items-center gap-2">
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m5 13 4 4L19 7" />
      </svg>
    </span>
    <span>{label}</span>
  </div>
);

export default AdminOnboardingPage;
