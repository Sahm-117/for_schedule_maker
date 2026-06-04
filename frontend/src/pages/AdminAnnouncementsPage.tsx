import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AnnouncementsModal from '../components/AnnouncementsModal';
import { useAuth } from '../hooks/useAuth';

const AdminAnnouncementsPage: React.FC = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Broadcast updates and urgent information to support users."
      />
      <AnnouncementsModal isOpen onClose={() => {}} embedded />
    </div>
  );
};

export default AdminAnnouncementsPage;
