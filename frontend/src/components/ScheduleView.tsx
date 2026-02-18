import React, { useState, useEffect } from 'react';
import type { Week, Day, Activity, PendingChange } from '../types';
import DaySchedule from './DaySchedule';
import ActivityModal from './ActivityModal';
import CrossWeekModal from './CrossWeekModal';
import { exportWeekToPDF, exportAllWeeksToPDF } from '../utils/pdfExport';

interface ScheduleViewProps {
  week: Week;
  weeks: Week[];
  pendingChanges: PendingChange[];
  onWeekUpdate: () => void;
  onPendingChangesRefresh: () => void;
  isAdmin: boolean;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({
  week,
  weeks,
  pendingChanges,
  onWeekUpdate,
  onPendingChangesRefresh,
  isAdmin,
}) => {
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [crossWeekModalOpen, setCrossWeekModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (week.days.length > 0) {
      setExpandedDays(new Set([week.days[0].id]));
    }
  }, [week.id, week.days]);

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
              Week {week.weekNumber} Schedule
            </h2>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Foundation of Faith Programme Week {week.weekNumber}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            {pendingChanges.length > 0 && (
              <span className="inline-flex items-center px-3 py-2 border border-orange-200 text-orange-700 bg-orange-50 rounded-lg text-sm">
                {pendingChanges.length} pending in this week
              </span>
            )}

            <button
              onClick={handleExportWeek}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Export Week</span>
              <span className="sm:hidden">Export</span>
            </button>

            <button
              onClick={handleExportAllWeeks}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Export All</span>
              <span className="sm:hidden">All</span>
            </button>

            <button
              onClick={handleCrossWeekActivity}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-primary text-primary bg-white rounded-lg hover:bg-primary/5 transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline">Add Cross-Week Activity</span>
              <span className="sm:hidden">Cross-Week</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {week.days.map((day) => (
          <DaySchedule
            key={day.id}
            day={day}
            pendingChanges={getPendingChangesForDay(day.id)}
            onAddActivity={() => handleAddActivity(day)}
            onEditActivity={handleEditActivity}
            onRefresh={handleRefresh}
            isAdmin={isAdmin}
            weekNumber={week.weekNumber}
            isExpanded={expandedDays.has(day.id)}
            onToggleExpansion={() => toggleDayExpansion(day.id)}
          />
        ))}
      </div>

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
