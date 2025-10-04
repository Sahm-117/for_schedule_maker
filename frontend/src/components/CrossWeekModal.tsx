import React, { useState } from 'react';
import { activitiesApi } from '../services/api';
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
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay || !time || !description || selectedWeeks.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const targetDay = currentWeek.days.find(d => d.dayName === selectedDay);
      if (!targetDay) {
        throw new Error('Selected day not found');
      }

      await activitiesApi.create({
        dayId: targetDay.id,
        time,
        description,
        period,
        applyToWeeks: selectedWeeks,
      });

      onSave();
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
              {selectedWeeks.length === 0 && (
                <p className="text-sm text-red-600 mt-1">Please select at least one week</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Day of Week
              </label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                required
              >
                <option value="">Select a day</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0) + day.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

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
                disabled={loading || !selectedDay || !time || !description || selectedWeeks.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Activity'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CrossWeekModal;