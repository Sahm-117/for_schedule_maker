import { normalizeToIntlPhone } from './phone';

export interface ParsedContactRow {
  fullName: string;
  phone: string;
  source?: string;
}

// Registration import row — carries the optional church-registration fields in
// addition to name + phone. Used by the Participants CSV import.
export interface ParsedRegistrationRow {
  fullName: string;
  phone: string;
  email?: string;
  gender?: string;
  ageRange?: string;
  departments?: string[];
  registrationDate?: string;
  smartRequest?: string;
}

export interface SkippedImportRow {
  rowNumber: number;
  raw: string;
  reason: string;
}

export interface RegistrationParseResult {
  rows: ParsedRegistrationRow[];
  skipped: number; // rows that could not be parsed (no name / no valid phone)
  skippedRows?: SkippedImportRow[];
  error?: string;
}

export interface ImportParseResult {
  rows: ParsedContactRow[];
  skipped: number; // rows that could not be parsed
  duplicates: number; // rows whose phone already exists
}

// --- Bulk paste: one contact per line, columns split by tab, "|" or 2+ spaces ---
export const parseBulkPaste = (text: string, existingPhones: Set<string>): ImportParseResult => {
  const rows: ParsedContactRow[] = [];
  let skipped = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\t|\||\s{2,}/).map((p) => p.trim()).filter(Boolean);
    let name = '';
    let phone = '';
    let source: string | undefined;
    if (parts.length >= 2) {
      [name, phone] = parts;
      source = parts[2];
    } else {
      const phoneMatch = line.match(/([+\d][\d\s()+-]{8,})/);
      if (phoneMatch) {
        const phoneIndex = phoneMatch.index ?? 0;
        name = line.slice(0, phoneIndex).trim().replace(/[,;:]+$/, '');
        phone = phoneMatch[1].trim();
        source = line.slice(phoneIndex + phoneMatch[1].length).trim() || undefined;
      }
    }
    const intl = normalizeToIntlPhone(phone);
    if (!name || !intl) {
      skipped += 1;
      continue;
    }
    if (existingPhones.has(intl) || seen.has(intl)) {
      duplicates += 1;
      continue;
    }
    seen.add(intl);
    rows.push({ fullName: name, phone: phone.trim(), source });
  }

  return { rows, skipped, duplicates };
};

// --- CSV: fuzzy header detection; only name + phone are imported ---

// Parses a full CSV text into rows, correctly handling quoted fields that
// contain embedded commas and newlines (RFC 4180). Returns an array of
// string-arrays (cells), one per logical row.
const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i += 1; // consume \n of \r\n
      cells.push(current.trim());
      current = '';
      if (cells.some((c) => c !== '')) rows.push(cells); // skip blank rows
      cells = [];
    } else if (ch === '\r' && !inQuotes) {
      // bare \r — treat as line end
      cells.push(current.trim());
      current = '';
      if (cells.some((c) => c !== '')) rows.push(cells);
      cells = [];
    } else {
      current += ch;
    }
  }
  // flush last row
  if (inQuotes && /[\r\n]/.test(current)) {
    // Unterminated quote: the rest of the file was swallowed into one field.
    // Recover by splitting that trailing content on newlines so later rows
    // aren't lost (the source file had a stray/mismatched quote).
    const lines = current.split(/\r?\n/);
    cells.push((lines.shift() ?? '').trim());
    if (cells.some((c) => c !== '')) rows.push(cells);
    for (const line of lines) {
      const recovered = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (recovered.some((c) => c !== '')) rows.push(recovered);
    }
  } else {
    cells.push(current.trim());
    if (cells.some((c) => c !== '')) rows.push(cells);
  }

  return rows;
};

interface DetectedColumns {
  nameIndexes: number[]; // e.g. [firstName, surname] — joined with a space
  phoneIndex: number;
}

export const detectColumns = (headers: string[]): DetectedColumns | null => {
  const lower = headers.map((h) => h.toLowerCase());
  const phoneIndex = lower.findIndex(
    (h) => h.includes('whatsapp') || h.includes('phone') || h.includes('number') || h.includes('tel')
  );
  if (phoneIndex === -1) return null;

  const nameIndexes: number[] = [];
  const firstName = lower.findIndex((h) => h.includes('first name') || h.includes('firstname'));
  const surname = lower.findIndex((h) => h.includes('surname') || h.includes('last name') || h.includes('lastname'));
  if (firstName !== -1) nameIndexes.push(firstName);
  if (surname !== -1 && surname !== firstName) nameIndexes.push(surname);
  if (nameIndexes.length === 0) {
    const generic = lower.findIndex((h, i) => h.includes('name') && i !== phoneIndex);
    if (generic === -1) return null;
    nameIndexes.push(generic);
  }
  return { nameIndexes, phoneIndex };
};

