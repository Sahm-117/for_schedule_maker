import React from 'react';
import { createPortal } from 'react-dom';

// The FOF Ops app guide is a standalone searchable wiki served from /guides.
// It reads #role=… to open on that role's section; with no role it starts on
// the "who are you?" picker.
const GUIDE_URL = '/guides/app-guide/index.html';

export type GuideRole = 'admin' | 'support' | 'participant';

interface AppGuideModalProps {
  role?: GuideRole | null;
  onClose: () => void;
}

const AppGuideModal: React.FC<AppGuideModalProps> = ({ role, onClose }) => {
  const src = role ? `${GUIDE_URL}#role=${role}` : GUIDE_URL;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#FFFAF5]" role="dialog" aria-modal="true" aria-label="App guide">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/5 bg-white/80 px-4 backdrop-blur-xl">
        <span className="text-sm font-semibold text-gray-900">App guide</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <iframe key={src} src={src} title="App guide" className="w-full flex-1 border-0" />
    </div>,
    document.body
  );
};

export default AppGuideModal;
