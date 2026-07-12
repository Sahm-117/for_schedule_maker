import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { participantsApi, groupsApi, participantHandoversApi, participantNotesApi } from '../services/api';
import type { Participant, Group, ParticipantHandover, ParticipantNote } from '../types';
import ModalShell from '../components/followups/ModalShell';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import AppMultiSelect from '../components/AppMultiSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import ParticipantsExportPopup from '../components/participants/ParticipantsExportPopup';
import {
  parseBulkPaste,
  parseRegistrationCsv,
  buildExistingPhoneSet,
  type ParsedContactRow,
  type ParsedRegistrationRow,
  type SkippedImportRow,
} from '../utils/contactImport';
import { sortByText } from '../utils/sort';
import { reconcileById } from '../utils/reconcile';
import { normalizeToIntlPhone } from '../utils/phone';
import { DEPARTMENTS, AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  FOLLOW_UP: 'Follow-up',
  MANUAL: 'Manual',
  IMPORT: 'Import',
};

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (p: Participant) => void;
  cohortId: string;
  existing?: Participant | null;
}

// CSV registrationDate arrives as "YYYY-MM-DD HH:mm:ss" (or ISO); a date input
// needs "YYYY-MM-DD". Normalise either to the date part for display/editing.
const toDateInput = (value?: string | null): string => {
  if (!value) return '';
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
};

