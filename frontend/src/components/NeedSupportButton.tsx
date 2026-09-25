import React, { useEffect, useState } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { settingsApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';

// Floating, non-intrusive round "Need Support" (?) button shown app-wide. Tapping it opens
// a confirmation modal; on Continue it deep-links to the support contact's
// WhatsApp with a prefilled message. The contact (name + number) is admin-editable
// via the support_contact AppSetting.
// `inline` renders a header-sized button (desktop top bar) instead of the floating one,
// so it never covers table content.
const NeedSupportButton: React.FC<{ inline?: boolean; className?: string }> = ({ inline = false, className = '' }) => {
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getSupportContact()
      .then((c) => { if (!cancelled) setContact(c); })
      .catch(() => { /* keep button hidden if we can't resolve a contact */ });
    return () => { cancelled = true; };
  }, []);

  const waLink = contact ? buildWhatsAppLink(contact.phone, `Hello ${contact.name}, I need help with `) : null;

  // Don't render if there's no valid WhatsApp link to open.
  if (!contact || !waLink) return null;

  const handleContinue = () => {
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

      <ConfirmationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleContinue}
        type="info"
        title="Need help?"
        message={`We'll open WhatsApp so you can message ${contact.name} directly. You can describe your issue after the greeting.`}
        confirmText="Continue to WhatsApp"
        cancelText="Cancel"
      >
        <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium">Message preview:</span> “Hello {contact.name}, I need help with …”
        </div>
      </ConfirmationModal>
    </>
  );
};

export default NeedSupportButton;
