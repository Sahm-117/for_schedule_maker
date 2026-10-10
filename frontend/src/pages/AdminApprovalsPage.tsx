import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PendingChangesPanel from '../components/PendingChangesPanel';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';

const AdminApprovalsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const { globalPendingChanges, handlePendingApprove, handlePendingReject, weeks } = useAppData();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Review schedule change requests."
      />

      <PendingChangesPanel
        pendingChanges={globalPendingChanges}
        onApprove={handlePendingApprove}
        onReject={handlePendingReject}
        isAdmin={can('schedule', 'edit')}
        weeks={weeks}
      />
    </div>
  );
};

export default AdminApprovalsPage;
