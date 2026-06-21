import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type MultiSelectOption = {
  value: string;
  label: string;
};

interface AppMultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

// Multi-select sibling of AppSelect: same portal-positioned, viewport-flipping,
// searchable-when-long dropdown, but rows toggle on click (menu stays open) and
// the trigger summarises the selection. Used for participant departments.
const AppMultiSelect: React.FC<AppMultiSelectProps> = ({
  values,
  onChange,
  options,
  placeholder,
  label,
  compact = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const searchable = options.length > 6;

  const selectedSet = useMemo(() => new Set(values), [values]);

  const summaryLabel = useMemo(() => {
    if (values.length === 0) return placeholder;
    const labels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  }, [values, options, selectedSet, placeholder]);

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

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
      const margin = 12;
      const menuHeight = visibleItemCount * itemHeight + searchHeight + 24;
      let top = rect.bottom + 6;
      let left = rect.left;

      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
        top = Math.max(margin, rect.top - Math.min(menuHeight, spaceAbove) - 6);
      }
      if (left + width > window.innerWidth) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      const maxMenuWidth = Math.max(width, Math.min(360, window.innerWidth - 24));
      const maxHeight = Math.max(120, window.innerHeight - top - margin);

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        minWidth: width,
        maxWidth: maxMenuWidth,
        maxHeight,
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
          <p className={`truncate font-semibold ${values.length === 0 ? 'text-gray-400' : 'text-gray-900'} ${compact ? 'text-sm' : 'text-[16px]'}`}>
            {summaryLabel}
          </p>
        </div>
        <span className={`ml-2 inline-flex flex-shrink-0 items-center justify-center rounded-full transition-transform ${open ? 'rotate-180' : ''} ${
          compact ? 'h-5 w-5 bg-gray-100 text-gray-400' : 'h-8 w-8 bg-orange-50 text-gray-500'
        }`}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={menuStyle} className="flex flex-col overflow-hidden rounded-[24px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm font-semibold text-gray-400">No options found</p>
            ) : filteredOptions.map((option) => {
              const selected = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onPointerDown={() => toggle(option.value)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition ${
                    selected ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <p className="min-w-0 truncate text-sm font-semibold">{option.label}</p>
                  <span className={`ml-3 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition ${
                    selected ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-transparent'
                  }`}>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
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

export default AppMultiSelect;
