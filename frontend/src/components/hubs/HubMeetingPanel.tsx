import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from '../AppSelect';
import CompactAttendanceRow from '../CompactAttendanceRow';
import DocumentViewerSheet from '../DocumentViewerSheet';
import SaveStatus, { type SaveState } from '../SaveStatus';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import { myHubApi, supportSessionsApi } from '../../services/api';
import type { HubMessage, HubPrayerFocus, HubPrayerListItem, MyHubMember, SupportAttendanceStatus, SupportRecap, Week } from '../../types';

const STEPS = ['Attendance', 'Prayer', 'Review & Recap', 'Announcements', 'Notes', 'Submit'];
const DONE_STEP = STEPS.length;
const PRAYER_STEP = 1;
const RECAP_STEP = 2;

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const TEXTAREA = 'w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const STATUS_OPTIONS: Array<{ value: SupportAttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'EXCUSED', label: 'Excused' },
];

interface HubMeetingPanelProps {
  hubId: string;
  members: MyHubMember[];
  weeks: Week[];
  weekId: number | null;
  onWeekChange: (weekId: number) => void;
  /** Weeks whose meeting is already submitted, so the picker can tick them. */
  submittedWeekIds?: number[];
  hubLeadName?: string | null;
  recapLeadName?: string | null;
  prayerLeadName?: string | null;
  prayerItems: HubPrayerListItem[];
  recaps: SupportRecap[];
  messages: HubMessage[];
  canReopen: boolean;
  /** Hub lead, or assistant with ATTENDANCE permission: the full walk-through. */
  canAttendance: boolean;
  /** Recap lead without lead/assistant rights: Review & Recap only, no Submit. */
  isRecapLead: boolean;
  /** Prayer lead without lead/assistant rights: Prayer only, can set the focus. */
  isPrayerLead: boolean;
  onSubmit: (weekId: number, notes: string) => Promise<void>;
  onReopen: (weekId: number) => Promise<void>;
}

type HubMeetingSession = { id: string; notes: string | null; submittedAt: string | null };

const EMPTY_FOCUS: HubPrayerFocus = { faithProjectId: null, participantName: null, groupName: null, projectText: null, setAt: null, prayedForIds: [], hubPrayerDone: false, prayerFinished: false };

// Rotates prayer fairly: people prayed for least (and longest ago) first;
// anyone already prayed for THIS week sinks to the bottom with a checkmark.
const sortPrayerItems = (items: HubPrayerListItem[], prayedThisWeekIds: string[]) => {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aDone = prayedThisWeekIds.includes(a.faithProjectId);
    const bDone = prayedThisWeekIds.includes(b.faithProjectId);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.timesPrayedFor !== b.timesPrayedFor) return a.timesPrayedFor - b.timesPrayedFor;
    return (a.lastPrayedWeek ?? -Infinity) - (b.lastPrayedWeek ?? -Infinity);
  });
  return sorted;
};

const prayerTallyLabel = (item: HubPrayerListItem) =>
  item.timesPrayedFor > 0 ? `Prayed for ${item.timesPrayedFor}× · last Week ${item.lastPrayedWeek}` : 'Not prayed for yet';

// Small pulsing dot + label — the one visual cue that the prayer focus is
// live across everyone's screen right now.
const LiveDot: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
    <span className="relative flex h-2 w-2 flex-none">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
    {label}
  </span>
);

