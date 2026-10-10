// Small helpers for corporate prayers: filling a verse prayer with a name, reading pasted verses, and the look of a person's circle.

/** `{{NAME}}` becomes the first name in capitals; `{{Name}}` becomes the first name as written. Nothing else is replaced. */
export const renderPrayer = (text: string, firstName: string): string => {
  const name = firstName.trim() || 'this person';
  const written = name.charAt(0).toUpperCase() + name.slice(1);
  return text
    .replace(/\{\{\s*NAME\s*\}\}/g, name.toUpperCase())
    .replace(/\{\{\s*name\s*\}\}/gi, written);
};

/** Gendered words in a prayer, which would read wrongly for half the people prayed for. Placeholders are ignored. */
export const gendered = (text: string): string[] => {
  const clean = text.replace(/\{\{[^}]*\}\}/g, ' ');
  return Array.from(new Set((clean.match(/\b(he|she|his|her|hers|him|himself|herself)\b/gi) ?? []).map((word) => word.toLowerCase())));
};

export interface ParsedVerse { prayer: string; reference: string; problem: string | null }

/**
 * Pasted verses: blocks separated by a blank line. The last line of a block, starting with "-", is the reference
 * ("- Eph 1:17-18"); everything above it is the prayer.
 */
export const parseBulkVerses = (raw: string): ParsedVerse[] => raw
  .split(/\r?\n\s*\r?\n/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trimEnd());
    const last = lines[lines.length - 1].trim();
    if (lines.length < 2 || !/^[-–—]\s*\S/.test(last)) return { prayer: lines.join(' ').trim(), reference: '', problem: 'No reference. Put it on the last line, starting with a dash.' };
    const reference = last.replace(/^[-–—]\s*/, '').trim();
    const prayer = lines.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim();
    return { prayer, reference, problem: prayer ? null : 'No prayer text.' };
  });

export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';

const GRADIENTS = [
  ['#f97316', '#db2777'], ['#0ea5e9', '#6366f1'], ['#10b981', '#0ea5e9'], ['#a855f7', '#ec4899'], ['#f59e0b', '#ef4444'], ['#14b8a6', '#3b82f6'],
];
/** The colour pair at a position, wrapping round: neighbouring numbers get different colours. */
export const gradientAt = (index: number): [string, string] => GRADIENTS[((index % GRADIENTS.length) + GRADIENTS.length) % GRADIENTS.length] as [string, string];
/** A steady colour pair for a person, so their circle looks the same every time. */
export const gradientFor = (name: string): [string, string] => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length] as [string, string];
};

/** "05:50" -> "5:50 am". */
export const clockLabel = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

/** An ISO time as Lagos wall time "HH:MM". */
export const lagosClock = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  return parts.replace('24:', '00:');
};

export const mmss = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const PRAYER_TYPE_LABEL: Record<'VERSE' | 'FAITH_PROJECT' | 'LIVE', string> = {
  VERSE: 'Verse and picture',
  FAITH_PROJECT: 'Faith project',
  LIVE: 'Live prayer',
};
