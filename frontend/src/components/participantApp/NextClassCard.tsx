import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ParticipantHomeWeek } from '../../types';
import { TeacherAvatar, TeacherSheet } from '../TeacherSheet';
import HomeSheet from './HomeSheet';
import { gradientAt } from '../../utils/prayerText';

// "Next class" on the participant Home: a compact row (the class picture, its name, the teacher) that opens the full
// graphic in a bottom sheet. The manual opens from that sheet or from the teacher details, straight into the manual.

// "Thu 22 Oct", in Lagos time, for "Manual arrives …".
const arrivesLabel = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).replace(',', '');
};

/** The one manual button: opens the manual itself once it has arrived, otherwise says when it will. */
const ManualButton: React.FC<{ week: ParticipantHomeWeek; className?: string }> = ({ week, className = '' }) => {
  const base = `flex min-h-[46px] w-full items-center justify-center rounded-[14px] px-4 text-[14.5px] font-bold ${className}`;
  if (week.manual?.documentUrl) return <NavLink to={`/me/week/${week.weekNumber}?manual=1`} className={`${base} bg-primary text-white`}>Open manual</NavLink>;
  const when = arrivesLabel(week.manualReleasesAt);
  if (!when) return null; // no manual is coming yet, so there is nothing to promise
  return <span className={`${base} cursor-default bg-gray-100 text-gray-500`} aria-disabled="true">{`Manual arrives ${when}`}</span>;
};

/** Every class gets the card: its graphic, or a steady gradient with the class name when none was uploaded. */
export const hasClassCard = (week: ParticipantHomeWeek | null | undefined): boolean => !!week;

const gradientCss = (week: ParticipantHomeWeek) => {
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
const ClassGraphicSheet: React.FC<{ week: ParticipantHomeWeek; title: string; onClose: () => void; onTeacher: () => void }> = ({ week, title, onClose, onTeacher }) => {
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

const NextClassCard: React.FC<{ week: ParticipantHomeWeek }> = ({ week }) => {
  const [graphicOpen, setGraphicOpen] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const title = week.title?.trim() || `Class ${week.weekNumber}`;
  const teacher = week.teacher;
  return (
    // The whole card opens the graphic (a phone tap rarely lands on the small picture or arrow). The buttons inside stay for keyboards,
    // and the teacher chip keeps its own tap. Taps inside the sheets (portalled, so still React children) must not reopen it.
    <section data-wt="ph-next-class" onClick={(event) => { if (event.currentTarget.contains(event.target as Node)) setGraphicOpen(true); }} className="cursor-pointer rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <p className="px-0.5 pb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Next class</p>
      <div className="grid grid-cols-[96px_minmax(0,1fr)_24px] items-start gap-3">
        <button type="button" onClick={() => setGraphicOpen(true)} aria-label={`View the ${title} graphic`} className="block h-24 w-24 overflow-hidden rounded-[14px]" style={{ background: gradientCss(week) }}>
          {week.classGraphicUrl && <img src={week.classGraphicUrl} alt="" className="h-full w-full object-cover" />}
        </button>
        <div className="grid min-w-0 justify-items-start gap-2">
          <button type="button" onClick={() => setGraphicOpen(true)} className="min-w-0 max-w-full text-left">
            <h2 className="text-[18px] font-extrabold leading-[1.15] tracking-tight text-gray-900 [overflow-wrap:anywhere]">{title}</h2>
          </button>
          {teacher && (
            <span className="max-w-full rounded-2xl bg-sky-500/[0.09] p-[3px]" onClick={(event) => event.stopPropagation()}>
              <GlassTeacherChip name={teacher.name} photoUrl={teacher.photoUrl} tone="light" onOpen={() => setTeacherOpen(true)} />
            </span>
          )}
        </div>
        <button type="button" onClick={() => setGraphicOpen(true)} aria-label="View the graphic" className="grid h-10 w-6 place-items-center self-center text-[#9a6a4b]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
      {graphicOpen && !teacherOpen && (
        <ClassGraphicSheet week={week} title={title} onClose={() => setGraphicOpen(false)} onTeacher={() => setTeacherOpen(true)} />
      )}
      {teacherOpen && teacher && (
        <TeacherSheet teacher={teacher} title={title} onClose={() => setTeacherOpen(false)} footer={<ManualButton week={week} className="mt-3.5" />} />
      )}
    </section>
  );
};

export default NextClassCard;
