import React from 'react';
import { Link } from 'react-router-dom';
import { usePrayerSignal } from '../../hooks/usePrayerSignal';

// On Home while a corporate prayer is open and you have not said Amen: one tap into the prayer screen.
const PrayerNowBanner: React.FC<{ to: string; className?: string }> = ({ to, className = '' }) => {
  const { signal } = usePrayerSignal();
  const open = signal?.open;
  if (!open || open.amen) return null;
  const live = open.slotType === 'LIVE';
  return (
    <Link
      // The session goes along so a support working in Practice lands on the Practice prayer.
      to={`${to}?s=${open.sessionId}`}
      className={`flex items-center gap-3 rounded-[20px] bg-gradient-to-br from-[#1b1038] to-[#0b1020] p-4 text-white shadow-md active:scale-[0.99] ${className}`}
      data-wt="prayer-now"
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15" aria-hidden="true">
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold leading-tight">{live ? 'Live prayer is on' : 'Time to pray'}</span>
        <span className="block text-[13px] text-white/70">{live ? 'Join on Telegram.' : 'Join the cohort in prayer.'}</span>
      </span>
      <span className="flex-none rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#0b1020]">Join</span>
    </Link>
  );
};

export default PrayerNowBanner;
