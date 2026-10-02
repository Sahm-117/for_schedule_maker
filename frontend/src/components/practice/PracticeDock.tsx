import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ModalShell from '../followups/ModalShell';
import PracticeChecklist from './PracticeChecklist';
import PracticeTogether from './PracticeTogether';
import PeerWalkthroughSheet from './PeerWalkthroughSheet';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { practiceApi } from '../../services/api';
import { PRACTICE_ROLE_LABEL, PRACTICE_SCENARIOS, peerSteps, type PracticeScenario, type PracticeSeat } from '../../constants/practiceScenarios';
import { enterParticipantView, isInParticipantView, leaveParticipantView } from '../../utils/practiceSwap';
import { useAuth } from '../../hooks/useAuth';
import type { PracticeMyProgress, PracticePeerActive, PracticeProgressItem, PracticePulse, PracticeRole, PracticeSeatKey } from '../../types';

const ROLE_CARDS: Array<{ key: PracticeSeatKey; emoji: string; description: string; peer: string }> = [
  { key: 'SUPPORT', emoji: '🙋', description: 'Look after your own group: introduce yourself, take attendance, post and pin.', peer: 'Pair with another support who plays a participant and introduces themselves to you.' },
  { key: 'HUB_LEAD', emoji: '🧭', description: 'Run the hub: see your supports, take hub attendance, run the meeting to Submit.', peer: 'Another support plays a support while you run the meeting.' },
  { key: 'ASSISTANT', emoji: '🤝', description: 'Back up the Hub Lead: help with attendance and message the hub.', peer: 'Pair with a Hub Lead and split the meeting.' },
  { key: 'RECAP_LEAD', emoji: '📖', description: 'Lead the Review and Recap step and read out the discussion prompt.', peer: 'Recap to a Hub Lead, who asks a question back.' },
  { key: 'PRAYER_LEAD', emoji: '🙏', description: 'Open the Prayer step, pick who to pray for and keep it on time.', peer: 'Take turns: one picks, one prays.' },
  { key: 'PARTICIPANT', emoji: '🎓', description: 'Play a participant yourself and see the app as they do: Get ready, class, reflection.', peer: 'Pair with another support who runs the group while you play the participant.' },
];
const chosenKey = (userId?: string) => `fof_practice_seat_chosen_${userId ?? ''}`;
const readChosen = (userId?: string) => { try { return localStorage.getItem(chosenKey(userId)) === '1'; } catch { return false; } };
const writeChosen = (userId: string | undefined, on: boolean) => { try { if (on) localStorage.setItem(chosenKey(userId), '1'); else localStorage.removeItem(chosenKey(userId)); } catch { /* ignore */ } };
/** Set by anything that wants the pop-up to open as soon as the Practice cohort is showing. */
export const OPEN_PRACTICE_EVENT = 'fof:practice-open';
export const OPEN_PRACTICE_FLAG = 'fof:practice-open-pending';

const SECTION = 'mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-500';

const withChange = (items: PracticeProgressItem[], key: string, done: boolean, stuck: boolean): PracticeProgressItem[] => {
  const now = new Date().toISOString();
  return [...items.filter((item) => item.key !== key), { key, doneAt: done ? now : null, stuckAt: stuck ? now : null }];
};

interface RolePickerProps {
  cards: typeof ROLE_CARDS;
  seat: PracticeSeat | null;
  selected: PracticeSeatKey | null;
  onSelect: (key: PracticeSeatKey) => void;
  groupName?: string | null;
  hubName?: string | null;
  busy: PracticeSeatKey | null;
  onStart: (key: PracticeSeatKey) => void;
}

