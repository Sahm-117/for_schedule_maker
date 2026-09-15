import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface InfoTipProps {
  children: React.ReactNode;
  label?: string;
}

// Small ⓘ button; tapping it shows the explanation in a popover (portalled so nothing clips it).
const InfoTip: React.FC<InfoTipProps> = ({ children, label = 'More info' }) => {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(260, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
      const below = rect.bottom + 8;
      const top = below + 120 > window.innerHeight ? Math.max(12, rect.top - 8 - 120) : below;
      setStyle({ position: 'fixed', top, left, width, zIndex: 130 });
    };
    const close = (event: PointerEvent) => {
      if (popRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        aria-label={label}
        aria-expanded={open}
        className={`inline-grid h-5 w-5 flex-none place-items-center rounded-full border align-middle transition ${open ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M12 11v6M12 7.5v.01" /></svg>
      </button>
      {open && createPortal(
        <div ref={popRef} role="tooltip" style={style} className="rounded-xl bg-gray-800 px-3 py-2.5 text-xs font-medium leading-relaxed text-white shadow-[0_12px_30px_-10px_rgba(17,24,39,0.45)]">
          {children}
        </div>,
        document.body
      )}
    </>
  );
};

export default InfoTip;
