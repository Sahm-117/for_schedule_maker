import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppSetup, appSetupDone } from '../../hooks/useAppSetup';
import AppSetupSteps from './AppSetupSteps';

// The two steps in a bottom sheet. Used when the app asks on launch, and from the
// "See how to install" / "Show me how" buttons on the Profile page.

interface Props {
  /** Turns notifications on (from useParticipantPush). */
  enable: () => Promise<void>;
  onClose: () => void;
  closeLabel?: string;
}

const AppSetupSheet: React.FC<Props> = ({ enable, onClose, closeLabel = 'Maybe later' }) => {
  const setup = useAppSetup();
  const [enabling, setEnabling] = useState(false);
  const done = appSetupDone(setup);

  const enableNotifications = async () => {
    setEnabling(true);
    try { await enable(); } finally { setEnabling(false); setup.refresh(); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Get the app">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-5 pb-7 pt-6 shadow-[0_-8px_40px_rgba(15,23,42,0.2)] sm:rounded-[28px]">
        <h2 className="text-xl font-bold text-gray-900">{done ? 'You are all set' : 'Get the app'}</h2>
        <p className="mb-4 mt-1 text-[13.5px] leading-relaxed text-gray-600">
          {done
            ? 'FOF Ops is on your Home Screen and notifications are on.'
            : 'Two quick steps so you never miss a class, a group call or a message from your support.'}
        </p>
        <AppSetupSteps setup={setup} enableNotifications={enableNotifications} enabling={enabling} />
        <button type="button" onClick={onClose} className={`mt-4 min-h-[48px] w-full rounded-xl text-[14px] font-semibold ${done ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
          {done ? 'Done' : closeLabel}
        </button>
        {!done && <p className="mt-1 text-center text-[11.5px] text-gray-400">We will ask again next time you open the app.</p>}
      </div>
    </div>,
    document.body,
  );
};

export default AppSetupSheet;
