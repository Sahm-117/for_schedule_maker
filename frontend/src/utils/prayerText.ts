import type { PrayerSlot, PrayerSlotInput } from '../types';

// Small helpers for corporate prayers: filling a verse prayer with a name, reading pasted verses, and the look of a person's circle.

/** The placeholders a verse can carry, offered in the Insert menu (and after typing @). */
export const PRAYER_PLACEHOLDERS: Array<{ token: string; label: string; example: string }> = [
  { token: '{{Name}}', label: 'Full name', example: 'Adaeze Okafor' },
];

/** `{{Name}}` (and the older `{{NAME}}`) become the person's full name exactly as they wrote it. Nothing else is replaced. */
export const renderPrayer = (text: string, fullName: string): string => {
  const name = fullName.trim() || 'this person';
  return text.replace(/\{\{\s*name\s*\}\}/gi, () => name);
};

/** Gendered words in a prayer, which would read wrongly for half the people prayed for. Placeholders are ignored. */
export const gendered = (text: string): string[] => {
  const clean = text.replace(/\{\{[^}]*\}\}/g, ' ');
  return Array.from(new Set((clean.match(/\b(he|she|his|her|hers|him|himself|herself)\b/gi) ?? []).map((word) => word.toLowerCase())));
};

export interface ParsedVerse { title: string; prayer: string; reference: string; problem: string | null }

/**
 * Pasted verses: blocks separated by a line of three or more equals signs. Each block starts with a `Title:` line and a `Ref:` line
 * (in either order); everything else is the prayer, kept exactly as typed (blank lines and bullets included).
 */
export const parseBulkVerses = (raw: string): ParsedVerse[] => raw
  .split(/\r?\n\s*={3,}\s*\r?\n/)
  .map((block) => block.replace(/^\s*\n+|\s+$/g, ''))
  .filter((block) => block.trim())
  .map((block) => {
    let title = '';
    let reference = '';
    const body: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      const t = line.match(/^\s*title\s*:\s*(.*)$/i);
      const r = line.match(/^\s*ref(?:erence)?\s*:\s*(.*)$/i);
      if (t && !title) title = t[1].trim();
      else if (r && !reference) reference = r[1].trim();
      else body.push(line.trimEnd());
    }
    const prayer = body.join('\n').replace(/^\s*\n+|\s+$/g, '');
    const problem = !title ? 'No title. Add a line starting with Title:' : !reference ? 'No reference. Add a line starting with Ref:' : !prayer ? 'No prayer text.' : null;
    return { title, prayer, reference, problem };
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

export const PRAYER_TYPE_LABEL: Record<'PRAYER' | 'LIVE', string> = {
  PRAYER: 'Prayer',
  LIVE: 'Live prayer',
};

/** A slot as the wizard saves it, with any changes on top (used to switch a slot on or off without touching the rest). */
export const slotToInput = (slot: PrayerSlot, patch: Partial<PrayerSlotInput> = {}): PrayerSlotInput => ({
  id: slot.id,
  name: slot.name ?? '',
  time: slot.time,
  slotType: slot.slotType,
  timerMinutes: slot.timerMinutes,
  joinWindowMinutes: slot.joinWindowMinutes,
  targetMode: slot.targetMode,
  notify: slot.notify,
  active: slot.active,
  blocks: slot.blocks,
  audienceAll: slot.audienceAll,
  hubIds: slot.hubIds,
  telegramLink: slot.telegramLink ?? '',
  liveWaitMinutes: slot.liveWaitMinutes,
  liveMessage: slot.liveMessage ?? '',
  ...patch,
});
