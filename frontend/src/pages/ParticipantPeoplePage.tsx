import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';
import type { ParticipantPeople } from '../types';

// People: every support/admin in the participant's cohort, and their own group
// members. Photos only — no participant phone numbers, and no support phone
// number except their own support's (already shown on Home / My Group).

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const ParticipantPeoplePage: React.FC = () => {
  const { home } = useParticipantApp();
  const [people, setPeople] = useState<ParticipantPeople | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    participantAppApi.getPeople()
      .then((data) => { if (!cancelled) setPeople(data); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load people.'); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;
  if (!people) return <PageLoader />;

  const mySupportLink = buildWhatsAppLink(home?.group?.supportPhone, `Hi ${(home?.group?.supportName || 'there').split(' ')[0]}, it's ${home?.participant.name.split(' ')[0] ?? ''} from FOF.`);

  return (
    <div className="max-w-2xl">
      <PageHeader title="People" subtitle="Everyone supporting your FOF journey." tourId="participant:people" />

      <div className="flex flex-col gap-4">
        <section data-wt="pp-supports" className={CARD}>
          <h2 className="text-base font-bold text-gray-900">Supports</h2>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {people.supports.map((support) => (
              <div key={support.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#f1f2f5] px-3.5 py-3">
                <Avatar name={support.name} avatarUrl={support.avatarUrl} size="md" enlargeable />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-gray-900">{support.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{support.role === 'ADMIN' ? 'Admin' : 'Support'}</p>
                </div>
                {support.isMySupport && (
                  <span className="rounded-full bg-amber-100/80 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Your support</span>
                )}
                {support.isMySupport && mySupportLink && (
                  <a href={mySupportLink} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-[36px] items-center rounded-[10px] bg-[#25d366] px-3.5 text-xs font-semibold text-white">Contact</a>
                )}
              </div>
            ))}
            {people.supports.length === 0 && <p className="text-[13px] text-gray-500">No supports listed yet.</p>}
          </div>
        </section>

        <section data-wt="pp-group" className={CARD}>
          <h2 className="text-base font-bold text-gray-900">Your group</h2>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {people.members.map((member) => (
              <div key={member.name} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] px-3.5 py-3">
                <Avatar name={member.name} avatarUrl={member.avatarUrl} size="md" enlargeable />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-gray-900">{member.name}</p>
                  {people.groupName && <p className="mt-0.5 text-xs text-gray-500">{people.groupName}</p>}
                </div>
              </div>
            ))}
            {people.members.length === 0 && <p className="text-[13px] text-gray-500">You are the first in your group so far.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ParticipantPeoplePage;
