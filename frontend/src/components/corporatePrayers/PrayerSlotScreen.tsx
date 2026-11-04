import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrayerCounts, PrayerPerson, PrayerResolvedBlock, PrayerWallPost } from '../../types';
import { mmss, renderPrayer } from '../../utils/prayerText';
import PersonCircle from './PersonCircle';
import Spinner from '../Spinner';
import PrayerText from './PrayerText';
import { HideSheet, WallComposer, WallList } from './PrayerWall';

// The daily prayer screen (Option B). It is not a call: people pray where they are. The timer counts up from when they started
// against the suggested length (the slot's timer, 15 minutes by default); Amen opens after a few minutes (3) so nobody is held
// against their will, but every screen asks for the full time. There is no way to close it before Amen (the real screen is drawn
// over everything by DailyPrayerTakeover). Used with sample data by the admin Preview, so the two cannot drift apart.

export interface PrayerScreenModel {
  slotLabel: string;
  person: PrayerPerson | null;
  blocks: PrayerResolvedBlock[];
  counts: PrayerCounts;
  /** The suggested length, in minutes. */
  goalMinutes: number;
  /** Amen opens this many minutes after they start. */
  amenAfterMinutes: number;
  /** When this person started (ms since epoch, server time). Null in a preview: the timer sits at 0. */
  checkedInAtMs: number | null;
  /** When they said Amen (ms, server time), or null. */
  amenAtMs: number | null;
  /** The prayer's window has closed; their Amen still counts. */
  windowClosed: boolean;
  /** They had left and came back: the timer kept going. */
  welcomeBack: boolean;
}

/** The Wall: short words for the person, with first names. Absent: no Wall tab. */
export interface PrayerWallModel {
  posts: PrayerWallPost[];
  onPost: (body: string) => Promise<void>;
  onHide: (postId: string) => Promise<void>;
}

interface Props {
  model: PrayerScreenModel;
  wall?: PrayerWallModel;
  /** Server time minus this phone's time, so the timer follows the server. */
  clockOffsetMs: number;
  onAmen: () => void;
  onDone: () => void;
  busy?: boolean;
  error?: string;
  /** Draw inside a frame instead of over the whole screen (the admin preview). */
  embedded?: boolean;
}

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

const minutesLabel = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const Avatar: React.FC<{ person: PrayerPerson | null; size: number; ring?: string }> = ({ person, size, ring = 'border-2 border-white/50' }) => (
  <PersonCircle name={person?.fullName ?? 'FOF'} avatarUrl={person?.avatarUrl ?? null} size={size} className={ring} />
);

