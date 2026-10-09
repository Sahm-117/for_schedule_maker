import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { participantAppApi } from '../../services/api';
import Spinner from '../Spinner';

// Shown to every participant a few days before corporate prayers start, until they answer. It has no close button and
// does not dismiss on a tap outside or Escape: the only way out is to answer. Everyone is included unless they opt out,
// and the Faith Project page keeps a switch so the answer can be changed later.

const PrayerConsentModal: React.FC<{ startsOn: string; onAnswered: () => void }> = ({ startsOn, onAnswered }) => {
  const [saving, setSaving] = useState<'in' | 'out' | null>(null);
  const [error, setError] = useState('');
  const date = new Date(`${startsOn}T12:00:00`);
  const startText = Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

  const answer = async (consent: boolean) => {
    setSaving(consent ? 'in' : 'out');
    setError('');
    try {
      await participantAppApi.setPrayerConsent(consent);
      onAnswered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="prayerconsent-title">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white px-6 pb-6 pt-7 shadow-xl sm:max-w-md sm:rounded-[28px]">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z" /></svg>
        </span>
        <h2 id="prayerconsent-title" className="mt-4 text-[22px] font-bold leading-tight tracking-[-0.02em] text-gray-900">Praying for your faith project</h2>
        <p className="mt-2 text-[15px] leading-[1.55] text-gray-600">
          {startText ? `From ${startText}, ` : 'Soon, '}everyone in this cohort will pray together for each person&apos;s faith project. The system is set up to schedule yours too, with your photo and what you are believing God for, so the whole cohort can pray for you.
        </p>
        <p className="mt-3 text-[15px] leading-[1.55] text-gray-600">
          If you would rather it is not prayed for like this, you can opt out. You can change your mind any time on your Faith Project page.
        </p>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col gap-2.5">
          <button type="button" onClick={() => { void answer(true); }} disabled={saving !== null} className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60">
            {saving === 'in' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : "I'm fine with this"}
          </button>
          <button type="button" onClick={() => { void answer(false); }} disabled={saving !== null} className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-60">
            {saving === 'out' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Opt out'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PrayerConsentModal;
