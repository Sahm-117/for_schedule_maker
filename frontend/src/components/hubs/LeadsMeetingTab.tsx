import React, { useEffect, useState } from 'react';
import Spinner from '../Spinner';
import { formatMeetingSlot } from '../groups/GroupCallCard';
import JoinCallButton from '../JoinCallButton';
import { myHubApi } from '../../services/api';
import { normalizeLink } from '../../utils/links';
import { nextOccurrences } from '../../utils/meetingDates';
import type { HubLeadsMeeting } from '../../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white active:scale-[0.98]';

// The weekly meeting for Hub Leads. Read-only: an admin sets the time and link.
const LeadsMeetingTab: React.FC<{ cohortId: string }> = ({ cohortId }) => {
  const [meeting, setMeeting] = useState<HubLeadsMeeting | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMeeting(null);
    setError('');
    myHubApi.getLeadsMeeting(cohortId)
      .then((m) => { if (!cancelled) setMeeting(m); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Hub Leads meeting.'); });
    return () => { cancelled = true; };
  }, [cohortId]);

  if (error) return <section className={`${SURFACE} px-6 py-6`}><p className="text-[15px] text-gray-500">{error}</p></section>;
  if (!meeting) return <section className={`${SURFACE} flex justify-center px-6 py-10`}><Spinner /></section>;

  const slot = formatMeetingSlot(meeting.meetingDay, meeting.meetingTime, meeting.meetingDurationMins);
  const href = meeting.callLink?.trim() ? normalizeLink(meeting.callLink.trim()) : null;
  const next = nextOccurrences(meeting.meetingDay, meeting.meetingTime, 2);

  return (
    <div className="flex flex-col gap-4" data-wt="hub-leads-meeting">
      <section className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
        <span className="inline-flex rounded-full bg-violet-100/80 px-2.5 py-1 text-xs font-semibold text-violet-700">Hub Leads only</span>
        <h2 className="mt-3 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">Hub Leads meeting</h2>
        <p className="mt-3 text-[15.5px] leading-[1.7] text-gray-600">
          {slot ? `Meets ${slot}.` : 'Your admin has not set a time yet.'}
        </p>
        {href && (
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <JoinCallButton href={href} day={meeting.meetingDay} time={meeting.meetingTime} durationMins={meeting.meetingDurationMins} className={PRIMARY} />
          </div>
        )}
        <p className="mt-5 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-[13px] text-gray-500">
          Hub Leads meet once a week to align with each other. Your admin sets the time and link, and tells you if they change.
        </p>
      </section>

      {next.length > 0 && (
        <section className={`${SURFACE} px-6 py-5 sm:px-8`}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">Next meetings</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {next.map((label) => (
              <li key={label} className="flex items-center justify-between py-3">
                <span className="text-[15px] font-semibold text-gray-900">{label}</span>
                <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs font-semibold text-gray-600">{formatMeetingSlot(meeting.meetingDay, meeting.meetingTime)?.split(', ')[1]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default LeadsMeetingTab;
