import React, { useEffect, useRef, useState } from 'react';
import PrayerNowBanner from '../components/corporatePrayers/PrayerNowBanner';
import { StreakChip } from '../components/corporatePrayers/PrayerStreakParts';
import { usePrayerStreak } from '../hooks/usePrayerStreak';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import InspirationCarousel from '../components/participantApp/InspirationCarousel';
import LinkText from '../components/LinkText';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import AttendanceCountdownCard from '../components/participantApp/AttendanceCountdownCard';
import ConfettiBurst from '../components/participantApp/ConfettiBurst';
import VenueMapModal from '../components/participantApp/VenueMapModal';
import ReadyGraphicSheet from '../components/participantApp/ReadyGraphicSheet';
import { cohortLabel } from '../utils/readyGraphic';
import ThisWeekCard from '../components/participantApp/ThisWeekCard';
import Spinner from '../components/Spinner';
import ClassManualReader from '../components/classManual/ClassManualReader';
import { useManualContent } from '../components/classManual/manuals';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi, practiceApi } from '../services/api';
import type { OnboardingState } from '../types';
import { useToast } from '../components/Toast';
import AppSetupBanner from '../components/participantApp/AppSetupBanner';
import { useShellHelp } from '../components/shellHelp';
import { useParticipantPush } from '../hooks/useParticipantPush';
import { buildWhatsAppLink } from '../utils/phone';
import PendingSurveyCards from '../components/surveys/PendingSurveyCards';
import { normalizeLink } from '../utils/links';
import { JOIN_LEAD_MINUTES, isCallJoinable } from '../utils/joinWindow';
import {
  FAITH_PROJECT_STATUS_LABEL,
  currentWeekNumber,
  formatTime,
  reflectionFor,
  titleCaseDay,
  weekDayDate,
} from '../utils/participantApp';

// Participant Home: where they are in FOF, this week's class and call, their goal,
// today's scripture and what's expected this week. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

// Icons for the Home quick-action tiles (always exactly four, none repeating
// the mobile bottom bar's Home/My Group/Journey/Faith Project).
const ICON_CALL = 'M15 10.5 21 7v10l-6-3.5ZM3 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z';
const ICON_MESSAGE = 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.284 0-2.503-.24-3.605-.671L3 20l1.395-4.865A7.933 7.933 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z';
const ICON_RESOURCES = 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z';
const ICON_FEEDBACK = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';

const confettiKey = (participantId: string) => `fof_ready_confetti_${participantId}`;

