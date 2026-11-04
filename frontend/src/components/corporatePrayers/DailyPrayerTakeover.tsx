import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prayerSlotApi, prayerStreakApi } from '../../services/api';
import type { PrayerNow, PrayerStreak, PrayerWall } from '../../types';
import { usePrayerSignal } from '../../hooks/usePrayerSignal';
import { usePolling } from '../../hooks/usePolling';
import { POPUP_PRIORITY, usePopupSlot } from '../../utils/popupQueue';
import { clockLabel, lagosClock, markForMeSeen, prayerGuideSeen } from '../../utils/prayerText';
import PrayerSlotScreen from './PrayerSlotScreen';
import PrayerGuide from './PrayerGuide';
import PrayedForScreen, { PrayedForSummary } from './PrayedForScreen';
import MilestoneCelebration from './MilestoneCelebration';

// The daily prayer, drawn over everything (Option B). It opens by itself when a prayer starts while the app is open; someone who
// comes in later starts it from the Home card (or the push). Once started it cannot be closed until Amen: it comes back over
// whatever they are doing, and after the window closes it stays until midnight, because a late Amen still counts.
// A live (Telegram) prayer takes the screen first. The person being prayed for sees their own screen instead, which they can close.

// A prayer that started this recently opens by itself; one that started earlier waits on Home for a tap.
const AUTO_OPEN_MS = 3 * 60000;

