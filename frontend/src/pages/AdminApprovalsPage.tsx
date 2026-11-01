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

      {globalPendingChanges.length === 0 ? (
        <div className="surface-card flex items-center gap-3 px-5 py-4" data-testid="approvals-empty">
          <svg className="h-6 w-6 flex-none text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-gray-900">Nothing waiting</p>
            <p className="text-xs text-gray-500">New change requests show up here, and as a count on the Approvals tab next to Schedule.</p>
          </div>
        </div>
      ) : (
        <PendingChangesPanel
          pendingChanges={globalPendingChanges}
          onApprove={handlePendingApprove}
          onReject={handlePendingReject}
          isAdmin={can('schedule', 'edit')}
          weeks={weeks}
        />
      )}
    </div>
  );
};

export default AdminApprovalsPage;