const PrayerSlotScreen: React.FC<Props> = ({ model, wall, clockOffsetMs, onAmen, onDone, busy = false, error = '', embedded = false }) => {
  const { person, blocks, counts } = model;
  const [tick, setTick] = useState(() => Date.now());
  // Amen ends the prayer, so a tap on it asks first (a slip of the thumb would close the screen).
  const [confirming, setConfirming] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [tab, setTab] = useState<'prayer' | 'wall'>('prayer');
  const [hiding, setHiding] = useState<PrayerWallPost | null>(null);
  const [wordAfterAmen, setWordAfterAmen] = useState(false);
  // Words that arrived since they last looked at the Wall.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const posts = useMemo(() => wall?.posts ?? [], [wall?.posts]);
  useEffect(() => {
    if (tab === 'wall' && posts.some((post) => !seenIds.has(post.id))) setSeenIds(new Set(posts.map((post) => post.id)));
  }, [tab, posts, seenIds]);
  const newCount = posts.filter((post) => !post.mine && !seenIds.has(post.id)).length;
  const latest = [...posts].reverse().find((post) => !post.mine) ?? null;
  const prayerKey = `${person?.id ?? ''}|${model.checkedInAtMs ?? ''}`;
  useEffect(() => { setConfirming(false); }, [prayerKey, model.amenAtMs]);
  // A clock that only ticks locally, to redraw the timer. It does not call the server.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const now = tick + clockOffsetMs;
  const elapsed = model.checkedInAtMs !== null ? Math.max(0, (model.amenAtMs ?? now) - model.checkedInAtMs) : 0;
  const amenOpensIn = model.checkedInAtMs !== null ? model.amenAfterMinutes * 60000 - elapsed : model.amenAfterMinutes * 60000;
  const amenOpen = model.checkedInAtMs !== null && amenOpensIn <= 0;
  const goalReached = elapsed >= model.goalMinutes * 60000;
  const name = person?.fullName ?? 'the cohort';
  const first = person?.firstName || name;
  const shout = first.toUpperCase();
  const project = blocks.find((block): block is { type: 'FAITH_PROJECT'; text: string | null } => block.type === 'FAITH_PROJECT' && !!block.text);
  const verses = blocks.filter((block): block is { type: 'VERSE'; title: string; prayer: string; reference: string } => block.type === 'VERSE');
  const others = Math.max(0, counts.amen - 1);

  const frame = embedded
    ? 'relative flex h-[720px] w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] bg-[#f4f5f8] text-gray-900 shadow-xl ring-1 ring-gray-200'
    : 'fixed inset-0 z-[150] flex flex-col bg-[#f4f5f8] text-gray-900';

  // After Amen: thank them, say what happens next, and let them go.
  if (model.amenAtMs !== null) {
    return (
      <div className={frame} role="dialog" aria-modal={!embedded} aria-labelledby="prayer-done-title">
        <div className="flex-none bg-gradient-to-br from-[#1b1038] to-[#0b1020] px-4 pb-4 pt-[max(18px,env(safe-area-inset-top))] text-[13px] font-bold uppercase tracking-[0.08em] text-white">Prayer for {first} · done</div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-3.5 overflow-y-auto px-5 py-7 text-center">
          <Avatar person={person} size={96} ring="border-[3px] border-white shadow-[0_10px_30px_-10px_rgba(11,16,32,.5)]" />
          <h2 id="prayer-done-title" className="text-[26px] font-extrabold">Amen</h2>
          <p className="text-[16px] leading-relaxed text-gray-700">
            You prayed for {minutesLabel(elapsed)}.{' '}
            {others > 0 ? `You and ${others} other${others === 1 ? '' : 's'} have said Amen in this prayer.` : 'You are the first to say Amen in this prayer.'}
            {person ? ` ${first} will see how many prayed, not who.` : ''}
          </p>
          {wall && person && (wordAfterAmen ? (
            <div className="w-full rounded-2xl bg-white p-3.5 text-left">
              <p className="mb-2 text-[13px] font-semibold text-gray-700">A word for {first}. They&apos;ll read it when the prayer ends.</p>
              <WallComposer firstName={person.firstName || null} posts={posts} onPost={wall.onPost} />
            </div>
          ) : (
            <button type="button" onClick={() => setWordAfterAmen(true)} className="min-h-[44px] text-[14px] font-bold text-[#1f5fa8]">Leave a word on the Wall</button>
          ))}
        </div>
        <div className="flex-none border-t border-gray-200 bg-white px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onDone} className="mx-auto flex h-[52px] w-full max-w-xl items-center justify-center rounded-full bg-[#0b1020] text-[16px] font-bold text-white active:scale-[0.98]">Done</button>
        </div>
      </div>
    );
  }

  const readAllSheet = readAll && project ? (
    <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 z-[160] flex items-end justify-center bg-black/45 sm:items-center`} role="dialog" aria-modal="true" aria-labelledby="prayer-readall-title" onClick={() => setReadAll(false)}>
      <div className="max-h-[80%] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="prayer-readall-title" className="text-[17px] font-extrabold">{first}&apos;s faith project</h2>
          <button type="button" onClick={() => setReadAll(false)} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-100 text-lg text-gray-600">×</button>
        </div>
        <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-gray-800">{project.text}</p>
        <p className="mt-4 text-[13px] text-gray-500">As {first} wrote it. Your timer keeps running behind this.</p>
      </div>
    </div>
  ) : null;

  return (
    <div className={frame} role="dialog" aria-modal={!embedded} aria-label={`Praying for ${name}`}>
      <div className="flex-none bg-gradient-to-br from-[#1b1038] to-[#0b1020] px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar person={person} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-extrabold">Praying for {person ? shout : 'the cohort'}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/80">
                <span className="h-[7px] w-[7px] flex-none animate-pulse rounded-full bg-[#e8455a]" aria-hidden="true" />
                {model.windowClosed ? `Window closed · ${counts.amen} prayed` : `${counts.praying} praying now · ${counts.amen} said Amen`}
              </p>
            </div>
            <span className="flex flex-none flex-col items-center rounded-xl bg-white/[.12] px-2.5 py-1" role="timer" aria-label={`${mmss(elapsed)} of ${model.goalMinutes} minutes`}>
              <span className="text-[15px] font-extrabold tabular-nums">{mmss(elapsed).replace(/^0(\d)/, '$1')}</span>
              <span className="text-[10px] text-white/75">of {model.goalMinutes} min</span>
            </span>
          </div>
          <p className="rounded-[10px] bg-white/[.08] px-2.5 py-1.5 text-[12.5px] text-white/85">Not a call. Pray where you are, ideally for {model.goalMinutes} minutes. Amen opens after {model.amenAfterMinutes}.</p>
          {wall && person && (
            <div className="flex gap-1.5" role="tablist" aria-label="Prayer or Wall">
              {(['prayer', 'wall'] as const).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${tab === key ? 'bg-white text-[#0b1020]' : 'bg-white/10 text-white'}`}>
                  {key === 'prayer' ? 'Prayer' : 'Wall'}
                  {key === 'wall' && newCount > 0 && tab !== 'wall' && <span className="rounded-full bg-[#e8455a] px-1.5 text-[11px] text-white">{newCount} new</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          {tab === 'wall' && wall && person ? (
          <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-14 pt-3.5">
            <p className="text-[13px] text-gray-600">{counts.praying} praying now · words for {first}, who reads them when the prayer ends</p>
            <WallList posts={posts} onHide={(post) => setHiding(post)} />
          </div>
          ) : (
          <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-14 pt-3.5">
            {model.windowClosed && (
              <p className="rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[14px] text-amber-900">The prayer window has closed. Keep going: your Amen still counts.</p>
            )}
            {model.welcomeBack && !model.windowClosed && (
              <p className="rounded-2xl bg-sky-50 px-3.5 py-2.5 text-[14px] text-sky-900">Welcome back. Your timer kept going: {mmss(elapsed).replace(/^0(\d)/, '$1')} of {model.goalMinutes} min.</p>
            )}
            {project && (
              <section className="rounded-2xl border border-gray-200 bg-white px-3.5 py-3">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-500">{first}&apos;s faith project</h2>
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-[15px] leading-normal">{project.text}</p>
                <button type="button" onClick={() => setReadAll(true)} className="mt-0.5 min-h-[36px] px-1 text-[14px] font-bold text-[#1f5fa8]">Read all</button>
              </section>
            )}
            {verses.length > 0 ? verses.map((verse, index) => (
              <section key={index}>
                <PrayerText text={renderPrayer(verse.prayer, person ? shout : 'everyone')} className="text-[16px] leading-[1.65] text-gray-900" />
                {verse.reference && <p className="mt-1.5 text-[13px] font-semibold text-[#c2410c]">{verse.reference}</p>}
              </section>
            )) : !project && (
              <p className="text-[15px] leading-normal text-gray-600">{person ? `Pray for ${first} in your own words.` : 'No one is lined up for this prayer today. Pray for the cohort.'}</p>
            )}
          </div>
          )}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#f4f5f8] to-transparent" />
      </div>

      <div className="flex-none border-t border-gray-200 bg-white px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-xl flex-col gap-2.5">
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          {wall && person && !confirming && (tab === 'wall' ? (
            <WallComposer firstName={person.firstName || null} posts={posts} onPost={wall.onPost} />
          ) : latest ? (
            <button type="button" onClick={() => setTab('wall')} className="flex min-h-[32px] items-center gap-2 text-left text-[13.5px] text-gray-700">
              <span className="min-w-0 truncate"><b>{latest.firstName || 'Someone'}:</b> {latest.body}</span>
            </button>
          ) : null)}
          {confirming ? (
            <>
              <p className="text-center text-[15px] font-semibold">Are you done praying?</p>
              {!goalReached && <p className="-mt-1.5 text-center text-[13px] text-gray-500">{model.goalMinutes} minutes is suggested. You&apos;ve prayed {mmss(elapsed).replace(/^0(\d)/, '$1')}.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-full border border-gray-300 text-[15px] font-semibold text-gray-900 active:scale-[0.98] disabled:opacity-60">Keep praying</button>
                <button type="button" onClick={onAmen} disabled={busy} className="flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-full bg-[#0b1020] text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-60">
                  {busy ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" />Saving…</span> : 'Yes, Amen'}
                </button>
              </div>
            </>
          ) : (
            <>
              {amenOpen && !goalReached && <p className="text-center text-[13.5px] text-gray-700">You can say Amen now. <b>Stay for {model.goalMinutes} minutes if you can.</b></p>}
              <div className="flex gap-2">
                {wall && person && tab === 'prayer' && (
                  <button type="button" onClick={() => setTab('wall')} className="flex h-14 flex-none items-center rounded-full border border-gray-300 px-[18px] text-[15px] font-semibold text-gray-900">Reply</button>
                )}
                {amenOpen ? (
                  <button type="button" onClick={() => setConfirming(true)} disabled={busy} className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-full bg-[#0b1020] leading-tight text-white active:scale-[0.98] disabled:opacity-60">
                    <span className="text-[16px] font-bold">Amen</span>
                    <span className="text-[11.5px] font-semibold text-white/75">{model.goalMinutes} minutes suggested</span>
                  </button>
                ) : (
                  <div className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-full bg-gray-200 leading-tight text-gray-500" aria-live="off">
                    <span className="flex items-center gap-2 text-[15px] font-bold"><LockIcon />Amen opens in {mmss(amenOpensIn).replace(/^0(\d)/, '$1')}</span>
                    <span className="text-[11.5px] font-semibold">{model.goalMinutes} minutes suggested</span>
                  </div>
                )}
              </div>
            </>
          )}
          {/* Spoken once when Amen opens, not on every tick. */}
          <p className="sr-only" role="status">{amenOpen ? 'Amen is open.' : `Amen opens ${model.amenAfterMinutes} minutes after you start.`}</p>
        </div>
      </div>
      {embedded ? readAllSheet : readAllSheet && createPortal(readAllSheet, document.body)}
      {hiding && wall && <HideSheet post={hiding} embedded={embedded} onCancel={() => setHiding(null)} onHide={() => wall.onHide(hiding.id).then(() => setHiding(null))} />}
    </div>
  );
};

export default PrayerSlotScreen;
