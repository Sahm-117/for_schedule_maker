import React, { useState } from 'react';
import { useAppSetup, appSetupNeeded } from '../../hooks/useAppSetup';
import { useParticipantPush } from '../../hooks/useParticipantPush';
import AppSetupSheet from './AppSetupSheet';

// A quiet reminder at the top of Home until the app is on the Home Screen with
// notifications on. It opens the same steps, and never pops up by itself.

const AppSetupBanner: React.FC = () => {
  const setup = useAppSetup();
  const { enable } = useParticipantPush();
  const [open, setOpen] = useState(false);

  if (!appSetupNeeded(setup)) return null;

  const text = !setup.installed && setup.device !== 'desktop'
    ? 'Add FOF Ops to your Home Screen so you never miss a class or group call.'
    : 'Turn on notifications to get your class and group call reminders.';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-[18px] border border-[#ffdeca] bg-[#fff8f3] px-4 py-3 text-left">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-gray-800">{text}</span>
        <span className="flex-none rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Show me</span>
      </button>
      {open && <AppSetupSheet enable={enable} onClose={() => setOpen(false)} closeLabel="Close" />}
    </>
  );
};

export default AppSetupBanner;
