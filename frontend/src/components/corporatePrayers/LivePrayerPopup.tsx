import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prayerSlotApi } from '../../services/api';
import type { PrayerNow } from '../../types';
import { usePrayerSignal } from '../../hooks/usePrayerSignal';
import { POPUP_PRIORITY, usePopupSlot } from '../../utils/popupQueue';
import LivePrayerCard from './LivePrayerCard';

// The live-prayer pop-up (the evening Telegram prayer). Like the opt-out pop-up it has no close button and ignores Escape and
// outside taps: the only way out is "Prayed", which unlocks a few minutes after the Telegram link is tapped. Opening it is the
// check-in. It only appears when the admin has set a Telegram link, so nobody can be trapped behind a missing link.

const LivePrayerPopup: React.FC = () => {
  const { signal, refresh, markAnswered } = usePrayerSignal();
  const open = signal?.open ?? null;
  const sessionId = open && open.slotType === 'LIVE' && !open.amen ? open.sessionId : null;
  const [data, setData] = useState<PrayerNow | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) { setData(null); return undefined; }
    let cancelled = false;
    void (async () => {
      try {
        const next = await prayerSlotApi.now(sessionId);
        if (cancelled) return;
        setOffset(Date.parse(next.serverNow) - Date.now());
        setData(next);
      } catch { if (!cancelled) setData(null); }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const wants = !!sessionId && !!data && data.session?.slotType === 'LIVE' && !!data.live?.telegramLink && !data.me?.amenAt;
  const active = usePopupSlot('live-prayer', POPUP_PRIORITY.livePrayer, wants, 'required');

  // Opening the pop-up is the check-in, so it happens only once the pop-up has its turn on screen (it may be queued behind another).
  useEffect(() => {
    if (!active || !sessionId || !data || data.me) return undefined;
    let cancelled = false;
    void prayerSlotApi.join(sessionId)
      .then(() => prayerSlotApi.now(sessionId))
      .then((next) => { if (!cancelled) { setOffset(Date.parse(next.serverNow) - Date.now()); setData(next); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active, sessionId, data]);

  // Keyboard and screen-reader focus moves into the pop-up when it appears.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const shown = active && !!data?.live?.telegramLink && !!data.me;
  useEffect(() => { if (shown) dialogRef.current?.focus(); }, [shown]);

  const tapLink = useCallback(() => {
    if (!sessionId) return;
    void prayerSlotApi.linkTap(sessionId).then((linkTappedAt) => {
      setData((prev) => (prev && prev.me ? { ...prev, me: { ...prev.me, linkTappedAt } } : prev));
    }).catch(() => undefined);
  }, [sessionId]);

  const prayed = useCallback(async (withoutLink: boolean) => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      await prayerSlotApi.amen(sessionId, withoutLink);
      markAnswered();
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Please try again.');
    } finally { setBusy(false); }
  }, [sessionId, markAnswered, refresh]);

  if (!active || !data?.live?.telegramLink || !data.me) return null;
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="live-prayer-title">
      <div ref={dialogRef} tabIndex={-1} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white px-6 pb-6 pt-7 shadow-xl outline-none sm:max-w-md sm:rounded-[28px]">
        <LivePrayerCard
          link={data.live.telegramLink}
          message={data.live.message}
          waitMinutes={data.live.waitMinutes}
          checkedInAtMs={Date.parse(data.me.checkedInAt)}
          linkTappedAtMs={data.me.linkTappedAt ? Date.parse(data.me.linkTappedAt) : null}
          clockOffsetMs={offset}
          busy={busy}
          error={error}
          onTapLink={tapLink}
          onPrayed={(withoutLink) => { void prayed(withoutLink); }}
        />
      </div>
    </div>,
    document.body,
  );
};

export default LivePrayerPopup;
