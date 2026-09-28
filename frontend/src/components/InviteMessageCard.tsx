import React, { useState } from 'react';
import { buildWhatsAppLink } from '../utils/phone';

// Shown after an admin creates an account or resets a password: a ready-to-send
// message with the person's login details, to copy or send straight on WhatsApp.
// The password is a generated first-time one; they pick their own at sign-in.
export interface InviteDetails {
  name: string;
  email: string;
  phone: string;
  password: string;
  /** 'reset' words it as a password reset instead of a welcome. */
  kind?: 'invite' | 'reset';
}

export const buildInviteMessage = ({ name, email, phone, password, kind = 'invite' }: InviteDetails): string => {
  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  const login = email && phone ? `${email} (or ${phone})` : email || phone;
  const opening = kind === 'reset'
    ? `Hello ${firstName}, your FOF app password has been reset.\n\n`
    : `Hello ${firstName}, welcome to the FOF team! You now have an account on the FOF app.\n\n`;
  return opening
    + `Name on the app: ${name.trim()}\n`
    + `Login: ${login}\n`
    + `${kind === 'reset' ? 'Temporary password' : 'First-time password'}: ${password}\n`
    + `App link: https://fof.tcnikorodu.org/login\n\n`
    + `You will be asked to choose your own password when you ${kind === 'reset' ? 'next' : 'first'} sign in.`;
};

const InviteMessageCard: React.FC<{ details: InviteDetails; onDismiss: () => void }> = ({ details, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  const message = buildInviteMessage(details);
  const waLink = details.phone ? buildWhatsAppLink(details.phone, message) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-emerald-700">{details.kind === 'reset' ? 'Password reset. Send them this message:' : 'Account created. Send them this invite:'}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss invite" className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-emerald-100 bg-white p-3 text-xs leading-relaxed text-gray-700">{message}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => { void copy(); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
          {copied ? 'Copied!' : 'Copy message'}
        </button>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" className="rounded-xl bg-[#25d366] px-4 py-2 text-sm font-semibold text-white active:scale-95">
            Send on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
};

export default InviteMessageCard;
