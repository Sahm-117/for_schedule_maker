import React from 'react';
import { NavLink } from 'react-router-dom';
import type { User } from '../../types';
import { supportProfileChecklist } from '../../utils/people';

// Support profile completion. On Home it's a loud nudge (with why it matters
// and a link to Profile); on Profile it's the quiet progress line.
const ProfileCompletionStrip: React.FC<{
  user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>;
  variant: 'home' | 'profile';
}> = ({ user, variant }) => {
  const checklist = supportProfileChecklist(user);
  const doneCount = checklist.filter((item) => item.done).length;
  const missing = checklist.filter((item) => !item.done);
  const percent = Math.round((doneCount / checklist.length) * 100);
  const phoneOnly = missing.length === 1 && missing[0].key === 'phone';

  if (missing.length === 0) {
    if (variant === 'home') return null;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        Profile complete
      </span>
    );
  }

  const bar = (tone: string) => (
    <div className={`h-1.5 overflow-hidden rounded-full ${tone}`}>
      <div className="h-full rounded-full bg-current transition-all" style={{ width: `${percent}%` }} />
    </div>
  );

  if (variant === 'profile') {
    return (
      <div className="text-orange-700">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
          <span>Profile {percent}% complete</span>
          <span>{missing.length} to add below</span>
        </div>
        {bar('bg-orange-100')}
      </div>
    );
  }

  return (
    <section data-wt="home-profile" className="rounded-[18px] bg-orange-100/80 px-4 py-3.5 text-orange-700">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em]">Finish your profile · {percent}%</p>
        <span className="text-[11px] font-semibold">{missing.length} to add</span>
      </div>
      <div className="mt-2">{bar('bg-white/70')}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-700">
        Your incomplete profile is <span className="font-semibold text-gray-900">delaying mobilisation</span>. We match new sign-ups to supports by gender and age, so please do this today.
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Still to add: {missing.map((item) => item.label).join(', ')}.
        {missing.some((item) => item.key === 'phone') && ' Ask an admin to add your phone number.'}
      </p>
      {!phoneOnly && (
        <NavLink to="/support/profile" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-orange-700 px-3.5 text-[13px] font-semibold text-white">
          Finish profile
        </NavLink>
      )}
    </section>
  );
};

export default ProfileCompletionStrip;
