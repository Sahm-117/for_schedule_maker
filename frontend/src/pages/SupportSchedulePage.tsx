import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import ActivityText from '../components/ActivityText';
import AppSelect from '../components/AppSelect';
import TourHelpButton from '../components/tour/TourHelpButton';
import { parseTimeToMinutes } from '../utils/time';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { attendanceFollowUpTasksApi, supportActivityCompletionsApi, supportChecklistApi } from '../services/api';
import { PROGRAM_DAY_ORDER, getCurrentProgramDayName, getProgramDayIndex } from '../utils/schedule';
import { lagosTodayIso } from '../utils/participantApp';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { exportWeekToPDF } from '../utils/pdfExport';
import type { AttendanceFollowUpTask, SupportActivityCompletion, SupportChecklistItem, User } from '../types';
import TaskNoteSheet from '../components/schedule/TaskNoteSheet';
import ChecklistTaskMeta from '../components/schedule/ChecklistTaskMeta';
import { effectiveDue, formatTaskRange, groupTasksByDue, isAdminChecklistTask, restWeeksAfter, scheduleWindow, weekIdForDate, weekStartMap } from '../utils/checklist';
import AddTaskSheet from '../components/schedule/AddTaskSheet';
import { useChecklistTick } from '../hooks/useChecklistTick';
import { CountdownRing, useChecklistAutoHide } from '../components/ChecklistAutoHide';
import Spinner from '../components/Spinner';

// What the page shows: everything, only the programme's activities, or only tasks. Tasks never depend on the week picker.
type ListFilter = 'all' | 'activities' | 'tasks';
// 'today' / 'tomorrow' / 'week', or one weekday's name from the day strip.
type ViewMode = 'today' | 'tomorrow' | 'week' | (typeof PROGRAM_DAY_ORDER)[number];

const PERIOD_LABEL: Record<string, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const SupportSchedulePage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role !== 'SUPPORT') return <Navigate to="/schedule" replace />;
  return <SupportScheduleContent user={user} />;
};

