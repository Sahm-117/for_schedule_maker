import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// House-style date + time field. Replaces the browser's native datetime input so
// it matches AppSelect: same trigger, same portalled panel, same option styling.
// Value format stays `YYYY-MM-DDTHH:mm` (what a native datetime-local gives), so
// callers don't change.

interface AppDateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest selectable day, as `YYYY-MM-DD`. */
  minDate?: string;
  ariaLabel?: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_OPTIONS = (() => {
  const options: Array<{ value: string; label: string }> = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const display = hour % 12 === 0 ? 12 : hour % 12;
      options.push({ value, label: `${display}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}` });
    }
  }
  return options;
})();

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const splitValue = (value: string) => {
  const [datePart = '', timePart = ''] = value.split('T');
  return { datePart, timePart: timePart.slice(0, 5) };
};
const timeLabel = (time: string) => TIME_OPTIONS.find((option) => option.value === time)?.label
  ?? (() => {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
  })();

const formatTrigger = (value: string) => {
  const { datePart, timePart } = splitValue(value);
  if (!datePart) return '';
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  return timePart ? `${day} · ${timeLabel(timePart)}` : day;
};

// Monday-first grid covering the whole month, padded to full weeks.
const buildMonthGrid = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return cells;
};

const AppDateTimePicker: React.FC<AppDateTimePickerProps> = ({ value, onChange, placeholder = 'Pick a date and time', minDate, ariaLabel }) => {
  const { datePart, timePart } = splitValue(value);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [viewMonth, setViewMonth] = useState(() => {
    const base = datePart ? new Date(`${datePart}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timeListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !datePart) return;
    setViewMonth(new Date(new Date(`${datePart}T00:00:00`).getFullYear(), new Date(`${datePart}T00:00:00`).getMonth(), 1));
  }, [open, datePart]);

  // Close on outside pointer, same as the app's other menus.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Drop below the trigger, flip above when there isn't room.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(340, window.innerWidth - margin * 2);
      const panelHeight = Math.min(520, window.innerHeight - margin * 2);
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const openUp = panelHeight > spaceBelow && rect.top - margin > spaceBelow;
      const top = openUp ? Math.max(margin, rect.top - panelHeight - 6) : rect.bottom + 6;
      let left = rect.left;
      if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
      setPanelStyle({ position: 'fixed', top, left, width, maxHeight: panelHeight, zIndex: 120 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Bring the chosen time into view when the panel opens.
  useEffect(() => {
    if (!open || !panelStyle.width) return undefined;
    const frame = requestAnimationFrame(() => {
      const list = timeListRef.current;
      if (!list) return;
      const target = (list.querySelector('[data-selected="true"]')
        ?? list.querySelector('[data-time="09:00"]')) as HTMLElement | null;
      if (!target) return;
      // Measure against the list, not the positioned panel, or the calendar's height is counted twice.
      const offsetInList = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTop = Math.max(0, offsetInList - list.clientHeight / 2 + target.clientHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, panelStyle]);

  const cells = useMemo(() => buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth()), [viewMonth]);
  const todayKey = toKey(new Date());

  const pickDate = (date: Date) => onChange(`${toKey(date)}T${timePart || '09:00'}`);
  const pickTime = (time: string) => onChange(`${datePart || todayKey}T${time}`);

  const label = formatTrigger(value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-orange-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
      >
        <span className={`min-w-0 truncate text-[15px] font-semibold ${label ? 'text-gray-900' : 'text-gray-400'}`}>
          {label || placeholder}
        </span>
        <span className="ml-2 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
          </svg>
        </span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={ariaLabel || 'Choose a date and time'}
          style={panelStyle}
          className="flex flex-col overflow-hidden rounded-[24px] border border-orange-100 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
        >
          <div className="flex flex-none items-center gap-1 px-3 pt-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-gray-500 transition hover:bg-orange-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15 5-7 7 7 7" /></svg>
            </button>
            <p className="flex-1 text-center text-sm font-bold text-gray-900">
              {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(viewMonth)}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-gray-500 transition hover:bg-orange-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
            </button>
          </div>

          <div className="grid flex-none grid-cols-7 gap-0.5 px-3 pt-2">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-gray-400">{day.slice(0, 1)}</span>
            ))}
          </div>
          <div className="grid flex-none grid-cols-7 gap-0.5 px-3 pb-2">
            {cells.map((date) => {
              const key = toKey(date);
              const inMonth = date.getMonth() === viewMonth.getMonth();
              const selected = key === datePart;
              const disabled = !!minDate && key < minDate;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDate(date)}
                  aria-label={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)}
                  aria-pressed={selected}
                  className={`grid h-8 place-items-center rounded-xl text-[13px] font-semibold transition ${
                    selected
                      ? 'bg-primary text-white'
                      : disabled
                        ? 'text-gray-300'
                        : inMonth
                          ? `text-gray-700 hover:bg-orange-50 ${key === todayKey ? 'ring-1 ring-inset ring-primary/40' : ''}`
                          : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex min-h-[132px] flex-1 flex-col overflow-hidden border-t border-orange-100/70">
            <p className="flex-none px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Time</p>
            <div ref={timeListRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
              {TIME_OPTIONS.map((option) => {
                const selected = option.value === timePart;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-selected={selected}
                    data-time={option.value}
                    onClick={() => pickTime(option.value)}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-semibold transition ${
                      selected ? 'bg-orange-50 text-primary' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                    {selected && (
                      <span className="ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m5 13 4 4L19 7" /></svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-none items-center justify-between gap-2 border-t border-orange-100/70 bg-white px-3 py-2.5">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-white">
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default AppDateTimePicker;
