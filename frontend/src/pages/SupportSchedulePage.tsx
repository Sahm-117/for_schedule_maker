import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import ActivityText from '../components/ActivityText';
import AppSelect from '../components/AppSelect';
import SegmentedTabs from '../components/SegmentedTabs';
import InfoTip from '../components/InfoTip';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { supportActivityCompletionsApi } from '../services/api';
import { PROGRAM_DAY_ORDER, getCurrentProgramDayName, getProgramDayIndex } from '../utils/schedule';
import { exportWeekToPDF } from '../utils/pdfExport';
import type { SupportActivityCompletion } from '../types';
import { useWalkthrough } from '../hooks/useWalkthrough';
import WalkthroughPopup from '../components/walkthrough/WalkthroughPopup';

type WeeklyTab = 'schedule' | 'checklist' | 'cover';
type ViewMode = 'today' | 'tomorrow' | 'week';

const PERIOD_LABEL: Record<string, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };

// Checklist and cover requests are UI-only until their tables exist.
const DEFAULT_CHECKLIST = [
  'Contact assigned participants',
  'Confirm attendance',
  'Follow up with absent participants',
  'Complete group activity',
  'Submit weekly report',
];

type ChecklistItem = { id: number; label: string; done: boolean };
type CoverRequest = { id: number; reason: string; period: string; status: string };

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const INPUT = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const formatPeriod = (from: string, until: string) => {
  const fmt = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  return `${fmt(from)} to ${fmt(until)}`;
};

