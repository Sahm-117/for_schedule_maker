import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type OverflowMenuItem = {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  icon?: React.ReactNode;
};

interface AppOverflowMenuProps {
  items: OverflowMenuItem[];
  align?: 'left' | 'right';
}

const AppOverflowMenu: React.FC<AppOverflowMenuProps> = ({ items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 176;
      const menuHeight = items.length * 48 + 16;
      let top = rect.bottom + 8;
      let left = align === 'right' ? Math.max(12, rect.right - width) : rect.left;

      if (top + menuHeight > window.innerHeight) {
        top = Math.max(12, rect.top - menuHeight - 8);
      }
      if (left + width > window.innerWidth) {
        left = Math.max(12, window.innerWidth - width - 12);
      }

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 110,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, open, items.length]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-100 bg-white text-gray-500 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-gray-700"
        aria-label="More actions"
        title="More actions"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm0 4.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm-1.25 5.75a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={menuStyle} className="overflow-hidden rounded-[24px] border border-orange-100 bg-white p-1.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onPointerDown={() => item.onClick()}
              onClick={() => setOpen(false)}
              className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                item.tone === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppOverflowMenu;
