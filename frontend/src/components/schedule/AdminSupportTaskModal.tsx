import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppMultiSelect from '../AppMultiSelect';
import AppSelect from '../AppSelect';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { adminChecklistApi, supportTagsApi, usersApi } from '../../services/api';
import type { AdminChecklistTarget, AdminChecklistTask, Cohort, SupportTag, User, Week } from '../../types';
import { DUE_DAYS, formatTaskDate, formatTaskRange, restWeeksAfter } from '../../utils/checklist';
import { hasSupportRole } from '../../utils/people';
import { pickableUsers } from '../../utils/testUsers';

interface AdminSupportTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The cohort's weeks. */
  weeks: Week[];
  /** The week the admin is looking at on the Schedule page. */
  selectedWeek: Week | null;
  /** The cohort on screen; its rest weeks (after the last class) can be chosen. */
  cohort: Cohort | null;
}

const INPUT = 'min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const quiet = 'rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95';
const primary = 'rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60';

const EVERYONE = '__ALL__';
const LEADERS = '__LEADERS__';
const PEOPLE = '__USERS__';
const TAG_PREFIX = 'tag:';

/**
 * One pop-up to put a task on supports' lists: the task, which class weeks (this week by
 * default) or the rest weeks after the cohort, an optional due day, and who (everyone by
 * default, or only the supports who lead a group). Under it, the tasks already added, with
 * who has done them.
 */
