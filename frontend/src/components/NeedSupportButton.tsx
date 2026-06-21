import React, { useEffect, useState } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { settingsApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';

// Floating, non-intrusive "Need Support" button shown app-wide. Tapping it opens
// a confirmation modal; on Continue it deep-links to the support contact's
// WhatsApp with a prefilled message. The contact (name + number) is admin-editable
// via the support_contact AppSetting.
const NeedSupportButton: React.FC = () => {
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
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-end px-4 lg:bottom-6 lg:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Need support"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(255,145,77,0.45)] transition hover:bg-primary-dark active:scale-95"
        >
          {/* headset icon */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
            <path d="M21 16a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3z" />
            <path d="M3 16a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H3z" />
          </svg>
          Need Support
        </button>
      </div>

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
