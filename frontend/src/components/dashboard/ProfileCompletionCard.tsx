import React, { useMemo, useState } from 'react';
import SegmentedTabs from '../SegmentedTabs';
import type { Participant, ProfileCompletion } from '../../types';
import { percentOf, summariseCompletion, type CompletionGroup, type CompletionScope } from '../../utils/profileCompletionSummary';

interface Props {
  /** Active participants of the cohort being looked at, test accounts already left out. */
  participants: Participant[];
  completionById: Map<string, ProfileCompletion>;
  teenGroupIds: Set<string>;
  /** Filters the list below to incomplete profiles, for the people the card is showing. */
  onShowIncomplete?: (scope: CompletionScope) => void;
}

const Row: React.FC<{ label: string; group: CompletionGroup; strong?: boolean }> = ({ label, group, strong = false }) => {
  const pc = percentOf(group.complete, group.people);
  return (
    <div className={`rounded-2xl p-4 ${strong ? 'bg-primary-soft/70' : 'bg-gray-50/80'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-gray-900">
          {label}
          <span className="ml-2 text-xs font-medium text-gray-500">{group.people} {group.people === 1 ? 'person' : 'people'}</span>
        </p>
        <p className="flex-none text-xl font-bold tabular-nums text-gray-900">{pc}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200/80" role="img" aria-label={`${pc} percent complete`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pc}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600 tabular-nums">
        <span><span className="font-semibold text-gray-900">{group.complete}</span> complete</span>
        <span><span className="font-semibold text-gray-900">{group.people - group.complete}</span> to finish</span>
        <span>average <span className="font-semibold text-gray-900">{group.average}%</span></span>
      </p>
    </div>
  );
};

/** How many participant profiles are complete, for those in a group and those not, at the top of the Participants page. */
const ProfileCompletionCard: React.FC<Props> = ({ participants, completionById, teenGroupIds, onShowIncomplete }) => {
  const [scope, setScope] = useState<CompletionScope>('all');
  const summary = useMemo(
    () => summariseCompletion(participants, completionById, teenGroupIds, scope),
    [participants, completionById, teenGroupIds, scope],
  );
  const everyone = summary.everyone;
  const [open, setOpen] = useState(false);
  const pctAll = percentOf(everyone.complete, everyone.people);
  const glance = everyone.people === 0
    ? ''
    : `${pctAll}% complete · In a group ${percentOf(summary.inGroup.complete, summary.inGroup.people)}% · Not in a group ${percentOf(summary.noGroup.complete, summary.noGroup.people)}%`;

  return (
    <section className="surface-card min-w-0 overflow-hidden" data-testid="profile-completion">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="profile-completion-body" className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900">Profile completion</h3>
          <p className="mt-0.5 text-[13px] text-gray-600 tabular-nums">{glance || 'No participants to count yet.'}</p>
        </div>
        <span className={`inline-flex h-8 w-8 flex-none items-center justify-center text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
          </svg>
        </span>
      </button>

      {open && (
        <div id="profile-completion-body" className="border-t border-gray-100 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">Active participants in this cohort</p>
            <SegmentedTabs
              tabs={[{ key: 'all', label: 'All' }, { key: 'adults', label: 'Adults' }, { key: 'teens', label: 'Teens' }]}
              active={scope}
              onChange={(k) => setScope(k as CompletionScope)}
              className="w-full sm:w-auto"
            />
          </div>

          {everyone.people === 0 ? (
            <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No participants to count yet.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-4xl font-bold tracking-tight tabular-nums text-gray-900">{pctAll}<span className="text-xl">%</span></p>
                <p className="text-sm text-gray-600 tabular-nums">{everyone.complete} of {everyone.people} fully complete</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Row label="In a group" group={summary.inGroup} />
                <Row label="Not in a group" group={summary.noGroup} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>Photo, gender, age range, date of birth, occupation and any required extra questions. Email is optional and not counted.</span>
                {onShowIncomplete && <button type="button" onClick={() => onShowIncomplete(scope)} className="font-semibold text-primary-dark hover:underline">Show who is incomplete</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default ProfileCompletionCard;
