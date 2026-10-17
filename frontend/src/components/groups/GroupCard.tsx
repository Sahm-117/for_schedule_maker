import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../Avatar';
import ModalShell from '../followups/ModalShell';
import { ONBOARDING_STEPS, type GroupOnboardingSummary, type OnboardingChip } from '../../utils/groupOnboarding';
import { genderAgeLine } from '../../utils/people';
import { deviceLabel, lastSeenLabel } from '../../utils/appUse';
import { participantStepDone } from '../../utils/supportOnboarding';
import type { Group, OnboardingProgressParticipant, Participant, ParticipantAppInfo } from '../../types';

// A group on the Groups page, kept calm: the name and Support, one status word with one progress bar,
// setup shown only when something is missing, and the people one tap away. The tap opens
// GroupDetailSheet (the five steps, and each person with what they are waiting on).

const STATUS_TEXT: Record<OnboardingChip, string> = {
  not_started: 'text-gray-600',
  in_progress: 'text-sky-700',
  overdue: 'text-red-700',
  onboarded: 'text-emerald-700',
};

const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

const statusLabel = (summary: GroupOnboardingSummary, maxDays: number) => {
  const { chip, daysSinceAssigned } = summary;
  if (chip === 'onboarded') return 'Onboarded';
  if (chip === 'overdue') return daysSinceAssigned === null ? 'Overdue' : `Overdue · ${dayWord(daysSinceAssigned)}`;
  if (chip === 'in_progress') return daysSinceAssigned === null ? 'In progress' : `In progress · day ${Math.min(daysSinceAssigned + 1, maxDays)} of ${maxDays}`;
  return 'Not started';
};

const Warn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-800">
    <svg className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2.2" /><path strokeLinecap="round" strokeWidth="2.2" d="M12 8v5M12 16.5v.01" /></svg>
    {children}
  </span>
);

/** Status word, count and bar. Shared by the card and the sheet. */
const StatusBar: React.FC<{ summary: GroupOnboardingSummary; maxDays: number }> = ({ summary, maxDays }) => {
  const share = summary.members === 0 ? 0 : summary.onboarded / summary.members;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className={`font-semibold ${STATUS_TEXT[summary.chip]}`}>{statusLabel(summary, maxDays)}</span>
        <span className="text-gray-600">{summary.onboarded} of {summary.members} ready</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eceef2]" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${share === 1 ? 100 : share === 0 ? 0 : Math.min(94, Math.max(8, Math.round(share * 100)))}%` }} />
      </div>
    </div>
  );
};

/** Setup: one calm line when done, amber chips only for what is missing. Nothing for a group with no Support. */
const SetupLine: React.FC<{ summary: GroupOnboardingSummary; hasSupport: boolean }> = ({ summary, hasSupport }) => {
  if (!hasSupport) return null;
  const { support } = summary;
  const missing: string[] = [];
  if (support.introduced === false) missing.push('Support not introduced');
  if (!support.meetingSet) missing.push('No meeting time');
  if (missing.length > 0) {
    return <div className="flex flex-wrap gap-1.5">{missing.map((text) => <Warn key={text}>{text}</Warn>)}</div>;
  }
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-emerald-700">
      <svg className="h-4 w-4 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m5 13 4 4L19 7" /></svg>
      {support.introduced === null ? 'Meeting time set' : 'Support introduced, meeting time set'}
    </p>
  );
};

const CHIP_TONE = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warn: 'bg-amber-100/80 text-amber-800',
  plain: 'bg-[#f3f4f6] text-gray-600',
} as const;

