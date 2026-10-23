import React, { useCallback, useEffect, useState } from 'react';
import { buildWhatsAppLink } from '../../utils/phone';
import { buildLoginEmailBody, buildLoginMailLink, fetchLoginDetails, firstClassText } from '../../utils/loginEmail';
import { useAuth } from '../../hooks/useAuth';
import type { ParticipantLoginDetails } from '../../types';
import LinkText from '../LinkText';
import { installVideoLines } from '../../constants/installVideos';
import { firstNameOf } from '../../utils/people';

// "Their login details" card from the V2 design. Shown to a support once they mark
// a prospect as Registered, and to admins on a participant. Opening it creates the
// first-time code (if none yet) and builds the message to copy or send on WhatsApp.
// Once the participant has chosen their own password, the code is gone for good:
// staff can only issue a new one, which signs the participant out.

interface LoginDetailsCardProps {
  participantId?: string | null;
  followUpContactId?: string | null;
  defaultOpen?: boolean;
  className?: string;
  /** Their cohort's first class (YYYY-MM-DD…), for "See you on October 11". */
  startDate?: string | null;
  /** Their email, for sending the login by email when the phone doesn't get through. */
  email?: string | null;
  /** A teen: the login belongs to the parent or guardian, who is also the one who can ask for a reset. */
  guardian?: boolean;
  /** Opened from "Reset password": once their password is set, go straight to the new-code confirmation. */
  startWithReset?: boolean;
  /** Told each time the login status loads or changes (a new code means they are back to "not set"). */
  onDetails?: (details: ParticipantLoginDetails) => void;
}

const formatDay = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

const errorText = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  if (message === 'SESSION_EXPIRED') return 'Please sign out and sign in again to see login details.';
  return message || 'Could not load the login details. Please try again.';
};

