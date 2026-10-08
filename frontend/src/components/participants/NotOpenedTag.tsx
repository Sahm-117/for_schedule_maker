import React from 'react';
import { NOT_OPENED_HINT } from '../../utils/appUse';

/**
 * Small tag for a participant who has signed in but never opened the app from their Home Screen.
 * A phone glyph and two words keep it narrow beside a name; the full explanation is in the tooltip.
 */
const NotOpenedTag: React.FC<{ className?: string; hint?: string }> = ({ className = '', hint = NOT_OPENED_HINT }) => (
  <span
    title={hint}
    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-100 font-semibold text-neutral-600 ${className}`}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
    Not opened
  </span>
);

export default NotOpenedTag;
