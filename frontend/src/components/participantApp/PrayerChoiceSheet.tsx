import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A small sheet to change the corporate-prayers answer after the pop-up has been answered. Choosing applies at once, so
// there is no Save. Unlike the pop-up this one can be closed (backdrop, Escape or Done).

const Option: React.FC<{ on: boolean; title: string; hint: string; disabled: boolean; onPick: () => void }> = ({ on, title, hint, disabled, onPick }) => (
  <button
    type="button"
    role="radio"
    aria-checked={on}
    aria-disabled={disabled}
    onClick={() => { if (!on && !disabled) onPick(); }}
    className={`mt-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${disabled ? 'opacity-60' : ''} ${on ? 'bg-[#fff1e6] ring-[1.5px] ring-inset ring-primary' : 'bg-[#f5f5f7]'}`}
  >
    <span className={`h-5 w-5 flex-none rounded-full ${on ? 'border-[6px] border-primary' : 'border-2 border-gray-300'}`} aria-hidden="true" />
    <span className="min-w-0">
      <span className="block text-[15px] font-semibold text-gray-900">{title}</span>
      <span className="block text-[12.5px] leading-snug text-gray-500">{hint}</span>
    </span>
  </button>
);

const PrayerChoiceSheet: React.FC<{
  consent: 'IN' | 'OUT';
  startsText: string | null;
  saving: boolean;
  onChoose: (include: boolean) => void;
  onClose: () => void;
}> = ({ consent, startsText, saving, onChoose, onClose }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Focus goes into the sheet and comes back to the chip that opened it.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus(); };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="prayerchoice-title" className="w-full max-w-md rounded-t-[26px] bg-white px-5 pb-5 pt-3 shadow-xl sm:rounded-[26px]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <h2 id="prayerchoice-title" className="text-[19px] font-extrabold tracking-[-0.02em] text-gray-900">Corporate prayers</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-600">
          Everyone in this cohort prays together for each person&apos;s faith project{startsText ? `, from ${startsText}` : ''}.
        </p>
        <div role="radiogroup" aria-label="Corporate prayers">
          <Option on={consent === 'IN'} disabled={saving} onPick={() => onChoose(true)} title="Include my faith project" hint="Your photo and project are shown to the cohort" />
          <Option on={consent === 'OUT'} disabled={saving} onPick={() => onChoose(false)} title="Opt out" hint="Your project is not prayed for" />
        </div>
        <button type="button" onClick={onClose} className="mt-3 min-h-[44px] w-full text-[15px] font-semibold text-gray-500">Done</button>
      </div>
    </div>,
    document.body,
  );
};

export default PrayerChoiceSheet;
