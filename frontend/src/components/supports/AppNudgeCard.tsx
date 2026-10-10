import React, { useEffect, useRef, useState } from 'react';
import { startPolling } from '../../hooks/usePolling';
import { NavLink } from 'react-router-dom';
import Avatar from '../Avatar';
import { appNudgeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../context/AppDataContext';
import { appNudgeMessage } from '../../constants/installVideos';
import { buildWhatsAppLink } from '../../utils/phone';
import { firstNameOf } from '../../utils/people';
import type { AppNudgePerson } from '../../types';

// Home card for supports: participants who have signed in but still need the app
// (not on their Home Screen, or alerts off). One tap opens WhatsApp with the install
// video already in the message. It goes away on its own as people finish, and the
// server stops listing anyone once their cohort has started.

const REASON_LABEL: Record<AppNudgePerson['reason'], string> = { NOT_INSTALLED: 'Not opened', NO_ALERTS: 'No alerts' };
const REFRESH_MS = 2 * 60 * 1000;

const sentLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sent';
  const recent = Date.now() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
  return `Sent ${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', ...(recent ? { weekday: 'short' as const } : { day: 'numeric' as const, month: 'short' as const }),
  }).format(date)}`;
};

const AppNudgeCard: React.FC = () => {
  const { user } = useAuth();
  const { liveRevision } = useAppData();
  const [people, setPeople] = useState<AppNudgePerson[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(new Set<string>());
  const ownerRef = useRef(user?.id);

  useEffect(() => {
    ownerRef.current = user?.id;
    setPeople([]);
    setSaveError(null);
    return () => { ownerRef.current = undefined; };
  }, [user?.id]);

  useEffect(() => {
    let live = true;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const list = await appNudgeApi.mine();
        if (live) setPeople((previous) => {
          // A refresh started before a Send video click must not erase its saved stamp.
          const sent = new Map(previous.map((person) => [person.participantId, person.sentAt]));
          return list.map((person) => {
            const saved = sent.get(person.participantId);
            return saved && (!person.sentAt || saved > person.sentAt) ? { ...person, sentAt: saved } : person;
          });
        });
      } catch { /* optional card: keep the last successful list while offline */ }
      finally { loading = false; }
    };
    void load();
    const stopPolling = startPolling(load, REFRESH_MS, { catchUp: false });
    // Focus, online and visibilitychange can fire together; refresh once.
    let lastRefresh = 0;
    const refresh = () => {
      if (Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      void load();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      live = false;
      stopPolling();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user?.id, liveRevision]);

  const markSent = async (person: AppNudgePerson) => {
    if (saving.current.has(person.participantId)) return;
    const owner = user?.id;
    saving.current.add(person.participantId);
    setSaveError(null);
    try {
      const sentAt = await appNudgeApi.markSent(person.participantId);
      if (ownerRef.current === owner) {
        setPeople((previous) => previous.map((entry) => entry.participantId === person.participantId ? { ...entry, sentAt } : entry));
      }
    } catch {
      if (ownerRef.current === owner) setSaveError('Could not save the Sent mark. Tap Send video again to retry.');
    } finally { saving.current.delete(person.participantId); }
  };

  const sorted = [...people].sort((a, b) => Number(!!a.sentAt) - Number(!!b.sentAt) || a.name.localeCompare(b.name));

  if (people.length === 0) return null;

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]" aria-label="Participants who still need the app">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Get them on the app</p>
      <p className="mt-0.5 text-[17px] font-bold leading-snug text-gray-900">
        {people.length === 1 ? '1 participant still needs' : `${people.length} participants still need`} the app
      </p>
      <ul className="mt-2 divide-y divide-gray-100">
        {sorted.map((person) => {
          const first = firstNameOf(person.name);
          const link = buildWhatsAppLink(person.phone, appNudgeMessage(first, person.reason, firstNameOf(user?.name)));
          return (
            <li key={person.participantId} className="flex items-center gap-3 py-2.5">
              <Avatar name={person.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-gray-900">{person.name}</span>
                <span className="block text-xs text-gray-500">{REASON_LABEL[person.reason]}</span>
                {person.sentAt && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700" title="The support opened the video message in WhatsApp">{sentLabel(person.sentAt)}</span>}
              </span>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" onClick={() => { void markSent(person); }} className="flex-none rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white active:scale-95">Send video</a>
              ) : (
                <span className="flex-none text-xs text-gray-400">No number</span>
              )}
            </li>
          );
        })}
      </ul>
      {saveError && <p role="alert" className="mt-2 text-xs text-red-600">{saveError}</p>}
      <p className="mt-2 text-xs leading-snug text-gray-400">
        You can also send the install videos to anyone you follow up from <NavLink to="/support/mobilisation?tab=follow" className="font-semibold text-gray-500 underline underline-offset-2">Message templates</NavLink> on Follow-ups.
      </p>
    </section>
  );
};

export default AppNudgeCard;
