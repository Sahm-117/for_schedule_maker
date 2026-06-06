import React, { useEffect, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { announcementsApi } from '../services/api';
import type { Announcement } from '../types';

const AnnouncementsFeedPage: React.FC = () => {
  const { user, isAdmin, isSopPreparer, userCohortIds } = useAuth();
  const { activeCohort } = useAppData();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user.id,
      isAdmin: isAdmin || isSopPreparer,
      accessibleCohortIds: userCohortIds,
    })
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, [activeCohort?.id, isAdmin, isSopPreparer, user?.id, userCohortIds]);

  if (!user) return null;

  if (user.role !== 'SUPPORT' && !isSopPreparer && !isAdmin) {
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{item.subject}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.scope === 'ALL_USERS' ? 'All Users' : item.cohortName || activeCohort?.name || 'Active Cohort'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Intl.DateTimeFormat('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(item.sentAt))}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsFeedPage;
