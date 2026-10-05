import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

export function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

export function usePWAInstall() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const installTimer = useRef<number | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);
  // What happened after the person tapped Install. The browser prompt closing
  // is not the end: the phone still needs a few seconds to put the icon on the
  // Home Screen, and only the appinstalled event proves it arrived.
  const [installPhase, setInstallPhase] = useState<'idle' | 'installing' | 'installed' | 'dismissed'>('idle');

  useEffect(() => {
    const standalone = isInStandaloneMode();
    setIsStandalone(standalone);
    if (standalone) return;

    const ios = isIOS();
    const android = isAndroid();
    setIsIOSDevice(ios);
    setIsAndroidDevice(android);

    if (ios) {
      setCanInstall(true);
      return;
    }

    if (android) {
      setCanInstall(true);
    }

    if ((window as any).__pwaInstallPrompt) {
      promptRef.current = (window as any).__pwaInstallPrompt;
      setHasNativePrompt(true);
      setCanInstall(true);
      return;
    }

    const onReady = () => {
      if ((window as any).__pwaInstallPrompt) {
        promptRef.current = (window as any).__pwaInstallPrompt;
        setHasNativePrompt(true);
        setCanInstall(true);
      }
    };

    window.addEventListener('pwaInstallReady', onReady);
    const onInstalled = () => {
      setCanInstall(false);
      setIsStandalone(true);
      setHasNativePrompt(false);
      if (installTimer.current) {
        window.clearTimeout(installTimer.current);
        installTimer.current = null;
      }
      setInstallPhase('installed');
    };

    window.addEventListener('appinstalled', onInstalled);
    return () => {
      if (installTimer.current) {
        window.clearTimeout(installTimer.current);
        installTimer.current = null;
      }
      window.removeEventListener('pwaInstallReady', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptRef.current) return;
    setIsInstalling(true);
    try {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        // The phone needs a few more seconds after the person confirms. Wait
        // for the installed event; if it never fires, an accept is still proof
        // enough after a short wait. A dismiss can't be retried in this page
        // load (the browser prompt is one-shot), so say reload instead.
        setInstallPhase('installing');
        if (installTimer.current) window.clearTimeout(installTimer.current);
        installTimer.current = window.setTimeout(() => {
          installTimer.current = null;
          setInstallPhase((prev) => (prev === 'installing' ? 'installed' : prev));
        }, 10000);
      } else {
        setInstallPhase('dismissed');
      }
    } finally {
      setIsInstalling(false);
      setHasNativePrompt(false);
      promptRef.current = null;
      (window as any).__pwaInstallPrompt = null;
    }
  };

  const dismiss = () => {
    setCanInstall(false);
  };

  return { canInstall, install, dismiss, isIOSDevice, isAndroidDevice, isStandalone, isInstalling, hasNativePrompt, installPhase };
}
