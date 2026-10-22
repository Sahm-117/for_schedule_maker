import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppData } from '../../context/AppDataContext';
import { groupsApi, manualQuestionsApi, participantsApi } from '../../services/api';
import type { ManualQuestion, Participant, Week } from '../../types';
import { classDateIso, nextClassWeek } from '../../utils/participantApp';
import { sortByText } from '../../utils/sort';
import { isTeenAgeRange } from '../../utils/groupingRules';
import AppSelect from '../AppSelect';
import Spinner from '../Spinner';

// A Teen Support's questions for the joint Q&A: they type a question for one of their own teens (no
// phone, or no guardian there), any time, for the class of their choice (the next class by default).
// Teen questions are tagged and taken first at the Q&A; names are hidden there unless unticked.

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const PencilIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

interface SheetProps {
  teens: Participant[];
  weekOptions: Array<{ value: string; label: string }>;
  defaultWeekId: number;
  editing: ManualQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}

const QuestionSheet: React.FC<SheetProps> = ({ teens, weekOptions, defaultWeekId, editing, onClose, onSaved }) => {
  const [teenId, setTeenId] = useState(editing?.participantId ?? (teens.length === 1 ? teens[0].id : ''));
  const [weekId, setWeekId] = useState(String(editing?.weekId ?? defaultWeekId));
  const [body, setBody] = useState(editing?.body ?? '');
  const [hideName, setHideName] = useState(editing ? editing.hideName !== false : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); opener?.focus(); };
  }, []);

  const teen = teens.find((t) => t.id === teenId) ?? null;
  const save = async (another: boolean) => {
    if (!teenId) { setError('Pick whose question it is.'); return; }
    if (!body.trim()) { setError('Write the question first.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) await manualQuestionsApi.updateForTeen(editing.id, body.trim(), hideName, Number(weekId));
      else await manualQuestionsApi.addForTeen(teenId, Number(weekId), body.trim(), hideName);
      onSaved();
      if (another && !editing) {
        setSent(`${teen ? firstName(teen.fullName) : 'Their'}'s question sent.`);
        setBody('');
        setTeenId(teens.length === 1 ? teens[0].id : '');
        setHideName(true);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the question.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="teenq-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-white px-5 pb-5 pt-3 shadow-xl sm:rounded-[26px]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <h2 id="teenq-title" className="text-[19px] font-extrabold tracking-[-0.02em] text-gray-900">{editing ? 'Edit question' : 'Add a question'}</h2>
        {sent && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800" role="status">{sent}</p>}

        <p className="mt-4 text-[13px] font-semibold text-gray-900">Whose question is it?</p>
        <div role="radiogroup" aria-label="Whose question is it?" className="mt-2 flex flex-col gap-2">
          {teens.map((t) => {
            const on = t.id === teenId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!!editing || saving}
                onClick={() => { setTeenId(t.id); setError(''); }}
                className={`flex min-h-[48px] items-center gap-3 rounded-2xl px-4 text-left transition disabled:cursor-default ${on ? 'bg-[#fff1e6] ring-[1.5px] ring-inset ring-primary' : 'bg-[#f5f5f7]'} ${editing && !on ? 'hidden' : ''}`}
              >
                <span className={`h-5 w-5 flex-none rounded-full ${on ? 'border-[6px] border-primary' : 'border-2 border-gray-300'}`} aria-hidden="true" />
                <span className="text-[15px] font-semibold text-gray-900">{t.fullName}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <AppSelect label="For the Q&A at" value={weekId} onChange={setWeekId} options={weekOptions} placeholder="Pick a class" disabled={saving} />
        </div>

        <label htmlFor="teenq-body" className="mt-4 block text-[13px] font-semibold text-gray-900">
          {teen ? `In ${firstName(teen.fullName)}'s own words` : 'In their own words'}
        </label>
        <textarea
          id="teenq-body"
          ref={bodyRef}
          value={body}
          onChange={(e) => { setBody(e.target.value); setError(''); }}
          rows={4}
          maxLength={1000}
          placeholder="If God already knows what I need, why do I still have to pray?"
          className="mt-1.5 w-full resize-y rounded-2xl border border-gray-200 px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        <label className="mt-3 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-2xl bg-[#f5f5f7] px-4 py-2.5">
          <input type="checkbox" checked={hideName} onChange={(e) => setHideName(e.target.checked)} disabled={saving} className="h-5 w-5 flex-none accent-[rgb(var(--color-primary-rgb))]" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-gray-900">{teen ? `Hide ${firstName(teen.fullName)}'s name` : 'Hide their name'}</span>
            <span className="block text-[12.5px] text-gray-500">The Q&amp;A list shows &quot;A teen asked&quot;</span>
          </span>
        </label>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={() => void save(false)} disabled={saving} className="min-h-[48px] rounded-xl bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : editing ? 'Save changes' : 'Send question'}
          </button>
          {!editing && teens.length > 1 && (
            <button type="button" onClick={() => void save(true)} disabled={saving} className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 disabled:opacity-60">Send and add another</button>
          )}
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] text-[15px] font-semibold text-gray-500">{sent ? 'Done' : 'Cancel'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface TeenQuestionsCardProps {
  userId: string;
  /** Called after a question is added or changed, so the page can refresh its own lists. */
  onChanged?: () => void;
}

const TeenQuestionsCard: React.FC<TeenQuestionsCardProps> = ({ userId, onChanged }) => {
  const { activeCohort, weeks } = useAppData();
  const [teens, setTeens] = useState<Participant[]>([]);
  const [questions, setQuestions] = useState<ManualQuestion[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sheet, setSheet] = useState<{ editing: ManualQuestion | null } | null>(null);

  const cohortWeeks = useMemo<Week[]>(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort?.id],
  );
  const defaultWeek = useMemo(
    () => nextClassWeek(activeCohort?.startDate, cohortWeeks, new Date()) ?? cohortWeeks[cohortWeeks.length - 1] ?? null,
    [activeCohort?.startDate, cohortWeeks],
  );
  const [weekId, setWeekId] = useState<number | null>(null);
  useEffect(() => { setWeekId((current) => (current && cohortWeeks.some((w) => w.id === current) ? current : defaultWeek?.id ?? null)); }, [defaultWeek, cohortWeeks]);
  const week = cohortWeeks.find((w) => w.id === weekId) ?? null;
  const weekIndex = week ? cohortWeeks.findIndex((w) => w.id === week.id) : -1;

  const weekLabel = useCallback((w: Week) => {
    const date = activeCohort?.startDate ? ` · ${dayLabel(classDateIso(activeCohort.startDate, w))}` : '';
    return `Week ${w.weekNumber} class${date}`;
  }, [activeCohort?.startDate]);
  const weekOptions = useMemo(() => cohortWeeks.map((w) => ({ value: String(w.id), label: weekLabel(w) })), [cohortWeeks, weekLabel]);

  const loadQuestions = useCallback(async (gid: string, isCancelled: () => boolean = () => false) => {
    if (!activeCohort) return;
    const res = await manualQuestionsApi.listForCohort(activeCohort.id, { groupId: gid });
    if (!isCancelled()) setQuestions(res.questions);
  }, [activeCohort]);

  useEffect(() => {
    if (!activeCohort) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      groupsApi.getTeenGroupForSupport(userId, activeCohort.id),
      participantsApi.getAll({ cohortId: activeCohort.id }),
    ])
      .then(async ([groupRes, peopleRes]) => {
        if (cancelled) return;
        const gid = groupRes.group?.id ?? null;
        setGroupId(gid);
        setTeens(sortByText(
          gid ? peopleRes.participants.filter((p) => p.status === 'ACTIVE' && p.groupId === gid && isTeenAgeRange(p.ageRange)) : [],
          (p) => p.fullName,
        ));
        if (gid) await loadQuestions(gid, () => cancelled);
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your teens.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeCohort, userId, loadQuestions]);

  const refresh = () => {
    if (groupId) void loadQuestions(groupId).catch(() => { /* the list refreshes on the next load */ });
    onChanged?.();
  };

  const weekQuestions = questions.filter((q) => q.weekId === weekId);

  // Nothing to show a support without teens.
  if (!loading && !loadError && teens.length === 0) return null;

  return (
    <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]" data-testid="teen-questions">
      <div className="flex items-center gap-2">
        <p className="text-base font-bold text-gray-900">Questions for the joint Q&amp;A</p>
        {week && cohortWeeks.length > 1 && (
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-600">
            <button type="button" aria-label="Earlier class" disabled={weekIndex <= 0} onClick={() => setWeekId(cohortWeeks[weekIndex - 1].id)} className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 disabled:opacity-40">‹</button>
            Week {week.weekNumber}
            <button type="button" aria-label="Later class" disabled={weekIndex >= cohortWeeks.length - 1} onClick={() => setWeekId(cohortWeeks[weekIndex + 1].id)} className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 disabled:opacity-40">›</button>
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : loadError ? (
        <p className="mt-3 text-sm text-red-600">{loadError}</p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-gray-500">
            {week ? `${weekLabel(week)}. ` : ''}Help your teens put their questions; teen questions are asked first. You can add one any time.
          </p>
          {weekQuestions.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {weekQuestions.map((q) => {
                const mine = q.askedById === userId && q.status === 'NEW';
                return (
                  <li key={q.id} className="rounded-2xl bg-[#f5f5f7] px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900">{q.participantName}</p>
                      <span className="flex-none text-[11px] text-gray-500">{q.hideName ? 'name hidden' : 'name shown'}</span>
                      {mine && (
                        <button type="button" aria-label={`Edit ${firstName(q.participantName)}'s question`} onClick={() => setSheet({ editing: q })} className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white text-gray-700">
                          <PencilIcon />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-700">{q.body}</p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      {q.status === 'REPLIED' ? 'Replied' : q.status === 'IN_CLASS' ? 'To be answered in class'
                        : q.askedById === userId ? 'Sent by you'
                        : q.askedById ? `Sent by ${q.askedByName ? firstName(q.askedByName) : 'staff'}`
                        : `Asked by ${firstName(q.participantName)}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={() => setSheet({ editing: null })} disabled={!week} className="mt-3 min-h-[46px] w-full rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">
            Add a question
          </button>
        </>
      )}

      {sheet && week && (
        <QuestionSheet
          teens={teens}
          weekOptions={weekOptions}
          defaultWeekId={week.id}
          editing={sheet.editing}
          onClose={() => setSheet(null)}
          onSaved={refresh}
        />
      )}
    </section>
  );
};

export default TeenQuestionsCard;
