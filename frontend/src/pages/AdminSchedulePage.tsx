import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import type { Day } from '../types';
import { exportAllWeeksToPDF, exportDayToPDF, exportWeekToPDF } from '../utils/pdfExport';

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
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const [showDayExportPicker, setShowDayExportPicker] = React.useState(false);
  const [headerAddDayId, setHeaderAddDayId] = React.useState<number | null>(null);
  const [showDayAddPicker, setShowDayAddPicker] = React.useState(false);
  const [crossWeekRequest, setCrossWeekRequest] = React.useState(0);

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support/schedule" replace />;
  }

  if (loading) {
    return null;
  }

  const canManageSchedule = isAdmin || isSopPreparer;

  const exportSelectedWeek = async () => {
    if (!selectedWeek) return;
    setShowExportMenu(false);
    await exportWeekToPDF(selectedWeek, { includeEmptyDays: false });
  };

  const exportAllWeeks = async () => {
    setShowExportMenu(false);
    await exportAllWeeksToPDF(weeks, { includeEmptyDays: false });
  };

  const exportDay = async (day: Day) => {
    if (!selectedWeek) return;
    setShowDayExportPicker(false);
    await exportDayToPDF(selectedWeek, day, { includeEmptyDays: false });
  };

  const headerAction = selectedWeek && canManageSchedule ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setShowDayAddPicker(true)}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5"
      >
        Add Activity
      </button>
      <button
        type="button"
        onClick={() => setCrossWeekRequest((prev) => prev + 1)}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-200 px-4 text-sm font-semibold text-gray-700 hover:bg-orange-50"
      >
        Cross-Week
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowExportMenu((prev) => !prev)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Export
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </button>
        {showExportMenu && (
          <div className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-orange-100 bg-white p-2 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu(false);
                setShowDayExportPicker(true);
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Daily export
            </button>
            <button
              type="button"
              onClick={() => {
                void exportSelectedWeek();
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Export week
            </button>
            <button
              type="button"
              onClick={() => {
                void exportAllWeeks();
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Export all
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Manage weekly programme activities, exports, and approval-aware edits."
        action={headerAction}
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
              showInlineAdminActions={false}
              externalAddDayId={headerAddDayId}
              onExternalAddHandled={() => setHeaderAddDayId(null)}
              externalCrossWeekRequest={crossWeekRequest}
              onExternalCrossWeekHandled={() => setCrossWeekRequest(0)}
            />
          ) : (
            <div className="surface-card p-12 text-center text-sm text-gray-500">Select a week to view the schedule.</div>
          )}
        </div>
      </div>

      {showDayAddPicker && selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Choose a day</h2>
                <p className="text-sm text-gray-500">Open the activity form for a specific day in Week {selectedWeek.weekNumber}.</p>
              </div>
              <button type="button" onClick={() => setShowDayAddPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {selectedWeek.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    setHeaderAddDayId(day.id);
                    setShowDayAddPicker(false);
                  }}
                  className="w-full rounded-2xl border border-orange-100 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-orange-50"
                >
                  {day.dayName}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showDayExportPicker && selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Daily export</h2>
                <p className="text-sm text-gray-500">Choose which day from Week {selectedWeek.weekNumber} to export.</p>
              </div>
              <button type="button" onClick={() => setShowDayExportPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {selectedWeek.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    void exportDay(day);
                  }}
                  className="w-full rounded-2xl border border-orange-100 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-orange-50"
                >
                  {day.dayName}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSchedulePage;
