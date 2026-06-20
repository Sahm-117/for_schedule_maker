import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Label } from '../types';
import LabelChip from './LabelChip';
import { sortByText } from '../utils/sort';

interface ActivityLabelPickerProps {
  labels: Label[];
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
  loading?: boolean;
}

const ActivityLabelPicker: React.FC<ActivityLabelPickerProps> = ({
  labels,
  selectedLabelIds,
  onChange,
  loading = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedLabels = useMemo(
    () => sortByText(labels.filter((label) => selectedLabelIds.includes(label.id)), (label) => label.name),
    [labels, selectedLabelIds]
  );

  const filteredLabels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = query
      ? labels.filter((label) => label.name.toLowerCase().includes(query))
      : labels;
    return sortByText(list, (label) => label.name);
  }, [labels, searchQuery]);

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
    if (!open) {
      setSearchQuery('');
      return;
    }

    const canSafelyFocus =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches &&
      window.innerWidth >= 768;
    if (!canSafelyFocus) return;

    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const margin = 12;
      const searchHeight = 58;
      const visibleItemCount = Math.max(1, Math.min(filteredLabels.length || 1, 6));
      const menuHeight = visibleItemCount * 48 + searchHeight + 20;
      let top = rect.bottom + 6;
      let left = rect.left;

      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
        top = Math.max(margin, rect.top - Math.min(menuHeight, spaceAbove) - 6);
      }
      if (left + rect.width > window.innerWidth) {
        left = Math.max(margin, window.innerWidth - rect.width - margin);
      }

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, Math.min(420, window.innerWidth - 24)),
        maxHeight: Math.max(150, window.innerHeight - top - margin),
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
  }, [filteredLabels.length, labels.length, open]);

  const toggleLabel = (labelId: string) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    onChange(next);
  };

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-[90]' : 'z-10'}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-700">
          Activity tags (optional)
        </label>
        <span className="text-xs text-gray-500">
          {loading ? 'Loading...' : `Selected: ${selectedLabelIds.length}`}
        </span>
      </div>

      <button
        type="button"
        onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (!start) return;
          const dx = Math.abs(event.clientX - start.x);
          const dy = Math.abs(event.clientY - start.y);
          if (dx > 8 || dy > 8) return;
          setOpen((prev) => !prev);
        }}
        className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
      >
        <div className="min-w-0 flex-1">
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedLabels.map((label) => (
                <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
              ))}
            </div>
          ) : (
            <p className="text-[16px] font-semibold text-gray-500">
              Select activity tags
            </p>
          )}
        </div>
        <span className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>
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
        <div ref={menuRef} style={menuStyle} className="flex flex-col overflow-hidden rounded-[24px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
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
                placeholder="Search labels..."
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-center text-sm font-semibold text-gray-400">Loading labels...</p>
            ) : labels.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm font-semibold text-gray-400">No labels yet</p>
            ) : filteredLabels.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm font-semibold text-gray-400">No labels found</p>
            ) : filteredLabels.map((label) => {
              const selected = selectedLabelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    selected ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <LabelChip name={label.name} color={label.color} size="md" />
                  {selected && (
                    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
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

export default ActivityLabelPicker;
