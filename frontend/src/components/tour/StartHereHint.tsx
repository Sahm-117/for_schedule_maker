import React, { useEffect } from 'react';
import { useTourState } from '../../context/TourContext';

// A one-off "Start here" hint that replaces the Welcome and auto-tour for someone new: it shows until "Got it"
// (saved per account with the tours), across launches, and stays hidden if that saved progress cannot be read.
// People who were already using the app (they had the Welcome) never see it. The launch where it first appears
// counts as a welcome launch, so the Get the app sheet waits for the next one.
const StartHereHint: React.FC<{ hintKey: string; children: React.ReactNode; className?: string }> = ({ hintKey, children, className = '' }) => {
  const { newcomerHint, hintFirstShown, dismissHint } = useTourState();
  const due = newcomerHint(hintKey);
  useEffect(() => { if (due) hintFirstShown(hintKey); }, [due, hintKey, hintFirstShown]);
  if (!due) return null;
  return (
    <div data-wt="start-here" className={`flex items-start gap-3 rounded-xl bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-900 ${className}`}>
      <span className="min-w-0 flex-1"><span className="font-semibold">Start here.</span> {children}</span>
      <button type="button" onClick={() => dismissHint(hintKey)} className="flex-none text-xs font-semibold text-orange-700">Got it</button>
    </div>
  );
};

export default StartHereHint;
