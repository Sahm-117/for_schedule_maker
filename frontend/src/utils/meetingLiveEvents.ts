// "Meeting is on now" is polled (every minute, or on focus), so after an
// action that starts or ends a group meeting on this device we tell every
// useGroupMeetingLive instance to re-check straight away instead of lagging.
export const GROUP_MEETING_CHANGED_EVENT = 'fof:group-meeting-changed';

export const notifyGroupMeetingChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GROUP_MEETING_CHANGED_EVENT));
};
