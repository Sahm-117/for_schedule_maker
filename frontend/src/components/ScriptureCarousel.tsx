import React, { useEffect, useRef, useState } from 'react';
import type { ParticipantHome } from '../types';
import { scriptureDayIndex, scriptureForDay, scripturePosition } from '../utils/participantApp';

// The daily Inspirational Scripture: one image a day, swipe or tap the arrows to look back at earlier days.
// Shared by the participant Home and the support Home, so both see the same thing.

const SLIDE_MS = 320;
const RESISTANCE = 0.3; // how much a drag past the first/last post is damped
const MAX_RESISTANCE_PX = 56;
const FLICK_MIN_PX = 24;
const FLICK_VELOCITY = 0.5; // px/ms
const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface ScriptureCarouselProps {
  scriptures: ParticipantHome['scriptures'];
  /** The FOF day the first post shows on. */
  startDay: number;
  /** The cohort's first day; day N opens at 2:00 PM Lagos time. */
  cohortStartDate: string | null | undefined;
}

const ScriptureCarousel: React.FC<ScriptureCarouselProps> = ({ scriptures, startDay, cohortStartDate }) => {
  const [scriptureDay, setScriptureDay] = useState<number | null>(null);
  // Live drag offset (px) while swiping, or the animated value while settling/springing back.
  const [scriptureDragPx, setScriptureDragPx] = useState(0);
  const [scriptureAnimating, setScriptureAnimating] = useState(false);
  const scriptureTrackRef = useRef<HTMLDivElement>(null);
  const scriptureDrag = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);

  const now = new Date();
  const todayFofDay = scriptureDayIndex(cohortStartDate, now);
  const todayScriptureDay = scripturePosition(todayFofDay, startDay, scriptures.length);

  useEffect(() => {
    setScriptureDay(todayScriptureDay);
  }, [todayScriptureDay]);

  const scripture = scriptureDay ? scriptureForDay(scriptures, scriptureDay) : null;
  const prevScripture = scriptureDay && scriptureDay > 1 ? scriptureForDay(scriptures, scriptureDay - 1) : null;
  const canGoPrev = !!scriptureDay && scriptureDay > 1;
  const canGoNext = !!scriptureDay && !!todayScriptureDay && scriptureDay < todayScriptureDay;
  const nextScripture = canGoNext && scriptureDay ? scriptureForDay(scriptures, scriptureDay + 1) : null;
  const firstDotDay = todayScriptureDay ? Math.max(1, todayScriptureDay - 5) : 1;

  // Slides the track to the next/previous post with an eased transition (arrow
  // buttons and a released drag past the threshold both land here); direction 0
  // just eases the current drag back to centre without changing the post.
  const settleScripture = (direction: 1 | -1 | 0) => {
    const reduced = prefersReducedMotion();
    if (direction === 0) {
      setScriptureDragPx(0);
      if (!reduced) { setScriptureAnimating(true); window.setTimeout(() => setScriptureAnimating(false), SLIDE_MS); }
      return;
    }
    const width = scriptureTrackRef.current?.offsetWidth || 0;
    const advance = () => setScriptureDay((day) => Math.max(1, Math.min(todayScriptureDay ?? 1, (day ?? 1) + direction)));
    if (reduced) { advance(); setScriptureDragPx(0); return; }
    setScriptureAnimating(true);
    setScriptureDragPx(direction === 1 ? -width : width);
    window.setTimeout(() => {
      advance();
      setScriptureDragPx(0);
      setScriptureAnimating(false);
    }, SLIDE_MS);
  };

  const onScripturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scriptureAnimating) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scriptureDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };

  const onScripturePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scriptureDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    let dx = event.clientX - drag.x;
    // Rubber-band resistance: can't drag past the first or last post.
    if ((dx < 0 && !canGoNext) || (dx > 0 && !canGoPrev)) {
      dx = Math.max(-MAX_RESISTANCE_PX, Math.min(MAX_RESISTANCE_PX, dx * RESISTANCE));
    }
    setScriptureDragPx(dx);
  };

  const endScriptureDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scriptureDrag.current;
    scriptureDrag.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dt = Math.max(1, performance.now() - drag.time);
    const width = scriptureTrackRef.current?.offsetWidth || 1;
    const velocity = Math.abs(dx) / dt;
    const pastThreshold = Math.abs(dx) > width * 0.25 || (Math.abs(dx) > FLICK_MIN_PX && velocity > FLICK_VELOCITY);
    const direction: 1 | -1 | 0 = dx < 0 && canGoNext && pastThreshold ? 1 : dx > 0 && canGoPrev && pastThreshold ? -1 : 0;
    settleScripture(direction);
  };

  if (!scripture || !todayScriptureDay || !scriptureDay) return null;
  return (
      <section data-wt="ph-scripture" className="overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-[18px]">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-gray-900">Inspirational Scriptures</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">{scriptureDay === todayScriptureDay ? 'Today' : `Day ${scriptureDay}`}</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            <button type="button" aria-label="Previous scripture" onClick={() => settleScripture(-1)} disabled={!canGoPrev || scriptureAnimating} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8249;</button>
            <button type="button" aria-label="Next scripture" onClick={() => settleScripture(1)} disabled={!canGoNext || scriptureAnimating} className="h-[38px] w-[38px] rounded-[10px] border border-gray-200 bg-white text-[15px] text-gray-700 disabled:bg-[#f6f7f9] disabled:text-gray-300">&#8250;</button>
          </div>
        </div>
        <div className="px-5 pb-4">
          <div
            ref={scriptureTrackRef}
            className="aspect-[4/5] w-full touch-pan-y overflow-hidden rounded-2xl bg-[#f6f7f9]"
            onPointerDown={onScripturePointerDown}
            onPointerMove={onScripturePointerMove}
            onPointerUp={endScriptureDrag}
            onPointerCancel={endScriptureDrag}
          >
            <div
              className="flex h-full"
              style={{
                transform: `translateX(calc(-100% + ${scriptureDragPx}px))`,
                transition: scriptureAnimating ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
              }}
            >
              <img src={(prevScripture || scripture).imageUrl} alt="" aria-hidden="true" draggable={false} className="h-full w-full shrink-0 object-cover" />
              <img src={scripture.imageUrl} alt={`Inspirational scripture, ${scriptureDay === todayScriptureDay ? 'today' : `day ${scriptureDay}`}. Swipe left or right to change post.`} draggable={false} className="h-full w-full shrink-0 object-cover" />
              <img src={(nextScripture || scripture).imageUrl} alt="" aria-hidden="true" draggable={false} className="h-full w-full shrink-0 object-cover" />
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-[5px]" aria-hidden="true">
            {Array.from({ length: todayScriptureDay - firstDotDay + 1 }, (_, i) => firstDotDay + i).map((day) => (
              <span key={day} className={`h-1.5 w-1.5 rounded-full ${day === scriptureDay ? 'bg-primary' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </section>
    );
};

export default ScriptureCarousel;
