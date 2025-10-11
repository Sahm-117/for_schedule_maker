import React, { useState, useEffect } from 'react';
import { activitiesApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
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
  const { user } = useAuth();
  const [timeHour, setTimeHour] = useState('12');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>('AM');
  const [description, setDescription] = useState('');
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWeeks, setDuplicateWeeks] = useState<number[]>([]);
  const [showCrossWeek, setShowCrossWeek] = useState(false);
  const [existingWeeks, setExistingWeeks] = useState<number[]>([]);
  const [updateAllExisting, setUpdateAllExisting] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Convert 12-hour format to 24-hour format
  const getTime24Format = () => {
    let hour = parseInt(timeHour);
    if (timeAmPm === 'AM' && hour === 12) hour = 0;
    if (timeAmPm === 'PM' && hour !== 12) hour += 12;
    return `${hour.toString().padStart(2, '0')}:${timeMinute}`;
  };

  // Automatically determine period based on time
  const getPeriodFromTime = (time24: string) => {
    const [hours] = time24.split(':');
    const hour = parseInt(hours);

    if (hour >= 0 && hour < 12) return 'MORNING';
    if (hour >= 12 && hour < 17) return 'AFTERNOON';
    return 'EVENING';
  };

  // Convert 24-hour format back to 12-hour format for editing
  const setTimeFrom24Format = (time24: string) => {
    const [hours, minutes] = time24.split(':');
    let hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';

    if (hour === 0) hour = 12;
    else if (hour > 12) hour -= 12;

    setTimeHour(hour.toString());
    setTimeMinute(minutes);
    setTimeAmPm(ampm);
  };

  useEffect(() => {
    if (activity) {
      setTimeFrom24Format(activity.time);
      setDescription(activity.description);
      // Check for existing weeks when editing
      checkExistingWeeks();
    } else {
      setTimeHour('12');
      setTimeMinute('00');
      setTimeAmPm('AM');
      setDescription('');
      setExistingWeeks([]);
    }
    setSelectedWeeks([]);
    setError('');
    setDuplicateWeeks([]);
    setShowCrossWeek(false);
    setUpdateAllExisting(false);
  }, [activity, isOpen]);

  const checkExistingWeeks = async () => {
    if (!activity) return;

    setCheckingExisting(true);
    try {
      const { existingWeeks: weeks } = await activitiesApi.checkDuplicates(
        activity.time,
        activity.description,
        day.dayName
      );
      setExistingWeeks(weeks);
      // Auto-check "update all" if exists in multiple weeks
      setUpdateAllExisting(weeks.length > 1);
    } catch (error) {
      console.error('Failed to check existing weeks:', error);
      setExistingWeeks([]);
    } finally {
      setCheckingExisting(false);
    }
  };

  const checkDuplicates = async () => {
    const time24 = getTime24Format();
    if (!time24 || !description) return;

    try {
      const response = await activitiesApi.checkDuplicates(time24, description, day.dayName);
      setDuplicateWeeks(response.existingWeeks);
    } catch (error) {
      console.error('Failed to check duplicates:', error);
    }
  };

  useEffect(() => {
    if (timeHour && timeMinute && description) {
      const timer = setTimeout(checkDuplicates, 500);
      return () => clearTimeout(timer);
    }
  }, [timeHour, timeMinute, timeAmPm, description, day.dayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const time24 = getTime24Format();
    if (!time24 || !description) return;

    setLoading(true);
    setError('');

    try {
      const period = getPeriodFromTime(time24);

      if (activity) {
        // Determine which weeks to update
        let weekNumbers: number[] | undefined = undefined;

        if (updateAllExisting && existingWeeks.length > 0) {
          // Update all existing weeks
          weekNumbers = existingWeeks;
        } else if (selectedWeeks.length > 0) {
          // For multi-week activities, selectedWeeks contains week NUMBERS (not IDs)
          // For new activities, it contains week IDs that need conversion
          if (existingWeeks.length > 0) {
            // Editing existing multi-week activity: selectedWeeks are week numbers
            weekNumbers = selectedWeeks;
          } else {
            // Converting week IDs to week numbers (for cross-week feature)
            weekNumbers = selectedWeeks.map(weekId => {
              const week = weeks.find(w => w.id === weekId);
              return week?.weekNumber;
            }).filter(Boolean) as number[];
          }
        }

        console.log('📤 Submitting update with weekNumbers:', weekNumbers);

        await activitiesApi.update(activity.id, {
          time: time24,
          description,
          applyToWeeks: weekNumbers,
        });
      } else {
        // Convert week IDs to week numbers
        const weekNumbers = selectedWeeks.length > 0
          ? selectedWeeks.map(weekId => {
              const week = weeks.find(w => w.id === weekId);
              return week?.weekNumber;
            }).filter(Boolean)
          : undefined;

        // Use correct API based on user role
        const activityData = {
          dayId: day.id,
          time: time24,
          description,
          period,
          applyToWeeks: weekNumbers,
          userId: user?.id || 'a0000000-0000-4000-8000-000000000002',
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
              <div className="flex gap-2">
                <select
                  value={timeHour}
                  onChange={(e) => setTimeHour(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => (
                    <option key={hour} value={hour.toString()}>
                      {hour}
                    </option>
                  ))}
                </select>
                <select
                  value={timeMinute}
                  onChange={(e) => setTimeMinute(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                >
                  {['00', '15', '30', '45'].map(minute => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
                <select
                  value={timeAmPm}
                  onChange={(e) => setTimeAmPm(e.target.value as 'AM' | 'PM')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Period will be automatically determined: 12am-11:59am (Morning), 12pm-4:59pm (Afternoon), 5pm-11:59pm (Evening)
              </p>
            </div>

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

            {/* Show existing weeks when editing */}
            {activity && existingWeeks.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  📍 This activity currently exists in:
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingWeeks.map(weekNum => (
                    <span
                      key={weekNum}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                    >
                      Week {weekNum}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Granular week selection (only when editing and exists in multiple weeks) */}
            {activity && existingWeeks.length > 1 && (
              <div className="border-t border-b py-3">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-900">
                      Select weeks to update:
                    </label>
                    <button
                      type="button"
                      onClick={() => setUpdateAllExisting(!updateAllExisting)}
                      className="text-xs text-primary hover:text-primary-dark"
                    >
                      {updateAllExisting ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {existingWeeks.map(weekNum => {
                      const isSelected = updateAllExisting || selectedWeeks.includes(weekNum);
                      return (
                        <label
                          key={weekNum}
                          className={`flex items-center justify-center p-2 border-2 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-300 bg-white hover:border-gray-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              // Disable "Select All" when manually toggling
                              setUpdateAllExisting(false);

                              if (e.target.checked) {
                                if (!selectedWeeks.includes(weekNum)) {
                                  setSelectedWeeks([...selectedWeeks, weekNum]);
                                }
                              } else {
                                setSelectedWeeks(selectedWeeks.filter(w => w !== weekNum));
                              }
                            }}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">
                            Week {weekNum}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {updateAllExisting
                      ? `All ${existingWeeks.length} weeks selected`
                      : selectedWeeks.length > 0
                      ? `${selectedWeeks.length} week${selectedWeeks.length !== 1 ? 's' : ''} selected`
                      : 'Only this instance will be updated'}
                  </p>
                </div>
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
                  disabled={loading || !getTime24Format() || !description}
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