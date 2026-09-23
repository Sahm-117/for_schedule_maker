import React, { useEffect, useState } from 'react';
import type { ParticipantHome } from '../../types';

// Shown on Home and on the My Journey Attendance tab while the Sunday
// register is open and this participant hasn't been marked yet. The push
// notification is the real alert; this is just a live nudge while it's open.

const countdownLabel = (closesAt: string, now: number) => {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Closing…';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const AttendanceCountdownCard: React.FC<{ openWindow: ParticipantHome['openWindow'] }> = ({ openWindow }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!openWindow) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openWindow]);

  if (!openWindow || openWindow.myStatus) return null;

  return (
    <section className="rounded-[18px] border border-[#bae0fb] bg-[#eef6fd] px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#3c6da3]">Attendance is open</p>
      <p className="mt-1 text-[15px] font-bold text-gray-900">Attendance closes in {countdownLabel(openWindow.closesAt, now)}</p>
      <p className="mt-1 text-[13px] text-gray-500">Let your support know you&apos;re here.</p>
    </section>
  );
};

export default AttendanceCountdownCard;
