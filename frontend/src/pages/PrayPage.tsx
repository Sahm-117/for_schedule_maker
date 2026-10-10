import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { prayerSlotApi } from '../services/api';
import type { PrayerNow } from '../types';
import { usePrayerSignal } from '../hooks/usePrayerSignal';
import { usePolling } from '../hooks/usePolling';
import PageLoader from '../components/PageLoader';
import PrayerSlotScreen from '../components/corporatePrayers/PrayerSlotScreen';
import LivePrayerCard from '../components/corporatePrayers/LivePrayerCard';
import { clockLabel, lagosClock } from '../utils/prayerText';

// The prayer screen for participants (/me/pray) and supports (/support/pray). Opening it checks you in; Amen checks you out;
// you can leave any time. Counts refresh every ten seconds (a tiny call, jittered, visible tabs only).

const PrayPage: React.FC<{ homePath: string }> = ({ homePath }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('s');
  const { signal, refresh, markAnswered } = usePrayerSignal();
  // The prayer the signal says is open: a push opens this page without a session in the link, and the signal may arrive after the page,
  // so the page loads again when it does.
  const signalSession = requested ? null : (signal?.open?.sessionId ?? null);
  const [data, setData] = useState<PrayerNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [joinError, setJoinError] = useState('');
  const offsetRef = useRef(0);

  const load = useCallback(async () => {
    try {
      let next = await prayerSlotApi.now(requested ?? signalSession);
      offsetRef.current = Date.parse(next.serverNow) - Date.now();
      // Opening an open prayer is the check-in.
      setJoinError('');
      if (next.state === 'open' && next.session && !next.me) {
        try {
          const counts = await prayerSlotApi.join(next.session.id);
          next = { ...next, counts, me: { checkedInAt: new Date(Date.now() + offsetRef.current).toISOString(), amenAt: null, linkTappedAt: null } };
        } catch (err) {
          setJoinError(err instanceof Error && err.message !== 'SESSION_EXPIRED' ? err.message : 'Could not join this prayer.');
        }
      }
      setData(next);
      setLoadError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setLoadError(message && message !== 'SESSION_EXPIRED' ? message : 'Could not load this prayer. Please try again.');
    } finally { setLoading(false); }
  }, [requested, signalSession]);

  useEffect(() => { void load(); }, [load]);

  const sessionId = data?.session?.id ?? null;
  usePolling(async () => {
    if (!sessionId) return;
    const next = await prayerSlotApi.counts(sessionId);
    // It has just opened while this screen was waiting: load it again, which checks them in.
    if (next.state === 'open' && !data?.me) { await load(); return; }
    setData((prev) => (prev ? { ...prev, counts: next.counts, state: next.state } : prev));
  }, sessionId ? 10000 : null, { catchUp: true });

  const leave = useCallback(() => { void refresh(); navigate(homePath); }, [navigate, homePath, refresh]);

  const amen = useCallback(async (withoutLink = false) => {
    if (!sessionId) return;
    setBusy(true);
    setActionError('');
    try {
      const counts = await prayerSlotApi.amen(sessionId, withoutLink);
      markAnswered();
      setData((prev) => (prev && prev.me ? { ...prev, counts, me: { ...prev.me, amenAt: new Date().toISOString() } } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save that. Please try again.');
    } finally { setBusy(false); }
  }, [sessionId, markAnswered]);

  const tapLink = useCallback(() => {
    if (!sessionId) return;
    void prayerSlotApi.linkTap(sessionId).then((linkTappedAt) => {
      setData((prev) => (prev && prev.me ? { ...prev, me: { ...prev.me, linkTappedAt } } : prev));
    }).catch(() => undefined);
  }, [sessionId]);

  if (loading) return <PageLoader />;

  // Everything that is not a prayer you can pray right now: nothing open, not open yet, already ended, or a join that failed.
  const ended = data?.state === 'closed' && !data.me;
  const notYet = data?.state === 'upcoming';
  if (!data || data.state === 'none' || !data.session || ended || notYet || (data.state === 'open' && !data.me && joinError)) {
    const next = data?.next;
    const title = loadError ? 'Could not load'
      : notYet && data?.session ? `This prayer opens at ${clockLabel(lagosClock(data.session.opensAt))}`
      : ended ? 'This prayer has ended'
      : joinError ? 'Could not join this prayer'
      : 'No prayer is open right now';
    const body = loadError
      || (joinError ? joinError
        : next ? `The next one is at ${clockLabel(lagosClock(next.opensAt))}.`
        : 'There is nothing scheduled for the rest of today.');
    return (
      <div className="page-content">
        <div className="mx-auto mt-10 max-w-md rounded-[24px] bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-2 text-[15px] text-gray-600">{body}</p>
          <div className="mt-5 flex justify-center gap-2">
            {(loadError || joinError) && <button type="button" onClick={() => { setLoading(true); void load(); }} className="min-h-[44px] rounded-full bg-primary px-5 text-sm font-semibold text-white">Try again</button>}
            <button type="button" onClick={leave} className="min-h-[44px] rounded-full bg-gray-100 px-5 text-sm font-semibold text-gray-800">Back</button>
          </div>
        </div>
      </div>
    );
  }

  const session = data.session;
  const counts = data.counts ?? { joined: 0, praying: 0, amen: 0 };

  if (session.slotType === 'LIVE') {
    return createPortal(
      <div className="fixed inset-0 z-[150] flex items-end justify-center overflow-y-auto bg-[#0b1020]/95 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-[28px] bg-white px-6 pb-6 pt-7 shadow-xl sm:rounded-[28px]">
          {data.live?.telegramLink && data.me ? (
            data.me.amenAt ? (
              <div className="flex flex-col gap-4 text-center">
                <h2 className="text-[22px] font-bold text-gray-900">Thank you for praying.</h2>
                <button type="button" onClick={leave} className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-white">Done</button>
              </div>
            ) : (
              <LivePrayerCard
                link={data.live.telegramLink}
                message={data.live.message}
                waitMinutes={data.live.waitMinutes}
                checkedInAtMs={Date.parse(data.me.checkedInAt)}
                linkTappedAtMs={data.me.linkTappedAt ? Date.parse(data.me.linkTappedAt) : null}
                clockOffsetMs={offsetRef.current}
                busy={busy}
                error={actionError}
                onTapLink={tapLink}
                onPrayed={(withoutLink) => { void amen(withoutLink); }}
              />
            )
          ) : (
            <div className="text-center">
              <h2 className="text-[20px] font-bold text-gray-900">The live prayer link has not been set up yet.</h2>
              <button type="button" onClick={leave} className="mt-4 min-h-[44px] rounded-full bg-gray-100 px-5 text-sm font-semibold text-gray-800">Back</button>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <PrayerSlotScreen
      model={{
        slotLabel: session.name || clockLabel(lagosClock(session.opensAt)),
        person: data.person ?? null,
        blocks: data.blocks ?? [],
        counts,
        timerMinutes: session.timerMinutes,
        checkedInAtMs: data.me ? Date.parse(data.me.checkedInAt) : null,
        amenDone: !!data.me?.amenAt,
      }}
      clockOffsetMs={offsetRef.current}
      onAmen={() => { void amen(); }}
      onLeave={leave}
      busy={busy}
      error={actionError}
    />,
    document.body,
  );
};

export default PrayPage;
