import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AnnouncementsModal from '../components/AnnouncementsModal';
import { useAuth } from '../hooks/useAuth';

const AdminAnnouncementsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [showComposer, setShowComposer] = React.useState(false);

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
      <AnnouncementsModal isOpen onClose={() => {}} embedded showComposer={false} showHistory />
      <AnnouncementsModal
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        showComposer
        showHistory={false}
      />
    </div>
  );
};

export default AdminAnnouncementsPage;
