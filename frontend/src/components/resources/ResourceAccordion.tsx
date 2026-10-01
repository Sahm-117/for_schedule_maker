import React from 'react';

// A compact collapsible row: a title, a one-line summary (orange once something
// is set) and a chevron. Used to keep advanced options out of the way.
const ResourceAccordion: React.FC<{
  title: string;
  summary: string;
  active?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, summary, active = false, open, onToggle, children }) => (
  <div className={`rounded-2xl border bg-white ${open ? 'border-orange-200' : 'border-gray-200'}`}>
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-800">{title}</span>
        <span className={`block truncate text-[11px] ${active ? 'font-semibold text-primary' : 'text-gray-500'}`}>{summary}</span>
      </span>
      <svg className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 6l6 6-6 6" />
      </svg>
    </button>
    {open && <div className="space-y-3 border-t border-gray-100 px-4 py-3">{children}</div>}
  </div>
);

export default ResourceAccordion;