// Follow-along mode's whole prayer section: a big centred "Now praying for"
// card. Live: set by the lead/assistant or the prayer lead, broadcast to
// every open Hub meeting tab (see the realtime effect below for why a
// broadcast channel, not postgres_changes).
const FollowAlongPrayerCard: React.FC<{ focus: HubPrayerFocus; prayerLeadName?: string | null }> = ({ focus, prayerLeadName }) =>
  focus.prayerFinished ? (
    <div className={`${CARD} text-center`}>
      <div className="text-2xl text-emerald-600">✓</div>
      <p className="mt-1.5 text-[15px] font-bold text-gray-900">Prayer finished ✓</p>
    </div>
  ) : (
    <div className={`${CARD} text-center`}>
      <div className="flex justify-center">
        <LiveDot label="Live" />
      </div>
      {focus.hubPrayerDone && (
        <p className="mt-2 text-[11px] font-bold text-emerald-700">1 · Pray for your hub ✓ Done</p>
      )}
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-gray-400">Now praying for</p>
      {focus.faithProjectId ? (
        <>
          <p className="mt-2 text-2xl font-bold leading-snug text-gray-900">{focus.participantName}</p>
          <p className="mt-1 text-sm text-gray-500">{focus.groupName || 'No group'}</p>
          {focus.projectText && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">{focus.projectText}</p>}
        </>
      ) : (
        <p className="mt-3 animate-pulse text-sm text-gray-500">Waiting for {prayerLeadName || 'the Prayer Lead'} to pick someone…</p>
      )}
    </div>
  );

// Hub meeting flow: Attendance → Prayer → Review & Recap → Announcements →
// Notes → Submit. Modelled closely on groups/MeetingModePanel. Three access
// levels beyond the full walk-through: recap-lead-only (Review & Recap step
// only), prayer-lead-only (Prayer step only), and a plain member's read-only
// follow-along (step names + the live prayer focus card, no controls).
const HubMeetingPanel: React.FC<HubMeetingPanelProps> = ({
  hubId,
  members,
  weeks,
  weekId,
  onWeekChange,
  submittedWeekIds = [],
  hubLeadName,
  recapLeadName,
  prayerLeadName,
  prayerItems,
  recaps,
  messages,
  canReopen,
  canAttendance,
  isRecapLead,
  isPrayerLead,
  onSubmit,
  onReopen,
}) => {
  const toast = useToast();
  const isFullAccess = canAttendance;
  const canSetPrayerFocus = isFullAccess || isPrayerLead;

  // Which step indices this viewer may open. null = every step (full access).
  const restrictedStepIndices = useMemo(() => {
    if (isFullAccess) return null;
    const set = new Set<number>();
    if (isPrayerLead) set.add(PRAYER_STEP);
    if (isRecapLead) set.add(RECAP_STEP);
    return set;
  }, [isFullAccess, isPrayerLead, isRecapLead]);
  const isFollowAlong = !isFullAccess && (restrictedStepIndices?.size ?? 0) === 0;
  const canOpenStep = (index: number) => isFullAccess || (restrictedStepIndices?.has(index) ?? false);

  const [step, setStep] = useState(0);
  const [marks, setMarks] = useState<Record<string, SupportAttendanceStatus>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [markSaveState, setMarkSaveState] = useState<Record<string, SaveState>>({});
  const [session, setSession] = useState<HubMeetingSession | null>(null);
  const [notes, setNotes] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);

  const submitted = !!session?.submittedAt;

  // Each week's attendance marks, and whether its meeting is already
  // submitted, come from the same per-hub-week fetch. Restricted/follow-along
  // viewers can read this too (SupportSession's RLS is staff-wide, not
  // hub-scoped) — it's only used here for the status pill and to land on the
  // right step, never rendered as marks outside full access.
  useEffect(() => {
    if (!hubId || weekId === null) return;
    let cancelled = false;
    setMarksLoading(true);
    supportSessionsApi.getForHubWeek(hubId, weekId)
      .then(({ attendance, session: sessionRow }) => {
        if (cancelled) return;
        const map: Record<string, SupportAttendanceStatus> = {};
        attendance.forEach((a) => { map[a.userId] = a.status; });
        setMarks(map);
        setSession(sessionRow ?? null);
        setNotes(sessionRow?.notes?.trim() || '');
        if (isFullAccess) {
          setStep(sessionRow?.submittedAt ? DONE_STEP : 0);
        } else if (!isFollowAlong && restrictedStepIndices) {
          setStep([...restrictedStepIndices][0] ?? 0);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMarks({});
        setSession(null);
        setNotes('');
        if (isFullAccess) setStep(0);
      })
      .finally(() => { if (!cancelled) setMarksLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, weekId, isFullAccess, isFollowAlong]);

  // ── Live prayer focus: fetch on mount/week change, refetch on broadcast, ───
  // and a 10s poll fallback while this tab is open (belt-and-braces alongside
  // the broadcast, in case a viewer's channel drops).
  const [prayerFocus, setPrayerFocus] = useState<HubPrayerFocus>(EMPTY_FOCUS);
  const [focusSaving, setFocusSaving] = useState(false);
  const [stateSaving, setStateSaving] = useState(false);
  // "1 · Pray for your hub" done + "Finish prayer" — both persisted per
  // hub/week (SupportSession.hubPrayerDoneAt/prayerFinishedAt), read straight
  // off prayerFocus so every viewer sees the same state.
  const huddleDone = prayerFocus.hubPrayerDone;
  const prayerFinished = prayerFocus.prayerFinished;

  const loadPrayerFocus = useCallback(async () => {
    if (!hubId || weekId === null) return;
    try {
      const focus = await myHubApi.getPrayerFocus(hubId, weekId);
      setPrayerFocus(focus);
    } catch {
      /* keep showing the last value we had */
    }
  }, [hubId, weekId]);

  useEffect(() => { void loadPrayerFocus(); }, [loadPrayerFocus]);

  useEffect(() => {
    if (!hubId || weekId === null) return undefined;
    const interval = setInterval(() => { void loadPrayerFocus(); }, 10000);
    return () => clearInterval(interval);
  }, [hubId, weekId, loadPrayerFocus]);

  // SupportSession is staff-only (app_is_staff(), gated on the x-session-token
  // request header), and Realtime's postgres_changes evaluates RLS over its
  // own websocket connection with no request headers — so it would never
  // deliver a row change here. A plain broadcast channel sidesteps RLS
  // entirely: the setter sends a message after set_hub_prayer_focus succeeds,
  // every other open tab on this hub+week refetches on receiving it.
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!hubId || weekId === null) return undefined;
    const ch = supabase
      .channel(`hub-meeting:${hubId}:${weekId}`)
      .on('broadcast', { event: 'prayer-focus' }, () => { void loadPrayerFocus(); })
      .subscribe();
    setChannel(ch);
    return () => { void supabase.removeChannel(ch); setChannel(null); };
  }, [hubId, weekId, loadPrayerFocus]);

  // Optimistic: show the tap immediately, revert + toast if the save fails.
  // On success, refetch (server truth — picks up the appended prayed-for
  // history) and broadcast so every other open tab refetches too.
  const handleSetPrayerFocus = async (item: HubPrayerListItem | null) => {
    if (!hubId || weekId === null || focusSaving) return;
    const previous = prayerFocus;
    const optimistic: HubPrayerFocus = item
      ? {
          faithProjectId: item.faithProjectId,
          participantName: item.fullName,
          groupName: item.groupName,
          projectText: item.body,
          setAt: new Date().toISOString(),
          prayedForIds: previous.prayedForIds.includes(item.faithProjectId) ? previous.prayedForIds : [...previous.prayedForIds, item.faithProjectId],
        }
      : { ...previous, faithProjectId: null, participantName: null, groupName: null, projectText: null, setAt: null };
    setPrayerFocus(optimistic);
    setFocusSaving(true);
    try {
      await myHubApi.setPrayerFocus(hubId, weekId, item?.faithProjectId ?? null);
      await loadPrayerFocus();
      void channel?.send({ type: 'broadcast', event: 'prayer-focus', payload: {} });
    } catch (err) {
      setPrayerFocus(previous);
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not set this.' });
    } finally {
      setFocusSaving(false);
    }
  };

  const sortedPrayerItems = useMemo(() => sortPrayerItems(prayerItems, prayerFocus.prayedForIds), [prayerItems, prayerFocus.prayedForIds]);
  const focusIndex = sortedPrayerItems.findIndex((item) => item.faithProjectId === prayerFocus.faithProjectId);
  const allPrayedFor = sortedPrayerItems.length > 0 && sortedPrayerItems.every((item) => prayerFocus.prayedForIds.includes(item.faithProjectId));
  const handleNextFocus = () => {
    if (sortedPrayerItems.length === 0) return;
    const next = sortedPrayerItems.find((item, index) => index > focusIndex && !prayerFocus.prayedForIds.includes(item.faithProjectId))
      ?? sortedPrayerItems.find((item) => !prayerFocus.prayedForIds.includes(item.faithProjectId));
    if (next) void handleSetPrayerFocus(next);
  };

  // "1 · Pray for your hub" done toggle and "Finish prayer" — both persisted,
  // both broadcast so every open tab (and the follow-along view) updates.
  const handleToggleHubPrayerDone = async () => {
    if (!hubId || weekId === null || stateSaving) return;
    const previous = prayerFocus;
    setPrayerFocus((prev) => ({ ...prev, hubPrayerDone: !prev.hubPrayerDone }));
    setStateSaving(true);
    try {
      await myHubApi.setPrayerState(hubId, weekId, { hubPrayerDone: !previous.hubPrayerDone });
      await loadPrayerFocus();
      void channel?.send({ type: 'broadcast', event: 'prayer-focus', payload: {} });
    } catch (err) {
      setPrayerFocus(previous);
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not save this.' });
    } finally {
      setStateSaving(false);
    }
  };

  const handleFinishPrayer = async () => {
    if (!hubId || weekId === null || stateSaving) return;
    const previous = prayerFocus;
    setPrayerFocus((prev) => ({ ...prev, prayerFinished: true, faithProjectId: null, participantName: null, groupName: null, projectText: null, setAt: null }));
    setStateSaving(true);
    try {
      await myHubApi.setPrayerState(hubId, weekId, { prayerFinished: true });
      await loadPrayerFocus();
      void channel?.send({ type: 'broadcast', event: 'prayer-focus', payload: {} });
    } catch (err) {
      setPrayerFocus(previous);
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not finish prayer.' });
    } finally {
      setStateSaving(false);
    }
  };

  const handleUndoFinishPrayer = async () => {
    if (!hubId || weekId === null || stateSaving) return;
    const previous = prayerFocus;
    setPrayerFocus((prev) => ({ ...prev, prayerFinished: false }));
    setStateSaving(true);
    try {
      await myHubApi.setPrayerState(hubId, weekId, { prayerFinished: false });
      await loadPrayerFocus();
      void channel?.send({ type: 'broadcast', event: 'prayer-focus', payload: {} });
    } catch (err) {
      setPrayerFocus(previous);
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not undo this.' });
    } finally {
      setStateSaving(false);
    }
  };

  const handleMark = async (userId: string, status: SupportAttendanceStatus) => {
    if (weekId === null) return;
    const setState = (state?: SaveState) => setMarkSaveState((prev) => {
      const next = { ...prev };
      if (state) next[userId] = state; else delete next[userId];
      return next;
    });
    setState('saving');
    try {
      await supportSessionsApi.mark({ status, userId, hubId, weekId });
      setMarks((prev) => ({ ...prev, [userId]: status }));
      setState('saved');
      setTimeout(() => setMarkSaveState((prev) => {
        if (prev[userId] !== 'saved') return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      }), 2000);
    } catch {
      setState('error');
    }
  };

  const week = weeks.find((w) => w.id === weekId) ?? null;
  const weekLabel = week ? `Week ${week.weekNumber}` : 'This week';
  const recap = useMemo(() => recaps.find((r) => r.weekId === weekId) ?? null, [recaps, weekId]);
  const latestMessage = messages[0] ?? null;

  const markedCount = Object.keys(marks).length;
  const unmarkedMembers = members.filter((m) => !marks[m.userId]);
  const blockedByMarks = !submitted && unmarkedMembers.length > 0;
  const presentCount = Object.values(marks).filter((s) => s === 'PRESENT' || s === 'LATE').length;
  const attendanceSummary = markedCount === 0
    ? `Nobody marked yet · ${members.length} in the hub.`
    : `${presentCount} of ${members.length} here · ${members.length - markedCount} still unmarked.`;

  const doneSummary = useMemo(() => {
    const parts: string[] = [];
    if (members.length === 0) parts.push('no members in this hub yet');
    else if (markedCount === 0) parts.push('attendance not marked');
    else {
      const unmarked = members.length - markedCount;
      const counts = [`${presentCount} of ${members.length} present`];
      if (unmarked > 0) counts.push(`${unmarked} still unmarked`);
      parts.push(counts.join(', '));
    }
    if (notes.trim()) parts.push('notes added');
    return `${parts.join(' · ')}.`;
  }, [markedCount, members.length, notes, presentCount]);

  const status = submitted
    ? { label: 'Submitted', cls: 'bg-emerald-100/80 text-emerald-700' }
    : isFullAccess && step > 0
      ? { label: 'In progress', cls: 'bg-amber-100/80 text-amber-700' }
      : { label: 'Not started', cls: 'bg-neutral-100 text-neutral-600' };

  const handleNext = async () => {
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    if (submitted) { setStep(DONE_STEP); return; }
    if (blockedByMarks || weekId === null) return;
    setBusy(true);
    try {
      const trimmedNotes = notes.trim();
      await onSubmit(weekId, trimmedNotes);
      setSession((prev) => ({ id: prev?.id ?? '', notes: trimmedNotes, submittedAt: new Date().toISOString() }));
      setStep(DONE_STEP);
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (weekId === null) return;
    setReopening(true);
    try {
      await onReopen(weekId);
      setSession((prev) => (prev ? { ...prev, submittedAt: null } : prev));
      setStep(STEPS.length - 1);
    } finally {
      setReopening(false);
    }
  };

  // Prayer step content — the lead/assistant/prayer-lead view. Always
  // interactive: this is only ever rendered for a viewer with
  // canSetPrayerFocus (see the two places it's used below).
  const prayedCount = sortedPrayerItems.filter((item) => prayerFocus.prayedForIds.includes(item.faithProjectId)).length;
  const prayerStepContent = (
    <div className="flex flex-col gap-3">
      <section className={CARD}>
        <h3 className="text-[15px] font-bold text-gray-900">You’re leading prayer</h3>
        <p className="mt-0.5 text-[13px] text-gray-500">Tap a person to show their Faith Project on everyone’s screen.</p>
        <div className="mt-2.5"><LiveDot label="Live · everyone in the meeting sees your pick" /></div>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-900">1 · Pray for your hub</p>
          <button
            type="button"
            onClick={() => void handleToggleHubPrayerDone()}
            disabled={stateSaving}
            className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-60 ${huddleDone ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {huddleDone ? 'Done ✓' : 'Mark done'}
          </button>
        </div>
        {!huddleDone && (
          members.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No members yet.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span key={m.userId} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{m.name}</span>
              ))}
            </div>
          )
        )}
      </section>

      {prayerFinished ? (
        <section className={`${CARD} text-center`}>
          <div className="text-2xl text-emerald-600">✓</div>
          <h3 className="mt-1.5 text-[15px] font-bold text-gray-900">Prayer finished ✓</h3>
          <p className="mt-1 text-[13px] text-gray-500">2 · Pray for Faith Projects is done for this week.</p>
          <button
            type="button"
            onClick={() => void handleUndoFinishPrayer()}
            disabled={stateSaving}
            className="mt-3 text-[13px] font-semibold text-gray-500 underline decoration-gray-300 underline-offset-2 disabled:opacity-60"
          >
            Undo
          </button>
        </section>
      ) : (
        <>
          <section className={CARD}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">2 · Pray for Faith Projects</p>
              {sortedPrayerItems.length > 0 && (
                <span className="flex-none rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">{prayedCount} of {sortedPrayerItems.length} prayed for</span>
              )}
            </div>
            {sortedPrayerItems.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No Faith Projects have been shared for prayer yet.</p>
            ) : (
              <div className="mt-2.5 space-y-2 pb-24">
                {sortedPrayerItems.map((item) => {
                  const isShowing = item.faithProjectId === prayerFocus.faithProjectId;
                  // The on-screen card always wins, even though it's also marked
                  // prayed-for internally (so it can't be "dimmed" once shown) —
                  // only cards prayed for on a PREVIOUS turn (not the current one) dim.
                  const isPrayedOnly = !isShowing && prayerFocus.prayedForIds.includes(item.faithProjectId);
                  return (
                    <button
                      key={item.participantId}
                      type="button"
                      onClick={() => void handleSetPrayerFocus(item)}
                      disabled={focusSaving}
                      className={`w-full rounded-[16px] border p-3.5 text-left transition disabled:opacity-60 ${isShowing ? 'border-2 border-primary bg-primary/5 opacity-100 ring-2 ring-primary/25' : isPrayedOnly ? 'border-[#f1f2f5] opacity-70 hover:bg-gray-50' : 'border-[#f1f2f5] hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900">{item.fullName}</p>
                            {isShowing && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">On everyone’s screen</span>}
                            {isPrayedOnly && <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ Prayed for</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500">{item.groupName || 'No group'}{item.categoryName ? ` · ${item.categoryName}` : ''}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-gray-400">{prayerTallyLabel(item)}</p>
                          <p className="mt-1.5 whitespace-pre-line text-sm text-gray-700">{item.body}</p>
                        </div>
                        <span className={`flex-none rounded-xl border px-3 py-1.5 text-xs font-semibold ${isShowing ? 'border-primary bg-primary text-white' : 'border-primary/40 text-primary'}`}>
                          {isShowing ? 'Showing' : 'Show'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-10 flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/80 p-2.5 shadow-[0_8px_24px_-8px_rgba(17,24,39,0.15)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => void handleSetPrayerFocus(null)}
              disabled={focusSaving || !prayerFocus.faithProjectId}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 disabled:opacity-50"
            >
              Clear screen
            </button>
            {sortedPrayerItems.length > 0 && (
              <button
                type="button"
                onClick={handleNextFocus}
                disabled={focusSaving || allPrayedFor}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${allPrayedFor ? 'border border-gray-200 bg-white text-gray-500' : 'bg-primary text-white'}`}
              >
                {focusSaving ? (<span className="inline-flex items-center justify-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Next person →'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleFinishPrayer()}
              disabled={stateSaving}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${allPrayedFor || sortedPrayerItems.length === 0 ? 'bg-primary text-white' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}
            >
              {stateSaving ? (<span className="inline-flex items-center justify-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Finish prayer ✓'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  const recapStepContent = (
    <section className={CARD}>
      <h3 className="text-[15px] font-bold text-gray-900">Review & Recap</h3>
      <p className="mt-0.5 text-[13px] text-gray-500">
        {recapLeadName ? `${recapLeadName} leads this part.` : 'No recap lead assigned yet.'}
      </p>
      {!recap || !recap.released ? (
        <div className="mt-3 rounded-[14px] border border-dashed border-[#e5e7eb] px-3.5 py-6 text-center text-[13px] text-gray-500">
          This week's recap isn't out yet.
        </div>
      ) : (
        <>
          {recap.recapDocumentUrl ? (
            <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3">
              <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-red-50 text-[10px] font-bold text-red-600">PDF</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{recap.recapDocumentName || `${weekLabel} recap`}</p>
                <p className="text-xs text-gray-500">Recap document</p>
              </div>
              <button type="button" onClick={() => setDocOpen(true)} className="flex-none rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white">
                View
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-[14px] border border-dashed border-[#e5e7eb] px-3.5 py-6 text-center text-[13px] text-gray-500">
              Recap not uploaded yet.
            </div>
          )}
          {recap.recapSummary?.trim() && (
            <div className="mt-2.5 rounded-[14px] bg-[#fff8f3] p-3.5">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">Summary</p>
              <p className="mt-1.5 text-sm leading-normal text-gray-700">{recap.recapSummary.trim()}</p>
            </div>
          )}
          {recap.discussionPrompt?.trim() && (
            <div className="mt-2.5 rounded-[14px] border border-[#f1f2f5] p-3.5">
              <p className="text-[13px] font-bold text-gray-900">Discussion prompt</p>
              <p className="mt-1 text-sm leading-normal text-gray-700">{recap.discussionPrompt.trim()}</p>
            </div>
          )}
          <DocumentViewerSheet
            open={docOpen}
            url={recap.recapDocumentUrl ?? null}
            title={`${weekLabel} recap`}
            fileName={recap.recapDocumentName}
            onClose={() => setDocOpen(false)}
          />
        </>
      )}
    </section>
  );

  // ── Follow-along: any other hub member. Read-only — step names for ─────────
  // context, plus the live prayer focus. No marks, no recap, no controls.
  if (isFollowAlong) {
    return (
      <div className="flex flex-col gap-3">
        <section className={`${CARD} border-[#ffdeca]`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-base font-bold leading-snug text-gray-900">{weekLabel} hub meeting</h2>
            <span className={`mt-0.5 flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
          </div>
          {weeks.length > 0 && (
            <div className="mt-3">
              <AppSelect
                value={weekId ? String(weekId) : ''}
                onChange={(value) => onWeekChange(Number(value))}
                options={weeks.map((entry) => ({
                  value: String(entry.id),
                  label: `Week ${entry.weekNumber}`,
                  meta: submittedWeekIds.includes(entry.id) ? 'Submitted' : undefined,
                  done: submittedWeekIds.includes(entry.id),
                }))}
                placeholder="Choose week"
                compact
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STEPS.map((label) => (
              <span key={label} className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[12px] font-semibold leading-tight text-gray-500">{label}</span>
            ))}
          </div>
        </section>
        <FollowAlongPrayerCard focus={prayerFocus} prayerLeadName={prayerLeadName} />
        <section className={CARD}>
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-gray-500">Prayer list</p>
          {sortedPrayerItems.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No Faith Projects have been shared for prayer yet.</p>
          ) : (
            <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
              {sortedPrayerItems.map((item) => {
                const prayed = prayerFocus.prayedForIds.includes(item.faithProjectId);
                return (
                  <li key={item.participantId} className="flex items-center justify-between gap-2 rounded-xl border border-[#f1f2f5] px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${prayed ? 'text-gray-400' : 'text-gray-800'}`}>{item.fullName}</span>
                      <span className="block truncate text-[11px] text-gray-400">{prayerTallyLabel(item)}</span>
                    </span>
                    {prayed && <span className="flex-none rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ── Recap-lead-only / prayer-lead-only: just their one step (or two, if ────
  // someone somehow holds both jobs without lead/assistant rights), chips for
  // context only, no Back/Next/Submit footer.
  if (!isFullAccess) {
    return (
      <div className="flex flex-col gap-3">
        <section className={`${CARD} border-[#ffdeca]`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-base font-bold leading-snug text-gray-900">{weekLabel} hub meeting</h2>
            <span className={`mt-0.5 flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
          </div>
          {weeks.length > 0 && (
            <div className="mt-3">
              <AppSelect
                value={weekId ? String(weekId) : ''}
                onChange={(value) => onWeekChange(Number(value))}
                options={weeks.map((entry) => ({
                  value: String(entry.id),
                  label: `Week ${entry.weekNumber}`,
                  meta: submittedWeekIds.includes(entry.id) ? 'Submitted' : undefined,
                  done: submittedWeekIds.includes(entry.id),
                }))}
                placeholder="Choose week"
                compact
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STEPS.map((label, index) => {
              const clickable = canOpenStep(index);
              const current = index === step;
              const cls = current
                ? 'bg-primary text-white'
                : clickable ? 'bg-amber-100/80 text-amber-700' : 'bg-neutral-100 text-gray-400';
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setStep(index)}
                  aria-label={label}
                  title={label}
                  className={`rounded-lg px-2.5 py-1.5 text-center transition disabled:cursor-not-allowed ${cls}`}
                >
                  <span className="whitespace-nowrap text-[12px] font-semibold leading-tight">{label}{index === PRAYER_STEP && prayerFinished ? ' ✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </section>
        {step === PRAYER_STEP && isPrayerLead ? prayerStepContent : step === RECAP_STEP && isRecapLead ? recapStepContent : (
          <section className={CARD}>
            <p className="text-sm text-gray-500">Pick a step above.</p>
          </section>
        )}
      </div>
    );
  }

  // ── Full walk-through: hub lead, or assistant with ATTENDANCE permission. ──
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-base font-bold leading-snug text-gray-900">{weekLabel} hub meeting</h2>
          <span className={`mt-0.5 flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
        </div>

        {weeks.length > 0 && (
          <div className="mt-3">
            <AppSelect
              value={weekId ? String(weekId) : ''}
              onChange={(value) => onWeekChange(Number(value))}
              options={weeks.map((entry) => ({
                value: String(entry.id),
                label: `Week ${entry.weekNumber}`,
                meta: submittedWeekIds.includes(entry.id) ? 'Submitted' : undefined,
                done: submittedWeekIds.includes(entry.id),
              }))}
              placeholder="Choose week"
              compact
            />
          </div>
        )}

        {!submitted && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STEPS.map((label, index) => {
              const current = index === Math.min(step, STEPS.length - 1);
              const cls = current
                ? 'bg-primary text-white'
                : index < step ? 'bg-amber-100/80 text-amber-700' : 'bg-neutral-100 text-gray-500';
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(index)}
                  aria-label={label}
                  title={label}
                  className={`rounded-lg px-2.5 py-1.5 text-center transition ${cls}`}
                >
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold leading-tight">
                    <span className={`grid h-4 w-4 flex-none place-items-center rounded-full text-[10px] ${current ? 'bg-white text-primary' : 'bg-white/70'}`}>{(index === PRAYER_STEP && prayerFinished) || index < step ? '✓' : index + 1}</span>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {step === 0 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Who's here?</h3>
          {marksLoading ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : members.length === 0 ? (
            <div className="mt-3.5 rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-500">No members in this hub yet.</div>
          ) : (
            <ul className="mt-3.5 space-y-2">
              {members.map((m) => (
                <CompactAttendanceRow
                  key={m.userId}
                  name={m.name}
                  value={marks[m.userId] ?? ''}
                  onChange={(v) => void handleMark(m.userId, v as SupportAttendanceStatus)}
                  options={STATUS_OPTIONS}
                  disabled={markSaveState[m.userId] === 'saving'}
                  status={<SaveStatus state={markSaveState[m.userId]} />}
                />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">{attendanceSummary}</p>
        </section>
      )}

      {step === PRAYER_STEP && prayerStepContent}

      {step === RECAP_STEP && recapStepContent}

      {step === 3 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Announcements</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {hubLeadName ? `${hubLeadName} shares announcements.` : 'No hub lead assigned yet.'}
          </p>
          <div className="mt-3.5 rounded-[14px] border border-[#f1f2f5] p-3.5">
            {latestMessage ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.04em] text-gray-500">Latest message to the hub</p>
                <p className="mt-1.5 text-sm font-semibold text-gray-900">{latestMessage.subject}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{latestMessage.body}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No messages sent to the hub yet.</p>
            )}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Notes</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Anything worth keeping a record of from this meeting.</p>
          <label className="mt-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Meeting notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Good turnout, prayed for two new requests." className={TEXTAREA} />
          </label>
        </section>
      )}

      {step === 5 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Submit</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Check the summary, then submit the report for {weekLabel}.</p>
          <p className="mt-3 rounded-[14px] bg-neutral-50 p-3.5 text-sm leading-normal text-gray-700">{doneSummary}</p>
          {blockedByMarks && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[14px] bg-amber-100/80 p-3.5 text-sm text-amber-800">
              <span className="min-w-0 flex-1">
                {unmarkedMembers.length === 1
                  ? `${unmarkedMembers[0].name} still needs a mark.`
                  : `${unmarkedMembers.length} people still need a mark.`}
              </span>
              <button type="button" onClick={() => setStep(0)} className="flex-none rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-amber-800">
                Mark attendance
              </button>
            </div>
          )}
        </section>
      )}

      {step === DONE_STEP && (
        <section className={`${CARD} p-[22px] text-center`}>
          <div className="text-3xl text-emerald-600">✓</div>
          <h3 className="mt-2 text-[17px] font-bold text-gray-900">{weekLabel} meeting recorded</h3>
          <p className="mt-1.5 text-sm leading-normal text-gray-500">{submitted ? doneSummary : 'This meeting has not been submitted yet.'}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {!submitted && (
              <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-gray-200 bg-white px-[18px] py-[11px] text-sm font-semibold text-gray-800">
                Back to steps
              </button>
            )}
            {submitted && canReopen && (
              <button
                type="button"
                onClick={() => void handleReopen()}
                disabled={reopening}
                className="rounded-xl border border-gray-200 bg-white px-[18px] py-[11px] text-sm font-semibold text-gray-800 disabled:opacity-60"
              >
                {reopening ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Reopening…</span>) : 'Reopen'}
              </button>
            )}
            {submitted && !canReopen && (
              <p className="w-full text-xs text-gray-400">Ask the hub lead if this needs to be reopened.</p>
            )}
          </div>
        </section>
      )}

      {step < DONE_STEP && (
        <div className="flex gap-2.5 rounded-b-2xl border-t border-[#eef0f4] bg-white/85 p-3">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-[18px] py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => { void handleNext(); }}
            disabled={busy || (step >= STEPS.length - 1 && blockedByMarks)}
            className="min-h-[46px] flex-1 rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Submitting…</span>) : step >= STEPS.length - 1 ? 'Submit report' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
};

export default HubMeetingPanel;
