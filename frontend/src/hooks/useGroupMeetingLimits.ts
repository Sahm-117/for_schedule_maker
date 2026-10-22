import { useEffect, useState } from 'react';
import { settingsApi } from '../services/api';
import { DEFAULT_GROUP_MEETING_LIMITS, type GroupMeetingLimits } from '../utils/groupMeetingLimits';

// The limits on group call times, read once per page load and shared. Until they arrive (or if they cannot be read)
// the original rules apply, so a slow or failed read never leaves the picker empty. Teen groups have their own limits
// (which follow the adult ones until an admin saves teen limits).
const cached: Record<'adult' | 'teen', GroupMeetingLimits | null> = { adult: null, teen: null };
const inflight: Record<'adult' | 'teen', Promise<GroupMeetingLimits> | null> = { adult: null, teen: null };

export const setCachedMeetingLimits = (limits: GroupMeetingLimits, teen = false) => {
  cached[teen ? 'teen' : 'adult'] = limits;
  // Teen limits may be following the adult ones: read them again next time.
  if (!teen) cached.teen = null;
};

const load = (teen: boolean): Promise<GroupMeetingLimits> => {
  const kind = teen ? 'teen' : 'adult';
  if (!inflight[kind]) {
    inflight[kind] = settingsApi.getGroupMeetingLimits(teen)
      .then((l) => { cached[kind] = l; return l; })
      .catch(() => DEFAULT_GROUP_MEETING_LIMITS)
      .finally(() => { inflight[kind] = null; });
  }
  return inflight[kind]!;
};

export const useGroupMeetingLimits = (teen = false): GroupMeetingLimits => {
  const [limits, setLimits] = useState<GroupMeetingLimits>(cached[teen ? 'teen' : 'adult'] ?? DEFAULT_GROUP_MEETING_LIMITS);
  useEffect(() => {
    let cancelled = false;
    void load(teen).then((l) => { if (!cancelled) setLimits(l); });
    return () => { cancelled = true; };
  }, [teen]);
  return limits;
};
