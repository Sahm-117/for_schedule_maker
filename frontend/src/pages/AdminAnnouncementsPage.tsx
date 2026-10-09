import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AnnouncementsModal from '../components/AnnouncementsModal';
import { announcementsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePolling } from '../hooks/usePolling';
import type { Announcement } from '../types';

const sameList = (a: Announcement[], b: Announcement[]) => JSON.stringify(a) === JSON.stringify(b);

const AdminAnnouncementsPage: React.FC = () => {
  const { isAdmin, user, userCohortIds } = useAuth();
  const [showComposer, setShowComposer] = React.useState(false);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // The signed-in user object and the cohort list get new identities whenever
  // the app refreshes its data, so key on the id and keep the list in a ref.
  // Only the very first load shows a spinner; later checks are silent and only
  // redraw the list when something actually changed.
  const userId = user?.id;
  const cohortIdsRef = useRef(userCohortIds);
  cohortIdsRef.current = userCohortIds;

  const fetchHistory = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoadingHistory(true);
    try {
      const res = await announcementsApi.getHistory({
        userId,
        isAdmin: true,
        accessibleCohortIds: cohortIdsRef.current,
      });
      setHistory((prev) => (sameList(prev, res.announcements) ? prev : res.announcements));
    } catch {
      // ignore
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  usePolling(() => fetchHistory(true), 15000);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        tourId="admin:announcements"
        subtitle="Send updates and urgent messages to support users."
        action={(
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Add Announcement
          </button>
        )}
      />
      <div data-wt="announcements-history">
        <AnnouncementsModal isOpen onClose={() => {}} embedded showComposer={false} showHistory history={history} loadingHistory={loadingHistory} onSent={() => void fetchHistory(true)} />
      </div>
      <AnnouncementsModal
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        showComposer
        showHistory={false}
        onSent={() => void fetchHistory(true)}
      />
    </div>
  );
};

export default AdminAnnouncementsPage;
