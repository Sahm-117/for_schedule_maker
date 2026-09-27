import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupportSession } from '../../types';
import { trainingMarkAttended } from '../../utils/programmeRules';
import LearnedAnswers from './LearnedAnswers';

// Pre-cohort training pill on the admin Supports page: red 0/n (none attended),
// amber when some, green n/n when all. Tapping it lists each training with
// whether they attended and what they wrote they learned.
const TONE = {
  none: 'bg-red-100/80 text-red-700',
  some: 'bg-amber-100/80 text-amber-700',
  all: 'bg-emerald-100/80 text-emerald-700',
} as const;

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const TrainingPill: React.FC<{
  name: string;
  userId: string;
  sessions: SupportSession[];
  attendance: Array<{ sessionId: string; userId: string; status: string; learned?: string | null; willApply?: string | null }>;
}> = ({ name, userId, sessions, attendance }) => {
  const [open, setOpen] = useState(false);
  if (sessions.length === 0) return null;
  const rows = [...sessions]
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((session) => ({ session, mark: attendance.find((a) => a.sessionId === session.id && a.userId === userId) }));
  const attended = rows.filter((r) => r.mark && trainingMarkAttended(r.mark.status)).length;
  const tone = attended === 0 ? 'none' : attended >= rows.length ? 'all' : 'some';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[tone]}`}
        aria-label={`Trainings ${attended} of ${rows.length}. See which ones.`}
      >
        Trainings {attended}/{rows.length}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div className="mb-20 w-[92vw] max-w-[400px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Pre-cohort trainings</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{name} · {attended} of {rows.length}</p>
            <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain">
              {rows.map(({ session, mark }) => {
                const went = !!mark && trainingMarkAttended(mark.status);
                return (
                  <li key={session.id} className="rounded-2xl bg-gray-50 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{session.title}</span>
                        <span className="text-xs text-gray-500">{dateLabel(session.sessionDate)}</span>
                      </span>
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${!mark ? 'bg-neutral-100 text-neutral-600' : went ? 'bg-emerald-100/80 text-emerald-700' : 'bg-red-100/80 text-red-700'}`}>
                        {!mark ? 'Not marked' : went ? (mark.status === 'LATE' ? '✓ Late' : mark.status === 'EXCUSED' ? '✓ Excused' : '✓ Attended') : '✗ Missed'}
                      </span>
                    </div>
                    {went && (
                      mark?.learned
                        ? <LearnedAnswers learned={mark.learned} willApply={mark.willApply} />
                        : session.type === 'PRE_COHORT_TRAINING' && mark?.status !== 'EXCUSED' && <p className="mt-1.5 text-xs text-gray-400">Hasn't shared what they learned yet.</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setOpen(false)} className="mt-4 w-full rounded-2xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700">Close</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TrainingPill;
