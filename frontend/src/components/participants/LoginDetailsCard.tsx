import React, { useCallback, useEffect, useState } from 'react';
import { participantAccountsApi, participantsApi } from '../../services/api';
import { buildWhatsAppLink } from '../../utils/phone';
import type { ParticipantLoginDetails } from '../../types';

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
}

const formatDay = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

const errorText = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  if (message === 'SESSION_EXPIRED') return 'Please sign out and sign in again to see login details.';
  return message || 'Could not load the login details. Please try again.';
};

const LoginDetailsCard: React.FC<LoginDetailsCardProps> = ({ participantId, followUpContactId, defaultOpen = false, className = '' }) => {
  const [details, setDetails] = useState<ParticipantLoginDetails | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(false);

  const target = { participantId, followUpContactId };

  const load = useCallback(async (options: { issue?: boolean; newCode?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      let result = await participantAccountsApi.getLoginDetails(target, options);
      // A prospect just marked Registered gets its participant record a moment later,
      // so when sending, wait briefly before calling it missing.
      for (let attempt = 0; options.issue && result.status === 'NO_PARTICIPANT' && attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        result = await participantAccountsApi.getLoginDetails(target, options);
      }
      // Registered always means Participant. Older registrations may predate that
      // hand-off, so repair the record automatically rather than asking support to
      // decide or perform a back-office task.
      if (options.issue && result.status === 'NO_PARTICIPANT' && followUpContactId) {
        await participantsApi.ensureFromFollowUpContact(followUpContactId);
        result = await participantAccountsApi.getLoginDetails(target, options);
      }
      setDetails(result);
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
    setConfirmNewCode(false);
    if (next && (!details || details.status === 'NONE' || details.status === 'NO_PARTICIPANT')) void load({ issue: true });
  };

  const firstName = (details?.name || '').split(' ')[0];
  const message = details?.setupCode
    ? `Hello ${firstName}, please find your login details below.\n\n`
      + `App link: ${window.location.origin}/login\n`
      + `Username: ${details.phone}\n`
      + `First-time password: ${details.setupCode}\n\n`
      + 'You will be asked to set your own password when you first sign in. See you Sunday.'
    : '';
  const waLink = message ? buildWhatsAppLink(details?.phone, message) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the message and copy it instead.');
    }
  };

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
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#15803d]">Their login details</p>
          <p className="mt-[3px] text-[12.5px] text-gray-600">{subline}</p>
        </div>
        <span className={`flex-none text-xs text-[#15803d] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5">
          {error ? (
            <p className="rounded-[10px] bg-white px-3 py-2.5 text-[13px] text-red-700">{error}</p>
          ) : loading && !message ? (
            <p className="rounded-[10px] bg-white px-3 py-2.5 text-[13px] text-gray-500">Getting their login ready…</p>
          ) : message ? (
            <>
              <div className="whitespace-pre-line rounded-[10px] border border-[#d9f2e2] bg-white p-3 text-[13px] leading-[1.65] text-gray-700">{message}</div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => { void copy(); }} className="min-h-[44px] flex-[1_1_120px] rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-gray-700">
                  {copied ? 'Copied' : 'Copy message'}
                </button>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] flex-[1_1_150px] items-center justify-center rounded-[10px] bg-[#25d366] px-3.5 py-2.5 text-[13px] font-semibold text-white">
                    Send in WhatsApp
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
              <p>{firstName} has chosen their own password. Only they know it.</p>
              {confirmNewCode ? (
                <div className="mt-2.5">
                  <p className="text-[12.5px] text-gray-500">A new code replaces their password and signs them out. Send it to them straight after.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setConfirmNewCode(false)} className="min-h-[40px] flex-1 rounded-[10px] border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-700">Cancel</button>
                    <button type="button" onClick={() => { setConfirmNewCode(false); void load({ newCode: true }); }} disabled={loading} className="min-h-[40px] flex-1 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-white disabled:opacity-60">Create new code</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmNewCode(true)} className="mt-2 text-[13px] font-semibold text-[#c2410c]">
                  Forgot their password? Create a new code
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
