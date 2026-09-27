import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// "Welcome to FOF" is a standalone visual walkthrough (built in Claude Design)
// served from /guides. Participants see it once, after setting their password.
const GUIDE_URL = '/guides/welcome-to-fof.html';

interface WelcomeGuideModalProps {
  onClose: () => void;
}

const WelcomeGuideModal: React.FC<WelcomeGuideModalProps> = ({ onClose }) => {
  // The guide's "Done" button (last screen) posts this message.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === 'fof-guide-done') onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#FFFAF5]" role="dialog" aria-modal="true" aria-label="Welcome to FOF">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/5 bg-white/80 px-4 backdrop-blur-xl">
        <span className="text-sm font-semibold text-gray-900">Welcome to FOF</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <iframe src={GUIDE_URL} title="Welcome to FOF" className="w-full flex-1 border-0" />
    </div>,
    document.body
  );
};

export default WelcomeGuideModal;