// First thing the pop-up shows (and behind "Change role"): pick who to practise as.
const RolePicker: React.FC<RolePickerProps> = ({ cards, seat, selected, onSelect, groupName, hubName, busy, onStart }) => (
  <div>
    <h3 className="text-[20px] font-extrabold leading-tight text-gray-900">Who do you want to practice as?</h3>
    <p className="mb-3 mt-1 text-[13.5px] text-gray-500">Tap a role, then press Start. You can change it any time.</p>
    <div className="flex flex-col gap-2.5">
      {cards.map((card) => {
        const on = card.key === selected;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(card.key)}
            className={`relative flex gap-3 rounded-[20px] border-2 p-3.5 text-left ${on ? 'border-[#ff8f4d] bg-[#fff7f0] shadow-[0_0_0_4px_#ffe2cf]' : 'border-gray-200 bg-white'}`}
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[14px] bg-[#fff1e6] text-[22px]" aria-hidden="true">{card.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-extrabold text-gray-900">{PRACTICE_ROLE_LABEL[card.key]}{seat === card.key && <span className="ml-2 text-[11px] font-bold text-emerald-600">Current</span>}</span>
              <span className="mt-0.5 block text-[13px] text-gray-600">{card.description}</span>
              <span className="mt-2 block rounded-[10px] bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700">
                {groupName ? `Your group: ${groupName}${hubName && card.key !== 'PARTICIPANT' ? ` · ${hubName}` : ''}` : 'Your practice group is made when you start'}
              </span>
              <span className="mt-2 block border-t border-dashed border-gray-200 pt-2 text-[12px] text-violet-700">
                <b className="block text-[10px] uppercase tracking-wider">Peer idea</b>{card.peer}
              </span>
            </span>
            {on && <span className="absolute right-3 top-3 grid h-[22px] w-[22px] place-items-center rounded-full bg-[#ff8f4d] text-[13px] text-white" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
    <button
      type="button"
      disabled={busy !== null || !selected}
      onClick={() => { if (selected) onStart(selected); }}
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-900 text-[15px] font-bold text-white disabled:opacity-60"
    >
      {busy !== null && <Spinner className="h-4 w-4" />}{selected ? `Start as ${PRACTICE_ROLE_LABEL[selected]}` : 'Pick a role to start'}
    </button>
  </div>
);

// A small pill that stays on screen in Practice and opens the person's
// sheet: play any seat, start a peer walkthrough, and their scenario checklist.
// Staff: while they are looking at the Practice cohort. Participants: only when
// they are a practice participant (including a staff member stepped into one).
interface DockProps {
  mode: 'staff' | 'participant';
  active?: boolean;
  /** Staff: the latest pulse and a way to ask for another one now. */
  pulse?: PracticePulse | null;
  refreshPulse?: () => Promise<void> | void;
  /** Staff: my hub or seat changed, so reload My Hub. */
  onWorkspaceChanged?: () => void;
}

const PracticeDock: React.FC<DockProps> = ({ mode, active = true, pulse, refreshPulse, onWorkspaceChanged }) => {
  const toast = useToast();
  const [data, setData] = useState<PracticeMyProgress | null>(null);
  const [partner, setPartner] = useState<PracticePeerActive | null>(null);
  const [open, setOpen] = useState(false);
  const [peerOpen, setPeerOpen] = useState(false);
  const [busySeat, setBusySeat] = useState<PracticeSeatKey | null>(null);
  const { user } = useAuth();
  const [chosen, setChosen] = useState(() => readChosen(user?.id));
  const [changingRole, setChangingRole] = useState(false);
  const [picked, setPicked] = useState<PracticeSeatKey | null>(null);
  const swapped = mode === 'participant' && isInParticipantView();
  const location = useLocation();
  // Steps the person unticked by hand: not ticked again by a visit this session.
  const unticked = useRef<Set<string>>(new Set());
  const visited = useRef<Set<string>>(new Set());
  // After a seat switch or reset, the screen the person is already on must not tick the fresh
  // steps by itself: they have to open it (move to another screen and back).
  const suppressVisit = useRef<string | null>(null);
  const startFresh = () => {
    visited.current.clear();
    unticked.current.clear();
    suppressVisit.current = `${location.pathname}${location.search}`;
  };

  // A refresh that was already on its way when someone ticked a step carries the old answer.
  // Letting it land would un-tick the box they just ticked, so it is dropped (a fresh one follows the save).
  const pendingSaves = useRef(0);
  const lastChangeAt = useRef(0);

  const load = useCallback(() => {
    const startedAt = Date.now();
    const request = mode === 'staff' ? practiceApi.getMine() : practiceApi.getForParticipant();
    request.then((next) => {
      if (pendingSaves.current > 0 || lastChangeAt.current > startedAt) return;
      setData(next);
    }).catch(() => {});
    if (mode === 'participant') practiceApi.participantPeer().then(setPartner).catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (!active) { setData(null); return undefined; }
    // Participants wait a moment so the first screen is not slowed for real people.
    const first = window.setTimeout(load, mode === 'participant' ? 1500 : 0);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => { window.clearTimeout(first); window.clearInterval(poll); };
  }, [active, load, mode]);

  const peer: PracticePeerActive | null = mode === 'staff' ? (pulse?.active ?? null) : partner;
  const seat: PracticeSeat | null = mode === 'participant' ? (data?.practice ? 'PARTICIPANT' : null) : (pulse?.role ?? data?.role ?? null);
  const scenarios = useMemo(() => (seat ? PRACTICE_SCENARIOS[seat] : []), [seat]);
  const items = data?.items ?? [];

  const changeOwn = (key: string, done: boolean, stuck: boolean) => {
    if (!done && !stuck) { unticked.current.add(key); visited.current.delete(key); }
    if (done) unticked.current.delete(key);
    lastChangeAt.current = Date.now();
    pendingSaves.current += 1;
    setData((prev) => (prev ? { ...prev, items: withChange(prev.items, key, done, stuck) } : prev));
    const save = mode === 'staff' ? practiceApi.setMine(key, done, stuck) : practiceApi.setForParticipant(key, done, stuck);
    save
      .then(() => { pendingSaves.current -= 1; lastChangeAt.current = Date.now(); void refreshPulse?.(); load(); })
      .catch(() => { pendingSaves.current -= 1; lastChangeAt.current = 0; load(); });
  };

  const changePeer = (key: string, done: boolean, stuck: boolean) => {
    // Show it straight away, then let the next pulse confirm it.
    setPartner((prev) => (prev ? { ...prev, myProgress: withChange(prev.myProgress, key, done, stuck) } : prev));
    changeOwn(key, done, stuck);
  };

  // Steps the data can't see are ticked when the person opens the screen.
  useEffect(() => {
    if (!active) return;
    if (suppressVisit.current !== null) {
      if (suppressVisit.current === `${location.pathname}${location.search}`) return;
      suppressVisit.current = null;
    }
    const candidates: PracticeScenario[] = [...(peer ? peerSteps(peer.myRole, peer.partnerRole) : []), ...scenarios].filter((step) => step.visit && step.to);
    const doneNow = new Set([...items, ...(peer?.myProgress ?? [])].filter((item) => item.doneAt).map((item) => item.key));
    candidates.forEach((step) => {
      const [path, query = ''] = step.to!.split('?');
      const onPath = location.pathname === path || (path !== '/me' && location.pathname.startsWith(`${path}/`));
      const onTab = !query || location.search.includes(query);
      if (!onPath || !onTab || doneNow.has(step.key) || unticked.current.has(step.key) || visited.current.has(step.key)) return;
      visited.current.add(step.key);
      if (peer && peerSteps(peer.myRole, peer.partnerRole).some((s) => s.key === step.key)) changePeer(step.key, true, false);
      else changeOwn(step.key, true, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, location.pathname, location.search, data, partner, pulse?.active?.id]);

  const pickSeat = async (key: PracticeSeatKey) => {
    if (busySeat || key === seat) return;
    setBusySeat(key);
    try {
      if (key === 'PARTICIPANT') {
        await enterParticipantView();
        return;
      }
      await practiceApi.setMyRole(key as PracticeRole);
      startFresh();
      await refreshPulse?.();
      load();
      onWorkspaceChanged?.();
      toast({ message: `You are now playing the ${PRACTICE_ROLE_LABEL[key]}.` });
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not switch seats.' });
    } finally { setBusySeat(null); }
  };

  // Anything outside the dock (the Practice tile, the More menu) can ask for the pop-up to open.
  useEffect(() => {
    if (!active) return undefined;
    const openNow = () => { try { sessionStorage.removeItem(OPEN_PRACTICE_FLAG); } catch { /* ignore */ } setOpen(true); };
    let pending = false;
    try { pending = sessionStorage.getItem(OPEN_PRACTICE_FLAG) === '1'; } catch { /* ignore */ }
    if (pending) openNow();
    window.addEventListener(OPEN_PRACTICE_EVENT, openNow);
    return () => window.removeEventListener(OPEN_PRACTICE_EVENT, openNow);
  }, [active]);

  const startAs = async (key: PracticeSeatKey) => {
    if (busySeat) return;
    writeChosen(user?.id, true);
    setChosen(true);
    if (key === seat) { setChangingRole(false); return; }
    await pickSeat(key);
    setChangingRole(false);
  };

  const [resetting, setResetting] = useState<null | 'practice' | 'first'>(null);
  const resetMine = async (kind: 'practice' | 'first') => {
    setResetting(kind);
    try {
      if (mode === 'participant') {
        await practiceApi.participantResetMe();
        toast({ message: 'Reset. Reloading as a brand-new participant…' });
        window.setTimeout(() => window.location.assign('/me'), 600);
        return;
      }
      if (kind === 'practice') await practiceApi.resetMe(); else await practiceApi.resetMyFirstTime();
      if (kind === 'practice') { startFresh(); writeChosen(user?.id, false); setChosen(false); setChangingRole(false); setPicked(null); }
      await refreshPulse?.();
      load();
      onWorkspaceChanged?.();
      toast({ message: kind === 'practice' ? 'Your practice is fresh. New group, clean checklist.' : 'Your welcome and tours will show again.' });
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not reset.' });
    } finally { setResetting(null); }
  };

  const [ending, setEnding] = useState(false);
  const endWalkthrough = async (id: string) => {
    if (ending) return;
    setEnding(true);
    try {
      if (mode === 'participant') { await practiceApi.participantPeerEnd(); setPartner(null); load(); } else { await practiceApi.peerEnd(id); await refreshPulse?.(); }
      toast({ message: 'Walkthrough ended.' });
    } catch { toast({ tone: 'error', message: 'Could not end it. Please try again.' }); }
    finally { setEnding(false); }
  };

  const picking = mode === 'staff' && !peer && (!chosen || changingRole);
  const bannerRef = useRef<HTMLDivElement>(null);
  const wasPicking = useRef(false);
  useEffect(() => {
    // Coming back from the role picker, start the checklist view at the top (the picker is long).
    if (wasPicking.current && !picking) window.setTimeout(() => bannerRef.current?.scrollIntoView({ block: 'start' }), 0);
    wasPicking.current = picking;
  }, [picking]);
  if (!active) return null;
  if (!seat && !peer) return null;
  const list = peer ? [] : scenarios;
  const doneKeys = new Set(items.filter((item) => item.doneAt).map((item) => item.key));
  const doneCount = peer
    ? peer.myProgress.filter((item) => item.doneAt).length
    : list.filter((s) => doneKeys.has(s.key)).length;
  const total = peer ? 0 : list.length;
  const outgoing = mode === 'staff' ? pulse?.outgoing ?? null : null;

  return (
    <>
      {mode === 'participant' && (
        <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-3 bg-[#3f4757] px-4 py-1 text-center text-[11px] font-semibold text-white">
          <span>{swapped ? 'Practice participant' : 'Practice mode. Nothing here is real.'}</span>
          {swapped && (
            <button type="button" onClick={() => void leaveParticipantView()} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white">Back to my account</button>
          )}
          {peer && (
            <button type="button" onClick={() => void endWalkthrough(peer.id)} disabled={ending} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-0.5 text-[11px] font-bold text-violet-800 disabled:opacity-70">{ending && <Spinner className="h-3 w-3" />}End walkthrough</button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-4 z-40 inline-flex items-center gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-[13px] font-semibold text-white shadow-lg active:scale-[0.98] ${peer ? 'bg-violet-700' : 'bg-[#3f4757]'}`}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px] font-bold">{doneCount}</span>
        {peer ? `Walkthrough · ${doneCount} done` : `Practice · ${doneCount} of ${total}`}
      </button>
      <ModalShell
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Practice"
        subtitle={picking ? 'Nothing here is real' : seat ? `${PRACTICE_ROLE_LABEL[seat]}${peer ? ` · with ${peer.partnerName.split(' ')[0]}` : ''}` : undefined}
      >
        {mode === 'staff' && peer && <p className="mb-1.5 text-[11.5px] text-gray-500">Your seat is set by the walkthrough. End it to switch.</p>}
        {picking && (
          <RolePicker
            cards={ROLE_CARDS}
            seat={seat}
            selected={picked}
            onSelect={setPicked}
            groupName={data?.groupName}
            hubName={data?.hubName}
            busy={busySeat}
            onStart={(k) => void startAs(k)}
          />
        )}
        {mode === 'staff' && !peer && !picking && seat && (
          <div ref={bannerRef} className="mb-3 mt-1">
            <div className="flex items-center gap-3 rounded-[20px] border-2 border-[#ffb98a] bg-[#fff7f0] px-3.5 py-3">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-[14px] bg-[#ff8f4d] text-[22px]" aria-hidden="true">{ROLE_CARDS.find((c) => c.key === seat)?.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-[17px] font-extrabold text-gray-900">{PRACTICE_ROLE_LABEL[seat]}</p>
                <p className="truncate text-[12.5px] text-gray-500">{[data?.groupName, data?.hubName].filter(Boolean).map((n) => String(n).replace(/^Practice /, '')).join(' · ') || 'Practising'}</p>
              </div>
              <button type="button" onClick={() => { setPicked(seat); setChangingRole(true); }} className="flex-none whitespace-nowrap rounded-full border-[1.5px] border-[#ff8f4d] bg-white px-3.5 py-2 text-[13px] font-bold text-[#c2570c]">Change role</button>
            </div>
            {data?.groupName && (
              <p className="mt-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] leading-snug text-emerald-800">
                <b>Heads up:</b> your practice participants{data.groupParticipants && data.groupParticipants.length > 0 ? ` (${data.groupParticipants.map((n) => n.split(' ')[0]).join(', ')})` : ''} are in {data.groupName}. What you post, pin or mark here is what they see.
              </p>
            )}
          </div>
        )}

        {peer ? (
          <div className="mt-4 rounded-2xl bg-violet-50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] font-bold text-gray-900">With {peer.partnerName}</p>
              <span className={`text-[11.5px] font-bold ${peer.partnerInParticipantView ? 'text-violet-700' : peer.partnerPresent ? 'text-emerald-600' : 'text-gray-400'}`}>
                {peer.partnerInParticipantView ? '● In participant view' : peer.partnerPresent ? '● Here now' : 'Away'}
              </span>
            </div>
            {mode === 'staff' && peer.iAmParticipant && (
              <button type="button" onClick={() => void pickSeat('PARTICIPANT')} disabled={busySeat !== null} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-700 px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-70">{busySeat === 'PARTICIPANT' && <Spinner className="h-4 w-4" />}Switch to participant view</button>
            )}
            <button type="button" onClick={() => void endWalkthrough(peer.id)} disabled={ending} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rose-600 px-4 text-[14px] font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-70">{ending && <Spinner className="h-4 w-4" />}End walkthrough</button>
          </div>
        ) : mode === 'staff' && !picking && (
          <div className="mt-4">
            {outgoing ? (
              <div className="flex items-center justify-between rounded-2xl bg-[#f2f2f4] px-4 py-3">
                <p className="text-[13.5px] font-semibold text-gray-800">Waiting for {outgoing.toName.split(' ')[0]}…</p>
                <button type="button" onClick={() => void endWalkthrough(outgoing.id)} disabled={ending} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 disabled:opacity-70">{ending && <Spinner className="h-3.5 w-3.5" />}Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setPeerOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-[#f2f2f4] px-4 py-3 text-left">
                <span className="text-[14px] font-semibold text-gray-900">Peer walkthrough</span>
                <span className="text-[12px] text-gray-500">Practise with someone ›</span>
              </button>
            )}
          </div>
        )}

        {peer ? (
          <>
            <p className={SECTION}>Together</p>
            <PracticeTogether peer={peer} onChange={changePeer} onNavigate={() => setOpen(false)} />
          </>
        ) : !picking && list.length > 0 && (
          <>
            <p className={SECTION}>My scenarios · {doneCount} of {total}</p>
            <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((doneCount / Math.max(total, 1)) * 100)}%` }} />
            </div>
            <PracticeChecklist scenarios={list} items={items} onChange={changeOwn} onNavigate={() => setOpen(false)} />
          </>
        )}
        {!peer && !picking && (
          <>
            <p className={SECTION}>Start fresh</p>
            <div className="flex flex-col gap-2">
              {mode === 'staff' && (
                <button type="button" disabled={resetting !== null} onClick={() => void resetMine('practice')} className="flex h-11 items-center justify-between rounded-2xl bg-[#f2f2f4] px-4 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-60">
                  <span className="inline-flex items-center gap-2">{resetting === 'practice' && <Spinner className="h-4 w-4" />}{resetting === 'practice' ? 'Resetting…' : 'Reset my practice'}</span>
                  <span className="text-[12px] font-medium text-gray-500">New group, clean checklist</span>
                </button>
              )}
              <button type="button" disabled={resetting !== null} onClick={() => void resetMine('first')} className="flex h-11 items-center justify-between rounded-2xl bg-[#f2f2f4] px-4 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-60">
                <span className="inline-flex items-center gap-2">{resetting === 'first' && <Spinner className="h-4 w-4" />}{resetting === 'first' ? 'Resetting…' : mode === 'participant' ? 'Reset this participant' : 'Reset my first-time experience'}</span>
                <span className="text-[12px] font-medium text-gray-500">{mode === 'participant' ? 'Back to first sign-in' : 'Welcome and tours again'}</span>
              </button>
            </div>
          </>
        )}
        {peer && mode === 'participant' && scenarios.length > 0 && (
          <>
            <p className={SECTION}>My scenarios</p>
            <PracticeChecklist scenarios={scenarios} items={items} onChange={changeOwn} onNavigate={() => setOpen(false)} />
          </>
        )}
      </ModalShell>
      {mode === 'staff' && seat && (
        <PeerWalkthroughSheet isOpen={peerOpen} onClose={() => setPeerOpen(false)} mySeat={seat} onSent={() => void refreshPulse?.()} />
      )}
    </>
  );
};

export default PracticeDock;
