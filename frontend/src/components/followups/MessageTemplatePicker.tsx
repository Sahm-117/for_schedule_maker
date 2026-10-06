import React, { useMemo, useState } from 'react';
import type { FollowUpContact, MessageTemplate } from '../../types';
import ModalShell from './ModalShell';
import LinkText from '../LinkText';
import { contactReachPhone, fillTemplate, isTeenContact } from '../../utils/followUps';
import { buildWhatsAppLink, normalizeToIntlPhone } from '../../utils/phone';

// +234 806 678 3672 style, for showing who a message is going to.
const prettyIntl = (digits: string): string =>
  digits.startsWith('234') && digits.length === 13 ? `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}` : `+${digits}`;
import Spinner from '../Spinner';
import NoNumberHelp from './NoNumberHelp';

interface MessageTemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  contact: FollowUpContact | null;
  templates: MessageTemplate[];
  registrationLink: string;
  currentUserName?: string | null;
  /** The sender's own WhatsApp group link, for {{group_link}} in teen messages. */
  senderGroupLink?: string | null;
  onMessageSent: (contact: FollowUpContact) => Promise<void> | void;
  /** 'email' sends the same personalised message through their email app instead of WhatsApp. */
  channel?: 'whatsapp' | 'email';
  /** Opens the edit form for a supporter who has got the number from someone else. */
  onHaveNumber?: (contact: FollowUpContact) => void;
}

// Subject line for follow-up emails opened from a template.
const EMAIL_SUBJECT = 'Foundation of Faith';

const MessageTemplatePicker: React.FC<MessageTemplatePickerProps> = ({
  isOpen,
  onClose,
  contact,
  templates,
  registrationLink,
  currentUserName,
  senderGroupLink,
  onMessageSent,
  channel = 'whatsapp',
  onHaveNumber,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [marking, setMarking] = useState(false);
  const [copied, setCopied] = useState(false);
  // Chosen from the no-number warning: carry on by email instead.
  const [emailInstead, setEmailInstead] = useState(false);

  // A teen is shown only the TEEN templates, and nobody else sees them.
  const teen = contact ? isTeenContact(contact) : false;
  const shownTemplates = useMemo(
    () => templates.filter((t) => (t.category === 'TEEN') === teen),
    [templates, teen]
  );
  const reachPhone = contact ? contactReachPhone(contact) : null;
  const selected = shownTemplates.find((t) => t.id === selectedId) || null;
  const filled = useMemo(
    () => (selected && contact ? fillTemplate(selected.body, contact, registrationLink, currentUserName, senderGroupLink) : ''),
    [selected, contact, registrationLink, currentUserName, senderGroupLink]
  );
  const waLink = contact && filled ? buildWhatsAppLink(reachPhone, filled) : null;
  const email = contact?.email?.trim() || '';
  const mailLink = email && filled
    ? `mailto:${email}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(filled)}`
    : null;
  const byEmail = channel === 'email' || emailInstead;
  const intl = normalizeToIntlPhone(reachPhone);
  const numberOk = !!intl;
  const firstName = contact?.fullName.split(' ')[0] ?? '';
  // Copying a WhatsApp message for someone with no usable number is how a text
  // ends up pasted into the wrong chat, so it is blocked until the number is fixed.
  const copyBlocked = !byEmail && !numberOk;

  if (!contact) return null;

  const handleOpened = async () => {
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
      onClose={() => { setSelectedId(''); setEmailInstead(false); onClose(); }}
      title={`${byEmail ? 'Email' : 'Message'} ${contact.fullName.split(' ')[0]}`}
      subtitle="Pick a template — placeholders fill automatically."
      wide
      footer={(
        <>
          <button type="button" onClick={() => { setSelectedId(''); setEmailInstead(false); onClose(); }} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
            Close
          </button>
          {filled && (
            <button
              type="button"
              disabled={copyBlocked}
              title={copyBlocked ? `${firstName} has no working number, so this message can't be copied` : undefined}
              onClick={() => {
                void navigator.clipboard?.writeText(filled).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 4000);
              }}
              className="rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
            >
              {copied ? 'Copied' : byEmail ? 'Copy text' : `Copy for ${firstName}`}
            </button>
          )}
          {byEmail ? (
            mailLink ? (
              <a
                href={mailLink}
                onClick={() => { void handleOpened(); }}
                className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                {marking ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Opening…</span>) : 'Open email'}
              </a>
            ) : (
              <span className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400">
                {email ? 'Open email' : 'No email on file'}
              </span>
            )
          ) : waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={() => { void handleOpened(); }}
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              data-testid="whatsapp-link"
            >
              {marking ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Opening…</span>) : 'Open WhatsApp'}
            </a>
          ) : (
            <span className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400" title="Fix this contact's phone number to enable WhatsApp">
              {selected ? 'Invalid phone number' : 'Open WhatsApp'}
            </span>
          )}
        </>
      )}
    >
      {!(channel === 'email') && (numberOk && !emailInstead ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-900">
          <span className="font-semibold">To {contact.fullName}</span>
          <span className="font-semibold text-emerald-700">{prettyIntl(intl as string)}</span>
          {copied && <span className="w-full text-[12.5px] text-emerald-800">Copied. Paste it only into {firstName}'s chat.</span>}
        </div>
      ) : !numberOk ? (
        <NoNumberHelp
          contact={contact}
          emailInstead={emailInstead}
          onEmailInstead={() => { setEmailInstead(true); setSelectedId(''); }}
          onHaveNumber={onHaveNumber ? () => { setSelectedId(''); setEmailInstead(false); onHaveNumber(contact); } : undefined}
        />
      ) : null)}
      {shownTemplates.length === 0 ? (
        <p className="rounded-2xl bg-orange-50 px-4 py-6 text-center text-sm text-gray-500">
          No message templates yet. Ask an admin to add them in the Message Bank.
        </p>
      ) : (
        <div className="flex h-[min(60vh,520px)] min-h-0 flex-col gap-4">
          <div className="max-h-[40%] shrink-0 overflow-y-auto rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Preview</p>
            {filled ? (
              <p className="whitespace-pre-wrap text-sm text-gray-800"><LinkText text={filled} /></p>
            ) : (
              <p className="text-sm text-gray-400">Select a template to preview the personalised message.</p>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" aria-label="Message templates">
            {shownTemplates.map((t) => (
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
        </div>
      )}
    </ModalShell>
  );
};

export default MessageTemplatePicker;
