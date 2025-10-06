import React, { useState } from 'react';
import { activitiesApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Week, Day } from '../types';

interface CrossWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  weeks: Week[];
  currentWeek: Week;
  onSave: () => void;
}

const CrossWeekModal: React.FC<CrossWeekModalProps> = ({
  isOpen,
  onClose,
  weeks,
  currentWeek,
  onSave,
}) => {
  const { user } = useAuth();
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [timeHour, setTimeHour] = useState('12');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>('AM');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0 || !getTime24Format() || !description || selectedWeeks.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const results = [];
      const errors = [];
      const time24 = getTime24Format();
      const period = getPeriodFromTime(time24);

      // Create activity for each selected day
      for (const dayName of selectedDays) {
        // Convert uppercase day name to proper case (e.g., 'WEDNESDAY' -> 'Wednesday')
        const properDayName = dayName.charAt(0) + dayName.slice(1).toLowerCase();
        const targetDay = currentWeek.days.find(d => d.dayName === properDayName);
        if (!targetDay) {
          errors.push(`Selected day ${dayName} not found`);
          continue;
        }

        try {
          const activityData = {
            dayId: targetDay.id,
            time: time24,
            description,
            period,
            applyToWeeks: selectedWeeks,
            userId: user?.id || 'a0000000-0000-4000-8000-000000000002',
          };

          // Use correct API based on user role
          let result;
          if (user?.role === 'ADMIN') {
            result = await activitiesApi.create(activityData);
          } else {
            result = await activitiesApi.request(activityData);
          }
          results.push(`${dayName}: Success`);
        } catch (dayError: any) {
          const errorMsg = dayError.response?.data?.error || `Failed to create activity for ${dayName}`;
          errors.push(`${dayName}: ${errorMsg}`);
        }
      }

      if (errors.length > 0) {
        setError(`Some activities failed to create:\n${errors.join('\n')}\n\nSuccessful: ${results.join(', ')}`);
        if (results.length === 0) {
          // All failed, don't close modal
          return;
        }
      }

      onSave();

      // Reset form only if we had some success
      if (results.length > 0) {
        setSelectedWeeks([]);
        setSelectedDays([]);
        setTimeHour('12');
        setTimeMinute('00');
        setTimeAmPm('AM');
        setDescription('');
        onClose();
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to create cross-week activity');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const dayOptions = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">
              Add Cross-Week Activity
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Weeks to Apply
              </label>
              <div className="grid grid-cols-4 gap-2 p-3 border border-gray-200 rounded-md">
                {weeks.map((week) => (
                  <label key={week.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedWeeks.includes(week.weekNumber)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWeeks([...selectedWeeks, week.weekNumber]);
                        } else {
                          setSelectedWeeks(selectedWeeks.filter(num => num !== week.weekNumber));
                        }
                      }}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="ml-1 text-sm">Week {week.weekNumber}</span>
                  </label>
                ))}
              </div>
              {selectedWeeks.length === 0 && (
                <p className="text-sm text-red-600 mt-1">Please select at least one week</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Days of Week
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 border border-gray-200 rounded-md">
                {dayOptions.map((day) => (
                  <label key={day} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDays([...selectedDays, day]);
                        } else {
                          setSelectedDays(selectedDays.filter(d => d !== day));
                        }
                      }}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="ml-2 text-sm">{day.charAt(0) + day.slice(1).toLowerCase()}</span>
                  </label>
                ))}
              </div>
              {selectedDays.length === 0 && (
                <p className="text-sm text-red-600 mt-1">Please select at least one day</p>
              )}
            </div>

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

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            {user?.role === 'SUPPORT' && (
              <div className="text-blue-600 text-sm bg-blue-50 p-2 rounded">
                As a support user, your activity will be submitted for admin approval.
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || selectedDays.length === 0 || !getTime24Format() || !description || selectedWeeks.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50"
              >
                {loading ?
                  (user?.role === 'ADMIN' ? 'Creating...' : 'Submitting...') :
                  (user?.role === 'ADMIN' ? 'Create Activity' : 'Submit for Approval')
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CrossWeekModal;