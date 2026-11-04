import React from 'react';
import type { PrayerCounts, PrayerWall } from '../../types';
import { clockLabel, lagosClock } from '../../utils/prayerText';
import { WallList } from './PrayerWall';

// When you are the one being prayed for: how many are praying and have said Amen (numbers, never names). You can close it.

const PrayedForScreen: React.FC<{ counts: PrayerCounts; hasProject: boolean; onClose: () => void }> = ({ counts, hasProject, onClose }) => (
  <div className="fixed inset-0 z-[150] flex flex-col overflow-y-auto bg-gradient-to-br from-[#2a1b4f] to-[#0b1020] text-white" role="dialog" aria-modal="true" aria-labelledby="prayed-for-title">
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-[max(26px,env(safe-area-inset-top))]">
      <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.08em] text-white/85"><span className="h-[9px] w-[9px] animate-pulse rounded-full bg-[#e8455a]" aria-hidden="true" />HAPPENING NOW</p>
      <h1 id="prayed-for-title" className="mt-6 text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em]">Today, we&apos;re praying for you</h1>
      <p className="mt-2 text-[15.5px] leading-relaxed text-white/80">Your FOF family is praying {hasProject ? 'over your faith project' : 'for you'} right now.</p>
      <div className="mt-7 grid grid-cols-2 gap-2.5">
        <div className="rounded-[18px] bg-white/[.08] p-4"><p className="text-[40px] font-extrabold leading-none">{counts.praying}</p><p className="mt-1.5 text-[13.5px] text-white/80">praying now</p></div>
        <div className="rounded-[18px] bg-white/[.16] p-4"><p className="text-[40px] font-extrabold leading-none">{counts.amen}</p><p className="mt-1.5 text-[13.5px] text-white/90">said Amen</p></div>
      </div>
      <p className="mt-5 text-[14px] leading-relaxed text-white/70">You see how many, not who. You&apos;ll see the words people leave for you when it ends.</p>
      <span className="min-h-6 flex-1" />
      <button type="button" onClick={onClose} className="flex h-[52px] items-center justify-center rounded-full bg-white text-[16px] font-bold text-[#0b1020] active:scale-[0.98]">Back to Home</button>
    </div>
  </div>
);

export default PrayedForScreen;

// Afterwards: how many prayed for you, and the words they left (with first names). Also sent as a notification.
export const PrayedForSummary: React.FC<{ wall: PrayerWall; onClose: () => void }> = ({ wall, onClose }) => {
  const n = wall.prayedForYou ?? 0;
  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#f4f5f8] text-gray-900" role="dialog" aria-modal="true" aria-labelledby="prayed-summary-title">
      <div className="flex-none bg-gradient-to-br from-[#2a1b4f] to-[#0b1020] px-5 pb-6 pt-[max(26px,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-xl">
          <h1 id="prayed-summary-title" className="text-[28px] font-extrabold leading-tight">{n} {n === 1 ? 'person' : 'people'} prayed for you</h1>
          <p className="mt-1.5 text-[14px] text-white/80">Today{wall.opensAt ? `, ${clockLabel(lagosClock(wall.opensAt))}` : ''}{wall.hasProject ? ' · for your faith project' : ''}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-4">
          <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-gray-500">Words for you</h2>
          <WallList posts={wall.posts} empty="No words were left this time, but people prayed for you." />
        </div>
      </div>
      <div className="flex-none border-t border-gray-200 bg-white px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={onClose} className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#0b1020] text-[16px] font-bold text-white">Back to Home</button>
          <p className="mt-2 text-center text-[12.5px] text-gray-500">It&apos;s also in your notifications, so you can read it again.</p>
        </div>
      </div>
    </div>
  );
};
