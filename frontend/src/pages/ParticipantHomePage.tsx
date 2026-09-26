import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import AttendanceCountdownCard from '../components/participantApp/AttendanceCountdownCard';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { useToast } from '../components/Toast';
import { buildWhatsAppLink } from '../utils/phone';
import { normalizeLink } from '../utils/links';
import {
  FAITH_PROJECT_PARTICIPANT_LABEL,
  currentWeekNumber,
  formatTime,
  reflectionFor,
  scriptureDayIndex,
  scriptureForDay,
  scripturePosition,
  titleCaseDay,
  weekDayDate,
} from '../utils/participantApp';

// Participant Home: where they are in FOF, this week's class and call, their goal,
// today's scripture and what's expected this week. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const SLIDE_MS = 320;
const RESISTANCE = 0.3; // how much a drag past the first/last post is damped
const MAX_RESISTANCE_PX = 56;
const FLICK_MIN_PX = 24;
const FLICK_VELOCITY = 0.5; // px/ms
const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Icons for the Home quick-action tiles (always exactly four, none repeating
// the mobile bottom bar's Home/My Group/Journey/Faith Project).
const ICON_CALL = 'M15 10.5 21 7v10l-6-3.5ZM3 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z';
const ICON_MESSAGE = 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.284 0-2.503-.24-3.605-.671L3 20l1.395-4.865A7.933 7.933 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z';
const ICON_RESOURCES = 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z';
const ICON_FEEDBACK = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';

const formatDateLabel = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const ParticipantHomePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, error, reload, applyReflection } = useParticipantApp();
  const toast = useToast();
  const [goalSaving, setGoalSaving] = useState(false);
  const [scriptureDay, setScriptureDay] = useState<number | null>(null);
  // Live drag offset (px) while swiping, or the animated value while settling/springing back.
  const [scriptureDragPx, setScriptureDragPx] = useState(0);
  const [scriptureAnimating, setScriptureAnimating] = useState(false);
  const scriptureTrackRef = useRef<HTMLDivElement>(null);
  const scriptureDrag = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);

  const now = new Date();
  const firstName = (user?.name || '').split(' ')[0];
  const todayFofDay = home ? scriptureDayIndex(home.cohort?.startDate, now) : null;
  const todayScriptureDay = home ? scripturePosition(todayFofDay, home.scriptureStartDay, home.scriptures.length) : null;

  useEffect(() => {
    setScriptureDay(todayScriptureDay);
  }, [todayScriptureDay]);

  if (loading) {
    return <PageLoader label="Loading your FOF space…" />;
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
  const groupCallLink = normalizeLink(group?.callLink?.trim() || '') || null;
  const supportWaLink = buildWhatsAppLink(group?.supportPhone, `Hi ${(group?.supportName || 'there').split(' ')[0]}, it's ${home.participant.name.split(' ')[0]} from FOF.`);

  const quickTiles: Array<{ key: string; label: string; icon: string; to?: string; href?: string; avatarName?: string; avatarUrl?: string | null }> = [
    groupCallLink
      ? { key: 'call', label: 'Join call', icon: ICON_CALL, href: groupCallLink }
      : { key: 'call', label: 'Join call', icon: ICON_CALL, to: '/me/group' },
    supportWaLink
      ? { key: 'message-support', label: 'Message support', icon: ICON_MESSAGE, href: supportWaLink, avatarName: group?.supportName ?? 'Support', avatarUrl: group?.supportAvatarUrl }
      : { key: 'message-support', label: 'Message support', icon: ICON_MESSAGE, to: '/me/group', avatarName: group?.supportName ?? 'Support', avatarUrl: group?.supportAvatarUrl },
    { key: 'resources', label: 'Resources', icon: ICON_RESOURCES, to: '/me/resources' },
    { key: 'feedback', label: 'Feedback', icon: ICON_FEEDBACK, to: '/me/feedback' },
  ];

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
  const prevScripture = scriptureDay && scriptureDay > 1 ? scriptureForDay(home.scriptures, scriptureDay - 1) : null;
  const canGoPrev = !!scriptureDay && scriptureDay > 1;
  const canGoNext = !!scriptureDay && !!todayScriptureDay && scriptureDay < todayScriptureDay;
  const nextScripture = canGoNext && scriptureDay ? scriptureForDay(home.scriptures, scriptureDay + 1) : null;
  const firstDotDay = todayScriptureDay ? Math.max(1, todayScriptureDay - 5) : 1;
  const expectations = (week?.expectations || '').split('\n').map((line) => line.trim()).filter(Boolean);

  // Slides the track to the next/previous post with an eased transition (arrow
  // buttons and a released drag past the threshold both land here); direction 0
  // just eases the current drag back to centre without changing the post.
  const settleScripture = (direction: 1 | -1 | 0) => {
    const reduced = prefersReducedMotion();
    if (direction === 0) {
      setScriptureDragPx(0);
      if (!reduced) { setScriptureAnimating(true); window.setTimeout(() => setScriptureAnimating(false), SLIDE_MS); }
      return;
    }
    const width = scriptureTrackRef.current?.offsetWidth || 0;
    const advance = () => setScriptureDay((day) => Math.max(1, Math.min(todayScriptureDay ?? 1, (day ?? 1) + direction)));
    if (reduced) { advance(); setScriptureDragPx(0); return; }
    setScriptureAnimating(true);
    setScriptureDragPx(direction === 1 ? -width : width);
    window.setTimeout(() => {
      advance();
      setScriptureDragPx(0);
      setScriptureAnimating(false);
    }, SLIDE_MS);
  };

  const onScripturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scriptureAnimating) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scriptureDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };

  const onScripturePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scriptureDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    let dx = event.clientX - drag.x;
    // Rubber-band resistance: can't drag past the first or last post.
    if ((dx < 0 && !canGoNext) || (dx > 0 && !canGoPrev)) {
      dx = Math.max(-MAX_RESISTANCE_PX, Math.min(MAX_RESISTANCE_PX, dx * RESISTANCE));
    }
    setScriptureDragPx(dx);
  };

  const endScriptureDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scriptureDrag.current;
    scriptureDrag.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dt = Math.max(1, performance.now() - drag.time);
    const width = scriptureTrackRef.current?.offsetWidth || 1;
    const velocity = Math.abs(dx) / dt;
    const pastThreshold = Math.abs(dx) > width * 0.25 || (Math.abs(dx) > FLICK_MIN_PX && velocity > FLICK_VELOCITY);
    const direction: 1 | -1 | 0 = dx < 0 && canGoNext && pastThreshold ? 1 : dx > 0 && canGoPrev && pastThreshold ? -1 : 0;
    settleScripture(direction);
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        tourId="participant:home"
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
        {home.groupMeetingLive && (
          <section className="flex items-center justify-between gap-3 rounded-[16px] bg-emerald-100/80 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span className="relative flex h-2 w-2 flex-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Your group meeting is on now
            </span>
            {groupCallLink ? (
              <a href={groupCallLink} target="_blank" rel="noreferrer" className="flex-none rounded-xl bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Join</a>
            ) : (
              <NavLink to="/me/group" className="flex-none rounded-xl bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Open</NavLink>
            )}
          </section>
        )}
        <AttendanceCountdownCard openWindow={home.openWindow} />
        <section data-wt="ph-progress" className="rounded-[22px] border border-[#ffdeca] bg-white p-5 shadow-[0_2px_6px_-2px_rgba(17,24,39,0.08)]">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">Programme progress</p>
            <span className="rounded-full bg-[#fff1e6] px-2.5 py-[3px] text-[11px] font-bold text-[#c2410c]">{stageLabel}</span>
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
            </div>
            <div className="rounded-2xl border border-[#dcefe1] bg-[#f0f9f2] p-3.5">
              <p className="text-xs font-semibold text-[#3f7a52]">Faith Project</p>
              <p className="mt-1.5 text-[18px] font-extrabold leading-tight text-gray-900">{FAITH_PROJECT_PARTICIPANT_LABEL[home.faithProjectStatus ?? 'NOT_DRAFTED']}</p>
            </div>
          </div>
        </section>

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
            </div>
            <NavLink to="/me/complete" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#3f4757] px-4 text-[13px] font-semibold text-white">Continue</NavLink>
          </div>
        )}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {quickTiles.map((tile) => {
            const content = (
              <>
                {tile.avatarUrl ? (
                  <Avatar name={tile.avatarName ?? tile.label} avatarUrl={tile.avatarUrl} size="md" enlargeable />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={tile.icon} /></svg>
                  </span>
                )}
                <span className="text-center text-[13px] font-semibold leading-snug text-gray-800">{tile.label}</span>
              </>
            );
            return tile.href ? (
              <a key={tile.key} href={tile.href} target="_blank" rel="noreferrer" className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
                {content}
              </a>
            ) : (
              <NavLink key={tile.key} to={tile.to ?? '/me'} className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
                {content}
              </NavLink>
            );
          })}
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
            <p className="mt-2 text-base font-semibold leading-[1.45] text-gray-900">Read. Reflect.</p>
            <NavLink to={`/me/week/${week.weekNumber}`} className="mt-3.5 flex min-h-[46px] w-full items-center justify-center rounded-xl bg-primary p-3 text-sm font-semibold text-white">
              Open this week
            </NavLink>
          </section>
        ) : null}

        {scripture && todayScriptureDay && scriptureDay && (
          <section data-wt="ph-scripture" className="overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-[18px]">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-gray-900">Inspirational Scriptures</h2>
                <p className="mt-0.5 text-[12.5px] text-gray-500">{scriptureDay === todayScriptureDay ? 'Today' : `Day ${scriptureDay}`}</p>
              </div>
              <div className="ml-auto flex gap-1.5">
                <button type="button" aria-label="Previous scripture" onClick={() => settleScripture(-1)} disabled={!canGoPrev || scriptureAnimating} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8249;</button>
                <button type="button" aria-label="Next scripture" onClick={() => settleScripture(1)} disabled={!canGoNext || scriptureAnimating} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8250;</button>
              </div>
            </div>
            <div className="px-5 pb-4">
              <div
                ref={scriptureTrackRef}
                className="aspect-[4/5] w-full touch-pan-y overflow-hidden rounded-2xl bg-[#f6f7f9]"
                onPointerDown={onScripturePointerDown}
                onPointerMove={onScripturePointerMove}
                onPointerUp={endScriptureDrag}
                onPointerCancel={endScriptureDrag}
              >
                <div
                  className="flex h-full"
                  style={{
                    transform: `translateX(calc(-100% + ${scriptureDragPx}px))`,
                    transition: scriptureAnimating ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
                  }}
                >
                  <img src={(prevScripture || scripture).imageUrl} alt="" aria-hidden="true" draggable={false} className="h-full w-full shrink-0 object-cover" />
                  <img src={scripture.imageUrl} alt={`Inspirational scripture, ${scriptureDay === todayScriptureDay ? 'today' : `day ${scriptureDay}`}. Swipe left or right to change post.`} draggable={false} className="h-full w-full shrink-0 object-cover" />
                  <img src={(nextScripture || scripture).imageUrl} alt="" aria-hidden="true" draggable={false} className="h-full w-full shrink-0 object-cover" />
                </div>
              </div>
              <div className="mt-3 flex justify-center gap-[5px]" aria-hidden="true">
                {Array.from({ length: todayScriptureDay - firstDotDay + 1 }, (_, i) => firstDotDay + i).map((day) => (
                  <span key={day} className={`h-1.5 w-1.5 rounded-full ${day === scriptureDay ? 'bg-primary' : 'bg-gray-200'}`} />
                ))}
              </div>
            </div>
          </section>
        )}

        {week && started && !finished && (
          <section data-wt="ph-week" className={CARD}>
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
