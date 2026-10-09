import Glyph from '../components/Glyph';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SegmentedTabs from '../components/SegmentedTabs';
import { Navigate, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { participantsApi, practiceApi, groupsApi, participantFlagsApi, participantPushApi, cohortsApi, settingsApi, profileFieldsApi, wrapUpApi, departmentReferralsApi } from '../services/api';
import { buildDashboardModel, type PeopleSummary } from '../components/dashboard/healthModel';
import { PERSON_HEALTH_LABEL, type PersonHealth } from '../utils/programmeRules';
import type { Participant, ParticipantAppInfo, Group, ParticipantFlag, ParticipantUpdate, RetakeMatch } from '../types';
import { appUseLine } from '../utils/appUse';
import NotOpenedTag from '../components/participants/NotOpenedTag';
import RetakingChip, { RetakeMarkModal } from '../components/participants/RetakingChip';
import ModalShell from '../components/followups/ModalShell';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import FilterBar, { describeFilters, type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import AppMultiSelect from '../components/AppMultiSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../components/Toast';
import { REGISTRATION_STATUS_META, TEEN_STATUSES } from '../utils/followUps';
import { isTeenAgeRange, normaliseAgeRange, normaliseGender } from '../utils/groupingRules';
import ParticipantsExportPopup from '../components/participants/ParticipantsExportPopup';
import {
  parseBulkPaste,
  parseRegistrationCsv,
  buildExistingPhoneSet,
  type ParsedContactRow,
  type ParsedRegistrationRow,
  type SkippedImportRow,
} from '../utils/contactImport';
import Spinner from '../components/Spinner';
import { sortByText } from '../utils/sort';
import { reconcileById } from '../utils/reconcile';
import { normalizeToIntlPhone } from '../utils/phone';
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';
import { departmentOptions, useChurchDepartments } from '../hooks/useChurchDepartments';
import LoginDetailsCard from '../components/participants/LoginDetailsCard';
import RequestInfoModal from '../components/participants/RequestInfoModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  FOLLOW_UP: 'Follow-up',
  FORM: 'Reg form',
  MANUAL: 'Manual',
  IMPORT: 'Import',
};

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `crossed` says an edit moved them across the teen line, so the list should be read again (their group and follow-up changed too). */
  onSaved: (p: Participant, crossed?: 'teen' | 'adult' | null) => void;
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
  const churchDepartments = useChurchDepartments();
  const toast = useToast();
  // With a date of birth on file the database works the age range out from it and puts it back after any edit, so it is not editable here.
  const ageFromDob = !!existing?.dateOfBirth;
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
      // An edit across the teen line also moves the person (teen handling, their group, their follow-up): say so.
      let crossed: 'teen' | 'adult' | null = null;
      if (existing && !ageFromDob && ageRange && normaliseAgeRange(existing.ageRange) !== normaliseAgeRange(ageRange)) {
        const wasTeen = isTeenAgeRange(existing.ageRange);
        const isTeen = isTeenAgeRange(ageRange);
        if (!wasTeen && isTeen) crossed = 'teen';
        else if (wasTeen && !isTeen) crossed = 'adult';
      }
      if (crossed === 'teen') toast({ message: `${result.fullName} is now a teen: they leave any adult group and go to a same-gender Teen Support.` });
      if (crossed === 'adult') toast({ message: `${result.fullName} is now an adult: they leave their Teen Support and go to the usual follow-up.` });
      onSaved(result, crossed);
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
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
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
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Adaeze Obi"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone (WhatsApp)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. 08012345678"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Registration details — collapsed by default */}
        <div className="rounded-xl border border-gray-100">
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
            <div className="flex flex-col gap-4 border-t border-gray-100 px-3.5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                  disabled={ageFromDob}
                />
                {ageFromDob && <p className="mt-1 text-xs text-gray-500">Worked out from their date of birth. To change it, change the date of birth.</p>}
                {!ageFromDob && existing && <p className="mt-1 text-xs text-gray-500">Switching between teen (10 - 17) and adult also moves them: their group, Teen Support and follow-up.</p>}
              </div>
              <div>
                <AppMultiSelect
                  label="Department(s)"
                  values={departments}
                  onChange={setDepartments}
                  options={departmentOptions(churchDepartments, departments)}
                  placeholder="Select departments"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Registration date</label>
                <input
                  type="date"
                  value={registrationDate}
                  onChange={(e) => setRegistrationDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">SMART request</label>
                <textarea
                  value={smartRequest}
                  onChange={(e) => setSmartRequest(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              <button type="button" onClick={handleClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="button" onClick={() => void doImport()} disabled={importing} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {importing ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Importing…</span>) : importLabel}
              </button>
            </>
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}

        <SegmentedTabs
          tabs={[{ key: 'paste', label: 'Bulk paste' }, { key: 'csv', label: 'CSV upload' }]}
          active={tab}
          onChange={(k) => { setTab(k as typeof tab); setErr(''); }}
        />

        {tab === 'paste' ? (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Paste list</label>
              <p className="mb-2 text-xs text-gray-500">Each line: <span className="font-mono">Name  08012345678</span> (tab, pipe, or 2+ spaces as separator)</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={"Adaeze Obi\t08012345678\nTunde Balogun\t07098765432"}
              />
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!pasteText.trim()}
              className="self-start rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95 disabled:opacity-60"
            >
              Preview
            </button>
            {preview && (
              <div className="rounded-2xl bg-gray-50 p-4">
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
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-semibold text-orange-700 hover:bg-gray-50">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v12m0-12 4 4m-4-4-4 4M4 20h16" /></svg>
                {fileName || 'Choose CSV file'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            {csvRows && csvSplit && (
              <div className="rounded-2xl bg-gray-50 p-4">
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
                <div className="mb-3 rounded-2xl border border-gray-100 bg-white/60 px-3 py-3">
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
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
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
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminParticipantsContent />;
};

const AdminParticipantsContent: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, cohorts, liveRevision } = useAppData();

  const [participants, setParticipants] = useState<Participant[]>([]);
  // Test participants (e.g. a demo login) are listed but left out of every count.
  const counted = useMemo(() => participants.filter((p) => !p.isTest), [participants]);
  // Records in other cohorts on the same number, for the Retaking chip.
  const [retakeMatches, setRetakeMatches] = useState<Map<string, RetakeMatch[]>>(new Map());
  const [retakeMarking, setRetakeMarking] = useState<Participant | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  // Every filter takes several choices at once (see FilterBar). Keys: people (adult / teen), login, signup
  // ('__NONE__' = added by hand or imported), group ('__UNASSIGNED__' = no group), support, gender, age,
  // alerts, profile, wants.
  const [filters, setFilters] = useState<FilterValues>({});
  // Who has chosen their own password (the real sign-in), for the Logged in filter. Null until it loads.
  const [signedInIds, setSignedInIds] = useState<Set<string> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // A participant just added here: show their login details straight away.
  const [loginFor, setLoginFor] = useState<Participant | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Participant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Participant | null>(null);
  const [firstTimeTarget, setFirstTimeTarget] = useState<Participant | null>(null);
  const [resetFor, setResetFor] = useState<Participant | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const [flags, setFlags] = useState<ParticipantFlag[]>([]);
  // Status by the programme rules (On track / Keep an eye on / Needs attention).
  const [people, setPeople] = useState<PeopleSummary | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // The dashboard links here with ?health=…; it becomes a filter chip and leaves the address.
  useEffect(() => {
    const health = searchParams.get('health');
    if (health !== 'critical' && health !== 'warning' && health !== 'good') return;
    setFilters((prev) => ({ ...prev, alerts: [...new Set([...(prev.alerts ?? []), health])] }));
    const params = new URLSearchParams(searchParams);
    params.delete('health');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);
  const [assigning, setAssigning] = useState<Participant | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  // Profile completion (%) per participant, and the "Incomplete profiles" filter.
  const [completionById, setCompletionById] = useState<Map<string, import('../types').ProfileCompletion>>(new Map());
  // participantIds with an active app login but no saved push subscription —
  // "No alerts" tag + filter. Empty (not an error) until the
  // participants_without_push migration is applied.
  const [noAlertsIds, setNoAlertsIds] = useState<Set<string>>(new Set());
  const [notInstalledIds, setNotInstalledIds] = useState<Set<string>>(new Set());
  const [appDetails, setAppDetails] = useState<Record<string, ParticipantAppInfo>>({});
  // Departments each participant wants to join, for the "Wants to join" filter
  // (and the Export, which uses the same filtered list): their own answer in
  // the app plus any department a support/admin logged for them (the
  // department handoff), leaving out ones marked "didn't join".
  const [wrapUpDeptById, setWrapUpDeptById] = useState<Map<string, Set<string>>>(new Map());

  // `silent` background refreshes (realtime liveRevision bumps) update data in
  // place without the full-page "Loading…" flash.
  const load = useCallback(async (silent = false) => {
    if (!activeCohort) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      profileFieldsApi.getCohortCompletion(activeCohort.id).then(setCompletionById).catch(() => { /* column stays empty */ });
      participantPushApi.getSignedInIds(activeCohort.id).then((ids) => setSignedInIds(new Set(ids))).catch(() => { /* the Logged in filter is simply not offered */ });
      participantsApi.getRetakeMatches(activeCohort.id).then(setRetakeMatches).catch(() => { /* no chips */ });
      const [{ participants: ps }, { groups: gs }, { flags: fs }, health, peopleData, rules, unreachableIds, wrapUpDepts] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, includeArchived: true }),
        groupsApi.getAll({ cohortId: activeCohort.id }),
        participantFlagsApi.getAll({ openOnly: true }).catch(() => ({ flags: [] as ParticipantFlag[] })),
        cohortsApi.getHealth(activeCohort.id).catch(() => null),
        cohortsApi.getPeople(activeCohort.id).catch(() => null),
        settingsApi.getProgrammeRules(),
        participantPushApi.getUnreachableIds().catch(() => [] as string[]),
        wrapUpApi.getDepartmentsForCohort(activeCohort.id).catch(() => new Map<string, string>()),
      ]);
      setFlags(fs);
      setNoAlertsIds(new Set(unreachableIds));
      participantPushApi.getNotInstalledIds().then((ids) => setNotInstalledIds(new Set(ids))).catch(() => { /* no tags */ });
      participantPushApi.getAppDetails().then(setAppDetails).catch(() => { /* details are only a hint */ });
      const referrals = await departmentReferralsApi.getForParticipants(ps.map((p) => p.id)).then((r) => r.referrals).catch(() => []);
      const deptsById = new Map<string, Set<string>>();
      const addDept = (id: string, dept: string | null | undefined) => {
        const name = dept?.trim();
        if (!name) return;
        if (!deptsById.has(id)) deptsById.set(id, new Set());
        deptsById.get(id)!.add(name);
      };
      wrapUpDepts.forEach((dept, id) => addDept(id, dept));
      referrals.filter((r) => r.status !== 'NOT_JOINED').forEach((r) => addDept(r.participantId, r.department));
      setWrapUpDeptById(deptsById);
      setPeople(health && peopleData
        ? buildDashboardModel(health, activeCohort, 0, peopleData, rules).people
        : null);
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

  // Map each group to its assigned support person's name (groups already carry
  // supportName), so we can show the support for each participant via groupId.
  const supportByGroupId = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => { if (g.supportName) map.set(g.id, g.supportName); });
    return map;
  }, [groups]);

  // Open concerns raised by supports, keyed by participant.
  const flagsByParticipant = useMemo(() => {
    const map = new Map<string, ParticipantFlag[]>();
    flags.forEach((flag) => map.set(flag.participantId, [...(map.get(flag.participantId) ?? []), flag]));
    return map;
  }, [flags]);

  const healthById = useMemo(() => {
    const map = new Map<string, { health: PersonHealth; detail: string }>();
    if (!people?.judgeable) return map;
    people.participants.forEach((e) => map.set(e.id, {
      health: e.health,
      detail: `${e.sundayMisses} Sunday miss${e.sundayMisses === 1 ? '' : 'es'} · ${e.meetingMisses} meeting miss${e.meetingMisses === 1 ? '' : 'es'}`,
    }));
    return map;
  }, [people]);
  // Departments named in "Wants to join", with how many active participants
  // named each one.
  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counted.forEach((p) => {
      if (p.status !== 'ACTIVE') return;
      wrapUpDeptById.get(p.id)?.forEach((dept) => counts.set(dept, (counts.get(dept) ?? 0) + 1));
    });
    return counts;
  }, [counted, wrapUpDeptById]);
  // A teen by age range, by being on the teen path, or by being in a teen group. Teens get no login.
  const teenGroupIds = useMemo(() => new Set(groups.filter((g) => g.isTeenGroup).map((g) => g.id)), [groups]);
  const isTeen = useCallback((p: Participant) =>
    isTeenAgeRange(p.ageRange)
    || (!!p.followUpStatus && (TEEN_STATUSES as string[]).includes(p.followUpStatus))
    || (!!p.groupId && teenGroupIds.has(p.groupId)), [teenGroupIds]);

  const supportGroups = useMemo(() => {
    const map = new Map<string, { name: string; groupIds: Set<string> }>();
    groups.forEach((g) => {
      if (!g.supportId || !g.supportName) return;
      const entry = map.get(g.supportId) ?? { name: g.supportName, groupIds: new Set<string>() };
      entry.groupIds.add(g.id);
      map.set(g.supportId, entry);
    });
    return map;
  }, [groups]);

  // Does this person fit one chosen choice of one filter group?
  const fits = useCallback((group: string, choice: string, p: Participant): boolean => {
    switch (group) {
      case 'people': return choice === 'teen' ? isTeen(p) : !isTeen(p);
      case 'login': return !isTeen(p) && !!signedInIds && (choice === 'in' ? signedInIds.has(p.id) : !signedInIds.has(p.id));
      case 'signup': return choice === '__NONE__' ? !p.followUpStatus : p.followUpStatus === choice;
      case 'group': return choice === '__UNASSIGNED__' ? !p.groupId : p.groupId === choice;
      case 'support': return !!p.groupId && !!supportGroups.get(choice)?.groupIds.has(p.groupId);
      case 'gender': return normaliseGender(p.gender) === choice;
      case 'age': return choice === '__unknown' ? normaliseAgeRange(p.ageRange) === null : normaliseAgeRange(p.ageRange) === choice;
      case 'alerts':
        if (choice === 'concerns') return flagsByParticipant.has(p.id);
        if (choice === 'noalerts') return noAlertsIds.has(p.id);
        return healthById.get(p.id)?.health === choice;
      case 'profile': return choice === 'incomplete' ? (completionById.get(p.id)?.percent ?? 0) < 100 : (completionById.get(p.id)?.percent ?? 0) >= 100;
      case 'wants': return !!wrapUpDeptById.get(p.id)?.has(choice);
      default: return true;
    }
  }, [isTeen, signedInIds, supportGroups, flagsByParticipant, noAlertsIds, healthById, completionById, wrapUpDeptById]);

  const displayed = useMemo(() => {
    let ps = showArchived
      ? participants.filter((p) => p.status === 'ARCHIVED')
      : participants.filter((p) => p.status === 'ACTIVE');
    // Within a group any chosen choice matches; every group that has a choice must match.
    const active = Object.entries(filters).filter(([, choices]) => choices.length > 0);
    if (active.length > 0) ps = ps.filter((p) => active.every(([group, choices]) => choices.some((choice) => fits(group, choice, p))));
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
    }
    return sortByText(ps, (participant) => participant.fullName);
  }, [participants, showArchived, search, filters, fits]);

  // The chip groups, each choice with how many people it matches among those on show (active or archived).
  const filterGroups = useMemo<FilterGroup[]>(() => {
    const base = counted.filter((p) => p.status === (showArchived ? 'ARCHIVED' : 'ACTIVE'));
    const count = (group: string, choice: string) => base.filter((p) => fits(group, choice, p)).length;
    const opt = (group: string, value: string, label: string) => ({ value, label, count: count(group, value) });

    const signUpCounts = new Map<string, number>();
    base.forEach((p) => { const key = p.followUpStatus ?? '__NONE__'; signUpCounts.set(key, (signUpCounts.get(key) ?? 0) + 1); });
    const signUpLabel = (key: string) => key === '__NONE__' ? 'No sign-up record' : REGISTRATION_STATUS_META[key as keyof typeof REGISTRATION_STATUS_META]?.label ?? key;

    const out: FilterGroup[] = [
      { key: 'people', label: 'Adults or teens', options: [opt('people', 'adult', 'Adults'), opt('people', 'teen', 'Teens')] },
    ];
    if (signedInIds) {
      out.push({
        key: 'login',
        label: 'App login',
        hint: 'Adults only. Teens get no login, so they are onboarded by their Teen Support.',
        options: [opt('login', 'in', 'Logged in (chose a password)'), opt('login', 'out', 'Not signed in yet')],
      });
    }
    out.push({
      key: 'signup',
      label: 'Sign-up status',
      hint: 'The follow-up status. A hand-set "Access Confirmed" is not the same as logged in.',
      options: [...signUpCounts.keys()].sort((a, b) => signUpLabel(a).localeCompare(signUpLabel(b))).map((key) => ({ value: key, label: signUpLabel(key), count: signUpCounts.get(key) ?? 0 })),
    });
    out.push({
      key: 'group',
      label: 'Group',
      options: [
        opt('group', '__UNASSIGNED__', 'Not in a group'),
        ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => opt('group', g.id, g.name)),
      ],
    });
    if (supportGroups.size > 0) {
      out.push({
        key: 'support',
        label: 'Support',
        options: [...supportGroups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, v]) => opt('support', id, v.name)),
      });
    }
    out.push({ key: 'gender', label: 'Gender', options: [opt('gender', 'Male', 'Male'), opt('gender', 'Female', 'Female')] });
    out.push({ key: 'age', label: 'Age', options: [...AGE_RANGE_OPTIONS.map((range) => opt('age', range, range)), opt('age', '__unknown', 'Age not known')] });

    const alerts: FilterGroup['options'] = [];
    if (healthById.size > 0) alerts.push(opt('alerts', 'critical', PERSON_HEALTH_LABEL.critical), opt('alerts', 'warning', PERSON_HEALTH_LABEL.warning), opt('alerts', 'good', PERSON_HEALTH_LABEL.good));
    if (flagsByParticipant.size > 0) alerts.push(opt('alerts', 'concerns', 'Concerns raised'));
    if (noAlertsIds.size > 0) alerts.push(opt('alerts', 'noalerts', 'No alerts (push off)'));
    if (alerts.length > 0) out.push({ key: 'alerts', label: 'Status and alerts', options: alerts });
    if (completionById.size > 0) out.push({ key: 'profile', label: 'Profile', options: [opt('profile', 'incomplete', 'Incomplete'), opt('profile', 'complete', 'Complete')] });
    if (departmentCounts.size > 0) {
      out.push({ key: 'wants', label: 'Wants to join', options: [...departmentCounts.keys()].sort((a, b) => a.localeCompare(b)).map((name) => opt('wants', name, name)) });
    }
    return out.filter((g) => g.options.length > 0);
  }, [counted, showArchived, fits, signedInIds, groups, supportGroups, healthById, flagsByParticipant, noAlertsIds, completionById, departmentCounts]);

  // Archived and active people are different lists; a choice nobody here has is dropped, so no hidden filter stays on.
  useEffect(() => {
    setFilters((prev) => {
      let changed = false;
      const next: FilterValues = {};
      Object.entries(prev).forEach(([key, choices]) => {
        // A group not offered yet (its data is still loading, or it came from a link) is left alone.
        const offered = filterGroups.find((g) => g.key === key)?.options.map((o) => o.value);
        const kept = offered ? choices.filter((c) => offered.includes(c)) : choices;
        if (kept.length !== choices.length) changed = true;
        if (kept.length > 0) next[key] = kept;
      });
      return changed ? next : prev;
    });
  }, [filterGroups]);

  // Names what is filtered on screen, so the WhatsApp export says which people it holds.
  const exportSubtitle = useMemo(() => {
    const out: string[] = [];
    if (showArchived) out.push('Archived');
    out.push(...describeFilters(filterGroups, filters));
    if (search.trim()) out.push(`Search "${search.trim()}"`);
    return out.length ? `Filter: ${out.join(' · ')}` : undefined;
  }, [showArchived, filterGroups, filters, search]);

  const unassignedCount = useMemo(
    () => counted.filter((p) => p.status === 'ACTIVE' && !p.groupId).length,
    [counted]
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

  const handleSetTest = async (p: Participant, isTest: boolean) => {
    try {
      await participantsApi.update(p.id, { isTest });
      setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, isTest } : x));
    } catch { /* ignore */ }
  };

  const handleRetakeUpdate = async (p: Participant, patch: ParticipantUpdate) => {
    const { participant } = await participantsApi.update(p.id, patch);
    setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, ...participant, groupId: x.groupId, groupName: x.groupName } : x));
  };

  const handleFirstTimeReset = async () => {
    const p = firstTimeTarget;
    if (!p) return;
    try {
      await practiceApi.resetParticipantFirstTime(p.id);
      toast({ message: `${p.fullName} will see the first-time experience on their next sign-in.` });
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not reset.' });
    } finally { setFirstTimeTarget(null); }
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

  const activeCount = counted.filter((p) => p.status === 'ACTIVE').length;

  // The little status chips beside a name, shared by the table row and the phone card.
  const renderChips = (p: Participant) => (
    <>
                        <RetakingChip participant={p} matches={retakeMatches.get(p.id)} onUpdate={(patch) => handleRetakeUpdate(p, patch)} className="ml-2" />
                        {flagsByParticipant.has(p.id) && (
                          <button
                            type="button"
                            onClick={() => navigate(`/participants/${p.id}`)}
                            title={flagsByParticipant.get(p.id)?.map((flag) => flag.reason).join(', ')}
                            className="ml-2 inline-flex items-center rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                          >
                            <Glyph name="warning" className="mr-1 h-3 w-3" />Concern
                          </button>
                        )}
                        {(() => {
                          const status = healthById.get(p.id);
                          if (!status || status.health === 'good') return null;
                          return (
                            <span
                              title={status.detail}
                              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.health === 'critical' ? 'bg-red-100/80 text-red-700' : 'bg-amber-100/80 text-amber-700'}`}
                            >
                              {PERSON_HEALTH_LABEL[status.health]}
                            </span>
                          );
                        })()}
                        {p.isTest && (
                          <span
                            title="Test participant: works as normal but is left out of counts."
                            className="ml-2 inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-500"
                          >
                            Test · not counted
                          </span>
                        )}
                        {notInstalledIds.has(p.id) && (
                          <NotOpenedTag className="ml-2 px-2 py-0.5 text-[11px]" />
                        )}
                        {noAlertsIds.has(p.id) && (
                          <span
                            title="They have an app login but can't receive push notifications on any device."
                            className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600"
                          >
                            No alerts
                          </span>
                        )}
                        {(() => {
                          const appLine = appUseLine(appDetails[p.id]);
                          return appLine ? <span className="block w-full pt-0.5 text-[11.5px] font-normal text-gray-500">{appLine}</span> : null;
                        })()}
    </>
  );

  const renderMenu = (p: Participant) => (
    <>
                          {p.status === 'ACTIVE' ? (
                            <AppOverflowMenu
                              align="right"
                              items={[
                                { label: 'View profile', onClick: () => navigate(`/participants/${p.id}`) },
                                { label: 'Edit', onClick: () => { setEditing(p); setAddOpen(true); } },
                                { label: 'Assign to group', onClick: () => setAssigning(p) },
                                { label: 'Mark as retaking', onClick: () => setRetakeMarking(p) },
                                { label: 'Reset first-time experience', onClick: () => setFirstTimeTarget(p) },
                                { label: 'Reset password', onClick: () => setResetFor(p) },
                                { label: p.isTest ? 'Unmark as test' : 'Mark as test', onClick: () => void handleSetTest(p, !p.isTest) },
                                { label: 'Archive', onClick: () => setArchiveTarget(p), tone: 'danger' },
                              ]}
                            />
                          ) : (
                            <AppOverflowMenu
                              align="right"
                              items={[
                                { label: 'Unarchive', onClick: () => void handleUnarchive(p) },
                                { label: p.isTest ? 'Unmark as test' : 'Mark as test', onClick: () => void handleSetTest(p, !p.isTest) },
                                { label: 'Delete permanently', onClick: () => setDeleteTarget(p), tone: 'danger' },
                              ]}
                            />
                          )}
    </>
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Participants"
        tourId="admin:participants"
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
                  { label: 'Request information', onClick: () => setRequestInfoOpen(true) },
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
          <div data-wt="participants-filters" className="mb-4">
            <FilterBar
              groups={filterGroups}
              value={filters}
              onChange={setFilters}
              toggles={[{ key: 'archived', label: 'Show archived', value: showArchived, onChange: setShowArchived, hint: 'Look at archived participants instead of active ones.' }]}
              search={
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or phone…"
                  aria-label="Search participants"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-[11px] text-sm shadow-[0_2px_10px_-4px_rgba(17,24,39,0.08)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              }
              searching={search.trim().length > 0}
              onClear={() => setSearch('')}
              shown={displayed.filter((p) => !p.isTest).length}
              total={counted.filter((p) => p.status === (showArchived ? 'ARCHIVED' : 'ACTIVE')).length}
              noun={showArchived ? 'archived participants' : 'participants'}
            />
          </div>

          {loading ? (
            <PageLoader />
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl bg-gray-50/80 py-12 text-center">
              <p className="text-sm text-gray-500">{participants.length === 0 ? 'No participants yet. Add one or import a list.' : 'No participants match these filters.'}</p>
            </div>
          ) : (
            <>
            {/* Phones: one card per person. From tablet size up, the table below. */}
            <ul data-wt="participants-cards" className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] md:hidden">
              {displayed.map((p) => {
                const registration = p.followUpStatus ? REGISTRATION_STATUS_META[p.followUpStatus] : null;
                const support = p.groupId ? supportByGroupId.get(p.groupId) : null;
                const line = [p.groupName, support].filter(Boolean).join(' · ') || p.phone || 'No group yet';
                return (
                  <li key={p.id} className="py-2.5 pl-4 pr-2">
                    <div className="flex items-center gap-3">
                      <NavLink to={`/participants/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block line-clamp-2 text-[15px] font-semibold leading-tight text-gray-900">{p.fullName}</span>
                          <span className="block truncate text-[12.5px] text-gray-500">{line}</span>
                        </span>
                      </NavLink>
                      {registration && <span className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${registration.tone}`}>{registration.label}</span>}
                      <div className="flex-none">{renderMenu(p)}</div>
                    </div>
                    {/* Only what needs a look: concerns, retaking, test and so on. */}
                    <div className="flex flex-wrap items-center gap-1 pl-[52px] pr-2 empty:hidden [&>*]:!ml-0 [&>*]:mt-1">{renderChips(p)}</div>
                  </li>
                );
              })}
            </ul>
            <div data-wt="participants-table" className="hidden overflow-x-auto surface-card md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-primary/5">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Profile</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Age range</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Support</th>
                    <th className="sticky right-0 bg-primary/5 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayed.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/30">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <NavLink to={`/participants/${p.id}`} className="hover:text-primary hover:underline">{p.fullName}</NavLink>
                        {renderChips(p)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                      <td className="px-4 py-3">
                        {completionById.has(p.id) ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${completionById.get(p.id)!.percent === 100 ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                            {completionById.get(p.id)!.percent}%
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {normaliseAgeRange(p.ageRange) ?? p.ageRange ?? <span className="text-gray-400">—</span>}
                      </td>
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
                          {renderMenu(p)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      <ParticipantModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={(p, crossed) => {
          if (!editing) setLoginFor(p);
          if (crossed) void load(true);
          setParticipants((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            const next = idx >= 0 ? prev.map((x) => x.id === p.id ? p : x) : [...prev, p];
            return sortByText(next, (participant) => participant.fullName);
          });
        }}
        cohortId={activeCohort?.id ?? ''}
        existing={editing}
      />

      <ModalShell
        isOpen={!!loginFor}
        onClose={() => setLoginFor(null)}
        title="Login details"
        subtitle={loginFor ? `${loginFor.fullName} was added. Send them their login for the app.` : undefined}
      >
        {loginFor && <LoginDetailsCard participantId={loginFor.id} email={loginFor.email} startDate={cohorts.find((c) => c.id === loginFor.cohortId)?.startDate} defaultOpen />}
      </ModalShell>

      <ModalShell
        isOpen={!!resetFor}
        onClose={() => setResetFor(null)}
        title="Reset password"
        subtitle={resetFor ? `They get a new first-time code. Send it to ${resetFor.fullName.split(' ')[0]} straight after.` : undefined}
      >
        {resetFor && <LoginDetailsCard participantId={resetFor.id} email={resetFor.email} startDate={cohorts.find((c) => c.id === resetFor.cohortId)?.startDate} defaultOpen />}
      </ModalShell>

      <RequestInfoModal isOpen={requestInfoOpen} onClose={() => setRequestInfoOpen(false)} />

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
        isOpen={!!firstTimeTarget}
        onClose={() => setFirstTimeTarget(null)}
        onConfirm={() => { void handleFirstTimeReset(); }}
        title={`Reset for ${firstTimeTarget?.fullName ?? 'this participant'}?`}
        message="Next time they sign in it feels brand new: the welcome and page tours and the Get the app prompt show again. Their attendance, group, messages and Faith Project are not touched."
        type="warning"
        confirmText="Reset"
      />

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete permanently"
        message={`Permanently delete ${deleteTarget?.fullName}? This cannot be undone — all their attendance records will also be removed.`}
        confirmText="Delete permanently"
      />

      <RetakeMarkModal
        participant={retakeMarking}
        onClose={() => setRetakeMarking(null)}
        onSave={(note) => retakeMarking ? handleRetakeUpdate(retakeMarking, {
          retakeStatus: 'CONFIRMED',
          retakeNote: note,
          retakeCheckedById: user?.id ?? null,
          retakeCheckedAt: new Date().toISOString(),
        }) : undefined}
      />

      {exportOpen && (
        <ParticipantsExportPopup participants={displayed} cohortName={activeCohort?.name ?? 'Cohort'} subtitle={exportSubtitle} onClose={() => setExportOpen(false)} />
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
