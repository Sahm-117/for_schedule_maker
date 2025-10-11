import React, { useState, useEffect } from 'react';
import { weeksApi, pendingChangesApi, activitiesApi } from '../services/api';
import type { Week, Day, Activity, PendingChange } from '../types';
import DaySchedule from './DaySchedule';
import ActivityModal from './ActivityModal';
import CrossWeekModal from './CrossWeekModal';
import PendingChangesPanel from './PendingChangesPanel';
import HistoryPanel from './HistoryPanel';
import MultiWeekDeleteModal from './MultiWeekDeleteModal';
import { exportWeekToPDF, exportAllWeeksToPDF } from '../utils/pdfExport';
import { useAuth } from '../hooks/useAuth';

interface ScheduleViewProps {
  week: Week;
  weeks: Week[];
  onWeekUpdate: () => void;
  isAdmin: boolean;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({
  week,
  weeks,
  onWeekUpdate,
  isAdmin,
}) => {
  const { user } = useAuth();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [crossWeekModalOpen, setCrossWeekModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showPendingChanges, setShowPendingChanges] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [multiWeekDeleteOpen, setMultiWeekDeleteOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const [existingWeeksForDelete, setExistingWeeksForDelete] = useState<number[]>([]);

  useEffect(() => {
    loadPendingChanges();
    // Set the first day as expanded by default
    if (week.days.length > 0) {
      setExpandedDays(new Set([week.days[0].id]));
    }
  }, [week.id]);

  const loadPendingChanges = async () => {
    try {
      const response = await pendingChangesApi.getByWeek(week.id);
      setPendingChanges(response.pendingChanges);
    } catch (error) {
      console.error('Failed to load pending changes:', error);
    }
  };

  const handleAddActivity = (day: Day) => {
    setSelectedDay(day);
    setEditingActivity(null);
    setActivityModalOpen(true);
  };

  const handleEditActivity = (activity: Activity, day?: Day) => {
    // Use the passed day or find it from the week
    const activityDay = day || week.days.find(d => d.id === activity.dayId);
    setSelectedDay(activityDay || null);
    setEditingActivity(activity);
    setActivityModalOpen(true);
  };

  const handleDeleteFromEdit = async (activity: Activity) => {
    // Close edit modal first
    setActivityModalOpen(false);
    setEditingActivity(null);

    // Find the day for this activity
    const activityDay = week.days.find(d => d.id === activity.dayId);
    if (!activityDay) return;

    // Check if activity exists in multiple weeks
    try {
      const { existingWeeks: weeks } = await activitiesApi.checkDuplicates(
        activity.time,
        activity.description,
        activityDay.dayName
      );

      setActivityToDelete(activity);
      setExistingWeeksForDelete(weeks);
      setMultiWeekDeleteOpen(true);
    } catch (error) {
      console.error('Failed to check existing weeks:', error);
      // Fallback: still open modal with just current week
      setActivityToDelete(activity);
      setExistingWeeksForDelete([week.weekNumber]);
      setMultiWeekDeleteOpen(true);
    }
  };

  const confirmMultiWeekDelete = async (selectedWeeks: number[]) => {
    if (!activityToDelete) return;

    try {
      if (isAdmin) {
        // Admin: Delete immediately from selected weeks
        await activitiesApi.delete(activityToDelete.id, {
          applyToWeeks: selectedWeeks
        });
      } else {
        // Support: Create pending change request with selected weeks
        await pendingChangesApi.create({
          weekId: week.id,
          changeType: 'DELETE',
          changeData: {
            activityId: activityToDelete.id,
            time: activityToDelete.time,
            description: activityToDelete.description,
            period: activityToDelete.period,
            applyToWeeks: selectedWeeks
          },
          userId: user?.id
        });
      }
      onWeekUpdate();
      loadPendingChanges();
    } catch (error) {
      console.error('Failed to delete activity from selected weeks:', error);
    } finally {
      setActivityToDelete(null);
      setMultiWeekDeleteOpen(false);
      setExistingWeeksForDelete([]);
    }
  };

  const handleCrossWeekActivity = () => {
    setCrossWeekModalOpen(true);
  };

  const handleActivitySaved = () => {
    setActivityModalOpen(false);
    setCrossWeekModalOpen(false);
    onWeekUpdate();
    loadPendingChanges();
  };

  const handlePendingChangeApproved = () => {
    loadPendingChanges();
    onWeekUpdate();
  };

  const handleRefresh = () => {
    onWeekUpdate();
    loadPendingChanges();
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
    setExpandedDays(prev => {
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
    return pendingChanges.filter(change => {
      if (change.changeType === 'ADD') {
        return change.changeData?.dayId === dayId;
      }
      if (change.changeType === 'EDIT' || change.changeType === 'DELETE') {
        return change.changeData?.activityId &&
               week.days.find(d => d.id === dayId)?.activities.some(a => a.id === change.changeData.activityId);
      }
      return false;
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* Mobile: First row - History and Export side by side */}
            <div className="flex gap-2 sm:contents">
              {/* History Button */}
              <button
                onClick={() => setShowHistory(true)}
                className="history-btn flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-purple-200 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">History</span>
                <span className="sm:hidden">History</span>
              </button>

              {/* Export Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={handleExportWeek}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setShowExportDropdown(!showExportDropdown);
                  }}
                  className="export-btn w-full sm:w-auto inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors text-sm group"
                >
                  <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">Export Week</span>
                  <span className="sm:hidden">Export</span>
                  <svg
                    className="w-4 h-4 ml-1 sm:ml-2 cursor-pointer"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowExportDropdown(!showExportDropdown);
                    }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showExportDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowExportDropdown(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                      <button
                        onClick={() => {
                          handleExportWeek();
                          setShowExportDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 rounded-t-lg flex items-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Current Week
                      </button>
                      <button
                        onClick={() => {
                          handleExportAllWeeks();
                          setShowExportDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-b-lg flex items-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export All Weeks
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Pending Changes (conditionally shown) */}
            {pendingChanges.length > 0 && (
              <button
                onClick={() => setShowPendingChanges(!showPendingChanges)}
                className="pending-changes-btn inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-orange-200 text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">{pendingChanges.length} Pending Change{pendingChanges.length !== 1 ? 's' : ''}</span>
                <span className="sm:hidden">{pendingChanges.length} Pending</span>
              </button>
            )}

            {/* Mobile: Second row - Cross-Week Activity (full width) */}
            {isAdmin && (
              <button
                onClick={handleCrossWeekActivity}
                className="add-cross-week-btn w-full sm:w-auto inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-primary text-primary bg-white rounded-lg hover:bg-primary/5 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline">Add Cross-Week Activity</span>
                <span className="sm:hidden">Cross-Week</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pending Changes Panel */}
      {showPendingChanges && pendingChanges.length > 0 && (
        <div className="pending-changes-panel">
          <PendingChangesPanel
            pendingChanges={pendingChanges}
            onApprove={handlePendingChangeApproved}
            onReject={handlePendingChangeApproved}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {/* Days Grid */}
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
            isExpanded={expandedDays.has(day.id)}
            onToggleExpansion={() => toggleDayExpansion(day.id)}
            currentWeek={week.weekNumber}
            allWeeks={weeks}
          />
        ))}
      </div>

      {/* Activity Modal */}
      {activityModalOpen && selectedDay && (
        <ActivityModal
          isOpen={activityModalOpen}
          onClose={() => setActivityModalOpen(false)}
          day={selectedDay}
          activity={editingActivity}
          weeks={weeks}
          onSave={handleActivitySaved}
          isAdmin={isAdmin}
          currentWeek={week.weekNumber}
          onDelete={handleDeleteFromEdit}
        />
      )}

      {/* Cross-Week Modal */}
      {crossWeekModalOpen && (
        <CrossWeekModal
          isOpen={crossWeekModalOpen}
          onClose={() => setCrossWeekModalOpen(false)}
          weeks={weeks}
          currentWeek={week}
          onSave={handleActivitySaved}
        />
      )}

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />

      {/* Multi-Week Delete Modal (triggered from Edit modal) */}
      <MultiWeekDeleteModal
        isOpen={multiWeekDeleteOpen}
        onClose={() => {
          setMultiWeekDeleteOpen(false);
          setActivityToDelete(null);
          setExistingWeeksForDelete([]);
        }}
        onConfirm={confirmMultiWeekDelete}
        activity={activityToDelete}
        currentWeek={week.weekNumber}
        allWeeks={weeks}
        isAdmin={isAdmin}
        existingWeeks={existingWeeksForDelete}
      />
    </div>
  );
};

export default ScheduleView;