const AdminSupportTaskModal: React.FC<AdminSupportTaskModalProps> = ({ isOpen, onClose, weeks, selectedWeek, cohort }) => {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [dueDay, setDueDay] = useState('');
  // Class weeks (this one, or more) or the rest weeks after the cohort, which have no class week.
  const [weekMode, setWeekMode] = useState<'this' | 'more' | 'rest'>('this');
  const moreWeeks = weekMode === 'more';
  const restMode = weekMode === 'rest';
  const [pickedWeeks, setPickedWeeks] = useState<number[]>([]);
  const [pickedRest, setPickedRest] = useState<number[]>([]);
  const [forWho, setForWho] = useState(EVERYONE);
  const [people, setPeople] = useState<string[]>([]);
  const [supports, setSupports] = useState<User[]>([]);
  const [tags, setTags] = useState<SupportTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<AdminChecklistTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const [tasksError, setTasksError] = useState('');
  // Only the latest load may update the list, so a slow earlier one can't overwrite it.
  const loadSeq = useRef(0);
  const reloadTasks = async () => {
    const cohortId = cohort?.id ?? selectedWeek?.cohortId ?? null;
    if (restMode ? !cohortId : !selectedWeek) { setTasks([]); return; }
    const seq = ++loadSeq.current;
    setTasksLoading(true);
    setTasksError('');
    try {
      const list = restMode ? await adminChecklistApi.listRestTasks(cohortId as string) : await adminChecklistApi.listTasks((selectedWeek as Week).id);
      if (seq === loadSeq.current) setTasks(list);
    } catch (err) {
      if (seq === loadSeq.current) setTasksError(err instanceof Error && err.message === 'SESSION_EXPIRED' ? 'Your session ended. Sign in again to see the tasks.' : 'Could not load the tasks. Close and reopen to try again.');
    } finally {
      if (seq === loadSeq.current) setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    void reloadTasks();
    let cancelled = false;
    Promise.all([usersApi.getAll(), supportTagsApi.getAll()])
      .then(([usersRes, tagsRes]) => {
        if (cancelled) return;
        setSupports(pickableUsers(usersRes.users).filter((u) => hasSupportRole(u) && u.isActive !== false && !u.isTest));
        setTags(tagsRes.tags);
      })
      .catch(() => { /* the pickers stay empty; Everyone still works */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedWeek?.id, restMode]);

  const otherWeeks = useMemo(() => weeks.filter((w) => w.id !== selectedWeek?.id).sort((a, b) => a.weekNumber - b.weekNumber), [weeks, selectedWeek?.id]);
  const restWeeks = useMemo(() => (cohort ? restWeeksAfter(cohort, weeks) : []), [cohort, weeks]);
  const forOptions = useMemo(() => [
    { value: EVERYONE, label: 'Everyone' },
    { value: LEADERS, label: 'Group leaders' },
    ...tags.map((t) => ({ value: TAG_PREFIX + t.id, label: t.name })),
    { value: PEOPLE, label: 'Choose people…' },
  ], [tags]);
  const supportOptions = useMemo(() => supports.map((u) => ({ value: u.id, label: u.name })).sort((a, b) => a.label.localeCompare(b.label)), [supports]);

  const target = (): AdminChecklistTarget =>
    forWho === PEOPLE ? { kind: 'USERS', userIds: people }
      : forWho === LEADERS ? { kind: 'LEADERS' }
      : forWho.startsWith(TAG_PREFIX) ? { kind: 'TAG', tagId: forWho.slice(TAG_PREFIX.length) }
        : { kind: 'ALL' };

  const cohortId = cohort?.id ?? selectedWeek?.cohortId ?? null;
  const canAdd = (restMode ? pickedRest.length > 0 && !!cohortId : !!selectedWeek) && label.trim().length >= 2 && (forWho !== PEOPLE || people.length > 0);

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    setError('');
    try {
      const weekIds = restMode ? [] : [(selectedWeek as Week).id, ...(moreWeeks ? pickedWeeks : [])];
      // A rest-week task is due on the last day of that rest week.
      const dueDates = restMode ? restWeeks.filter((rw) => pickedRest.includes(rw.number)).map((rw) => rw.end) : [];
      const res = await adminChecklistApi.addSupportTask({ label: label.trim(), weekIds, cohortId, dueDay: restMode ? null : dueDay || null, dueDates, target: target() });
      toast({
        tone: res.supports > 0 ? 'success' : 'info',
        message: res.supports > 0
          ? `Added for ${res.supports} ${res.supports === 1 ? 'support' : 'supports'}${res.skipped > 0 ? '. Some already had a task with that name.' : '.'}`
          : 'Nothing was added: they already have a task with that name in the chosen weeks.',
      });
      setLabel('');
      setDueDay('');
      if (!restMode) setWeekMode('this');
      setPickedWeeks([]);
      setPickedRest([]);
      await reloadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (task: AdminChecklistTask, allWeeks: boolean) => {
    if (!restMode && !selectedWeek) return;
    try {
      await adminChecklistApi.deleteTask(task.taskGroupId, restMode || allWeeks ? null : (selectedWeek as Week).id);
      setConfirmRemove(null);
      await reloadTasks();
      toast({ tone: 'success', message: restMode ? 'Removed from the rest weeks.' : allWeeks ? 'Removed from every week.' : `Removed from Week ${(selectedWeek as Week).weekNumber}.` });
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not remove it.' });
    }
  };

  const footer = (
    <>
      <button type="button" onClick={onClose} className={quiet}>Close</button>
      <button type="button" onClick={() => { void submit(); }} disabled={!canAdd || saving} className={primary}>
        {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding…</span>) : 'Add task'}
      </button>
    </>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Task for supports"
      subtitle={restMode ? `Goes on their list · rest weeks after ${cohort?.name ?? 'the cohort'}` : selectedWeek ? `Goes on their list · Week ${selectedWeek.weekNumber}` : 'Pick a week first'}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Task</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={140} placeholder="e.g. Send the week's report to your hub lead" className={INPUT} />
        </label>

        {!restMode && (
          <AppSelect
            label="Due day"
            value={dueDay}
            onChange={(value) => setDueDay(value)}
            options={[{ value: '', label: 'No due day' }, ...DUE_DAYS.map((d) => ({ value: d, label: d }))]}
            placeholder="No due day"
          />
        )}

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Weeks</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Weeks">
            {([['this', 'This week only'], ['more', 'More weeks…'], ['rest', 'Rest weeks']] as const).map(([mode, text]) => (
              <button key={mode} type="button" role="radio" aria-checked={weekMode === mode} onClick={() => setWeekMode(mode)}
                className={`min-h-[44px] rounded-xl px-1 text-[13.5px] font-semibold transition ${weekMode === mode ? 'bg-primary text-white' : 'bg-[#f6f7f9] text-gray-700'}`}>
                {text}
              </button>
            ))}
          </div>
          {restMode && (
            <div className="mt-2.5 rounded-2xl bg-[#f6f7f9] p-3">
              <p className="mb-2 text-xs text-gray-500">
                {restWeeks.length === 0 ? 'This cohort has no rest weeks to show yet.' : 'The weeks after the cohort ends, taken from the Planner. The task is due on the last day of each week you pick. The dates are fixed when you add it.'}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {restWeeks.map((rw) => {
                  const on = pickedRest.includes(rw.number);
                  return (
                    <button key={rw.number} type="button" aria-pressed={on}
                      onClick={() => setPickedRest((prev) => (on ? prev.filter((n) => n !== rw.number) : [...prev, rw.number]))}
                      className={`min-h-[44px] rounded-xl px-2 text-[13px] font-semibold transition ${on ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}>
                      Rest {rw.number}<span className="block text-[11px] font-medium opacity-80">{formatTaskRange(rw.start, rw.end)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {weekMode === 'more' && (
            <div className="mt-2.5 rounded-2xl bg-[#f6f7f9] p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>This week is always included.</span>
                <span className="flex gap-3 font-semibold text-primary">
                  <button type="button" onClick={() => setPickedWeeks(otherWeeks.map((w) => w.id))}>Select all</button>
                  <button type="button" onClick={() => setPickedWeeks([])}>Clear</button>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {otherWeeks.map((w) => {
                  const on = pickedWeeks.includes(w.id);
                  return (
                    <button key={w.id} type="button" aria-pressed={on}
                      onClick={() => setPickedWeeks((prev) => (on ? prev.filter((id) => id !== w.id) : [...prev, w.id]))}
                      className={`min-h-[40px] rounded-xl text-[13px] font-semibold transition ${on ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}>
                      Week {w.weekNumber}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <AppSelect label="For" value={forWho} onChange={(value) => setForWho(value)} options={forOptions} placeholder="Everyone" />
        {forWho === PEOPLE && (
          <AppMultiSelect values={people} onChange={setPeople} options={supportOptions} placeholder="Choose supports" />
        )}

        {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-1 border-t border-gray-100 pt-4">
          <h3 className="text-[13px] font-semibold text-gray-900">Already added{restMode ? ' · rest weeks' : selectedWeek ? ` · Week ${selectedWeek.weekNumber}` : ''}</h3>
          {tasksLoading ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : tasksError ? (
            <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{tasksError}</p>
          ) : tasks.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{restMode ? 'Nothing added for the rest weeks yet.' : 'Nothing added for this week yet.'}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {tasks.map((task) => {
                // A task added for several rest weeks comes back once per date, so a date joins the key.
                const rowKey = `${task.taskGroupId}|${task.dueDate ?? ''}`;
                return (
                <li key={rowKey} className="rounded-2xl bg-[#f6f7f9] px-3.5 py-3">
                  <button type="button" onClick={() => setOpenTask(openTask === rowKey ? null : rowKey)} aria-expanded={openTask === rowKey} className="flex w-full items-start gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{task.label}</span>
                      <span className="block text-xs text-gray-500">{task.done} of {task.total} done{task.dueDate ? ` · due ${formatTaskDate(task.dueDate)}` : task.dueDay ? ` · due ${task.dueDay}` : ''}</span>
                    </span>
                    <svg className={`mt-1 h-4 w-4 flex-none text-gray-400 transition-transform ${openTask === rowKey ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
                  </button>
                  {openTask === rowKey && (
                    <div className="mt-2.5 border-t border-gray-200 pt-2.5">
                      <ul className="flex flex-col gap-1.5">
                        {task.people.map((p) => (
                          <li key={p.userId} className="text-[13px]">
                            <span className={p.done ? 'font-semibold text-emerald-700' : 'text-gray-600'}>{p.done ? '✓' : '○'} {p.name}</span>
                            {p.note && <span className="mt-0.5 block whitespace-pre-wrap pl-4 text-gray-500">“{p.note}”</span>}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        {confirmRemove === rowKey ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-600">{restMode ? 'Remove from every rest week:' : 'Remove from:'}</span>
                            {!restMode && <button type="button" onClick={() => { void remove(task, false); }} className="rounded-full bg-red-100/80 px-3 py-1 text-[12px] font-semibold text-red-700">This week</button>}
                            <button type="button" onClick={() => { void remove(task, true); }} className="rounded-full bg-red-100/80 px-3 py-1 text-[12px] font-semibold text-red-700">{restMode ? 'Remove' : 'Every week'}</button>
                            <button type="button" onClick={() => setConfirmRemove(null)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-gray-600">Keep</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmRemove(rowKey)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-red-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]">Remove</button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

export default AdminSupportTaskModal;
