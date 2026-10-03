import React, { useState } from 'react';
import type { AppSetup, DeviceKind } from '../../hooks/useAppSetup';
import Spinner from '../Spinner';

// Two steps, with the instructions for the person's own phone: add FOF Ops to the
// Home Screen, then turn notifications on. On iPhone, notifications only work from
// the Home Screen app, so step 2 waits for step 1 there.

const APP = 'FOF Ops';

const ShareIcon = () => (
  <svg className="inline h-[18px] w-[18px] align-[-3px] text-sky-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
const PlusSquareIcon = () => (
  <svg className="inline h-[18px] w-[18px] align-[-3px] text-gray-700" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path strokeLinecap="round" d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const DotsIcon = () => (
  <svg className="inline h-[18px] w-[18px] align-[-3px] text-gray-700" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
  </svg>
);
const Tick = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>
);

const Bubble: React.FC<{ n: number; done: boolean }> = ({ n, done }) => (
  <span className={`grid h-8 w-8 flex-none place-items-center rounded-full text-sm font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-primary text-white'}`}>
    {done ? <Tick /> : n}
  </span>
);

const Line: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-2.5 text-[14px] leading-snug text-gray-700">
    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600">{n}</span>
    <span className="min-w-0 flex-1">{children}</span>
  </li>
);

const DEVICE_LABEL: Record<'iphone' | 'android', string> = { iphone: 'iPhone', android: 'Android' };

interface Props {
  setup: AppSetup;
  /** Changes the wording for staff; defaults to a participant. */
  audience?: 'participant' | 'staff';
  /** Asks the browser for notification permission and saves the subscription. */
  enableNotifications: () => Promise<void>;
  enabling: boolean;
}

