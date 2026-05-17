import React, { useState, useEffect } from 'react';
import type { Week, Day, Activity, PendingChange } from '../types';
import DaySchedule from './DaySchedule';
import ActivityModal from './ActivityModal';
import CrossWeekModal from './CrossWeekModal';
import { exportWeekToPDF, exportAllWeeksToPDF } from '../utils/pdfExport';
import { useAuth } from '../hooks/useAuth';

interface ScheduleViewProps {
  week: Week;
  weeks: Week[];
  pendingChanges: PendingChange[];
  onWeekUpdate: () => void;
  onPendingChangesRefresh: () => void;
  isAdmin: boolean;
  canEdit?: boolean;
  filterLabelIds?: string[];
}

const ScheduleView: React.FC<ScheduleViewProps> = ({
  week,
  weeks,
  pendingChanges,
  onWeekUpdate,
  onPendingChangesRefresh,
  isAdmin,
  canEdit = false,
  filterLabelIds,
}) => {
  const { userLabelIds } = useAuth();
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [crossWeekModalOpen, setCrossWeekModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const isFiltered = Array.isArray(filterLabelIds);

  useEffect(() => {
    if (week.days.length > 0) {
      setExpandedDays(new Set([week.days[0].id]));
    }
  }, [week.id, week.days]);

  const filterActivities = (activities: Activity[]): Activity[] => {
    if (!isFiltered || filterLabelIds.length === 0) return activities;
    return activities.filter((a) =>
      a.labels?.some((l) => filterLabelIds.includes(l.id))
    );
  };

  const visibleDays = week.days.filter((day) => {
    if (!isFiltered) return true;
    return filterActivities(day.activities).length > 0;
  });

  const hasNoLabelAssigned = isFiltered && filterLabelIds.length === 0;
  const hasLabelsButNoActivities =
    isFiltered && filterLabelIds.length > 0 && visibleDays.length === 0;

  const handleAddActivity = (day: Day) => {
    setSelectedDay(day);
    setEditingActivity(null);
    setActivityModalOpen(true);
  };

  const handleEditActivity = (activity: Activity, day?: Day) => {
    const activityDay = day || week.days.find((d) => d.id === activity.dayId);
    setSelectedDay(activityDay || null);
    setEditingActivity(activity);
    setActivityModalOpen(true);
  };

  const handleCrossWeekActivity = () => {
    setCrossWeekModalOpen(true);
  };

  const handleActivitySaved = () => {
    setActivityModalOpen(false);
    setCrossWeekModalOpen(false);
    onWeekUpdate();
    onPendingChangesRefresh();
  };

  const handleRefresh = () => {
    onWeekUpdate();
    onPendingChangesRefresh();
  };

  const handleExportWeek = async () => {
    try {
      await exportWeekToPDF(week, { includeEmptyDays: false });
    } catch (error) {
      console.error('Failed to export week:', error);
    }
  };

  const handleExportAllWeeks = async () => {
    try {
      await exportAllWeeksToPDF(weeks, { includeEmptyDays: false });
    } catch (error) {
      console.error('Failed to export all weeks:', error);
    }
  };

  const handleExportMySchedule = async () => {
    try {
      await exportWeekToPDF(week, { includeEmptyDays: false, filterLabelIds: userLabelIds });
    } catch (error) {
      console.error('Failed to export personal schedule:', error);
    }
  };

  const toggleDayExpansion = (dayId: number) => {
    setExpandedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dayId)) {
        newSet.delete(dayId);
      } else {
        newSet.add(dayId);
      }
      return newSet;
    });
  };

  const getPendingChangesForDay = (dayId: number) => {
    return pendingChanges.filter((change) => {
      if (change.changeType === 'ADD') {
        return change.changeData?.dayId === dayId;
      }
      if (change.changeType === 'EDIT' || change.changeType === 'DELETE') {
        return change.changeData?.activityId &&
          week.days.find((d) => d.id === dayId)?.activities.some((a) => a.id === change.changeData.activityId);
      }
      return false;
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isFiltered ? 'My Schedule' : 'Week ' + week.weekNumber + ' Schedule'}
            </h2>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Foundation of Faith Programme — Week {week.weekNumber}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            {pendingChanges.length > 0 && (
              <span className="inline-flex items-center px-3 py-2 border border-orange-200 text-orange-700 bg-orange-50 rounded-lg text-sm">
                {pendingChanges.length} pending in this week
              </span>
            )}

            {(isAdmin || canEdit) ? (
              <>
                <button
                  data-tour="export-week"
                  onClick={handleExportWeek}
                  className="inline-flex items-center justify-center w-9 h-9 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  title="Export Week"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>

                <button
                  onClick={handleExportAllWeeks}
                  className="inline-flex items-center justify-center w-9 h-9 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  title="Export All Weeks"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>

                <button
                  onClick={handleCrossWeekActivity}
                  className="inline-flex items-center justify-center w-9 h-9 border border-primary text-primary bg-white rounded-lg hover:bg-primary/5 transition-colors"
                  title="Add Cross-Week Activity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                data-tour="export-my-schedule"
                onClick={handleExportMySchedule}
                disabled={hasNoLabelAssigned || hasLabelsButNoActivities}
                className="inline-flex items-center px-3 sm:px-4 py-2 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export My Schedule
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty states for support users */}
      {hasNoLabelAssigned && (
        <div className="bg-white rounded-lg shadow p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No support group assigned yet</h3>
          <p className="text-sm text-gray-500">Ask your admin to assign you to a support group so you can see your activities.</p>
        </div>
      )}

      {hasLabelsButNoActivities && (
        <div className="bg-white rounded-lg shadow p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No activities for you this week</h3>
          <p className="text-sm text-gray-500">No activities tagged with your support group were found for Week {week.weekNumber}. Check back later or browse other weeks.</p>
        </div>
      )}

      {!hasNoLabelAssigned && !hasLabelsButNoActivities && (
        <div className="grid grid-cols-1 gap-6">
          {visibleDays.map((day) => (
            <DaySchedule
              key={day.id}
              day={day}
              pendingChanges={getPendingChangesForDay(day.id)}
              onAddActivity={() => handleAddActivity(day)}
              onEditActivity={handleEditActivity}
              onRefresh={handleRefresh}
              isAdmin={isAdmin}
              canEdit={canEdit}
              weekNumber={week.weekNumber}
              isExpanded={expandedDays.has(day.id)}
              onToggleExpansion={() => toggleDayExpansion(day.id)}
              filterLabelIds={filterLabelIds}
            />
          ))}
        </div>
      )}

      {activityModalOpen && selectedDay && (
        <ActivityModal
          isOpen={activityModalOpen}
          onClose={() => setActivityModalOpen(false)}
          day={selectedDay}
          activity={editingActivity}
          weeks={weeks}
          onSave={handleActivitySaved}
          isAdmin={isAdmin}
        />
      )}

      {crossWeekModalOpen && (
        <CrossWeekModal
          isOpen={crossWeekModalOpen}
          onClose={() => setCrossWeekModalOpen(false)}
          weeks={weeks}
          currentWeek={week}
          onSave={handleActivitySaved}
        />
      )}
    </div>
  );
};

export default ScheduleView;
