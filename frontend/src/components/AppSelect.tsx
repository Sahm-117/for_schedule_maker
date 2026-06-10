import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
};

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  label,
  compact = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = rect.width;
      const itemHeight = 48;
      const menuHeight = Math.min(options.length, 6) * itemHeight + 24;
      let top = rect.bottom + 6;
      let left = rect.left;

      if (top + menuHeight > window.innerHeight) {
        top = Math.max(12, rect.top - menuHeight - 6);
      }
      if (left + width > window.innerWidth) {
        left = Math.max(12, window.innerWidth - width - 12);
      }

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 100,
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-[90]' : 'z-10'} ${className}`}>
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
          {label}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-2xl border border-orange-100 bg-white text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40 ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="min-w-0">
          <p className={`truncate font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-[15px]'}`}>
            {selectedOption?.label || placeholder}
          </p>
          {selectedOption?.meta && (
            <p className="truncate text-xs text-gray-500">{selectedOption.meta}</p>
          )}
        </div>
        <span className={`ml-3 inline-flex ${compact ? 'h-7 w-7' : 'h-8 w-8'} flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-500 ${open ? 'rotate-180' : ''} transition-transform`}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={menuStyle} className="overflow-hidden rounded-[24px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onPointerDown={() => onChange(option.value)}
                  onClick={() => setOpen(false)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition ${
                    selected ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{option.label}</p>
                    {option.meta && <p className="truncate text-xs text-gray-500">{option.meta}</p>}
                  </div>
                  {selected && (
                    <span className="ml-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m5 13 4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppSelect;
