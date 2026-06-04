import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';

const SupportSchedulePage: React.FC = () => {
  const { user, userLabelIds } = useAuth();
  const {
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
  } = useAppData();

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/schedule" replace />;
  }

  return (
    <div>
      <PageHeader
        title="My Schedule"
        subtitle="View the activities tagged for your support groups and export your personal schedule."
      />

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <WeekSelector
          weeks={weeks}
          selectedWeek={selectedWeek}
          onWeekSelect={(weekId) => {
            void handleWeekSelect(weekId);
          }}
        />

        <div>
          {selectedWeek ? (
            <ScheduleView
              week={selectedWeek}
              weeks={weeks}
              pendingChanges={pendingChangesForSelectedWeek}
              onWeekUpdate={reloadWeeks}
              onPendingChangesRefresh={refreshPendingChanges}
              isAdmin={false}
              canEdit={false}
              filterLabelIds={userLabelIds}
            />
          ) : (
            <div className="surface-card p-12 text-center text-sm text-gray-500">Select a week to view your schedule.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportSchedulePage;
