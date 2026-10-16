import React, { useEffect, useState } from 'react';
import { groupDiscussionApi } from '../../services/api';
import type { Group, OnboardingProgress } from '../../types';
import { supportOnboardingSteps } from '../../utils/supportOnboarding';

// ── A support's own onboarding steps for their group ─────────────────────────
// Shown at the top of My Group and of the support's Home. The app ticks each step itself from what it
// can see, so a support cannot tick their own; only an admin can mark a step done by hand (an override,
// shown as such). The rules are in utils/supportOnboarding.

const Tick: React.FC<{ done: boolean }> = ({ done }) => (
  <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${done ? 'bg-emerald-500 text-white' : 'border-2 border-neutral-300'}`} aria-hidden="true">
    {done && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" /></svg>}
  </span>
);

const CARD = 'rounded-[18px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const SupportOnboardingSteps: React.FC<{
  group: Pick<Group, 'id' | 'meetingDay' | 'meetingTime' | 'callLink'>;
  /** Already loaded by the page; leave undefined to have this load it. */
  progress?: OnboardingProgress | null;
  /** Gets whether the support has already introduced themselves. */
  onOpenIntroductions: (introduced: boolean) => void;
  onOpenMeetings: () => void;
  /** Home hides the card once everything is done; My Group keeps a one-line "complete". */
  hideWhenComplete?: boolean;
}> = ({ group, progress: given, onOpenIntroductions, onOpenMeetings, hideWhenComplete }) => {
  const [loaded, setLoaded] = useState<{ groupId: string; progress: OnboardingProgress } | null>(null);
  const [failed, setFailed] = useState(false);
  const selfLoad = given === undefined;

  useEffect(() => {
    if (!selfLoad) return undefined;
    let cancelled = false;
    setFailed(false);
    groupDiscussionApi.onboardingProgress(group.id)
      .then((progress) => { if (!cancelled) setLoaded({ groupId: group.id, progress }); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [group.id, selfLoad]);

  const progress = selfLoad ? (loaded?.groupId === group.id ? loaded.progress : null) : given;
  if (!progress) {
    if (hideWhenComplete || failed) return null;
    return <section data-wt="onb-steps" className={`${CARD} p-4`}><p className="text-[13px] font-semibold text-gray-700">Loading…</p></section>;
  }

  const { steps, readyCount, total } = supportOnboardingSteps(group, progress);
  const left = steps.filter((s) => !s.done).length;
  // An admin's mark does not post an intro, and participants can only introduce themselves after a real one.
  const introduced = steps[0].done && !steps[0].byAdmin;
  const openIntroductions = () => onOpenIntroductions(introduced);
  if (left === 0) {
    if (hideWhenComplete) return null;
    return (
      <section data-wt="onb-steps" className={`${CARD} flex items-center gap-2.5 px-4 py-3`}>
        <Tick done />
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-gray-700">Onboarding complete</p>
        <button type="button" data-wt="onb-intro-btn" onClick={openIntroductions} className="flex-none text-[12.5px] font-semibold text-primary">View introductions</button>
      </section>
    );
  }

  const readyPercent = total > 0 ? Math.round((readyCount / total) * 100) : 0;
  return (
    <section data-wt="onb-steps" className={`${CARD} p-4`}>
      <div className="flex items-baseline gap-2">
        <p className="text-[15px] font-bold text-gray-900">Get your group ready</p>
        <span className="ml-auto text-[12px] font-semibold text-gray-500">{steps.length - left} of {steps.length} done</span>
      </div>
      <ul className="mt-3 space-y-3">
        {steps.map((step) => (
          <li key={step.key} data-step={step.key} data-done={step.done} className="flex items-start gap-3">
            <Tick done={step.done} />
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-semibold ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.label}</p>
              {step.key === 'READY' && total > 0 && !step.byAdmin && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${readyPercent}%` }} />
                </div>
              )}
              {step.byAdmin ? (
                <p className="mt-1 text-[12.5px] text-gray-500">Marked done by an admin</p>
              ) : step.note && (step.key === 'READY' || !step.done) ? (
                <p className="mt-1 text-[12.5px] text-gray-500">{step.note}</p>
              ) : null}
              {step.key === 'INTRO' && !introduced && (
                <button type="button" data-wt="onb-intro-btn" onClick={openIntroductions} className="mt-2 min-h-[36px] rounded-full bg-primary px-4 text-[13px] font-semibold text-white">Start introductions</button>
              )}
              {!step.done && step.key === 'MEETING' && (
                <button type="button" onClick={onOpenMeetings} className="mt-2 min-h-[36px] rounded-full bg-primary px-4 text-[13px] font-semibold text-white">Open Meetings</button>
              )}
              {step.key === 'INTRO' && introduced && (
                <button type="button" onClick={openIntroductions} className="mt-1 text-[12.5px] font-semibold text-primary">View introductions</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SupportOnboardingSteps;
