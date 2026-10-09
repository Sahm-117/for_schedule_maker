import React, { useState } from 'react';
import LinkText from '../LinkText';
import { shortMoment } from '../../utils/participantApp';
import type { FaithProjectVersion } from '../../types';

// Every saved version of a faith project, newest first, in an accordion. The same list is shown to the
// participant ("You"), their support and the admin. A version saved by staff carries that person's name.
const FaithProjectHistory: React.FC<{
  versions: FaithProjectVersion[];
  /** What to call the participant on each version: "You" for the participant, their first name for staff. */
  participantLabel: string;
  className?: string;
}> = ({ versions, participantLabel, className = '' }) => {
  const [open, setOpen] = useState(false);
  const hint = versions.length === 0 ? 'None yet' : `${versions.length} ${versions.length === 1 ? 'version' : 'versions'}`;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-[48px] w-full items-center gap-2 text-left">
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-gray-900">Edit history</span>
        <span className="flex-none whitespace-nowrap text-[14px] text-gray-400">{hint}</span>
        <svg className={`h-4 w-4 flex-none text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
        </svg>
      </button>
      {open && (
        versions.length === 0 ? (
          <p className="pb-3 text-[14px] text-gray-500">Nothing has been saved yet.</p>
        ) : (
          <ol className="space-y-2 pb-3">
            {versions.map((version, index) => (
              <li key={version.id} className={`rounded-2xl p-4 ${index === 0 ? 'bg-[#fff6ef]' : 'bg-[#f5f5f7]'}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13.5px] font-semibold text-gray-900">{version.savedByName || participantLabel}</span>
                  {index === 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-primary">Current</span>}
                  <span className="ml-auto text-[12px] text-gray-400">{shortMoment(version.savedAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700"><LinkText text={version.body} /></p>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
};

export default FaithProjectHistory;
