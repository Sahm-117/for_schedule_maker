import React from 'react';
import type { FollowUpStatus } from '../../types';
import { FOLLOW_UP_STATUS_META } from '../../utils/followUps';

const STEPS = ['Contacting', 'Registered', 'Login shared', 'Confirmed'];

// Which step each status sits on. Null means the follow-up left the path
// (next cohort, attended a prior cohort, or closed without signing up) and shows as one end chip instead.
const STEP_INDEX: Record<FollowUpStatus, number | null> = {
  TO_CONTACT: 0,
  WAITING: 0,
  NEEDS_REMINDER: 0,
  REPLIED: 0,
  CALL_BACK_LATER: 0,
  REGISTERED: 1,
  LOGIN_SHARED: 2,
  LOGIN_ISSUE: 2,
  ACCESS_CONFIRMED: 3,
  ATTENDED: null,
  NEXT_COHORT: null,
  WRONG_NUMBER: null,
  NOT_INTERESTED: null,
  NO_RESPONSE: null,
};

/** Where a follow-up is on the way from first contact to being in the app. */
const FollowUpStatusFlow: React.FC<{ status: FollowUpStatus; className?: string }> = ({ status, className = '' }) => {
  const current = STEP_INDEX[status];

  if (current === null) {
    const label = status === 'NEXT_COHORT' ? 'Moved to next cohort' : `Closed: ${FOLLOW_UP_STATUS_META[status].label}`;
    return (
      <div className={className}>
        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">{label}</span>
      </div>
    );
  }

  const issue = status === 'LOGIN_ISSUE';
  const finished = status === 'ACCESS_CONFIRMED';

  return (
    <ol className={`flex items-start ${className}`} aria-label="Follow-up progress">
      {STEPS.map((step, i) => {
        const isCurrent = i === current;
        const isDone = i < current || (finished && isCurrent);
        const label = isCurrent && issue ? 'Issue with login' : step;
        const dot = isCurrent
          ? issue
            ? 'bg-orange-500 ring-4 ring-orange-100'
            : finished
              ? 'bg-emerald-500 ring-4 ring-emerald-100'
              : 'bg-primary ring-4 ring-primary/15'
          : isDone
            ? 'bg-emerald-500'
            : 'bg-gray-200';
        const text = isCurrent
          ? issue ? 'font-semibold text-orange-700' : 'font-semibold text-gray-900'
          : isDone ? 'text-gray-500' : 'text-gray-400';
        const line = i <= current ? (isCurrent && issue ? 'bg-orange-300' : 'bg-emerald-400') : 'bg-gray-200';
        return (
          <li key={step} className="relative flex flex-1 flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
            {i > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[5px] h-0.5 w-full ${line}`} />}
            <span aria-hidden="true" className={`relative h-3 w-3 rounded-full ${dot}`} />
            <span className={`mt-1.5 px-0.5 text-[11px] leading-tight ${text}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
};

export default FollowUpStatusFlow;
