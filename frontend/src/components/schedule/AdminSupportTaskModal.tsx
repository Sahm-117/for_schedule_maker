import React, { useEffect, useMemo, useState } from 'react';
import AppMultiSelect from '../AppMultiSelect';
import AppSelect from '../AppSelect';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { adminChecklistApi, supportTagsApi, usersApi } from '../../services/api';
import type { AdminChecklistTarget, AdminChecklistTask, SupportTag, User, Week } from '../../types';
import { DUE_DAYS } from '../../utils/checklist';
import { hasSupportRole } from '../../utils/people';
import { pickableUsers } from '../../utils/testUsers';

interface AdminSupportTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The cohort's weeks. */
  weeks: Week[];
  /** The week the admin is looking at on the Schedule page. */
  selectedWeek: Week | null;
}

const INPUT = 'min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const quiet = 'rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95';
const primary = 'rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60';

const EVERYONE = '__ALL__';
const PEOPLE = '__USERS__';
const TAG_PREFIX = 'tag:';

/**
 * One pop-up to put a task on supports' weekly checklists: the task, an optional
 * due day, which weeks (this week by default) and who (everyone by default).
 * Under it, the tasks already added for the week, with who has done them.
 */
const AdminSupportTaskModal: React.FC<AdminSupportTaskModalProps> = ({ isOpen, onClose, weeks, selectedWeek }) => {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [moreWeeks, setMoreWeeks] = useState(false);
  const [pickedWeeks, setPickedWeeks] = useState<number[]>([]);
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

  const reloadTasks = async () => {
    if (!selectedWeek) { setTasks([]); return; }
    setTasksLoading(true);
    try { setTasks(await adminChecklistApi.listTasks(selectedWeek.id)); } catch { setTasks([]); } finally { setTasksLoading(false); }
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
  }, [isOpen, selectedWeek?.id]);

  const otherWeeks = useMemo(() => weeks.filter((w) => w.id !== selectedWeek?.id).sort((a, b) => a.weekNumber - b.weekNumber), [weeks, selectedWeek?.id]);
  const forOptions = useMemo(() => [
    { value: EVERYONE, label: 'Everyone' },
    ...tags.map((t) => ({ value: TAG_PREFIX + t.id, label: t.name })),
    { value: PEOPLE, label: 'Choose people…' },
  ], [tags]);
  const supportOptions = useMemo(() => supports.map((u) => ({ value: u.id, label: u.name })).sort((a, b) => a.label.localeCompare(b.label)), [supports]);

  const target = (): AdminChecklistTarget =>
    forWho === PEOPLE ? { kind: 'USERS', userIds: people }
      : forWho.startsWith(TAG_PREFIX) ? { kind: 'TAG', tagId: forWho.slice(TAG_PREFIX.length) }
        : { kind: 'ALL' };

  const canAdd = !!selectedWeek && label.trim().length >= 2 && (forWho !== PEOPLE || people.length > 0);

  const submit = async () => {
    if (!selectedWeek || !canAdd) return;
    setSaving(true);
    setError('');
    try {
      const weekIds = [selectedWeek.id, ...(moreWeeks ? pickedWeeks : [])];
      const res = await adminChecklistApi.addTask({ label: label.trim(), weekIds, dueDay: dueDay || null, target: target() });
      toast({
        tone: 'success',
        message: res.supports > 0
          ? `Added for ${res.supports} ${res.supports === 1 ? 'support' : 'supports'}${res.skipped > 0 ? ` (${res.skipped} already had it)` : ''}.`
          : 'Nobody new to add it to: they already have it.',
      });
      setLabel('');
      setDueDay('');
      setMoreWeeks(false);
      setPickedWeeks([]);
      await reloadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (task: AdminChecklistTask, allWeeks: boolean) => {
    if (!selectedWeek) return;
    try {
      await adminChecklistApi.deleteTask(task.taskGroupId, allWeeks ? null : selectedWeek.id);
      setConfirmRemove(null);
      await reloadTasks();
      toast({ tone: 'success', message: allWeeks ? 'Removed from every week.' : `Removed from Week ${selectedWeek.weekNumber}.` });
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
      subtitle={selectedWeek ? `Goes on their weekly checklist · Week ${selectedWeek.weekNumber}` : 'Pick a week first'}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Task</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={140} placeholder="e.g. Send the week's report to your hub lead" className={INPUT} />
        </label>

        <AppSelect
          label="Due day"
          value={dueDay}
          onChange={(value) => setDueDay(value)}
          options={[{ value: '', label: 'No due day' }, ...DUE_DAYS.map((d) => ({ value: d, label: d }))]}
          placeholder="No due day"
        />

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Weeks</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Weeks">
            <button type="button" role="radio" aria-checked={!moreWeeks} onClick={() => setMoreWeeks(false)}
              className={`min-h-[44px] rounded-xl text-[14px] font-semibold transition ${!moreWeeks ? 'bg-primary text-white' : 'bg-[#f6f7f9] text-gray-700'}`}>
              This week only
            </button>
            <button type="button" role="radio" aria-checked={moreWeeks} onClick={() => setMoreWeeks(true)}
              className={`min-h-[44px] rounded-xl text-[14px] font-semibold transition ${moreWeeks ? 'bg-primary text-white' : 'bg-[#f6f7f9] text-gray-700'}`}>
              More weeks…
            </button>
          </div>
          {moreWeeks && (
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
          <h3 className="text-[13px] font-semibold text-gray-900">Already added{selectedWeek ? ` · Week ${selectedWeek.weekNumber}` : ''}</h3>
          {tasksLoading ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nothing added for this week yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {tasks.map((task) => (
                <li key={task.taskGroupId} className="rounded-2xl bg-[#f6f7f9] px-3.5 py-3">
                  <button type="button" onClick={() => setOpenTask(openTask === task.taskGroupId ? null : task.taskGroupId)} aria-expanded={openTask === task.taskGroupId} className="flex w-full items-start gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{task.label}</span>
                      <span className="block text-xs text-gray-500">{task.done} of {task.total} done{task.dueDay ? ` · due ${task.dueDay}` : ''}</span>
                    </span>
                    <svg className={`mt-1 h-4 w-4 flex-none text-gray-400 transition-transform ${openTask === task.taskGroupId ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
                  </button>
                  {openTask === task.taskGroupId && (
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
                        {confirmRemove === task.taskGroupId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-600">Remove from:</span>
                            <button type="button" onClick={() => { void remove(task, false); }} className="rounded-full bg-red-100/80 px-3 py-1 text-[12px] font-semibold text-red-700">This week</button>
                            <button type="button" onClick={() => { void remove(task, true); }} className="rounded-full bg-red-100/80 px-3 py-1 text-[12px] font-semibold text-red-700">Every week</button>
                            <button type="button" onClick={() => setConfirmRemove(null)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-gray-600">Keep</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmRemove(task.taskGroupId)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-red-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]">Remove</button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

export default AdminSupportTaskModal;
