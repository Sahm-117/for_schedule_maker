import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { HubJob } from '../../types';

// "Your Role in the Hub" is a standalone visual walkthrough (built in Claude
// Design) served from /guides. It reads #role=… to open on one role's path;
// with no role it starts on the role picker.
const GUIDE_URL = '/guides/your-role-in-the-hub.html';

const GUIDE_ROLE: Record<HubJob, string> = {
  HUB_LEAD: 'hl',
  ASSISTANT_HUB_LEAD: 'ahl',
  RECAP_LEAD: 'rc',
  PRAYER_LEAD: 'pr',
  IT_SUPPORT: 'it',
};

interface RoleGuideModalProps {
  job?: HubJob | null;
  onClose: () => void;
}

const RoleGuideModal: React.FC<RoleGuideModalProps> = ({ job, onClose }) => {
  // The guide's "Done" and "Skip the guide and close" buttons post this message.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === 'fof-guide-done') onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);
  const src = job ? `${GUIDE_URL}#role=${GUIDE_ROLE[job]}` : GUIDE_URL;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#FFFAF5]" role="dialog" aria-modal="true" aria-label="Your Role in the Hub">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/5 bg-white/80 px-4 backdrop-blur-xl">
        <span className="text-sm font-semibold text-gray-900">Your Role in the Hub</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2b2118] py-2 pl-3 pr-3.5 text-[13.5px] font-bold text-white shadow-sm active:scale-95"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          Close
        </button>
      </div>
      <iframe key={src} src={src} title="Your Role in the Hub" className="w-full flex-1 border-0" />
    </div>,
    document.body
  );
};

export default RoleGuideModal;
