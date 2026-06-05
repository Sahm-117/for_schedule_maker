import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { supportActivityCompletionsApi } from '../services/api';
import { getCurrentProgramDayName, getTodayAndUpcomingDayNames } from '../utils/schedule';
import type { SupportActivityCompletion } from '../types';

const SupportSchedulePage: React.FC = () => {
  const { user, userLabelIds } = useAuth();
  const {
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
  } = useAppData();
  const [viewMode, setViewMode] = useState<'today' | 'upcoming' | 'week'>('today');
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  const [completionSavingIds, setCompletionSavingIds] = useState<number[]>([]);

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/schedule" replace />;
  }

  useEffect(() => {
    if (!selectedWeek || !user) return;
    let cancelled = false;

    supportActivityCompletionsApi.getMineForWeek(selectedWeek.id, user.id)
      .then((response) => {
        if (!cancelled) {
          setCompletions(response.completions);
        }
      })
      .catch((error) => {
        console.warn('Failed to load support completions:', error);
        if (!cancelled) {
          setCompletions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWeek, user]);

  const currentDayName = getCurrentProgramDayName();
  const visibleDayNames = useMemo(() => {
    if (viewMode === 'week') {
      return undefined;
    }
    if (viewMode === 'today') {
      return [currentDayName];
    }
    return getTodayAndUpcomingDayNames().filter((dayName) => dayName !== currentDayName);
  }, [currentDayName, viewMode]);

  const completedActivityIds = useMemo(() => completions.map((completion) => completion.activityId), [completions]);
  const completableActivityIds = useMemo(() => {
    if (!selectedWeek) return [];
    const todayDay = selectedWeek.days.find((day) => day.dayName === currentDayName);
    if (!todayDay) return [];
    return todayDay.activities
      .filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id)))
      .map((activity) => activity.id);
  }, [currentDayName, selectedWeek, userLabelIds]);

  const handleToggleCompleted = async (activityId: number, nextValue: boolean) => {
    if (!user) return;
    setCompletionSavingIds((prev) => [...prev, activityId]);
    try {
      if (nextValue) {
        const response = await supportActivityCompletionsApi.markDone(activityId, user.id);
        setCompletions((prev) => {
          const others = prev.filter((completion) => completion.activityId !== activityId);
          return [...others, response.completion];
        });
      } else {
        await supportActivityCompletionsApi.markUndone(activityId, user.id);
        setCompletions((prev) => prev.filter((completion) => completion.activityId !== activityId));
      }
    } catch (error) {
      console.error('Failed to update activity completion:', error);
    } finally {
      setCompletionSavingIds((prev) => prev.filter((id) => id !== activityId));
    }
  };

  const scheduleAction = (
    <div className="flex flex-wrap items-center gap-2">
      {[
        { id: 'today', label: 'Today' },
        { id: 'upcoming', label: 'Next Days' },
        { id: 'week', label: 'Full Week' },
      ].map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setViewMode(option.id as 'today' | 'upcoming' | 'week')}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            viewMode === option.id ? 'bg-primary text-white' : 'bg-orange-50 text-gray-700 hover:bg-orange-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="My Schedule"
        subtitle="Focus on today first, then switch to upcoming days or the full week when you need more context."
        action={scheduleAction}
      />

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <WeekSelector
          weeks={weeks}
          selectedWeek={selectedWeek}
          onWeekSelect={(weekId) => {
            void handleWeekSelect(weekId);
          }}
        />

        <div>
          {selectedWeek ? (
            <ScheduleView
              week={selectedWeek}
              weeks={weeks}
              pendingChanges={pendingChangesForSelectedWeek}
              onWeekUpdate={reloadWeeks}
              onPendingChangesRefresh={refreshPendingChanges}
              isAdmin={false}
              canEdit={false}
              filterLabelIds={userLabelIds}
              isPersonalView
              visibleDayNames={visibleDayNames}
              hideEmptyPeriods
              completedActivityIds={completedActivityIds}
              completableActivityIds={completableActivityIds.filter((id) => !completionSavingIds.includes(id))}
              onToggleCompleted={handleToggleCompleted}
              noActivitiesTitle={viewMode === 'today' ? 'Nothing assigned for today' : viewMode === 'upcoming' ? 'No upcoming activities this week' : 'No activities for you this week'}
              noActivitiesText={viewMode === 'today'
                ? 'You are all clear for today. Switch views if you want to check what is coming next.'
                : viewMode === 'upcoming'
                  ? 'There are no more upcoming activities tagged to your support groups in this week.'
                  : `No activities tagged with your support groups were found for Week ${selectedWeek.weekNumber}.`}
            />
          ) : (
            <div className="surface-card p-12 text-center text-sm text-gray-500">Select a week to view your schedule.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportSchedulePage;
