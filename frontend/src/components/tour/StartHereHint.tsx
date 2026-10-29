import React from 'react';
import { useTourState } from '../../context/TourContext';

// A one-off "Start here" hint that replaces the Welcome and auto-tour on someone's first visit: it shows only in the
// launch that was their first visit, until "Got it" (saved per account with the tours), and stays hidden if that
// saved progress cannot be read. People who were already using the app never see it.
const StartHereHint: React.FC<{ hintKey: string; children: React.ReactNode; className?: string }> = ({ hintKey, children, className = '' }) => {
  const { welcomedThisLaunch, hintUnseen, dismissHint } = useTourState();
  if (!welcomedThisLaunch || !hintUnseen(hintKey)) return null;
  return (
    <div data-wt="start-here" className={`flex items-start gap-3 rounded-xl bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-900 ${className}`}>
      <span className="min-w-0 flex-1"><span className="font-semibold">Start here.</span> {children}</span>
      <button type="button" onClick={() => dismissHint(hintKey)} className="flex-none text-xs font-semibold text-orange-700">Got it</button>
    </div>
  );
};

export default StartHereHint;
