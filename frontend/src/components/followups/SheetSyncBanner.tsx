import React, { useMemo, useState } from 'react';
import { followUpContactsApi } from '../../services/api';
import type { FollowUpContact } from '../../types';
import Spinner from '../Spinner';

// Shows operations when prospects registered in the app aren't reaching the
// Google sheet, and why, so a changed form is noticed quickly.
// Failures can be retried; warnings (a missing column) need the sheet's
// Sync settings updated, since resending would add a duplicate row.

const DAY_MS = 86_400_000;

const whenLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

const SheetSyncBanner: React.FC<{ contacts: FollowUpContact[]; onRetried: () => void }> = ({ contacts, onRetried }) => {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState('');

  const { failed, warned } = useMemo(() => {
    const now = Date.now();
    const fromApp = contacts.filter((contact) => contact.registeredById);
    return {
      failed: fromApp.filter((contact) =>
        contact.sheetSyncError && !contact.sheetSyncedAt
        && now - new Date(contact.createdAt ?? 0).getTime() <= 30 * DAY_MS),
      warned: fromApp.filter((contact) =>
        contact.sheetSyncWarning
        && now - new Date(contact.createdAt ?? 0).getTime() <= 7 * DAY_MS),
    };
  }, [contacts]);

  if (failed.length === 0 && warned.length === 0) return null;

  const isFailure = failed.length > 0;
  const list = isFailure ? failed : warned;
  const reason = isFailure ? list[0].sheetSyncError : list[0].sheetSyncWarning;

  const retry = async () => {
    setRetrying(true);
    setResult('');
    try {
      const { attempted, sent } = await followUpContactsApi.retrySheetSync();
      setResult(sent === attempted ? `Sent ${sent} to the sheet.` : `Sent ${sent} of ${attempted}. The rest still failed.`);
      onRetried();
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  };

  const tone = isFailure
    ? 'border-red-100 bg-red-50/70 text-red-800'
    : 'border-amber-100 bg-amber-50/70 text-amber-900';

  return (
    <div className={`mb-5 rounded-3xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {isFailure
            ? `${failed.length} prospect${failed.length === 1 ? '' : 's'} didn't reach the Google sheet`
            : `${warned.length} prospect${warned.length === 1 ? '' : 's'} reached the sheet with missing columns`}
        </p>
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-semibold underline-offset-2 hover:underline">
          {open ? 'Hide' : 'View'}
        </button>
        {isFailure && (
          <button
            type="button"
            onClick={() => { void retry(); }}
            disabled={retrying}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm disabled:opacity-60"
          >
            {retrying ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Retrying…</span>) : 'Retry now'}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs opacity-80">
        {isFailure
          ? reason
          : 'A form question was probably renamed. In the sheet, update the "Sync settings" tab, then run FOF Sync › Check setup.'}
      </p>
      {result && <p className="mt-1 text-xs font-semibold">{result}</p>}
      {open && (
        <ul className="mt-3 space-y-1.5 border-t border-current/10 pt-3">
          {list.map((contact) => (
            <li key={contact.id} className="text-xs">
              <span className="font-semibold">{contact.fullName}</span>
              <span className="opacity-70"> · {whenLabel(contact.createdAt)} · {isFailure ? contact.sheetSyncError : contact.sheetSyncWarning}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SheetSyncBanner;
