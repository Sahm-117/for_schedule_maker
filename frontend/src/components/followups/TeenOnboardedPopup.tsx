import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TeenOnboardedHow } from '../../types';

export const TEEN_ONBOARDED_HOW: Array<{ value: TeenOnboardedHow; label: string }> = [
  { value: 'WHATSAPP_GROUP', label: 'Added to the WhatsApp group' },
  { value: 'PARENT_REACHED', label: 'Parent or guardian reached' },
  { value: 'PHONE_CALL', label: 'Spoke by phone' },
];

export const teenOnboardedLabel = (how?: TeenOnboardedHow | null): string =>
  TEEN_ONBOARDED_HOW.find((item) => item.value === how)?.label ?? '';

interface TeenOnboardedPopupProps {
  contactName: string;
  onSave: (how: TeenOnboardedHow) => void;
  onCancel: () => void;
}

// Onboarded is the support's word that contact is made, so it asks what warrants it.
const TeenOnboardedPopup: React.FC<TeenOnboardedPopupProps> = ({ contactName, onSave, onCancel }) => {
  const [selected, setSelected] = useState<TeenOnboardedHow | ''>('');

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/35" onClick={onCancel} />
      <div className="relative mb-20 w-[90vw] max-w-[340px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="What makes them onboarded?">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">What makes them onboarded?</p>
        <p className="mb-5 truncate text-center text-sm font-semibold text-gray-900">{contactName}</p>
        <div className="space-y-2" role="radiogroup">
          {TEEN_ONBOARDED_HOW.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={selected === item.value}
              onClick={() => setSelected(item.value)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                selected === item.value ? 'border-primary bg-primary/5 text-primary' : 'border-orange-100 bg-white text-gray-700 hover:bg-orange-50'
              }`}
            >
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${selected === item.value ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                {selected === item.value && (
                  <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" /></svg>
                )}
              </span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
          <button type="button" disabled={!selected} onClick={() => selected && onSave(selected)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TeenOnboardedPopup;
