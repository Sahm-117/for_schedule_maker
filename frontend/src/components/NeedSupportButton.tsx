import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AppGuideModal from './AppGuideModal';
import { settingsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { buildWhatsAppLink } from '../utils/phone';

// Floating, non-intrusive round "Need Support" (?) button shown app-wide. Tapping it opens
// a small "How can we help?" sheet: the app guide (opens on the viewer's role), or
// WhatsApp to the support contact with a prefilled message. The contact (name + number)
// is admin-editable via the support_contact AppSetting; without one only the guide shows.
// `inline` renders a header-sized button (desktop top bar) instead of the floating one,
// so it never covers table content.
const NeedSupportButton: React.FC<{ inline?: boolean; className?: string }> = ({ inline = false, className = '' }) => {
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { user } = useAuth();
  const guideRole = user?.role === 'ADMIN' ? 'admin' : user?.role === 'PARTICIPANT' ? 'participant' : 'support';

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getSupportContact()
      .then((c) => { if (!cancelled) setContact(c); })
      .catch(() => { /* keep button hidden if we can't resolve a contact */ });
    return () => { cancelled = true; };
  }, []);

  const waLink = contact ? buildWhatsAppLink(contact.phone, `Hello ${contact.name}, I need help with `) : null;

  const openGuide = () => {
    setOpen(false);
    setGuideOpen(true);
  };

  const openWhatsApp = () => {
    if (!waLink) return;
    setOpen(false);
    window.open(waLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {inline ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Need support"
          title="Need support"
          className={`grid h-10 w-10 place-items-center rounded-2xl bg-primary text-white transition hover:bg-primary-dark ${className}`}
        >
          {/* question-mark-in-circle icon */}
          <svg className={inline ? 'h-5 w-5' : 'h-6 w-6'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </button>
      ) : (
        <div className={`pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-end px-4 lg:bottom-6 lg:px-6 ${className}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Need support"
            title="Need support"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_30px_rgba(255,145,77,0.45)] transition hover:bg-primary-dark active:scale-95"
          >
          {/* question-mark-in-circle icon */}
          <svg className={inline ? 'h-5 w-5' : 'h-6 w-6'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
          </button>
        </div>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="How can we help?"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">How can we help?</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={openGuide}
                className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-left transition hover:bg-gray-100 active:scale-[0.99]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-gray-900">Open the app guide</span>
                  <span className="block text-sm text-gray-500">Search "How do I…" with step-by-step pictures</span>
                </span>
              </button>
              {contact && waLink && (
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-left transition hover:bg-gray-100 active:scale-[0.99]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-gray-900">Message {contact.name}</span>
                    <span className="block text-sm text-gray-500">Opens WhatsApp with “Hello {contact.name}, I need help with …”</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {guideOpen && <AppGuideModal role={guideRole} onClose={() => setGuideOpen(false)} />}
    </>
  );
};

export default NeedSupportButton;
