import React, { useState } from 'react';
import { activitiesApi, pendingChangesApi } from '../services/api';
import type { Day, Activity, PendingChange } from '../types';
import ActivityCard from './ActivityCard';
import ConfirmationModal from './ConfirmationModal';

interface DayScheduleProps {
  day: Day;
  pendingChanges: PendingChange[];
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onRefresh: () => void;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggleExpansion: () => void;
}

const DaySchedule: React.FC<DayScheduleProps> = ({
  day,
  pendingChanges,
  onAddActivity,
  onEditActivity,
  onRefresh,
  isAdmin,
  isExpanded,
  onToggleExpansion,
}) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null);
  const getDayDisplayName = (dayName: string) => {
    const dayNames: { [key: string]: string } = {
      'MONDAY': 'Monday',
      'TUESDAY': 'Tuesday',
      'WEDNESDAY': 'Wednesday',
      'THURSDAY': 'Thursday',
      'FRIDAY': 'Friday',
      'SATURDAY': 'Saturday',
      'SUNDAY': 'Sunday',
    };
    return dayNames[dayName] || dayName;
  };

  const getPeriodActivities = (period: 'MORNING' | 'AFTERNOON' | 'EVENING') => {
    return day.activities
      .filter(activity => activity.period === period)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  };

  const getPendingChangesForActivity = (activityId: number) => {
    return pendingChanges.filter(change =>
      change.changeData?.activityId === activityId
    );
  };

  const getAddPendingChanges = () => {
    return pendingChanges.filter(change =>
      change.changeType === 'ADD' && change.changeData?.dayId === day.id
    );
  };

  const handleMoveActivity = async (activity: Activity, direction: 'up' | 'down') => {
    try {
      const activities = getPeriodActivities(activity.period);
      const currentIndex = activities.findIndex(a => a.id === activity.id);

      let targetIndex: number;
      if (direction === 'up') {
        targetIndex = currentIndex - 1;
      } else {
        targetIndex = currentIndex + 1;
      }

      // Check if movement is valid
      if (targetIndex < 0 || targetIndex >= activities.length) {
        return; // Can't move beyond bounds
      }

      const targetActivity = activities[targetIndex];

      // Use the target activity's order index
      await activitiesApi.reorder(activity.id, targetActivity.orderIndex);

      onRefresh();
    } catch (error) {
      console.error('Failed to reorder activity:', error);
    }
  };

  const handleDeleteActivity = (activity: Activity) => {
    setActivityToDelete(activity);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteActivity = async () => {
    if (!activityToDelete) return;

    try {
      if (isAdmin) {
        await activitiesApi.delete(activityToDelete.id, {});
        onRefresh(); // Immediate refresh for admin
      } else {
        // Support users create pending deletion requests
        await pendingChangesApi.create({
          weekId: day.week?.id || day.weekId,
          changeType: 'DELETE',
          changeData: {
            activityId: activityToDelete.id,
            time: activityToDelete.time,
            description: activityToDelete.description,
            period: activityToDelete.period
          }
        });
        onRefresh(); // Refresh to show pending change
      }
    } catch (error) {
      console.error('Failed to delete activity:', error);
    } finally {
      setActivityToDelete(null);
    }
  };

  const periods = [
    { name: 'MORNING', label: 'Morning', icon: '🌅' },
    { name: 'AFTERNOON', label: 'Afternoon', icon: '☀️' },
    { name: 'EVENING', label: 'Evening', icon: '🌆' },
  ] as const;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Day Header */}
      <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            onClick={onToggleExpansion}
            className="flex items-center gap-2 text-left hover:text-primary transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">
              {getDayDisplayName(day.dayName)}
            </h3>
            <span className="text-xs text-gray-500">
              ({day.activities.length} activities)
            </span>
          </button>

          <div className="flex items-center gap-2">
            {getAddPendingChanges().length > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                {getAddPendingChanges().length} pending
              </span>
            )}

            <button
              onClick={onAddActivity}
              className="inline-flex items-center px-3 py-1 border border-primary text-primary bg-white rounded-md hover:bg-primary/5 transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline">Add Activity</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Period Sections - Only show when expanded */}
      {isExpanded && (
        <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
        {periods.map((period) => {
          const activities = getPeriodActivities(period.name);

          return (
            <div key={period.name} className="space-y-3">
              {/* Period Header */}
              <div className="flex items-center space-x-2">
                <span className="text-base sm:text-lg">{period.icon}</span>
                <h4 className="text-sm sm:text-md font-medium text-gray-800">
                  {period.label}
                </h4>
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="text-xs text-gray-500">
                  {activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}
                </span>
              </div>

              {/* Activities */}
              <div className="space-y-2">
                {activities.length > 0 ? (
                  activities.map((activity, index) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      pendingChanges={getPendingChangesForActivity(activity.id)}
                      onEdit={() => onEditActivity(activity, day)}
                      onDelete={() => handleDeleteActivity(activity)}
                      onMoveUp={() => handleMoveActivity(activity, 'up')}
                      onMoveDown={() => handleMoveActivity(activity, 'down')}
                      canMoveUp={index > 0}
                      canMoveDown={index < activities.length - 1}
                      isAdmin={isAdmin}
                    />
                  ))
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      No {period.label.toLowerCase()} activities scheduled
                    </p>
                    <button
                      onClick={onAddActivity}
                      className="mt-2 text-primary hover:text-primary-dark text-sm font-medium"
                    >
                      Add the first activity
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

          {/* Pending Add Changes */}
          {getAddPendingChanges().length > 0 && (
            <div className="border-t border-gray-200 bg-orange-50 -mx-3 sm:-mx-4 px-3 sm:px-4 py-4">
              <h5 className="text-sm font-medium text-orange-800 mb-2">
                Pending New Activities ({getAddPendingChanges().length})
              </h5>
              <div className="space-y-2">
                {getAddPendingChanges().map((change) => (
                  <div key={change.id} className="bg-white p-3 rounded border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {change.changeData.time} - {change.changeData.description}
                        </p>
                        <p className="text-xs text-gray-500">
                          {change.changeData.period} • By {change.user?.name ?? 'Unknown user'}
                        </p>
                      </div>
                      <span className="text-xs text-orange-600 font-medium">
                        Pending Approval
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteActivity}
        title="Delete Activity"
        message={
          activityToDelete
            ? `Are you sure you want to delete "${activityToDelete.description}"? ${
                isAdmin
                  ? 'This action cannot be undone.'
                  : 'This will submit a deletion request for admin approval.'
              }`
            : ''
        }
        confirmText={isAdmin ? 'Delete' : 'Submit Request'}
        type="danger"
      />
    </div>
  );
};

export default DaySchedule;
