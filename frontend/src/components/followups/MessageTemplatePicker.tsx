import React, { useMemo, useState } from 'react';
import type { FollowUpContact, MessageTemplate } from '../../types';
import ModalShell from './ModalShell';
import { fillTemplate } from '../../utils/followUps';
import { buildWhatsAppLink } from '../../utils/phone';

interface MessageTemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  contact: FollowUpContact | null;
  templates: MessageTemplate[];
  registrationLink: string;
  currentUserName?: string | null;
  onMessageSent: (contact: FollowUpContact) => Promise<void> | void;
}

const MessageTemplatePicker: React.FC<MessageTemplatePickerProps> = ({
  isOpen,
  onClose,
  contact,
  templates,
  registrationLink,
  currentUserName,
  onMessageSent,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [marking, setMarking] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = templates.find((t) => t.id === selectedId) || null;
  const filled = useMemo(
    () => (selected && contact ? fillTemplate(selected.body, contact, registrationLink, currentUserName) : ''),
    [selected, contact, registrationLink, currentUserName]
  );
  const waLink = contact && filled ? buildWhatsAppLink(contact.phone, filled) : null;

  if (!contact) return null;

  const handleOpenWhatsApp = async () => {
    setMarking(true);
    try {
      await onMessageSent(contact);
    } finally {
      setMarking(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { setSelectedId(''); onClose(); }}
      title={`Message ${contact.fullName.split(' ')[0]}`}
      subtitle="Pick a template — placeholders fill automatically."
      wide
      footer={(
        <>
          <button type="button" onClick={() => { setSelectedId(''); onClose(); }} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
            Close
          </button>
          {filled && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(filled);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary hover:bg-orange-50"
            >
              {copied ? 'Copied!' : 'Copy text'}
            </button>
          )}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={() => { void handleOpenWhatsApp(); }}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              data-testid="whatsapp-link"
            >
              {marking ? 'Opening…' : 'Open WhatsApp'}
            </a>
          ) : (
            <span className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400" title="Fix this contact's phone number to enable WhatsApp">
              {selected ? 'Invalid phone number' : 'Open WhatsApp'}
            </span>
          )}
        </>
      )}
    >
      {templates.length === 0 ? (
        <p className="rounded-2xl bg-orange-50 px-4 py-6 text-center text-sm text-gray-500">
          No message templates yet. Ask an admin to add them in the Message Bank.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${selectedId === t.id ? 'border-orange-300 bg-orange-50' : 'border-orange-100 bg-white hover:bg-orange-50/50'}`}
              >
                <p className="text-sm font-semibold text-gray-900">{t.useCase}</p>
                {t.whenToUse && <p className="mt-0.5 text-xs text-gray-500">{t.whenToUse}</p>}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Preview</p>
            {filled ? (
              <p className="whitespace-pre-wrap text-sm text-gray-800">{filled}</p>
            ) : (
              <p className="text-sm text-gray-400">Select a template to preview the personalised message.</p>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default MessageTemplatePicker;
