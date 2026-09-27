import React from 'react';
import { createPortal } from 'react-dom';
import type { HubJob } from '../../types';
import { HUB_JOB_INFO } from './hubJobs';

// "You're the Recap Lead" welcome for a hub job. Shown once when the app opens
// after someone is given a job (AppShell), and again whenever they tap their
// own label in My Hub. "See how it works" opens that role's visual guide.
const HubRoleIntroModal: React.FC<{ job: HubJob; onGotIt: () => void; onSeeGuide: () => void }> = ({ job, onGotIt, onSeeGuide }) =>
  createPortal(
    <div className="fixed inset-0 z-[120] flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
        <h3 className="text-lg font-semibold text-gray-900">You're the {HUB_JOB_INFO[job].label}</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{HUB_JOB_INFO[job].introBody}</p>
        <button
          type="button"
          onClick={onGotIt}
          className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-95"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={onSeeGuide}
          className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-primary/10"
        >
          See how it works
        </button>
      </div>
    </div>,
    document.body
  );

export default HubRoleIntroModal;
