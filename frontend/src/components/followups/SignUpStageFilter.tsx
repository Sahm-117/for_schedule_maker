import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Filter icon that sits to the right of the sign-up search box. Tapping it opens
// a checklist of follow-up stages; a badge shows how many are on, and an X
// beside it clears them all.

export interface SignUpStageOption {
  value: string;
  label: string;
  count: number;
}

interface SignUpStageFilterProps {
  options: SignUpStageOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

const SignUpStageFilter: React.FC<SignUpStageFilterProps> = ({ options, values, onChange }) => {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const active = values.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 24);
      const height = popRef.current?.offsetHeight ?? 300;
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 8);
      const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
      setStyle({ position: 'fixed', top, left, width, zIndex: 120 });
    };
    const close = (event: PointerEvent) => {
      if (popRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  return (
    <>
      {active && (
        <button
          type="button"
          onClick={() => onChange([])}
          aria-label="Clear filters"
          className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Filter by follow-up stage"
        aria-expanded={open}
        className={`relative grid h-12 w-12 flex-none place-items-center rounded-xl border ${active ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 bg-white text-gray-600'} hover:bg-gray-50`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18l-7 8.5V20l-4-2v-4.5L3 5Z" /></svg>
        {active && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{values.length}</span>
        )}
      </button>
      {open && createPortal(
        <div ref={popRef} style={style} role="dialog" aria-label="Filter registrations" className="rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)]">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Follow-up stage</p>
          {options.map((option) => {
            const on = values.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-[14px] ${on ? 'bg-orange-50 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-md border ${on ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white'}`}>
                  {on && <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>}
                </span>
                <span className="min-w-0 flex-1">{option.label}</span>
                <span className="flex-none text-[12px] tabular-nums text-gray-400">{option.count}</span>
              </button>
            );
          })}
          {active && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-xl border-t border-gray-100 px-2.5 py-2.5 text-left text-[13px] font-semibold text-gray-500 hover:bg-gray-50">
              Clear filters
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default SignUpStageFilter;
