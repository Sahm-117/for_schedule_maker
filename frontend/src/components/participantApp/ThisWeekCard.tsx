import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ParticipantHome, ParticipantHomeWeek } from '../../types';
import { TeacherChip, TeacherSheet } from '../TeacherSheet';
import InfoTip from '../InfoTip';
import { ClassGraphicSheet, ManualButton, gradientCss } from './ClassGraphic';
import { formatTime, reflectionFor } from '../../utils/participantApp';

// "This week" for a participant, in one card: which class it is, who teaches it, the four steps (manual, class, recap,
// reflection) and the one button for what to do next. Used on Home and at the top of My Journey.

const STEPS = ['Manual', 'Class', 'Recap', 'Reflect'] as const;

const classLine = (week: ParticipantHomeWeek) => {
  if (!week.classDate) return null;
  const day = new Date(`${week.classDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const time = formatTime(week.classTime);
  return `Class on ${day}${time ? `, ${time}` : ''}`;
};

// The reflection nudge: Monday is the best day for it; on Tuesday it is still open. Shown only while the reflection is unwritten.
const lagosWeekday = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(new Date());

/** `canReflect` is false while a practice participant has not finished getting ready: the reflection waits for them. */
const ThisWeekCard: React.FC<{ home: ParticipantHome; week: ParticipantHomeWeek; label?: string; canReflect?: boolean }> = ({ home, week, label, canReflect = true }) => {
  const [graphicOpen, setGraphicOpen] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const title = week.title?.trim() || `Class ${week.weekNumber}`;
  const reflection = reflectionFor(home.reflections, week.id);
  const attended = home.sunday.some((r) => r.weekId === week.id && ['PRESENT', 'LATE', 'LEFT_EARLY'].includes(r.status));
  const manualReady = !!week.manual?.documentUrl;

  // Done flags in order; the first one not done is where the participant is now.
  const done = [attended || week.released || !!reflection, attended || week.released || !!reflection, week.released || !!reflection, !!reflection];
  const current = done.findIndex((d) => !d);
  const line = classLine(week);
  const weekday = lagosWeekday();
  const nudge = week.released && !reflection && canReflect
    ? weekday === 'Monday'
      ? { label: 'Do this first', tip: 'Monday is the best day for this, while the class is fresh.' }
      : weekday === 'Tuesday'
        ? { label: 'Still open', tip: "Still open. Please write it before the group meeting." }
        : null
    : null;

  // The one button.
  let cta: React.ReactNode;
  if (week.released && !reflection && canReflect) {
    cta = <NavLink to={`/me/week/${week.weekNumber}`} className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-[16px] font-extrabold text-white">Write my reflection</NavLink>;
  } else if (manualReady && !week.released) {
    cta = <NavLink to={`/me/week/${week.weekNumber}?manual=1`} className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-[16px] font-extrabold text-white">Open the manual</NavLink>;
  } else if (!manualReady && !week.released && week.manualReleasesAt) {
    cta = <ManualButton week={week} className="!min-h-[52px] !rounded-2xl !text-[16px]" />;
  } else {
    cta = <NavLink to={`/me/week/${week.weekNumber}`} className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-[16px] font-extrabold text-white">Open Week {week.weekNumber}</NavLink>;
  }

  return (
    <section data-wt="ph-hero" className="rounded-3xl border border-primary/25 bg-white px-[18px] pb-[18px] pt-5 shadow-[0_8px_24px_-14px_rgb(var(--color-primary-rgb)/0.55)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-[3px] text-[12px] font-extrabold uppercase tracking-[0.02em] text-primary">{label ?? `Week ${week.weekNumber} of ${home.weeks.length}`}</span>
        {nudge && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-bold text-[#c2410c]">
            {nudge.label}
            <InfoTip label={`About "${nudge.label}"`}>{nudge.tip}</InfoTip>
          </span>
        )}
        {line && <span className="ml-auto text-[13px] font-bold text-[#c2410c]">{line}</span>}
      </div>

      <div className="mt-3.5 flex items-start gap-3.5">
        <button type="button" onClick={() => setGraphicOpen(true)} aria-label={`View the ${title} graphic`} className="h-[92px] w-[92px] flex-none overflow-hidden rounded-2xl" style={{ background: gradientCss(week) }}>
          {week.classGraphicUrl && <img src={week.classGraphicUrl} alt="" className="h-full w-full object-cover" />}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-gray-900 [overflow-wrap:anywhere]">{title}</h2>
          {week.teacher && <TeacherChip teacher={week.teacher} onOpen={() => setTeacherOpen(true)} className="mt-2.5" />}
        </div>
      </div>

      {/* Each step opens what it names: the manual, the class picture, the recap, the reflection. */}
      <ol className="mt-4 grid grid-cols-4 gap-1.5 text-center" aria-label="This week's steps">
        {STEPS.map((step, index) => {
          const isDone = done[index];
          const isCurrent = index === current;
          const week_ = `/me/week/${week.weekNumber}`;
          const target = index === 0 ? (manualReady ? `${week_}?manual=1` : week_)
            : index === 3 ? (week.released && canReflect ? `${week_}?reflect=1` : week_)
              : week_;
          const label = ['Open the manual', 'See the class', 'Open the recap', 'Write your reflection'][index];
          const inner = (
            <>
              <span className={`inline-grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-extrabold ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-primary text-white' : 'bg-[#f1f2f5] text-gray-500'}`}>
                {isDone ? <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 12 5 5L20 7" /></svg> : index + 1}
              </span>
              <p className={`mt-1.5 text-[12px] ${isCurrent ? 'font-bold text-gray-900' : 'font-semibold text-gray-500'}`}>{step}</p>
            </>
          );
          const cls = 'block w-full rounded-xl py-1 transition active:scale-95 active:bg-black/[0.04]';
          return (
            <li key={step}>
              {index === 1 ? (
                <button type="button" onClick={() => setGraphicOpen(true)} aria-label={label} className={cls}>{inner}</button>
              ) : (
                <NavLink to={target} aria-label={label} className={cls}>{inner}</NavLink>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-[18px]">{cta}</div>

      {graphicOpen && !teacherOpen && <ClassGraphicSheet week={week} title={title} onClose={() => setGraphicOpen(false)} onTeacher={() => setTeacherOpen(true)} />}
      {teacherOpen && week.teacher && <TeacherSheet teacher={week.teacher} title={title} onClose={() => setTeacherOpen(false)} footer={<ManualButton week={week} className="mt-3.5" />} />}
    </section>
  );
};

export default ThisWeekCard;
