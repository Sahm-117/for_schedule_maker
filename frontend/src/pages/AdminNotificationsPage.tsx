import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import NotificationDelivery from '../components/notifications/NotificationDelivery';
import { useAuth } from '../hooks/useAuth';

const AdminNotificationsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Notifications" subtitle="What went out, who got it, and who has read it." />
      <NotificationDelivery />
    </div>
  );
};

export default AdminNotificationsPage;