const formatDateLabel = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const ParticipantHomePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, error, reload, applyReflection } = useParticipantApp();
  const toast = useToast();
  const push = useParticipantPush();
  const navigate = useNavigate();
  const openHelp = useShellHelp();
  const [goalSaving, setGoalSaving] = useState(false);
  const { streak } = usePrayerStreak();
  const [introOpen, setIntroOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Above the early returns below, so every render calls the same hooks.
  const [tickingIntro, setTickingIntro] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  // Once attended the list is gone for good, so stop re-reading the state on every focus.
  const attendedRef = useRef(false);
  attendedRef.current = !!onboarding?.hasAttended;
  const [confirming, setConfirming] = useState(false);
  // Practice cohorts are always "completed" on paper, but a practice participant still walks the Get ready list.
  const [isPractice, setIsPractice] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const now = new Date();
  const firstName = (user?.name || '').split(' ')[0];

  // Intro Class reader for the pre-start Get ready list (week 1's class).
  const introManual = useManualContent(home?.weeks.find((w) => w.weekNumber === 1)?.title);

  // The four Get ready steps, kept on the server (the 7pm reminder reads them too).
  const readyId = home?.participant.id;
  // The Get ready list stays until their first attendance is marked, so absent people keep it after the cohort starts.
  const readyPreStart = !!home && (isPractice || home.cohort?.status !== 'COMPLETED');
  useEffect(() => {
    if (!readyId) return;
    let cancelled = false;
    practiceApi.getForParticipant().then((p) => { if (!cancelled) setIsPractice(!!p?.practice); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [readyId]);
  useEffect(() => {
    if (!readyId || !readyPreStart) return;
    let cancelled = false;
    const load = () => {
      participantAppApi.getOnboardingState()
        .then((state) => { if (!cancelled) setOnboarding(state); })
        .catch(() => { /* ignore */ });
    };
    load();
    // Marked present while the app sits open: pick it up when they come back to it.
    const onVisible = () => { if (document.visibilityState === 'visible' && !attendedRef.current) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [readyId, readyPreStart]);

  // Arrived from a practice "Go there" link: bring the Get ready card into view.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsReady = searchParams.get('ready') === '1';
  const readyScrolled = useRef(false);
  const onboardingLoaded = !!onboarding;
  useEffect(() => {
    if (!wantsReady || !onboardingLoaded || readyScrolled.current) return;
    readyScrolled.current = true;
    window.setTimeout(() => document.querySelector('[data-wt="ph-get-ready"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, [wantsReady, onboardingLoaded]);

  // A "view the venue map" notification opens /me?map=1. Wait briefly for the person's own state so the tick starts right,
  // but open the map anyway if that state is slow or never arrives. The flag is then dropped so a refresh does not reopen it.
  // (Kept above the early returns below: hooks must run on every render.)
  const [mapWaited, setMapWaited] = useState(false);
  const wantsMap = searchParams.get('map') === '1';
  useEffect(() => {
    if (!wantsMap || loading) return undefined;
    const timer = window.setTimeout(() => setMapWaited(true), 2500);
    return () => window.clearTimeout(timer);
  }, [wantsMap, loading]);
  useEffect(() => {
    if (!wantsMap || loading || !(onboarding || mapWaited)) return;
    setMapOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('map');
    setSearchParams(next, { replace: true });
  }, [wantsMap, loading, onboarding, mapWaited, searchParams, setSearchParams]);

  if (loading) {
    return <PageLoader label="Loading your FOF space…" />;
  }
  if (error || !home) {
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-sm text-gray-600">{error || 'Could not load your FOF space.'}</p>
        <button type="button" onClick={() => { void reload(); }} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    );
  }

  const totalWeeks = home.weeks.length;
  const weekNumber = currentWeekNumber(home.cohort?.startDate, now, home.weeks);
  const started = weekNumber >= 1;
  const finished = totalWeeks > 0 && weekNumber > totalWeeks;
  const shownWeekNumber = Math.min(Math.max(weekNumber, 1), Math.max(totalWeeks, 1));
  const week = home.weeks.find((w) => w.weekNumber === shownWeekNumber) ?? null;
  const reflection = week ? reflectionFor(home.reflections, week.id) : null;

  // The Get ready and Still to do lists already carry "Finish your profile"; this row covers every other time.
  const profileListShown = readyPreStart && (!onboarding || !onboarding.hasAttended || !onboarding.profileComplete);
  const showProfileRow = home.profileCompletion.percent < 100 && !profileListShown;
  const group = home.group;
  const callSet = !!(group?.meetingDay && group.meetingTime);
  const groupCallLink = normalizeLink(group?.callLink?.trim() || '') || null;
  const supportWaLink = buildWhatsAppLink(group?.supportPhone, `Hi ${(group?.supportName || 'there').split(' ')[0]}, it's ${home.participant.name.split(' ')[0]} from FOF.`);

  const quickTiles: Array<{ key: string; label: string; icon: string; to?: string; href?: string; onClick?: () => void; disabled?: boolean; hint?: string; avatarName?: string; avatarUrl?: string | null }> = [
    // Nothing to join until the support shares the group's call link.
    groupCallLink && (!callSet || isCallJoinable(group?.meetingDay, group?.meetingTime, now, !!home.groupMeetingLive))
      ? { key: 'call', label: 'Join call', icon: ICON_CALL, href: groupCallLink }
      : { key: 'call', label: 'Join call', icon: ICON_CALL, disabled: true, hint: groupCallLink ? `Opens ${JOIN_LEAD_MINUTES} min before` : undefined },
    // No support to message yet (not placed, or no number for them): the tile opens Help instead.
    !supportWaLink && openHelp
      ? { key: 'message-support', label: 'Get help', icon: ICON_MESSAGE, onClick: openHelp }
      : supportWaLink
      ? { key: 'message-support', label: 'Message support', icon: ICON_MESSAGE, href: supportWaLink, avatarName: group?.supportName ?? 'Support', avatarUrl: group?.supportAvatarUrl }
      : { key: 'message-support', label: 'Message support', icon: ICON_MESSAGE, to: '/me/group', avatarName: group?.supportName ?? 'Support', avatarUrl: group?.supportAvatarUrl },
    { key: 'resources', label: 'Resources', icon: ICON_RESOURCES, to: '/me/resources' },
    { key: 'feedback', label: 'Feedback', icon: ICON_FEEDBACK, to: '/me/feedback' },
  ];

  // Before the first class: a short "Get ready" list that ticks itself off. The
  // photo step only shows while they have no photo.
  const preStart = !started && home.cohort?.status !== 'COMPLETED';
  const faithStarted = !!home.faithProjectStatus && home.faithProjectStatus !== 'NOT_DRAFTED';
  const openIntro = () => {
    setIntroOpen(true);
    if (onboarding && !onboarding.introGuideRead) setOnboarding({ ...onboarding, introGuideRead: true });
    void Promise.resolve(participantAppApi.markIntroGuideRead()).catch(() => { /* ignore */ });
  };
  // The intro opens once the support has introduced themselves, so until then say what it waits on.
  const introWaitingSub = group ? 'Waiting for your support to start introductions' : 'Opens once you’re in a group';
  const readyItems: Array<{ key: string; label: string; sub?: string; to?: string; onClick?: () => void; done: boolean }> = onboarding ? [
    {
      key: 'introduce',
      label: 'Introduce yourself',
      sub: onboarding.introPosted || onboarding.supportIntroPosted ? undefined : introWaitingSub,
      to: onboarding.supportIntroPosted || onboarding.introPosted ? '/me/group?tab=discussion&intro=1' : undefined,
      done: onboarding.introPosted,
    },
    { key: 'map', label: 'Check the venue map', sub: 'See how to get to the New VIP Lounge after first service', onClick: () => setMapOpen(true), done: !!onboarding.venueMapAcknowledged },
    { key: 'guide', label: 'Read the Intro Class guide', onClick: introManual ? openIntro : undefined, sub: introManual ? undefined : 'Not available yet', done: onboarding.introGuideRead },
    {
      key: 'profile',
      label: 'Finish your profile',
      sub: onboarding.profileComplete ? undefined : `${onboarding.profileMissing} ${onboarding.profileMissing === 1 ? 'thing' : 'things'} left`,
      to: '/me/profile',
      done: onboarding.profileComplete,
    },
  ] : [];
  const readyDone = readyItems.filter((item) => item.done).length;
  const allDone = readyItems.length > 0 && readyDone === readyItems.length;
  // Why "I have all I need" is still locked: say what is left, and when a step cannot be done yet, what it waits on.
  const readyLeft = readyItems.filter((item) => !item.done);
  const readyLockedNote = allDone ? null
    : readyLeft.length === 1 && readyLeft[0].key === 'introduce' && !onboarding?.supportIntroPosted
      ? group
        ? 'Almost there. This unlocks once you’ve introduced yourself, after your support says hello in My Group.'
        : 'Almost there. This unlocks once you’re in a group and have introduced yourself.'
      : readyLeft.some((item) => !item.onClick && !item.to)
        ? 'Some steps above open later. This unlocks once every step is ticked.'
        : 'Tick the steps above first.';
  // The readiness badge is earned when every step is ticked and readiness is confirmed; it stays after the Get ready card is gone.
  const badgeName = `${cohortLabel(home.cohort?.name)} Readiness Badge`;
  const badgeEarned = !!onboarding && allDone && (onboarding.readyConfirmed || onboarding.completed);

  // After the first class a participant can tick "Introduce yourself" by hand, once their support has introduced themselves.
  const tickIntro = async () => {
    setTickingIntro(true);
    try {
      await participantAppApi.tickIntro();
      setOnboarding((o) => (o ? { ...o, introPosted: true, introTicked: true } : o));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save your step.', tone: 'error' });
    } finally {
      setTickingIntro(false);
    }
  };

  const acknowledgeMap = async () => {
    await participantAppApi.ackVenueMap();
    setOnboarding((o) => (o ? { ...o, venueMapAcknowledged: true } : o));
  };

  const confirmReady = async () => {
    setConfirming(true);
    try {
      const next = await participantAppApi.confirmReady();
      setOnboarding(next);
      let seen = false;
      try { seen = localStorage.getItem(confettiKey(home.participant.id)) === '1'; } catch { /* ignore */ }
      if (!seen) {
        setConfetti(true);
        try { localStorage.setItem(confettiKey(home.participant.id), '1'); } catch { /* ignore */ }
      }
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save your step.', tone: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  // Whole Lagos calendar days until the first class.
  const firstClassDate = home.cohort?.startDate
    ? weekDayDate(home.cohort.startDate, home.weeks.find((w) => w.weekNumber === 1) ?? 1, 0)
    : null;
  const toggleGoalDone = async () => {
    if (!week || !reflection) return;
    setGoalSaving(true);
    try {
      applyReflection(await participantAppApi.setGoalDone(week.id, !reflection.goalDoneAt));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not update your goal.', tone: 'error' });
    } finally {
      setGoalSaving(false);
    }
  };

  const expectations = (week?.expectations || '').split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <div>
      <PageHeader
        title={`${started ? 'Welcome back' : 'Welcome'}, ${firstName}`}
        tourId="participant:home"
      />

      <div className="flex flex-col gap-4 desktop-cols">
        <AppSetupBanner enable={push.enable} />
        <PrayerNowBanner to="/me/pray" />
        {home.groupMeetingLive && (
          // Tapping the banner opens the meeting on My Group; Join still goes
          // straight to the call link.
          <section
            role="link"
            tabIndex={0}
            onClick={() => navigate('/me/group')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/me/group'); } }}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] bg-emerald-100/80 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <span className="relative flex h-2 w-2 flex-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Your group meeting is on now
            </span>
            {groupCallLink ? (
              <a href={groupCallLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex-none rounded-xl bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Join</a>
            ) : (
              <span className="flex-none rounded-xl bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Open</span>
            )}
          </section>
        )}
        <AttendanceCountdownCard openWindow={home.openWindow} />
        {/* Get ready sits above the cards and tiles: it is what to do before the first class. */}
        {(isPractice || (readyPreStart && onboarding && !onboarding.hasAttended)) && (
          <section data-wt="ph-get-ready" className={CARD}>
            {!onboarding ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : onboarding.readyConfirmed || onboarding.completed ? (
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 12 5 5L20 7" /></svg>
                </span>
                <h2 className="text-lg font-bold text-gray-900">You're ready for class</h2>
              </div>
            ) : (
              <>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-gray-900">Get ready</h2>
              <span className="ml-auto text-xs font-semibold text-gray-500">{readyDone} of {readyItems.length} done</span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {readyItems.map((item) => {
                const tappable = !!(item.onClick || item.to);
                const rowClass = `flex min-h-[48px] w-full items-center gap-3 rounded-[14px] border border-[#f1f2f5] px-3.5 py-3 text-left ${tappable ? 'hover:border-[#ffdeca]' : 'opacity-70'}`;
                const row = (
                  <>
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${item.done ? 'bg-emerald-500 text-white' : 'border-2 border-gray-300'}`} aria-hidden="true">
                    {item.done && <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 12 5 5L20 7" /></svg>}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.label}</span>
                    {item.sub && !item.done && <span className="block text-xs text-gray-500">{item.sub}</span>}
                  </span>
                  <span className="sr-only">{item.done ? '(done)' : ''}</span>
                  {tappable && <span className="ml-auto text-gray-300" aria-hidden="true">&#8250;</span>}
                  </>
                );
                if (item.onClick) return <button key={item.key} type="button" onClick={item.onClick} className={rowClass}>{row}</button>;
                if (item.to) return <NavLink key={item.key} to={item.to} className={rowClass}>{row}</NavLink>;
                return <div key={item.key} className={rowClass}>{row}</div>;
              })}
              <button
                type="button"
                onClick={() => void confirmReady()}
                disabled={!allDone || confirming}
                className="mt-1 flex min-h-[48px] w-full items-center gap-3 rounded-[14px] bg-primary px-3.5 py-3 text-left text-sm font-semibold text-white disabled:bg-gray-100 disabled:text-gray-400"
              >
                {confirming ? <Spinner className="h-4 w-4" /> : <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-current" aria-hidden="true" />}
                <span>I have all I need to be ready for class{firstClassDate ? ` on ${formatDateLabel(firstClassDate)}` : ''}</span>
              </button>
              {readyLockedNote && <p data-wt="ph-ready-locked" className="-mt-0.5 px-1 text-xs text-gray-500">{readyLockedNote}</p>}
              <div className="mt-1 flex min-h-[56px] items-center gap-3 rounded-[16px] border border-dashed border-[#ecd6c6] bg-[#fffaf6] px-3.5 py-3" aria-label="The readiness badge unlocks when every step is ticked">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#f3e6dc] text-[#b79a85]"><svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z" /></svg></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#8a6a55]">{badgeName} waits at the end</span>
                  <span className="block text-xs text-[#a58b78]">Tick every step above to earn it, with your photo on it</span>
                </span>
              </div>
            </div>
              </>
            )}
          </section>
        )}

        {!isPractice && readyPreStart && onboarding?.hasAttended && (!onboarding.introPosted || !onboarding.profileComplete) && (() => {
          // After their first class the map, the guide and "ready for class" go; only an unposted intro
          // and an unfinished profile are still asked for.
          const rows = [
            !onboarding.introPosted && {
              key: 'intro',
              label: 'Introduce yourself',
              sub: onboarding.supportIntroPosted ? 'Say hello to your group' : introWaitingSub,
              to: onboarding.supportIntroPosted ? '/me/group?tab=discussion&intro=1' : null,
              icon: 'M8 10h8M8 14h5m-9 6 3-3h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14Z',
            },
            !onboarding.profileComplete && {
              key: 'profile',
              label: 'Finish your profile',
              sub: `${onboarding.profileMissing} ${onboarding.profileMissing === 1 ? 'thing' : 'things'} left`,
              to: '/me/profile',
              icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
            },
          ].filter(Boolean) as Array<{ key: string; label: string; sub: string; to: string | null; icon: string }>;
          return (
            <section data-wt="ph-still-to-do" className="flex flex-col overflow-hidden rounded-[18px] border border-[#ffdeca] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
              {rows.map((row) => {
                const inner = (
                  <>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={row.icon} /></svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold text-gray-900">{row.label}</span>
                      <span className="block text-xs text-gray-500">{row.sub}</span>
                    </span>
                    {row.to && row.key !== 'intro' && <span className="ml-auto text-gray-300" aria-hidden="true">&#8250;</span>}
                  </>
                );
                const cls = 'flex min-h-[56px] items-center gap-3 border-t border-[#f4f5f7] px-4 py-3 first:border-t-0';
                if (row.key === 'intro' && row.to) {
                  // Post the intro, or tick it if they have already introduced themselves another way.
                  return (
                    <div key={row.key} data-wt="ph-todo-intro" className="flex items-center gap-2 border-t border-[#f4f5f7] pr-3 first:border-t-0">
                      <NavLink to={row.to} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-3">{inner}</NavLink>
                      <button
                        type="button"
                        onClick={() => { void tickIntro(); }}
                        disabled={tickingIntro}
                        aria-label="I have introduced myself"
                        title="I have introduced myself"
                        className="grid h-11 w-11 flex-none place-items-center rounded-full border-2 border-gray-300 text-gray-400 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50"
                      >
                        {tickingIntro ? <Spinner className="h-4 w-4" /> : <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m5 12 5 5L20 7" /></svg>}
                      </button>
                    </div>
                  );
                }
                return row.to
                  ? <NavLink key={row.key} to={row.to} data-wt={`ph-todo-${row.key}`} className={cls}>{inner}</NavLink>
                  : <div key={row.key} data-wt={`ph-todo-${row.key}`} className={`${cls} opacity-70`}>{inner}</div>;
              })}
            </section>
          );
        })()}

        {week && !finished && <ThisWeekCard home={home} week={week} label={started ? undefined : 'First class'} canReflect={!isPractice || !!onboarding?.readyConfirmed || !!onboarding?.completed} />}

        {showProfileRow && (
          <NavLink to="/me/profile" data-wt="ph-todo-profile" className="flex min-h-[60px] items-center gap-3 rounded-[20px] border border-[#eef0f4] bg-white px-[18px] py-2 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-gray-900">Finish your profile</span>
              <span className="block text-[13px] text-gray-500">{home.profileCompletion.missing} {home.profileCompletion.missing === 1 ? 'thing' : 'things'} left</span>
            </span>
            <span className="text-gray-300" aria-hidden="true">&#8250;</span>
          </NavLink>
        )}

        {week && reflection?.goal ? (
          <section className="rounded-[22px] border border-[#ffdeca] bg-[#fff8f3] p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Your goal this week</span>
              <NavLink to={`/me/week/${week.weekNumber}`} className="ml-auto text-[12.5px] font-bold text-[#c2410c]">Edit</NavLink>
            </div>
            <p className="mt-2 text-base font-semibold leading-[1.45] text-gray-900">{reflection.goal}</p>
            {reflection.goalCheck && (
              <p className="mt-1.5 text-[13px] leading-normal text-gray-500">You will know when: {reflection.goalCheck}</p>
            )}
            <button
              type="button"
              onClick={() => { void toggleGoalDone(); }}
              disabled={goalSaving}
              className={`mt-3.5 min-h-[46px] w-full rounded-xl p-3 text-sm font-semibold disabled:opacity-60 ${reflection.goalDoneAt ? 'border border-[#bbf7d0] bg-[#f2fbf5] text-[#15803d]' : 'border border-[#ffdeca] bg-white text-[#c2410c]'}`}
            >
              {reflection.goalDoneAt ? 'Done ✓' : 'I did it'}
            </button>
          </section>
        ) : null}

        <InspirationCarousel scriptures={home.scriptures} startDay={home.scriptureStartDay} cohortStartDate={home.cohort?.startDate} />

        <section data-wt="ph-call" className="overflow-hidden rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
          <div className="flex min-h-[68px] items-center gap-3 px-[18px] py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-gray-500">Group call</p>
              <p className="text-[16px] font-extrabold text-gray-900">{callSet ? `${titleCaseDay(group!.meetingDay)}, ${formatTime(group!.meetingTime)}` : group ? 'Not set yet' : 'After you’re placed in a group'}</p>
              {!group ? <p className="text-xs text-gray-500">Your support will share the day, time and link</p>
                : preStart && !groupCallLink && <p className="text-xs text-gray-500">Your support will share the link</p>}
            </div>
          </div>
          <NavLink to="/me/faith" className="flex min-h-[68px] items-center gap-3 border-t border-[#f1f2f5] px-[18px] py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-gray-500">Faith Project</p>
              <p className="text-[16px] font-extrabold text-gray-900">{FAITH_PROJECT_STATUS_LABEL[home.faithProjectStatus ?? 'NOT_DRAFTED']}</p>
              {streak?.available && (streak.current ?? 0) > 0 && <div className="mt-1.5"><StreakChip current={streak.current ?? 0} /></div>}
            </div>
            <span className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">{faithStarted ? 'Open' : 'Write it'}</span>
          </NavLink>
        </section>

        {home.announcement && (
          <section className="rounded-[18px] border border-[#ffdeca] bg-[#fff8f3] px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#c2410c]">{home.announcement.homeLabel || 'From the FOF team'}</p>
            <p className="mt-1.5 text-[15px] font-bold text-gray-900">{home.announcement.subject}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-600"><LinkText text={home.announcement.body} /></p>
            {home.announcement.linkUrl && (/^https?:\/\//i.test(home.announcement.linkUrl) ? (
              <a href={home.announcement.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-white">
                {home.announcement.linkLabel || 'Open'}
              </a>
            ) : (
              <NavLink to={home.announcement.linkUrl} className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-white">
                {home.announcement.linkLabel || 'Open'}
              </NavLink>
            ))}
          </section>
        )}

        <PendingSurveyCards base="/me/survey" />

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {quickTiles.map((tile) => {
            const content = (
              <>
                {tile.avatarUrl ? (
                  <Avatar name={tile.avatarName ?? tile.label} avatarUrl={tile.avatarUrl} size="md" enlargeable />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={tile.icon} /></svg>
                  </span>
                )}
                <span className="text-center text-[13px] font-semibold leading-snug text-gray-800">{tile.label}</span>
                {tile.hint && <span className="-mt-1.5 text-center text-[11px] leading-tight text-gray-500">{tile.hint}</span>}
              </>
            );
            if (tile.disabled) {
              return (
                <div key={tile.key} aria-disabled="true" className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 opacity-50">
                  {content}
                </div>
              );
            }
            if (tile.onClick) {
              return (
                <button key={tile.key} type="button" onClick={tile.onClick} className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
                  {content}
                </button>
              );
            }
            return tile.href ? (
              <a key={tile.key} href={tile.href} target="_blank" rel="noreferrer" className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
                {content}
              </a>
            ) : (
              <NavLink key={tile.key} to={tile.to ?? '/me'} className="relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-2 py-4 hover:border-[#ffdeca]">
                {content}
              </NavLink>
            );
          })}
        </div>

        {badgeEarned && (
          <button type="button" data-wt="ph-badge" onClick={() => setGiftOpen(true)} className="flex min-h-[64px] w-full items-center gap-3 rounded-[22px] border border-[#ffdeca] bg-gradient-to-br from-[#fff1e6] to-[#ffe0cc] px-4 py-3.5 text-left shadow-[0_6px_18px_-10px_rgba(194,65,12,0.5)]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-white"><svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z" /></svg></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#9a4a12]">Your {badgeName} is ready</span>
              <span className="block text-xs text-[#9a6a4b]">Make your badge picture and share it</span>
            </span>
            <span className="ml-auto text-[#c2410c]" aria-hidden="true">&#8250;</span>
          </button>
        )}


        {week && started && !finished && (
          <section data-wt="ph-week" className={CARD}>
            <h2 className="text-lg font-bold text-gray-900">This week</h2>
            {expectations.length > 0 ? (
              <div className="mt-3.5">
                <p className="text-[13px] font-semibold text-gray-600">What&apos;s expected</p>
                <ul className="mt-2 list-disc pl-[18px] text-sm leading-[1.7] text-gray-700">
                  {expectations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">{week.title ? `${week.title}: ` : ''}the recap and your reflection.</p>
            )}
            <NavLink to={`/me/week/${week.weekNumber}`} className="mt-3.5 inline-block text-[13px] font-semibold text-[#c2410c]">See more →</NavLink>
          </section>
        )}
      </div>
      {confetti && <ConfettiBurst onDone={() => setConfetti(false)} />}
      {giftOpen && <ReadyGraphicSheet badgeName={badgeName} name={home.participant.name} photoUrl={home.profile.avatarUrl} cohortName={home.cohort?.name} onClose={() => setGiftOpen(false)} />}
      {mapOpen && <VenueMapModal acknowledged={!!onboarding?.venueMapAcknowledged} onAcknowledge={acknowledgeMap} onClose={() => setMapOpen(false)} />}
      {introOpen && introManual && <ClassManualReader content={introManual} onClose={() => setIntroOpen(false)} />}
    </div>
  );
};

export default ParticipantHomePage;
