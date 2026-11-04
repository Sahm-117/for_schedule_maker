import React, { useEffect, useState } from 'react';
import type { PrayerCounts, PrayerNext } from '../../types';
import { clockLabel, lagosClock, lagosDayKey } from '../../utils/prayerText';
import Spinner from '../Spinner';

// The live prayer on Telegram (Option B). The app is not connected to Telegram: it only opens the link, so it counts who opened
// this screen and who tapped Join, never who is on the call. Its one job is getting people onto Telegram. There is no Amen, no
// wall and no replies. It cannot be closed while the prayer is on; after ten minutes without a tap "I can't join tonight" lets
// them out. When the prayer ends it says so and lets them go.

interface Props {
  title: string;
  message: string | null;
  link: string;
  opensAt: string;
  closesAt: string;
  counts: PrayerCounts;
  checkedInAtMs: number;
  linkTappedAtMs: number | null;
  clockOffsetMs: number;
  next?: PrayerNext | null;
  busy?: boolean;
  error?: string;
  onTapLink: () => void;
  onCantJoin: () => void;
  onDone: () => void;
  /** Draw inside a frame instead of over the whole screen (the admin preview). */
  embedded?: boolean;
}

const CANT_JOIN_AFTER_MS = 10 * 60000;

const TelegramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 3L2 11l7 2 2 7 4-5 5 4z" /></svg>
);

const LivePrayerScreen: React.FC<Props> = ({
  title, message, link, opensAt, closesAt, counts, checkedInAtMs, linkTappedAtMs, clockOffsetMs, next = null,
  busy = false, error = '', onTapLink, onCantJoin, onDone, embedded = false,
}) => {
  const [tick, setTick] = useState(() => Date.now());
  // Redraws the minutes left from this phone's clock; it makes no request.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const now = tick + clockOffsetMs;
  const ended = now >= Date.parse(closesAt);
  const minutesLeft = Math.max(1, Math.ceil((Date.parse(closesAt) - now) / 60000));
  const tapped = linkTappedAtMs !== null;
  const canSayCant = !tapped && now - checkedInAtMs >= CANT_JOIN_AFTER_MS;
  const opened = counts.joined;
  const joined = counts.tapped ?? 0;
  const notYet = Math.max(0, opened - joined);
  const startLabel = clockLabel(lagosClock(opensAt)).toUpperCase();

  const frame = embedded
    ? 'relative flex h-[720px] w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] shadow-xl'
    : 'fixed inset-0 z-[210] flex flex-col overflow-y-auto';

  return (
    <div className={`${frame} bg-gradient-to-br from-[#1b1038] to-[#0b1020] text-white`} role="dialog" aria-modal={!embedded} aria-labelledby="live-prayer-title">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className={`h-[9px] w-[9px] rounded-full ${ended ? 'bg-gray-400' : 'animate-pulse bg-[#e8455a]'}`} aria-hidden="true" />
          <span className="text-[12px] font-bold tracking-[0.08em] text-white/85">{ended ? `ENDED · ${clockLabel(lagosClock(closesAt)).toUpperCase()}` : `LIVE NOW · ${startLabel}`}</span>
          <span className="flex-1" />
          <span className="rounded-full bg-white/[.12] px-2.5 py-1 text-[12.5px] font-bold">{ended ? 'Ended' : `${minutesLeft} min left`}</span>
        </div>
        <h1 id="live-prayer-title" className="mt-[22px] text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-[1.45] text-white/80">{message || 'We pray together on Telegram. Join the call and pray with everyone.'}</p>

        <div className="mt-[26px] grid grid-cols-2 gap-2.5">
          <div className="rounded-[18px] bg-white/[.08] p-4"><p className="text-[40px] font-extrabold leading-none">{opened}</p><p className="mt-1.5 text-[13.5px] text-white/80">opened the app</p></div>
          <div className="rounded-[18px] border border-white/25 bg-white/[.16] p-4"><p className="text-[40px] font-extrabold leading-none">{joined}</p><p className="mt-1.5 text-[13.5px] text-white/90">tapped Join on Telegram</p></div>
        </div>

        {ended ? (
          <p className="mt-[18px] rounded-2xl bg-white/10 px-3.5 py-3 text-[14.5px] leading-[1.45] text-white/90">
            {tapped ? `Thank you for praying. You tapped Join at ${clockLabel(lagosClock(new Date(linkTappedAtMs).toISOString()))}.` : 'The live prayer has ended.'}
          </p>
        ) : tapped ? (
          <p className="mt-[18px] rounded-2xl bg-[#2aabee]/20 px-3.5 py-3 text-[14.5px] leading-[1.45] text-white/90"><b>You tapped Join.</b> You&apos;re one of the {joined} who did. Stay on the call until the prayer ends.</p>
        ) : canSayCant ? (
          <div className="mt-[18px] flex flex-col gap-1.5 rounded-2xl bg-[#fff7ed] p-3.5 text-[#7c2d12]">
            <p className="text-[16px] font-extrabold text-[#9a3412]">You haven&apos;t tapped Join yet</p>
            <p className="text-[14px] leading-[1.45]">It&apos;s been 10 minutes since you opened this. If Telegram isn&apos;t on your phone, install it or sign in, then tap Join.</p>
          </div>
        ) : notYet > 1 ? (
          <p className="mt-[18px] rounded-2xl bg-white/10 px-3.5 py-3 text-[14.5px] leading-[1.45] text-white/90">{notYet} people opened it but haven&apos;t tapped Join yet. Don&apos;t be one of them.</p>
        ) : null}

        {error && <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100" role="alert">{error}</p>}
        <span className="min-h-6 flex-1" />

        <div className="flex flex-col gap-3">
          {ended ? (
            <>
              <button type="button" onClick={onDone} className="flex h-[50px] items-center justify-center rounded-full border border-white/35 text-[15px] font-bold text-white active:scale-[0.98]">Back to Home</button>
              {next?.slotType === 'LIVE' && <p className="text-center text-[13px] text-white/70">Next live prayer: {lagosDayKey(next.opensAt) === lagosDayKey(new Date(now).toISOString()) ? 'today' : 'tomorrow'} at {clockLabel(lagosClock(next.opensAt))}</p>}
            </>
          ) : (
            <>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onTapLink}
                className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-[#2aabee] text-[17px] font-extrabold text-white shadow-[0_0_0_6px_rgba(42,171,238,.18)] active:scale-[0.98]"
              >
                <TelegramIcon />{tapped ? 'Back to Telegram' : 'Join on Telegram'}
              </a>
              {canSayCant && (
                <>
                  <button type="button" onClick={onCantJoin} disabled={busy} className="flex h-[50px] items-center justify-center rounded-full border border-white/35 text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-60">
                    {busy ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" />Saving…</span> : "I can't join tonight"}
                  </button>
                  <p className="text-center text-[12px] text-white/60">This closes the screen and notes that you couldn&apos;t join tonight.</p>
                </>
              )}
            </>
          )}
        </div>
        {/* Spoken only when the state changes, not every second. */}
        <p className="sr-only" role="status">{ended ? 'The live prayer has ended.' : tapped ? 'You tapped Join.' : canSayCant ? "You can now choose I can't join tonight." : ''}</p>
      </div>
    </div>
  );
};

export default LivePrayerScreen;
