import { useEffect, useRef, useState } from 'react';

const DISMISS_KEY = 'fof_pwa_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

export function usePWAInstall() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (isInStandaloneMode()) return;

    const ios = isIOS();
    setIsIOSDevice(ios);

    if (ios) {
      // iOS doesn't fire beforeinstallprompt — show manual instructions banner
      setCanInstall(true);
      return;
    }

    // Check if already captured globally before React mounted
    if ((window as any).__pwaInstallPrompt) {
      promptRef.current = (window as any).__pwaInstallPrompt;
      setCanInstall(true);
      return;
    }

    const onReady = () => {
      if ((window as any).__pwaInstallPrompt) {
        promptRef.current = (window as any).__pwaInstallPrompt;
        setCanInstall(true);
      }
    };

    window.addEventListener('pwaInstallReady', onReady);
    return () => window.removeEventListener('pwaInstallReady', onReady);
  }, []);

  const install = async () => {
    if (!promptRef.current) return;
    await promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }
    promptRef.current = null;
    (window as any).__pwaInstallPrompt = null;
  };

  const dismiss = () => {
    setCanInstall(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  return { canInstall, install, dismiss, isIOSDevice };
}
