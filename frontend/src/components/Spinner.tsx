import React from 'react';

interface SpinnerProps {
  className?: string;
}

// Shared inline spinner (same shape as the one in SaveStatus). Use this anywhere
// a loading/saving/sending state needs a spinner instead of bare text.
const Spinner: React.FC<SpinnerProps> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default Spinner;
