import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AttendanceCountdownCard from '../components/participantApp/AttendanceCountdownCard';
import EndSummaryCard from '../components/participantApp/EndSummaryCard';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { currentWeekNumber, pickCallback, reflectionFor } from '../utils/participantApp';

// My Journey: what the participant wrote each week and whether they kept their
// goal (Journey tab), plus their Sunday class / group meeting record and
// whether a Late mark counted as attended (Attendance tab, added for the
// "late counts as missed" rule). Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const sundayLine = (status: string | undefined, lateExcused: boolean | undefined) => {
  if (!status) return { label: 'Not recorded', cls: 'bg-neutral-100 text-neutral-600' };
  if (status === 'PRESENT') return { label: 'Present', cls: 'bg-emerald-100/80 text-emerald-700' };
  if (status === 'ABSENT') return { label: 'Absent', cls: 'bg-red-100/80 text-red-700' };
  if (status === 'LATE') return lateExcused
    ? { label: 'Late — counted as attended', cls: 'bg-emerald-100/80 text-emerald-700' }
    : { label: 'Late — counts as missed', cls: 'bg-amber-100/80 text-amber-700' };
  if (status === 'LEFT_EARLY') return lateExcused
    ? { label: 'Left early — counted as attended', cls: 'bg-emerald-100/80 text-emerald-700' }
    : { label: 'Left early — counts as missed', cls: 'bg-orange-100/80 text-orange-700' };
  if (status === 'EXCUSED') return { label: 'Excused', cls: 'bg-sky-100/80 text-sky-700' };
  return { label: status, cls: 'bg-neutral-100 text-neutral-600' };
};

const meetingLine = (status: string | undefined) => {
  if (!status) return { label: 'Not recorded', cls: 'bg-neutral-100 text-neutral-600' };
  if (status === 'JOINED') return { label: 'Joined', cls: 'bg-emerald-100/80 text-emerald-700' };
  if (status === 'EXCUSED') return { label: 'Excused', cls: 'bg-sky-100/80 text-sky-700' };
  if (status === 'MISSED') return { label: 'Missed', cls: 'bg-red-100/80 text-red-700' };
  return { label: status, cls: 'bg-neutral-100 text-neutral-600' };
};

const ParticipantJourneyPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  const navigate = useNavigate();
  const [openWeekId, setOpenWeekId] = useState<number | null>(null);
  const [tab, setTab] = useState<'journey' | 'attendance'>('journey');
  const now = new Date();

  if (loading || !home) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const totalWeeks = home.weeks.length;
  const weekNumber = currentWeekNumber(home.cohort?.startDate, now);
  const weeksIn = Math.min(Math.max(weekNumber, 0), totalWeeks);
  const goalsKept = home.reflections.filter((r) => r.goalDoneAt).length;
  const callback = pickCallback(home, weekNumber, now);

  return (
    <div className="max-w-2xl">
      <PageHeader title="My Journey" tourId="participant:journey" />

      <div className="flex flex-col gap-4">
        <AttendanceCountdownCard openWindow={home.openWindow} />

        <div className="flex gap-2" role="tablist" aria-label="My Journey sections">
          {([
            { key: 'journey', label: 'Journey' },
            { key: 'attendance', label: 'Attendance' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-primary text-white' : 'border border-[#eef0f4] bg-white text-gray-600 hover:bg-orange-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'journey' ? (
          <>
            <section data-wt="pj-summary" className="rounded-3xl bg-[linear-gradient(150deg,#ff914d_0%,#f2703a_55%,#d95f2e_100%)] px-[22px] py-[26px] text-white shadow-[0_12px_30px_-16px_rgba(217,95,46,0.7)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">Your journey so far</p>
              <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                <span className="text-[46px] font-extrabold leading-none tracking-[-0.03em]">{weeksIn}</span>
                <span className="pb-1.5 text-base font-semibold text-white/90">of {totalWeeks} weeks in</span>
              </div>
              <div className="mt-[18px] h-2 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full rounded-full bg-white" style={{ width: `${totalWeeks ? Math.round((weeksIn / totalWeeks) * 100) : 0}%` }} />
              </div>
              <div className="mt-[18px] flex flex-wrap gap-[18px]">
                {[
                  [home.reflections.length, 'reflections written'],
                  [goalsKept, 'goals kept'],
                  [Math.max(0, totalWeeks - weeksIn), 'weeks to go'],
                ].map(([value, label]) => (
                  <div key={label as string}>
                    <p className="text-[22px] font-extrabold tracking-[-0.02em]">{value}</p>
                    <p className="mt-0.5 text-xs text-white/80">{label}</p>
                  </div>
                ))}
              </div>
            </section>

            {callback && (
              <section className="rounded-[20px] border border-[#ffdeca] bg-[#fff8f3] p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">You wrote this in week {callback.weekNumber}</p>
                <p className="mt-2.5 text-[17px] font-medium italic leading-relaxed text-gray-800">&#8220;{callback.text}&#8221;</p>
                <p className="mt-3 text-[13px] leading-[1.55] text-gray-500">{callback.prompt}</p>
              </section>
            )}

            <section data-wt="pj-weeks" className={`${CARD} px-5 pb-2 pt-5`}>
              <h3 className="mb-1 text-base font-bold text-gray-900">Week by week</h3>

              {home.weeks.map((week, index) => {
                const reflection = reflectionFor(home.reflections, week.id);
                const reached = week.weekNumber <= weekNumber;
                const isNow = week.weekNumber === weekNumber;
                const open = openWeekId === week.id && !!reflection;
                const chip = isNow
                  ? { label: 'This week', cls: 'bg-[#fff1e6] text-[#c2410c]' }
                  : reflection
                    ? reflection.goalDoneAt ? { label: 'Goal kept', cls: 'bg-[#f2fbf5] text-[#15803d]' } : { label: 'Not this time', cls: 'bg-[#fef3c7] text-[#b45309]' }
                    : reached ? { label: 'No reflection', cls: 'bg-[#f6f7f9] text-gray-400' } : { label: 'Locked', cls: 'bg-[#f6f7f9] text-gray-400' };
                const onRow = () => {
                  if (reflection) setOpenWeekId(open ? null : week.id);
                  else if (reached && week.released) navigate(`/me/week/${week.weekNumber}`);
                };
                return (
                  <div key={week.id} className="flex items-stretch gap-3.5">
                    <div className="flex w-[30px] flex-none flex-col items-center">
                      <span className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-[11.5px] font-bold ${reflection ? 'border-primary bg-primary text-white' : isNow ? 'border-primary bg-white text-[#c2410c]' : 'border-gray-200 bg-[#f6f7f9] text-gray-400'}`}>
                        {reflection ? '✓' : week.weekNumber}
                      </span>
                      {index < home.weeks.length - 1 && <span className={`min-h-[14px] w-0.5 flex-auto ${week.weekNumber < weekNumber ? 'bg-[#ffdeca]' : 'bg-[#f1f2f5]'}`} />}
                    </div>
                    <div className="min-w-0 flex-auto pb-3.5">
                      <button type="button" onClick={onRow} className={`flex w-full items-center gap-2.5 pt-[3px] text-left ${reflection || (reached && week.released) ? 'cursor-pointer' : 'cursor-default'}`}>
                        <div className="min-w-0">
                          <p className={`text-[14.5px] font-bold leading-snug ${reached ? 'text-gray-900' : 'text-gray-400'}`}>{week.title || `Week ${week.weekNumber}`}</p>
                          <p className="mt-0.5 text-[12.5px] text-gray-400">Week {week.weekNumber}</p>
                        </div>
                        <span className={`ml-auto flex-none rounded-full px-[9px] py-[3px] text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                      </button>
                      {open && reflection && (
                        <div className="mt-[11px] rounded-[14px] bg-[#f9fafb] p-3.5">
                          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-400">What stood out</p>
                          <p className="mt-[5px] text-sm leading-relaxed text-gray-700">{reflection.stoodOut || '—'}</p>
                          <div className="my-[13px] h-px bg-[#eef0f4]" />
                          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#9a6a4b]">Your goal</p>
                          <div className="mt-1.5 flex items-start gap-[9px]">
                            <span className={`flex-none text-sm ${reflection.goalDoneAt ? 'text-[#15803d]' : 'text-gray-400'}`}>{reflection.goalDoneAt ? '✓' : '○'}</span>
                            <span className="min-w-0 text-sm leading-relaxed text-gray-700">{reflection.goal}</span>
                          </div>
                          <button type="button" onClick={() => navigate(`/me/week/${week.weekNumber}`)} className="mt-3 text-[13px] font-semibold text-[#c2410c]">Open week →</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            <EndSummaryCard lastWeek={totalWeeks} reflectionCount={home.reflections.length} />
          </>
        ) : (
          <section data-wt="pj-attendance" className={`${CARD} px-5 pb-4 pt-5`}>
            <h3 className="mb-1 text-base font-bold text-gray-900">Your attendance</h3>
            <p className="mb-3 text-[12.5px] text-gray-500">Late only counts as attended once it&apos;s been excused.</p>
            {(() => {
              // Normally only "reached" weeks matter, but a week can be marked
              // ahead of schedule (an admin correction, an early register) --
              // once it has a record, the participant should still see it.
              const attendanceWeeks = home.weeks.filter((week) =>
                week.weekNumber <= weekNumber
                || home.sunday.some((r) => r.weekId === week.id)
                || home.meeting.some((r) => r.weekId === week.id)
              );
              if (attendanceWeeks.length === 0) {
                return <p className="py-6 text-center text-sm text-gray-500">Nothing recorded yet.</p>;
              }
              return (
              <div className="divide-y divide-[#f1f2f5]">
                {attendanceWeeks.map((week) => {
                  const sunday = home.sunday.find((r) => r.weekId === week.id);
                  const meeting = home.meeting.find((r) => r.weekId === week.id);
                  const sundayMark = sundayLine(sunday?.status, sunday?.lateExcused);
                  const meetingMark = meetingLine(meeting?.status);
                  return (
                    <div key={week.id} className="py-3">
                      <p className="text-[12.5px] font-bold text-gray-400">Week {week.weekNumber}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-gray-600">Sunday class</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${sundayMark.cls}`}>{sundayMark.label}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-gray-600">Group meeting</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meetingMark.cls}`}>{meetingMark.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </section>
        )}
      </div>
    </div>
  );
};

export default ParticipantJourneyPage;
