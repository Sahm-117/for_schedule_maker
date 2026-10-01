import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import StaffDiscussionPanel from '../components/discussion/StaffDiscussionPanel';
import GroupPeopleOverview from '../components/groups/GroupPeopleOverview';
import { formatMeetingTime } from '../components/groups/GroupCallCard';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupDiscussionApi, myHubApi, practiceApi } from '../services/api';
import { normalizeLink } from '../utils/links';
import type { DiscussionActivity, SupportGroupView } from '../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PLATFORM_LABEL: Record<string, string> = { GOOGLE_MEET: 'Google Meet', WHATSAPP: 'WhatsApp' };

// One support's group as their hub lead (or an admin) sees it: the
// discussion first ("Discussion this week" + Read the discussion), then the
// group meeting with Join call.
const GroupViewPage: React.FC = () => {
  const { supportId = '' } = useParams();
  const { isAdmin, user } = useAuth();
  const { activeCohort } = useAppData();
  const [searchParams] = useSearchParams();
  // Admins open a group from any cohort; hub leads use the active cohort.
  const cohortId = searchParams.get('cohort') || activeCohort?.id || '';
  const [view, setView] = useState<SupportGroupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<DiscussionActivity | null>(null);
  const [reading, setReading] = useState(false);

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

  const groupId = view?.groupId ?? '';
  const loadActivity = React.useCallback(() => {
    if (!groupId) return;
    groupDiscussionApi.activity(groupId).then(setActivity).catch(() => setActivity(null));
  }, [groupId]);
  useEffect(() => { loadActivity(); }, [loadActivity]);

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

  // In Practice, opening the discussion counts for the "read the discussion" step even when
  // the group is empty (no posts or participants to detect).
  const openReading = () => {
    setReading((v) => !v);
    if (!reading && activeCohort?.isPractice) void practiceApi.setMine('hl-group', true, false).catch(() => undefined);
  };

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
        <section data-wt="group-view-discussion" className={`${SURFACE} px-6 py-5`}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">Discussion this week</p>
          {activity ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {[
                  [activity.postsAndReplies, 'posts & replies'],
                  [activity.active, `active of ${activity.members}`],
                  [activity.quiet, 'quiet 2+ wks'],
                ].map(([n, label]) => (
                  <div key={String(label)} className="rounded-2xl bg-[#f6f7f9] px-2 py-3 text-center">
                    <p className="text-[22px] font-bold text-gray-900">{n}</p>
                    <p className="text-[12px] leading-tight text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
              {activity.mostActive.length > 0 && (
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-emerald-700">Most active</p>
                  <p className="text-[15px] text-gray-900">{activity.mostActive.join(' · ')}</p>
                </div>
              )}
              {activity.goneQuiet.length > 0 && (
                <div className="mt-3">
                  <p className="text-[13px] font-semibold text-amber-700">Gone quiet</p>
                  <p className="text-[15px] text-gray-900">{activity.goneQuiet.join(' · ')}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-center py-6"><Spinner /></div>
          )}
        </section>

        <section className={SURFACE}>
          <button type="button" onClick={openReading} aria-expanded={reading} className="flex w-full items-center gap-3 px-6 py-5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-bold text-gray-900">Read the discussion</span>
              <span className="block truncate text-[13px] text-gray-500">
                {activity?.latest ? `Latest: “${activity.latest.body}”` : 'No posts yet'}
              </span>
            </span>
            <svg className={`h-4 w-4 flex-none text-gray-400 transition ${reading ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
          </button>
        </section>
        {reading && (
          <StaffDiscussionPanel groupId={view.groupId} viewerName={user?.name ?? ''} viewerAvatarUrl={user?.avatarUrl} onChanged={loadActivity} />
        )}

        <GroupPeopleOverview groupId={view.groupId} />

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
