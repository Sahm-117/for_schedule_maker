import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Avatar from '../Avatar';
import { appNudgeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { appNudgeMessage } from '../../constants/installVideos';
import { buildWhatsAppLink } from '../../utils/phone';
import type { AppNudgePerson } from '../../types';

// Home card for supports: participants who have signed in but still need the app
// (not on their Home Screen, or alerts off). One tap opens WhatsApp with the install
// video already in the message. It goes away on its own as people finish, and the
// server stops listing anyone once their cohort has started.

const REASON_LABEL: Record<AppNudgePerson['reason'], string> = { NOT_INSTALLED: 'Not installed', NO_ALERTS: 'No alerts' };

const AppNudgeCard: React.FC = () => {
  const { user } = useAuth();
  const [people, setPeople] = useState<AppNudgePerson[]>([]);

  useEffect(() => {
    let live = true;
    appNudgeApi.mine().then((list) => { if (live) setPeople(list); }).catch(() => { /* optional card: stay hidden */ });
    return () => { live = false; };
  }, []);

  if (people.length === 0) return null;

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]" aria-label="Participants who still need the app">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Get them on the app</p>
      <p className="mt-0.5 text-[17px] font-bold leading-snug text-gray-900">
        {people.length === 1 ? '1 participant still needs' : `${people.length} participants still need`} the app
      </p>
      <ul className="mt-2 divide-y divide-gray-100">
        {people.map((person) => {
          const first = person.name.split(' ')[0];
          const link = buildWhatsAppLink(person.phone, appNudgeMessage(first, person.reason, user?.name?.split(' ')[0]));
          return (
            <li key={person.participantId} className="flex items-center gap-3 py-2.5">
              <Avatar name={person.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-gray-900">{person.name}</span>
                <span className="block text-xs text-gray-500">{REASON_LABEL[person.reason]}</span>
              </span>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="flex-none rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white active:scale-95">Send video</a>
              ) : (
                <span className="flex-none text-xs text-gray-400">No number</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-snug text-gray-400">
        You can also send the install videos to anyone you follow up from <NavLink to="/support/mobilisation?tab=follow" className="font-semibold text-gray-500 underline underline-offset-2">Message templates</NavLink> on Follow-ups.
      </p>
    </section>
  );
};

export default AppNudgeCard;
