import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import { PROGRESS_STEPS, StepPill } from '../components/OnboardingStepPills';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import PageLoader from '../components/PageLoader';
import ModalShell from '../components/followups/ModalShell';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  groupDiscussionApi,
  groupsApi,
  messageTemplatesApi,
  participantsApi,
  usersApi,
} from '../services/api';
import Spinner from '../components/Spinner';
import { fillTemplate } from '../utils/followUps';
import { buildWhatsAppLink, normalizeToIntlPhone } from '../utils/phone';
import { downloadFile } from '../utils/download';
import { sortByText } from '../utils/sort';
import { pickableUsers } from '../utils/testUsers';
import type {
  MessageTemplate,
  Participant,
  OnboardingProgress,
  User,
} from '../types';

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const downloadImage = (url: string, name: string) => downloadFile(url, name);

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
        const sortedSupports = sortByText(pickableUsers(users.filter((u) => u.role === 'SUPPORT' && u.id !== coordinatorId)), (support) => support.name);
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
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupOptions, setGroupOptions] = useState<Array<{ value: string; label: string; meta?: string }>>([]);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [progressError, setProgressError] = useState('');
  const [progressLoading, setProgressLoading] = useState(false);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [onboardTab, setOnboardTab] = useState<'people' | 'support'>('people');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCohort || !user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let [participantsRes, templatesRes] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }),
        messageTemplatesApi.getAll({ category: 'ONBOARDING' }),
      ]);

      const options = new Map<string, { value: string; label: string; meta?: string }>();
      participantsRes.participants.forEach((participant) => {
        if (!participant.groupId || options.has(participant.groupId)) return;
        const count = participantsRes.participants.filter((entry) => entry.groupId === participant.groupId).length;
        options.set(participant.groupId, { value: participant.groupId, label: participant.groupName || 'Untitled group', meta: `${count} participants` });
      });

      // A cohort with a single group and no support match: show that group.
      if (options.size === 0) {
        const { groups } = await groupsApi.getAll({ cohortId: activeCohort.id });
        if (groups.length === 1) {
          const singleGroup = groups[0];
          const groupParticipantsRes = await groupsApi.getParticipants(singleGroup.id);
          participantsRes = { participants: groupParticipantsRes.participants };
          options.set(singleGroup.id, { value: singleGroup.id, label: singleGroup.name || 'Untitled group', meta: `${groupParticipantsRes.participants.length} participants` });
        }
      }

      setParticipants(sortByText(participantsRes.participants, (participant) => participant.fullName));
      setTemplates(sortByText(templatesRes.templates, (template) => template.useCase));
      const list = sortByText(Array.from(options.values()), (option) => option.label);
      setGroupOptions(list);
      setSelectedGroupId((current) => (current && options.has(current) ? current : (list[0]?.value ?? '')));
    } finally {
      setLoading(false);
    }
  }, [activeCohort, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProgress = useCallback(async () => {
    if (!selectedGroupId) { setProgress(null); return; }
    setProgressLoading(true);
    try {
      setProgress(await groupDiscussionApi.onboardingProgress(selectedGroupId));
      setProgressError('');
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Could not load progress.');
    } finally {
      setProgressLoading(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const group = progress?.groups.find((entry) => entry.groupId === selectedGroupId) ?? progress?.groups[0] ?? null;
  const rows = useMemo(
    () => sortByText((progress?.participants ?? []).filter((entry) => !selectedGroupId || entry.groupId === selectedGroupId), (entry) => entry.name),
    [progress, selectedGroupId]
  );
  const ready = rows.filter((entry) => entry.completed).length;
  const percent = rows.length > 0 ? Math.round((ready / rows.length) * 100) : 0;
  const introPosted = !!group?.supportIntroPosted;
  const activeParticipant = participants.find((participant) => participant.id === activeParticipantId) ?? null;

  const openIntroductions = () => {
    const params = new URLSearchParams({ tab: 'discussion', group: selectedGroupId });
    if (!introPosted) params.set('intro', '1');
    navigate(`/support/participants?${params.toString()}`);
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Onboard"
        tourId="support:onboarding"
        subtitle="Start introductions, then watch your participants get ready."
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
            <section className="surface-card p-8 text-center">
              <p className="text-sm font-semibold text-gray-700">You don&apos;t have a participant group this cohort</p>
              <p className="mt-1 text-xs text-gray-400">Onboarding steps live here for a participant group — head to My Hub for your hub instead.</p>
              <NavLink to="/support/my-hub" className="mt-4 inline-flex min-h-[38px] items-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                Open My Hub
              </NavLink>
            </section>
          ) : (
            <>
              <section data-wt="onb-steps" className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{groupOptions.find((option) => option.value === selectedGroupId)?.label}</h2>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {progressLoading && !progress ? 'Loading…' : `${ready} of ${rows.length} ready`}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-wt="onb-intro-btn"
                    onClick={openIntroductions}
                    disabled={!progress}
                    className="min-h-[40px] rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {introPosted ? 'View introductions' : 'Start introductions'}
                  </button>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                </div>
                {!introPosted && progress && (
                  <p className="mt-3 text-[13px] text-gray-500">Your group can&apos;t introduce themselves until you have.</p>
                )}
              </section>

              <section data-wt="onb-people" className={CARD}>
                <div>
                  <h2 className="text-base font-bold text-gray-900">People</h2>
                  <p className="mt-0.5 text-[13px] text-gray-500">Tap a person to open message templates.</p>
                </div>

                {progressError ? (
                  <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{progressError}</p>
                ) : progressLoading && !progress ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : rows.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">
                    No participants are in this group yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {rows.map((row) => {
                      const person = participants.find((participant) => participant.id === row.participantId);
                      return (
                        <div
                          key={row.participantId}
                          role={person ? 'button' : undefined}
                          tabIndex={person ? 0 : undefined}
                          onClick={() => person && setActiveParticipantId(person.id)}
                          onKeyDown={(event) => {
                            if (person && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              setActiveParticipantId(person.id);
                            }
                          }}
                          className={`rounded-2xl border border-[#f1f2f5] bg-white p-4 ${person ? 'cursor-pointer' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar name={row.name} avatarUrl={row.avatarUrl} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-gray-900">{row.name}</p>
                              {person && <CopyPhoneButton phone={person.phone} />}
                            </div>
                            {row.completed && (
                              <span className="flex-none rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">Onboarded</span>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {PROGRESS_STEPS.map((step) => (
                              <StepPill key={step.key} label={step.label} done={row[step.key]} />
                            ))}
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

export default SupportOnboardingPage;