const DailyPrayerTakeover: React.FC = () => {
  const { signal, refresh, markAnswered, started, clearStarted, liveActive: liveOn } = usePrayerSignal();
  const open = signal?.open ?? null;
  const autoOpen = open && open.slotType !== 'LIVE' && !open.amen && !open.isMe
    && (open.checkedIn || Date.parse(open.serverNow) - Date.parse(open.opensAt) < AUTO_OPEN_MS) ? open.sessionId : null;
  const [held, setHeld] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  // Asking for one again (a tap on its Home card) opens it again even after it was closed once.
  useEffect(() => { if (started) setDone((prev) => (prev.includes(started) ? prev.filter((id) => id !== started) : prev)); }, [started]);
  const pick = held ?? started ?? autoOpen ?? signal?.unfinished?.sessionId ?? null;
  const sessionId = pick && !done.includes(pick) ? pick : null;

  const [data, setData] = useState<PrayerNow | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [guide, setGuide] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [celebrate, setCelebrate] = useState<PrayerStreak | null>(null);
  const [wall, setWall] = useState<PrayerWall | null>(null);

  const load = useCallback(async (id: string) => {
    const next = await prayerSlotApi.now(id);
    setOffset(Date.parse(next.serverNow) - Date.now());
    setData(next.session?.id === id ? next : null);
    return next;
  }, []);

  useEffect(() => {
    setGuide(false);
    setWelcomeBack(false);
    setError('');
    setWall(null);
    if (!sessionId) { setData(null); return undefined; }
    let cancelled = false;
    void load(sessionId).then((next) => {
      if (cancelled) return;
      // Back after a while away: say the timer kept going.
      if (next.me && !next.me.amenAt && Date.parse(next.serverNow) - Date.parse(next.me.checkedInAt) > 60000) setWelcomeBack(true);
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [sessionId, load]);

  const session = data?.session ?? null;
  const daily = !!session && session.slotType !== 'LIVE';
  const serverNow = Date.now() + offset;
  const canStillPray = !!session && serverNow < Date.parse(session.lateUntil ?? session.closesAt);
  const isMe = !!data?.isMe;
  // The person prayed for only sees their screen when they asked for it (the Home card).
  const wants = !!sessionId && daily && !liveOn && (
    isMe ? started === sessionId
      : held === sessionId || (!data?.me?.amenAt && (!!data?.me || canStillPray))
  );
  const active = usePopupSlot('daily-prayer', POPUP_PRIORITY.dailyPrayer, wants, 'required');

  useEffect(() => { if (active && sessionId) setHeld(sessionId); }, [active, sessionId]);

  // Opening it (after the first-time guide) is the check-in, and starts their timer.
  const joining = useRef(false);
  useEffect(() => {
    if (!active || !sessionId || !data || data.me || isMe || guide || !canStillPray || joining.current) return;
    // The first time on this phone, the three-step guide comes first; its "Start praying" starts the timer.
    if (!prayerGuideSeen()) { setGuide(true); return; }
    joining.current = true;
    void prayerSlotApi.join(sessionId)
      .then(() => load(sessionId))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not start this prayer.'))
      .finally(() => { joining.current = false; });
  }, [active, sessionId, data, isMe, guide, canStillPray, load]);

  // One read every 30 seconds while it is on screen: the Wall, which carries the counts too (visible tabs only). For the person
  // prayed for it also notices the end, when their words become readable.
  const refreshWall = useCallback(async () => {
    if (!sessionId) return;
    const next = await prayerSlotApi.wall(sessionId);
    setOffset(Date.parse(next.serverNow) - Date.now());
    setWall(next);
    if (next.counts) setData((prev) => (prev ? { ...prev, counts: next.counts } : prev));
  }, [sessionId]);
  const wallWanted = active && !!sessionId && daily && (isMe || !!data?.me);
  useEffect(() => { if (wallWanted) void refreshWall().catch(() => undefined); }, [wallWanted, refreshWall]);
  usePolling(() => refreshWall().catch(() => undefined), wallWanted && !(isMe ? wall?.ended : !!data?.me?.amenAt) ? 30000 : null);

  const postWord = useCallback(async (body: string) => {
    if (!sessionId) return;
    setWall(await prayerSlotApi.wallPost(sessionId, body));
  }, [sessionId]);
  const hideWord = useCallback(async (postId: string) => {
    await prayerSlotApi.wallHide(postId);
    setWall((prev) => (prev ? { ...prev, posts: prev.posts.filter((post) => post.id !== postId) } : prev));
  }, []);

  const finish = useCallback(() => {
    if (sessionId) setDone((prev) => [...prev, sessionId]);
    setHeld(null);
    setCelebrate(null);
    if (started === sessionId) clearStarted();
    void refresh();
  }, [sessionId, started, clearStarted, refresh]);

  const amen = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      const counts = await prayerSlotApi.amen(sessionId);
      markAnswered();
      const at = new Date(Date.now() + offset).toISOString();
      setData((prev) => (prev && prev.me ? { ...prev, counts, me: { ...prev.me, amenAt: at } } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Please try again.');
    } finally { setBusy(false); }
  }, [sessionId, markAnswered, offset]);

  // Done: if that Amen finished a streak badge, show it first. A failed check never blocks leaving.
  const doneTapped = useCallback(() => {
    prayerStreakApi.get()
      .then((streak) => { if (streak.available && streak.pending) setCelebrate(streak); else finish(); })
      .catch(finish);
  }, [finish]);

  if (!active || !data || !session) return null;

  if (celebrate?.pending) {
    return (
      <MilestoneCelebration
        milestone={celebrate.pending.milestone}
        name={celebrate.name || 'You'}
        photoUrl={celebrate.avatarUrl}
        cohortName={celebrate.cohortName}
        canTellGroup={celebrate.role === 'PARTICIPANT' && !!celebrate.groupName}
        onClose={finish}
      />
    );
  }

  if (isMe) {
    // After it ends: how many prayed and the words they left. While it is on: the numbers only.
    if (wall?.forMe && wall.ended) {
      return createPortal(<PrayedForSummary wall={wall} onClose={() => { markForMeSeen(session.id); finish(); }} />, document.body);
    }
    return createPortal(<PrayedForScreen counts={wall?.counts ?? data.counts ?? { joined: 0, praying: 0, amen: 0 }} hasProject={(data.blocks ?? []).some((block) => block.type === 'FAITH_PROJECT' && !!block.text)} onClose={finish} />, document.body);
  }

  // Could not start it (it ended, or the network failed): never trap them behind a screen they cannot finish.
  if (!data.me && error && !guide) {
    return createPortal(
      <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="prayer-start-error">
        <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-center shadow-xl sm:rounded-3xl">
          <h2 id="prayer-start-error" className="text-lg font-bold text-gray-900">Could not start this prayer</h2>
          <p className="mt-2 text-[15px] text-gray-600">{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => { setError(''); setData((prev) => (prev ? { ...prev } : prev)); }} className="min-h-[44px] rounded-full bg-[#0b1020] px-5 text-sm font-semibold text-white">Try again</button>
            <button type="button" onClick={finish} className="min-h-[44px] rounded-full bg-gray-100 px-5 text-sm font-semibold text-gray-800">Back</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const amenAfter = session.amenAfterMinutes ?? Math.min(3, session.timerMinutes);
  return (<>
    {createPortal(
      <PrayerSlotScreen
        model={{
          slotLabel: session.name || clockLabel(lagosClock(session.opensAt)),
          person: data.person ?? null,
          blocks: data.blocks ?? [],
          counts: data.counts ?? { joined: 0, praying: 0, amen: 0 },
          goalMinutes: session.timerMinutes,
          amenAfterMinutes: amenAfter,
          checkedInAtMs: data.me ? Date.parse(data.me.checkedInAt) : null,
          amenAtMs: data.me?.amenAt ? Date.parse(data.me.amenAt) : null,
          windowClosed: serverNow >= Date.parse(session.closesAt),
          welcomeBack,
        }}
        wall={data.person ? { posts: wall?.posts ?? [], onPost: postWord, onHide: hideWord } : undefined}
        clockOffsetMs={offset}
        onAmen={() => { void amen(); }}
        onDone={doneTapped}
        busy={busy}
        error={error}
      />,
      document.body,
    )}
    {guide && <PrayerGuide goalMinutes={session.timerMinutes} amenAfterMinutes={amenAfter} onStart={() => setGuide(false)} />}
  </>);
};

export default DailyPrayerTakeover;
