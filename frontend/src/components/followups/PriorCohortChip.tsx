import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Cohort, FollowUpContact } from '../../types';

interface PriorCohortChipProps {
  contact: FollowUpContact;
  cohorts: Cohort[];
  activeCohortId?: string | null;
  /** Admins only. Without it the chip is a plain label. */
  onChange?: (patch: Record<string, unknown>) => void;
  className?: string;
}

const CHIP = 'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold';
const PRIOR_TONE = 'bg-neutral-100 text-neutral-600';
const ATTENDED_TONE = 'bg-teal-50 text-teal-700';

const monthRange = (cohort: Cohort) => {
  const fmt = (value: string, year: boolean) =>
    new Intl.DateTimeFormat('en-GB', year ? { month: 'short', year: 'numeric' } : { month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
  if (cohort.startDate && cohort.endDate) return `${fmt(cohort.startDate, false)}–${fmt(cohort.endDate, true)}`;
  if (cohort.startDate) return fmt(cohort.startDate, true);
  return '';
};

/**
 * Cohorts someone from a prior cohort could have attended: every cohort except
 * the active one that has finished or started before it. Newest first.
 */
export const pastCohorts = (cohorts: Cohort[], activeCohortId?: string | null): Cohort[] => {
  const active = cohorts.find((c) => c.id === activeCohortId);
  return cohorts
    .filter((c) => c.id !== activeCohortId && (
      c.status === 'COMPLETED' || c.status === 'ARCHIVED' ||
      (!!c.startDate && !!active?.startDate && c.startDate < active.startDate)
    ))
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
};

/**
 * The "From prior cohort" chip. For admins it opens a list of past cohorts:
 * picking one files the contact under it as Attended. Once Attended, the chip
 * reads "Attended <cohort>" and lets the admin change the cohort or undo it.
 */
const PriorCohortChip: React.FC<PriorCohortChipProps> = ({ contact, cohorts, activeCohortId, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const attended = contact.registrationStatus === 'ATTENDED';
  const options = useMemo(() => pastCohorts(cohorts, activeCohortId), [cohorts, activeCohortId]);
  const attendedName = attended ? cohorts.find((c) => c.id === contact.cohortId)?.name : null;

  const label = attended ? `Attended ${attendedName || 'a prior cohort'}` : 'From prior cohort';
  const tone = attended ? ATTENDED_TONE : PRIOR_TONE;
  const title = attended ? 'Already attended this cohort. Filed under it and closed.' : 'Not tied to any cohort yet. Joins this cohort once assigned.';

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 256;
      const menuHeight = Math.min(360, (options.length + (attended ? 1 : 0)) * 40 + 96);
      let top = rect.bottom + 6;
      let left = rect.left;
      if (top + menuHeight > window.innerHeight) top = Math.max(12, rect.top - menuHeight - 6);
      if (left + width > window.innerWidth) left = Math.max(12, window.innerWidth - width - 12);
      setMenuStyle({ position: 'fixed', top, left, width, zIndex: 110 });
    };
    updatePosition();
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length, attended]);

  if (!onChange) {
    return <span title={title} className={`${CHIP} ${tone} ${className}`}>{label}</span>;
  }

  const pick = (cohortId: string) => {
    setOpen(false);
    if (attended) {
      if (cohortId !== contact.cohortId) onChange({ cohortId });
      return;
    }
    onChange({ cohortId, registrationStatus: 'ATTENDED', nextAction: 'CLOSE', archivedAt: new Date().toISOString() });
  };

  const undo = () => {
    setOpen(false);
    onChange({ cohortId: null, registrationStatus: 'NOT_REGISTERED', nextAction: 'SEND_MESSAGE', archivedAt: null });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        onClick={() => setOpen((prev) => !prev)}
        className={`${CHIP} ${tone} transition hover:brightness-95 ${open ? 'ring-2 ring-orange-300' : ''} ${className}`}
      >
        {label}
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={menuStyle} className="max-h-[360px] overflow-y-auto rounded-[20px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Which cohort did they attend?</p>
          {options.length === 0 && <p className="px-2.5 py-2 text-sm text-gray-500">No past cohorts yet.</p>}
          {options.map((cohort) => {
            const current = attended && cohort.id === contact.cohortId;
            const range = monthRange(cohort);
            return (
              <button
                key={cohort.id}
                type="button"
                onClick={() => pick(cohort.id)}
                className={`block w-full rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-orange-50 ${current ? 'bg-orange-50 font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                {cohort.name}
                {range && <span className="font-normal text-gray-400"> · {range}</span>}
              </button>
            );
          })}
          {attended ? (
            <button
              type="button"
              onClick={undo}
              className="mt-1 block w-full rounded-xl border-t border-gray-100 px-2.5 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              Undo: back to From prior cohort
            </button>
          ) : (
            <p className="mt-1 border-t border-gray-100 px-2.5 pb-1 pt-2 text-[11px] text-gray-500">Marks them <b>Attended</b> and files them under that cohort.</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default PriorCohortChip;
