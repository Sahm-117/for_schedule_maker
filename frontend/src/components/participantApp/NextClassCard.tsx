import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import type { ParticipantHomeWeek } from '../../types';

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

// "Thu 22 Oct", in Lagos time, for "Manual arrives …".
const arrivesLabel = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).replace(',', '');
};

const Avatar = ({ name, photoUrl, size }: { name: string; photoUrl: string | null; size: number }) => (
  photoUrl
    ? <img src={photoUrl} alt="" className="flex-none rounded-full border-2 border-white object-cover shadow" style={{ width: size, height: size }} />
    : <span className="grid flex-none place-items-center rounded-full bg-gradient-to-br from-orange-200 to-orange-400 font-extrabold text-white" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">{initialsOf(name)}</span>
);

/** The one button: opens the manual once it has arrived, otherwise says when it will. */
const ManualButton: React.FC<{ week: ParticipantHomeWeek; className?: string }> = ({ week, className = '' }) => {
  const base = `flex min-h-[46px] w-full items-center justify-center rounded-[14px] px-4 text-[14.5px] font-bold ${className}`;
  if (week.manual) return <NavLink to={`/me/week/${week.weekNumber}`} className={`${base} bg-primary text-white`}>Open manual</NavLink>;
  const when = arrivesLabel(week.manualReleasesAt);
  if (!when) return null; // no manual is coming yet, so there is nothing to promise
  return <span className={`${base} cursor-default bg-gray-100 text-gray-500`} aria-disabled="true">{`Manual arrives ${when}`}</span>;
};

const TeacherSheet: React.FC<{ week: ParticipantHomeWeek; title: string; onClose: () => void }> = ({ week, title, onClose }) => {
  const teacher = week.teacher!;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`About ${teacher.name}`} className="w-full max-w-lg rounded-t-[26px] bg-white px-5 pb-5 pt-3 shadow-xl sm:rounded-[26px]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <div className="flex items-center gap-3.5">
          <Avatar name={teacher.name} photoUrl={teacher.photoUrl} size={76} />
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-tight text-gray-900">{teacher.name}</h2>
            {teacher.role && <p className="mt-0.5 text-[13px] text-gray-500">{teacher.role}</p>}
          </div>
        </div>
        {teacher.bio && <p className="mt-3.5 whitespace-pre-line text-[14px] leading-relaxed text-gray-700">{teacher.bio}</p>}
        <div className="mt-3.5 rounded-[14px] border border-dashed border-gray-300 px-3 py-2.5 text-xs text-gray-500">
          <b className="block text-[12.5px] text-gray-900">Teaching</b>{title}
        </div>
        <ManualButton week={week} className="mt-3.5" />
        <button type="button" onClick={onClose} className="mt-2 min-h-[44px] w-full text-sm font-semibold text-gray-500">Close</button>
      </div>
    </div>,
    document.body,
  );
};

/**
 * "Next class": the class graphic with its name, who is teaching, and one button. It only shows what the home page
 * does not already say (no date, countdown or week count). With neither a graphic nor a teacher it renders nothing,
 * and the page keeps its plain manual row.
 */
export const hasClassCard = (week: ParticipantHomeWeek | null | undefined): boolean => !!week && (!!week.classGraphicUrl || !!week.teacher);

const NextClassCard: React.FC<{ week: ParticipantHomeWeek }> = ({ week }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!hasClassCard(week)) return null;
  const title = week.title?.trim() || `Class ${week.weekNumber}`;
  const teacher = week.teacher;
  const teacherChip = teacher && (
    <button type="button" onClick={() => setSheetOpen(true)} className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/40 bg-white/25 py-1 pl-1 pr-3.5 text-left backdrop-blur-md" aria-label={`About ${teacher.name}, teaching this class`}>
      <Avatar name={teacher.name} photoUrl={teacher.photoUrl} size={30} />
      <span className="text-xs font-bold text-white">{teacher.name} ›</span>
    </button>
  );
  return (
    <section data-wt="ph-next-class" className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <p className="px-1 pb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Next class</p>
      {week.classGraphicUrl ? (
        <div className="relative h-[208px] overflow-hidden rounded-2xl bg-[#f6f7f9]">
          <img src={week.classGraphicUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* A soft dark fade, so the class name reads on any graphic. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[rgba(20,10,0,0.62)] via-[rgba(20,10,0,0.34)] to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-4 bottom-3.5 text-white">
            <h2 className="text-2xl font-extrabold leading-[1.1] tracking-tight [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">{title}</h2>
            {teacherChip}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#ffe8d6] bg-white p-4">
          <h2 className="text-[22px] font-extrabold leading-[1.1] tracking-tight text-gray-900">{title}</h2>
          {teacher && (
            <button type="button" onClick={() => setSheetOpen(true)} className="mt-3.5 flex min-h-[44px] w-full items-center gap-2.5 border-t border-[#f3e7dc] pt-3 text-left" aria-label={`About ${teacher.name}, teaching this class`}>
              <Avatar name={teacher.name} photoUrl={teacher.photoUrl} size={38} />
              <span className="min-w-0"><b className="block text-[13.5px] text-gray-900">{teacher.name}</b><span className="text-[11.5px] text-gray-500">Tap to meet them ›</span></span>
            </button>
          )}
        </div>
      )}
      <ManualButton week={week} className="mt-3" />
      {sheetOpen && teacher && <TeacherSheet week={week} title={title} onClose={() => setSheetOpen(false)} />}
    </section>
  );
};

export default NextClassCard;
