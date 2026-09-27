import React from 'react';

// "N marked · M not marked" on the training marking screens.
const MarkCounter: React.FC<{ marked: number; notMarked: number; onlyUnmarked: boolean; onToggle: (only: boolean) => void }> = ({ marked, notMarked, onlyUnmarked, onToggle }) => (
  // Tap "not marked" to list just the people still to mark; tap again (or "marked") for everyone.
  <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => onToggle(false)} aria-pressed={!onlyUnmarked} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!onlyUnmarked ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{marked} marked</button>
    <button type="button" onClick={() => onToggle(!onlyUnmarked)} aria-pressed={onlyUnmarked} className={`rounded-full px-3 py-1.5 text-xs font-bold ${onlyUnmarked ? 'bg-amber-100/80 text-amber-700 ring-2 ring-amber-300' : 'bg-amber-100/80 text-amber-700'}`}>{notMarked} not marked</button>
  </div>
);

export default MarkCounter;
