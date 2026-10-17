import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A class's graphic for supports: a small picture that opens whole (never cropped) over the page.
// Esc, the Close button or a tap outside closes it.
const Viewer: React.FC<{ url: string; title: string; onClose: () => void }> = ({ url, title, onClose }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title} graphic`} className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <img src={url} alt={title} className="max-h-[80vh] max-w-full rounded-2xl bg-gray-100 object-contain" onClick={(event) => event.stopPropagation()} />
      <button ref={closeRef} type="button" onClick={onClose} className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-gray-900">Close</button>
    </div>,
    document.body
  );
};

/** The class graphic as a tappable thumbnail; renders nothing when the class has none. */
const ClassGraphicThumb: React.FC<{ url?: string | null; title: string; className?: string }> = ({ url, title, className = 'h-[92px] w-[92px]' }) => {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View the ${title} graphic`} className={`flex-none overflow-hidden rounded-2xl bg-gray-100 ${className}`}>
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
      {open && <Viewer url={url} title={title} onClose={() => setOpen(false)} />}
    </>
  );
};

export default ClassGraphicThumb;
