import React, { useEffect, useState } from 'react';
import { JOIN_LEAD_MINUTES, isCallJoinable } from '../utils/joinWindow';

interface JoinCallButtonProps {
  href: string;
  /** The meeting's day ("MONDAY"), time ("19:00") and length. Without a day and time the call is always open. */
  day?: string | null;
  time?: string | null;
  durationMins?: number | null;
  /** The meeting is marked live: open whatever the clock says. */
  live?: boolean;
  label?: string;
  /** Style of the open button. When it is waiting the same shape turns grey. */
  className: string;
}

/**
 * "Join the call" that waits for its time: grey until JOIN_LEAD_MINUTES before
 * the meeting, with a line saying so, and opens by itself when the time comes.
 */
const JoinCallButton: React.FC<JoinCallButtonProps> = ({ href, day, time, durationMins, live = false, label = 'Join the call', className }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const scheduled = !!(day && time);
  const open = !scheduled || isCallJoinable(day, time, durationMins, now, live);

  if (open) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{label}</a>;
  }
  const hint = `Opens ${JOIN_LEAD_MINUTES} min before the meeting`;
  return (
    <span className="flex flex-col gap-1.5">
      <span
        role="link"
        aria-disabled="true"
        title={hint}
        className={`${className} !cursor-not-allowed !bg-gray-200 !text-gray-400 !shadow-none active:!scale-100`}
      >
        {label}
      </span>
      <span className="text-center text-xs text-gray-400">{hint}</span>
    </span>
  );
};

export default JoinCallButton;
