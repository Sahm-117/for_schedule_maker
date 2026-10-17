import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { hubJobAudienceLabel } from '../components/hubs/hubJobs';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { usePolling } from '../hooks/usePolling';
import { announcementsApi } from '../services/api';
import type { Announcement } from '../types';

// "Today, 7:51 AM", "Yesterday, 5:00 PM", then the date (with the year when it is not this one), in Lagos time.
const LAGOS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' });
const LAGOS_TIME = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
const LAGOS_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const LAGOS_DATE_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
const whenLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const time = LAGOS_TIME.format(date).toUpperCase();
  if (LAGOS_DAY.format(date) === LAGOS_DAY.format(today)) return `Today, ${time}`;
  if (LAGOS_DAY.format(date) === LAGOS_DAY.format(new Date(today.getTime() - 86400000))) return `Yesterday, ${time}`;
  const sameYear = LAGOS_DAY.format(date).slice(0, 4) === LAGOS_DAY.format(today).slice(0, 4);
  return `${(sameYear ? LAGOS_DATE : LAGOS_DATE_YEAR).format(date)}, ${time}`;
};

const AnnouncementsFeedPage: React.FC = () => {
  const { user, isAdmin, userCohortIds, userLabelIds } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const userId = user?.id;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Only the first load (or a change of cohort) shows a spinner. The 15-second
  // check and live updates are silent and only redraw the list if it changed.
  const idsRef = useRef({ userCohortIds, userLabelIds });
  idsRef.current = { userCohortIds, userLabelIds };
  const cohortId = activeCohort?.id || null;

  const fetchFeed = useCallback((silent: boolean) => {
    if (!userId) return Promise.resolve();
    if (!silent) setLoading(true);
    return announcementsApi.getHistory({
      cohortId,
      userId,
      isAdmin,
      accessibleCohortIds: idsRef.current.userCohortIds,
      userLabelIds: idsRef.current.userLabelIds,
    })
      .then((res) => setAnnouncements((prev) => (JSON.stringify(prev) === JSON.stringify(res.announcements) ? prev : res.announcements)))
      .catch(() => { if (!silent) setAnnouncements([]); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [cohortId, isAdmin, userId]);

  useEffect(() => { void fetchFeed(false); }, [fetchFeed]);

  const firstRevision = useRef(true);
  useEffect(() => {
    if (firstRevision.current) { firstRevision.current = false; return; }
    void fetchFeed(true);
  }, [liveRevision, fetchFeed]);

  usePolling(() => fetchFeed(true), 15000);

  if (!user) return null;

  if (user.role !== 'SUPPORT' && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const backTo = user.role === 'SUPPORT' ? '/support' : '/dashboard';

  return (
    <div>
      <PageHeader
        title={user.role === 'SUPPORT' ? 'Your Announcements' : 'Announcements'}
        subtitle={activeCohort ? `These are the updates shared with ${activeCohort.name}, plus anything sent to everyone.` : 'These are the updates shared with your team, plus anything sent to everyone.'}
        action={(
          <NavLink
            to={backTo}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-200 px-4 text-sm font-semibold text-gray-700 hover:bg-orange-50"
          >
            Back
          </NavLink>
        )}
      />

      <div className="surface-card p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-12 text-center text-sm text-gray-500">
            No announcements have been sent yet.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => (
              <article key={item.id} className="rounded-3xl border border-orange-100 bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {hubJobAudienceLabel(item.targetHubJobs) && (
                    <span className="inline-flex rounded-full bg-violet-100/80 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">{hubJobAudienceLabel(item.targetHubJobs)}</span>
                  )}
                  <span className="text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-gray-500">
                    {item.homeLabel || (item.scope === 'ALL_USERS' ? 'All users' : item.cohortName || activeCohort?.name || 'Active cohort')}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">{whenLabel(item.sentAt)}</span>
                </div>
                <h2 className="mt-1.5 text-base font-semibold text-gray-900">{item.subject}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">{item.body}</p>
                {item.linkUrl && (/^(https?:|mailto:|tel:)/i.test(item.linkUrl) ? (
                  <a href={item.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-[13px] font-semibold text-white">{item.linkLabel || 'Open the link'}</a>
                ) : item.linkUrl.startsWith('/') && !item.linkUrl.startsWith('//') ? (
                  <NavLink to={item.linkUrl} className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-[13px] font-semibold text-white">{item.linkLabel || 'Open'}</NavLink>
                ) : null)}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsFeedPage;
