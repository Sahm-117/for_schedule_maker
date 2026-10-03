import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import { PROGRESS_STEPS, StepPill } from '../components/OnboardingStepPills';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  groupDiscussionApi,
  groupsApi,
  participantsApi,
} from '../services/api';
import Spinner from '../components/Spinner';
import { sortByText } from '../utils/sort';
import type {
  Participant,
  OnboardingProgress,
  User,
} from '../types';

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

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

const SupportOnboardingContent: React.FC<{ user: User }> = ({ user }) => {
  const { activeCohort } = useAppData();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupOptions, setGroupOptions] = useState<Array<{ value: string; label: string; meta?: string }>>([]);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [progressError, setProgressError] = useState('');
  const [progressLoading, setProgressLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCohort || !user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let participantsRes = await participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id });

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


      {loading ? (
        <PageLoader />
      ) : (
        <div className="max-w-[760px] space-y-3">
          <>
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
                  <p className="mt-0.5 text-[13px] text-gray-500">Their steps update by themselves as they use the app.</p>
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
                          className="rounded-2xl border border-[#f1f2f5] bg-white p-4"
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
          </>
        </div>
      )}

    </div>
  );
};

const SupportOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;
  return <SupportOnboardingContent user={user} />;
};

export default SupportOnboardingPage;
