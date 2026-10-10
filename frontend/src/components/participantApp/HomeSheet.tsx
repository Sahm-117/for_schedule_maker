import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A bottom sheet for the participant Home (class graphic, all inspirational posts). Rendered through a portal
// so nothing on the page can clip it; Escape, the backdrop and the close button all close it.

const HomeSheet: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({ label, onClose, children }) => {
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
      <div role="dialog" aria-modal="true" aria-label={label} className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-white px-4 pb-5 pt-3 shadow-xl sm:rounded-[26px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-lg text-gray-700 shadow">&times;</button>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default HomeSheet;
