import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import ActivityText from '../components/ActivityText';
import AppSelect from '../components/AppSelect';
import TourHelpButton from '../components/tour/TourHelpButton';
import SegmentedTabs from '../components/SegmentedTabs';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { attendanceFollowUpTasksApi, supportActivityCompletionsApi, supportChecklistApi } from '../services/api';
import { PROGRAM_DAY_ORDER, getCurrentProgramDayName, getProgramDayIndex } from '../utils/schedule';
import { exportWeekToPDF } from '../utils/pdfExport';
import type { AttendanceFollowUpTask, SupportActivityCompletion, SupportChecklistItem, User } from '../types';
import { CountdownRing, useChecklistAutoHide } from '../components/ChecklistAutoHide';
import Spinner from '../components/Spinner';

type WeeklyTab = 'schedule' | 'checklist';
type ViewMode = 'today' | 'tomorrow' | 'week';

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
  const [tab, setTab] = useState<WeeklyTab>(initialTab === 'checklist' ? initialTab : 'schedule');
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  const [completionSavingIds, setCompletionSavingIds] = useState<number[]>([]);
  const [completionError, setCompletionError] = useState('');
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => ({ [getCurrentProgramDayName()]: true }));
  const [downloading, setDownloading] = useState(false);

  const [checklist, setChecklist] = useState<SupportChecklistItem[]>([]);
  const [absenceTasks, setAbsenceTasks] = useState<AttendanceFollowUpTask[]>([]);
  const [absenceTaskNotes, setAbsenceTaskNotes] = useState<Record<string, string>>({});
  const [absenceTasksLoading, setAbsenceTasksLoading] = useState(false);
  const [absenceTaskSavingIds, setAbsenceTaskSavingIds] = useState<string[]>([]);
  const [absenceTaskError, setAbsenceTaskError] = useState('');
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState('');
  const [editingChecklist, setEditingChecklist] = useState(false);
  const autoHide = useChecklistAutoHide();
  const [newDuty, setNewDuty] = useState('');
  const [addingDuty, setAddingDuty] = useState(false);

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

  useEffect(() => {
    if (!selectedWeek || !user) return;
    let cancelled = false;
    setChecklistLoading(true);
    supportChecklistApi.getForWeek(user.id, selectedWeek.id)
      .then(({ items }) => {
        if (!cancelled) { setChecklist(items); setChecklistError(''); }
      })
      .catch((error) => {
        if (!cancelled) setChecklistError(error instanceof Error ? error.message : 'Your checklist could not be loaded right now.');
      })
      .finally(() => { if (!cancelled) setChecklistLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWeek, user]);

  const currentDayName = getCurrentProgramDayName();
  const tomorrowName = PROGRAM_DAY_ORDER[(getProgramDayIndex(currentDayName) + 1) % PROGRAM_DAY_ORDER.length];

  const dayGroups = useMemo(() => {
    if (!selectedWeek) return [];
    return selectedWeek.days
      .filter((day) => viewMode === 'week' || day.dayName === (viewMode === 'today' ? currentDayName : tomorrowName))
      .map((day) => ({
        dayName: day.dayName,
        activities: day.activities.filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id))),
      }))
      .filter((day) => day.activities.length > 0)
      .sort((a, b) => getProgramDayIndex(a.dayName) - getProgramDayIndex(b.dayName));
  }, [currentDayName, selectedWeek, tomorrowName, userLabelIds, viewMode]);

  const completedActivityIds = useMemo(() => new Set(completions.map((completion) => completion.activityId)), [completions]);

  const handleToggleCompleted = async (activityId: number, nextValue: boolean) => {
    if (!user) return;
    setCompletionSavingIds((prev) => [...prev, activityId]);
    setCompletionError('');
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

  const checklistDone = checklist.filter((item) => item.done).length;
  const absenceTasksDone = absenceTasks.filter((task) => task.status === 'DONE').length;

  const toggleDuty = async (item: SupportChecklistItem) => {
    setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: !item.done } : entry));
    if (item.done) autoHide.cancel(item.id); else autoHide.start(item.id);
    try {
      await supportChecklistApi.setDone(item.id, !item.done);
    } catch (error) {
      autoHide.cancel(item.id);
      setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: item.done } : entry));
      setChecklistError(error instanceof Error ? error.message : 'That duty could not be updated.');
    }
  };

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

  const removeDuty = async (item: SupportChecklistItem) => {
    setChecklist((prev) => prev.filter((entry) => entry.id !== item.id));
    try {
      await supportChecklistApi.remove(item.id);
    } catch (error) {
      setChecklist((prev) => [...prev, item].sort((a, b) => a.position - b.position));
      setChecklistError(error instanceof Error ? error.message : 'That duty could not be removed.');
    }
  };

  const addDuty = async () => {
    const label = newDuty.trim();
    if (!label || !user || !selectedWeek || addingDuty) return;
    setAddingDuty(true);
    try {
      const position = checklist.reduce((max, entry) => Math.max(max, entry.position), -1) + 1;
      const { item } = await supportChecklistApi.add(user.id, selectedWeek.id, label, position);
      setChecklist((prev) => [...prev, item]);
      setNewDuty('');
      setChecklistError('');
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : 'That duty could not be added.');
    } finally {
      setAddingDuty(false);
    }
  };

  const weekOptions = weeks.map((week) => ({
    value: String(week.id),
    label: `Week ${week.weekNumber}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">This week</h2>
          <TourHelpButton tourId="support:schedule" />
        </div>
        <p className="mt-0.5 text-sm text-gray-500">Foundation of Faith Programme{selectedWeek ? ` · Week ${selectedWeek.weekNumber}` : ''}</p>
      </div>

      <div data-wt="schedule-tabs">
        <SegmentedTabs
          tabs={[
            { key: 'schedule', label: 'Schedule' },
            { key: 'checklist', label: 'Checklist' },
          ]}
          active={tab}
          onChange={(key) => setTab(key as WeeklyTab)}
        />
      </div>

      <div className="flex items-center gap-2">
        {weekOptions.length > 0 && (
          <div data-wt="schedule-week" className="min-w-0 flex-1">
            <AppSelect
              value={selectedWeek ? String(selectedWeek.id) : ''}
              onChange={(value) => { void handleWeekSelect(Number(value)); }}
              options={weekOptions}
              placeholder="Choose week"
            />
          </div>
        )}
        {tab === 'schedule' && (
          <div data-wt="schedule-view-modes" className="min-w-0 flex-1">
            <AppSelect
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
                { value: 'week', label: 'Full week' },
              ]}
              placeholder="Choose view"
            />
          </div>
        )}
        {tab === 'schedule' && (
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

      {tab === 'schedule' && (
        <div className="flex min-w-0 flex-col gap-3.5">
          {completionError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{completionError}</div>
          )}

          {attendanceFollowUpPanel}

          {!schedulePublished ? (
            <div className={`${CARD} px-5 py-14 text-center`}>
              <p className="text-base font-semibold text-gray-700">Schedule not published yet</p>
              <p className="mt-1 text-sm text-gray-500">Your coordinator is still finalising this week’s plan. You’ll see your activities here once it’s published.</p>
            </div>
          ) : !selectedWeek ? (
            <div className={`${CARD} p-12 text-center text-sm text-gray-500`}>Select a week to view your schedule.</div>
          ) : dayGroups.length === 0 ? (
            <div className={`${CARD} px-5 py-12 text-center`}>
              <p className="text-base font-semibold text-gray-700">
                {viewMode === 'today' ? 'Nothing assigned for today' : viewMode === 'tomorrow' ? 'Nothing assigned for tomorrow' : 'No activities for you this week'}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {viewMode === 'week'
                  ? `No activities with your activity tags were found for Week ${selectedWeek.weekNumber}.`
                  : 'Switch to the full week to see everything else.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dayGroups.map((day) => {
                const open = !!openDays[day.dayName];
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
                      <span className="text-[13px] text-gray-500">({day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'})</span>
                      <span className="ml-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">{day.activities.length}</span>
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
                                    onClick={() => { void handleToggleCompleted(activity.id, !done); }}
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
        </div>
      )}

      {tab === 'checklist' && (
        <section className={`${CARD} p-5`}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-gray-900">This week's duties</h2>
              <p className="text-[13px] text-gray-500">{checklistDone} of {checklist.length} done</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingChecklist((editing) => !editing)}
              className="flex-none rounded-[10px] border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700"
            >
              {editingChecklist ? 'Done editing' : 'Edit list'}
            </button>
          </div>
          {checklistDone > 0 && (
            <button
              type="button"
              onClick={() => autoHide.setShowCompleted((value) => !value)}
              aria-pressed={autoHide.showCompleted}
              className="mt-2 text-xs font-semibold text-primary"
            >
              {autoHide.showCompleted ? 'Hide completed' : `Show completed (${checklistDone})`}
            </button>
          )}
          {checklistError && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{checklistError}</p>}
          {checklist.length > 0 && checklistDone === checklist.length && (
            <div className="mt-3 rounded-xl border border-[#d9f2e2] bg-[#f2fbf5] px-3.5 py-3 text-[13px] font-semibold text-[#15803d]">All duties complete for this week.</div>
          )}
          {checklistLoading && checklist.length === 0 ? (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading your checklist…</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {checklist.filter((item) => autoHide.isVisible(item)).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-[13px]">
                  <button
                    type="button"
                    onClick={() => { void toggleDuty(item); }}
                    aria-label={item.done ? `Mark ${item.label} not done` : `Mark ${item.label} done`}
                    className={`grid h-6 w-6 flex-none place-items-center rounded-lg border text-[13px] font-bold text-white ${item.done ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}
                  >
                    {item.done ? '✓' : ''}
                  </button>
                  <span className={`text-sm font-semibold ${item.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
                  {!editingChecklist && autoHide.countdowns[item.id] !== undefined && <CountdownRing seconds={autoHide.countdowns[item.id]} />}
                  {editingChecklist && (
                    <button type="button" onClick={() => { void removeDuty(item); }} className="ml-auto text-xs font-semibold text-red-700">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {editingChecklist && (
            <div className="mt-3.5 flex gap-2">
              <input
                value={newDuty}
                onChange={(event) => setNewDuty(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void addDuty(); }}
                placeholder="Add a duty"
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button type="button" onClick={() => { void addDuty(); }} disabled={addingDuty} className="rounded-xl bg-[#3f4757] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                {addingDuty ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding…</span>) : 'Add'}
              </button>
            </div>
          )}
        </section>
      )}

    </div>
  );
};

export default SupportSchedulePage;
