import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { announcementPopupsApi } from '../services/api';
import type { AnnouncementPopupItem } from '../types';
import { POPUP_PRIORITY, usePopupSlot } from '../utils/popupQueue';

// Announcements sent as a popup. One at a time, oldest first, and it stays until the
// person taps Got it (or its button). It takes its place in the shared popup queue, so
// it never lands on top of another popup.

const RECHECK_MS = 5 * 60 * 1000;
const SURFACE = 'rounded-[28px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.2)]';
const PRIMARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const SECONDARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-60';

const AnnouncementPopupHost: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AnnouncementPopupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const lastCheck = useRef(0);

  const load = useCallback(() => {
    lastCheck.current = Date.now();
    announcementPopupsApi.pending().then(setItems).catch(() => { /* offline or signed out: try again later */ });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, load]);

  const current = items[0] ?? null;
  const mayShow = usePopupSlot('announcement', POPUP_PRIORITY.announcement, enabled && !!current, 'required');

  // Held back for a moment, so a tap meant for the screen underneath can't land on a button.
  const currentId = current?.id;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!currentId || !mayShow) return undefined;
    const timer = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, [currentId, mayShow]);

  if (!enabled || !current || !mayShow || !ready) return null;

  const done = async (openLink: boolean) => {
    setBusy(true);
    try {
      await announcementPopupsApi.acknowledge(current.id);
      setItems((prev) => prev.filter((item) => item.id !== current.id));
      if (openLink && current.linkUrl) {
        if (/^https?:\/\//i.test(current.linkUrl)) window.open(current.linkUrl, '_blank', 'noopener');
        else navigate(current.linkUrl);
      }
    } catch {
      /* it stays up, and they can try again */
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[145] flex items-end justify-center sm:items-center" role="alertdialog" aria-modal="true" aria-label={current.subject}>
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className={`${SURFACE} relative w-full max-w-md max-h-[88vh] overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 sm:mx-4`}>
        <p className="text-[13px] font-semibold text-primary">{current.heading || 'Announcement'}</p>
        <h2 className="mt-1.5 text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-gray-900">{current.subject}</h2>
        <p className="mt-3 whitespace-pre-line text-[15.5px] leading-[1.65] text-gray-600">{current.body}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {current.linkUrl ? (
            <>
              <button type="button" onClick={() => { void done(true); }} disabled={busy} className={PRIMARY}>{current.linkLabel || 'Open'}</button>
              <button type="button" onClick={() => { void done(false); }} disabled={busy} className={SECONDARY}>Got it</button>
            </>
          ) : (
            <button type="button" onClick={() => { void done(false); }} disabled={busy} className={PRIMARY}>Got it</button>
          )}
        </div>
        {items.length > 1 && <p className="mt-3 text-center text-xs text-gray-400">{items.length - 1} more after this</p>}
      </div>
    </div>,
    document.body,
  );
};

export default AnnouncementPopupHost;
