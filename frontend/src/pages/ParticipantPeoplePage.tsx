import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';
import { markReadyStepDone } from '../utils/participantApp';
import type { ParticipantPeople } from '../types';

// People: every support/admin in the participant's cohort, and their own group
// members. Photos only — no participant phone numbers, and no support phone
// number except their own support's (already shown on Home / My Group).

// Same card and pill button as the participant week page.
const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const ROW = 'flex items-center gap-3 border-t border-[#f0f0f2] py-3 first:border-t-0';

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

  const participantId = home?.participant.id;
  useEffect(() => {
    if (people && participantId) markReadyStepDone('people', participantId);
  }, [people, participantId]);

  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;
  if (!people) return <PageLoader />;

  const mySupportLink = buildWhatsAppLink(home?.group?.supportPhone, `Hi ${(home?.group?.supportName || 'there').split(' ')[0]}, it's ${home?.participant.name.split(' ')[0] ?? ''} from FOF.`);

  const mySupport = people.supports.find((support) => support.isMySupport) ?? null;
  const otherSupports = people.supports.filter((support) => !support.isMySupport);

  return (
    <div className="max-w-2xl">
      <PageHeader title="People" subtitle="Everyone supporting your FOF journey." tourId="participant:people" />

      <div className="flex flex-col gap-6">
        {/* One card for the person who matters most here: their own support. */}
        {mySupport && (
          <section className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
            <div className="flex items-center gap-4">
              <Avatar name={mySupport.name} avatarUrl={mySupport.avatarUrl} size="lg" className="!h-20 !w-20 !text-2xl" enlargeable />
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-gray-500">Your support</span>
                <h2 className="mt-0.5 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-gray-900">{mySupport.name}</h2>
              </div>
            </div>
            {mySupportLink && (
              <a href={mySupportLink} target="_blank" rel="noreferrer" className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#25d366] px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]">
                Message on WhatsApp
              </a>
            )}
          </section>
        )}

        <section data-wt="pp-group" className={`${SURFACE} px-6 py-5 sm:px-8`}>
          <h2 className="text-[16px] font-semibold text-gray-900">Your group</h2>
          {people.groupName && <p className="mt-0.5 text-[13.5px] text-gray-500">{people.groupName}</p>}
          {people.members.length > 0 ? (
            <ul className="mt-2">
              {people.members.map((member) => (
                <li key={member.name} className={ROW}>
                  <Avatar name={member.name} avatarUrl={member.avatarUrl} size="md" enlargeable />
                  <p className="min-w-0 text-[15px] font-medium text-gray-900">{member.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-gray-500">You are the first in your group so far.</p>
          )}
        </section>

        <section data-wt="pp-cohort" className={`${SURFACE} px-6 py-5 sm:px-8`}>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[16px] font-semibold text-gray-900">Your cohort</h2>
            {people.cohort.length > 0 && <span className="text-[14px] text-gray-400">{people.cohort.length} {people.cohort.length === 1 ? 'person' : 'people'} so far</span>}
          </div>
          {people.cohort.length > 0 ? (
            <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
              {people.cohort.map((member, index) => (
                <li key={`${member.name}-${index}`} className="flex min-w-0 flex-col items-center gap-2">
                  <Avatar name={member.name} avatarUrl={member.avatarUrl} size="lg" enlargeable />
                  <p className="w-full break-words text-center text-[13px] font-medium leading-tight text-gray-700">{member.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-gray-500">You are the first in your cohort so far.</p>
          )}
        </section>

        <section data-wt="pp-supports" className={`${SURFACE} px-6 py-5 sm:px-8`}>
          <h2 className="text-[16px] font-semibold text-gray-900">{mySupport ? 'The support team' : 'Supports'}</h2>
          {otherSupports.length > 0 ? (
            <ul className="mt-2">
              {otherSupports.map((support) => (
                <li key={support.id} className={ROW}>
                  <Avatar name={support.name} avatarUrl={support.avatarUrl} size="md" enlargeable />
                  <p className="min-w-0 flex-1 text-[15px] font-medium text-gray-900">{support.name}</p>
                  <span className="flex-none text-[13px] text-gray-400">{support.role === 'ADMIN' ? 'Admin' : 'Support'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-gray-500">{mySupport ? 'No other supports listed yet.' : 'No supports listed yet.'}</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default ParticipantPeoplePage;
