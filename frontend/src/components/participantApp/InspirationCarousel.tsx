import { useEffect, useMemo, useRef, useState } from 'react';
import type { ParticipantHome } from '../../types';
import { scriptureDayIndex, scripturePosition } from '../../utils/participantApp';
import HomeSheet from './HomeSheet';
import ScriptureActions, { useScriptureLikes } from '../ScriptureActions';

// The daily Inspirational Scripture on the participant Home: today and the last few days move by themselves,
// five seconds each, with dots underneath. "See all" opens every earlier post, so Home stays short.

const SLIDE_MS = 5000;
const RECENT_DAYS = 5; // today plus the four before it
const SWIPE_MIN_PX = 40;
const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Post { day: number; imageUrl: string }

const InspirationCarousel: React.FC<{
  scriptures: ParticipantHome['scriptures'];
  /** The FOF day the first post shows on. */
  startDay: number;
  /** The cohort's first day; day N opens at 2:00 PM Lagos time. */
  cohortStartDate: string | null | undefined;
}> = ({ scriptures, startDay, cohortStartDate }) => {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [viewDay, setViewDay] = useState<number | null>(null);
  // True for a few seconds after the person touches Like, Download or Share, so the slide does not change under their finger.
  const [acting, setActing] = useState(false);
  const actingTimer = useRef<number | null>(null);
  useEffect(() => () => { if (actingTimer.current) window.clearTimeout(actingTimer.current); }, []);
  const onActing = () => { setActing(true); if (actingTimer.current) window.clearTimeout(actingTimer.current); actingTimer.current = window.setTimeout(() => setActing(false), 6000); };
  const { liked, toggle } = useScriptureLikes();
  const [dragPx, setDragPx] = useState(0);
  const dragStart = useRef<{ id: number; x: number } | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');

  const today = scripturePosition(scriptureDayIndex(cohortStartDate, new Date()), startDay, scriptures.length);
  // Newest first. Days with no image are left out.
  const posts = useMemo<Post[]>(() => {
    if (!today) return [];
    return scriptures
      .filter((entry) => entry.dayNumber >= 1 && entry.dayNumber <= today)
      .map((entry) => ({ day: entry.dayNumber, imageUrl: entry.imageUrl }))
      .sort((a, b) => b.day - a.day);
  }, [scriptures, today]);
  const recent = posts.slice(0, RECENT_DAYS);
  const viewPost = viewDay === null ? null : posts.find((post) => post.day === viewDay) ?? null;
  const count = recent.length;

  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // One timer per slide (not a polling loop): it re-arms whenever the slide changes, and stays off while the
  // person is touching the card, the "See all" sheet is open, the tab is hidden, or reduced motion is on.
  const paused = held || focused || acting || allOpen || viewDay !== null || hidden || count < 2;
  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { id: e.pointerId, x: e.clientX };
    setHeld(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (start && start.id === e.pointerId) setDragPx(e.clientX - start.x);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    setHeld(false);
    setDragPx(0);
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_MIN_PX) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <section data-wt="ph-scripture" onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }} className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <div className="flex items-center justify-between gap-2 pb-2">
        <h2 className="px-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Inspirational scripture</h2>
        <button type="button" onClick={() => setAllOpen(true)} className="-my-1.5 min-h-[32px] px-0.5 text-[12px] font-bold text-[#c2410c]">See all ›</button>
      </div>
      <div
        className="touch-pan-y overflow-hidden rounded-2xl bg-[#f6f7f9]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex"
          style={{ transform: `translateX(calc(${-index * 100}% + ${dragPx}px))`, transition: dragPx === 0 ? 'transform 380ms cubic-bezier(0.3, 0.7, 0.2, 1)' : 'none' }}
        >
          {recent.map((post, i) => (
            <div key={post.day} className="aspect-[4/5] w-full shrink-0">
              <img src={post.imageUrl} alt={`Inspirational scripture, ${post.day === today ? 'today' : `day ${post.day}`}`} draggable={false} className="h-full w-full object-cover" aria-hidden={i !== index} />
            </div>
          ))}
        </div>
      </div>
      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2.5" role="group" aria-label="Choose a post">
          {recent.map((post, i) => (
            <button
              key={post.day}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show post ${i + 1} of ${count}`}
              aria-current={i === index}
              className={`relative h-[7px] rounded-full transition-all before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] ${i === index ? 'w-5 bg-primary' : 'w-[7px] bg-[#e6cdb9]'}`}
            />
          ))}
        </div>
      )}
      {recent[index] && <div onPointerDown={onActing}><ScriptureActions day={recent[index].day} imageUrl={recent[index].imageUrl} liked={liked.has(recent[index].day)} onToggleLike={() => void toggle(recent[index].day)} /></div>}
      {allOpen && (
        <HomeSheet label="All inspirational posts" onClose={() => setAllOpen(false)}>
          <h2 className="pr-10 text-lg font-extrabold tracking-tight text-gray-900">All inspirational posts</h2>
          <p className="mb-3 text-[12.5px] text-gray-500">Newest first.</p>
          <div className="grid grid-cols-3 gap-2">
            {posts.map((post) => (
              <button type="button" key={post.day} onClick={() => setViewDay(post.day)} aria-label={`Open the post for day ${post.day}`} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gray-100 text-left">
                <img src={post.imageUrl} alt={`Inspirational scripture, ${post.day === today ? 'today' : `day ${post.day}`}`} loading="lazy" className="h-full w-full object-cover" />
                {/* The day, so a post is easy to find again in a long list. */}
                <span className="absolute left-1.5 top-1.5 rounded-full border border-white/50 bg-[rgba(20,24,40,0.5)] px-2 py-0.5 text-[10.5px] font-bold leading-tight text-white backdrop-blur-md">
                  {post.day === today ? `Today · Day ${post.day}` : `Day ${post.day}`}
                </span>
              </button>
            ))}
          </div>
        </HomeSheet>
      )}
      {viewPost && (
        <HomeSheet label={`Inspirational scripture, day ${viewPost.day}`} onClose={() => setViewDay(null)}>
          <h2 className="pr-10 text-lg font-extrabold tracking-tight text-gray-900">{viewPost.day === today ? `Today · Day ${viewPost.day}` : `Day ${viewPost.day}`}</h2>
          <img src={viewPost.imageUrl} alt={`Inspirational scripture, day ${viewPost.day}`} className="mt-2 w-full rounded-2xl bg-gray-100" />
          <ScriptureActions day={viewPost.day} imageUrl={viewPost.imageUrl} liked={liked.has(viewPost.day)} onToggleLike={() => void toggle(viewPost.day)} />
        </HomeSheet>
      )}
    </section>
  );
};

export default InspirationCarousel;