const AppSetupSteps: React.FC<Props> = ({ setup, audience = 'participant', enableNotifications, enabling }) => {
  const detected: DeviceKind = setup.device;
  const [override, setOverride] = useState<'iphone' | 'android' | null>(null);
  const [copied, setCopied] = useState(false);
  const shown: 'iphone' | 'android' | 'desktop' = override ?? (detected === 'android' ? 'android' : detected === 'desktop' ? 'desktop' : 'iphone');
  // "Open this in Safari" only applies when we know they're on an iPhone in another browser.
  const inAppBrowser = !override && detected === 'ios-inapp';
  const iphone = shown === 'iphone';

  // "You already have the app" is a best guess (it can be another phone), so the steps stay one tap away.
  const [stepsAnyway, setStepsAnyway] = useState(false);
  const { installed, notifications } = setup;
  const installedElsewhere = setup.installedElsewhere && !stepsAnyway;
  const notifLocked = iphone && !installed && !override;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${audience === 'staff' ? '/' : '/me'}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* copy blocked: they can still open Safari themselves */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-[12.5px] font-semibold" role="group" aria-label="Which phone do you have?">
        {(['iphone', 'android'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={shown === kind}
            onClick={() => setOverride(kind)}
            className={`min-h-[36px] flex-1 rounded-lg px-3 ${shown === kind ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            {DEVICE_LABEL[kind]}
          </button>
        ))}
      </div>

      <section className={`rounded-2xl border p-4 ${installed ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-3">
          <Bubble n={1} done={installed} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900">Add {APP} to your Home Screen</h3>
            {installed && <p className="text-[12.5px] text-emerald-700">Done. You are using the app.</p>}
          </div>
        </div>

        {!installed && installedElsewhere && (
          <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2.5 text-[13.5px] leading-snug text-sky-900">
            <p className="font-semibold">You already have the app on this phone.</p>
            <p className="mt-0.5">Close this page and open <b>{APP}</b> from your Home Screen. You do not need to add it again.</p>
            <button type="button" onClick={() => setStepsAnyway(true)} className="mt-2 text-[13px] font-semibold text-sky-700 underline underline-offset-2">It is not on this phone. Show me the steps.</button>
          </div>
        )}

        {!installed && !installedElsewhere && (
          <div className="mt-3">
            {iphone ? (
              <>
                {inAppBrowser && (
                  <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-900">
                    <p className="font-semibold">You are inside another app.</p>
                    <p className="mt-0.5">Apps like WhatsApp can&apos;t add to the Home Screen. Copy this link, open it in Safari (or Chrome), then follow the steps below.</p>
                    <button type="button" onClick={() => { void copyLink(); }} className="mt-2 min-h-[40px] rounded-lg bg-amber-600 px-3.5 text-[13px] font-semibold text-white">
                      {copied ? 'Link copied' : 'Copy link'}
                    </button>
                  </div>
                )}
                <ol className="space-y-2.5">
                  <Line n={1}>Tap the <b>Share</b> button <ShareIcon />. It is at the bottom of Safari, or next to the address bar in Chrome and other browsers.</Line>
                  <Line n={2}>Scroll down and tap <b>Add to Home Screen</b> <PlusSquareIcon />.</Line>
                  <Line n={3}>Tap <b>Add</b> at the top right.</Line>
                  <Line n={4}>Close your browser. Open <b>{APP}</b> from your Home Screen and sign in with the password you set.</Line>
                </ol>
              </>
            ) : shown === 'android' ? (
              setup.canInstallNatively ? (
                <>
                  <p className="text-[14px] leading-snug text-gray-700">Tap the button. Your phone will ask you to confirm.</p>
                  <button type="button" onClick={() => { void setup.install(); }} disabled={setup.isInstalling} className="mt-3 min-h-[48px] w-full rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-60">
                    {setup.isInstalling ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-4 w-4" />Opening…</span>) : 'Install the app'}
                  </button>
                </>
              ) : (
                <ol className="space-y-2.5">
                  <Line n={1}>Open this page in <b>Chrome</b>, then tap the menu <DotsIcon /> at the top right.</Line>
                  <Line n={2}>Tap <b>Install app</b> or <b>Add to Home screen</b>.</Line>
                  <Line n={3}>Tap <b>Install</b>, then open <b>{APP}</b> from your Home Screen.</Line>
                </ol>
              )
            ) : (
              <p className="text-[14px] leading-snug text-gray-700">
                For reminders and announcements, open this on your phone and add it to your Home Screen. Pick your phone above to see how.
              </p>
            )}
          </div>
        )}
      </section>

      <section className={`rounded-2xl border p-4 ${notifications === 'granted' ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} ${notifLocked ? 'opacity-70' : ''}`}>
        <div className="flex items-center gap-3">
          <Bubble n={2} done={notifications === 'granted'} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900">Turn on notifications</h3>
            {notifications === 'granted' && <p className="text-[12.5px] text-emerald-700">Done. You will get your reminders.</p>}
          </div>
        </div>

        {notifications !== 'granted' && (
          <div className="mt-3">
            {installedElsewhere ? (
              <p className="text-[14px] leading-snug text-gray-600">Turn these on inside the app. Open <b>{APP}</b> from your Home Screen and tap <b>Turn on notifications</b> there.</p>
            ) : notifLocked ? (
              <p className="text-[14px] leading-snug text-gray-600">Do step 1 first. On iPhone, notifications only work from the app on your Home Screen.</p>
            ) : notifications === 'denied' ? (
              <>
                <p className="text-[14px] leading-snug text-gray-700">Notifications are switched off for {APP}. Your phone won&apos;t let the app ask again, so turn them on in Settings:</p>
                <ol className="mt-2.5 space-y-2.5">
                  {iphone ? (
                    <>
                      <Line n={1}>Open the <b>Settings</b> app, then tap <b>Notifications</b>.</Line>
                      <Line n={2}>Find <b>{APP}</b> in the list and tap it.</Line>
                      <Line n={3}>Turn on <b>Allow Notifications</b>.</Line>
                    </>
                  ) : !installed ? (
                    <>
                      <Line n={1}>Tap the <b>lock</b> icon (or the <b>⋮</b> menu, then <b>Site settings</b>) next to the web address.</Line>
                      <Line n={2}>Tap <b>Permissions</b>, then <b>Notifications</b>.</Line>
                      <Line n={3}>Choose <b>Allow</b>.</Line>
                    </>
                  ) : (
                    <>
                      <Line n={1}>Press and hold the <b>{APP}</b> icon, then tap <b>App info</b> (or the <b>i</b>).</Line>
                      <Line n={2}>Tap <b>Notifications</b>.</Line>
                      <Line n={3}>Turn on <b>All {APP} notifications</b>.</Line>
                    </>
                  )}
                </ol>
                <p className="mt-2.5 text-[12.5px] text-gray-500">Then come back here. This page updates by itself.</p>
              </>
            ) : notifications === 'unsupported' ? (
              <p className="text-[14px] leading-snug text-gray-600">This browser can&apos;t show notifications. Add the app to your Home Screen (step 1) and open it from there.</p>
            ) : (
              <>
                <p className="text-[14px] leading-snug text-gray-700">{audience === 'staff' ? 'You will get schedule changes, approvals, reminders and announcements.' : 'You will get your class and group call reminders, and messages from the team.'} When your phone asks, tap <b>Allow</b>.</p>
                <button type="button" onClick={() => { void enableNotifications(); }} disabled={enabling} className="mt-3 min-h-[48px] w-full rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-60">
                  {enabling ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-4 w-4" />Turning on…</span>) : 'Turn on notifications'}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default AppSetupSteps;
