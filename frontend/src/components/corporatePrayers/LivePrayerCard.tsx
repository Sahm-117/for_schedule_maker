import React, { useEffect, useState } from 'react';
import { mmss } from '../../utils/prayerText';
import Spinner from '../Spinner';

// The live prayer: one line, the Telegram link, and "Prayed", which unlocks a few minutes after the link is tapped
// (the wait is set by the admin). If the link could not be opened, a way out appears after ten minutes.

interface Props {
  link: string;
  message: string | null;
  waitMinutes: number;
  checkedInAtMs: number;
  linkTappedAtMs: number | null;
  clockOffsetMs: number;
  busy: boolean;
  error: string;
  onTapLink: () => void;
  onPrayed: (withoutLink: boolean) => void;
}

const ESCAPE_AFTER_MS = 10 * 60000;

const LivePrayerCard: React.FC<Props> = ({ link, message, waitMinutes, checkedInAtMs, linkTappedAtMs, clockOffsetMs, busy, error, onTapLink, onPrayed }) => {
  const [tick, setTick] = useState(() => Date.now());
  // Redraws the countdown from this phone's clock; it makes no request.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const now = tick + clockOffsetMs;
  const unlockAt = linkTappedAtMs !== null ? linkTappedAtMs + waitMinutes * 60000 : null;
  const waitLeft = unlockAt !== null ? unlockAt - now : null;
  const canPray = waitLeft !== null && waitLeft <= 0;
  const canEscape = linkTappedAtMs === null && now - checkedInAtMs >= ESCAPE_AFTER_MS;

  return (
    <div className="flex flex-col gap-4">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
      </span>
      <div>
        <h2 id="live-prayer-title" className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-gray-900">Live prayer</h2>
        <p className="mt-1.5 text-[15px] leading-[1.55] text-gray-600">{message || 'Join the live prayer on Telegram.'}</p>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onTapLink}
        className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
      >
        Open Telegram
      </a>
      {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">{error}</p>}
      <button
        type="button"
        onClick={() => onPrayed(false)}
        disabled={!canPray || busy}
        className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Prayed'}
      </button>
      <p className="-mt-1 text-center text-[13px] text-gray-500" aria-hidden="true">
        {linkTappedAt(linkTappedAtMs, canPray, waitLeft)}
      </p>
      {/* Spoken only when the state changes, not on every tick of the countdown. */}
      <p className="sr-only" role="status">
        {canPray ? 'Prayed is now available.' : linkTappedAtMs === null ? 'Open Telegram first. Prayed unlocks a few minutes after.' : 'Prayed will unlock after the wait.'}
      </p>
      {canEscape && (
        <button type="button" onClick={() => onPrayed(true)} disabled={busy} className="min-h-[44px] text-center text-[13px] font-semibold text-gray-500 underline-offset-2 hover:underline disabled:opacity-60">
          I could not open Telegram
        </button>
      )}
    </div>
  );
};

const linkTappedAt = (tapped: number | null, canPray: boolean, waitLeft: number | null) => {
  if (tapped === null) return 'Open Telegram first. Prayed unlocks a few minutes after.';
  if (canPray) return 'You can tap Prayed when you are done.';
  return `Prayed unlocks in ${mmss(waitLeft ?? 0)}`;
};

export default LivePrayerCard;
