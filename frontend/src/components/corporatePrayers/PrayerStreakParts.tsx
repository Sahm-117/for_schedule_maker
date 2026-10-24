import React, { useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import type { PrayerStreak, PrayerStreakSlot } from '../../types';
import { MILESTONES } from '../../utils/prayerMilestones';
import { clockLabel, lagosClock } from '../../utils/prayerText';

// The prayer streak pieces: the streak card (Faith), today's prayers (Faith), the group total (Faith), a small streak row
// (My Journey) and the chip on Home. All of them read the same PrayerStreak.

const SURFACE = 'rounded-[28px] border border-[#efe8e1] bg-white';
const CARD = 'rounded-[20px] border border-[#efe8e1] bg-white';

const FlameIcon: React.FC<{ size?: number; color?: string }> = ({ size = 30, color = '#ea580c' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" /></svg>
);

export const StreakCard: React.FC<{ streak: PrayerStreak; onOpenBadge: (n: number) => void }> = ({ streak, onOpenBadge }) => {
  const current = streak.current ?? 0;
  const best = streak.best ?? 0;
  const total = streak.total ?? 0;
  const earned = new Set((streak.milestones ?? []).map((m) => m.milestone));
  const next = MILESTONES.find((m) => m.n > current);
  const left = next ? next.n - current : 0;
  const programmeDays = streak.programmeDays ?? 0;
  // The last badge is "every prayer day of the programme", not a day count.
  const toFull = next?.n === 70;
  const goalText = !next ? 'Every badge earned'
    : toFull ? 'Pray every day to the end for the Full cohort badge'
      : `${left} more ${left === 1 ? 'day' : 'days'} to ${next.n} days in a row`;
  const goalPct = !next ? 100 : toFull ? (programmeDays > 0 ? Math.min(100, Math.round((current / programmeDays) * 100)) : 0) : Math.round((current / next.n) * 100);
  const slots = streak.slots ?? [];
  const doneCount = slots.filter((s) => s.amen).length;
  const dots = slots.slice(0, 3);
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  return (
    <section aria-label="Prayer streak" className={`${SURFACE} flex flex-col gap-4 px-5 py-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-500">Prayer streak</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[56px] font-extrabold leading-none tracking-[-0.04em] text-gray-900">{current}</span>
            <span className="text-[16px] font-semibold text-stone-700">{current === 1 ? 'day in a row' : 'days in a row'}</span>
          </div>
        </div>
        <span className="grid h-14 w-14 flex-none place-items-center rounded-[18px] bg-[#fff1e8]"><FlameIcon /></span>
      </div>

      <div className="flex flex-col gap-2">
        <div role="img" aria-label={goalText} className="h-2 overflow-hidden rounded-full bg-[#f1ece6]">
          <div className="h-full rounded-full bg-[#ea580c]" style={{ width: `${goalPct}%` }} />
        </div>
        <div className="flex justify-between gap-2 text-[13px]">
          <span className="font-semibold text-stone-700">{current === 0 ? 'Finish a prayer to start your streak' : goalText}</span>
          <span className="flex-none font-semibold text-gray-500">Best {best} · {total} {total === 1 ? 'prayer' : 'prayers'}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[#faf7f4] px-3 py-2.5">
        {dots.length > 0 && (
          <div role="img" aria-label={`Today: ${doneCount} of ${slots.length} prayers finished`} className="flex flex-none gap-1.5">
            {dots.map((s) => (
              <span key={s.slotId} className={`h-[22px] w-[22px] rounded-full border-2 ${s.amen ? 'border-[#ea580c] bg-[#ea580c]' : 'border-[#e7ddd3] bg-white'}`} />
            ))}
          </div>
        )}
        <p className="min-w-[150px] flex-1 text-[12.5px] leading-snug text-stone-700">{streak.prayedToday ? 'Today counts. Your streak is safe.' : 'Finish one prayer today to keep your streak.'}</p>
        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11.5px] font-bold text-sky-800">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /></svg>
          {streak.restUsed ? 'Rest day used' : '1 rest day'}
        </span>
      </div>

      <div className="relative">
        <div
          ref={scroller}
          role="group"
          aria-label="Streak badges, scroll sideways"
          onScroll={(e) => { const el = e.currentTarget; setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4); }}
          className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MILESTONES.map((m) => {
            const got = earned.has(m.n);
            return (
              <button
                key={m.n}
                type="button"
                disabled={!got}
                onClick={() => onOpenBadge(m.n)}
                aria-label={got ? `${m.name} badge, earned. Open it` : m.n === 70 ? `${m.name} badge, locked. Pray on every prayer day of the programme` : `${m.name} badge, locked. Reach ${m.n} days in a row`}
                className="flex w-16 flex-none snap-start flex-col items-center gap-1.5 disabled:cursor-default"
              >
                <span className="grid h-14 w-14 place-items-center rounded-[18px] text-[18px] font-extrabold" style={got ? { background: m.badge, color: m.fg } : { background: '#f3f0ec', color: '#a8a29e' }}>
                  {got || m.n === 70 ? <svg width="26" height="26" viewBox="0 0 24 24" fill={got ? m.fg : '#a8a29e'} aria-hidden="true"><path d={m.icon} /></svg> : m.n}
                </span>
                <span className="text-[11.5px] font-semibold text-stone-700">{m.name}</span>
              </button>
            );
          })}
        </div>
        {!atEnd && (
          <span aria-hidden="true" className="pointer-events-none absolute -right-3 top-3.5 grid h-7 w-7 place-items-center rounded-full border border-[#ece7e2] bg-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44403c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        )}
      </div>
    </section>
  );
};

const slotLabel = (s: PrayerStreakSlot) => s.name?.trim() || (s.slotType === 'LIVE' ? 'Live prayer' : 'Prayer');

export const TodayPrayers: React.FC<{ slots: PrayerStreakSlot[]; prayPath: string; serverNow?: string }> = ({ slots, prayPath, serverNow }) => {
  const navigate = useNavigate();
  // The server's clock, not the phone's: a phone a few minutes off must not show Join on a closed prayer. Redrawn every 30 seconds.
  const offsetRef = useRef(serverNow ? Date.parse(serverNow) - Date.now() : 0);
  const [, setTick] = useState(0);
  usePolling(async () => { setTick((t) => t + 1); }, 30000, { catchUp: true });
  if (slots.length === 0) return null;
  const now = Date.now() + offsetRef.current;
  return (
    <section aria-labelledby="today-prayers-h" className="flex flex-col gap-2">
      <h2 id="today-prayers-h" className="mx-1 text-[13px] font-bold text-gray-600">Today&apos;s prayers</h2>
      <div className={`${CARD} flex flex-col overflow-hidden`}>
        {slots.map((s, i) => {
          const opens = Date.parse(s.opensAt);
          const closes = Date.parse(s.closesAt);
          const isOpen = now >= opens && now < closes;
          const ended = now >= closes;
          const sub = s.slotType === 'LIVE' ? 'Live on Telegram' : isOpen ? `Join until ${clockLabel(lagosClock(s.closesAt))}` : 'Prayer';
          return (
            <div key={s.slotId} className={`flex items-center gap-3 px-4 py-3.5 ${i < slots.length - 1 ? 'border-b border-[#f1ece6]' : ''}`}>
              <span className="w-[76px] flex-none whitespace-nowrap text-[15px] font-extrabold text-gray-900">{clockLabel(lagosClock(s.opensAt)).toUpperCase()}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold text-gray-900">{slotLabel(s)}</span>
                <span className="text-[12.5px] text-gray-600">{sub}</span>
              </span>
              {s.amen ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[12px] font-bold text-green-800">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>Amen
                </span>
              ) : isOpen ? (
                <button type="button" onClick={() => navigate(s.sessionId ? `${prayPath}?s=${s.sessionId}` : prayPath)} className="min-h-[44px] rounded-xl bg-[#c2410c] px-5 text-[14px] font-extrabold text-white">{s.joined ? 'Continue' : 'Join'}</button>
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${ended ? 'bg-gray-100 text-gray-600' : 'bg-sky-100 text-sky-800'}`}>{ended ? 'Ended' : 'Upcoming'}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const GroupPrayerTotal: React.FC<{ groupName?: string | null; total: number }> = ({ groupName, total }) => {
  if (!groupName || total <= 0) return null;
  return (
    <section aria-label="Group total" className={`${CARD} flex items-center gap-3 px-4 py-3.5`}>
      <span aria-hidden="true" className="grid h-11 w-11 flex-none place-items-center rounded-[14px] bg-emerald-50 text-emerald-700">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-[15px] font-bold text-gray-900">{groupName} prayed {total} {total === 1 ? 'time' : 'times'} this week</span>
        <span className="text-[12.5px] text-gray-600">Together, not a race. Everyone counts.</span>
      </span>
    </section>
  );
};

/** The Journey version: the number and a seven-day strip. */
export const StreakRow: React.FC<{ streak: PrayerStreak; to: string }> = ({ streak, to }) => {
  const navigate = useNavigate();
  const days = streak.days ?? [];
  const current = streak.current ?? 0;
  return (
    <button type="button" onClick={() => navigate(to)} className="flex w-full items-center gap-3.5 rounded-[20px] border border-[#eef0f4] bg-white px-[18px] py-3.5 text-left shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-[#fff1e8]"><FlameIcon size={24} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-gray-900">{current} {current === 1 ? 'day' : 'days'} in a row</span>
        <span className="block text-[12.5px] text-gray-500">{streak.prayedToday ? 'Today counts' : 'Finish one prayer today'} · {streak.total ?? 0} prayers in all</span>
      </span>
      {days.length > 0 && (
        <span className="flex flex-none gap-1" role="img" aria-label="The last seven prayer days">
          {days.slice(-7).map((d) => <span key={d.date} className={`h-2.5 w-2.5 rounded-full ${d.prayed ? 'bg-[#ea580c]' : 'bg-[#e7e5e4]'}`} />)}
        </span>
      )}
    </button>
  );
};

/** The small chip on Home's Faith Project row. */
export const StreakChip: React.FC<{ current: number }> = ({ current }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1e8] px-2.5 py-1 text-[12px] font-bold text-[#c2410c]">
    <FlameIcon size={12} color="#ea580c" />{current}-day streak
  </span>
);