export const parseCsv = (
  text: string,
  existingPhones: Set<string>,
  defaultSource?: string
): ImportParseResult & { error?: string } => {
  const allRows = parseCsvRows(text);
  if (allRows.length < 2) return { rows: [], skipped: 0, duplicates: 0, error: 'File has no data rows.' };

  const headers = allRows[0];
  const cols = detectColumns(headers);
  if (!cols) {
    return { rows: [], skipped: 0, duplicates: 0, error: 'Could not find name and phone columns in this file.' };
  }

  const rows: ParsedContactRow[] = [];
  let skipped = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const cells of allRows.slice(1)) {
    const name = cols.nameIndexes
      .map((i) => (cells[i] || '').trim())
      .filter(Boolean)
      .join(' ');
    const phone = (cells[cols.phoneIndex] || '').trim();
    const intl = normalizeToIntlPhone(phone);
    if (!name || !intl) {
      skipped += 1;
      continue;
    }
    if (existingPhones.has(intl) || seen.has(intl)) {
      duplicates += 1;
      continue;
    }
    seen.add(intl);
    rows.push({ fullName: name, phone, source: defaultSource });
  }

  return { rows, skipped, duplicates };
};

export const buildExistingPhoneSet = (phones: Array<string | null | undefined>): Set<string> => {
  const set = new Set<string>();
  for (const p of phones) {
    const intl = normalizeToIntlPhone(p);
    if (intl) set.add(intl);
  }
  return set;
};

// --- Registration CSV: name + phone + the extra registration fields ---------
// Unlike parseCsv, this does NOT pre-skip rows whose phone already exists — the
// create-vs-fill decision happens at import time (importWithEnrich). It only
// de-dupes within the file and skips rows with no name / no valid phone.
interface RegistrationCols {
  nameIndexes: number[];
  phoneIndex: number;
  emailIndex: number;
  genderIndex: number;
  ageIndex: number;
  dateIndex: number;
  smartIndex: number;
  deptIndex: number;
}

const detectRegistrationColumns = (headers: string[]): RegistrationCols | null => {
  const base = detectColumns(headers);
  if (!base) return null;
  const lower = headers.map((h) => h.toLowerCase());
  const find = (pred: (h: string) => boolean) => lower.findIndex(pred);
  return {
    nameIndexes: base.nameIndexes,
    phoneIndex: base.phoneIndex,
    emailIndex: find((h) => h.includes('email')),
    genderIndex: find((h) => h.includes('gender') || h === 'sex'),
    ageIndex: find((h) => h.includes('age')),
    dateIndex: find((h) => h.includes('registration date') || h.includes('reg date') || (h.includes('date') && !h.includes('update'))),
    smartIndex: find((h) => h.includes('smart') || h.includes('request')),
    deptIndex: find((h) => h.includes('department')),
  };
};

const cell = (cells: string[], i: number): string => (i >= 0 ? (cells[i] || '').trim() : '');

export const parseRegistrationCsv = (text: string): RegistrationParseResult => {
  const allRows = parseCsvRows(text);
  if (allRows.length < 2) return { rows: [], skipped: 0, error: 'File has no data rows.' };

  const headers = allRows[0];
  const cols = detectRegistrationColumns(headers);
  if (!cols) return { rows: [], skipped: 0, error: 'Could not find name and phone columns in this file.' };

  const rows: ParsedRegistrationRow[] = [];
  let skipped = 0;
  const skippedRows: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (const [index, cells] of allRows.slice(1).entries()) {
    const name = cols.nameIndexes.map((i) => cell(cells, i)).filter(Boolean).join(' ');
    const phone = cell(cells, cols.phoneIndex);
    const intl = normalizeToIntlPhone(phone);
    if (!name || !intl) {
      skipped += 1;
      skippedRows.push({
        rowNumber: index + 2,
        raw: cells.join(','),
        reason: !name ? 'Missing name' : 'Phone could not be parsed',
      });
      continue;
    }
    if (seen.has(intl)) continue; // de-dupe within file only
    seen.add(intl);

    const deptRaw = cell(cells, cols.deptIndex);
    const departments = deptRaw
      ? deptRaw.split(',').map((d) => d.trim()).filter(Boolean)
      : undefined;

    rows.push({
      fullName: name,
      phone,
      email: cell(cells, cols.emailIndex) || undefined,
      gender: cell(cells, cols.genderIndex) || undefined,
      ageRange: cell(cells, cols.ageIndex) || undefined,
      departments,
      registrationDate: cell(cells, cols.dateIndex) || undefined,
      smartRequest: cell(cells, cols.smartIndex) || undefined,
    });
  }

  return { rows, skipped, skippedRows };
};
