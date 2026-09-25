import { useEffect, useState } from 'react';
import { classFeedbackApi, settingsApi } from '../services/api';
import { classFeedbackReleaseAt } from '../utils/classFeedbackTimes';
import type { Cohort, Week } from '../types';

// "Anything from today's class to flag?" once a week, for a support/admin --
// the most recent week whose support feedback time has passed and that this
// support hasn't answered yet. "Not now" lasts for this app session only,
// same key pattern as useParticipantPush's SESSION_DISMISS_KEY.
const SESSION_DISMISS_KEY = 'fof_support_classfeedback_dismissed_session';

const wasDismissedThisSession = (): boolean => {
  try { return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'; } catch { return false; }
};
const markDismissedThisSession = (): void => {
  try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch { /* private browsing etc. */ }
};

export const useSupportClassFeedbackPrompt = (activeCohort: Cohort | null, weeks: Week[], supportId: string | undefined) => {
  const [dueWeek, setDueWeek] = useState<{ weekId: number; weekNumber: number } | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissedThisSession);

  useEffect(() => {
    let cancelled = false;
    if (!activeCohort?.startDate || !supportId || weeks.length === 0) { setDueWeek(null); return undefined; }
    (async () => {
      const times = await settingsApi.getClassFeedbackTimes().catch(() => null);
      if (!times || cancelled) return;
      const now = new Date();
      const due = [...weeks]
        .filter((w) => {
          const at = classFeedbackReleaseAt(activeCohort.startDate, w.weekNumber, times.supportDay, times.supportTime);
          return at !== null && at <= now;
        })
        .sort((a, b) => b.weekNumber - a.weekNumber)[0];
      if (!due) { if (!cancelled) setDueWeek(null); return; }
      const answered = await classFeedbackApi.getMineForCohort(activeCohort.id, supportId).catch(() => new Set<number>());
      if (cancelled) return;
      setDueWeek(answered.has(due.id) ? null : { weekId: due.id, weekNumber: due.weekNumber });
    })();
    return () => { cancelled = true; };
  }, [activeCohort?.id, activeCohort?.startDate, weeks, supportId]);

  const dismiss = () => { markDismissedThisSession(); setDismissed(true); };
  const markAnswered = () => setDueWeek(null);

  return { dueWeek: dismissed ? null : dueWeek, dismiss, markAnswered };
};
