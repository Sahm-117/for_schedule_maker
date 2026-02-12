import React from 'react';
import type { Activity, PendingChange } from '../types';

interface ActivityCardProps {
  activity: Activity;
  pendingChanges: PendingChange[];
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isAdmin: boolean;
}

const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  pendingChanges,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isAdmin,
}) => {
  const editPendingChange = pendingChanges.find(change => change.changeType === 'EDIT');
  const deletePendingChange = pendingChanges.find(change => change.changeType === 'DELETE');

  const getTimeFormat = (time: string) => {
    try {
      const [hours, minutes] = time.split(':');
      const hour24 = parseInt(hours);
      const ampm = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 % 12 || 12;
      return `${hour12}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  };

  return (
    <div className={`bg-white border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow ${
      deletePendingChange ? 'border-red-200 bg-red-50' :
      editPendingChange ? 'border-orange-200 bg-orange-50' :
      'border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
            <span className="text-sm font-medium text-gray-900">
              {getTimeFormat(activity.time)}
            </span>
            {pendingChanges.length > 0 && (
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                deletePendingChange ? 'bg-red-100 text-red-800' :
                'bg-orange-100 text-orange-800'
              }`}>
                {deletePendingChange ? 'Delete Pending' : 'Edit Pending'}
              </span>
            )}
          </div>

          <p className={`text-gray-700 ${deletePendingChange ? 'line-through text-gray-500' : ''}`}>
            {activity.description}
          </p>

          {/* Show pending edit changes */}
          {editPendingChange && (
            <div className="mt-3 p-3 bg-white border border-orange-200 rounded">
              <p className="text-xs text-orange-600 font-medium mb-1">Proposed Changes:</p>
              <div className="text-sm">
                {editPendingChange.changeData.time && editPendingChange.changeData.time !== activity.time && (
                  <p className="text-gray-600">
                    Time: <span className="line-through">{getTimeFormat(activity.time)}</span> →
                    <span className="text-orange-600 font-medium ml-1">
                      {getTimeFormat(editPendingChange.changeData.time)}
                    </span>
                  </p>
                )}
                {editPendingChange.changeData.description && editPendingChange.changeData.description !== activity.description && (
                  <p className="text-gray-600">
                    Description: <span className="line-through">{activity.description}</span>
                    <br />
                    <span className="text-orange-600 font-medium">
                      {editPendingChange.changeData.description}
                    </span>
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Proposed by {editPendingChange.user?.name ?? 'Unknown user'}
              </p>
            </div>
          )}

          {/* Show pending delete info */}
          {deletePendingChange && (
            <div className="mt-3 p-3 bg-white border border-red-200 rounded">
              <p className="text-xs text-red-600 font-medium mb-1">
                Deletion requested by {deletePendingChange.user?.name ?? 'Unknown user'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-start gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit activity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete activity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Move Up/Down Buttons */}
          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col gap-1">
              {onMoveUp && (
                <button
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              )}
              {onMoveDown && (
                <button
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityCard;
