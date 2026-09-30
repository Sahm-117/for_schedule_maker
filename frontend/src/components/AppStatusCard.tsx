import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppSetup } from '../hooks/useAppSetup';
import { usePushNotifications } from '../hooks/usePushNotifications';
import AppSetupSheet from './participantApp/AppSetupSheet';

// Whether this device has the app on the Home Screen and notifications on, for
// supports and admins. Sits above the reminder settings.

const Tick = () => (
  <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-600" aria-label="Done">
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>
  </span>
);

const AppStatusCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { user } = useAuth();
  const setup = useAppSetup();
  const { enable } = usePushNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const canAskHere = setup.installed || setup.device === 'android' || setup.device === 'desktop';
  const turnOn = async () => { await enable(); setup.refresh(); };

  return (
    <section className={`rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)] ${className}`} data-wt="app-status">
      <h3 className="text-base font-bold text-gray-900">The app</h3>
      <div className="mt-2 divide-y divide-gray-100">
        <div className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{setup.installed ? 'On your Home Screen' : setup.installedElsewhere ? 'On your Home Screen already' : 'Not on your Home Screen'}</p>
            <p className="text-xs text-gray-500">
              {setup.installed ? 'You are using the app.' : setup.installedElsewhere ? 'You are in a browser right now. Open FOF Ops from your Home Screen.' : 'You are using this in a browser, so you do not have the app yet.'}
            </p>
          </div>
          {setup.installed || setup.installedElsewhere ? <Tick /> : (
            <button type="button" onClick={() => setOpen(true)} className="flex-none rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">See how to install</button>
          )}
        </div>
        <div className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{setup.notifications === 'granted' ? 'Notifications are on' : 'Notifications are off'}</p>
            <p className="text-xs text-gray-500">
              {setup.notifications === 'granted'
                ? 'You will get schedule changes, approvals and reminders.'
                : setup.notifications === 'denied'
                  ? 'They may have been switched off by accident. Turn them back on to get updates.'
                  : 'Turn them on to get schedule changes, approvals and reminders.'}
            </p>
          </div>
          {setup.notifications === 'granted' ? <Tick /> : (
            <button
              type="button"
              onClick={() => { if (setup.notifications === 'default' && canAskHere) void turnOn(); else setOpen(true); }}
              className="flex-none rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              {setup.notifications === 'default' ? 'Turn on' : 'Show me how'}
            </button>
          )}
        </div>
      </div>
      {open && <AppSetupSheet audience="staff" enable={enable} onClose={() => setOpen(false)} closeLabel="Close" />}
    </section>
  );
};

export default AppStatusCard;
