import React from 'react';
import type { OnboardingState } from '../types';

type StepKey = 'introPosted' | 'venueMapAcknowledged' | 'introGuideRead' | 'profileComplete' | 'readyConfirmed';

// The five steps a participant does themselves; staff only watch.
export const PROGRESS_STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'introPosted', label: 'Intro' },
  { key: 'venueMapAcknowledged', label: 'Map' },
  { key: 'introGuideRead', label: 'Guide' },
  { key: 'profileComplete', label: 'Profile' },
  { key: 'readyConfirmed', label: 'Ready' },
];

export const StepPill: React.FC<{ label: string; done: boolean }> = ({ label, done }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-700'}`}>
    {done && (
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" /></svg>
    )}
    {label}
  </span>
);

/** Step pills, plus an "Onboarded" pill when all are done. */
const OnboardingStepPills: React.FC<{ state: Pick<OnboardingState, StepKey | 'completed'> }> = ({ state }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {PROGRESS_STEPS.map((step) => <StepPill key={step.key} label={step.label} done={state[step.key]} />)}
    {state.completed && <span className="rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">Onboarded</span>}
  </div>
);

export default OnboardingStepPills;
