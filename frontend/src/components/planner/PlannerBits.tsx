import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PHASE_LABEL,
  formatPlannerDate,
  formatPlannerRange,
  weeksLabel,
  type PlannerCohort,
  type PlannerSegment,
  type PlannerWeek,
  type WeekKind,
} from '../../utils/planner';

/** Bar colours: one calm family, with red kept for "no FOF". */
export const KIND_BAR: Record<WeekKind, string> = {
  rest: 'bg-gray-200 text-gray-600',
  mobilisation: 'bg-amber-300 text-amber-900',
  classes: 'bg-orange-400 text-white',
  spare: 'bg-teal-300 text-teal-900',
  gap: 'border border-dashed border-red-300 bg-red-50 text-red-500',
};

/** White diagonal stripes over a bar: the weeks added by a push-back. */
export const EXTENSION_STRIPES = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 7px)',
};

export const KIND_NAME: Record<WeekKind, string> = { ...PHASE_LABEL, gap: 'No FOF' };

/** The lines a tooltip shows for one bar segment. */
export const segmentTip = (cohort: PlannerCohort, seg: PlannerSegment, today: string): string[] => {
  const range = formatPlannerRange(seg.start, seg.end, today);
  if (seg.kind === 'gap') {
    return [
      `${seg.event?.name ?? 'No class'} · ${weeksLabel(seg.weeks)} paused`,
      `${cohort.name} pauses, then carries on`,
      range,
    ];
  }
  if (seg.kind === 'classes') {
    const total = cohort.classDates.length;
    return [
      `${cohort.name} · ${weeksLabel(total)} of classes`,
      seg.firstClass === seg.lastClass ? `Class ${seg.firstClass} of ${total}` : `Classes ${seg.firstClass}–${seg.lastClass} of ${total} (${weeksLabel(seg.weeks)})`,
      seg.extension ? `${range} · added by a push-back` : range,
    ];
  }
  return [`${cohort.name} · ${KIND_NAME[seg.kind]}`, `${weeksLabel(seg.weeks)} · ${range}`];
};

/** The lines a tooltip shows for one week cell. */
export const weekTip = (cohort: PlannerCohort, week: PlannerWeek, today: string): string[] => {
  const when = `${formatPlannerDate(week.start, false, today)} – ${formatPlannerDate(week.end, false, today)}`;
  if (week.kind === 'gap') return [`${week.event?.name ?? 'No class'}`, `No FOF this week · ${when}`];
  if (week.kind === 'classes') {
    return [`${cohort.name} · Class ${week.classNumber} of ${cohort.classDates.length}`, week.extension ? `${when} · added by a push-back` : `Sunday ${formatPlannerDate(week.end, false, today)}`];
  }
  return [`${cohort.name} · ${KIND_NAME[week.kind]}`, when];
};

interface TipState { lines: string[]; x: number; y: number }

/**
 * Hover (desktop), focus (keyboard) or tap (phone) shows a small dark label
 * above the element. Returns props to spread on the element, and the layer
 * to render once on the page.
 */
export const useTip = () => {
  const [tip, setTip] = useState<TipState | null>(null);

  const bind = useCallback((lines: string[]) => {
    const show = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      setTip({ lines, x: Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110), y: rect.top });
    };
    return {
      'data-tip': true,
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
      onMouseLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: () => setTip(null),
      onClick: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
    };
  }, []);

  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-tip]')) hide();
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  const layer = tip
    ? createPortal(
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[200] max-w-[220px] -translate-x-1/2 -translate-y-full rounded-xl bg-gray-900/95 px-3 py-2 text-center text-xs leading-snug text-white shadow-lg"
        style={{ left: tip.x, top: tip.y - 8 }}
      >
        {tip.lines.map((line, i) => (
          <p key={i} className={i === 0 ? 'font-semibold' : 'text-gray-300'}>{line}</p>
        ))}
      </div>,
      document.body,
    )
    : null;

  return { bind, layer };
};