const LoginDetailsCard: React.FC<LoginDetailsCardProps> = ({ participantId, followUpContactId, defaultOpen = false, className = '', startDate, email, guardian = false, startWithReset = false, onDetails }) => {
  const { user } = useAuth();
  const [details, setDetails] = useState<ParticipantLoginDetails | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(startWithReset);

  const target = { participantId, followUpContactId };

  const load = useCallback(async (options: { issue?: boolean; newCode?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchLoginDetails(target, options);
      setDetails(next);
      onDetails?.(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, followUpContactId]);

  useEffect(() => {
    void load({ issue: defaultOpen });
  }, [load, defaultOpen]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setConfirmNewCode(next && startWithReset);
    if (next && (!details || details.status === 'NONE' || details.status === 'NO_PARTICIPANT')) void load({ issue: true });
  };

  const firstName = firstNameOf(details?.name);
  const message = details?.setupCode && guardian
    ? `Hello, well done on registering ${firstName} for Foundation Of Faith!\n\n`
      + (user?.name ? `My name is ${user.name}, ${firstName}'s Teen Support at TCN Ikorodu.\n\n` : '')
      + 'Please find the login details below. You sign in first; you will see the next class and the group, and you can share the login with your teen.\n\n'
      + `App link: https://fof.tcnikorodu.org/login\n`
      + `Username: ${details.phone}\n`
      + `First-time password: ${details.setupCode}\n\n`
      + `${installVideoLines()}\n\n`
      + `You will be asked to choose your own password when you first sign in. Please also turn on notifications in the app. If you have any questions, just ask me. See you on ${firstClassText(startDate)}.`
    : details?.setupCode
    ? `Hello ${firstName}, well done on registering for Foundation Of Faith!\n\n`
      + (user?.name ? `My name is ${user.name}, from TCN Ikorodu, here to get you onboarded on to the FOF App.\n\n` : '')
      + 'Please find your login details below.\n\n'
      + `App link: https://fof.tcnikorodu.org/login\n`
      + `Username: ${details.phone}\n`
      + `First-time password: ${details.setupCode}\n\n`
      + `${installVideoLines()}\n\n`
      + `You will be asked to set your own password when you first sign in. If you have any questions, just ask me. See you on ${firstClassText(startDate)}.`
    : '';
  const waLink = message ? buildWhatsAppLink(details?.phone, message) : null;

  // The same details by email, for when calls and WhatsApp don't get through.
  const mailLink = details?.setupCode ? buildLoginMailLink(email, buildLoginEmailBody(details, user, startDate)) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the message and copy it instead.');
    }
  };

  // Everyone else on this number shares one login (FLOW_MAP rule 91).
  const sharedWith = (details?.household ?? []).filter((h) => h.hasLogin).map((h) => h.name.split(' ')[0]);
  const sharedNames = sharedWith.length <= 1 ? sharedWith.join('') : `${sharedWith.slice(0, -1).join(', ')} and ${sharedWith[sharedWith.length - 1]}`;

  const subline = details?.status === 'NO_PARTICIPANT'
    ? 'Not in Participants yet'
    : details?.status === 'ACTIVE'
    ? `Signed in · password set ${formatDay(details.passwordSetAt)}`
    : details?.status === 'CODE_READY' && details.lastSignInAt && details.issuedAt && details.lastSignInAt > details.issuedAt
      ? 'Signed in, password not set yet'
      : 'Tap to view and send';

  return (
    <div className={`overflow-hidden rounded-[14px] border border-[#d9f2e2] bg-[#f2fbf5] ${className}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3.5 py-[13px] text-left">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#15803d]">{guardian ? 'Guardian login details' : 'Their login details'}</p>
          <p className="mt-[3px] text-[12.5px] text-gray-600">{subline}</p>
        </div>
        <span className={`inline-flex h-8 w-8 flex-none items-center justify-center text-[#15803d] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5">
          {sharedWith.length > 0 && !error && (
            <p className="mb-2 rounded-[10px] bg-white px-3 py-2 text-[12.5px] leading-normal text-gray-600">
              Shared number: one login and password for {firstName} and {sharedNames}. After signing in they choose whose space to open.
            </p>
          )}
          {error ? (
            <p className="rounded-[10px] bg-white px-3 py-2.5 text-[13px] text-red-700">{error}</p>
          ) : loading && !message ? (
            <p className="rounded-[10px] bg-white px-3 py-2.5 text-[13px] text-gray-500">Getting their login ready…</p>
          ) : message ? (
            <>
              <div className="whitespace-pre-line rounded-[10px] border border-[#d9f2e2] bg-white p-3 text-[13px] leading-[1.65] text-gray-700"><LinkText text={message} /></div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => { void copy(); }} className="min-h-[44px] flex-[1_1_120px] rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-gray-700">
                  {copied ? 'Copied' : 'Copy message'}
                </button>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] flex-[1_1_150px] items-center justify-center rounded-[10px] bg-[#25d366] px-3.5 py-2.5 text-[13px] font-semibold text-white">
                    Send in WhatsApp
                  </a>
                )}
                {mailLink && (
                  <a href={mailLink} className="inline-flex min-h-[44px] flex-[1_1_150px] items-center justify-center rounded-[10px] bg-sky-600 px-3.5 py-2.5 text-[13px] font-semibold text-white">
                    Send by email
                  </a>
                )}
              </div>
            </>
          ) : details?.status === 'NO_PARTICIPANT' ? (
            <div className="rounded-[10px] bg-white p-3 text-[13px] leading-normal text-gray-600">
              This registration is still being checked by the back office. There is no login to send yet.
            </div>
          ) : details?.status === 'ACTIVE' ? (
            <div className="rounded-[10px] border border-[#d9f2e2] bg-white p-3 text-[13px] leading-normal text-gray-700">
              <p>{guardian ? 'The guardian has chosen a password. Only they know it.' : `${firstName} has chosen their own password. Only they know it.`}</p>
              {confirmNewCode ? (
                <div className="mt-2.5">
                  <p className="text-[12.5px] text-gray-500">{guardian ? 'A new code replaces the family’s password and signs out the guardian and the teen. Send it to the guardian straight after.' : 'A new code replaces their password and signs them out. Send it to them straight after.'}</p>
                  {sharedWith.length > 0 && <p className="mt-1 text-[12.5px] font-semibold text-[#c2410c]">This also resets {sharedNames}&apos;s login on the same number.</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setConfirmNewCode(false)} className="min-h-[40px] flex-1 rounded-[10px] border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-700">Cancel</button>
                    <button type="button" onClick={() => { setConfirmNewCode(false); void load({ newCode: true }); }} disabled={loading} className="min-h-[40px] flex-1 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-white disabled:opacity-60">Create new code</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmNewCode(true)} className="mt-2 text-[13px] font-semibold text-[#c2410c]">
                  {guardian ? 'Guardian forgot the password? Create a new code' : 'Forgot their password? Create a new code'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default LoginDetailsCard;
