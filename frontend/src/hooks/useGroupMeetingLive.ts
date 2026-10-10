import { useEffect, useState } from 'react';
import { meetingAttendanceApi } from '../services/api';
import { startPolling } from './usePolling';
import { GROUP_MEETING_CHANGED_EVENT } from '../utils/meetingLiveEvents';

// "Your group meeting is on now" — a support's own group, and a participant's
// group (via participant_home's groupMeetingLive, read elsewhere). Support
// side has no realtime for this (MeetingAttendance/GroupPrayerStatus are
// staff-only tables computed client-side, see meetingAttendanceApi.getLiveForGroup),
// so this refreshes on an interval and whenever the tab regains focus.
export const useGroupMeetingLive = (groupId: string | null | undefined) => {
  const [live, setLive] = useState<{ weekId: number; startedAt: string } | null>(null);

  useEffect(() => {
    if (!groupId) { setLive(null); return undefined; }
    let cancelled = false;
    const load = () => {
      meetingAttendanceApi.getLiveForGroup(groupId)
        .then((result) => { if (!cancelled) setLive(result); })
        // A failed check (busy server, bad signal) keeps what was last known rather than hiding a meeting that is on.
        .catch(() => { /* keep the last value */ });
    };
    load();
    const stopPolling = startPolling(load, 60000);
    // Coming back to the tab refreshes (startPolling catches up when overdue); a focus event
    // alone, without a hidden tab, still counts. The two can fire together, so refresh once.
    let lastFocusLoad = 0;
    const onFocus = () => {
      if (Date.now() - lastFocusLoad < 5000) return;
      lastFocusLoad = Date.now();
      load();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(GROUP_MEETING_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(GROUP_MEETING_CHANGED_EVENT, load);
    };
  }, [groupId]);

  return live;
};
