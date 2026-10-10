import React from 'react';
import { ONBOARDING_CHIP_LABEL, ONBOARDING_STEPS, type GroupOnboardingSummary, type OnboardingChip } from '../../utils/groupOnboarding';

// The onboarding glance on a group's card: a status chip, five segments (one per step, filled by how
// many members are past it), and what the group is waiting on.

const CHIP_STYLE: Record<OnboardingChip, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-sky-100/80 text-sky-700',
  overdue: 'bg-red-100/80 text-red-700',
  onboarded: 'bg-emerald-100/80 text-emerald-700',
};

export const OnboardingChipBadge: React.FC<{ chip: OnboardingChip }> = ({ chip }) => (
  <span className={`inline-flex flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_STYLE[chip]}`}>{ONBOARDING_CHIP_LABEL[chip]}</span>
);

const GroupOnboardingStrip: React.FC<{ summary: GroupOnboardingSummary; maxDays: number }> = ({ summary, maxDays }) => {
  const { chip, members, onboarded, stepCounts, daysSinceAssigned, waitingOn } = summary;
  const days = daysSinceAssigned === null ? null : `${daysSinceAssigned} day${daysSinceAssigned === 1 ? '' : 's'}`;
  const detail = [
    `${onboarded} of ${members} onboarded`,
    chip === 'overdue' && days ? `${days} since assigned` : chip !== 'onboarded' && days ? `day ${daysSinceAssigned! + 1} of ${maxDays}` : null,
  ].filter(Boolean).join(' · ');
  const label = `Onboarding ${ONBOARDING_CHIP_LABEL[chip].toLowerCase()}. ${detail}. ${ONBOARDING_STEPS.map((step, i) => `${step.label} ${stepCounts[i]} of ${members}`).join(', ')}.`;
  return (
    <div data-wt="group-onboarding" className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OnboardingChipBadge chip={chip} />
        <span className="min-w-0 text-[11px] text-gray-500">{detail}</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {ONBOARDING_STEPS.map((step, index) => {
          const share = stepCounts[index] / members;
          return (
            <div key={step.key} className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div className={`h-full rounded-full ${share === 1 ? 'bg-emerald-500' : 'bg-emerald-400/80'}`} style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <p className="mt-0.5 truncate text-[10px] leading-none text-gray-400">{step.label}</p>
            </div>
          );
        })}
      </div>
      {waitingOn && (
        <p className="text-[11px] text-gray-500">
          Waiting on <span className="font-semibold text-gray-700">{waitingOn.label}</span> · {waitingOn.people} {waitingOn.people === 1 ? 'person' : 'people'}
        </p>
      )}
    </div>
  );
};

export default GroupOnboardingStrip;
