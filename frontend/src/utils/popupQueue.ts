import { useEffect, useState, useSyncExternalStore } from 'react';

// One popup at a time. Every popup that can appear on its own asks for a slot here,
// and only the one with the best place in the queue is shown; the rest wait.
//
//   required  something that must be answered or read (follow-up check, announcement
//             popup, a new hub role). Never held back by the daily limit.
//   soft      everything that is nice to have (weekly question, Get the app sheet,
//             login reminder). At most SOFT_DAILY_LIMIT different soft popups a day
//             per device; the rest wait for tomorrow, so nobody is buried.
//
// Lower priority numbers go first. A popup already on screen is never pushed off by a
// later arrival.

export type PopupKind = 'required' | 'soft';

/** Places in the queue, first to last. */
export const POPUP_PRIORITY = {
  followUpCheck: 20,
  checkIn: 25,
  // The live (Telegram) prayer: cannot be closed until Prayed unlocks, so it goes right after the check-in.
  livePrayer: 28,
  prayerConsent: 30,
  hubIntro: 35,
  announcement: 45,
  classFeedback: 50,
  department: 55,
  loginReminder: 60,
  getTheApp: 70,
} as const;

export const SOFT_DAILY_LIMIT = 2;

interface Entry { priority: number; kind: PopupKind }

const wanted = new Map<string, Entry>();
let activeId: string | null = null;
const listeners = new Set<() => void>();

const STORAGE_KEY = 'fof_popups_shown_today';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

const readShown = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as { day: string; ids: string[] } | null;
    return saved && saved.day === today() ? saved.ids : [];
  } catch {
    return [];
  }
};
const writeShown = (ids: string[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: today(), ids })); } catch { /* private browsing etc. */ }
};

/** Picks who is next when nobody is showing. */
const choose = () => {
  if (activeId && wanted.has(activeId)) return;
  const shown = readShown();
  const softShown = shown.length; // only soft popups are ever recorded
  const next = [...wanted.entries()]
    .filter(([id, entry]) => entry.kind === 'required' || shown.includes(id) || softShown < SOFT_DAILY_LIMIT)
    .sort((a, b) => a[1].priority - b[1].priority)[0];
  const nextId = next ? next[0] : null;
  if (nextId && wanted.get(nextId)?.kind === 'soft' && !shown.includes(nextId)) writeShown([...shown, nextId]);
  activeId = nextId;
};

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/**
 * Ask for a slot. Returns true while this popup may be on screen. Pass `wants` false
 * when there is nothing to show (or it should wait); the slot is given up at once.
 */
export const usePopupSlot = (id: string, priority: number, wants: boolean, kind: PopupKind = 'soft'): boolean => {
  useEffect(() => {
    if (!wants) return undefined;
    wanted.set(id, { priority, kind });
    choose();
    emit();
    return () => {
      wanted.delete(id);
      if (activeId === id) activeId = null;
      choose();
      emit();
    };
  }, [id, priority, wants, kind]);
  return useSyncExternalStore(subscribe, () => activeId === id);
};

/** For tests: forget everything. */
export const resetPopupQueue = () => {
  wanted.clear();
  activeId = null;
  emit();
};

/**
 * True a moment after the screen opens. Optional popups wait for it, so one that is
 * only fetched from the server (an announcement popup) gets a chance to claim the
 * first slot instead of being queued behind a popup that was ready sooner.
 */
export const useSettled = (ms = 1500): boolean => {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return settled;
};
