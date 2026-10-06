import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { pushSubscriptionsApi, usersApi } from '../../services/api';
import { sortByText } from '../../utils/sort';
import { buildSupportsList } from '../../utils/whatsappExport';
import type { User } from '../../types';
import { hasSupportRole } from '../../utils/people';

// Users → ⋮ → Export supports: every active support with their number, ready
// to paste into WhatsApp. A * marks anyone without a saved notification.
// Test accounts are left out, as they are from the counts.

const SupportsAlertsExportPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [supports, setSupports] = useState<User[] | null>(null);
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([usersApi.getAll(), pushSubscriptionsApi.listSubscribedUserIds()])
      .then(([users, ids]) => {
        if (cancelled) return;
        setSupports(sortByText(users.users.filter((u) => hasSupportRole(u) && u.isActive !== false && !u.isTest), (u) => u.name));
        setSubscribed(new Set(ids));
      })
      .catch(() => { if (!cancelled) setError('Could not load the supports. Please try again.'); });
    return () => { cancelled = true; };
  }, []);

  const missingAlerts = useMemo(
    () => new Set((supports ?? []).filter((s) => !subscribed.has(s.id)).map((s) => s.id)),
    [supports, subscribed],
  );
  const text = useMemo(() => (supports ? buildSupportsList(supports, missingAlerts) : ''), [supports, missingAlerts]);

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
      <div className="relative mb-0 max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Export supports</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error ? (
          <p className="px-5 py-8 text-center text-sm text-red-700">{error}</p>
        ) : !supports ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Loading supports…</p>
        ) : (
          <>
            <div className="px-5 py-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void copyAll(); }}
                  disabled={supports.length === 0}
                  className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
                >
                  {copied ? 'Copied!' : `Copy all (${supports.length})`}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
                >
                  WhatsApp
                </a>
              </div>
              <p className="mt-2 text-center text-xs text-gray-400">Numbered list, formatted for WhatsApp. * marks anyone whose notifications are off or who hasn't put the app on their Home Screen.</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-5">
              {supports.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No supports to export.</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-2xl border border-orange-100 bg-orange-50/40 p-3 text-xs leading-relaxed text-gray-700">{text}</pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SupportsAlertsExportPopup;
