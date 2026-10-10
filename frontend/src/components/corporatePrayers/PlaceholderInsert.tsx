import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PRAYER_PLACEHOLDERS } from '../../utils/prayerText';
import { INPUT } from './ui';

// The verse text box with a placeholder menu: press @ (or tap Insert) and pick one, so nothing has to be copied by hand.

interface Props {
  id: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}

const PlaceholderInsert: React.FC<Props> = ({ id, value, onChange, rows = 6, placeholder }) => {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState<null | 'at' | 'button'>(null);
  const [atIndex, setAtIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(null), []);

  // Tapping anywhere else closes the menu.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent | TouchEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open, close]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    const caret = event.target.selectionStart ?? next.length;
    onChange(next);
    // Typing an @ at the start of a word opens the menu there.
    if (next.length > value.length && next[caret - 1] === '@' && (caret === 1 || /\s/.test(next[caret - 2]))) { setAtIndex(caret - 1); setOpen('at'); }
    else if (open === 'at') close();
  };

  const insert = (token: string) => {
    const area = areaRef.current;
    const start = open === 'at' && atIndex >= 0 ? atIndex : (area?.selectionStart ?? value.length);
    const end = open === 'at' && atIndex >= 0 ? atIndex + 1 : (area?.selectionEnd ?? value.length);
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    close();
    window.requestAnimationFrame(() => {
      area?.focus();
      const caret = start + token.length;
      area?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={wrapRef} className="relative">
      <textarea
        ref={areaRef}
        id={id}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}
        className={`${INPUT} resize-y py-2.5 leading-relaxed`}
        placeholder={placeholder}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => setOpen(open === 'button' ? null : 'button')} aria-haspopup="listbox" aria-expanded={!!open} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-gray-100 px-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-200">
          <span aria-hidden="true">@</span> Insert
        </button>
        <span className="text-xs text-gray-500">Type @ to insert the person’s name. A blank line adds spacing; start a line with - for a bullet.</span>
      </div>
      {open && (
        <ul role="listbox" aria-label="Placeholders" className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_10px_30px_-8px_rgba(17,24,39,0.25)] ring-1 ring-gray-200" style={{ top: open === 'at' ? '3rem' : undefined, bottom: open === 'button' ? '2.25rem' : undefined }}>
          {PRAYER_PLACEHOLDERS.map((item) => (
            <li key={item.token} role="option" aria-selected={false}>
              <button type="button" autoFocus onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.token)} className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
                <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                <span className="text-xs text-gray-500">{item.token} → {item.example}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PlaceholderInsert;
