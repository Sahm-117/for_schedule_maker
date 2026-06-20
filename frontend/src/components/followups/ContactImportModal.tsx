import React, { useMemo, useState } from 'react';
import type { Cohort, FollowUpContact } from '../../types';
import AppSelect from '../AppSelect';
import ModalShell from './ModalShell';
import { followUpContactsApi } from '../../services/api';
import {
  buildExistingPhoneSet,
  parseBulkPaste,
  parseCsv,
  type ImportParseResult,
  type ParsedContactRow,
} from '../../utils/contactImport';
import { sortByText } from '../../utils/sort';

interface ContactImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (contacts: FollowUpContact[]) => void;
  existingContacts: FollowUpContact[];
  cohorts: Cohort[];
  defaultCohortId?: string | null;
}

const ContactImportModal: React.FC<ContactImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
  existingContacts,
  cohorts,
  defaultCohortId,
}) => {
  const [mode, setMode] = useState<'paste' | 'csv'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [source, setSource] = useState('');
  const [cohortId, setCohortId] = useState(defaultCohortId || '');
  const [result, setResult] = useState<(ImportParseResult & { error?: string }) | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const existingPhones = useMemo(
    () => buildExistingPhoneSet(existingContacts.map((c) => c.phone)),
    [existingContacts]
  );

  const reset = () => {
    setPasteText('');
    setResult(null);
    setFileName('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePastePreview = () => {
    setResult(parseBulkPaste(pasteText, existingPhones));
    setError('');
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''), existingPhones, source.trim() || undefined);
      setResult(parsed);
      setError(parsed.error || '');
    };
    reader.readAsText(file);
  };

  const rows: ParsedContactRow[] = result?.rows || [];

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const { contacts } = await followUpContactsApi.createMany(
        rows.map((r) => ({
          fullName: r.fullName,
          phone: r.phone,
          source: r.source || source.trim() || null,
          cohortId: cohortId || null,
        }))
      );
      onImported(sortByText(contacts, (contact) => contact.fullName));
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-2xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-primary text-white' : 'bg-orange-50 text-gray-600 hover:bg-orange-100'}`;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Import contacts"
      subtitle="Only names and phone numbers are imported — everything else is ignored."
      wide
      footer={(
        <>
          <button type="button" onClick={handleClose} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={rows.length === 0 || importing}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${rows.length || ''} contact${rows.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button type="button" className={tabClass(mode === 'paste')} onClick={() => { setMode('paste'); setResult(null); }}>Bulk paste</button>
          <button type="button" className={tabClass(mode === 'csv')} onClick={() => { setMode('csv'); setResult(null); }}>CSV upload</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Source (applied to all)</label>
            <input
              className="w-full rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-orange-300"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Selfie Sunday"
            />
          </div>
          <AppSelect
            label="Target cohort"
            value={cohortId}
            onChange={setCohortId}
            options={[{ value: '', label: 'No cohort' }, ...sortByText(cohorts, (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="No cohort"
            compact
          />
        </div>

        {mode === 'paste' ? (
          <div className="space-y-3">
            <textarea
              className="min-h-[140px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 font-mono text-xs shadow-sm outline-none focus:border-orange-300"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Paste rows copied from Excel or Sheets, one person per line:\nAbigail Afeme\t08169719603\nEmmanuel Obeoma\t08069459027\tSelfie Sunday'}
            />
            <button
              type="button"
              onClick={handlePastePreview}
              disabled={!pasteText.trim()}
              className="rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-orange-50 disabled:opacity-50"
            >
              Preview
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50/40 px-6 py-8 text-center hover:bg-orange-50">
              <span className="text-sm font-semibold text-gray-700">{fileName || 'Choose a CSV file'}</span>
              <span className="text-xs text-gray-500">Name and phone columns are detected automatically (e.g. Google Form exports).</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        )}

        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {result && !result.error && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-100/80 px-2.5 py-1 font-semibold text-emerald-700">{rows.length} ready</span>
              {result.duplicates > 0 && <span className="rounded-full bg-amber-100/80 px-2.5 py-1 font-semibold text-amber-700">{result.duplicates} duplicate{result.duplicates === 1 ? '' : 's'} skipped</span>}
              {result.skipped > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{result.skipped} unparseable skipped</span>}
            </div>
            {rows.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-orange-100">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-orange-50/80 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Phone</th>
                      <th className="px-4 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.phone}-${i}`} className="border-t border-orange-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.fullName}</td>
                        <td className="px-4 py-2 text-gray-600">{r.phone}</td>
                        <td className="px-4 py-2 text-gray-500">{r.source || source || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default ContactImportModal;
