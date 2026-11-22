import React, { useState } from 'react';
import { formatLagosMoment, type MeetingWindowState } from '../../utils/meetingWindow';

// Shown in place of a meeting's recording steps when it cannot be recorded right now: no meeting time
// yet, too early, or closed. See utils/meetingWindow.

const MeetingWindowNotice: React.FC<{
  window: MeetingWindowState;
  /** "Set meeting time" for whoever can set it; leave out when they cannot. */
  onSetTime?: () => void;
  /** For whoever runs the meeting: open a missed, unreported meeting for 48 hours so they can report it. */
  onOpenMissed?: () => Promise<void>;
}> = ({ window: state, onSetTime, onOpenMissed }) => {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  if (state.state === 'open') return null;
  const canOpenMissed = state.state === 'after' && !!onOpenMissed;
  const openMissed = async () => {
    if (!onOpenMissed || opening) return;
    setOpening(true);
    setError('');
    try { await onOpenMissed(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the meeting.'); } finally { setOpening(false); }
  };
  const { title, body } = canOpenMissed
    ? { title: 'This meeting was not reported', body: 'If you missed it, or held it but did not report it, open it to record attendance and the report. It stays open for 48 hours.' }
    : state.state === 'not_set'
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
        {canOpenMissed && (
          <button type="button" onClick={() => void openMissed()} disabled={opening} className="mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-white active:scale-95 disabled:opacity-60">
            {opening ? 'Opening…' : 'Report this meeting now'}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      </div>
    </section>
  );
};

export default MeetingWindowNotice;
