import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import NotificationSettings from '../components/NotificationSettings';
import { useAuth } from '../hooks/useAuth';

const SupportProfilePage: React.FC = () => {
  const { user, userLabelIds } = useAuth();

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/settings" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Profile & Preferences"
        subtitle="Review your account details and control notification timing."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="surface-card p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-2xl font-bold text-primary">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{user.name}</h3>
              <p className="text-sm text-gray-500">{user.email || user.phone || 'No contact detail'}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <InfoRow label="Role" value={user.role} />
            <InfoRow label="Support labels" value={`${userLabelIds.length}`} />
            <InfoRow label="Account type" value="Production user" />
          </div>
        </div>

        <NotificationSettings isOpen onClose={() => {}} embedded />
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="surface-muted flex items-center justify-between px-4 py-3">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-semibold text-gray-900">{value}</span>
  </div>
);

export default SupportProfilePage;
