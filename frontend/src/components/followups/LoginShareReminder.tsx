import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { followUpContactsApi, participantAccountsApi } from '../../services/api';
import { buildStatusPatch, isNoFormRegistrationError, NO_FORM_MESSAGE } from '../../utils/followUps';
import { firstNameOf } from '../../utils/people';
import { useToast } from '../Toast';
import type { FollowUpContact, FollowUpContactUpdate } from '../../types';
import { POPUP_PRIORITY, usePopupSlot, useSettled } from '../../utils/popupQueue';

// A support opens someone's login, which makes their code, and then sends it
// outside the app (WhatsApp, email, a paste). The app can't see that, so the
// person stays at Registered. Whenever a support enters the app, this asks
// about anyone whose login has been made and who is still at
// Registered: "Did you send it?" It can't be closed without answering.
// "Yes" moves them to Login shared. "Not yet" asks again tomorrow.

const SNOOZE_MS = 24 * 60 * 60 * 1000;
const RECHECK_MS = 15 * 1000;

interface Pending {
  contact: FollowUpContact;
  madeAt: string;
}

const snoozeKey = (userId: string) => `fofLoginShareSnooze:${userId}`;
const readSnoozes = (userId: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(snoozeKey(userId)) || '{}') || {}; } catch { return {}; }
};
const writeSnooze = (userId: string, contactId: string) => {
  try {
    const now = Date.now();
    const kept = Object.fromEntries(Object.entries(readSnoozes(userId)).filter(([, until]) => new Date(until).getTime() > now));
    localStorage.setItem(snoozeKey(userId), JSON.stringify({ ...kept, [contactId]: new Date(now + SNOOZE_MS).toISOString() }));
  } catch { /* storage unavailable: it will simply ask again next time */ }
};

const ago = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

const LoginShareReminder: React.FC<{ userId: string; enabled: boolean }> = ({ userId, enabled }) => {
  const toast = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const lastCheck = useRef(0);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      const { contacts } = await followUpContactsApi.getAll({ ownerId: userId, archived: false });
      const registered = contacts.filter((c) => c.registrationStatus === 'REGISTERED' && !c.isTest);
      // (LOGIN_SHARED people are moved by the database once they set a password.)
      const snoozes = readSnoozes(userId);
      const now = Date.now();
      const found: Pending[] = [];
      await Promise.all(registered.map(async (contact) => {
        const snoozed = snoozes[contact.id] && new Date(snoozes[contact.id]).getTime() > now;
        try {
          const details = await participantAccountsApi.getLoginDetails({ followUpContactId: contact.id });
          // Already in the app: move them quietly. No question, no notification.
          if (details.passwordSetAt || details.lastSignInAt) {
            await followUpContactsApi.update(contact.id, buildStatusPatch('ACCESS_CONFIRMED') as FollowUpContactUpdate);
            return;
          }
          if (snoozed) return;
          // Only a login that exists and hasn't been used. Asked on the very next entry.
          if (details.status !== 'CODE_READY' || !details.issuedAt) return;
          found.push({ contact, madeAt: details.issuedAt });
        } catch { /* one person failing to load shouldn't hide the rest */ }
      }));
      found.sort((a, b) => a.madeAt.localeCompare(b.madeAt));
      setPending(found);
    } catch { /* offline or signed out: try again next time */ }
    finally { checking.current = false; }
  }, [userId]);

  // On entering the app, and whenever it comes back to the front.
  useEffect(() => {
    if (!enabled) return undefined;
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, check]);

  const settled = useSettled();
  const slot = usePopupSlot('login-reminder', POPUP_PRIORITY.loginReminder, enabled && settled && pending.length > 0);
  if (!enabled || pending.length === 0 || !slot) return null;

  const answer = async (item: Pending, sent: boolean) => {
    setBusyId(item.contact.id);
    try {
      if (sent) {
        await followUpContactsApi.update(item.contact.id, buildStatusPatch('LOGIN_SHARED') as FollowUpContactUpdate);
        toast({ message: `${firstNameOf(item.contact.fullName)} is now Login shared.` });
      } else {
        writeSnooze(userId, item.contact.id);
      }
      setPending((prev) => prev.filter((entry) => entry.contact.id !== item.contact.id));
    } catch (err) {
      toast({ tone: 'error', message: isNoFormRegistrationError(err) ? `Not saved. ${NO_FORM_MESSAGE}` : "That didn't save. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm logins you sent">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-5 pb-8 pt-6 shadow-[0_-8px_40px_rgba(15,23,42,0.2)] sm:rounded-[28px]">
        <h2 className="text-lg font-bold text-gray-900">Did you send {pending.length === 1 ? 'this login' : 'these logins'}?</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-gray-600">
          You made {pending.length === 1 ? 'this login' : 'these logins'} but they are still marked Registered. If you sent it, mark it Login shared so everyone can see where they are.
        </p>
        <ul className="mt-4 space-y-3">
          {pending.map((item) => {
            const busy = busyId === item.contact.id;
            return (
              <li key={item.contact.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                <p className="text-[15px] font-bold text-gray-900">{item.contact.fullName}</p>
                <p className="mt-0.5 text-[12.5px] text-amber-900/80">
                  Login made {ago(item.madeAt)}{item.contact.phone ? ` · ${item.contact.phone}` : ''}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void answer(item, true)} className="min-h-[44px] flex-[2] rounded-xl bg-amber-600 px-3 text-[14px] font-semibold text-white disabled:opacity-60">
                    {busy ? 'Saving…' : 'Yes, I sent it'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void answer(item, false)} className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 text-[14px] font-semibold text-amber-800 disabled:opacity-60">
                    Not yet
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-center text-[11.5px] text-gray-400">“Not yet” asks again tomorrow.</p>
      </div>
    </div>,
    document.body,
  );
};

export default LoginShareReminder;
