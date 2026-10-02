import React, { useState } from 'react';
import type { FollowUpContact, FollowUpRelatedContact } from '../../types';
import { buildWhatsAppLink } from '../../utils/phone';
import { useRelatedContacts } from '../../hooks/useRelatedContacts';

const when = (r: FollowUpRelatedContact, first: string): string => {
  if (!r.sameCohort) return r.cohortName ? `in ${r.cohortName}` : 'in an earlier cohort';
  if (r.minutesApart < 10) return `at the same time as ${first}`;
  if (r.minutesApart < 120) return `${r.minutesApart} minutes apart from ${first}`;
  if (r.minutesApart < 60 * 48) return `${Math.round(r.minutesApart / 60)} hours apart from ${first}`;
  return `${Math.round(r.minutesApart / 1440)} days apart from ${first}`;
};

interface Props {
  contact: FollowUpContact;
  /** Supplied by tests and mock-ups; otherwise looked up for the contact. */
  related?: FollowUpRelatedContact[];
  /** Leave out the heading when the panel already sits under one. */
  hideHeader?: boolean;
  /** True once the supporter has chosen to carry on by email. */
  emailInstead?: boolean;
  onEmailInstead?: () => void;
  /** For a supporter who got the number from someone else. */
  onHaveNumber?: () => void;
}

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-start gap-3 px-3.5 py-3">
    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600">{n}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

// Shown when a contact has no usable WhatsApp number. Leads with the problem, then
// the next steps in order: email them, ask someone who signed up with the same email
// or number, or enter a number you have been given.
const NoNumberHelp: React.FC<Props> = ({ contact, related: relatedProp, hideHeader, emailInstead, onEmailInstead, onHaveNumber }) => {
  const looked = useRelatedContacts(contact.id, relatedProp === undefined);
  const related = relatedProp ?? looked;
  const first = contact.fullName.split(' ')[0];
  const email = contact.email?.trim();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? related : related.slice(0, 1);

  if (emailInstead) {
    return (
      <div className="mb-3 flex items-center gap-2.5 rounded-2xl bg-gray-100 px-3.5 py-2.5">
        <span className="h-2 w-2 flex-none rounded-full bg-amber-500" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] text-gray-700"><span className="font-semibold text-gray-900">{first}'s number isn't valid.</span> Emailing {email} instead.</p>
      </div>
    );
  }

  let step = 0;
  return (
    <div className="mb-3" role="alert">
      {!hideHeader && (
        <div className="flex items-start gap-2.5 px-1 pb-2.5">
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-gray-900">{first}'s number isn't valid</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-gray-500">{contact.phone?.trim() ? `They wrote “${contact.phone.trim()}”. ` : 'There is no number on file. '}A WhatsApp message can't reach them.</p>
          </div>
        </div>
      )}

      <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">What you can do</p>
      <div className="divide-y divide-gray-200/80 overflow-hidden rounded-2xl bg-gray-100">
        {email && onEmailInstead && (
          <Step n={++step}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-gray-900">Email {first}</p>
                <p className="truncate text-[12.5px] text-gray-500">{email}</p>
              </div>
              <button type="button" onClick={onEmailInstead} className="flex-none rounded-full bg-sky-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white">Email</button>
            </div>
          </Step>
        )}
        {shown.map((r) => {
          const wa = buildWhatsAppLink(r.phone, '');
          const rFirst = r.fullName.split(' ')[0];
          return (
            <Step key={r.id} n={++step}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-gray-900">Ask {r.fullName}</p>
                  <p className="text-[12.5px] leading-snug text-gray-500">
                    Signed up with the same {r.sharedBy === 'EMAIL' ? 'email' : 'number'} {when(r, first)}. They may know each other, so it's worth asking {rFirst}.
                  </p>
                  {r.phone && wa && <p className="mt-0.5 text-[12px] text-gray-400">{r.phone}{r.mine ? ' · on your list' : r.ownerName ? ` · with ${r.ownerName.split(' ')[0]}` : ''}</p>}
                </div>
                {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex-none rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white">WhatsApp</a>}
              </div>
            </Step>
          );
        })}
        {related.length > 1 && !showAll && (
          <div className="px-3.5 py-2.5 pl-[3.1rem]">
            <button type="button" onClick={() => setShowAll(true)} className="text-left text-[12.5px] font-semibold text-gray-500">Show {related.length - 1} more who signed up with the same {related[1].sharedBy === 'EMAIL' ? 'email' : 'number'}</button>
          </div>
        )}
        {onHaveNumber && (
          <Step n={++step}>
            <button type="button" onClick={onHaveNumber} className="block text-left">
              <span className="block text-[13.5px] font-semibold text-sky-700">Got their number? Add it</span>
              <span className="block text-[12.5px] text-gray-500">Save it on the contact so WhatsApp works.</span>
            </button>
          </Step>
        )}
      </div>
    </div>
  );
};

export default NoNumberHelp;
