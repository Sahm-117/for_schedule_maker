import { useCallback, useEffect, useState } from 'react';
import { isInStandaloneMode, usePWAInstall } from './usePWAInstall';

// Where a participant is with the two things the app needs to reach them: being
// on their Home Screen, and having notifications on. Read from the browser, so it
// is always the truth on this device.

export type DeviceKind = 'ios-safari' | 'ios-other' | 'android' | 'desktop';
export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

export const detectDevice = (): DeviceKind => {
  const ua = navigator.userAgent;
  const ipadOnMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || ipadOnMac) {
    // Only Safari can add to the Home Screen on iPhone. Chrome, Firefox, Edge and the
    // browsers inside WhatsApp, Facebook and Instagram can't.
    return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua) ? 'ios-other' : 'ios-safari';
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

  return {
    device,
    installed: installed || pwa.isStandalone,
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
