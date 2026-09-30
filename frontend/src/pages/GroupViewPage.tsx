import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import { formatMeetingTime } from '../components/groups/GroupCallCard';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { myHubApi } from '../services/api';
import { normalizeLink } from '../utils/links';
import type { SupportGroupView } from '../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PLATFORM_LABEL: Record<string, string> = { GOOGLE_MEET: 'Google Meet', WHATSAPP: 'WhatsApp' };

// One support's group as their hub lead (or an admin) sees it: the group
// meeting with Join call. The discussion report and "Read the discussion"
// sit above the meeting card once Group Discussion ships.
const GroupViewPage: React.FC = () => {
  const { supportId = '' } = useParams();
  const { isAdmin } = useAuth();
  const { activeCohort } = useAppData();
  const [searchParams] = useSearchParams();
  // Admins open a group from any cohort; hub leads use the active cohort.
  const cohortId = searchParams.get('cohort') || activeCohort?.id || '';
  const [view, setView] = useState<SupportGroupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supportId || !cohortId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    myHubApi.getSupportGroupView(supportId, cohortId)
      .then((data) => { if (!cancelled) setView(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this group.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supportId, cohortId]);

  const back = isAdmin ? { label: 'Groups', fallbackTo: '/groups' } : { label: 'My Hub', fallbackTo: '/support/my-hub' };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Group" back={back} />
        <div className="flex justify-center py-16"><Spinner /></div>
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Group" back={back} />
        <section className={`${SURFACE} px-6 py-10 text-center`}>
          <p className="text-[15px] text-gray-500">{error || 'This support has no group yet.'}</p>
        </section>
      </div>
    );
  }

  const meetingTime = formatMeetingTime(view.meetingDay, view.meetingTime);
  const callHref = normalizeLink(view.callLink?.trim() || '');
  const details = [view.callPlatform ? PLATFORM_LABEL[view.callPlatform] : null, view.meetingDurationMins ? `${view.meetingDurationMins} minutes` : null].filter(Boolean).join(' · ');

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`${view.supportName}'s group`}
        back={back}
      />
      <div className="flex flex-col gap-4">
        {/* Page subtitles are hidden on phones, so this line sits in the body. */}
        <p className="text-[14px] text-gray-500">
          {view.hubName ? `${view.hubName} · ` : ''}{view.groupName} · {view.participantCount} participant{view.participantCount === 1 ? '' : 's'}
        </p>
        <section data-wt="group-view-meeting" className={`${SURFACE} px-6 py-5`}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">Group meeting</p>
          {meetingTime ? (
            <div className="mt-2 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-[18px] font-bold text-gray-900">{meetingTime}</p>
                {details && <p className="mt-0.5 text-[14px] text-gray-500">{details}</p>}
              </div>
              {callHref && (
                <a href={callHref} target="_blank" rel="noreferrer" className="flex-none rounded-full bg-emerald-600 px-5 py-3 text-[15px] font-semibold text-white active:scale-[0.98]">
                  Join call
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[15px] text-gray-500">Meeting time not set yet.</p>
          )}
          {callHref ? (
            <p className="mt-3 text-[13px] text-gray-400">Opens outside the app. You can join any time.</p>
          ) : (
            <p className="mt-3 text-[13px] text-gray-400">No call link yet.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default GroupViewPage;
