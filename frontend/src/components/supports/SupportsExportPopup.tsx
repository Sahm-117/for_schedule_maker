import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '../../types';
import { buildSupportsText } from '../../utils/whatsappExport';

// Same sheet as ParticipantsExportPopup, for the supports shown on the Supports page.
interface SupportsExportPopupProps {
  supports: User[];
  title: string;
  /** The filters in use, e.g. "Incomplete profile · Hub lead". */
  subtitle: string;
  /** List what each person's profile is missing, plus a how-to footer. */
  showMissing: boolean;
  onClose: () => void;
}

const SupportsExportPopup: React.FC<SupportsExportPopupProps> = ({ supports, title, subtitle, showMissing, onClose }) => {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildSupportsText(title, subtitle, supports, showMissing), [title, subtitle, supports, showMissing]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div className="relative mb-0 max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Export supports</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => { void copyAll(); }}
            disabled={supports.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
          >
            {copied ? 'Copied!' : `Copy all (${supports.length})`}
          </button>
          <p className="mt-2 text-center text-xs text-gray-400">Numbered list — formatted for WhatsApp.</p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5">
          {supports.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No supports to export.</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-2xl border border-orange-100 bg-orange-50/40 p-3 text-xs leading-relaxed text-gray-700">{text}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SupportsExportPopup;
