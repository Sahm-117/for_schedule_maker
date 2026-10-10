import React from 'react';

// Small form pieces for the Corporate prayers page.

export const Toggle: React.FC<{ checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string; id: string; disabled?: boolean }> = ({ checked, onChange, label, hint, id, disabled }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900">{label}</label>
      {hint && <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{hint}</p>}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[#34c759]' : 'bg-gray-300'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

export const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

export const INPUT = 'min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 text-[15px] text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export const Segmented: React.FC<{ value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label: string }> = ({ value, onChange, options, label }) => (
  <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-[#eceef2] p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={`min-h-[40px] flex-1 rounded-xl px-2 text-[13px] font-semibold transition ${value === option.value ? 'bg-[#3f4757] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const PRIMARY_BTN = 'min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-white active:scale-95 disabled:opacity-60';
export const SECONDARY_BTN = 'min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-60';

export const Notice: React.FC<{ tone: 'error' | 'warn' | 'info'; children: React.ReactNode }> = ({ tone, children }) => (
  <p
    role={tone === 'error' ? 'alert' : undefined}
    className={`rounded-xl px-3 py-2.5 text-sm ${tone === 'error' ? 'bg-red-50 text-red-700' : tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}
  >
    {children}
  </p>
);
