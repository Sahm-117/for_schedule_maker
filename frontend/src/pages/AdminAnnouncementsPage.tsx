import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AnnouncementsModal from '../components/AnnouncementsModal';
import { announcementsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Announcement } from '../types';

const AdminAnnouncementsPage: React.FC = () => {
  const { isAdmin, user, userCohortIds } = useAuth();
  const [showComposer, setShowComposer] = React.useState(false);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const res = await announcementsApi.getHistory({
        userId: user.id,
        isAdmin: true,
        accessibleCohortIds: userCohortIds,
      });
      setHistory(res.announcements);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [user, userCohortIds]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(() => void fetchHistory(), 15000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Broadcast updates and urgent information to support users."
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
      <AnnouncementsModal isOpen onClose={() => {}} embedded showComposer={false} showHistory history={history} loadingHistory={loadingHistory} />
      <AnnouncementsModal
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        showComposer
        showHistory={false}
        onSent={fetchHistory}
      />
    </div>
  );
};

export default AdminAnnouncementsPage;
