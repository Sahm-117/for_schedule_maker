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

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

export function usePWAInstall() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);

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
    };

    window.addEventListener('appinstalled', onInstalled);
    return () => {
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

  return { canInstall, install, dismiss, isIOSDevice, isAndroidDevice, isStandalone, isInstalling, hasNativePrompt };
}