const ParticipantModal: React.FC<ParticipantModalProps> = ({ isOpen, onClose, onSaved, cohortId, existing }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [registrationDate, setRegistrationDate] = useState('');
  const [smartRequest, setSmartRequest] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFullName(existing?.fullName ?? '');
      setPhone(existing?.phone ?? '');
      setNotes(existing?.notes ?? '');
      setEmail(existing?.email ?? '');
      setGender(existing?.gender ?? '');
      setAgeRange(existing?.ageRange ?? '');
      setDepartments(existing?.departments ?? []);
      setRegistrationDate(toDateInput(existing?.registrationDate));
      setSmartRequest(existing?.smartRequest ?? '');
      setDetailsOpen(false);
      setErr('');
    }
  }, [isOpen, existing]);

  const handleSave = async () => {
    if (!fullName.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr('');
    const details = {
      email: email.trim() || null,
      gender: gender || null,
      ageRange: ageRange || null,
      departments,
      registrationDate: registrationDate || null,
      smartRequest: smartRequest.trim() || null,
    };
    try {
      let result: Participant;
      if (existing) {
        ({ participant: result } = await participantsApi.update(existing.id, {
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          ...details,
        }));
      } else {
        ({ participant: result } = await participantsApi.create({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          cohortId,
          notes: notes.trim() || null,
          source: 'MANUAL',
          ...details,
        }));
      }
      onSaved(result);
      onClose();
    } catch (e: any) {
      const raw = e?.message || '';
      const isDupPhone = e?.code === '23505' || /duplicate key|uniq_participant_phone/i.test(raw);
      setErr(isDupPhone ? 'A participant with this phone number already exists.' : (raw || 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Participant' : 'Add Participant'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full name *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Adaeze Obi"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone (WhatsApp)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. 08012345678"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Registration details — collapsed by default */}
        <div className="rounded-xl border border-orange-100">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-semibold text-gray-700"
          >
            <span>More details {departments.length || email || gender || ageRange || registrationDate || smartRequest ? <span className="ml-1 text-xs font-normal text-primary">· added</span> : <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}</span>
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
            </svg>
          </button>

          {detailsOpen && (
            <div className="flex flex-col gap-4 border-t border-orange-100 px-3.5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. adaeze@example.com"
                />
              </div>
              <div>
                <AppSelect
                  label="Gender"
                  value={gender}
                  onChange={setGender}
                  options={[{ value: '', label: 'Not specified' }, ...toSelectOptions(GENDER_OPTIONS)]}
                  placeholder="Select gender"
                />
              </div>
              <div>
                <AppSelect
                  label="Age range"
                  value={ageRange}
                  onChange={setAgeRange}
                  options={[{ value: '', label: 'Not specified' }, ...toSelectOptions(AGE_RANGE_OPTIONS)]}
                  placeholder="Select age range"
                />
              </div>
              <div>
                <AppMultiSelect
                  label="Department(s)"
                  values={departments}
                  onChange={setDepartments}
                  options={toSelectOptions(DEPARTMENTS)}
                  placeholder="Select departments"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Registration date</label>
                <input
                  type="date"
                  value={registrationDate}
                  onChange={(e) => setRegistrationDate(e.target.value)}
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">SMART request</label>
                <textarea
                  value={smartRequest}
                  onChange={(e) => setSmartRequest(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Their SMART goal / prayer request"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

// ── Import Modal ──────────────────────────────────────────────────────────────

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (ps: Participant[]) => void;
  onUpserted: (created: Participant[], updated: Participant[]) => void;
  cohortId: string;
  existingParticipants: Participant[];
}

type ImportTab = 'paste' | 'csv';
type CsvPreviewFilter = 'new' | 'update' | 'skipped';

type CsvPreviewItem = {
  row: ParsedRegistrationRow;
  kind: 'new' | 'update' | 'nothing-to-fill';
  existing?: Participant;
  fillFields: string[];
};

// Decide create-vs-fill for each parsed CSV row against existing participants —
// mirrors importWithEnrich so the preview counts are accurate before import.
const splitRegistrationRows = (rows: ParsedRegistrationRow[], existing: Participant[]) => {
  const byPhone = new Map<string, Participant>();
  for (const p of existing) {
    const intl = normalizeToIntlPhone(p.phone);
    if (intl && !byPhone.has(intl)) byPhone.set(intl, p);
  }
  const isEmpty = (v: unknown) =>
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
  const newRows: CsvPreviewItem[] = [];
  const updateRows: CsvPreviewItem[] = [];
  const nothingToFillRows: CsvPreviewItem[] = [];
  const fieldChecks: Array<[keyof ParsedRegistrationRow, keyof Participant, string]> = [
    ['email', 'email', 'Email'],
    ['gender', 'gender', 'Gender'],
    ['ageRange', 'ageRange', 'Age range'],
    ['departments', 'departments', 'Department(s)'],
    ['registrationDate', 'registrationDate', 'Registration date'],
    ['smartRequest', 'smartRequest', 'SMART request'],
  ];

  for (const r of rows) {
    const intl = normalizeToIntlPhone(r.phone);
    const match = intl ? byPhone.get(intl) : undefined;
    if (!match) {
      newRows.push({ row: r, kind: 'new', fillFields: [] });
      continue;
    }
    const fillFields = fieldChecks
      .filter(([csvKey, participantKey]) => isEmpty(match[participantKey]) && !isEmpty(r[csvKey]))
      .map(([, , label]) => label);
    if (fillFields.length > 0) {
      updateRows.push({ row: r, kind: 'update', existing: match, fillFields });
    } else {
      nothingToFillRows.push({ row: r, kind: 'nothing-to-fill', existing: match, fillFields: [] });
    }
  }
  return {
    toCreate: newRows.length,
    toUpdate: updateRows.length,
    nothingToFill: nothingToFillRows.length,
    newRows,
    updateRows,
    nothingToFillRows,
  };
};

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImported, onUpserted, cohortId, existingParticipants }) => {
  const [tab, setTab] = useState<ImportTab>('paste');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<{ rows: ParsedContactRow[]; skipped: number; duplicates: number } | null>(null);
  const [csvRows, setCsvRows] = useState<ParsedRegistrationRow[] | null>(null);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvSkippedRows, setCsvSkippedRows] = useState<SkippedImportRow[]>([]);
  const [csvPreviewFilter, setCsvPreviewFilter] = useState<CsvPreviewFilter>('new');
  const [csvIncludeNew, setCsvIncludeNew] = useState(true);
  const [csvIncludeUpdates, setCsvIncludeUpdates] = useState(true);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState('');

  const existingPhones = useMemo(
    () => buildExistingPhoneSet(existingParticipants.map((p) => p.phone)),
    [existingParticipants]
  );

  const csvSplit = useMemo(
    () => (csvRows ? splitRegistrationRows(csvRows, existingParticipants) : null),
    [csvRows, existingParticipants]
  );

  const handleClose = () => {
    setTab('paste'); setPasteText(''); setPreview(null);
    setCsvRows(null); setCsvSkipped(0); setCsvSkippedRows([]); setCsvPreviewFilter('new');
    setCsvIncludeNew(true); setCsvIncludeUpdates(true); setFileName(''); setErr(''); onClose();
  };

  const handlePreview = () => {
    setPreview(parseBulkPaste(pasteText, existingPhones));
    setErr('');
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setErr('');
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseRegistrationCsv(String(reader.result || ''));
      setCsvRows(parsed.rows);
      setCsvSkipped(parsed.skipped);
      setCsvSkippedRows(parsed.skippedRows ?? []);
      setCsvPreviewFilter(parsed.rows.length > 0 ? 'new' : 'skipped');
      setCsvIncludeNew(true);
      setCsvIncludeUpdates(true);
      setErr(parsed.error || '');
    };
    reader.readAsText(file);
  };

  const handlePasteImport = async () => {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    setErr('');
    try {
      const { participants } = await participantsApi.createMany(
        preview.rows.map((r) => ({ fullName: r.fullName, phone: r.phone || null, cohortId, source: r.source ?? 'IMPORT' }))
      );
      onImported(participants);
      handleClose();
    } catch (e: any) {
      setErr(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvRowsForImport || csvRowsForImport.length === 0) return;
    setImporting(true);
    setErr('');
    try {
      const { created, updated } = await participantsApi.importWithEnrich(
        csvRowsForImport.map((r) => ({
          fullName: r.fullName,
          phone: r.phone || null,
          email: r.email ?? null,
          gender: r.gender ?? null,
          ageRange: r.ageRange ?? null,
          departments: r.departments,
          registrationDate: r.registrationDate ?? null,
          smartRequest: r.smartRequest ?? null,
        })),
        cohortId,
        existingParticipants,
      );
      onUpserted(created, updated);
      handleClose();
    } catch (e: any) {
      setErr(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-2xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-primary text-white' : 'bg-orange-50 text-gray-600 hover:bg-orange-100'}`;

  const csvRowsForImport = csvSplit
    ? [
        ...(csvIncludeNew ? csvSplit.newRows.map((item) => item.row) : []),
        ...(csvIncludeUpdates ? csvSplit.updateRows.map((item) => item.row) : []),
      ]
    : [];
  const canImport = tab === 'paste' ? !!preview && preview.rows.length > 0 : csvRowsForImport.length > 0;
  const doImport = tab === 'paste' ? handlePasteImport : handleCsvImport;
  const importLabel = tab === 'paste'
    ? `Import ${preview?.rows.length ?? 0} participants`
    : `Import ${csvRowsForImport.length} participants`;
  const activeCsvItems = csvSplit
    ? csvPreviewFilter === 'new'
      ? csvSplit.newRows
      : csvPreviewFilter === 'update'
        ? csvSplit.updateRows
        : csvSplit.nothingToFillRows
    : [];
  const activeCsvSkippedRows = csvPreviewFilter === 'skipped' ? csvSkippedRows : [];
  const activeCsvEmptyMessage = csvPreviewFilter === 'new'
    ? 'No new participants in this file.'
    : csvPreviewFilter === 'update'
      ? 'No existing participants have empty fields to fill.'
      : 'No skipped or unparseable rows.';
  const csvPillClass = (active: boolean, tone: 'new' | 'update' | 'skipped') => {
    const styles = {
      new: active ? 'bg-emerald-600 text-white' : 'bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200/80',
      update: active ? 'bg-sky-600 text-white' : 'bg-sky-100/80 text-sky-700 hover:bg-sky-200/80',
      skipped: active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    };
    return `rounded-full px-2.5 py-1 font-semibold transition ${styles[tone]}`;
  };
  const csvActionClass = (enabled: boolean, tone: 'new' | 'update') => {
    const styles = {
      new: enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-400',
      update: enabled ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-gray-200 bg-white text-gray-400',
    };
    return `inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition hover:bg-white ${styles[tone]}`;
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Participants"
      subtitle={tab === 'paste' ? 'Paste names and numbers — one per line' : 'Upload a registration CSV (name, phone & details)'}
      wide
      footer={
        canImport
          ? <>
              <button type="button" onClick={handleClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={() => void doImport()} disabled={importing} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {importing ? 'Importing…' : importLabel}
              </button>
            </>
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2">
          <button type="button" className={tabClass(tab === 'paste')} onClick={() => { setTab('paste'); setErr(''); }}>Bulk paste</button>
          <button type="button" className={tabClass(tab === 'csv')} onClick={() => { setTab('csv'); setErr(''); }}>CSV upload</button>
        </div>

        {tab === 'paste' ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Paste list</label>
              <p className="mb-2 text-xs text-gray-500">Each line: <span className="font-mono">Name  08012345678</span> (tab, pipe, or 2+ spaces as separator)</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={"Adaeze Obi\t08012345678\nTunde Balogun\t07098765432"}
              />
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!pasteText.trim()}
              className="self-start rounded-2xl bg-orange-100 px-5 py-2.5 text-sm font-semibold text-orange-700 active:scale-95 disabled:opacity-60"
            >
              Preview
            </button>
            {preview && (
              <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                <p className="mb-2 text-sm font-semibold text-gray-700">
                  {preview.rows.length} to import
                  {preview.skipped > 0 && <span className="ml-2 text-xs text-amber-600">· {preview.skipped} unparseable skipped</span>}
                  {preview.duplicates > 0 && <span className="ml-2 text-xs text-amber-600">· {preview.duplicates} duplicates skipped</span>}
                </p>
                <ul className="max-h-48 overflow-y-auto text-xs text-gray-600">
                  {preview.rows.map((r, i) => (
                    <li key={i} className="flex gap-2 py-0.5">
                      <span className="font-medium text-gray-800">{r.fullName}</span>
                      <span className="text-gray-400">{r.phone}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Registration CSV</label>
              <p className="mb-2 text-xs text-gray-500">Columns like Email, Gender, Age Range, Department(s), Registration Date, SMART Request are read automatically. Existing people (matched by phone) have their empty fields filled in.</p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-300 bg-orange-50/40 px-4 py-6 text-sm font-semibold text-orange-700 hover:bg-orange-50">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v12m0-12 4 4m-4-4-4 4M4 20h16" /></svg>
                {fileName || 'Choose CSV file'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            {csvRows && csvSplit && (
              <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => setCsvPreviewFilter('new')} className={csvPillClass(csvPreviewFilter === 'new', 'new')}>
                    {csvSplit.toCreate} new
                  </button>
                  <button type="button" onClick={() => setCsvPreviewFilter('update')} className={csvPillClass(csvPreviewFilter === 'update', 'update')}>
                    {csvSplit.toUpdate} will be updated
                  </button>
                  {(csvSplit.nothingToFill > 0 || csvSkipped > 0) && (
                    <button type="button" onClick={() => setCsvPreviewFilter('skipped')} className={csvPillClass(csvPreviewFilter === 'skipped', 'skipped')}>
                      {csvSplit.nothingToFill + csvSkipped} skipped
                      {csvSkipped > 0 ? ` (${csvSkipped} unparseable)` : ''}
                    </button>
                  )}
                </div>
                <div className="mb-3 rounded-2xl border border-orange-100 bg-white/60 px-3 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Import actions</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCsvIncludeNew((value) => !value)}
                      disabled={csvSplit.toCreate === 0}
                      className={`${csvActionClass(csvIncludeNew, 'new')} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className={`grid h-4 w-4 place-items-center rounded border ${csvIncludeNew ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" />
                        </svg>
                      </span>
                      Create new ({csvSplit.toCreate})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCsvIncludeUpdates((value) => !value)}
                      disabled={csvSplit.toUpdate === 0}
                      className={`${csvActionClass(csvIncludeUpdates, 'update')} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className={`grid h-4 w-4 place-items-center rounded border ${csvIncludeUpdates ? 'border-sky-500 bg-sky-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" />
                        </svg>
                      </span>
                      Update existing ({csvSplit.toUpdate})
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-gray-400">
                    {csvRowsForImport.length > 0
                      ? `${csvRowsForImport.length} selected for import. Skipped rows are never imported.`
                      : 'Nothing selected for import.'}
                  </p>
                </div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {csvPreviewFilter === 'new' ? 'New participants' : csvPreviewFilter === 'update' ? 'Existing participants to update' : 'Skipped rows'}
                  </p>
                  <p className="text-[11px] font-semibold text-gray-400">
                    {csvPreviewFilter === 'skipped' ? activeCsvSkippedRows.length + csvSplit.nothingToFill : activeCsvItems.length} shown
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto pr-2 text-xs text-gray-600">
                  {csvPreviewFilter !== 'skipped' && activeCsvItems.length > 0 && (
                    <ul className="space-y-1.5">
                      {activeCsvItems.map((item, i) => (
                        <li key={`${item.row.phone}-${i}`} className="rounded-xl bg-white/60 px-3 py-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-gray-800">{item.row.fullName}</span>
                            <span className="text-gray-400">{item.row.phone}</span>
                            {item.row.email && <span className="min-w-0 truncate text-gray-400">· {item.row.email}</span>}
                          </div>
                          {item.kind === 'update' && item.existing && (
                            <p className="mt-1 text-[11px] text-sky-700">
                              Matches {item.existing.fullName}; will fill {item.fillFields.join(', ')}.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {csvPreviewFilter === 'skipped' && (csvSplit.nothingToFillRows.length > 0 || activeCsvSkippedRows.length > 0) && (
                    <ul className="space-y-1.5">
                      {csvSplit.nothingToFillRows.map((item, i) => (
                        <li key={`nothing-${item.row.phone}-${i}`} className="rounded-xl bg-white/60 px-3 py-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-gray-800">{item.row.fullName}</span>
                            <span className="text-gray-400">{item.row.phone}</span>
                            {item.existing && <span className="min-w-0 truncate text-gray-400">· matches {item.existing.fullName}</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">Already exists and no empty registration fields will be filled.</p>
                        </li>
                      ))}
                      {activeCsvSkippedRows.map((row) => (
                        <li key={`unparseable-${row.rowNumber}`} className="rounded-xl bg-white/60 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-800">Row {row.rowNumber}</span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{row.reason}</span>
                          </div>
                          <p className="mt-1 break-words font-mono text-[11px] text-gray-500">{row.raw}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {((csvPreviewFilter !== 'skipped' && activeCsvItems.length === 0) ||
                    (csvPreviewFilter === 'skipped' && csvSplit.nothingToFillRows.length === 0 && activeCsvSkippedRows.length === 0)) && (
                    <p className="rounded-xl bg-white/60 px-3 py-6 text-center text-sm font-semibold text-gray-400">{activeCsvEmptyMessage}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
};

// ── View Details Modal (read-only) ──────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <div className="mt-0.5 text-sm text-gray-800">{children}</div>
  </div>
);

const ViewDetailsModal: React.FC<{ participant: Participant | null; onClose: () => void }> = ({ participant, onClose }) => {
  const [handoverNotes, setHandoverNotes] = useState<ParticipantNote[]>([]);
  const [handovers, setHandovers] = useState<ParticipantHandover[]>([]);
  const participantId = participant?.id;
  useEffect(() => {
    if (!participantId) { setHandoverNotes([]); setHandovers([]); return; }
    void Promise.all([
      participantNotesApi.getForParticipants([participantId]),
      participantHandoversApi.getForParticipants([participantId]),
    ]).then(([notesRes, handoversRes]) => {
      setHandoverNotes(notesRes.notes);
      setHandovers(handoversRes.handovers);
    }).catch(() => { setHandoverNotes([]); setHandovers([]); });
  }, [participantId]);
  if (!participant) return null;
  const p = participant;
  const regDate = p.registrationDate ? p.registrationDate.slice(0, 10) : null;
  const dash = <span className="text-gray-400">—</span>;

  return (
    <ModalShell
      isOpen={!!participant}
      onClose={onClose}
      title={p.fullName}
      subtitle="Participant details"
      footer={<button type="button" onClick={onClose} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95">Close</button>}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailRow label="Phone">{p.phone || dash}</DetailRow>
          <DetailRow label="Group">{p.groupName || dash}</DetailRow>
          <DetailRow label="Source">{SOURCE_LABEL[p.source] ?? p.source}</DetailRow>
          <DetailRow label="Status">{p.status === 'ACTIVE' ? 'Active' : 'Archived'}</DetailRow>
        </div>

        <div className="border-t border-orange-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Registration details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow label="Email">{p.email ? <span className="break-all">{p.email}</span> : dash}</DetailRow>
            <DetailRow label="Gender">{p.gender || dash}</DetailRow>
            <DetailRow label="Age range">{p.ageRange || dash}</DetailRow>
            <DetailRow label="Registration date">{regDate || dash}</DetailRow>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Department(s)</p>
              {p.departments && p.departments.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.departments.map((d) => (
                    <span key={d} className="rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{d}</span>
                  ))}
                </div>
              ) : <div className="mt-0.5 text-sm">{dash}</div>}
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">SMART request</p>
              {p.smartRequest ? (
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-gray-700">{p.smartRequest}</p>
              ) : <div className="mt-0.5 text-sm">{dash}</div>}
            </div>
          </div>
        </div>

        {p.notes && (
          <div className="border-t border-orange-100 pt-4">
            <DetailRow label="Notes"><p className="whitespace-pre-wrap leading-6 text-gray-700">{p.notes}</p></DetailRow>
          </div>
        )}

        <div className="border-t border-orange-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Support handover</p>
          {handovers[0]?.fromSupportName ? (
            <p className="text-sm text-gray-700" title={`Previously supported by ${handovers[0].fromSupportName}`}>
              Previously supported by <span className="font-semibold">{handovers[0].fromSupportName}</span>
              {handovers[0].faithProjectStatus ? ` · Faith project: ${handovers[0].faithProjectStatus.replaceAll('_', ' ').toLowerCase()}` : ''}
            </p>
          ) : <p className="text-sm text-gray-500">No reassignment history recorded yet.</p>}
          {handoverNotes.length > 0 && (
            <div className="mt-3 space-y-2">
              {handoverNotes.map((note) => (
                <div key={note.id} className="rounded-xl bg-orange-50/60 px-3 py-2 text-sm text-gray-700">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <p className="mt-1 text-xs text-gray-500">{note.authorName || 'Support'} · {new Date(note.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

// ── Assign to Group Modal ───────────────────────────────────────────────────────

interface AssignGroupModalProps {
  participant: Participant | null;
  groups: Group[];
  onClose: () => void;
  onAssigned: (participantId: string, group: Group | null) => void;
}

const AssignGroupModal: React.FC<AssignGroupModalProps> = ({ participant, groups, onClose, onAssigned }) => {
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (participant) { setGroupId(participant.groupId ?? ''); setErr(''); }
  }, [participant]);

  const options = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  if (!participant) return null;
  const p = participant;

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      await groupsApi.moveParticipant(p.id, groupId || null);
      onAssigned(p.id, groups.find((g) => g.id === groupId) ?? null);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={!!participant}
      onClose={onClose}
      title="Assign to group"
      subtitle={p.fullName}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <AppSelect
          label="Group"
          value={groupId}
          onChange={setGroupId}
          options={options}
          placeholder="Choose a group"
        />
        <p className="text-xs text-gray-500">Moving a participant replaces their current group. Choose “Unassigned” to remove them from all groups.</p>
      </div>
    </ModalShell>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminParticipantsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState(''); // '' = all, '__UNASSIGNED__' = no group, else groupId
  const [supportFilter, setSupportFilter] = useState(''); // '' = all, else supportId
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Participant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Participant | null>(null);
  const [viewing, setViewing] = useState<Participant | null>(null);
  const [assigning, setAssigning] = useState<Participant | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // `silent` background refreshes (realtime liveRevision bumps) update data in
  // place without the full-page "Loading…" flash.
  const load = useCallback(async (silent = false) => {
    if (!activeCohort) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [{ participants: ps }, { groups: gs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, includeArchived: true }),
        groupsApi.getAll({ cohortId: activeCohort.id }),
      ]);
      const sortedPs = sortByText(ps, (participant) => participant.fullName);
      const sortedGs = sortByText(gs, (group) => group.name);
      if (silent) {
        // Merge by id so unchanged rows keep their reference — avoids the
        // full-list re-render / scroll-jump on every realtime refresh.
        setParticipants((prev) => reconcileById(prev, sortedPs));
        setGroups((prev) => reconcileById(prev, sortedGs));
      } else {
        setParticipants(sortedPs);
        setGroups(sortedGs);
      }
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [activeCohort]);

  // Initial / cohort-change load shows the loader.
  useEffect(() => { void load(false); }, [load]);
  // Realtime updates refresh silently (skip the first run already covered above).
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!didInitialLoad.current) { didInitialLoad.current = true; return; }
    void load(true);
  }, [liveRevision, load]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      { value: '__UNASSIGNED__', label: 'Unassigned' },
      ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  // Map each group to its assigned support person's name (groups already carry
  // supportName), so we can show the support for each participant via groupId.
  const supportByGroupId = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => { if (g.supportName) map.set(g.id, g.supportName); });
    return map;
  }, [groups]);

  // Unique support users derived from groups (only those with an assigned support).
  const supportOptions = useMemo(() => {
    const seen = new Map<string, string>(); // supportId → name
    groups.forEach((g) => { if (g.supportId && g.supportName) seen.set(g.supportId, g.supportName); });
    const sorted = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return [{ value: '', label: 'All support' }, ...sorted.map(([id, name]) => ({ value: id, label: name }))];
  }, [groups]);

  // groupIds that belong to the selected support person — used to filter participants.
  const groupIdsForSupport = useMemo(() => {
    if (!supportFilter) return null;
    return new Set(groups.filter((g) => g.supportId === supportFilter).map((g) => g.id));
  }, [groups, supportFilter]);

  const displayed = useMemo(() => {
    let ps = showArchived
      ? participants.filter((p) => p.status === 'ARCHIVED')
      : participants.filter((p) => p.status === 'ACTIVE');
    if (groupIdsForSupport) {
      ps = ps.filter((p) => p.groupId && groupIdsForSupport.has(p.groupId));
    } else if (groupFilter === '__UNASSIGNED__') {
      ps = ps.filter((p) => !p.groupId);
    } else if (groupFilter) {
      ps = ps.filter((p) => p.groupId === groupFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
  }, [participants, showArchived, search, groupFilter, groupIdsForSupport]);

  const unassignedCount = useMemo(
    () => participants.filter((p) => p.status === 'ACTIVE' && !p.groupId).length,
    [participants]
  );

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const p = archiveTarget;
    try {
      await participantsApi.archive(p.id);
      setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'ARCHIVED' } : x));
    } catch { /* ignore */ }
    finally { setArchiveTarget(null); }
  };

  const handleUnarchive = async (p: Participant) => {
    try {
      await participantsApi.unarchive(p.id);
      setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'ACTIVE' } : x));
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const p = deleteTarget;
    try {
      await participantsApi.delete(p.id);
      setParticipants((prev) => prev.filter((x) => x.id !== p.id));
    } catch { /* ignore */ }
    finally { setDeleteTarget(null); }
  };

  const activeCount = participants.filter((p) => p.status === 'ACTIVE').length;

  return (
    <div className="page-content">
      <PageHeader
        title="Participants"
        subtitle={activeCohort ? `${activeCount} active · ${unassignedCount} unassigned · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setEditing(null); setAddOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + Add
              </button>
              <AppOverflowMenu
                align="right"
                items={[
                  { label: 'Import participants', onClick: () => setImportOpen(true) },
                  { label: 'Export for WhatsApp', onClick: () => setExportOpen(true) },
                ]}
              />
            </div>
          )
        }
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
              />
              <div className="w-full sm:w-52">
                <AppSelect
                  value={groupFilter}
                  onChange={(v) => { setGroupFilter(v); setSupportFilter(''); }}
                  options={groupOptions}
                  placeholder="All groups"
                  compact
                />
              </div>
              {supportOptions.length > 1 && (
                <div className="w-full sm:w-52">
                  <AppSelect
                    value={supportFilter}
                    onChange={(v) => { setSupportFilter(v); setGroupFilter(''); }}
                    options={supportOptions}
                    placeholder="All support"
                    compact
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-primary" />
              Show archived
            </label>
          </div>

          {loading ? (
            <PageLoader />
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">No participants yet. Add one or import a list.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-100 bg-orange-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Support</th>
                    <th className="sticky right-0 bg-orange-50/60 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {displayed.map((p) => (
                    <tr key={p.id} className="hover:bg-orange-50/30">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                      <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                          {SOURCE_LABEL[p.source] ?? p.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.groupId && supportByGroupId.get(p.groupId) ? (
                          <span className="rounded-full bg-violet-100/80 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                            {supportByGroupId.get(p.groupId)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="sticky right-0 bg-white px-4 py-3 text-right">
                        <div className="flex justify-end">
                          {p.status === 'ACTIVE' ? (
                            <AppOverflowMenu
                              align="right"
                              items={[
                                { label: 'View details', onClick: () => setViewing(p) },
                                { label: 'Edit', onClick: () => { setEditing(p); setAddOpen(true); } },
                                { label: 'Assign to group', onClick: () => setAssigning(p) },
                                { label: 'Archive', onClick: () => setArchiveTarget(p), tone: 'danger' },
                              ]}
                            />
                          ) : (
                            <AppOverflowMenu
                              align="right"
                              items={[
                                { label: 'Unarchive', onClick: () => void handleUnarchive(p) },
                                { label: 'Delete permanently', onClick: () => setDeleteTarget(p), tone: 'danger' },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ParticipantModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={(p) => {
          setParticipants((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            const next = idx >= 0 ? prev.map((x) => x.id === p.id ? p : x) : [...prev, p];
            return sortByText(next, (participant) => participant.fullName);
          });
        }}
        cohortId={activeCohort?.id ?? ''}
        existing={editing}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(ps) => setParticipants((prev) => sortByText([...prev, ...ps], (participant) => participant.fullName))}
        onUpserted={(created, updated) => setParticipants((prev) => {
          const updatedById = new Map(updated.map((p) => [p.id, p]));
          const merged = prev.map((p) => updatedById.get(p.id) ?? p);
          return sortByText([...merged, ...created], (participant) => participant.fullName);
        })}
        cohortId={activeCohort?.id ?? ''}
        existingParticipants={participants}
      />

      <ConfirmationModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { void handleArchive(); }}
        title="Archive participant"
        message={`Archive ${archiveTarget?.fullName}? They will no longer appear in attendance.`}
        confirmText="Archive"
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete permanently"
        message={`Permanently delete ${deleteTarget?.fullName}? This cannot be undone — all their attendance records will also be removed.`}
        confirmText="Delete permanently"
      />

      <ViewDetailsModal participant={viewing} onClose={() => setViewing(null)} />

      {exportOpen && (
        <ParticipantsExportPopup participants={displayed} cohortName={activeCohort?.name ?? 'Cohort'} onClose={() => setExportOpen(false)} />
      )}

      <AssignGroupModal
        participant={assigning}
        groups={groups}
        onClose={() => setAssigning(null)}
        onAssigned={(participantId, group) => {
          setParticipants((prev) => prev.map((x) =>
            x.id === participantId
              ? { ...x, groupId: group?.id ?? null, groupName: group?.name ?? null }
              : x
          ));
        }}
      />
    </div>
  );
};

export default AdminParticipantsPage;
