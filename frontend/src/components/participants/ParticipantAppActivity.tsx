import React, { useEffect, useState } from 'react';
import { participantCheckInsApi, reflectionActivityApi } from '../../services/api';
import { shortMoment } from '../../utils/participantApp';
import type { ParticipantCheckIn, ReflectionActivity } from '../../types';

// What a participant has done in the participant app, for the back office: when
// they reflected each week (never what they wrote) and their "are you okay?" answers.

interface ParticipantAppActivityProps {
  participantId: string;
  cohortId: string | null | undefined;
  weeks: Array<{ id: number; weekNumber: number }>;
}

const ParticipantAppActivity: React.FC<ParticipantAppActivityProps> = ({ participantId, cohortId, weeks }) => {
  const [activity, setActivity] = useState<ReflectionActivity[]>([]);
  const [checkIns, setCheckIns] = useState<ParticipantCheckIn[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (cohortId) {
      reflectionActivityApi.getForCohort(cohortId)
        .then(({ activity: rows }) => { if (!cancelled) setActivity(rows.filter((row) => row.participantId === participantId)); })
        .catch(() => { /* none shown */ });
    }
    participantCheckInsApi.getForParticipants([participantId])
      .then(({ checkIns: rows }) => { if (!cancelled) setCheckIns(rows); })
      .catch(() => { /* none shown */ });
    return () => { cancelled = true; };
  }, [participantId, cohortId]);

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Reflections</p>
        <p className="mt-0.5 text-xs text-gray-500">When they reflected. Only they can read what they wrote.</p>
        {weeks.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No weeks set up.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {weeks.map((week) => {
              const entry = activity.find((row) => row.weekId === week.id);
              return (
                <li key={week.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-700">Week {week.weekNumber}</span>
                  {entry
                    ? <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{shortMoment(entry.createdAt)}</span>
                    : <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">Not yet</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">&ldquo;Are you okay?&rdquo; answers</p>
        <p className="mt-0.5 text-xs text-gray-500">Asked in the app when their attendance slips.</p>
        {checkIns.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No answers yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {checkIns.map((checkIn) => (
              <li key={checkIn.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${checkIn.response === 'NEED_HELP' ? 'bg-red-100/80 text-red-700' : 'bg-emerald-100/80 text-emerald-700'}`}>
                  {checkIn.response === 'NEED_HELP' ? 'I need help' : 'I’m okay'}
                </span>
                <span className="text-gray-500">{shortMoment(checkIn.createdAt)}</span>
                {checkIn.response === 'NEED_HELP' && (
                  <span className="ml-auto text-xs text-gray-500">{checkIn.handledAt ? `Support reached out ${shortMoment(checkIn.handledAt)}` : 'Not yet followed up'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ParticipantAppActivity;
