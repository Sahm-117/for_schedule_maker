import React, { useState, useEffect } from 'react';
import { activitiesApi, pendingChangesApi, labelsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Day, Activity, Week, Label } from '../types';
import { getContrastingTextColor, normalizeHexColor } from '../utils/color';

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
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWeeks, setDuplicateWeeks] = useState<number[]>([]);
  const [showCrossWeek, setShowCrossWeek] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [labelQuery, setLabelQuery] = useState('');

  useEffect(() => {
    if (activity) {
      setTime(activity.time);
      setDescription(activity.description);
      setPeriod(activity.period);
      setSelectedLabelIds((activity.labels || []).map((l) => l.id));
      setLabelsOpen(true);
    } else {
      setTime('');
      setDescription('');
      setPeriod('MORNING');
      setSelectedLabelIds([]);
      setLabelsOpen(true);
    }
    setSelectedWeeks([]);
    setError('');
    setDuplicateWeeks([]);
    setShowCrossWeek(false);
    setLabelQuery('');
  }, [activity, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
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

  const toggleLabel = (labelId: string, checked: boolean) => {
    setSelectedLabelIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(labelId);
      else set.delete(labelId);
      return Array.from(set);
    });
  };

  const currentWeekNumber = weeks.find((w) => w.id === day.weekId)?.weekNumber;
  const otherWeeks = typeof currentWeekNumber === 'number'
    ? weeks.filter((w) => w.weekNumber !== currentWeekNumber)
    : weeks;

  const filteredLabels = labelQuery.trim()
    ? labels.filter((l) => l.name.toLowerCase().includes(labelQuery.trim().toLowerCase()))
    : labels;

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
        if (isAdmin) {
          await activitiesApi.update(activity.id, {
            time,
            description,
            applyToWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
            labelIds: selectedLabelIds,
          });
        } else {
          await pendingChangesApi.create({
            weekId: day.weekId,
            changeType: 'EDIT',
            userId: user?.id,
            changeData: {
              activityId: activity.id,
              dayId: day.id,
              dayName: day.dayName,
              oldTime: activity.time,
              oldDescription: activity.description,
              time,
              description,
              applyToWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
              labelIds: selectedLabelIds,
            },
          });
        }
      } else {
        // Use correct API based on user role
        const activityData = {
          dayId: day.id,
          time,
          description,
          period,
          applyToWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
          labelIds: selectedLabelIds,
          userId: user?.id || 'demo_user_id',
        };

        if (isAdmin) {
          await activitiesApi.create(activityData);
        } else {
          await activitiesApi.request(activityData);
        }
      }
      onSave();
    } catch (error: any) {
      const msg =
        (error instanceof Error ? error.message : null) ||
        error?.response?.data?.error ||
        'Failed to save activity';
      setError(msg);
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
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 flex justify-between items-start sm:items-center">
          <h2 className="text-lg sm:text-xl font-semibold pr-4">
            {activity ? 'Edit Activity' : 'Add Activity'} - {day.dayName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            type="button"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-4">
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
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Select other weeks to apply changes
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {otherWeeks.map((week) => (
                        <label key={week.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedWeeks.includes(week.weekNumber)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWeeks([...selectedWeeks, week.weekNumber]);
                              } else {
                                setSelectedWeeks(selectedWeeks.filter((weekNumber) => weekNumber !== week.weekNumber));
                              }
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Week {week.weekNumber}</span>
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

            {!isAdmin && (
              <div className="text-blue-600 text-sm bg-blue-50 p-2 rounded">
                As a support user, your changes will be submitted for admin approval.
              </div>
            )}

          </div>

          <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                {activity && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={loading}
                    className="px-3 py-2 text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 text-sm"
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !time || !description}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 text-sm"
                >
                  {loading ?
                    (isAdmin ? 'Saving...' : 'Submitting...') :
                    activity ? 'Update' :
                    (isAdmin ? 'Add Activity' : 'Submit for Approval')
                  }
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ActivityModal;
