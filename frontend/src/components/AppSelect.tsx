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
  loading?: boolean;
}

const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  label,
  compact = false,
  className = '',
  loading = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const searchable = options.length > 6;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;

    return options.filter((option) => {
      const label = option.label.toLowerCase();
      const meta = option.meta?.toLowerCase() || '';
      return label.includes(query) || meta.includes(query);
    });
  }, [options, searchQuery]);

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
    if (open) return;
    setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    const canSafelyFocus =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches &&
      window.innerWidth >= 768;

    if (!canSafelyFocus) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = rect.width;
      const itemHeight = 48;
      const searchHeight = searchable ? 58 : 0;
      const visibleItemCount = Math.max(1, Math.min(filteredOptions.length, 6));
      const menuHeight = visibleItemCount * itemHeight + searchHeight + 24;
      let top = rect.bottom + 6;
      let left = rect.left;

      if (top + menuHeight > window.innerHeight) {
        top = Math.max(12, rect.top - menuHeight - 6);
      }
      if (left + width > window.innerWidth) {
        left = Math.max(12, window.innerWidth - width - 12);
      }
      const maxMenuWidth = Math.max(width, Math.min(360, window.innerWidth - 24));

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        minWidth: width,
        maxWidth: maxMenuWidth,
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
  }, [filteredOptions.length, open, options.length, searchable]);

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-[90]' : 'z-10'} ${className}`}>
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
          {label}
        </p>
      )}
      <button
        type="button"
        onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (!start) return;
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx > 8 || dy > 8) return;
          setOpen((prev) => !prev);
        }}
        className={`flex w-full items-center justify-between rounded-2xl border bg-white text-left shadow-sm transition ${
          compact ? 'border-gray-200/70 px-2 py-1.5 min-h-[36px] hover:border-gray-300' : 'border-orange-100 px-4 py-3 hover:border-orange-200 hover:bg-orange-50/40'
        }`}
      >
          <div className="min-w-0">
          <p className={`font-semibold ${compact ? 'text-sm text-gray-600' : 'text-[16px] text-gray-900'}`}>
            {selectedOption?.label || placeholder}
          </p>
          {selectedOption?.meta && (
            <p className="text-xs text-gray-500">{selectedOption.meta}</p>
          )}
        </div>
        <span className={`ml-2 inline-flex flex-shrink-0 items-center justify-center rounded-full transition-transform ${open ? 'rotate-180' : ''} ${
          compact ? 'h-5 w-5 bg-gray-100 text-gray-400' : 'h-8 w-8 bg-orange-50 text-gray-500'
        }`}>
          {loading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
            </svg>
          )}
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={menuStyle} className="overflow-hidden rounded-[24px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
          {searchable && (
            <div className="border-b border-orange-100/70 p-1.5">
              <div className="flex items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2">
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm font-semibold text-gray-400">No options found</p>
            ) : filteredOptions.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onPointerDown={() => {
                    onChange(option.value);
                    setSearchQuery('');
                  }}
                  onClick={() => setOpen(false)}
                  className={`flex w-full items-start justify-between rounded-2xl px-3 py-2.5 text-left transition ${
                    selected ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{option.label}</p>
                    {option.meta && <p className="text-xs leading-tight text-gray-500">{option.meta}</p>}
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
