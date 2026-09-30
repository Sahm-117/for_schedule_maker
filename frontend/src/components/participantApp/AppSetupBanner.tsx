import React, { useState } from 'react';
import { useAppSetup, appSetupNeeded } from '../../hooks/useAppSetup';
import AppSetupSheet from './AppSetupSheet';

// A quiet reminder at the top of Home until the app is on the Home Screen with
// notifications on. It opens the same steps, and never pops up by itself.

const AppSetupBanner: React.FC<{ enable: () => Promise<void>; audience?: 'participant' | 'staff'; className?: string }> = ({ enable, audience = 'participant', className = '' }) => {
  const setup = useAppSetup();
  const [open, setOpen] = useState(false);

  if (!appSetupNeeded(setup)) return null;

  const text = setup.installedElsewhere
    ? 'You already have FOF Ops. Open it from your Home Screen to get your reminders.'
    : !setup.installed && setup.device !== 'desktop'
    ? audience === 'staff' ? 'Add FOF Ops to your Home Screen so you never miss a schedule change or approval.' : 'Add FOF Ops to your Home Screen so you never miss a class or group call.'
    : audience === 'staff' ? 'Turn on notifications to get schedule changes, approvals and reminders.' : 'Turn on notifications to get your class and group call reminders.';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`flex w-full items-center gap-3 rounded-[18px] border border-[#ffdeca] bg-[#fff8f3] px-4 py-3 text-left ${className}`}>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-gray-800">{text}</span>
        <span className="flex-none rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Show me</span>
      </button>
      {open && <AppSetupSheet audience={audience} enable={enable} onClose={() => setOpen(false)} closeLabel="Close" />}
    </>
  );
};

export default AppSetupBanner;
