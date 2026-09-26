import { useEffect, useState } from 'react';
import { meetingAttendanceApi } from '../services/api';

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
        .catch(() => { if (!cancelled) setLive(null); });
    };
    load();
    const interval = window.setInterval(load, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
    };
  }, [groupId]);

  return live;
};
