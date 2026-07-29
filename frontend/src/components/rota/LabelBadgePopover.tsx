import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface LabelBadgePopoverProps {
  /** Badge trigger text, e.g. "+2". */
  badgeText: string;
  badgeClassName: string;
  /** Full list of assigned labels shown inside the popover. */
  items: Array<{ id: string; name: string; meta?: string }>;
  title: string;
}

/**
 * Small anchored popover for a "+N" badge — lists every label a cell carries
 * without forcing a full modal open. Portal to body so ancestor overflow/blur
 * containers in the grid never clip it.
 */
const LabelBadgePopover: React.FC<LabelBadgePopoverProps> = ({ badgeText, badgeClassName, items, title }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      if (popoverRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(240, window.innerWidth - margin * 2);
      let left = rect.left;
      let top = rect.bottom + 6;

      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const estHeight = Math.min(280, items.length * 44 + 16);
      if (estHeight > spaceBelow) {
        top = Math.max(margin, rect.top - estHeight - 6);
      }
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }

      setStyle({ position: 'fixed', top, left, width, maxHeight: 280, zIndex: 100 });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, items.length]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${badgeClassName}`}
      >
        {badgeText}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={style}
          className="flex flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
        >
          <p className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gray-400">
            {title}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl px-2 py-1.5">
                <p className="truncate text-sm font-semibold text-gray-800">{item.name}</p>
                {item.meta && <p className="text-xs leading-tight text-gray-500">{item.meta}</p>}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default LabelBadgePopover;
