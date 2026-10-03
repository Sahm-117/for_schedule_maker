import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { followUpChecksApi } from '../../services/api';
import { useToast } from '../Toast';
import { POPUP_PRIORITY, usePopupSlot } from '../../utils/popupQueue';
import type { FollowUpCheck } from '../../types';

// A support who has held people for a day without moving any of them is asked, once:
// "Are you following up your participants?" It can't be closed without answering.
//   Yes, I'm on it  -> one more 24 hours.
//   Not right now   -> those people are reassigned.
// No answer within 24 hours counts as not right now. (The sweep runs on the server.)

const RECHECK_MS = 5 * 60 * 1000;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });

const SURFACE = 'rounded-[28px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.2)]';
const PRIMARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const SECONDARY = 'flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-60';

const FollowUpCheckPrompt: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const toast = useToast();
  const [check, setCheck] = useState<FollowUpCheck | null>(null);
  const [busy, setBusy] = useState<'YES' | 'NOT_NOW' | null>(null);
  const lastCheck = useRef(0);

  const load = useCallback(() => {
    lastCheck.current = Date.now();
    followUpChecksApi.getMine().then(setCheck).catch(() => { /* offline or signed out: try again later */ });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, load]);

  // Held back for 2 seconds, so a tap meant for the screen underneath can't land on a button.
  const checkId = check?.id;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!checkId) return undefined;
    const timer = window.setTimeout(() => setReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [checkId]);

  const slot = usePopupSlot('followup-check', POPUP_PRIORITY.followUpCheck, enabled && !!check && ready, 'required');
  if (!enabled || !check || !ready || !slot) return null;

  const answer = async (value: 'YES' | 'NOT_NOW') => {
    setBusy(value);
    try {
      await followUpChecksApi.answer(value);
      toast({ message: value === 'YES' ? 'Thank you! Take another 24 hours.' : "No problem. We'll find someone to help them." });
      setCheck(null);
    } catch {
      toast({ tone: 'error', message: "That didn't save. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const first = check.people.slice(0, 3).map((p) => p.name.split(' ')[0]);
  const more = check.people.length - first.length;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="How is it going with your participants?">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className={`${SURFACE} relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-b-none px-6 pb-7 pt-7 sm:rounded-[28px]`}>
        <p className="text-[13px] font-semibold text-primary">Quick check-in</p>
        <h2 className="mt-1.5 text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-gray-900">How’s it going with your participants?</h2>
        <p className="mt-3 text-[15px] leading-[1.55] text-gray-600">
          {check.people.length === 1 ? 'This participant was' : `These ${check.people.length} participants were`} given to you a day ago. Are you following up with them?
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {first.map((name) => <li key={name} className="rounded-full bg-[#f2f2f4] px-3.5 py-1.5 text-[14px] font-semibold text-gray-900">{name}</li>)}
          {more > 0 && <li className="rounded-full bg-[#f2f2f4] px-3.5 py-1.5 text-[14px] font-semibold text-gray-500">+{more} more</li>}
        </ul>
        <p className="mt-4 text-[13.5px] leading-[1.5] text-gray-500">
          If you’re tied up, no worries. Let us know by <span className="font-semibold text-gray-700">{when(check.deadlineAt)}</span> or we’ll hand them to someone who can help.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button type="button" disabled={busy !== null} onClick={() => void answer('YES')} className={PRIMARY}>{busy === 'YES' ? 'Saving…' : "Yes, I'm on it"}</button>
          <button type="button" disabled={busy !== null} onClick={() => void answer('NOT_NOW')} className={SECONDARY}>{busy === 'NOT_NOW' ? 'Saving…' : 'Not right now'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FollowUpCheckPrompt;
