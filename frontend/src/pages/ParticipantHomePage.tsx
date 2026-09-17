import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { useToast } from '../components/Toast';
import {
  FAITH_PROJECT_PARTICIPANT_LABEL,
  currentWeekNumber,
  formatTime,
  platformLabel,
  reflectionFor,
  scriptureDayIndex,
  scriptureForDay,
  titleCaseDay,
  weekDayDate,
} from '../utils/participantApp';

// Participant Home: where they are in FOF, this week's class and call, their goal,
// today's scripture and what's expected this week. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const QUICK_LINKS = [
  { to: '/me/group', label: 'My Group', icon: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6' },
  { to: '/me/resources', label: 'Resources', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z' },
  { to: '/me/faith', label: 'Faith Project', icon: 'M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z' },
  { to: '/me/feedback', label: 'Feedback', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
];

const formatDateLabel = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const ParticipantHomePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, error, reload, applyReflection } = useParticipantApp();
  const toast = useToast();
  const [goalSaving, setGoalSaving] = useState(false);
  const [scriptureDay, setScriptureDay] = useState<number | null>(null);

  const now = new Date();
  const firstName = (user?.name || '').split(' ')[0];
  const todayScriptureDay = home ? scriptureDayIndex(home.cohort?.startDate, now) : null;

  useEffect(() => {
    setScriptureDay(todayScriptureDay);
  }, [todayScriptureDay]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-gray-500">Loading your FOF space…</p>;
  }
  if (error || !home) {
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-sm text-gray-600">{error || 'Could not load your FOF space.'}</p>
        <button type="button" onClick={() => { void reload(); }} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    );
  }

  const totalWeeks = home.weeks.length;
  const weekNumber = currentWeekNumber(home.cohort?.startDate, now);
  const started = weekNumber >= 1;
  const finished = totalWeeks > 0 && weekNumber > totalWeeks;
  const shownWeekNumber = Math.min(Math.max(weekNumber, 1), Math.max(totalWeeks, 1));
  const week = home.weeks.find((w) => w.weekNumber === shownWeekNumber) ?? null;
  const reflection = week ? reflectionFor(home.reflections, week.id) : null;

  const stageLabel = home.cohort?.status === 'COMPLETED' || finished ? 'Completed' : started ? 'Active' : 'Starting soon';

  // Next Sunday class: this week's if it hasn't started yet today, else next week's.
  const nextClass = (() => {
    if (!home.cohort?.startDate) return null;
    const clockHour = new Date(now.getTime() + 60 * 60 * 1000);
    const candidates = home.weeks.filter((w) => w.weekNumber >= Math.max(weekNumber, 1));
    for (const w of candidates) {
      const date = weekDayDate(home.cohort.startDate, w.weekNumber, 0);
      const [h, m] = (w.classTime || '23:59').split(':').map(Number);
      const startsAt = date.getTime() + h * 3600000 + m * 60000;
      if (startsAt > clockHour.getTime()) return { week: w, date };
    }
    return null;
  })();

  const group = home.group;
  const callSet = !!(group?.meetingDay && group.meetingTime);

  const toggleGoalDone = async () => {
    if (!week || !reflection) return;
    setGoalSaving(true);
    try {
      applyReflection(await participantAppApi.setGoalDone(week.id, !reflection.goalDoneAt));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not update your goal.', tone: 'error' });
    } finally {
      setGoalSaving(false);
    }
  };

  const scripture = scriptureDay ? scriptureForDay(home.scriptures, scriptureDay) : null;
  const firstDotDay = todayScriptureDay ? Math.max(1, todayScriptureDay - 5) : 1;
  const expectations = (week?.expectations || '').split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Everything for this week, at a glance."
        action={home.profileCompletion.percent < 100 ? (
          // Kept to a small pill so Home stays about the week.
          <NavLink to="/me/profile" className="inline-flex items-center gap-2 rounded-full border border-[#ffdeca] bg-white py-1.5 pl-1.5 pr-3 text-xs font-semibold text-gray-700">
            <span
              className="grid h-6 w-6 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--color-primary, #ff914d) ${home.profileCompletion.percent * 3.6}deg, #f1f2f5 0deg)` }}
              aria-hidden="true"
            >
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
            Profile {home.profileCompletion.percent}% · Complete it
          </NavLink>
        ) : undefined}
      />

      <div className="flex flex-col gap-4">
        <section className="rounded-[22px] border border-[#ffdeca] bg-white p-5 shadow-[0_2px_6px_-2px_rgba(17,24,39,0.08)]">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">Programme progress</p>
            <span className="rounded-full bg-[#fff1e6] px-2.5 py-[3px] text-[11px] font-bold text-[#c2410c]">{stageLabel}</span>
            <NavLink to="/me/group" className="ml-auto text-[13px] font-bold text-[#c2410c]">My group →</NavLink>
          </div>
          {started ? (
            <>
              <p className="mt-1.5 text-[26px] font-extrabold text-gray-900">{finished ? 'All weeks done' : `Week ${weekNumber}`}</p>
              <p className="mt-0.5 text-[13px] text-gray-500">{finished ? `${totalWeeks} of ${totalWeeks}` : `${weekNumber} of ${totalWeeks}`}</p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-[26px] font-extrabold text-gray-900">Starting soon</p>
              {home.cohort?.startDate && (
                <p className="mt-0.5 text-[13px] text-gray-500">First class {formatDateLabel(weekDayDate(home.cohort.startDate, 1, 0))}</p>
              )}
            </>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-[#f1f2f5] bg-white p-3.5">
              <p className="text-xs font-semibold text-gray-500">This week&apos;s class</p>
              <p className="mt-1.5 text-[18px] font-extrabold leading-tight text-gray-900">{week?.title || '—'}</p>
              {week && <p className="mt-0.5 text-xs text-gray-400">Class {week.weekNumber}</p>}
            </div>
            <div className="rounded-2xl border border-[#fbe4e8] bg-[#fdf2f4] p-3.5">
              <p className="text-xs font-semibold text-[#9d5b68]">Next session</p>
              <p className="mt-1.5 text-[18px] font-extrabold leading-tight text-gray-900">
                {nextClass ? `${formatDateLabel(nextClass.date).split(',')[0]}${nextClass.week.classTime ? `, ${formatTime(nextClass.week.classTime)}` : ''}` : '—'}
              </p>
              <p className="mt-0.5 text-xs text-[#9d5b68]">{nextClass ? `Class ${nextClass.week.weekNumber}` : 'No more classes'}</p>
            </div>
            <div className="rounded-2xl border border-[#dbe7f6] bg-[#eef4fb] p-3.5">
              <p className="text-xs font-semibold text-[#3c6da3]">Group call</p>
              <p className="mt-1.5 text-[18px] font-extrabold leading-tight text-gray-900">
                {callSet ? `${titleCaseDay(group!.meetingDay)}, ${formatTime(group!.meetingTime)}` : 'Not set yet'}
              </p>
              <p className="mt-0.5 text-xs text-[#3c6da3]">{group ? platformLabel(group.callPlatform) : 'No group yet'}</p>
            </div>
            <div className="rounded-2xl border border-[#dcefe1] bg-[#f0f9f2] p-3.5">
              <p className="text-xs font-semibold text-[#3f7a52]">Faith Project</p>
              <p className="mt-1.5 text-[18px] font-extrabold leading-tight text-gray-900">{FAITH_PROJECT_PARTICIPANT_LABEL[home.faithProjectStatus ?? 'NOT_DRAFTED']}</p>
              <p className="mt-0.5 text-xs text-[#3f7a52]">Your personal step</p>
            </div>
          </div>
        </section>

        {group?.callLink && (
          <section className="flex flex-wrap items-center gap-3.5 rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 10.5 21 7v10l-6-3.5ZM3 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /></svg>
            </span>
            <div className="min-w-0 flex-[1_1_200px]">
              <p className="text-[15px] font-bold text-gray-900">Group call</p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                {platformLabel(group.callPlatform)}{callSet ? ` · every ${titleCaseDay(group.meetingDay)} at ${formatTime(group.meetingTime)}` : ''}
              </p>
            </div>
            <a href={group.callLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] flex-none items-center rounded-xl bg-primary px-[18px] text-[13px] font-semibold text-white">
              Join call
            </a>
          </section>
        )}

        {home.announcement && (
          <section className="rounded-[18px] border border-[#ffdeca] bg-[#fff8f3] px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#c2410c]">From the FOF team</p>
            <p className="mt-1.5 text-[15px] font-bold text-gray-900">{home.announcement.subject}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-600">{home.announcement.body}</p>
            {home.announcement.linkUrl && (/^https?:\/\//i.test(home.announcement.linkUrl) ? (
              <a href={home.announcement.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-white">
                {home.announcement.linkLabel || 'Open'}
              </a>
            ) : (
              <NavLink to={home.announcement.linkUrl} className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-white">
                {home.announcement.linkLabel || 'Open'}
              </NavLink>
            ))}
          </section>
        )}

        {(finished || home.cohort?.status === 'COMPLETED' || (totalWeeks > 0 && weekNumber === totalWeeks)) && !home.wrapUp.submitted && (
          <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#ffeadb] border-l-4 border-l-primary bg-white px-[18px] py-4">
            <div className="min-w-0 flex-[1_1_220px]">
              <p className="text-[15px] font-bold text-gray-900">Your cohort is wrapping up</p>
              <p className="mt-1 text-[13px] text-gray-500">Tell us how it went and what&apos;s next for you.</p>
            </div>
            <NavLink to="/me/complete" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#3f4757] px-4 text-[13px] font-semibold text-white">Continue</NavLink>
          </div>
        )}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))' }}>
          {QUICK_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={link.icon} /></svg>
              </span>
              <span className="text-center text-[13px] font-semibold leading-snug text-gray-800">{link.label}</span>
              {link.to === '/me/faith' && home.faithUnread && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" aria-label="New reply" />}
            </NavLink>
          ))}
        </div>

        {week && reflection?.goal ? (
          <section className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Your goal this week</span>
              <NavLink to={`/me/week/${week.weekNumber}`} className="ml-auto text-[12.5px] font-bold text-[#c2410c]">Edit</NavLink>
            </div>
            <p className="mt-2 text-base font-semibold leading-[1.45] text-gray-900">{reflection.goal}</p>
            {reflection.goalCheck && (
              <p className="mt-1.5 text-[13px] leading-normal text-gray-500">You will know when: {reflection.goalCheck}</p>
            )}
            <button
              type="button"
              onClick={() => { void toggleGoalDone(); }}
              disabled={goalSaving}
              className={`mt-3.5 min-h-[46px] w-full rounded-xl p-3 text-sm font-semibold disabled:opacity-60 ${reflection.goalDoneAt ? 'border border-[#bbf7d0] bg-[#f2fbf5] text-[#15803d]' : 'border border-[#ffdeca] bg-white text-[#c2410c]'}`}
            >
              {reflection.goalDoneAt ? 'Done ✓' : 'I did it'}
            </button>
          </section>
        ) : week?.released && started && !finished ? (
          <section className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">This week&apos;s recap is out</p>
            <p className="mt-2 text-base font-semibold leading-[1.45] text-gray-900">Read it and write a short reflection. Three questions, only you can read your answers.</p>
            <NavLink to={`/me/week/${week.weekNumber}`} className="mt-3.5 flex min-h-[46px] w-full items-center justify-center rounded-xl bg-primary p-3 text-sm font-semibold text-white">
              Open this week
            </NavLink>
          </section>
        ) : null}

        {scripture && todayScriptureDay && scriptureDay && (
          <section className="overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-[18px]">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-gray-900">Inspirational Scriptures</h2>
                <p className="mt-0.5 text-[12.5px] text-gray-500">{scriptureDay === todayScriptureDay ? 'Today' : `Day ${scriptureDay}`}</p>
              </div>
              <div className="ml-auto flex gap-1.5">
                <button type="button" aria-label="Previous scripture" onClick={() => setScriptureDay((d) => Math.max(1, (d ?? 1) - 1))} disabled={scriptureDay <= 1} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8249;</button>
                <button type="button" aria-label="Next scripture" onClick={() => setScriptureDay((d) => Math.min(todayScriptureDay, (d ?? 1) + 1))} disabled={scriptureDay >= todayScriptureDay} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8250;</button>
              </div>
            </div>
            <div className="px-5 pb-4">
              <img src={scripture.imageUrl} alt={`Inspirational scripture, day ${scriptureDay}`} className="aspect-[4/5] w-full rounded-2xl bg-[#f6f7f9] object-cover" loading="lazy" />
              <div className="mt-3 flex justify-center gap-[5px]">
                {Array.from({ length: todayScriptureDay - firstDotDay + 1 }, (_, i) => firstDotDay + i).map((day) => (
                  <span key={day} className={`h-1.5 w-1.5 rounded-full ${day === scriptureDay ? 'bg-primary' : 'bg-gray-200'}`} />
                ))}
              </div>
              {scriptureDay === todayScriptureDay && (
                <p className="mt-2.5 text-center text-xs text-gray-400">Tomorrow&#8217;s scripture opens at 2:00 PM.</p>
              )}
            </div>
          </section>
        )}

        {week && started && !finished && (
          <section className={CARD}>
            <h2 className="text-lg font-bold text-gray-900">This week</h2>
            {expectations.length > 0 ? (
              <div className="mt-3.5">
                <p className="text-[13px] font-semibold text-gray-600">What&apos;s expected</p>
                <ul className="mt-2 list-disc pl-[18px] text-sm leading-[1.7] text-gray-700">
                  {expectations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">{week.title ? `${week.title}: ` : ''}the recap and your reflection.</p>
            )}
            <NavLink to={`/me/week/${week.weekNumber}`} className="mt-3.5 inline-block text-[13px] font-semibold text-[#c2410c]">See more →</NavLink>
          </section>
        )}
      </div>
    </div>
  );
};

export default ParticipantHomePage;
