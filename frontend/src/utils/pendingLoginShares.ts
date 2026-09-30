import { useCallback, useEffect, useState } from 'react';

// When a support taps Send in WhatsApp, Send by email or Copy message on
// someone's login, the sending happens outside the app, so the app can't know
// whether it went. It remembers the person here, and keeps asking "Did you
// send it?" until the support answers. Kept on the device so it survives a
// reload or closing the app.

export interface PendingLoginShare {
  contactId: string;
  name: string;
  at: string;
}

const key = (userId: string) => `fofPendingLoginShares:${userId}`;
const CHANGED = 'fof-pending-login-shares';

const read = (userId: string): PendingLoginShare[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.contactId === 'string') : [];
  } catch {
    return [];
  }
};

const write = (userId: string, items: PendingLoginShare[]) => {
  try {
    localStorage.setItem(key(userId), JSON.stringify(items));
  } catch { /* storage unavailable: the prompt just won't persist */ }
  window.dispatchEvent(new Event(CHANGED));
};

export const usePendingLoginShares = (userId?: string | null) => {
  const [pending, setPending] = useState<PendingLoginShare[]>(() => (userId ? read(userId) : []));

  useEffect(() => {
    if (!userId) { setPending([]); return undefined; }
    const sync = () => setPending(read(userId));
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId]);

  const add = useCallback((item: { contactId: string; name: string }) => {
    if (!userId) return;
    const others = read(userId).filter((entry) => entry.contactId !== item.contactId);
    write(userId, [...others, { ...item, at: new Date().toISOString() }]);
  }, [userId]);

  const remove = useCallback((contactId: string) => {
    if (!userId) return;
    write(userId, read(userId).filter((entry) => entry.contactId !== contactId));
  }, [userId]);

  return { pending, add, remove };
};
