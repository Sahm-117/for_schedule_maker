import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { prayerSlotApi } from '../services/api';
import type { PrayerNow } from '../types';
import { usePrayerSignal } from '../hooks/usePrayerSignal';
import PageLoader from '../components/PageLoader';
import { clockLabel, lagosClock } from '../utils/prayerText';

// /me/pray (participants) and /support/pray (supports): where a prayer push lands. A prayer that can be prayed now (on now, or a
// daily one missed earlier today) is handed to the prayer screens, which draw themselves over everything, and this page goes
// back to Home underneath. Anything else (not open yet, ended, nothing on) says so here.

const PrayPage: React.FC<{ homePath: string }> = ({ homePath }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('s');
  const { signal, start } = usePrayerSignal();
  // A push opens this page without a session in the link; the signal may arrive after the page, so it loads again when it does.
  const signalSession = requested ? null : (signal?.open?.sessionId ?? signal?.unfinished?.sessionId ?? null);
  const [data, setData] = useState<PrayerNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await prayerSlotApi.now(requested ?? signalSession);
      const session = next.session;
      const serverNow = Date.parse(next.serverNow);
      const prayable = !!session && serverNow >= Date.parse(session.opensAt) && (
        next.me ? !next.me.amenAt || session.slotType === 'LIVE'
          : serverNow < Date.parse(session.lateUntil ?? session.closesAt)
      ) && !(session.slotType === 'LIVE' && (!next.live?.telegramLink || next.me?.cantJoinAt || serverNow >= Date.parse(session.closesAt)));
      // The person prayed for: their own screen (numbers while it is on, the words once it has ended).
      if (session && next.isMe && session.slotType !== 'LIVE') {
        start(session.id);
        navigate(homePath, { replace: true });
        return;
      }
      if (session && prayable) {
        start(session.id);
        navigate(homePath, { replace: true });
        return;
      }
      // "N people prayed for you" (the push after their prayer ended) opens the words left for them.
      if (!requested && signal?.forMe) {
        start(signal.forMe.sessionId);
        navigate(homePath, { replace: true });
        return;
      }
      setData(next);
      setLoadError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setLoadError(message && message !== 'SESSION_EXPIRED' ? message : 'Could not load this prayer. Please try again.');
    } finally { setLoading(false); }
  }, [requested, signalSession, signal?.forMe, start, navigate, homePath]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PageLoader />;

  const session = data?.session;
  const notYet = data?.state === 'upcoming';
  const done = !!data?.me?.amenAt;
  const next = data?.next;
  const noLink = session?.slotType === 'LIVE' && !data?.live?.telegramLink && data?.state === 'open';
  const title = loadError ? 'Could not load'
    : noLink ? 'The live prayer link has not been set up yet'
    : notYet && session ? `This prayer opens at ${clockLabel(lagosClock(session.opensAt))}`
    : done ? 'You have prayed this one'
    : session ? 'This prayer has ended'
    : 'No prayer is open right now';
  const body = loadError
    || (next ? `The next one is at ${clockLabel(lagosClock(next.opensAt))}. It opens by itself when it starts.` : 'There is nothing scheduled for the rest of today.');
  return (
    <div className="page-content">
      <div className="mx-auto mt-10 max-w-md rounded-[24px] bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-[15px] text-gray-600">{body}</p>
        <div className="mt-5 flex justify-center gap-2">
          {loadError && <button type="button" onClick={() => { setLoading(true); void load(); }} className="min-h-[44px] rounded-full bg-primary px-5 text-sm font-semibold text-white">Try again</button>}
          <button type="button" onClick={() => navigate(homePath)} className="min-h-[44px] rounded-full bg-gray-100 px-5 text-sm font-semibold text-gray-800">Back</button>
        </div>
      </div>
    </div>
  );
};

export default PrayPage;
