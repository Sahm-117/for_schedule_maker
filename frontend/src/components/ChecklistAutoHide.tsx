import React, { useCallback, useEffect, useRef, useState } from 'react';

// Ticked checklist items stay visible for a short countdown, then tuck away.
// "Show completed" brings them back.

const HIDE_AFTER_SECONDS = 5;

export const useChecklistAutoHide = () => {
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const timers = useRef<Record<string, number>>({});

  const cancel = useCallback((id: string) => {
    if (timers.current[id]) window.clearInterval(timers.current[id]);
    delete timers.current[id];
    setCountdowns((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const start = useCallback((id: string) => {
    if (timers.current[id]) window.clearInterval(timers.current[id]);
    setCountdowns((prev) => ({ ...prev, [id]: HIDE_AFTER_SECONDS }));
    timers.current[id] = window.setInterval(() => {
      setCountdowns((prev) => {
        const left = (prev[id] ?? 0) - 1;
        if (left <= 0) {
          window.clearInterval(timers.current[id]);
          delete timers.current[id];
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: left };
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
  }, []);

  const isVisible = useCallback(
    (item: { id: string; done: boolean }) => !item.done || showCompleted || item.id in countdowns,
    [countdowns, showCompleted],
  );

  return { countdowns, showCompleted, setShowCompleted, start, cancel, isVisible };
};

// Small radial ring that drains over the countdown, with the seconds left in the middle.
export const CountdownRing: React.FC<{ seconds: number }> = ({ seconds }) => {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative ml-auto grid h-6 w-6 flex-none place-items-center text-[10px] font-bold text-gray-400" aria-label={`Hiding in ${seconds}`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="#eef0f4" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="var(--color-primary, #f97316)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: circumference * (1 - seconds / HIDE_AFTER_SECONDS), transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span className="relative">{seconds}</span>
    </span>
  );
};
