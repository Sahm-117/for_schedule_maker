import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { FollowUpContact } from '../../types';

interface ExportContactsPopupProps {
  contacts: FollowUpContact[];
  onClose: () => void;
}

const ExportContactsPopup: React.FC<ExportContactsPopupProps> = ({ contacts, onClose }) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatLine = (c: FollowUpContact) => `${c.fullName}\t${c.phone || ''}`;

  const copyAll = async () => {
    const text = contacts.map(formatLine).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch { /* ignore */ }
  };

  const copyOne = async (c: FollowUpContact) => {
    try {
      await navigator.clipboard.writeText(`${c.fullName}\t${c.phone || ''}`);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div className="relative mb-0 max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Export contacts</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => { void copyAll(); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.98]"
          >
            {copiedAll ? 'Copied!' : `Copy all (${contacts.length})`}
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5">
          {contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No contacts to export.</p>
          ) : (
            <div className="divide-y divide-orange-50">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{c.fullName}</p>
                    <p className="truncate text-xs text-gray-500">{c.phone || '—'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void copyOne(c); }}
                    className="ml-3 shrink-0 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-orange-50 active:scale-95"
                  >
                    {copiedId === c.id ? (
                      'Copied!'
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExportContactsPopup;
