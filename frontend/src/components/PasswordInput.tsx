import React, { useState } from 'react';

// A password box with a show/hide eye, so every password field lets people check
// what they typed. Same eye as ParticipantWelcomePage.

const EYE = 'M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12Z';
const EYE_OFF = 'M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a11.8 11.8 0 0 1 3.06-4.44M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-1.67 2.68M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22';

const PasswordInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>> = ({ className = '', ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 grid -translate-y-1/2 place-items-center p-1.5 text-gray-500"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={visible ? EYE_OFF : EYE} />
          {!visible && <circle cx="12" cy="12" r="3" strokeWidth="1.8" />}
        </svg>
      </button>
    </div>
  );
};

export default PasswordInput;