const SupportSchedulePage: React.FC = () => {
  const { user, userLabelIds } = useAuth();
  const { weeks, selectedWeek, handleWeekSelect, activeCohort } = useAppData();
  const [searchParams] = useSearchParams();
  const schedulePublished = activeCohort?.schedulePublished !== false;
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<WeeklyTab>(initialTab === 'checklist' || initialTab === 'cover' ? initialTab : 'schedule');
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  const [completionSavingIds, setCompletionSavingIds] = useState<number[]>([]);
  const [completionError, setCompletionError] = useState('');
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => ({ [getCurrentProgramDayName()]: true }));
  const [downloading, setDownloading] = useState(false);

  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => DEFAULT_CHECKLIST.map((label, index) => ({ id: index, label, done: false })));
  const [editingChecklist, setEditingChecklist] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [newDuty, setNewDuty] = useState('');

  const [cover, setCover] = useState({ reason: '', from: '', until: '', note: '' });
  const [coverTouched, setCoverTouched] = useState(false);
  const [coverRequests, setCoverRequests] = useState<CoverRequest[]>([]);

  const wt = useWalkthrough('schedule');

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/schedule" replace />;
  }

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
  const addDuty = () => {
    const label = newDuty.trim();
    if (!label) return;
    setChecklist((prev) => [...prev, { id: Date.now(), label, done: false }]);
    setNewDuty('');
  };

  const coverReasonError = coverTouched && !cover.reason.trim() ? 'Give a reason for the cover request.' : '';
  const coverPeriodError = coverTouched && (!cover.from || !cover.until)
    ? 'Say which period needs cover.'
    : coverTouched && cover.from && cover.until && cover.until <= cover.from
      ? 'The end has to be after the start.'
      : '';
  const submitCover = () => {
    if (!cover.reason.trim() || !cover.from || !cover.until || cover.until <= cover.from) { setCoverTouched(true); return; }
    setCoverRequests((prev) => [{ id: Date.now(), reason: cover.reason.trim(), period: formatPeriod(cover.from, cover.until), status: 'Pending' }, ...prev]);
    setCover({ reason: '', from: '', until: '', note: '' });
    setCoverTouched(false);
  };

  const weekOptions = weeks.map((week) => ({
    value: String(week.id),
    label: `Week ${week.weekNumber}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Your activities for the week...</h2>
        <p className="mt-0.5 text-sm text-gray-500">Foundation of Faith Programme{selectedWeek ? ` · Week ${selectedWeek.weekNumber}` : ''}</p>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <SegmentedTabs
            tabs={[
              { key: 'schedule', label: 'Schedule' },
              { key: 'checklist', label: 'Checklist' },
              { key: 'cover', label: 'Cover request' },
            ]}
            active={tab}
            onChange={(key) => setTab(key as WeeklyTab)}
          />
        </div>
        {weekOptions.length > 0 && (
          <div className="w-full flex-none sm:w-44">
            <AppSelect
              value={selectedWeek ? String(selectedWeek.id) : ''}
              onChange={(value) => { void handleWeekSelect(Number(value)); }}
              options={weekOptions}
              placeholder="Choose week"
            />
          </div>
        )}
      </div>

      {tab === 'schedule' && (
        <div className="flex min-w-0 flex-col gap-3.5">
          {completionError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{completionError}</div>
          )}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div data-wt="schedule-view-modes" className="min-w-0 sm:flex-1">
              <AppSelect
                value={viewMode}
                onChange={(value) => setViewMode(value as ViewMode)}
                options={[
                  { value: 'today', label: "Today's schedule" },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: 'week', label: 'Full week' },
                ]}
                placeholder="Choose view"
              />
            </div>
            <button
              type="button"
              onClick={() => { void handleDownload(); }}
              disabled={!selectedWeek || downloading}
              className="flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#d9f2e2] bg-[#f2fbf5] px-4 py-2.5 text-sm font-semibold text-[#15803d] disabled:opacity-60 sm:flex-1"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>
              {downloading ? 'Preparing…' : 'Download'}
            </button>
          </div>

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
                                    {saving ? 'Saving…' : done ? '✓ Done' : 'Mark done'}
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">This week's duties</h2>
                <InfoTip label="About the checklist">Checklist changes are not saved yet.</InfoTip>
              </div>
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
              onClick={() => setHideDone((value) => !value)}
              aria-pressed={hideDone}
              className="mt-2 text-xs font-semibold text-primary"
            >
              {hideDone ? `Show done (${checklistDone})` : `Hide done (${checklistDone})`}
            </button>
          )}
          {checklist.length > 0 && checklistDone === checklist.length && (
            <div className="mt-3 rounded-xl border border-[#d9f2e2] bg-[#f2fbf5] px-3.5 py-3 text-[13px] font-semibold text-[#15803d]">All duties complete for this week.</div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {checklist.filter((item) => !hideDone || !item.done).map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-[13px]">
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
                  aria-label={item.done ? `Mark ${item.label} not done` : `Mark ${item.label} done`}
                  className={`grid h-6 w-6 flex-none place-items-center rounded-lg border text-[13px] font-bold text-white ${item.done ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}
                >
                  {item.done ? '✓' : ''}
                </button>
                <span className={`text-sm font-semibold ${item.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
                {editingChecklist && (
                  <button type="button" onClick={() => setChecklist((prev) => prev.filter((entry) => entry.id !== item.id))} className="ml-auto text-xs font-semibold text-red-700">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {editingChecklist && (
            <div className="mt-3.5 flex gap-2">
              <input
                value={newDuty}
                onChange={(event) => setNewDuty(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') addDuty(); }}
                placeholder="Add a duty"
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button type="button" onClick={addDuty} className="rounded-xl bg-[#3f4757] px-4 py-2.5 text-[13px] font-semibold text-white">Add</button>
            </div>
          )}
        </section>
      )}

      {tab === 'cover' && (
        <>
          <section className={`${CARD} p-5`}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Request cover</h2>
              <InfoTip label="About cover requests">Cover requests are not sent to Operations yet.</InfoTip>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">Sent to Operations for review.</p>
            <div className="mt-4 flex flex-col gap-3.5">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Reason</span>
                <textarea value={cover.reason} onChange={(e) => setCover((prev) => ({ ...prev, reason: e.target.value }))} rows={3} placeholder="Travelling for a family event, back the following week." className={`${INPUT} resize-y`} />
                {coverReasonError && <span className="mt-1.5 block text-xs text-red-700">{coverReasonError}</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">From</span>
                <input type="datetime-local" value={cover.from} onChange={(e) => setCover((prev) => ({ ...prev, from: e.target.value }))} className={`${INPUT} min-h-[46px]`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Until</span>
                <input type="datetime-local" value={cover.until} onChange={(e) => setCover((prev) => ({ ...prev, until: e.target.value }))} className={`${INPUT} min-h-[46px]`} />
                {coverPeriodError && <span className="mt-1.5 block text-xs text-red-700">{coverPeriodError}</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Note (optional)</span>
                <textarea value={cover.note} onChange={(e) => setCover((prev) => ({ ...prev, note: e.target.value }))} rows={2} className={`${INPUT} resize-y`} />
              </label>
              <button type="button" onClick={submitCover} className="min-h-[48px] rounded-xl bg-primary p-3 text-[15px] font-semibold text-white">Send request</button>
            </div>
          </section>
          {coverRequests.length > 0 && (
            <section className={`${CARD} p-[18px]`}>
              <h3 className="mb-3 text-sm font-bold text-gray-900">Your requests</h3>
              <div className="flex flex-col gap-2.5">
                {coverRequests.map((request) => (
                  <div key={request.id} className="rounded-[14px] border border-[#f1f2f5] p-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-semibold text-gray-900">{request.reason}</span>
                      <span className="ml-auto rounded-full bg-[#fff8f3] px-2.5 py-0.5 text-[11px] font-bold text-[#c2410c]">{request.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{request.period}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {wt.show && tab === 'schedule' && (
        <WalkthroughPopup
          steps={[
            { targetSelector: '[data-wt="schedule-view-modes"]', title: 'View modes', body: 'Switch between today, tomorrow, or the whole week.', position: 'bottom' },
            { targetSelector: '[data-wt="activity-mark-done"]', title: 'Mark activities done', body: 'Tap "Mark done" when you finish an activity. It saves instantly. Tap again to undo.', position: 'top' },
          ]}
          onDone={wt.done}
          onSkip={wt.skipAll}
        />
      )}
    </div>
  );
};

export default SupportSchedulePage;
