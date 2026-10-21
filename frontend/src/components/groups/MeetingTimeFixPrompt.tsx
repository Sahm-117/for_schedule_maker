import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { groupsApi, settingsApi } from '../../services/api';
import { CALL_MINUTES, formatClock, lastStartMinutes, meetingSlotProblem, toMinutes, windowForDay, type GroupMeetingLimits } from '../../utils/groupMeetingLimits';
import { POPUP_PRIORITY, usePopupSlot } from '../../utils/popupQueue';
import { formatMeetingSlot } from './GroupCallCard';
import type { Group } from '../../types';

// A support whose group call starts too late for Settings > Group call limits (e.g. a 9:00 PM start set before calls
// had to start an hour before the window ends) is asked to change it. Only a late start on an allowed day is asked
// about, not a day that is no longer allowed. "Later" hides it until the next launch; it stops once the time fits.
// Nothing is changed for them.

const DISMISS_KEY = 'fof_meeting_time_fix_dismissed_session';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.2)]';
const PRIMARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]';
const SECONDARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98]';

const MeetingTimeFixPrompt: React.FC<{ enabled: boolean; userId?: string; cohortId?: string }> = ({ enabled, userId, cohortId }) => {
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  // Read here rather than through useGroupMeetingLimits, which starts on the defaults: judging against those would
  // ask the wrong people before the real limits arrive.
  const [limits, setLimits] = useState<GroupMeetingLimits | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!enabled || !userId || !cohortId || dismissed) return undefined;
    let cancelled = false;
    Promise.all([groupsApi.getForSupport(userId, cohortId), settingsApi.getGroupMeetingLimits()])
      .then(([{ group: g }, l]) => { if (!cancelled) { setGroup(g); setLimits(l); } })
      .catch(() => { /* offline: ask next launch */ });
    return () => { cancelled = true; };
  }, [enabled, userId, cohortId, dismissed]);

  const dayWindow = limits && group?.meetingDay ? windowForDay(limits, group.meetingDay) : null;
  const startsTooLate = !!dayWindow && !!group?.meetingDay && !!group.meetingTime && !!limits?.days.includes(group.meetingDay)
    && toMinutes(group.meetingTime) > lastStartMinutes(dayWindow);
  const problem = startsTooLate && limits && group ? meetingSlotProblem({ meetingDay: group.meetingDay ?? null, meetingTime: group.meetingTime ?? null }, limits) : null;
  const wants = enabled && !dismissed && !!problem;
  const slot = usePopupSlot('meeting-time-fix', POPUP_PRIORITY.meetingTimeFix, wants, 'required');
  if (!wants || !slot || !group || !dayWindow) return null;

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private browsing etc. */ }
    setDismissed(true);
  };
  const isThursday = group.meetingDay === 'THURSDAY';
  const callLength = CALL_MINUTES === 60 ? 'an hour' : `${CALL_MINUTES} minutes`;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Please change your group call time">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className={`${SURFACE} relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-b-none px-6 pb-7 pt-7 sm:rounded-[28px]`}>
        <p className="text-[13px] font-semibold text-primary">Group call time</p>
        <h2 className="mt-1.5 text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-gray-900">Please change your group call time</h2>
        <p className="mt-3 text-[15px] leading-[1.55] text-gray-600">
          Your call is set for <span className="font-semibold text-gray-900">{formatMeetingSlot(group.meetingDay, group.meetingTime)}</span>.
          {' '}Group calls run for {callLength} and must finish by {formatClock(dayWindow.latestStart)}.
          {isThursday && ' Church prayers start at 9:00 PM on Thursdays.'}
        </p>
        <p className="mt-2 text-[15px] leading-[1.55] text-gray-600">{problem} Please pick an earlier time or another day.</p>
        <p className="mt-2 text-[15px] leading-[1.55] text-gray-600">We’re sorry for the change. The app let you pick this time when it shouldn’t have, and that was our mistake.</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button type="button" onClick={() => { close(); navigate('/support/participants'); }} className={PRIMARY}>Change the time</button>
          <button type="button" onClick={close} className={SECONDARY}>Later</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MeetingTimeFixPrompt;
