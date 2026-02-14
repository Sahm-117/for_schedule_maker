import React, { useEffect, useState } from 'react';
import { activitiesApi, labelsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Week, Label } from '../types';
import { getContrastingTextColor, normalizeHexColor } from '../utils/color';

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
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [labelQuery, setLabelQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLabelsOpen(true);
    setLabelQuery('');
    setLabelsLoading(true);
    labelsApi.getAll()
      .then((res) => {
        if (cancelled) return;
        setLabels(res.labels || []);
      })
      .catch((e) => {
        console.warn('Failed to load labels:', e);
        if (!cancelled) setLabels([]);
      })
      .finally(() => {
        if (!cancelled) setLabelsLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const otherWeeks = weeks.filter((w) => w.weekNumber !== currentWeek.weekNumber);
  const filteredLabels = labelQuery.trim()
    ? labels.filter((l) => l.name.toLowerCase().includes(labelQuery.trim().toLowerCase()))
    : labels;

  const toggleLabel = (labelId: string, checked: boolean) => {
    setSelectedLabelIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(labelId);
      else set.delete(labelId);
      return Array.from(set);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0 || !time || !description || selectedWeeks.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const results = [];
      const errors = [];

      // Create activity for each selected day
      for (const dayName of selectedDays) {
        const targetDay = currentWeek.days.find(d => d.dayName === dayName);
        if (!targetDay) {
          errors.push(`Selected day ${dayName} not found`);
          continue;
        }

        try {
          const activityData = {
            dayId: targetDay.id,
            time,
            description,
            period,
            applyToWeeks: selectedWeeks,
            labelIds: selectedLabelIds,
            userId: user?.id,
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
          const errorMsg =
            (dayError instanceof Error ? dayError.message : null) ||
            dayError?.response?.data?.error ||
            `Failed to create activity for ${dayName}`;
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
        setTime('');
        setDescription('');
        setPeriod('MORNING');
        setSelectedLabelIds([]);
        onClose();
      }
    } catch (error: any) {
      const msg =
        (error instanceof Error ? error.message : null) ||
        error?.response?.data?.error ||
        'Failed to create cross-week activity';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOptions = [...currentWeek.days]
    .map((d) => d.dayName)
    .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-semibold">
            Add Cross-Week Activity
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select other weeks to apply
                </label>
                <span className="text-xs text-gray-500">
                  Selected: {selectedWeeks.length} / {otherWeeks.length}
                </span>
              </div>

              <p className="text-xs text-gray-500 mb-2">
                Current week is always included.
              </p>

              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setSelectedWeeks(otherWeeks.map((w) => w.weekNumber))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  disabled={otherWeeks.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWeeks([])}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  disabled={selectedWeeks.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border border-gray-200 rounded-md">
                {otherWeeks.map((week) => (
                  <label key={week.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50">
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
                    <span className="text-sm">Week {week.weekNumber}</span>
                  </label>
                ))}
              </div>

              {selectedWeeks.length === 0 && (
                <p className="text-sm text-red-600 mt-1">Please select at least one other week</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Days of Week
                </label>
                <span className="text-xs text-gray-500">
                  Selected: {selectedDays.length} / {dayOptions.length}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setSelectedDays(dayOptions)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  disabled={dayOptions.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDays([])}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  disabled={selectedDays.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 border border-gray-200 rounded-md">
                {dayOptions.map((day) => (
                  <label key={day} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50">
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
                    <span className="text-sm">{day.charAt(0) + day.slice(1).toLowerCase()}</span>
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

            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Labels (optional)
                  </label>
                  <span className="text-xs text-gray-500">
                    Selected: {selectedLabelIds.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {labelsLoading && (
                    <span className="text-xs text-gray-500">Loading...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setLabelsOpen((v) => !v)}
                    className="text-xs text-primary hover:text-primary-dark px-2 py-1 rounded border border-primary hover:bg-primary/5"
                  >
                    {labelsOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {selectedLabelIds.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {labels
                    .filter((l) => selectedLabelIds.includes(l.id))
                    .map((label) => {
                      const bg = normalizeHexColor(label.color) || '#E5E7EB';
                      const fg = getContrastingTextColor(bg);
                      return (
                        <span
                          key={label.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: bg, color: fg }}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                </div>
              )}

              {labelsOpen && (
                <div className="mt-2 border border-gray-200 rounded-md p-3">
                  <input
                    type="text"
                    value={labelQuery}
                    onChange={(e) => setLabelQuery(e.target.value)}
                    placeholder="Search labels..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary text-sm mb-3"
                  />

                  <div className="max-h-44 overflow-y-auto">
                    {labels.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No labels yet.
                      </p>
                    ) : filteredLabels.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No labels match your search.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredLabels.map((label) => {
                          const bg = normalizeHexColor(label.color) || '#E5E7EB';
                          const fg = getContrastingTextColor(bg);
                          const checked = selectedLabelIds.includes(label.id);
                          return (
                            <label key={label.id} className="flex items-center gap-2 p-1 rounded hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleLabel(label.id, e.target.checked)}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                                style={{ backgroundColor: bg, color: fg }}
                              >
                                {label.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
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

          </div>

          <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200 bg-white">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || selectedDays.length === 0 || !time || !description || selectedWeeks.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 text-sm"
              >
                {loading ?
                  (user?.role === 'ADMIN' ? 'Creating...' : 'Submitting...') :
                  (user?.role === 'ADMIN' ? 'Create Activity' : 'Submit for Approval')
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CrossWeekModal;
