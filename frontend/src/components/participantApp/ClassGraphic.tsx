import { NavLink } from 'react-router-dom';
import type { ParticipantHomeWeek } from '../../types';
import { TeacherAvatar } from '../TeacherSheet';
import HomeSheet from './HomeSheet';
import { gradientAt } from '../../utils/prayerText';

// The class graphic sheet and the manual button, shared by the "this week" card (ThisWeekCard): the full graphic in a
// bottom sheet, and the manual opening straight from it or from the teacher details.

// "Thu 22 Oct", in Lagos time, for "Manual arrives …".
const arrivesLabel = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).replace(',', '');
};

/** The one manual button: opens the manual itself once it has arrived, otherwise says when it will. */
export const ManualButton: React.FC<{ week: ParticipantHomeWeek; className?: string }> = ({ week, className = '' }) => {
  const base = `flex min-h-[46px] w-full items-center justify-center rounded-[14px] px-4 text-[14.5px] font-bold ${className}`;
  if (week.manual?.documentUrl) return <NavLink to={`/me/week/${week.weekNumber}?manual=1`} className={`${base} bg-primary text-white`}>Open manual</NavLink>;
  const when = arrivesLabel(week.manualReleasesAt);
  if (!when) return null; // no manual is coming yet, so there is nothing to promise
  return <span className={`${base} cursor-default bg-gray-100 text-gray-500`} aria-disabled="true">{`Manual arrives ${when}`}</span>;
};

export const gradientCss = (week: ParticipantHomeWeek) => {
  const [from, to] = gradientAt(week.weekNumber);
  return `linear-gradient(135deg, ${from}, ${to})`;
};

/** Frosted glass: pale over the cream card (dark text), dark over a picture (white text). Long names wrap, then cut off. */
const GlassTeacherChip: React.FC<{ name: string; photoUrl: string | null; tone: 'light' | 'dark'; onOpen: () => void; caption?: string }> = ({ name, photoUrl, tone, onOpen, caption }) => {
  const light = tone === 'light';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`About ${name}, teaching this class`}
      className={`grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-left backdrop-blur-xl backdrop-saturate-150 ${light
        ? 'rounded-[14px] border border-white/90 bg-white/70 py-1 pl-1 pr-3 text-[#12161e] shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_2px_8px_-4px_rgba(30,41,90,0.22)]'
        : 'rounded-[18px] border border-white/45 bg-[rgba(20,24,40,0.38)] py-1.5 pl-1.5 pr-3.5 text-white shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]'}`}
    >
      <TeacherAvatar name={name} photoUrl={photoUrl} size={light ? 22 : 30} />
      <span className="min-w-0">
        <b className={`line-clamp-2 break-words font-bold leading-tight ${light ? 'text-[11px]' : 'text-[12px] [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]'}`}>{name}</b>
        {caption && <small className="block text-[10.5px] opacity-90">{caption}</small>}
      </span>
    </button>
  );
};

/** The full class graphic in a sheet: the picture whole (never cropped), the teacher, and the manual. */
export const ClassGraphicSheet: React.FC<{ week: ParticipantHomeWeek; title: string; onClose: () => void; onTeacher: () => void }> = ({ week, title, onClose, onTeacher }) => {
  const teacher = week.teacher;
  return (
    <HomeSheet label={`${title} graphic`} onClose={onClose}>
      {week.classGraphicUrl ? (
        <>
          <img src={week.classGraphicUrl} alt={title} className="mx-auto max-h-[62vh] w-full rounded-2xl bg-gray-100 object-contain" />
          <h2 className="mt-3 text-xl font-extrabold leading-tight tracking-tight text-gray-900 [overflow-wrap:anywhere]">{title}</h2>
          {teacher && <div className="mt-2.5"><GlassTeacherChip name={teacher.name} photoUrl={teacher.photoUrl} tone="light" onOpen={onTeacher} caption="Teaching this class" /></div>}
        </>
      ) : (
        <div className="relative flex aspect-[4/5] max-h-[62vh] w-full items-end overflow-hidden rounded-2xl text-white" style={{ background: gradientCss(week) }}>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-[rgba(10,12,28,0.78)] via-[rgba(10,12,28,0.4)] to-transparent" aria-hidden="true" />
          <div className="relative grid w-full gap-3 px-3.5 pb-3.5">
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-tight [overflow-wrap:anywhere] [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">{title}</h2>
            {teacher && <GlassTeacherChip name={teacher.name} photoUrl={teacher.photoUrl} tone="dark" onOpen={onTeacher} caption="Teaching this class" />}
          </div>
        </div>
      )}
      <ManualButton week={week} className="mt-3.5" />
    </HomeSheet>
  );
};
