import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
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
import { downloadFile } from '../utils/download';
import { sortByText } from '../utils/sort';
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

// Independent onboarding steps a support can toggle in any combination.
const STATUS_STEPS: Array<{ key: StatusKey; label: string; meta: string }> = [
  { key: 'contacted', label: 'Talked to', meta: 'You have talked to this person' },
  { key: 'addedToGroup', label: 'Added to group', meta: 'Added to the small group' },
  { key: 'introductionDone', label: 'Introduced', meta: 'Introduced to the group' },
  { key: 'venueAcknowledged', label: 'Knows venue', meta: 'Knows where and when to meet' },
];

const STAGE_LABELS: Record<OnboardingStage, string> = STAGE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<OnboardingStage, string>);

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const downloadImage = (url: string, name: string) => downloadFile(url, name);

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
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50/70 px-2.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-orange-200 hover:bg-orange-100 hover:text-primary"
      title="Copy phone number"
      aria-label={`Copy phone number ${phone}`}
    >
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 0 0-1.173.417l-.97 1.293a1.125 1.125 0 0 1-1.21.38 12.035 12.035 0 0 1-7.143-7.143 1.125 1.125 0 0 1 .38-1.21l1.293-.97a1.125 1.125 0 0 0 .417-1.173L6.963 3.102A1.125 1.125 0 0 0 5.872 2.25H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
      </svg>
      <span className="truncate">{phone}</span>
      {copied ? (
        <span className="flex-shrink-0 text-[11px] text-emerald-600">Copied</span>
      ) : (
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2Z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
        </svg>
      )}
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

  const sortedTemplates = sortByText(templates, (template) => template.useCase);
  const selected = sortedTemplates.find((template) => template.id === selectedId) ?? null;
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
      {sortedTemplates.length === 0 ? (
          <p className="rounded-2xl bg-orange-50 px-4 py-6 text-center text-sm text-gray-500">
            No message templates yet. Ask an admin to add some.
          </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {sortedTemplates.map((template) => (
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
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
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
        setTemplates(sortByText(ts, (template) => template.useCase));
        const sortedSupports = sortByText(users.filter((u) => u.role === 'SUPPORT' && u.id !== coordinatorId), (support) => support.name);
        setSupports(sortedSupports);
        setSelectedSupportId((current) => current || sortedSupports[0]?.id || '');
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [coordinatorId]);

  const selectedSupport = supports.find((s) => s.id === selectedSupportId) ?? null;
  const fillFor = (template: MessageTemplate) => fillTemplate(
    template.body,
    { fullName: selectedSupport?.name ?? '', phone: '', cohortVenue: '', cohortStartDate: null } as any,
    '',
    coordinatorName
  );

  if (loading) return <PageLoader />;
  if (templates.length === 0) {
    return (
      <section className="surface-card p-6 text-center">
        <p className="text-sm text-gray-500">No onboarding messages have been set up yet.</p>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <h2 className="text-base font-bold text-gray-900">Onboard a support</h2>
      <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">Pick a fellow support and a message, then send it to them.</p>

      <div className="mt-4">
        <span className="mb-2 block text-[12.5px] font-semibold text-gray-900">Support to onboard</span>
        {supports.length === 0 ? (
          <p className="text-sm text-gray-500">No other supports found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {supports.map((support) => {
              const active = support.id === selectedSupportId;
              return (
                <button
                  key={support.id}
                  type="button"
                  onClick={() => setSelectedSupportId(support.id)}
                  className={`min-h-[42px] rounded-full border px-[15px] py-2 text-[13px] font-semibold transition ${active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {support.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-[18px] flex flex-col gap-2.5">
        {templates.map((template) => {
          const body = fillFor(template);
          const waLink = selectedSupport ? buildWhatsAppLink(selectedSupport.phone, body) : null;
          return (
            <div key={template.id} className="rounded-[14px] border border-[#f1f2f5] p-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[13px] font-bold text-gray-900">{template.useCase}</span>
                {template.whenToUse && (
                  <span className="rounded-full bg-[#f6f7f9] px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">{template.whenToUse}</span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700">{body}</p>

              {template.imageUrl && (
                <img src={template.imageUrl} alt={template.imageName ?? 'template graphic'} loading="lazy" className="mt-3 h-40 w-full rounded-xl object-cover" />
              )}

              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(body);
                    setCopiedTemplateId(template.id);
                    setTimeout(() => setCopiedTemplateId((current) => (current === template.id ? null : current)), 2000);
                  }}
                  className="min-h-[42px] flex-[1_1_120px] rounded-[10px] border border-[#ffdeca] bg-[#fff8f3] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#c2410c]"
                >
                  {copiedTemplateId === template.id ? 'Copied' : 'Copy message'}
                </button>
                {template.imageUrl && (
                  <button
                    type="button"
                    onClick={() => { void downloadImage(template.imageUrl!, template.imageName ?? 'graphic.jpg'); }}
                    className="min-h-[42px] flex-[1_1_120px] rounded-[10px] border border-violet-200 bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-violet-700"
                  >
                    Download image
                  </button>
                )}
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[42px] flex-[1_1_140px] items-center justify-center rounded-[10px] bg-[#25d366] px-3.5 py-2.5 text-[12.5px] font-semibold text-white"
                  >
                    Send in WhatsApp
                  </a>
                ) : (
                  <span
                    title="This support has no phone number saved"
                    className="inline-flex min-h-[42px] flex-[1_1_140px] items-center justify-center rounded-[10px] bg-gray-100 px-3.5 py-2.5 text-[12.5px] font-semibold text-gray-400"
                  >
                    Send in WhatsApp
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const SupportOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;
  return <SupportOnboardingContent user={user} />;
};

const SupportOnboardingContent: React.FC<{ user: User }> = ({ user }) => {
  const { activeCohort } = useAppData();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<GroupOnboardingStatus[]>([]);
  const [participantStatuses, setParticipantStatuses] = useState<ParticipantOnboardingStatus[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [onboardTab, setOnboardTab] = useState<'people' | 'support'>('people');
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingParticipantSteps, setSavingParticipantSteps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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

      const sortedParticipants = sortByText(participantsRes.participants, (participant) => participant.fullName);
      setParticipants(sortedParticipants);
      const fallbackGroups = new Map<string, GroupOnboardingStatus>();
      participantsRes.participants.forEach((participant) => {
        if (!participant.groupId || fallbackGroups.has(participant.groupId)) return;
        const count = participantsRes.participants.filter((entry) => entry.groupId === participant.groupId).length;
        fallbackGroups.set(participant.groupId, virtualGroupStatus(participant.groupId, participant.groupName, count));
      });
      groupStatusRes.statuses.forEach((status) => fallbackGroups.set(status.groupId, status));

      const participantStatusMap = new Map(participantStatusRes.statuses.map((status) => [status.participantId, status]));
      setGroupStatuses(Array.from(fallbackGroups.values()));
      setParticipantStatuses(sortedParticipants.map((participant) => participantStatusMap.get(participant.id) ?? virtualParticipantStatus(participant)));
      setTemplates(sortByText(templatesRes.templates, (template) => template.useCase));
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
    return sortByText(Array.from(map.values()), (option) => option.label);
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

  // Toggle a single onboarding step independently (multi-select), writing the
  // boolean directly rather than a cumulative stage.
  const updateParticipantStep = async (
    participantId: string,
    key: StatusKey,
    nextValue: boolean
  ) => {
    if (!user.id) return;
    const savingKey = `${participantId}:${key}`;
    setSavingParticipantSteps((current) => new Set(current).add(savingKey));
    try {
      const { status } = await participantOnboardingStatusApi.update(participantId, { [key]: nextValue }, user.id);
      setParticipantStatuses((prev) => {
        const others = prev.filter((entry) => entry.participantId !== status.participantId);
        return [...others, status];
      });
    } finally {
      setSavingParticipantSteps((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Onboard"
        tourId="support:onboarding"
        subtitle="Activate your participants, and help a fellow support get started."
      />

      {user.isCoordinator && (
        <div data-wt="onb-tabs" className="mb-3 max-w-[760px]">
          <SegmentedTabs
            tabs={[
              { key: 'people', label: 'My participants' },
              { key: 'support', label: 'Onboard a support' },
            ]}
            active={onboardTab}
            onChange={(key) => setOnboardTab(key as 'people' | 'support')}
          />
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : (
        <div className="max-w-[760px] space-y-3">
          {onboardTab === 'people' && (<>
          {groupOptions.length > 1 && (
            <section className={CARD}>
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
              <section data-wt="onb-steps" className={CARD}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900">{selectedGroupStatus?.groupName || groupOptions.find((option) => option.value === selectedGroupId)?.label}</h2>
                  <p className="text-xs text-gray-500">
                    {checklistPercent}% of steps done · {completedParticipants}/{selectedParticipantStatuses.length} people fully done ({participantPercent}%)
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <StepRow
                    n={1}
                    label="Group set up"
                    detail={selectedGroupStatus?.groupCreated ? 'The small group is ready. Tap to undo.' : 'The small group has not been set up yet. Tap to mark done.'}
                    state={selectedGroupStatus?.groupCreated ? 'DONE' : 'NOT_STARTED'}
                    onClick={() => { void updateGroupCreated(!selectedGroupStatus?.groupCreated); }}
                    busy={savingGroup}
                  />
                  {STATUS_STEPS.map((step, index) => {
                    const done = selectedParticipantStatuses.filter((s) => s[step.key]).length;
                    const total = selectedParticipantStatuses.length;
                    return (
                      <StepRow
                        key={step.key}
                        n={index + 2}
                        label={step.label}
                        detail={`${done} of ${total} ${total === 1 ? 'person' : 'people'}`}
                        state={progressState(done, total)}
                      />
                    );
                  })}
                </div>
              </section>

              <section data-wt="onb-people" className={CARD}>
                <div>
                  <h2 className="text-base font-bold text-gray-900">People</h2>
                  <p className="mt-0.5 text-[13px] text-gray-500">Tap a person to open message templates.</p>
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
                        <div key={participant.id} className="rounded-2xl border border-[#f1f2f5] bg-white p-4">
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
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Status</p>
                              <div className="space-y-1.5">
                                {STATUS_STEPS.map((step) => {
                                  const checked = !!status[step.key];
                                  const busy = savingParticipantSteps.has(`${participant.id}:${step.key}`);
                                  return (
                                    <button
                                      key={step.key}
                                      type="button"
                                      disabled={busy}
                                      onClick={() => { void updateParticipantStep(participant.id, step.key, !checked); }}
                                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] ${
                                        checked ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-200 bg-white hover:border-gray-300'
                                      }`}
                                    >
                                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                                        checked ? 'border-emerald-500 bg-emerald-500 text-white' : busy ? 'border-orange-300 text-primary' : 'border-gray-300 text-transparent'
                                      }`}>
                                        {busy ? (
                                          <span className={`h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent ${checked ? 'text-white' : 'text-primary'}`} />
                                        ) : (
                                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" />
                                          </svg>
                                        )}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-gray-800">{step.label}</span>
                                        <span className="block text-xs text-gray-500">{step.meta}</span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
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
          </>)}

          {user.isCoordinator && onboardTab === 'support' && (
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

type StepState = 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED';

const STEP_STATE_STYLE: Record<StepState, { label: string; dot: string; text: string }> = {
  DONE: { label: 'Done', dot: 'bg-[#f2fbf5] text-[#15803d]', text: 'text-[#15803d]' },
  IN_PROGRESS: { label: 'In progress', dot: 'bg-[#fff8f3] text-[#c2410c]', text: 'text-[#c2410c]' },
  NOT_STARTED: { label: 'Not started', dot: 'bg-[#f6f7f9] text-gray-500', text: 'text-gray-500' },
};

const progressState = (done: number, total: number): StepState => {
  if (total > 0 && done === total) return 'DONE';
  return done > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
};

const StepRow: React.FC<{
  n: number;
  label: string;
  detail: string;
  state: StepState;
  onClick?: () => void;
  busy?: boolean;
}> = ({ n, label, detail, state, onClick, busy }) => {
  const style = STEP_STATE_STYLE[state];
  const content = (
    <>
      <span className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-full text-xs font-bold ${style.dot}`}>{n}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-gray-900">{label}</span>
        <span className="block text-[13px] text-gray-500">{detail}</span>
      </span>
      <span className={`ml-auto flex-none text-xs font-semibold ${style.text}`}>{busy ? 'Saving…' : style.label}</span>
    </>
  );
  const cls = 'flex w-full items-center gap-3.5 rounded-2xl border border-[#f1f2f5] bg-white p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} disabled={busy} className={`${cls} transition hover:border-gray-200 disabled:opacity-70`}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
};

export default SupportOnboardingPage;
