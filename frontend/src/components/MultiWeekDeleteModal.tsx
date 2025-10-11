import React, { useState, useEffect } from 'react';
import type { Activity, Week } from '../types';
import { activitiesApi } from '../services/api';

interface MultiWeekDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedWeeks: number[]) => void;
  activity: Activity | null;
  currentWeek: number;
  allWeeks: Week[];
  isAdmin?: boolean;
}

const MultiWeekDeleteModal: React.FC<MultiWeekDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  activity,
  currentWeek,
  allWeeks,
  isAdmin = true,
}) => {
  const [existingWeeks, setExistingWeeks] = useState<number[]>([]);
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && activity) {
      checkExistingWeeks();
    }
  }, [isOpen, activity]);

  const checkExistingWeeks = async () => {
    if (!activity) return;

    setLoading(true);
    try {
      const { existingWeeks: weeks } = await activitiesApi.checkDuplicates(
        activity.time,
        activity.description,
        activity.Day?.dayName || ''
      );
      setExistingWeeks(weeks);
      // Default selection: only current week
      setSelectedWeeks([currentWeek]);
    } catch (error) {
      console.error('Failed to check existing weeks:', error);
      setExistingWeeks([currentWeek]);
      setSelectedWeeks([currentWeek]);
    } finally {
      setLoading(false);
    }
  };

  const toggleWeek = (weekNum: number) => {
    setSelectedWeeks(prev =>
      prev.includes(weekNum)
        ? prev.filter(w => w !== weekNum)
        : [...prev, weekNum]
    );
  };

  const selectAll = () => {
    setSelectedWeeks(existingWeeks);
  };

  const handleConfirm = () => {
    if (selectedWeeks.length === 0) return;
    onConfirm(selectedWeeks);
  };

  if (!isOpen || !activity) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Activity</h3>
              <p className="text-sm text-gray-600 mt-1">
                {activity.time} - {activity.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-gray-500 mt-2">Checking weeks...</p>
            </div>
          ) : (
            <>
              {/* Info Message */}
              {existingWeeks.length > 1 ? (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800">
                        This activity exists in {existingWeeks.length} weeks
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Select which weeks you want to delete it from
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    This activity only exists in Week {currentWeek}
                  </p>
                </div>
              )}

              {/* Week Selection */}
              {existingWeeks.length > 1 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Select weeks to delete from:
                    </label>
                    <button
                      onClick={selectAll}
                      className="text-xs text-primary hover:text-primary-dark"
                    >
                      Select All
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                    {existingWeeks.map(weekNum => (
                      <label
                        key={weekNum}
                        className={`flex items-center justify-center p-2 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedWeeks.includes(weekNum)
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        } ${weekNum === currentWeek ? 'ring-2 ring-blue-300' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWeeks.includes(weekNum)}
                          onChange={() => toggleWeek(weekNum)}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">
                          Week {weekNum}
                          {weekNum === currentWeek && (
                            <span className="text-xs block text-blue-600">(Current)</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedWeeks.length} week{selectedWeeks.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}

              {/* Warning */}
              <div className={`mb-6 p-3 border rounded-lg ${isAdmin ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                <div className="flex items-start gap-2">
                  <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isAdmin ? 'text-red-600' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className={`text-sm ${isAdmin ? 'text-red-800' : 'text-orange-800'}`}>
                    {isAdmin ? (
                      <><strong>Warning:</strong> This action cannot be undone. The activity will be permanently deleted.</>
                    ) : (
                      <><strong>Note:</strong> This will submit a deletion request for admin approval.</>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedWeeks.length === 0}
                  className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    isAdmin ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {isAdmin
                    ? `Delete from ${selectedWeeks.length} Week${selectedWeeks.length !== 1 ? 's' : ''}`
                    : `Submit Request for ${selectedWeeks.length} Week${selectedWeeks.length !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiWeekDeleteModal;
