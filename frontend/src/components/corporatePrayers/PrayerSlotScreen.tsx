import React, { useEffect, useState } from 'react';
import type { PrayerCounts, PrayerPerson } from '../../types';
import { gradientFor, initialsOf, mmss, renderPrayer } from '../../utils/prayerText';
import Spinner from '../Spinner';

// The prayer screen: the person (photo under a dark gradient, or a coloured circle with initials), what they are
// believing God for, the verse prayer with their name, a timer, live counts and Amen. Used for the real thing and,
// with sample data, for the admin Preview, so the two cannot drift apart.

export interface PrayerScreenModel {
  slotLabel: string;
  person: PrayerPerson | null;
  projectText: string | null;
  verse: { prayer: string; reference: string } | null;
  counts: PrayerCounts;
  timerMinutes: number;
  /** When this person opened the slot (ms since epoch, server time). Null in a preview: the timer sits at full. */
  checkedInAtMs: number | null;
  amenDone: boolean;
}

interface Props {
  model: PrayerScreenModel;
  /** Server time minus this phone's time, so the countdown follows the server. */
  clockOffsetMs: number;
  onAmen: () => void;
  onLeave: () => void;
  busy?: boolean;
  error?: string;
  /** Draw inside a frame instead of over the whole screen (the admin preview). */
  embedded?: boolean;
}

const RING = 2 * Math.PI * 40;

const PrayerSlotScreen: React.FC<Props> = ({ model, clockOffsetMs, onAmen, onLeave, busy = false, error = '', embedded = false }) => {
  const [tick, setTick] = useState(() => Date.now());
  // Amen ends the prayer, so a tap on it asks first (a slip of the thumb would close the screen).
  const [confirming, setConfirming] = useState(false);
  // A clock that only ticks locally, to redraw the countdown. It does not call the server.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const totalMs = model.timerMinutes * 60000;
  const endsAt = model.checkedInAtMs !== null ? model.checkedInAtMs + totalMs : null;
  const remaining = endsAt !== null ? endsAt - (tick + clockOffsetMs) : totalMs;
  const timeUp = endsAt !== null && remaining <= 0;
  // The ring starts full and drains as the time goes.
  const left = endsAt !== null ? Math.min(1, Math.max(0, remaining / totalMs)) : 1;
  const { person, verse, projectText, counts } = model;
  const name = person?.fullName ?? 'the cohort';
  const [from, to] = gradientFor(name);

  const frame = embedded
    ? 'relative h-[680px] w-full max-w-[390px] overflow-y-auto rounded-[32px] bg-[#0b1020] text-white shadow-xl'
    : 'fixed inset-0 z-[150] overflow-y-auto bg-[#0b1020] text-white';

  return (
    <div className={frame} role="dialog" aria-modal={!embedded} aria-label={`Praying for ${name}`}>
      <div className="relative flex min-h-full flex-col">
        <div className="relative h-[42vh] min-h-[270px] max-h-[380px] flex-none overflow-hidden" style={person?.avatarUrl ? undefined : { background: `linear-gradient(135deg, ${from}, ${to})` }}>
          {person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : (
            <span className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 text-[88px] font-bold leading-none text-white/90" aria-hidden="true">{person ? initialsOf(person.fullName) : '✦'}</span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-[#0b1020]/60 to-black/10" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
            <button type="button" onClick={onLeave} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-black/35 px-3.5 text-[13px] font-semibold text-white backdrop-blur active:scale-95">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m15 18-6-6 6-6" /></svg>
              Leave
            </button>
            <span className="rounded-full bg-black/35 px-3 py-1.5 text-[12px] font-semibold text-white/90 backdrop-blur">{model.slotLabel}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70">Praying for</p>
            <h1 className="mt-0.5 text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">{name}</h1>
          </div>
        </div>

        <div className="flex-1 space-y-5 px-6 pb-44 pt-3">
          {projectText && (
            <section className="rounded-[20px] bg-white/10 p-4 backdrop-blur">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/60">What they are believing God for</h2>
              <p className="mt-1.5 whitespace-pre-line text-[17px] leading-[1.55]">{projectText}</p>
            </section>
          )}
          {verse ? (
            <section>
              <p className="text-[19px] leading-[1.6] text-white/95">{renderPrayer(verse.prayer, person?.firstName ?? 'everyone')}</p>
              <p className="mt-2 text-sm font-semibold text-orange-300">{verse.reference}</p>
            </section>
          ) : (
            <p className="text-[15px] leading-[1.55] text-white/70">{person ? 'Pray for them in your own words.' : 'No one is lined up for this prayer today. Pray for the cohort.'}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold text-white/90">{counts.praying} praying</span>
            <span className="rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold text-white/90">{counts.amen} said Amen</span>
          </div>
        </div>

        <div className={`${embedded ? 'sticky' : 'fixed'} inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#0b1020] via-[#0b1020]/95 to-transparent px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-8 ${embedded ? '' : 'mx-auto max-w-xl'}`}>
          {error && <p className="mb-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p>}
          {model.amenDone ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[17px] font-semibold">Thank you for praying.</p>
              <button type="button" onClick={onLeave} className="flex h-[54px] w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#0b1020] active:scale-[0.98]">Done</button>
            </div>
          ) : confirming ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[17px] font-semibold">Are you done praying?</p>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex h-[54px] min-w-0 flex-1 items-center justify-center rounded-full bg-white/15 text-[16px] font-semibold text-white active:scale-[0.98] disabled:opacity-60">Not yet</button>
                <button type="button" onClick={onAmen} disabled={busy} className="flex h-[54px] min-w-0 flex-1 items-center justify-center rounded-full bg-white text-[16px] font-bold text-[#0b1020] active:scale-[0.98] disabled:opacity-60">
                  {busy ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" />Saving…</span> : 'Yes, Amen'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-[84px] w-[84px] flex-none" role="timer" aria-label={timeUp ? 'Time is up' : `${mmss(remaining)} left`}>
                <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#fb923c" strokeWidth="6" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - left)} />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-[17px] font-bold tabular-nums">{timeUp ? 'Done' : mmss(remaining)}</span>
              </div>
              <button type="button" onClick={() => setConfirming(true)} className="flex h-[58px] min-w-0 flex-1 items-center justify-center rounded-full bg-white text-[17px] font-bold text-[#0b1020] transition active:scale-[0.98]">Amen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrayerSlotScreen;
