import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from '../followups/ModalShell';
import { useAuth } from '../../hooks/useAuth';
import type { Participant, ParticipantUpdate, RetakeMatch } from '../../types';

// The "Retaking" chip. Someone is flagged when another cohort has a record on
// the same phone number: "Retaking" when the first name matches too, "Shared
// number" when it doesn't (a family phone, or a typo). Tapping the chip says
// why; a support or admin can then answer "Same person" or "Different person".
// Someone can also be marked as retaking by hand, with a reason, for a cohort
// that isn't in the app.

export type RetakeState = 'retaking' | 'shared' | null;

export const retakeState = (participant: Participant, matches: RetakeMatch[] = []): RetakeState => {
  if (participant.retakeStatus === 'NOT_SAME') return null;
  if (participant.retakeStatus === 'CONFIRMED') return 'retaking';
  if (matches.some((m) => m.sameFirstName)) return 'retaking';
  return matches.length ? 'shared' : null;
};

const TONE: Record<Exclude<RetakeState, null>, string> = {
  retaking: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  shared: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const formatDay = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

interface RetakingChipProps {
  participant: Participant;
  matches?: RetakeMatch[];
  /** Saves the answer. Without it the chip still opens, but read-only. */
  onUpdate?: (patch: ParticipantUpdate) => Promise<void> | void;
  className?: string;
}

const RetakingChip: React.FC<RetakingChipProps> = ({ participant, matches = [], onUpdate, className = '' }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const state = retakeState(participant, matches);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 24);
      const height = popRef.current?.offsetHeight ?? 220;
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 6);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setStyle({ position: 'fixed', top, left, width, zIndex: 120 });
    };
    const close = (event: PointerEvent) => {
      if (popRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  if (!state) return null;

  const answer = async (retakeStatus: Participant['retakeStatus'], clearNote = false) => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate({
        retakeStatus,
        ...(clearNote ? { retakeNote: null } : {}),
        retakeCheckedById: retakeStatus ? user?.id ?? null : null,
        retakeCheckedAt: retakeStatus ? new Date().toISOString() : null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const confirmed = participant.retakeStatus === 'CONFIRMED';
  const label = state === 'retaking' ? 'Retaking' : 'Shared number';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        aria-expanded={open}
        className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1.5 text-[11px] font-semibold ring-1 ring-inset transition hover:brightness-95 ${TONE[state]} ${className}`}
      >
        {label}
        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
      </button>
      {open && createPortal(
        <div ref={popRef} style={style} role="dialog" aria-label={`Why ${participant.fullName} is flagged`} className="rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {state === 'retaking' ? 'Why they’re marked as retaking' : 'Why this is flagged'}
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-gray-700">
            {matches.map((m, i) => (
              <li key={i}>
                Same phone number as <b className="text-gray-900">{m.otherName}</b> in <b className="text-gray-900">{m.otherCohort}</b>.
                {!confirmed && (
                  <span className="text-gray-500">{m.sameFirstName ? ' Same first name, so likely the same person.' : ' A different name, so it may be a shared phone.'}</span>
                )}
              </li>
            ))}
            {participant.retakeNote && (
              <li>Marked as retaking: <b className="text-gray-900">{participant.retakeNote}</b></li>
            )}
            {confirmed && (
              <li className="text-emerald-700">
                {matches.length ? 'Confirmed as the same person' : 'Marked'}{participant.retakeCheckedAt ? ` on ${formatDay(participant.retakeCheckedAt)}` : ''}.
              </li>
            )}
          </ul>
          {onUpdate && (
            confirmed ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void answer(null, true)}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Undo
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void answer('CONFIRMED')}
                  className="rounded-xl bg-emerald-600 px-2.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Same person
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void answer('NOT_SAME')}
                  className="rounded-xl border border-gray-200 px-2.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Different person
                </button>
              </div>
            )
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default RetakingChip;

// "Mark as retaking" from a ⋮ menu, for someone the phone number can't find
// (a cohort from before the app, or a new number).
export const RetakeMarkModal: React.FC<{
  participant: Participant | null;
  onClose: () => void;
  onSave: (note: string) => Promise<void> | void;
}> = ({ participant, onClose, onSave }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(participant?.retakeNote ?? ''); }, [participant]);
  if (!participant) return null;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try { await onSave(note.trim()); onClose(); } finally { setSaving(false); }
  };
  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Mark as retaking"
      subtitle={participant.fullName}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          <button type="submit" form="retake-mark-form" disabled={saving || !note.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    >
      <form id="retake-mark-form" onSubmit={save}>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="retake-note">Why?</label>
        <input
          id="retake-note"
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Was in FOF 8"
          className="mt-1.5 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-2 text-xs text-gray-500">They get a <b>Retaking</b> tag, and tapping it shows this reason.</p>
      </form>
    </ModalShell>
  );
};
