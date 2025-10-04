import React from 'react';
import type { Day, Activity, PendingChange } from '../types';
import ActivityCard from './ActivityCard';

interface DayScheduleProps {
  day: Day;
  pendingChanges: PendingChange[];
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  isAdmin: boolean;
}

const DaySchedule: React.FC<DayScheduleProps> = ({
  day,
  pendingChanges,
  onAddActivity,
  onEditActivity,
  isAdmin,
}) => {
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

  const periods = [
    { name: 'MORNING', label: 'Morning', icon: '🌅' },
    { name: 'AFTERNOON', label: 'Afternoon', icon: '☀️' },
    { name: 'EVENING', label: 'Evening', icon: '🌆' },
  ] as const;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Day Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {getDayDisplayName(day.dayName)}
          </h3>

          <div className="flex items-center space-x-2">
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
              Add Activity
            </button>
          </div>
        </div>
      </div>

      {/* Period Sections */}
      <div className="p-4 space-y-6">
        {periods.map((period) => {
          const activities = getPeriodActivities(period.name);

          return (
            <div key={period.name} className="space-y-3">
              {/* Period Header */}
              <div className="flex items-center space-x-2">
                <span className="text-lg">{period.icon}</span>
                <h4 className="text-md font-medium text-gray-800">
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
                  activities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      pendingChanges={getPendingChangesForActivity(activity.id)}
                      onEdit={() => onEditActivity(activity)}
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
      </div>

      {/* Pending Add Changes */}
      {getAddPendingChanges().length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-orange-50">
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
                      {change.changeData.period} • By {change.user.name}
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
  );
};

export default DaySchedule;