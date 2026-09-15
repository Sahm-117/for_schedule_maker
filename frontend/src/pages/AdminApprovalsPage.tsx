import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import CoverRequestsPanel from '../components/CoverRequestsPanel';
import PendingChangesPanel from '../components/PendingChangesPanel';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';

const AdminApprovalsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { globalPendingChanges, handlePendingApprove, handlePendingReject, weeks } = useAppData();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Review schedule change requests and arrange cover for supports."
      />

      <PendingChangesPanel
        pendingChanges={globalPendingChanges}
        onApprove={handlePendingApprove}
        onReject={handlePendingReject}
        isAdmin
        weeks={weeks}
      />
      <div className="mt-6">
        <CoverRequestsPanel />
      </div>
    </div>
  );
};

export default AdminApprovalsPage;
