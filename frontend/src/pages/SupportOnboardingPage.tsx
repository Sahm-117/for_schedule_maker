import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import ModalShell from '../components/followups/ModalShell';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  groupOnboardingStatusApi,
  groupsApi,
  messageTemplatesApi,
  participantOnboardingStatusApi,
  participantsApi,
  usersApi,
} from '../services/api';
import { fillTemplate } from '../utils/followUps';
import { buildWhatsAppLink, normalizeToIntlPhone } from '../utils/phone';
import type {
  GroupOnboardingStatus,
  MessageTemplate,
  Participant,
  ParticipantOnboardingStatus,
  User,
} from '../types';

type StatusKey = 'contacted' | 'addedToGroup' | 'introductionDone' | 'venueAcknowledged';
type OnboardingStage = 'NOT_STARTED' | 'CONTACTED' | 'ADDED_TO_GROUP' | 'INTRODUCTION_DONE' | 'VENUE_ACKNOWLEDGED';

const STAGE_OPTIONS: Array<{ value: OnboardingStage; label: string; meta: string }> = [
  { value: 'NOT_STARTED', label: 'Not started', meta: 'Nothing done yet for this person' },
  { value: 'CONTACTED', label: 'Contacted', meta: 'You have talked to this person' },
  { value: 'ADDED_TO_GROUP', label: 'Added to group', meta: 'Contacted and added to the small group' },
  { value: 'INTRODUCTION_DONE', label: 'Introduction done', meta: 'Contacted, added, and introduced' },
  { value: 'VENUE_ACKNOWLEDGED', label: 'Venue known', meta: 'Person knows where and when to meet' },
];
const CHECKLIST_STEPS = 5;

const STAGE_LABELS: Record<OnboardingStage, string> = STAGE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<OnboardingStage, string>);

const GROUP_CREATED_OPTIONS = [
  { value: 'no', label: 'Not created', meta: 'The small group has not been set up yet' },
  { value: 'yes', label: 'Created', meta: 'The small group is ready' },
];

async function downloadImage(url: string, name: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
}

const isParticipantComplete = (status?: ParticipantOnboardingStatus | null) =>
  !!status?.contacted && !!status?.addedToGroup && !!status?.introductionDone && !!status?.venueAcknowledged;

const getOnboardingStage = (status?: ParticipantOnboardingStatus | null): OnboardingStage => {
  if (status?.venueAcknowledged) return 'VENUE_ACKNOWLEDGED';
  if (status?.introductionDone) return 'INTRODUCTION_DONE';
  if (status?.addedToGroup) return 'ADDED_TO_GROUP';
  if (status?.contacted) return 'CONTACTED';
  return 'NOT_STARTED';
};

const buildStagePatch = (stage: OnboardingStage): Record<StatusKey, boolean> => ({
  contacted: stage !== 'NOT_STARTED',
  addedToGroup: stage === 'ADDED_TO_GROUP' || stage === 'INTRODUCTION_DONE' || stage === 'VENUE_ACKNOWLEDGED',
  introductionDone: stage === 'INTRODUCTION_DONE' || stage === 'VENUE_ACKNOWLEDGED',
  venueAcknowledged: stage === 'VENUE_ACKNOWLEDGED',
});

const checklistCount = (groupStatus: GroupOnboardingStatus | null, statuses: ParticipantOnboardingStatus[]) => {
  const total = statuses.length;
  const all = (key: StatusKey) => total > 0 && statuses.every((status) => !!status[key]);
  return [
    !!groupStatus?.groupCreated,
    all('contacted'),
    all('addedToGroup'),
    all('introductionDone'),
    all('venueAcknowledged'),
  ].filter(Boolean).length;
};

const virtualParticipantStatus = (participant: Participant): ParticipantOnboardingStatus => ({
  id: `virtual-${participant.id}`,
  participantId: participant.id,
  participantName: participant.fullName,
  groupId: participant.groupId ?? null,
  groupName: participant.groupName ?? null,
  contacted: false,
  addedToGroup: false,
  introductionDone: false,
  venueAcknowledged: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
});

const virtualGroupStatus = (groupId: string, groupName: string | null | undefined, participantCount: number): GroupOnboardingStatus => ({
  id: `virtual-${groupId}`,
  groupId,
  groupName: groupName ?? 'Untitled group',
  supportId: null,
  supportName: null,
  participantCount,
  groupCreated: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
  completedAt: null,
});

