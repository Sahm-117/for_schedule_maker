import React from 'react';

// Has this participant chosen their own password (the real sign-in, "access confirmed")?
// null means it has not loaded (or could not), and then nothing is shown rather than a guess.
const AccessChip: React.FC<{ confirmed: boolean | null | undefined; className?: string }> = ({ confirmed, className = '' }) => {
  if (confirmed === null || confirmed === undefined) return null;
  return confirmed ? (
    <span className={`inline-flex flex-none items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ${className}`} title="They have signed in and chosen their own password.">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" /></svg>
      Access confirmed
    </span>
  ) : (
    <span className={`inline-flex flex-none items-center rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ${className}`} title="They have not signed in and chosen a password yet.">
      Not signed in yet
    </span>
  );
};

export default AccessChip;
