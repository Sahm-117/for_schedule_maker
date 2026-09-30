import { useCallback, useEffect, useState } from 'react';
import { isInStandaloneMode, usePWAInstall } from './usePWAInstall';
import { useAppServerState } from './useAppServerState';

// Where a participant is with the two things the app needs to reach them: being
// on their Home Screen, and having notifications on. Read from the browser, so it
// is always the truth on this device.

export type DeviceKind = 'ios' | 'ios-inapp' | 'android' | 'desktop';
export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

export const detectDevice = (): DeviceKind => {
  const ua = navigator.userAgent;
  const ipadOnMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || ipadOnMac) {
    // Safari, Chrome, Edge and Firefox can all add to the Home Screen. The browser
    // built into WhatsApp, Facebook or Instagram can't.
    return /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Twitter/i.test(ua) ? 'ios-inapp' : 'ios';
  }
  return /android/i.test(ua) ? 'android' : 'desktop';
};

const readNotificationState = (): NotificationState =>
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

export const useAppSetup = () => {
  const pwa = usePWAInstall();
  const [installed, setInstalled] = useState(() => isInStandaloneMode());
  const [notifications, setNotifications] = useState<NotificationState>(readNotificationState);
  const device = detectDevice();
  const server = useAppServerState();

  const refresh = useCallback(() => {
    setInstalled(isInStandaloneMode());
    setNotifications(readNotificationState());
  }, []);

  // Coming back from Settings or the install sheet: read it again.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('appinstalled', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('appinstalled', refresh);
    };
  }, [refresh]);

  const isInstalled = installed || pwa.isStandalone;
  return {
    device,
    installed: isInstalled,
    // Already opened from the Home Screen at some point, but this is a browser tab.
    installedElsewhere: !isInstalled && device !== 'desktop' && !!server?.installedBefore,
    sheetDismissed: server?.sheetDismissed ?? 0,
    notifications,
    canInstallNatively: pwa.hasNativePrompt,
    install: pwa.install,
    isInstalling: pwa.isInstalling,
    refresh,
  };
};

export type AppSetup = ReturnType<typeof useAppSetup>;

/** Both done: on the Home Screen with notifications on. */
export const appSetupDone = (setup: Pick<AppSetup, 'installed' | 'notifications'>) =>
  setup.installed && setup.notifications === 'granted';

/**
 * Whether to keep asking. On a phone: until it is on the Home Screen with
 * notifications on. On a computer the Home Screen doesn't matter, only notifications.
 */
export const appSetupNeeded = (setup: Pick<AppSetup, 'device' | 'installed' | 'notifications'>) =>
  setup.device === 'desktop'
    ? setup.notifications === 'default' || setup.notifications === 'denied'
    : !appSetupDone(setup);

/** After this many "Maybe later"s the sheet stops popping up; the Home banner and Profile card stay. */
export const MAX_AUTO_SHEET_DISMISSALS = 5;

/** Whether the sheet may pop up by itself this launch. */
export const appSetupSheetDue = (setup: Pick<AppSetup, 'device' | 'installed' | 'notifications' | 'installedElsewhere' | 'sheetDismissed'>) =>
  appSetupNeeded(setup) && !setup.installedElsewhere && setup.sheetDismissed < MAX_AUTO_SHEET_DISMISSALS;
