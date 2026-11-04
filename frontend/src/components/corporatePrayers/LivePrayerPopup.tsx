import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prayerSlotApi } from '../../services/api';
import type { PrayerNow } from '../../types';
import { usePrayerSignal } from '../../hooks/usePrayerSignal';
import { usePolling } from '../../hooks/usePolling';
import { POPUP_PRIORITY, usePopupSlot } from '../../utils/popupQueue';
import LivePrayerScreen from './LivePrayerScreen';

// The live prayer on Telegram, drawn over everything while it is on. Opening it is the check-in; tapping Join opens the link and
// counts as praying. It cannot be closed until the prayer ends (then "Back to Home"), or, ten minutes in without a tap, "I can't
// join tonight". It only appears when the slot has a Telegram link, so nobody can be trapped behind a missing link.

const LivePrayerPopup: React.FC = () => {
  const { signal, refresh, markAnswered, started, clearStarted, setLiveActive } = usePrayerSignal();
  const open = signal?.open ?? null;
  const fromSignal = open && open.slotType === 'LIVE' && !open.cantJoin ? open.sessionId : null;
  // Once on screen it stays (even after the signal stops reporting it at the close) until they are done with it.
  const [held, setHeld] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const candidate = held ?? (started && started === fromSignal ? started : fromSignal);
  const sessionId = candidate && !done.includes(candidate) ? candidate : null;
  const [data, setData] = useState<PrayerNow | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    const next = await prayerSlotApi.now(id);
    setOffset(Date.parse(next.serverNow) - Date.now());
    setData(next.session?.id === id ? next : null);
    return next;
  }, []);

  useEffect(() => {
    if (!sessionId) { setData(null); return undefined; }
    let cancelled = false;
    void load(sessionId).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [sessionId, load]);

  const isLive = !!data && data.session?.slotType === 'LIVE' && !!data.live?.telegramLink;
  // A live prayer that ended before it reached the screen is not shown at all.
  const stillOn = !!data?.session && Date.now() + offset < Date.parse(data.session.closesAt);
  const wants = !!sessionId && isLive && !data?.me?.cantJoinAt && (held === sessionId || stillOn);
  const active = usePopupSlot('live-prayer', POPUP_PRIORITY.livePrayer, wants, 'required');
  // The daily prayer steps aside only while this screen really wants the screen (a live slot with no link never blocks it).
  useEffect(() => { setLiveActive(wants); return () => setLiveActive(false); }, [wants, setLiveActive]);

  useEffect(() => { if (active && sessionId) setHeld(sessionId); }, [active, sessionId]);

  // Opening the screen is the check-in, so it happens only once it has its turn on screen (it may be queued behind another).
  const joining = useRef(false);
  useEffect(() => {
    if (!active || !sessionId || !data || data.me || !stillOn || joining.current) return;
    joining.current = true;
    void prayerSlotApi.join(sessionId)
      .then(() => load(sessionId))
      .catch(() => undefined)
      .finally(() => { joining.current = false; });
  }, [active, sessionId, data, stillOn, load]);

  // The two counts, while it is on screen (a tiny call, visible tabs only).
  usePolling(async () => {
    if (!sessionId) return;
    const next = await prayerSlotApi.counts(sessionId);
    setOffset(Date.parse(next.serverNow) - Date.now());
    setData((prev) => (prev ? { ...prev, counts: next.counts } : prev));
  }, active && sessionId && stillOn ? 15000 : null);

  // Focus moves into the screen when it appears.
  const shown = active && isLive && !!data?.me;
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (shown) rootRef.current?.querySelector<HTMLElement>('a,button')?.focus(); }, [shown]);

  const finish = useCallback(() => {
    if (sessionId) setDone((prev) => [...prev, sessionId]);
    setHeld(null);
    if (started === sessionId) clearStarted();
    void refresh();
  }, [sessionId, started, clearStarted, refresh]);

  const tapLink = useCallback(() => {
    if (!sessionId) return;
    const at = new Date(Date.now() + offset).toISOString();
    setData((prev) => (prev && prev.me && !prev.me.linkTappedAt
      ? { ...prev, me: { ...prev.me, linkTappedAt: at }, counts: prev.counts ? { ...prev.counts, tapped: (prev.counts.tapped ?? 0) + 1 } : prev.counts }
      : prev));
    void prayerSlotApi.linkTap(sessionId).then((res) => {
      setData((prev) => (prev && prev.me ? { ...prev, me: { ...prev.me, linkTappedAt: res.linkTappedAt }, counts: res.counts ?? prev.counts } : prev));
    }).catch(() => undefined);
  }, [sessionId, offset]);

  const cantJoin = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      await prayerSlotApi.cantJoin(sessionId);
      markAnswered();
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Please try again.');
    } finally { setBusy(false); }
  }, [sessionId, markAnswered, finish]);

  if (!shown || !data?.session || !data.live?.telegramLink || !data.me) return null;
  return createPortal(
    <div ref={rootRef}>
      <LivePrayerScreen
        title={data.session.name || 'Evening live prayer'}
        message={data.live.message}
        link={data.live.telegramLink}
        opensAt={data.session.opensAt}
        closesAt={data.session.closesAt}
        counts={data.counts ?? { joined: 0, praying: 0, amen: 0, tapped: 0 }}
        checkedInAtMs={Date.parse(data.me.checkedInAt)}
        linkTappedAtMs={data.me.linkTappedAt ? Date.parse(data.me.linkTappedAt) : null}
        clockOffsetMs={offset}
        next={signal?.next ?? data.next ?? null}
        busy={busy}
        error={error}
        onTapLink={tapLink}
        onCantJoin={() => { void cantJoin(); }}
        onDone={finish}
      />
    </div>,
    document.body,
  );
};

export default LivePrayerPopup;
