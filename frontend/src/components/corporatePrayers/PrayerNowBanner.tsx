import React, { useEffect, useState } from 'react';
import { prayerSlotApi } from '../../services/api';
import type { PrayerNow } from '../../types';
import { usePrayerSignal } from '../../hooks/usePrayerSignal';
import { clockLabel, forMeSeen, lagosClock, lagosDayKey } from '../../utils/prayerText';
import PersonCircle from './PersonCircle';

// The prayer card at the top of Home (Option B). One of:
//   a prayer on now that you have not started (you came in late): who it is for, minutes left, Start praying;
//   one you started and have not said Amen to: Finish praying;
//   you are the one being prayed for: a tap shows how many are praying;
//   the live prayer on Telegram: Join;
//   one you missed today: you can still pray it until midnight, and it counts;
//   you were prayed for today and it has ended: read the words people left;
//   otherwise the next prayer, which opens by itself.
// The person and counts come from one read per prayer (kept for the session of the app), not from the minute check.

// Kept for a minute, so the counts on the card move along with the prayer.
const cache = new Map<string, { at: number; data: PrayerNow }>();
const CACHE_MS = 60000;

const usePrayerDetail = (sessionId: string | null) => {
  const [data, setData] = useState<PrayerNow | null>(() => (sessionId ? cache.get(sessionId)?.data ?? null : null));
  const { signal } = usePrayerSignal();
  const minute = signal?.open?.serverNow ?? signal?.missed?.serverNow ?? signal?.unfinished?.serverNow ?? '';
  useEffect(() => {
    if (!sessionId) { setData(null); return undefined; }
    const known = cache.get(sessionId);
    if (known) setData(known.data);
    if (known && Date.now() - known.at < CACHE_MS) return undefined;
    let cancelled = false;
    void prayerSlotApi.now(sessionId).then((next) => {
      if (next.session?.id !== sessionId) return;
      cache.set(sessionId, { at: Date.now(), data: next });
      if (!cancelled) setData(next);
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // `minute` re-checks with each minute's signal; the cache keeps it to one read a minute.
  }, [sessionId, minute]);
  return data;
};

const Face: React.FC<{ data: PrayerNow | null }> = ({ data }) => (
  <PersonCircle name={data?.person?.fullName ?? 'FOF'} avatarUrl={data?.person?.avatarUrl ?? null} size={56} className="border-2 border-white/50" />
);

const DARK = 'flex w-full flex-col gap-3 rounded-[22px] bg-gradient-to-br from-[#1b1038] to-[#0b1020] p-4 text-left text-white shadow-md active:scale-[0.99]';
const KICKER = 'flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-white/85';
const DOT = <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-[#e8455a]" aria-hidden="true" />;
const ACTION = 'flex h-[46px] items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#0b1020]';

const PrayerNowBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { signal, start } = usePrayerSignal();
  const open = signal?.open ?? null;
  const unfinished = signal?.unfinished ?? null;
  const missed = signal?.missed ?? null;
  const dailyOpen = open && open.slotType !== 'LIVE' && !open.amen ? open : null;
  const detailId = dailyOpen?.sessionId ?? unfinished?.sessionId ?? missed?.sessionId ?? null;
  const detail = usePrayerDetail(detailId);
  const firstName = detail?.person?.firstName || detail?.person?.fullName || null;

  if (open && open.slotType === 'LIVE' && !open.cantJoin && !open.tapped) {
    return (
      <button type="button" onClick={() => start(open.sessionId)} className={`${DARK} ${className}`} data-wt="prayer-now">
        <span className={KICKER}>{DOT}Live now · {clockLabel(lagosClock(open.opensAt))}</span>
        <span className="text-[19px] font-extrabold">Live prayer on Telegram</span>
        <span className={ACTION}>Join on Telegram</span>
      </button>
    );
  }

  if (dailyOpen?.isMe) {
    return (
      <button type="button" onClick={() => start(dailyOpen.sessionId)} className={`${DARK} ${className}`} data-wt="prayer-now">
        <span className={KICKER}>{DOT}Happening now</span>
        <span className="text-[19px] font-extrabold">Today, we&apos;re praying for you</span>
        <span className="text-[13.5px] text-white/80">Tap to see how many are praying.</span>
      </button>
    );
  }

  if (dailyOpen || unfinished) {
    const id = (dailyOpen ?? unfinished)!.sessionId;
    const startedIt = !!dailyOpen?.checkedIn || !!unfinished;
    const minutesLeft = dailyOpen ? Math.max(1, Math.ceil((Date.parse(dailyOpen.closesAt) - Date.parse(dailyOpen.serverNow)) / 60000)) : 0;
    const prayed = detail?.counts?.amen ?? 0;
    return (
      <button type="button" onClick={() => start(id)} className={`${DARK} ${className}`} data-wt="prayer-now">
        <span className={KICKER}>{DOT}{startedIt ? 'You started this prayer' : `Praying now · open for ${minutesLeft} more min`}</span>
        <span className="flex items-center gap-3">
          <Face data={detail} />
          <span className="min-w-0">
            <span className="block text-[19px] font-extrabold">{firstName ? `Pray for ${firstName}` : 'Time to pray'}</span>
            <span className="mt-0.5 block text-[13.5px] text-white/80">{startedIt ? 'Your timer kept going. Finish with Amen.' : `${prayed > 0 ? `${prayed} have prayed · ` : ''}your timer starts when you begin`}</span>
          </span>
        </span>
        <span className={ACTION}>{startedIt ? 'Finish praying' : 'Start praying'}</span>
      </button>
    );
  }

  if (missed) {
    const prayed = detail?.counts?.amen ?? 0;
    return (
      <button type="button" onClick={() => start(missed.sessionId)} className={`${DARK} ${className}`} data-wt="prayer-now">
        <span className={KICKER}>You missed the {clockLabel(lagosClock(missed.opensAt))} prayer</span>
        <span className="flex items-center gap-3">
          <Face data={detail} />
          <span className="min-w-0">
            <span className="block text-[19px] font-extrabold">{firstName ? `Pray for ${firstName} now` : 'Pray it now'}</span>
            <span className="mt-0.5 block text-[13.5px] text-white/80">{prayed > 0 ? `${prayed} prayed already. ` : ''}It still counts.</span>
          </span>
        </span>
        <span className={ACTION}>Start praying</span>
      </button>
    );
  }

  const forMe = signal?.forMe ?? null;
  if (forMe && !open && !forMeSeen(forMe.sessionId)) {
    return (
      <button type="button" onClick={() => start(forMe.sessionId)} className={`${DARK} ${className}`} data-wt="prayer-now">
        <span className={KICKER}>Today&apos;s {clockLabel(lagosClock(forMe.opensAt))} prayer</span>
        <span className="text-[19px] font-extrabold">Your FOF family prayed for you</span>
        <span className={ACTION}>Read the words they left</span>
      </button>
    );
  }

  const next = signal?.next ?? null;
  if (next && !open) {
    const today = lagosDayKey(next.opensAt) === lagosDayKey(new Date().toISOString());
    return (
      <div className={`rounded-[18px] bg-white px-4 py-3.5 shadow-sm ${className}`} data-wt="prayer-now">
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-500">Next prayer</p>
        <p className="mt-1 text-[17px] font-extrabold text-gray-900">{today ? '' : 'Tomorrow, '}{clockLabel(lagosClock(next.opensAt))}{next.slotType === 'LIVE' ? ' · on Telegram' : ''}</p>
        <p className="mt-0.5 text-[13.5px] text-gray-600">It opens by itself when it starts.</p>
      </div>
    );
  }

  return null;
};

export default PrayerNowBanner;
