import React from 'react';
import PracticeChecklist from './PracticeChecklist';
import { PRACTICE_ROLE_LABEL, peerSteps } from '../../constants/practiceScenarios';
import type { PracticePeerActive } from '../../types';

// The shared checklist for a walkthrough: my steps to tick, and my partner's
// steps shown as they get done.
const PracticeTogether: React.FC<{
  peer: PracticePeerActive;
  onChange: (key: string, done: boolean, stuck: boolean) => void;
  onNavigate?: () => void;
}> = ({ peer, onChange, onNavigate }) => {
  const mine = peerSteps(peer.myRole, peer.partnerRole);
  const theirs = peerSteps(peer.partnerRole, peer.myRole);
  const partnerDone = new Set(peer.partnerProgress.filter((item) => item.doneAt).map((item) => item.key));
  const first = peer.partnerName.split(' ')[0];
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Your steps · {PRACTICE_ROLE_LABEL[peer.myRole]}</p>
      <PracticeChecklist scenarios={mine} items={peer.myProgress} onChange={onChange} onNavigate={onNavigate} />
      <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-500">{first}’s steps · {PRACTICE_ROLE_LABEL[peer.partnerRole]}</p>
      <ul className="divide-y divide-gray-100">
        {theirs.map((step) => {
          const done = partnerDone.has(step.key);
          return (
            <li key={step.key} className="flex items-start gap-3 py-2.5">
              <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 text-transparent'}`}>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </span>
              <div className="min-w-0">
                <p className={`text-[13.5px] font-semibold leading-snug ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{step.title}</p>
                <p className="text-[11.5px] text-gray-400">{done ? `Done by ${first}` : `Waiting for ${first}`}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PracticeTogether;