const SupportScheduleContent: React.FC<{ user: User }> = ({ user }) => {
  const { userLabelIds } = useAuth();
  const { weeks, selectedWeek, handleWeekSelect, activeCohort } = useAppData();
  const [searchParams] = useSearchParams();
  const schedulePublished = activeCohort?.schedulePublished !== false;
  const initialTab = searchParams.get('tab');
  const fromChecklistLink = initialTab === 'checklist';
  // A bell alert for a rest-week task opens straight on the rest weeks.
  const wantsRest = searchParams.get('rest') === '1';
  const [filter, setFilter] = useState<ListFilter>(fromChecklistLink ? 'tasks' : 'all');
  const [viewMode, setViewMode] = useState<ViewMode>(fromChecklistLink ? 'week' : 'today');
  // The 3 rest weeks after the cohort, which have no class week: only tasks live there.
  const [restMode, setRestMode] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  const [completionSavingIds, setCompletionSavingIds] = useState<number[]>([]);
  const [completionError, setCompletionError] = useState('');
  // Marking done first asks "Any notes?" (optional); the activity waiting on it.
  const [noteActivity, setNoteActivity] = useState<{ id: number; label: string } | null>(null);
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => (fromChecklistLink
    ? Object.fromEntries(PROGRAM_DAY_ORDER.map((day) => [day, true]))
    : { [getCurrentProgramDayName()]: true }));
  const [downloading, setDownloading] = useState(false);

  const [checklist, setChecklist] = useState<SupportChecklistItem[]>([]);
  const [absenceTasks, setAbsenceTasks] = useState<AttendanceFollowUpTask[]>([]);
  const [absenceTaskNotes, setAbsenceTaskNotes] = useState<Record<string, string>>({});
  const [absenceTasksLoading, setAbsenceTasksLoading] = useState(false);
  const [absenceTaskSavingIds, setAbsenceTaskSavingIds] = useState<string[]>([]);
  const [absenceTaskError, setAbsenceTaskError] = useState('');
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [checklistError, setChecklistError] = useState('');
  const [editingChecklist, setEditingChecklist] = useState(false);
  const autoHide = useChecklistAutoHide();

  useEffect(() => {
    if (!selectedWeek || !user) return;
    let cancelled = false;

    supportActivityCompletionsApi.getMineForWeek(selectedWeek.id, user.id)
      .then((response) => {
        if (!cancelled) {
          setCompletionError('');
          setCompletions(response.completions);
        }
      })
      .catch((error) => {
        console.warn('Failed to load support completions:', error);
        if (!cancelled) {
          setCompletionError(error instanceof Error ? error.message : 'Support completion could not be loaded right now.');
          setCompletions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWeek, user]);

  useEffect(() => {
    if (!selectedWeek || !user) { setAbsenceTasks([]); return; }
    let cancelled = false;
    setAbsenceTasksLoading(true);
    attendanceFollowUpTasksApi.getMine(selectedWeek.id, user.id)
      .then(({ tasks }) => { if (!cancelled) {
        setAbsenceTasks(tasks);
        setAbsenceTaskNotes((current) => {
          const next = { ...current };
          tasks.forEach((task) => { if (next[task.id] === undefined) next[task.id] = task.completionNote ?? ''; });
          return next;
        });
        setAbsenceTaskError('');
      } })
      .catch((error) => { if (!cancelled) setAbsenceTaskError(error instanceof Error ? error.message : 'Attendance follow-ups could not be loaded.'); })
      .finally(() => { if (!cancelled) setAbsenceTasksLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWeek, user]);

  // Every task of this cohort, whatever week it was made in: the week picker only changes the activities.
  const cohortId = activeCohort?.id ?? null;
  const weekIdsKey = weeks.map((week) => week.id).join(',');
  useEffect(() => {
    if (!user || !cohortId) { setChecklistLoading(false); return; }
    let cancelled = false;
    setChecklistLoading(true);
    supportChecklistApi.getForCohort(user.id, cohortId, weekIdsKey ? weekIdsKey.split(',').map(Number) : [])
      .then(({ items }) => {
        if (!cancelled) { setChecklist(items); setChecklistError(''); }
      })
      .catch((error) => {
        if (!cancelled) setChecklistError(error instanceof Error ? error.message : 'Your tasks could not be loaded right now.');
      })
      .finally(() => { if (!cancelled) setChecklistLoading(false); });
    return () => { cancelled = true; };
  }, [user, cohortId, weekIdsKey]);

  const currentDayName = getCurrentProgramDayName();
  const tomorrowName = PROGRAM_DAY_ORDER[(getProgramDayIndex(currentDayName) + 1) % PROGRAM_DAY_ORDER.length];

  // Ticks each minute so "Up next" moves on while the page stays open.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const today = lagosTodayIso(clock);
  const { start: cohortStart, pastLastWeek } = useMemo(() => scheduleWindow(activeCohort?.startDate, weeks, selectedWeek, today), [activeCohort?.startDate, weeks, selectedWeek, today]);
  const restWeeks = useMemo(() => (activeCohort ? restWeeksAfter(activeCohort, weeks) : []), [activeCohort, weeks]);

  // When each task is due: its own date, else its weekday in the class week it was made for.
  const weekStarts = useMemo(() => weekStartMap(cohortStart, weeks), [cohortStart, weeks]);
  const dueOf = useCallback((item: SupportChecklistItem) => effectiveDue(item, weekStarts), [weekStarts]);
  // The week the app treats as "now" (it turns over on Sunday at 10 am): an open task from before it is tagged "Carried over".
  const nowWeekNumber = useMemo(() => getIdealWeekForCohort(activeCohort, weeks)?.weekNumber ?? null, [activeCohort, weeks]);
  const weekNumberOf = (weekId: number | null) => (weekId === null ? undefined : weeks.find((week) => week.id === weekId)?.weekNumber);

  const showActivities = filter !== 'tasks';
  const showTasks = filter !== 'activities';
  const shownTasks = checklist;
  const datedTasks = useMemo(() => checklist.filter((item) => item.weekId === null), [checklist]);
  const visibleTasks = useMemo(() => checklist.filter((item) => autoHide.isVisible(item)), [autoHide, checklist]);
  const taskGroups = useMemo(() => groupTasksByDue(visibleTasks, dueOf, today), [visibleTasks, dueOf, today]);

  // Activities only: the week picker and the day views decide these, never the tasks.
  const dayGroups = useMemo(() => {
    if (!selectedWeek) return [];
    const wanted = viewMode === 'week' ? null : viewMode === 'today' ? currentDayName : viewMode === 'tomorrow' ? tomorrowName : viewMode;
    return PROGRAM_DAY_ORDER
      .filter((dayName) => wanted === null || dayName === wanted)
      .map((dayName) => ({
        dayName,
        activities: showActivities ? (selectedWeek.days.find((day) => day.dayName === dayName)?.activities ?? []).filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id))) : [],
      }))
      .filter((day) => day.activities.length > 0)
      .sort((a, b) => getProgramDayIndex(a.dayName) - getProgramDayIndex(b.dayName));
  }, [currentDayName, selectedWeek, showActivities, tomorrowName, userLabelIds, viewMode]);

  // Activities per weekday for the day strip.
  const countByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    PROGRAM_DAY_ORDER.forEach((dayName) => {
      counts[dayName] = showActivities ? (selectedWeek?.days.find((day) => day.dayName === dayName)?.activities ?? []).filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id))).length : 0;
    });
    return counts;
  }, [selectedWeek, showActivities, userLabelIds]);

  // The next thing still to do today: the first not-done activity that has not started more than an hour ago (Lagos time).
  const upNext = useMemo(() => {
    if (viewMode !== 'today' || restMode || !showActivities) return null;
    const today = dayGroups.find((day) => day.dayName === currentDayName);
    if (!today) return null;
    const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).formatToParts(clock);
    const nowMinutes = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24 * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return today.activities
      .filter((activity) => !completions.some((completion) => completion.activityId === activity.id))
      .map((activity) => ({ activity, minutes: parseTimeToMinutes(activity.time) }))
      .filter((entry): entry is { activity: typeof entry.activity; minutes: number } => entry.minutes !== null && entry.minutes >= nowMinutes - 60)
      .sort((a, b) => a.minutes - b.minutes)[0]?.activity ?? null;
  }, [clock, completions, currentDayName, dayGroups, restMode, showActivities, viewMode]);

  const completedActivityIds = useMemo(() => new Set(completions.map((completion) => completion.activityId)), [completions]);

  const handleToggleCompleted = async (activityId: number, nextValue: boolean, note?: string) => {
    if (!user || completionSavingIds.includes(activityId)) return;
    setCompletionSavingIds((prev) => [...prev, activityId]);
    setCompletionError('');
    try {
      if (nextValue) {
        const response = await supportActivityCompletionsApi.markDone(activityId, user.id, note);
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
      setCompletionError(error instanceof Error ? error.message : 'Support completion could not be updated right now.');
    } finally {
      setCompletionSavingIds((prev) => prev.filter((id) => id !== activityId));
    }
  };

  const handleDownload = async () => {
    if (!selectedWeek) return;
    setDownloading(true);
    try {
      await exportWeekToPDF(selectedWeek, { includeEmptyDays: false, filterLabelIds: userLabelIds });
    } finally {
      setDownloading(false);
    }
  };

  const tasksDone = shownTasks.filter((item) => item.done).length;
  const tasksOpen = shownTasks.length - tasksDone;
  const absenceTasksDone = absenceTasks.filter((task) => task.status === 'DONE').length;

  const tick = useChecklistTick(setChecklist, autoHide, setChecklistError);

  const toggleAbsenceTask = async (task: AttendanceFollowUpTask) => {
    if (absenceTaskSavingIds.includes(task.id)) return;
    const done = task.status !== 'DONE';
    const completionNote = (absenceTaskNotes[task.id] ?? '').trim();
    if (done && !completionNote) {
      setAbsenceTaskError('Add a short note about the absence before marking this follow-up done.');
      return;
    }
    setAbsenceTaskSavingIds((ids) => [...ids, task.id]);
    setAbsenceTaskError('');
    setAbsenceTasks((tasks) => tasks.map((entry) => entry.id === task.id ? { ...entry, status: done ? 'DONE' : 'OPEN', completedAt: done ? new Date().toISOString() : null, completionNote: done ? completionNote : null } : entry));
    try {
      const { task: saved } = await attendanceFollowUpTasksApi.setDone(task.id, done, completionNote);
      setAbsenceTasks((tasks) => tasks.map((entry) => entry.id === task.id ? { ...entry, ...saved } : entry));
    } catch (error) {
      setAbsenceTasks((tasks) => tasks.map((entry) => entry.id === task.id ? task : entry));
      setAbsenceTaskError(error instanceof Error ? error.message : 'That follow-up could not be updated.');
    } finally {
      setAbsenceTaskSavingIds((ids) => ids.filter((id) => id !== task.id));
    }
  };

  const formatFollowUpDue = (value: string) => new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));

  const attendanceFollowUpPanel = (absenceTasksLoading || absenceTasks.length > 0 || absenceTaskError) && <section className={`${CARD} border-orange-100 p-4`}>
    <div className="flex items-center justify-between gap-3"><p className="text-base font-bold text-gray-900">Attendance follow-ups</p>{!absenceTasksLoading && absenceTasks.length > 0 && <p className="text-xs font-semibold text-gray-500">{absenceTasksDone} of {absenceTasks.length} done</p>}</div>
    {absenceTaskError && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{absenceTaskError}</p>}
    {absenceTasksLoading ? <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading follow-ups…</p> : <div className="mt-2.5 flex flex-col gap-2">{absenceTasks.map((task) => {
      const done = task.status === 'DONE';
      const saving = absenceTaskSavingIds.includes(task.id);
      return <div key={task.id} className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`truncate text-sm font-semibold ${done ? 'text-gray-500' : 'text-gray-800'}`}>Follow up with {task.participantName ?? 'participant'}</p><p className="text-xs text-gray-500">Absent · due {formatFollowUpDue(task.dueAt)}</p></div>{done && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">Done</span>}</div>
        {done ? <><p className="mt-2 rounded-lg bg-white/75 px-2.5 py-2 text-xs leading-relaxed text-gray-600">{task.completionNote || 'No absence note recorded.'}</p><button type="button" disabled={saving} onClick={() => { void toggleAbsenceTask(task); }} className="mt-2 text-xs font-semibold text-gray-500 underline disabled:opacity-50">Reopen</button></> : <><textarea value={absenceTaskNotes[task.id] ?? ''} onChange={(event) => setAbsenceTaskNotes((notes) => ({ ...notes, [task.id]: event.target.value }))} rows={2} placeholder="Why were they absent?" className="mt-2 w-full resize-none rounded-lg border border-orange-100 bg-white px-2.5 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><button type="button" disabled={saving || !(absenceTaskNotes[task.id] ?? '').trim()} onClick={() => { void toggleAbsenceTask(task); }} className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Mark done'}</button></>}
      </div>;
    })}</div>}
  </section>;

  const removeTask = async (item: SupportChecklistItem) => {
    setChecklist((prev) => prev.filter((entry) => entry.id !== item.id));
    try {
      await supportChecklistApi.remove(item.id);
    } catch (error) {
      setChecklist((prev) => [...prev, item].sort((a, b) => a.position - b.position));
      setChecklistError(error instanceof Error ? error.message : 'That task could not be removed.');
    }
  };

  // A task of their own. It is kept with the class week its date falls in (or the one on screen); where it shows never depends on that.
  const addTask = async (label: string, dueDate: string | null) => {
    const cohortId = activeCohort?.id ?? selectedWeek?.cohortId ?? null;
    if (!user || !cohortId) throw new Error('Your cohort could not be found. Please try again.');
    const weekId = dueDate ? (cohortStart ? weekIdForDate(cohortStart, weeks, dueDate) : null) : (restMode ? null : selectedWeek?.id ?? null);
    if (weekId === null && !dueDate) throw new Error('Pick a deadline for this task.');
    const position = checklist.reduce((max, entry) => Math.max(max, entry.position), -1) + 1;
    const { item } = await supportChecklistApi.add(user.id, weekId, label, position, { cohortId, dueDate });
    setChecklist((prev) => [...prev, item]);
    setChecklistError('');
    setAddingTask(false);
  };

  const showRestOption = restWeeks.length > 0 && (datedTasks.length > 0 || pastLastWeek);
  // After the last class, open on the rest weeks when there are tasks waiting there.
  const autoRest = useRef(false);
  useEffect(() => {
    if (autoRest.current || checklistLoading || datedTasks.length === 0) return;
    if (wantsRest || pastLastWeek) { autoRest.current = true; setRestMode(true); }
  }, [checklistLoading, datedTasks.length, pastLastWeek, wantsRest]);

  const weekOptions = [
    ...weeks.map((week) => ({ value: String(week.id), label: `Week ${week.weekNumber}` })),
    ...(showRestOption ? [{ value: 'rest', label: 'Rest weeks' }] : []),
  ];

  const taskRow = (item: SupportChecklistItem) => {
    const taskWeek = weekNumberOf(item.weekId);
    const fromWeek = !item.done && nowWeekNumber !== null && taskWeek !== undefined && taskWeek < nowWeekNumber ? taskWeek : undefined;
    return (
    <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] bg-white p-[13px]">
      <button
        type="button"
        onClick={() => { void tick.toggle(item); }}
        aria-label={item.done ? `Mark ${item.label} not done` : `Mark ${item.label} done`}
        className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[13px] font-bold text-white ${item.done ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}
      >
        {item.done ? '✓' : ''}
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${item.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
        <ChecklistTaskMeta item={item} fromWeek={fromWeek} dueIso={dueOf(item)} />
      </span>
      {!editingChecklist && autoHide.countdowns[item.id] !== undefined && <CountdownRing seconds={autoHide.countdowns[item.id]} />}
      {editingChecklist && !isAdminChecklistTask(item) && (
        <button type="button" onClick={() => { void removeTask(item); }} className="ml-auto text-xs font-semibold text-red-700">
          Remove
        </button>
      )}
    </div>
    );
  };

  const hasOwnTasks = shownTasks.some((item) => !isAdminChecklistTask(item));
  // Rest weeks as groups of tasks; any task that falls outside them (an earlier week's, or no date) goes under "Other tasks".
  const inRest = (item: SupportChecklistItem, rw: { start: string; end: string }) => { const date = dueOf(item); return !!date && date >= rw.start && date <= rw.end; };
  const restGroups = restWeeks.map((rw) => ({
    key: String(rw.number),
    title: `Rest week ${rw.number}`,
    range: formatTaskRange(rw.start, rw.end),
    items: visibleTasks.filter((item) => inRest(item, rw)),
  }));
  const otherTasks = visibleTasks.filter((item) => !restWeeks.some((rw) => inRest(item, rw)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{restMode ? 'Rest weeks' : 'This week'}</h2>
            <TourHelpButton tourId="support:schedule" />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {restMode ? 'Classes are over. Your tasks are here until the next cohort starts.' : `Foundation of Faith Programme${selectedWeek ? ` · Week ${selectedWeek.weekNumber}` : ''}`}
          </p>
        </div>
        <button
          type="button"
          data-wt="schedule-add-task"
          onClick={() => setAddingTask(true)}
          disabled={!restMode && !selectedWeek}
          className="flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3.5 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2.6" d="M12 5v14M5 12h14" /></svg>
          Add task
        </button>
      </div>

      <div className="flex items-center gap-2">
        {weekOptions.length > 0 && (
          <div data-wt="schedule-week" className="min-w-0 flex-1">
            <AppSelect
              value={restMode ? 'rest' : selectedWeek ? String(selectedWeek.id) : ''}
              onChange={(value) => { if (value === 'rest') setRestMode(true); else { setRestMode(false); void handleWeekSelect(Number(value)); } }}
              options={weekOptions}
              placeholder="Choose week"
            />
          </div>
        )}
        {!restMode && (
          <button
            type="button"
            onClick={() => { void handleDownload(); }}
            disabled={!selectedWeek || downloading}
            title="Download this week's schedule"
            aria-label="Download this week's schedule"
            className="flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d9f2e2] bg-[#f2fbf5] px-3 text-xs font-semibold text-[#15803d] disabled:opacity-60"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>
            {downloading ? '…' : 'PDF'}
          </button>
        )}
      </div>

      {!restMode && (
        <div data-wt="schedule-tabs" role="group" aria-label="What to show" className="flex flex-wrap gap-2">
          {([['all', 'All'], ['activities', 'Activities'], ['tasks', `Tasks${tasksOpen > 0 ? ` · ${tasksOpen}` : ''}`]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`h-9 rounded-full border px-4 text-[13px] font-semibold ${filter === value ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!restMode && (
        <div data-wt="schedule-view-modes" aria-label="Which days" className="flex flex-wrap gap-2">
          {([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Full week']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={viewMode === value}
              onClick={() => setViewMode(value)}
              className={`h-10 rounded-full border px-[18px] text-sm font-semibold ${viewMode === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!restMode && selectedWeek && (
        <div data-wt="schedule-day-strip" role="group" aria-label="Pick a day" className="grid grid-cols-7 gap-1.5">
          {PROGRAM_DAY_ORDER.map((dayName) => {
            const count = countByDay[dayName] ?? 0;
            const picked = viewMode === dayName || (viewMode === 'today' && dayName === currentDayName) || (viewMode === 'tomorrow' && dayName === tomorrowName);
            const isToday = dayName === currentDayName;
            return (
              <button
                key={dayName}
                type="button"
                aria-pressed={picked}
                aria-label={`${dayName}, ${count} to do${isToday ? ', today' : ''}`}
                onClick={() => { setViewMode(isToday ? 'today' : dayName === tomorrowName ? 'tomorrow' : dayName); setOpenDays((prev) => ({ ...prev, [dayName]: true })); }}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border text-[12px] font-bold ${picked ? 'border-gray-900 bg-gray-900 text-white' : isToday ? 'border-[#ffdeca] bg-[#fff4ec] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}
              >
                <span>{dayName.slice(0, 3)}</span>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${count > 0 ? (picked ? 'bg-white' : 'bg-primary') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3.5">
        {completionError && !restMode && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{completionError}</div>
        )}
        {checklistError && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{checklistError}</p>}

        {!restMode && schedulePublished && selectedWeek && upNext && (
          <section className="rounded-[24px] border border-primary-100 bg-white p-[18px] shadow-[0_8px_24px_-14px_rgba(17,24,39,0.35)]">
            <p className="text-xs font-extrabold uppercase tracking-[0.04em] text-primary-dark">Up next · {upNext.time}</p>
            <h3 className="mt-1.5 text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-gray-900"><ActivityText text={upNext.description} /></h3>
            <button
              type="button"
              disabled={completionSavingIds.includes(upNext.id)}
              onClick={() => setNoteActivity({ id: upNext.id, label: upNext.description })}
              className="mt-3.5 flex h-[50px] w-full items-center justify-center rounded-2xl bg-primary text-[15.5px] font-extrabold text-white disabled:opacity-60"
            >
              Mark done
            </button>
          </section>
        )}

        {!restMode && attendanceFollowUpPanel}

        {(shownTasks.length > 0 && (restMode || showTasks)) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-[13px] text-gray-500">{tasksDone} of {shownTasks.length} tasks done</p>
            {tasksDone > 0 && (
              <button type="button" onClick={() => autoHide.setShowCompleted((value) => !value)} aria-pressed={autoHide.showCompleted} className="text-xs font-semibold text-primary">
                {autoHide.showCompleted ? 'Hide completed' : `Show completed (${tasksDone})`}
              </button>
            )}
            {hasOwnTasks && (
              <button type="button" onClick={() => setEditingChecklist((editing) => !editing)} className="ml-auto text-xs font-semibold text-gray-600">
                {editingChecklist ? 'Done editing' : 'Edit my tasks'}
              </button>
            )}
          </div>
        )}

        {restMode ? (
          <div className="flex flex-col gap-4">
            {checklistLoading && checklist.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading your tasks…</p>
            ) : (
              <>
                {restGroups.map((group) => (
                  <section key={group.key}>
                    <h3 className="mb-2 flex items-baseline gap-2 text-[15px] font-extrabold text-gray-900">{group.title}<span className="text-xs font-medium text-gray-500">{group.range}</span></h3>
                    {group.items.length > 0
                      ? <div className="flex flex-col gap-2">{group.items.map((item) => taskRow(item))}</div>
                      : <p className={`${CARD} px-4 py-3.5 text-[13px] text-gray-500`}>No tasks yet. You can add your own.</p>}
                  </section>
                ))}
                {otherTasks.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[15px] font-extrabold text-gray-900">Other tasks</h3>
                    <div className="flex flex-col gap-2">{otherTasks.map((item) => taskRow(item))}</div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : !schedulePublished && showActivities && filter === 'activities' ? (
          <div className={`${CARD} px-5 py-14 text-center`}>
            <p className="text-base font-semibold text-gray-700">Schedule not published yet</p>
            <p className="mt-1 text-sm text-gray-500">Your coordinator is still finalising this week’s plan. You’ll see your activities here once it’s published.</p>
          </div>
        ) : !selectedWeek ? (
          <div className={`${CARD} p-12 text-center text-sm text-gray-500`}>Select a week to view your schedule.</div>
        ) : (
          <>
            {!schedulePublished && showActivities && (
              <div className={`${CARD} px-5 py-5 text-center`}>
                <p className="text-sm font-semibold text-gray-700">Schedule not published yet</p>
                <p className="mt-1 text-[13px] text-gray-500">Your coordinator is still finalising this week’s plan. Your tasks are below.</p>
              </div>
            )}
            {showTasks && (
              <section data-wt="schedule-tasks" className={`${CARD} p-[18px]`}>
                {checklistLoading && checklist.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading your tasks…</p>
                ) : visibleTasks.length === 0 ? (
                  <>
                    <h3 className="text-base font-bold text-gray-900">Your tasks</h3>
                    <p className="mt-1 text-[13px] text-gray-500">{shownTasks.length > 0 ? 'All done. Nice work.' : 'Nothing yet. Tap Add task to make one with a deadline.'}</p>
                  </>
                ) : (
                  <div className="flex flex-col gap-4">
                    {([
                      ['overdue', 'Overdue', taskGroups.overdue, 'text-red-700'],
                      ['today', 'Today', taskGroups.today, 'text-[#c2410c]'],
                      ['upcoming', 'Coming up', taskGroups.upcoming, 'text-gray-900'],
                      ['anytime', 'No deadline', taskGroups.anytime, 'text-gray-900'],
                      ['done', 'Done', taskGroups.done, 'text-gray-400'],
                    ] as const).filter(([, , list]) => list.length > 0).map(([key, title, list, tone]) => (
                      <div key={key}>
                        <h3 className={`mb-2 text-[13px] font-extrabold uppercase tracking-[0.04em] ${tone}`}>{title}<span className="ml-1.5 font-semibold text-gray-400">{list.length}</span></h3>
                        <div className="flex flex-col gap-2">{list.map((item) => taskRow(item))}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {showActivities && dayGroups.length === 0 ? (
              <div className={`${CARD} px-5 py-12 text-center`}>
                <p className="text-base font-semibold text-gray-700">
                  {viewMode === 'today' ? 'Nothing for today' : viewMode === 'tomorrow' ? 'Nothing for tomorrow' : viewMode === 'week' ? 'Nothing for you this week' : `Nothing for ${viewMode}`}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {viewMode === 'week'
                    ? `No activities with your tags were found for Week ${selectedWeek.weekNumber}.`
                    : viewMode === 'today' || viewMode === 'tomorrow' ? 'Switch to the full week to see everything else.' : 'Pick another day above, or open the full week.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dayGroups.map((day) => {
                  const open = !!openDays[day.dayName];
                  const total = day.activities.length;
                  return (
                    <section key={day.dayName} className={`${CARD} overflow-hidden`}>
                      <button
                        type="button"
                        onClick={() => setOpenDays((prev) => ({ ...prev, [day.dayName]: !prev[day.dayName] }))}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2.5 p-[18px] text-left"
                      >
                        <svg className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m9 5 7 7-7 7" /></svg>
                        <span className="text-base font-bold text-gray-900">{day.dayName}</span>
                        <span className="text-[13px] text-gray-500">
                          ({day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'})
                        </span>
                        <span className="ml-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">{total}</span>
                      </button>
                      {open && (
                        <div className="flex flex-col gap-2.5 px-[18px] pb-[18px]">
                          {day.activities.map((activity) => {
                            const done = completedActivityIds.has(activity.id);
                            const completable = day.dayName === currentDayName;
                            const saving = completionSavingIds.includes(activity.id);
                            return (
                              <div key={activity.id} className={`min-h-[96px] rounded-2xl border p-4 ${done ? 'border-[#d9f2e2] bg-[#f2fbf5]' : 'border-[#f1ece7] bg-[#fffdfb]'}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[13px] font-bold tabular-nums text-gray-900">{activity.time}</span>
                                  <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563eb]">{PERIOD_LABEL[activity.period] ?? activity.period}</span>
                                </div>
                                <p className={`mt-2 text-base font-semibold ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}><ActivityText text={activity.description} /></p>
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                  {activity.labels?.filter((label) => userLabelIds.includes(label.id)).map((label) => (
                                    <span key={label.id} className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">{label.name}</span>
                                  ))}
                                  {completable && (
                                    <button
                                      type="button"
                                      data-wt="activity-mark-done"
                                      disabled={saving}
                                      onClick={() => { if (done) void handleToggleCompleted(activity.id, false); else setNoteActivity({ id: activity.id, label: activity.description }); }}
                                      className={`ml-auto flex items-center gap-1.5 rounded-[10px] border px-3 py-[7px] text-xs font-bold transition disabled:opacity-60 ${done ? 'border-[#15803d] bg-[#15803d] text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                                    >
                                      {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : done ? '✓ Done' : 'Mark done'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {addingTask && (
        <AddTaskSheet
          today={today}
          allowNoDeadline={!restMode}
          defaultDate={restMode ? restWeeks.find((rw) => today <= rw.end)?.end ?? null : null}
          hideToday={restMode}
          minDate={restMode ? (() => { const next = restWeeks.find((rw) => today <= rw.end); return next ? (next.start > today ? next.start : today) : undefined; })() : undefined}
          quickPicks={restMode ? restWeeks.filter((rw) => rw.end >= today).map((rw) => ({ label: `End of rest ${rw.number}`, date: rw.end })) : []}
          onAdd={addTask}
          onClose={() => setAddingTask(false)}
        />
      )}
      {noteActivity && (
        <TaskNoteSheet
          taskLabel={noteActivity.label}
          onCancel={() => setNoteActivity(null)}
          onSave={(note) => { const { id } = noteActivity; setNoteActivity(null); void handleToggleCompleted(id, true, note); }}
        />
      )}
      {tick.noteTask && <TaskNoteSheet taskLabel={tick.noteTask.label} onCancel={tick.cancelNote} onSave={tick.saveNote} />}
    </div>
  );
};

export default SupportSchedulePage;
