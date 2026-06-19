import { normalizeToIntlPhone } from './phone';

export interface ParsedContactRow {
  fullName: string;
  phone: string;
  source?: string;
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
const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
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
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, duplicates: 0, error: 'File has no data rows.' };

  const headers = splitCsvLine(lines[0]);
  const cols = detectColumns(headers);
  if (!cols) {
    return { rows: [], skipped: 0, duplicates: 0, error: 'Could not find name and phone columns in this file.' };
  }

  const rows: ParsedContactRow[] = [];
  let skipped = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
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