const CopyPhoneButton: React.FC<{ phone?: string | null }> = ({ phone }) => {
  const [copied, setCopied] = useState(false);
  if (!phone) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(phone);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-1 text-xs text-gray-400 transition-colors hover:text-primary"
      title="Copy phone number"
    >
      {copied ? 'Copied' : phone}
    </button>
  );
};

interface OnboardingPickerProps {
  participant: Participant;
  templates: MessageTemplate[];
  senderName?: string | null;
  cohortVenue?: string;
  onClose: () => void;
}

const OnboardingPicker: React.FC<OnboardingPickerProps> = ({
  participant,
  templates,
  senderName,
  cohortVenue,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const filled = useMemo(() => {
    if (!selected) return '';
    return fillTemplate(
      selected.body,
      {
        fullName: participant.fullName,
        phone: participant.phone ?? '',
        cohortVenue: cohortVenue ?? '',
        cohortStartDate: null,
      } as any,
      '',
      senderName
    );
  }, [cohortVenue, participant.fullName, participant.phone, selected, senderName]);

  const waLink = useMemo(() => {
    if (!filled || !participant.phone) return null;
    return buildWhatsAppLink(participant.phone, filled);
  }, [filled, participant.phone]);

  return (
    <ModalShell
      isOpen
      onClose={() => { setSelectedId(''); onClose(); }}
      title={`Get ${participant.fullName.split(' ')[0]} started`}
      subtitle="Pick a message and send it."
      wide
      footer={(
        <button type="button" onClick={() => { setSelectedId(''); onClose(); }} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
          Close
        </button>
      )}
    >
      {templates.length === 0 ? (
          <p className="rounded-2xl bg-orange-50 px-4 py-6 text-center text-sm text-gray-500">
            No message templates yet. Ask an admin to add some.
          </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${selectedId === template.id ? 'border-orange-300 bg-orange-50' : 'border-orange-100 bg-white hover:bg-orange-50/50'}`}
              >
                <p className="text-sm font-semibold text-gray-900">{template.useCase}</p>
                {template.whenToUse && <p className="mt-0.5 text-xs text-gray-400">{template.whenToUse}</p>}
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Preview</p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{filled}</p>

              {selected.imageUrl && (
                <div className="mt-4">
                  <img src={selected.imageUrl} alt={selected.imageName ?? 'template graphic'} loading="lazy" className="mb-2 h-40 w-full rounded-xl object-cover" />
                  <p className="text-xs text-gray-400">{selected.imageName}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(filled);
                    setCopiedText(true);
                    setTimeout(() => setCopiedText(false), 2000);
                  }}
                  className="rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-orange-50"
                >
                  {copiedText ? 'Copied!' : 'Copy text'}
                </button>
                {normalizeToIntlPhone(participant.phone) && (
                  <button
                    type="button"
                    onClick={() => {
                      const raw = participant.phone ?? '';
                      const normalized = normalizeToIntlPhone(raw);
                      void navigator.clipboard?.writeText(normalized ? `0${normalized.slice(3)}` : raw);
                      setCopiedNumber(true);
                      setTimeout(() => setCopiedNumber(false), 2000);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedNumber ? 'Copied!' : 'Copy number'}
                  </button>
                )}
                {selected.imageUrl && (
                  <button
                    type="button"
                    onClick={() => { void downloadImage(selected.imageUrl!, selected.imageName ?? 'graphic.jpg'); }}
                    className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  >
                    Download image
                  </button>
                )}
                {waLink ? (
                  <a href={waLink} target="_blank" rel="noreferrer" className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Open WhatsApp
                  </a>
                ) : (
                  <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">Open WhatsApp</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

// Copy-only "Onboard a Support" section for coordinators.
interface CoordinatorSectionProps {
  coordinatorId: string;
  coordinatorName?: string | null;
}

const CoordinatorSection: React.FC<CoordinatorSectionProps> = ({ coordinatorId, coordinatorName }) => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [supports, setSupports] = useState<User[]>([]);
  const [selectedSupportId, setSelectedSupportId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ templates: ts }, { users }] = await Promise.all([
          messageTemplatesApi.getAll({ category: 'COORDINATOR' }),
          usersApi.getAll(),
        ]);
        if (cancelled) return;
        setTemplates(ts);
        setSupports(users.filter((u) => u.role === 'SUPPORT' && u.id !== coordinatorId));
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [coordinatorId]);

  const selectedSupport = supports.find((s) => s.id === selectedSupportId) ?? null;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const supportOptions = useMemo(
    () => supports.map((s) => ({ value: s.id, label: s.name })),
    [supports]
  );

  const filled = useMemo(() => {
    if (!selectedTemplate) return '';
    return fillTemplate(
      selectedTemplate.body,
      { fullName: selectedSupport?.name ?? '', phone: '', cohortVenue: '', cohortStartDate: null } as any,
      '',
      coordinatorName
    );
  }, [selectedTemplate, selectedSupport, coordinatorName]);

  if (loading) return null;
  if (templates.length === 0) return null;

  return (
    <section className="surface-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Coordinator</p>
        <h3 className="mt-1 text-lg font-bold text-gray-900">Onboard a Support</h3>
        <p className="mt-1 text-sm text-gray-500">Pick a fellow support and a message, then copy it to send.</p>
      </div>

      <div className="mt-4 max-w-sm">
        <AppSelect
          value={selectedSupportId}
          onChange={setSelectedSupportId}
          options={supportOptions}
          placeholder="Choose a support"
          label="Support to onboard"
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setSelectedTemplateId(template.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${selectedTemplateId === template.id ? 'border-orange-300 bg-orange-50' : 'border-orange-100 bg-white hover:bg-orange-50/50'}`}
          >
            <p className="text-sm font-semibold text-gray-900">{template.useCase}</p>
            {template.whenToUse && <p className="mt-0.5 text-xs text-gray-400">{template.whenToUse}</p>}
          </button>
        ))}
      </div>

      {selectedTemplate && (
        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Preview</p>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{filled}</p>

          {selectedTemplate.imageUrl && (
            <div className="mt-4">
              <img src={selectedTemplate.imageUrl} alt={selectedTemplate.imageName ?? 'template graphic'} loading="lazy" className="mb-2 h-40 w-full rounded-xl object-cover" />
              <p className="text-xs text-gray-400">{selectedTemplate.imageName}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(filled);
                setCopiedText(true);
                setTimeout(() => setCopiedText(false), 2000);
              }}
              className="rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-orange-50"
            >
              {copiedText ? 'Copied!' : 'Copy text'}
            </button>
            {selectedTemplate.imageUrl && (
              <button
                type="button"
                onClick={() => { void downloadImage(selectedTemplate.imageUrl!, selectedTemplate.imageName ?? 'graphic.jpg'); }}
                className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                Download image
              </button>
            )}
          </div>

          {selectedTemplate.imageUrl && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Tip: Download the image first, then attach it in WhatsApp after it opens.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

const SupportOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort } = useAppData();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<GroupOnboardingStatus[]>([]);
  const [participantStatuses, setParticipantStatuses] = useState<ParticipantOnboardingStatus[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingParticipantId, setSavingParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;

  const load = useCallback(async () => {
    if (!activeCohort || !user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Independent reads — one parallel batch instead of a 4-step waterfall.
      let [participantsRes, templatesRes, groupStatusRes, participantStatusRes] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }),
        messageTemplatesApi.getAll({ category: 'ONBOARDING' }),
        groupOnboardingStatusApi.getForSupport(user.id, activeCohort.id)
          .catch(() => ({ statuses: [] as GroupOnboardingStatus[] })),
        participantOnboardingStatusApi.getForSupport(user.id, activeCohort.id)
          .catch(() => ({ statuses: [] as ParticipantOnboardingStatus[] })),
      ]);

      if (participantsRes.participants.length === 0 && groupStatusRes.statuses.length === 0) {
        const { groups } = await groupsApi.getAll({ cohortId: activeCohort.id });
        if (groups.length === 1) {
          const singleGroup = groups[0];
          const [groupParticipantsRes, groupParticipantStatusRes, cohortStatusesRes] = await Promise.all([
            groupsApi.getParticipants(singleGroup.id),
            participantOnboardingStatusApi.getForGroup(singleGroup.id).catch(() => ({ statuses: [] as ParticipantOnboardingStatus[] })),
            groupOnboardingStatusApi.getForCohort(activeCohort.id).catch(() => ({ statuses: [] as GroupOnboardingStatus[] })),
          ]);
          participantsRes = { participants: groupParticipantsRes.participants };
          participantStatusRes = { statuses: groupParticipantStatusRes.statuses };
          const existingStatus = cohortStatusesRes.statuses.find((status) => status.groupId === singleGroup.id);
          groupStatusRes = {
            statuses: [existingStatus ?? {
              id: `virtual-${singleGroup.id}`,
              groupId: singleGroup.id,
              groupName: singleGroup.name,
              supportId: singleGroup.supportId ?? null,
              supportName: singleGroup.supportName ?? null,
              participantCount: singleGroup.participantCount ?? groupParticipantsRes.participants.length,
              groupCreated: false,
              updatedById: null,
              updatedByName: null,
              updatedAt: undefined,
              completedAt: null,
            }],
          };
        }
      }

      setParticipants(participantsRes.participants);
      const fallbackGroups = new Map<string, GroupOnboardingStatus>();
      participantsRes.participants.forEach((participant) => {
        if (!participant.groupId || fallbackGroups.has(participant.groupId)) return;
        const count = participantsRes.participants.filter((entry) => entry.groupId === participant.groupId).length;
        fallbackGroups.set(participant.groupId, virtualGroupStatus(participant.groupId, participant.groupName, count));
      });
      groupStatusRes.statuses.forEach((status) => fallbackGroups.set(status.groupId, status));

      const participantStatusMap = new Map(participantStatusRes.statuses.map((status) => [status.participantId, status]));
      setGroupStatuses(Array.from(fallbackGroups.values()));
      setParticipantStatuses(participantsRes.participants.map((participant) => participantStatusMap.get(participant.id) ?? virtualParticipantStatus(participant)));
      setTemplates(templatesRes.templates);
      const availableGroupIds = Array.from(new Set([
        ...groupStatusRes.statuses.map((status) => status.groupId),
        ...participantsRes.participants.map((participant) => participant.groupId).filter(Boolean) as string[],
      ]));
      setSelectedGroupId((current) => (current && availableGroupIds.includes(current) ? current : (availableGroupIds[0] ?? '')));
    } finally {
      setLoading(false);
    }
  }, [activeCohort, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; meta?: string }>();
    groupStatuses.forEach((status) => {
      map.set(status.groupId, {
        value: status.groupId,
        label: status.groupName || 'Untitled group',
        meta: `${status.participantCount ?? 0} participants`,
      });
    });
    participants.forEach((participant) => {
      if (!participant.groupId || map.has(participant.groupId)) return;
      map.set(participant.groupId, {
        value: participant.groupId,
        label: participant.groupName || 'Untitled group',
        meta: 'Participant group',
      });
    });
    return Array.from(map.values());
  }, [groupStatuses, participants]);

  const selectedParticipants = useMemo(
    () => participants.filter((participant) => participant.groupId === selectedGroupId),
    [participants, selectedGroupId]
  );

  const selectedParticipantStatuses = useMemo(() => {
    const byParticipantId = new Map(participantStatuses.map((status) => [status.participantId, status]));
    return selectedParticipants.map((participant) => byParticipantId.get(participant.id) || {
      id: `virtual-${participant.id}`,
      participantId: participant.id,
      participantName: participant.fullName,
      groupId: participant.groupId ?? null,
      groupName: participant.groupName ?? null,
      contacted: false,
      addedToGroup: false,
      introductionDone: false,
      venueAcknowledged: false,
      updatedById: null,
      updatedByName: null,
      updatedAt: undefined,
    });
  }, [participantStatuses, selectedParticipants]);

  const selectedGroupStatus = useMemo(
    () => groupStatuses.find((status) => status.groupId === selectedGroupId) ?? null,
    [groupStatuses, selectedGroupId]
  );

  const completedParticipants = selectedParticipantStatuses.filter(isParticipantComplete).length;
  const participantPercent = selectedParticipantStatuses.length > 0
    ? Math.round((completedParticipants / selectedParticipantStatuses.length) * 100)
    : 0;
  const stepsDone = checklistCount(selectedGroupStatus, selectedParticipantStatuses);
  const checklistPercent = Math.round((stepsDone / CHECKLIST_STEPS) * 100);
  const activeParticipant = participants.find((participant) => participant.id === activeParticipantId) ?? null;

  const updateGroupCreated = async (nextValue: boolean) => {
    if (!selectedGroupId || !user.id) return;
    setSavingGroup(true);
    try {
      const { status } = await groupOnboardingStatusApi.update(selectedGroupId, { groupCreated: nextValue }, user.id);
      setGroupStatuses((prev) => {
        const others = prev.filter((entry) => entry.groupId !== status.groupId);
        return [...others, status];
      });
    } finally {
      setSavingGroup(false);
    }
  };

  const updateParticipantStage = async (participantId: string, stage: OnboardingStage) => {
    if (!user.id) return;
    setSavingParticipantId(participantId);
    try {
      const { status } = await participantOnboardingStatusApi.update(participantId, buildStagePatch(stage), user.id);
      setParticipantStatuses((prev) => {
        const others = prev.filter((entry) => entry.participantId !== status.participantId);
        return [...others, status];
      });
    } finally {
      setSavingParticipantId(null);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Onboarding"
        subtitle="See who still needs to be onboarded and send them a welcome message."
      />

      {loading ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          {groupOptions.length > 1 && (
            <section className="surface-card p-5">
              <div className="max-w-sm">
                <AppSelect
                  value={selectedGroupId}
                  onChange={setSelectedGroupId}
                  options={groupOptions}
                  placeholder="Choose a group"
                  label="Group"
                />
              </div>
            </section>
          )}

          {!selectedGroupId ? (
            <section className="surface-card p-6 text-center">
              <p className="text-sm text-gray-500">You do not have a group assigned yet.</p>
            </section>
          ) : (
            <>
              <section className="surface-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Steps</p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">{selectedGroupStatus?.groupName || groupOptions.find((option) => option.value === selectedGroupId)?.label}</h2>
                    <p className="mt-1 text-sm text-gray-500">Steps auto-update when you change each person below.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                    <MetricCard label="Steps done" value={`${checklistPercent}%`} />
                    <MetricCard label="People done" value={`${completedParticipants}/${selectedParticipantStatuses.length}`} />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
                    <AppSelect
                      value={selectedGroupStatus?.groupCreated ? 'yes' : 'no'}
                      onChange={(value) => { void updateGroupCreated(value === 'yes'); }}
                      options={GROUP_CREATED_OPTIONS}
                      placeholder="Choose"
                      label="Group set up"
                      compact
                      loading={savingGroup}
                    />
                  </div>
                  <ProgressLine
                    label="Talked to"
                    done={selectedParticipantStatuses.filter((s) => s.contacted).length}
                    total={selectedParticipantStatuses.length}
                  />
                  <ProgressLine
                    label="Added to group"
                    done={selectedParticipantStatuses.filter((s) => s.addedToGroup).length}
                    total={selectedParticipantStatuses.length}
                  />
                  <ProgressLine
                    label="Introduced"
                    done={selectedParticipantStatuses.filter((s) => s.introductionDone).length}
                    total={selectedParticipantStatuses.length}
                  />
                  <ProgressLine
                    label="Knows venue"
                    done={selectedParticipantStatuses.filter((s) => s.venueAcknowledged).length}
                    total={selectedParticipantStatuses.length}
                  />
                </div>

                <div className="mt-5 rounded-2xl bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
                  {participantPercent}% of people are fully done.
                </div>
              </section>

              <section className="surface-card p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">People</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">Tap a person to open message templates</h3>
                </div>

                {selectedParticipants.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">
                    No participants are in this group yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {selectedParticipants.map((participant) => {
                      const status = selectedParticipantStatuses.find((entry) => entry.participantId === participant.id)!;
                      const currentStage = getOnboardingStage(status);
                      return (
                        <div key={participant.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                          <div className="grid gap-4 md:grid-cols-[1fr_280px] md:items-start">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setActiveParticipantId(participant.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setActiveParticipantId(participant.id);
                                }
                              }}
                              className="flex min-w-0 cursor-pointer items-start justify-between gap-3 text-left"
                            >
                              <div className="min-w-0">
                                <p className="text-base font-semibold text-gray-900">{participant.fullName}</p>
                                <CopyPhoneButton phone={participant.phone} />
                                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                  {STAGE_LABELS[currentStage]}
                                </p>
                              </div>
                              <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-400">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
                                </svg>
                              </span>
                            </div>

                            <div className="min-w-0">
                              <AppSelect
                                value={currentStage}
                                onChange={(value) => { void updateParticipantStage(participant.id, value as OnboardingStage); }}
                                options={STAGE_OPTIONS}
                                placeholder="Choose status"
                                label="Status"
                                compact
                                loading={savingParticipantId === participant.id}
                              />
                              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isParticipantComplete(status) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isParticipantComplete(status) ? 'Complete' : 'In progress'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {user.isCoordinator && (
            <CoordinatorSection coordinatorId={user.id} coordinatorName={user.name} />
          )}
        </div>
      )}

      {activeParticipant && (
        <OnboardingPicker
          participant={activeParticipant}
          templates={templates}
          senderName={user.name}
          cohortVenue={activeCohort?.venue ?? undefined}
          onClose={() => setActiveParticipantId(null)}
        />
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl bg-orange-50/70 px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
  </div>
);

const ProgressLine: React.FC<{ label: string; done: number; total: number }> = ({ label, done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? '#059669' : pct > 0 ? '#d97706' : '#d1d5db';

  return (
    <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm text-gray-700">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tabular-nums text-gray-500">{done}/{total}</span>
        <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
          <circle cx="14" cy="14" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};

export default SupportOnboardingPage;
