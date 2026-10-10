import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Who teaches a class: a photo (or initials), name and role, a short bio, and the class they teach.
// Opened from the home "Next class" card, the participant Journey and the support Classes lists.

export interface ClassTeacher {
  name: string;
  role: string | null;
  bio: string | null;
  photoUrl: string | null;
}

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

export const TeacherAvatar = ({ name, photoUrl, size }: { name: string; photoUrl: string | null; size: number }) => (
  photoUrl
    ? <img src={photoUrl} alt="" className="flex-none rounded-full border-2 border-white object-cover shadow" style={{ width: size, height: size }} />
    : <span className="grid flex-none place-items-center rounded-full bg-gradient-to-br from-orange-200 to-orange-400 font-extrabold text-white" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">{initialsOf(name)}</span>
);

/** A teacher only counts once a name is set (the bio and photo show only with one). */
export const classTeacher = (name?: string | null, role?: string | null, bio?: string | null, photoUrl?: string | null): ClassTeacher | null => {
  const trimmed = name?.trim();
  return trimmed ? { name: trimmed, role: role?.trim() || null, bio: bio?.trim() || null, photoUrl: photoUrl || null } : null;
};

/** A small tappable chip for a class row. Put it next to the row, not inside it: it is its own button. */
export const TeacherChip: React.FC<{ teacher: ClassTeacher; onOpen: () => void; className?: string }> = ({ teacher, onOpen, className = '' }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`About ${teacher.name}, teaching this class`}
    className={`inline-flex min-h-[28px] max-w-full items-center gap-1.5 rounded-full border border-[#ffdeca] bg-[#fff7f0] py-0.5 pl-0.5 pr-2.5 text-left text-[12px] font-bold text-[#9a4a12] ${className}`}
  >
    <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={22} />
    <span className="truncate">{teacher.name} ›</span>
  </button>
);

/** The teacher's photo, full size over a dark backdrop. Tap anywhere or press Escape to close it. */
const PhotoViewer: React.FC<{ name: string; photoUrl: string; onClose: () => void }> = ({ name, photoUrl, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-5" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close photo" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/20 text-xl text-white">&times;</button>
      <img src={photoUrl} alt={name} className="max-h-[82vh] max-w-full rounded-2xl object-contain" />
    </div>,
    document.body,
  );
};

export const TeacherSheet: React.FC<{ teacher: ClassTeacher; title: string; onClose: () => void; footer?: React.ReactNode }> = ({ teacher, title, onClose, footer }) => {
  const [photoOpen, setPhotoOpen] = useState(false);
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
          {teacher.photoUrl ? (
            <button type="button" onClick={() => setPhotoOpen(true)} aria-label={`Enlarge the photo of ${teacher.name}`} className="relative flex-none rounded-full">
              <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={76} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-[#1c2230] text-white" aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
              </span>
            </button>
          ) : (
            <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={76} />
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-tight text-gray-900 [overflow-wrap:anywhere]">{teacher.name}</h2>
            {teacher.role && <p className="mt-0.5 text-[13px] text-gray-500">{teacher.role}</p>}
          </div>
        </div>
        {teacher.bio && <p className="mt-3.5 whitespace-pre-line text-[14px] leading-relaxed text-gray-700">{teacher.bio}</p>}
        <div className="mt-3.5 rounded-[14px] border border-dashed border-gray-300 px-3 py-2.5 text-xs text-gray-500">
          <b className="block text-[12.5px] text-gray-900">Teaching</b>{title}
        </div>
        {footer}
        <button type="button" onClick={onClose} className="mt-2 min-h-[44px] w-full text-sm font-semibold text-gray-500">Close</button>
      </div>
      {photoOpen && teacher.photoUrl && <PhotoViewer name={teacher.name} photoUrl={teacher.photoUrl} onClose={() => setPhotoOpen(false)} />}
    </div>,
    document.body,
  );
};
