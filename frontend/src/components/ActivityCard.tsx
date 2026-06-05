import React from 'react';
import type { Activity, PendingChange } from '../types';
import { formatTimeForDisplay } from '../utils/time';
import LabelChip from './LabelChip';
import ActivityText from './ActivityText';
import { PeriodBadge } from './PeriodIcon';

interface ActivityCardProps {
  activity: Activity;
  pendingChanges: PendingChange[];
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isAdmin: boolean;  // true = show edit/delete buttons
  isCompleted?: boolean;
  canToggleCompleted?: boolean;
  onToggleCompleted?: (nextValue: boolean) => void;
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
  isCompleted = false,
  canToggleCompleted = false,
  onToggleCompleted,
}) => {
  const editPendingChange = pendingChanges.find(change => change.changeType === 'EDIT');
  const deletePendingChange = pendingChanges.find(change => change.changeType === 'DELETE');

  return (
    <div className={`bg-white border rounded-2xl p-3 sm:p-4 hover:shadow-md transition-shadow ${
      deletePendingChange ? 'border-red-200 bg-red-50' :
      editPendingChange ? 'border-orange-200 bg-orange-50' :
      isCompleted ? 'border-emerald-200 bg-emerald-50/40' : 'border-orange-100'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
              {formatTimeForDisplay(activity.time)}
              </span>
              <PeriodBadge period={activity.period} compact />
              {pendingChanges.length > 0 && (
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  deletePendingChange ? 'bg-red-100 text-red-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {deletePendingChange ? 'Delete Pending' : 'Edit Pending'}
                </span>
              )}
            </div>
            {onToggleCompleted && (
              <button
                type="button"
                onClick={() => onToggleCompleted(!isCompleted)}
                disabled={!canToggleCompleted}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isCompleted
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-600'
                } ${canToggleCompleted ? 'hover:border-emerald-300 hover:bg-emerald-50' : 'cursor-not-allowed opacity-50'}`}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                {isCompleted ? 'Done' : 'Mark done'}
              </button>
            )}
          </div>

          <p className={`text-gray-800 ${deletePendingChange ? 'line-through text-gray-500' : ''}`}>
            <ActivityText text={activity.description} />
          </p>

          {Array.isArray(activity.labels) && activity.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {activity.labels.map((label) => {
                return (
                  <LabelChip
                    key={label.id}
                    name={label.name}
                    color={label.color}
                    size="sm"
                  />
                );
              })}
            </div>
          )}

          {/* Show pending edit changes */}
          {editPendingChange && (
            <div className="mt-3 p-3 bg-white border border-orange-200 rounded">
              <p className="text-xs text-orange-600 font-medium mb-1">Proposed Changes:</p>
              <div className="text-sm">
                {editPendingChange.changeData.time && editPendingChange.changeData.time !== activity.time && (
                  <p className="text-gray-600">
                    Time: <span className="line-through">{formatTimeForDisplay(activity.time)}</span> →
                    <span className="text-orange-600 font-medium ml-1">
                      {formatTimeForDisplay(editPendingChange.changeData.time)}
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
          {isAdmin && (
            <>
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
            </>
          )}

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
