import React from 'react';
import type { FollowUpContact, FollowUpRelatedContact } from '../../types';
import { buildWhatsAppLink } from '../../utils/phone';

const ago = (minutes: number): string => {
  if (minutes < 2) return 'at the same time';
  if (minutes < 120) return `${minutes} minutes apart`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} hours apart`;
  return `${Math.round(minutes / 1440)} days apart`;
};

interface Props {
  contact: FollowUpContact;
  related: FollowUpRelatedContact[];
  /** True once the supporter has chosen to carry on by email. */
  emailInstead?: boolean;
  onEmailInstead?: () => void;
  /** For a supporter who got the number from someone else. */
  onHaveNumber?: () => void;
}

// Shown when a contact has no usable WhatsApp number: what to do instead, and
// who else signed up with the same email or number (they may know how to reach them).
const NoNumberHelp: React.FC<Props> = ({ contact, related, emailInstead, onEmailInstead, onHaveNumber }) => {
  const first = contact.fullName.split(' ')[0];
  const email = contact.email?.trim();
  return (
    <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" role="alert">
      <p className="text-[13.5px] font-bold">{first} has no working number</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-amber-900/80">
        {contact.phone?.trim() ? `They wrote “${contact.phone.trim()}”, which isn't a phone number.` : 'There is no number on file.'}
        {' '}Don't paste this message into another person's chat.
      </p>

      {email && (
        <div className="mt-2.5 rounded-xl bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold text-gray-500">Email from their form</p>
          <p className="truncate text-[13.5px] font-semibold text-gray-900">{email}</p>
          {emailInstead ? (
            <p className="mt-1 text-[12.5px] font-semibold text-emerald-700">Pick a template below and tap Open email.</p>
          ) : onEmailInstead && (
            <button type="button" onClick={onEmailInstead} className="mt-2 inline-flex min-h-[38px] items-center rounded-[10px] bg-sky-600 px-3.5 text-[12.5px] font-semibold text-white">
              Email {first} instead
            </button>
          )}
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold text-gray-500">{related.some((r) => r.sharedBy === 'EMAIL') ? 'Signed up with the same email' : 'Signed up with the same number'}</p>
          <ul className="mt-1 space-y-2">
            {related.map((r) => {
              const wa = buildWhatsAppLink(r.phone, '');
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-gray-900">{r.fullName}</p>
                    <p className="text-[12px] text-gray-500">
                      {r.phone && buildWhatsAppLink(r.phone, '') ? r.phone : 'No number'} · {ago(r.minutesApart)}{r.mine ? ' · on your list' : r.ownerName ? ` · with ${r.ownerName.split(' ')[0]}` : ''}
                    </p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="flex-none rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700">
                      WhatsApp {r.fullName.split(' ')[0]}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[12px] text-gray-500">They may know {first} or how to reach them.</p>
        </div>
      )}

      {onHaveNumber && (
        <button type="button" onClick={onHaveNumber} className="mt-2.5 text-[12.5px] font-semibold text-amber-800 underline underline-offset-2">
          I have their number
        </button>
      )}
    </div>
  );
};

export default NoNumberHelp;
