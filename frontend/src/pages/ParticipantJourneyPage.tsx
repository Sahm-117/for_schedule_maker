import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import EndSummaryCard from '../components/participantApp/EndSummaryCard';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { currentWeekNumber, pickCallback, reflectionFor } from '../utils/participantApp';

// My Journey: what the participant wrote each week and whether they kept their
// goal, with an earlier entry brought back to reflect on. Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const ParticipantJourneyPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  const navigate = useNavigate();
  const [openWeekId, setOpenWeekId] = useState<number | null>(null);
  const now = new Date();

  if (loading || !home) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const totalWeeks = home.weeks.length;
  const weekNumber = currentWeekNumber(home.cohort?.startDate, now);
  const weeksIn = Math.min(Math.max(weekNumber, 0), totalWeeks);
  const goalsKept = home.reflections.filter((r) => r.goalDoneAt).length;
  const callback = pickCallback(home, weekNumber, now);

  return (
    <div className="max-w-2xl">
      <PageHeader title="My Journey" subtitle="What you have written, and what you said you would do." />

      <div className="flex flex-col gap-4">
        <section className="rounded-3xl bg-[linear-gradient(150deg,#ff914d_0%,#f2703a_55%,#d95f2e_100%)] px-[22px] py-[26px] text-white shadow-[0_12px_30px_-16px_rgba(217,95,46,0.7)]">
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

        <section className={`${CARD} px-5 pb-2 pt-5`}>
          <h3 className="mb-1 text-base font-bold text-gray-900">Week by week</h3>
          <p className="mb-3.5 text-[13px] text-gray-500">Tap any week you have reached to read it back.</p>

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
      </div>
    </div>
  );
};

export default ParticipantJourneyPage;
