import React from 'react';
import { formatLagosMoment, type MeetingWindowState } from '../../utils/meetingWindow';

// Shown in place of a meeting's recording steps when it cannot be recorded right now: no meeting time
// yet, too early, or closed. See utils/meetingWindow.

const MeetingWindowNotice: React.FC<{
  window: MeetingWindowState;
  /** "Set meeting time" for whoever can set it; leave out when they cannot. */
  onSetTime?: () => void;
}> = ({ window: state, onSetTime }) => {
  if (state.state === 'open') return null;
  const { title, body } = state.state === 'not_set'
    ? { title: 'Set your meeting day and time first', body: 'Attendance, prayer and the report can be recorded once your meeting has a day and time.' }
    : state.state === 'before'
      ? { title: `Opens ${formatLagosMoment(state.opensAt)}`, body: 'You can record the meeting from 10 minutes before it starts until midnight that day.' }
      : { title: 'Recording has closed', body: 'Meetings can be recorded until midnight on the meeting day. Ask an admin if something needs changing.' };
  return (
    <section data-testid="meeting-window-notice" className="flex items-start gap-3 rounded-[18px] border border-[#eef0f4] bg-white p-4 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#f5f5f7] text-gray-500" aria-hidden="true">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="1.8" /><path strokeLinecap="round" strokeWidth="1.8" d="M12 7v5l3 2" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-gray-500">{body}</p>
        {state.state === 'not_set' && onSetTime && (
          <button type="button" onClick={onSetTime} className="mt-2.5 min-h-[36px] rounded-full bg-primary px-4 text-[13px] font-semibold text-white">Set meeting time</button>
        )}
      </div>
    </section>
  );
};

export default MeetingWindowNotice;
