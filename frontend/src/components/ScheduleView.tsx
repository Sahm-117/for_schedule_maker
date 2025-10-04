import React, { useState, useEffect } from 'react';
import { weeksApi, pendingChangesApi } from '../services/api';
import type { Week, Day, Activity, PendingChange } from '../types';
import DaySchedule from './DaySchedule';
import ActivityModal from './ActivityModal';
import CrossWeekModal from './CrossWeekModal';
import PendingChangesPanel from './PendingChangesPanel';

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
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [crossWeekModalOpen, setCrossWeekModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showPendingChanges, setShowPendingChanges] = useState(false);

  useEffect(() => {
    loadPendingChanges();
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

  const handleEditActivity = (activity: Activity) => {
    setSelectedDay(activity.day || null);
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
    loadPendingChanges();
  };

  const handlePendingChangeApproved = () => {
    loadPendingChanges();
    onWeekUpdate();
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Week {week.weekNumber} Schedule
            </h2>
            <p className="text-gray-600 mt-1">
              Foundation of Faith Programme Week {week.weekNumber}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {pendingChanges.length > 0 && (
              <button
                onClick={() => setShowPendingChanges(!showPendingChanges)}
                className="inline-flex items-center px-4 py-2 border border-orange-200 text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {pendingChanges.length} Pending Change{pendingChanges.length !== 1 ? 's' : ''}
              </button>
            )}

            {!isAdmin && (
              <button
                onClick={handleCrossWeekActivity}
                className="inline-flex items-center px-4 py-2 border border-primary text-primary bg-white rounded-lg hover:bg-primary/5 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Cross-Week Activity
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pending Changes Panel */}
      {showPendingChanges && pendingChanges.length > 0 && (
        <PendingChangesPanel
          pendingChanges={pendingChanges}
          onApprove={handlePendingChangeApproved}
          onReject={handlePendingChangeApproved}
          isAdmin={isAdmin}
        />
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
            isAdmin={isAdmin}
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
    </div>
  );
};

export default ScheduleView;