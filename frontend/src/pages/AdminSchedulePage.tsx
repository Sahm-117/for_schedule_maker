import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';

const AdminSchedulePage: React.FC = () => {
  const { user, isAdmin, isSopPreparer, userLabelIds } = useAuth();
  const {
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    loading,
  } = useAppData();

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support/schedule" replace />;
  }

  if (loading) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Manage weekly programme activities, exports, and approval-aware edits."
      />

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <WeekSelector
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekSelect={(weekId) => {
              void handleWeekSelect(weekId);
            }}
          />
        </div>

        <div>
          {selectedWeek ? (
            <ScheduleView
              week={selectedWeek}
              weeks={weeks}
              pendingChanges={pendingChangesForSelectedWeek}
              onWeekUpdate={reloadWeeks}
              onPendingChangesRefresh={refreshPendingChanges}
              isAdmin={isAdmin}
              canEdit={isAdmin || isSopPreparer}
              filterLabelIds={isAdmin || isSopPreparer ? undefined : userLabelIds}
            />
          ) : (
            <div className="surface-card p-12 text-center text-sm text-gray-500">Select a week to view the schedule.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSchedulePage;
