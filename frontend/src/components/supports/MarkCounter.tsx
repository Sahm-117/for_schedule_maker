import React from 'react';

// "N marked · M not marked ›" on the training marking screens (and "shared /
// haven't shared" on training results). Tap the second chip to list just those
// people; tap it again (or the first chip) for everyone. When onToggleDone is
// given, the first chip filters too: tap it to list just the done people.
const Chevron = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
);

const MarkCounter: React.FC<{
  marked: number;
  notMarked: number;
  onlyUnmarked: boolean;
  onToggle: (only: boolean) => void;
  onlyDone?: boolean;
  onToggleDone?: (only: boolean) => void;
  doneLabel?: string;
  todoLabel?: string;
}> = ({ marked, notMarked, onlyUnmarked, onToggle, onlyDone = false, onToggleDone, doneLabel = 'marked', todoLabel = 'not marked' }) => (
  <div className="flex flex-wrap gap-2">
    {onToggleDone ? (
      <button type="button" onClick={() => onToggleDone(!onlyDone)} aria-pressed={onlyDone} className={`inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-bold bg-emerald-100/80 text-emerald-700 ${onlyDone ? 'ring-2 ring-emerald-300' : ''}`}>
        {marked} {doneLabel}
        <Chevron />
      </button>
    ) : (
      <button type="button" onClick={() => onToggle(false)} aria-pressed={!onlyUnmarked} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!onlyUnmarked ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{marked} {doneLabel}</button>
    )}
    <button type="button" onClick={() => onToggle(!onlyUnmarked)} aria-pressed={onlyUnmarked} className={`inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-bold ${onlyUnmarked ? 'bg-amber-100/80 text-amber-700 ring-2 ring-amber-300' : 'bg-amber-100/80 text-amber-700'}`}>
      {notMarked} {todoLabel}
      <Chevron />
    </button>
  </div>
);

export default MarkCounter;
