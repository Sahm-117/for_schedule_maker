import React, { useState, useEffect } from 'react';
import { activitiesApi } from '../services/api';
import type { Day, Activity, Week } from '../types';

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  day: Day;
  activity?: Activity | null;
  weeks: Week[];
  onSave: () => void;
  isAdmin: boolean;
}

const ActivityModal: React.FC<ActivityModalProps> = ({
  isOpen,
  onClose,
  day,
  activity,
  weeks,
  onSave,
  isAdmin,
}) => {
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWeeks, setDuplicateWeeks] = useState<number[]>([]);
  const [showCrossWeek, setShowCrossWeek] = useState(false);

  useEffect(() => {
    if (activity) {
      setTime(activity.time);
      setDescription(activity.description);
      setPeriod(activity.period);
    } else {
      setTime('');
      setDescription('');
      setPeriod('MORNING');
    }
    setSelectedWeeks([]);
    setError('');
    setDuplicateWeeks([]);
    setShowCrossWeek(false);
  }, [activity, isOpen]);

  const checkDuplicates = async () => {
    if (!time || !description) return;

    try {
      const response = await activitiesApi.checkDuplicates(time, description, day.dayName);
      setDuplicateWeeks(response.existingWeeks);
    } catch (error) {
      console.error('Failed to check duplicates:', error);
    }
  };

  useEffect(() => {
    if (time && description) {
      const timer = setTimeout(checkDuplicates, 500);
      return () => clearTimeout(timer);
    }
  }, [time, description, day.dayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!time || !description) return;

    setLoading(true);
    setError('');

    try {
      if (activity) {
        await activitiesApi.update(activity.id, {
          time,
          description,
          applyToWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
        });
      } else {
        // Use correct API based on user role
        const activityData = {
          dayId: day.id,
          time,
          description,
          period,
          applyToWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
        };

        if (isAdmin) {
          await activitiesApi.create(activityData);
        } else {
          await activitiesApi.request(activityData);
        }
      }
      onSave();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to save activity');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!activity) return;
    // Note: Delete functionality moved to DaySchedule component with proper confirmation modal
    // This function is kept for backwards compatibility but should not be used
    console.warn('Delete function called from ActivityModal - use DaySchedule delete instead');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-start sm:items-center mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold pr-4">
              {activity ? 'Edit Activity' : 'Add Activity'} - {day.dayName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            {!activity && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Period
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as 'MORNING' | 'AFTERNOON' | 'EVENING')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                >
                  <option value="MORNING">Morning</option>
                  <option value="AFTERNOON">Afternoon</option>
                  <option value="EVENING">Evening</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                placeholder="Describe the activity..."
                required
              />
            </div>

            {duplicateWeeks.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Similar activities found in weeks:</strong> {duplicateWeeks.join(', ')}
                </p>
              </div>
            )}

            {!isAdmin && (
              <div className="border-t pt-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showCrossWeek}
                    onChange={(e) => setShowCrossWeek(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Apply to multiple weeks
                  </span>
                </label>

                {showCrossWeek && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select weeks to apply changes
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {weeks.map((week) => (
                        <label key={week.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedWeeks.includes(week.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWeeks([...selectedWeeks, week.id]);
                              } else {
                                setSelectedWeeks(selectedWeeks.filter(id => id !== week.id));
                              }
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="ml-1 text-sm">Week {week.weekNumber}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            {!isAdmin && !activity && (
              <div className="text-blue-600 text-sm bg-blue-50 p-2 rounded">
                As a support user, your activity will be submitted for admin approval.
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between pt-4 border-t gap-3">
              <div>
                {activity && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={loading}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 text-sm sm:text-base"
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !time || !description}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 text-sm sm:text-base"
                >
                  {loading ?
                    (isAdmin ? 'Saving...' : 'Submitting...') :
                    activity ? 'Update' :
                    (isAdmin ? 'Add Activity' : 'Submit for Approval')
                  }
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ActivityModal;