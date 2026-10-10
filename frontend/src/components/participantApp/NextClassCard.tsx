import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ParticipantHomeWeek } from '../../types';
import { TeacherAvatar as Avatar, TeacherSheet } from '../TeacherSheet';
import { gradientAt } from '../../utils/prayerText';

// "Thu 22 Oct", in Lagos time, for "Manual arrives …".
const arrivesLabel = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).replace(',', '');
};

/** The one button: opens the manual once it has arrived, otherwise says when it will. */
const ManualButton: React.FC<{ week: ParticipantHomeWeek; className?: string }> = ({ week, className = '' }) => {
  const base = `flex min-h-[46px] w-full items-center justify-center rounded-[14px] px-4 text-[14.5px] font-bold ${className}`;
  if (week.manual) return <NavLink to={`/me/week/${week.weekNumber}`} className={`${base} bg-primary text-white`}>Open manual</NavLink>;
  const when = arrivesLabel(week.manualReleasesAt);
  if (!when) return null; // no manual is coming yet, so there is nothing to promise
  return <span className={`${base} cursor-default bg-gray-100 text-gray-500`} aria-disabled="true">{`Manual arrives ${when}`}</span>;
};

/** Every class gets the card: its graphic, or a steady gradient with the class name when none was uploaded. */
export const hasClassCard = (week: ParticipantHomeWeek | null | undefined): boolean => !!week;

/**
 * "Next class": the class graphic with its name, who is teaching, and one button. It only shows what the home page
 * does not already say (no date, countdown or week count). With no graphic the poster is a gradient (the same colours
 * every time for the same class) carrying the class name and teacher.
 */
const NextClassCard: React.FC<{ week: ParticipantHomeWeek }> = ({ week }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!hasClassCard(week)) return null;
  const title = week.title?.trim() || `Class ${week.weekNumber}`;
  const teacher = week.teacher;
  const [posterFrom, posterTo] = gradientAt(week.weekNumber);
  const teacherChip = teacher && (
    <button type="button" onClick={() => setSheetOpen(true)} className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/40 bg-white/25 py-1 pl-1 pr-3.5 text-left backdrop-blur-md" aria-label={`About ${teacher.name}, teaching this class`}>
      <Avatar name={teacher.name} photoUrl={teacher.photoUrl} size={30} />
      <span className="text-xs font-bold text-white">{teacher.name} ›</span>
    </button>
  );
  return (
    <section data-wt="ph-next-class" className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <p className="px-1 pb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Next class</p>
      <div className="relative flex min-h-[208px] items-end overflow-hidden rounded-2xl bg-[#f6f7f9]">
        {/* The gradient is always underneath, so a graphic that fails to load still leaves a poster. */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${posterFrom}, ${posterTo})` }} aria-hidden="true" />
        {week.classGraphicUrl && <img src={week.classGraphicUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {/* A soft dark fade, so the class name reads on any graphic. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-[rgba(20,10,0,0.66)] via-[rgba(20,10,0,0.36)] to-transparent" aria-hidden="true" />
        <div className="relative w-full px-4 pb-3.5 pt-16 text-white">
          <h2 className="text-2xl font-extrabold leading-[1.1] tracking-tight [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">{title}</h2>
          {teacherChip}
        </div>
      </div>
      <ManualButton week={week} className="mt-3" />
      {sheetOpen && teacher && <TeacherSheet teacher={teacher} title={title} onClose={() => setSheetOpen(false)} footer={<ManualButton week={week} className="mt-3.5" />} />}
    </section>
  );
};

export default NextClassCard;
