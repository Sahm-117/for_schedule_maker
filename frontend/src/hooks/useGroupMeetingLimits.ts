import { useEffect, useState } from 'react';
import { settingsApi } from '../services/api';
import { DEFAULT_GROUP_MEETING_LIMITS, type GroupMeetingLimits } from '../utils/groupMeetingLimits';

// The limits on group call times, read once per page load and shared. Until they arrive (or if they cannot be read)
// the original rules apply, so a slow or failed read never leaves the picker empty.
let cached: GroupMeetingLimits | null = null;
let inflight: Promise<GroupMeetingLimits> | null = null;

export const setCachedMeetingLimits = (limits: GroupMeetingLimits) => { cached = limits; };

const load = (): Promise<GroupMeetingLimits> => {
  if (!inflight) inflight = settingsApi.getGroupMeetingLimits().then((l) => { cached = l; return l; }).catch(() => DEFAULT_GROUP_MEETING_LIMITS).finally(() => { inflight = null; });
  return inflight;
};

export const useGroupMeetingLimits = (): GroupMeetingLimits => {
  const [limits, setLimits] = useState<GroupMeetingLimits>(cached ?? DEFAULT_GROUP_MEETING_LIMITS);
  useEffect(() => {
    let cancelled = false;
    void load().then((l) => { if (!cancelled) setLimits(l); });
    return () => { cancelled = true; };
  }, []);
  return limits;
};