/** A small status chip: a tick when the step is done. */
const Chip: React.FC<{ tone: keyof typeof CHIP_TONE; done?: boolean; children: React.ReactNode }> = ({ tone, done, children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP_TONE[tone]}`}>
    {done && <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="m5 13 4 4L19 7" /></svg>}
    {children}
  </span>
);

interface GroupCardProps {
  group: Group;
  members: Participant[];
  summary: GroupOnboardingSummary | undefined;
  maxDays: number;
  hubName?: string | null;
  menu: React.ReactNode;
  /** Whether each person has signed in. Null while it has not loaded. */
  signedInIds: Set<string> | null;
  /** Each person's own onboarding row, to say what they are waiting on. */
  progress: Map<string, OnboardingProgressParticipant> | null;
  /** Phone and last-seen by participant id; null while it has not loaded (then those chips are left out). */
  appDetails: Record<string, ParticipantAppInfo> | null;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, members, summary, maxDays, hubName, menu, signedInIds, progress, appDetails }) => {
  const [open, setOpen] = useState(false);
  const shown = members.slice(0, 3);
  const waiting = summary?.waitingOn ?? null;

  return (
    <div className="flex flex-col gap-3.5 surface-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold text-gray-900">{group.name}</h3>
          <p className={`truncate text-[13px] ${group.supportName ? 'text-gray-500' : 'text-neutral-400'}`}>
            {group.supportName || 'No support assigned'}
            {group.supportId && hubName && <span className="text-gray-400"> · {hubName}</span>}
          </p>
          {group.archivedAt && <p className="mt-1 text-[11px] font-semibold text-amber-700">Archived</p>}
        </div>
        <div className="flex-shrink-0">{menu}</div>
      </div>

      {summary && (
        <div data-wt="group-onboarding" className="flex flex-col gap-3">
          <StatusBar summary={summary} maxDays={maxDays} />
          <SetupLine summary={summary} hasSupport={!!group.supportId} />
        </div>
      )}

      {members.length === 0 ? (
        <p className="rounded-xl bg-gray-50/80 px-3 py-3 text-center text-xs text-gray-400">No members yet</p>
      ) : (
        <div className="border-t border-[#f0f0f2] pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${group.name}: ${members.length} ${members.length === 1 ? 'person' : 'people'}`}
          className="-mx-1 flex min-h-[48px] w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-2xl px-1 text-left hover:bg-gray-50/60 active:scale-[0.99]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex flex-none -space-x-2">
              {shown.map((p) => <Avatar key={p.id} name={p.fullName} avatarUrl={p.avatarUrl} size="sm" className="ring-2 ring-white" />)}
            </span>
            <span className="min-w-0 truncate text-[13px] text-gray-600">
              {members.length} {members.length === 1 ? 'person' : 'people'}
              {waiting && <span> · waiting on {waiting.label}</span>}
            </span>
          </span>
          <svg className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 6 6 6-6 6" /></svg>
        </button>
        </div>
      )}

      {open && (
        <GroupDetailSheet
          group={group}
          members={members}
          summary={summary}
          maxDays={maxDays}
          hubName={hubName}
          signedInIds={signedInIds}
          progress={progress}
          appDetails={appDetails}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

const GroupDetailSheet: React.FC<Omit<GroupCardProps, 'menu'> & { onClose: () => void }> = ({ group, members, summary, maxDays, hubName, signedInIds, progress, appDetails, onClose }) => {
  const navigate = useNavigate();
  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={group.name}
      subtitle={[group.supportName || 'No support assigned', group.supportId ? hubName : null].filter(Boolean).join(' · ')}
    >
      <div className="flex flex-col gap-5">
        {summary && (
          <div className="flex flex-col gap-3">
            <StatusBar summary={summary} maxDays={maxDays} />
            <div className="flex flex-wrap gap-1.5">
              {ONBOARDING_STEPS.map((step, i) => {
                const done = summary.stepCounts[i] === summary.members;
                return (
                  <span key={step.key} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${done ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-800'}`}>
                    {step.label} {summary.stepCounts[i]}/{summary.members}
                  </span>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-gray-500">Map, Guide and Ready count as done once someone has been to class. Intro and Profile stay until they are done.</p>
            <SetupLine summary={summary} hasSupport={!!group.supportId} />
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">People</h3>
          <ul className="mt-1 flex flex-col">
            {members.map((p) => {
              const row = progress?.get(p.id);
              const signedIn = signedInIds ? signedInIds.has(p.id) : null;
              const info = appDetails?.[p.id];
              const phone = deviceLabel(info);
              const seen = lastSeenLabel(info);
              return (
                <li key={p.id} className="border-t border-[#f0f0f2] first:border-t-0">
                  <button
                    type="button"
                    onClick={() => { onClose(); navigate(`/participants/${p.id}`); }}
                    className="flex w-full items-start gap-3 py-3 text-left"
                  >
                    <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-gray-900">{p.fullName}</span>
                      <span className="block truncate text-xs text-gray-500">{[p.phone, genderAgeLine(p)].filter(Boolean).join(' · ')}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {row && ONBOARDING_STEPS.map((step) => (
                          <Chip key={step.key} tone={participantStepDone(row, step.key) ? 'good' : 'warn'} done={participantStepDone(row, step.key)}>{step.label}</Chip>
                        ))}
                        {signedIn === false && <Chip tone="warn">Not signed in</Chip>}
                        {appDetails && (phone ? <Chip tone="plain">{phone}</Chip> : null)}
                        {appDetails && (seen ? <Chip tone="plain">Seen {seen}</Chip> : <Chip tone="warn">Never opened</Chip>)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ModalShell>
  );
};

export default GroupCard;
