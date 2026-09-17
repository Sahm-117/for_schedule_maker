import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { participantAppApi } from '../../services/api';
import { buildWhatsAppLink } from '../../utils/phone';
import type { CheckInResponse, ParticipantHome } from '../../types';

// "Are you okay?" — shown to a participant whose attendance puts them at
// keep an eye on or needs attention. Worded from their own record; never mentions
// statuses or concerns. "I need help" alerts their support straight away.

interface CheckInModalProps {
  home: ParticipantHome;
  misses: { sunday: number; meeting: number };
  onAnswered: (response: CheckInResponse) => void;
  onLater: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const CheckInModal: React.FC<CheckInModalProps> = ({ home, misses, onAnswered, onLater }) => {
  const [busy, setBusy] = useState<CheckInResponse | null>(null);
  const [error, setError] = useState('');
  const [askedForHelp, setAskedForHelp] = useState(false);

  const supportName = home.group?.supportName?.trim() || '';
  const supportFirst = supportName.split(' ')[0];
  const firstName = home.participant.name.split(' ')[0];

  const missedParts = [
    misses.sunday > 0 ? plural(misses.sunday, 'Sunday class', 'Sunday classes') : '',
    misses.meeting > 0 ? plural(misses.meeting, 'group prayer meeting', 'group prayer meetings') : '',
  ].filter(Boolean);

  const waLink = buildWhatsAppLink(home.group?.supportPhone, `Hi ${supportFirst}, it's ${firstName} from FOF.`);

  const answer = async (response: CheckInResponse) => {
    setBusy(response);
    setError('');
    try {
      await participantAppApi.recordCheckIn(response, misses, home.participant.name);
      if (response === 'NEED_HELP') {
        setAskedForHelp(true);
      } else {
        onAnswered(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        {askedForHelp ? (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f2fbf5] text-[#15803d]" aria-hidden="true">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 13 4 4L19 7" /></svg>
            </span>
            <h2 id="checkin-title" className="mt-3 text-lg font-bold text-gray-900">Thank you for telling us</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">
              {supportName ? `${supportFirst} has been told and will reach out to you soon.` : 'Your FOF team has been told and will reach out to you soon.'}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#25d366] px-4 text-[15px] font-semibold text-white">
                  Message {supportFirst} now
                </a>
              )}
              <button type="button" onClick={() => onAnswered('NEED_HELP')} className="min-h-[48px] rounded-xl border border-gray-200 bg-white px-4 text-[15px] font-semibold text-gray-700">
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z" /></svg>
            </span>
            <h2 id="checkin-title" className="mt-3 text-lg font-bold text-gray-900">We have missed you, {firstName}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">
              You have missed {missedParts.join(' and ')} so far. Are you okay?
            </p>
            {supportName && (
              <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{supportFirst}, your support, would love to hear from you.</p>
            )}
            {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { void answer('OKAY'); }} disabled={busy !== null} className="min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 text-[15px] font-semibold text-gray-700 disabled:opacity-60">
                {busy === 'OKAY' ? 'Sending…' : 'I’m okay'}
              </button>
              <button type="button" onClick={() => { void answer('NEED_HELP'); }} disabled={busy !== null} className="min-h-[48px] rounded-xl bg-primary px-3 text-[15px] font-semibold text-white disabled:opacity-60">
                {busy === 'NEED_HELP' ? 'Sending…' : 'I need help'}
              </button>
            </div>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" className="mt-2 flex min-h-[44px] items-center justify-center text-[14px] font-semibold text-[#c2410c]">
                Message {supportFirst} on WhatsApp
              </a>
            )}
            <button type="button" onClick={onLater} className="mt-1 block w-full py-2 text-center text-[13px] font-medium text-gray-400">
              Not now
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CheckInModal;
