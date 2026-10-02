import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import AppSelect from '../AppSelect';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { groupsApi, surveyApi } from '../../services/api';
import type { Group, SurveyAudience, SurveyQuestion, SurveyQuestionKind, SurveyRecord } from '../../types';
import { ADDABLE_KINDS, KIND_LABEL, emptyQuestion, lagosEnd, lagosStart, toLagosDay } from './surveyUtils';

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';
const LABEL = 'mb-1 block text-sm font-medium text-gray-700';
const BOX = 'rounded-xl border border-gray-200 p-3';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition ${on ? 'bg-primary' : 'bg-gray-300'} ${disabled ? 'opacity-50' : ''}`}>
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
  </button>
);

const Chip: React.FC<{ on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ on, onClick, disabled, children }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'} ${disabled ? 'opacity-50' : ''}`}>
    {children}
  </button>
);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Edit this survey; omit to start a new one. */
  surveyId?: string | null;
  /** Start a new survey from a copy of this one. */
  copyOfId?: string | null;
  cohortId: string | null;
  cohortName: string | null;
  /** Answers already exist, so anonymity can no longer change. */
  hasAnswers?: boolean;
}

interface FormState {
  id?: string;
  cohortId: string | null;
  builtinKey: string | null;
  title: string;
  description: string;
  audience: SurveyAudience;
  scope: 'COHORT' | 'GENERAL';
  targetGroupId: string;
  anonymous: boolean;
  enabled: boolean;
  timingMode: 'DATES' | 'WEEKS_BEFORE_END';
  opensDay: string;
  closesDay: string;
  weeksBeforeEnd: string;
  closeDaysAfterEnd: string;
  notifyOnOpen: boolean;
  homeHeading: string;
  homeLine: string;
  homeButton: string;
}

const blank = (): FormState => ({
  cohortId: null, builtinKey: null, title: '', description: '', audience: 'PARTICIPANTS', scope: 'COHORT', targetGroupId: '', anonymous: false, enabled: true,
  timingMode: 'DATES', opensDay: toLagosDay(new Date().toISOString()), closesDay: '', weeksBeforeEnd: '1', closeDaysAfterEnd: '14',
  notifyOnOpen: false, homeHeading: '', homeLine: '', homeButton: '',
});

const fromRecord = (s: SurveyRecord): FormState => ({
  id: s.id, cohortId: s.cohortId, builtinKey: s.builtinKey, title: s.title, description: s.description ?? '', audience: s.audience, scope: s.scope,
  targetGroupId: s.targetGroupId ?? '', anonymous: s.anonymous, enabled: s.enabled, timingMode: s.timingMode,
  opensDay: toLagosDay(s.opensAt), closesDay: toLagosDay(s.closesAt),
  weeksBeforeEnd: String(s.weeksBeforeEnd ?? 1), closeDaysAfterEnd: String(s.closeDaysAfterEnd ?? 14),
  notifyOnOpen: s.notifyOnOpen, homeHeading: s.homeHeading ?? '', homeLine: s.homeLine ?? '', homeButton: s.homeButton ?? '',
});

const SurveyBuilderModal: React.FC<Props> = ({ isOpen, onClose, onSaved, surveyId, copyOfId, cohortId, cohortName, hasAnswers }) => {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(blank);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<'DRAFT' | 'PUBLISHED' | null>(null);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);

  const builtin = !!form.builtinKey;
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    const sourceId = surveyId || copyOfId;
    if (!sourceId) {
      setForm({ ...blank(), scope: 'COHORT', cohortId });
      setQuestions([emptyQuestion('RATING')]);
      return;
    }
    setLoading(true);
    surveyApi.adminGet(sourceId).then((detail) => {
      const next = fromRecord(detail.survey);
      if (copyOfId && !surveyId) {
        setForm({ ...next, id: undefined, cohortId, builtinKey: null, title: `Copy of ${next.title}`, enabled: true });
        setQuestions(detail.questions.map((q) => ({ ...q, id: undefined })));
      } else {
        setForm(next);
        setQuestions(detail.questions);
      }
    }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [isOpen, surveyId, copyOfId]);

  useEffect(() => {
    if (!isOpen || !cohortId) return;
    groupsApi.getAll({ cohortId }).then((res) => setGroups(res.groups)).catch(() => setGroups([]));
  }, [isOpen, cohortId]);

  const groupOptions = useMemo(
    () => [{ value: '', label: 'Everyone in the cohort' }, ...groups.map((g) => ({ value: g.id, label: g.name }))],
    [groups],
  );

  const setQuestion = (index: number, p: Partial<SurveyQuestion>) =>
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...p } : q)));
  const setConfig = (index: number, p: SurveyQuestion['config']) =>
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, config: { ...q.config, ...p } } : q)));
  const move = (index: number, dir: -1 | 1) =>
    setQuestions((list) => {
      const to = index + dir;
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });

  const save = async (status: 'DRAFT' | 'PUBLISHED') => {
    setError('');
    if (!form.title.trim()) { setError('Give the survey a name.'); return; }
    if (status === 'PUBLISHED' && questions.length === 0) { setError('Add at least one question before publishing.'); return; }
    if (questions.some((q) => !q.prompt.trim())) { setError('Every question needs some text.'); return; }
    if (form.scope === 'COHORT' && !form.cohortId && !cohortId) { setError('Pick a cohort first.'); return; }
    if (form.timingMode === 'DATES' && form.opensDay && form.closesDay && form.closesDay < form.opensDay) { setError('The closing date is before the opening date.'); return; }
    setSaving(status);
    try {
      const survey: Partial<SurveyRecord> = {
        id: form.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        audience: form.audience,
        scope: form.scope,
        cohortId: form.scope === 'COHORT' ? (form.cohortId || cohortId) : null,
        targetGroupId: form.audience === 'PARTICIPANTS' && form.scope === 'COHORT' ? form.targetGroupId || null : null,
        anonymous: form.anonymous,
        enabled: form.enabled,
        status: builtin ? 'PUBLISHED' : status,
        timingMode: form.timingMode,
        opensAt: form.timingMode === 'DATES' && form.opensDay ? lagosStart(form.opensDay) : null,
        closesAt: form.timingMode === 'DATES' && form.closesDay ? lagosEnd(form.closesDay) : null,
        weeksBeforeEnd: form.timingMode === 'WEEKS_BEFORE_END' ? Math.max(0, Number(form.weeksBeforeEnd) || 1) : null,
        closeDaysAfterEnd: form.timingMode === 'WEEKS_BEFORE_END' ? Math.max(0, Number(form.closeDaysAfterEnd) || 14) : null,
        notifyOnOpen: form.notifyOnOpen,
        homeHeading: form.homeHeading.trim() || null,
        homeLine: form.homeLine.trim() || null,
        homeButton: form.homeButton.trim() || null,
      };
      await surveyApi.adminSave(survey, questions.map((q, i) => ({ ...q, position: i + 1 })));
      toast({ message: status === 'DRAFT' && !builtin ? 'Draft saved.' : 'Survey saved.' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the survey.');
    } finally {
      setSaving(null);
    }
  };

  const title = builtin ? form.title : form.id ? 'Edit survey' : 'New survey';
  const subtitle = builtin
    ? 'Built-in survey · shown on the participant Home near the end'
    : form.scope === 'COHORT' ? (cohortName || undefined) : 'All cohorts';

  const timing = (
    <div className={`${BOX} space-y-3`}>
      <p className="text-sm font-semibold text-gray-900">{builtin ? 'When it appears' : 'When it is open'}</p>
      {(builtin || form.audience === 'PARTICIPANTS') && !hasAnswers && (
        <div className="flex flex-wrap gap-2">
          <Chip on={form.timingMode === 'WEEKS_BEFORE_END'} onClick={() => patch({ timingMode: 'WEEKS_BEFORE_END' })}>Weeks before the end</Chip>
          <Chip on={form.timingMode === 'DATES'} onClick={() => patch({ timingMode: 'DATES' })}>{builtin ? 'A fixed date' : 'Dates'}</Chip>
        </div>
      )}
      {form.timingMode === 'WEEKS_BEFORE_END' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={LABEL}>Weeks before the cohort ends</label><input type="number" min={0} max={30} value={form.weeksBeforeEnd} onChange={(e) => patch({ weeksBeforeEnd: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Keeps showing for (days after it ends)</label><input type="number" min={0} max={730} value={form.closeDaysAfterEnd} onChange={(e) => patch({ closeDaysAfterEnd: e.target.value })} className={INPUT} /></div>
          <p className="text-[12px] text-gray-500 sm:col-span-2">Each cohort follows its own end date.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={LABEL}>Opens</label><input type="date" value={form.opensDay} onChange={(e) => patch({ opensDay: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Closes (optional)</label><input type="date" value={form.closesDay} min={form.opensDay || undefined} onChange={(e) => patch({ closesDay: e.target.value })} className={INPUT} /></div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-700">Send a notification when it opens</span>
        <Switch on={form.notifyOnOpen} onChange={(v) => patch({ notifyOnOpen: v })} label="Notify when it opens" />
      </div>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      wide
      title={title}
      subtitle={subtitle}
      footer={(
        <>
          {!builtin && (
            <button type="button" disabled={!!saving} onClick={() => void save('DRAFT')} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              {saving === 'DRAFT' ? 'Saving…' : 'Save draft'}
            </button>
          )}
          <button type="button" disabled={!!saving || loading} onClick={() => void save('PUBLISHED')} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            {saving === 'PUBLISHED' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : builtin ? 'Save' : 'Publish survey'}
          </button>
        </>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          {builtin ? (
            <>
              <div className={BOX}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-700">Show this on participants' Home</span>
                  <Switch on={form.enabled} onChange={(v) => patch({ enabled: v })} label="Show on Home" />
                </div>
              </div>
              <div className={`${BOX} space-y-3`}>
                <p className="text-sm font-semibold text-gray-900">The card on Home</p>
                <div><label className={LABEL}>Heading</label><input value={form.homeHeading} onChange={(e) => patch({ homeHeading: e.target.value.slice(0, 60) })} className={INPUT} placeholder="Your cohort is wrapping up" /></div>
                <div><label className={LABEL}>Line under it (optional)</label><input value={form.homeLine} onChange={(e) => patch({ homeLine: e.target.value.slice(0, 120) })} className={INPUT} placeholder="Tell us what comes next for you." /></div>
                <div><label className={LABEL}>Button text</label><input value={form.homeButton} onChange={(e) => patch({ homeButton: e.target.value.slice(0, 20) })} className={INPUT} placeholder="Continue" /></div>
                <div className="flex items-center gap-2 rounded-2xl border border-[#ffeadb] border-l-4 border-l-primary bg-white px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-gray-900">{form.homeHeading || 'Your cohort is wrapping up'}</span>
                    {(form.homeLine || '') && <span className="block text-[12px] text-gray-500">{form.homeLine}</span>}
                  </span>
                  <span className="rounded-xl bg-[#3f4757] px-3.5 py-2 text-[12px] font-semibold text-white">{form.homeButton || 'Continue'}</span>
                </div>
              </div>
              {timing}
            </>
          ) : (
            <>
              <div><label className={LABEL}>Survey name</label><input value={form.title} onChange={(e) => patch({ title: e.target.value.slice(0, 80) })} className={INPUT} placeholder="e.g. Support experience check-in" /></div>
              <div><label className={LABEL}>Short intro (optional)</label><input value={form.description} onChange={(e) => patch({ description: e.target.value.slice(0, 200) })} className={INPUT} placeholder="Shown at the top of the survey" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Who answers it</label>
                  <div className="flex flex-wrap gap-2">
                    {(['PARTICIPANTS', 'SUPPORTS', 'EVERYONE'] as SurveyAudience[]).map((a) => (
                      <Chip key={a} on={form.audience === a} onClick={() => patch({ audience: a, targetGroupId: '', timingMode: a === 'PARTICIPANTS' ? form.timingMode : 'DATES' })}>
                        {a === 'PARTICIPANTS' ? 'Participants' : a === 'SUPPORTS' ? 'Supports' : 'Everyone'}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Belongs to</label>
                  <div className="flex flex-wrap gap-2">
                    <Chip on={form.scope === 'COHORT'} disabled={!!form.id} onClick={() => patch({ scope: 'COHORT' })}>{cohortName ? `${cohortName} only` : 'This cohort only'}</Chip>
                    <Chip on={form.scope === 'GENERAL'} disabled={!!form.id} onClick={() => patch({ scope: 'GENERAL', targetGroupId: '' })}>All cohorts</Chip>
                  </div>
                </div>
              </div>
              {form.audience === 'PARTICIPANTS' && form.scope === 'COHORT' && (
                <div><label className={LABEL}>Narrow to one group (optional)</label><AppSelect value={form.targetGroupId} onChange={(v) => patch({ targetGroupId: v })} options={groupOptions} placeholder="Everyone in the cohort" compact /></div>
              )}
              <div className={BOX}>
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium text-gray-700">Anonymous</span>
                    <span className="block text-[11px] text-gray-500">{hasAnswers ? 'Fixed once people have answered.' : 'You see who has answered, never which answers are theirs.'}</span>
                  </span>
                  <Switch on={form.anonymous} disabled={!!hasAnswers} onChange={(v) => patch({ anonymous: v })} label="Anonymous" />
                </div>
              </div>
              {timing}
              {form.id && (
                <div className={BOX}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-700">Turned on</span>
                    <Switch on={form.enabled} onChange={(v) => patch({ enabled: v })} label="Turned on" />
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-sm font-semibold text-gray-900">Questions</p>
          {questions.map((q, i) => {
            const locked = !!q.config.feeds;
            return (
              <div key={q.id ?? `new-${i}`} className="rounded-2xl border border-gray-200 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#fff1e6] text-[12px] font-bold text-[#9a4a12]">{i + 1}</span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">{KIND_LABEL[q.kind]}</span>
                  <span className="ml-auto flex items-center gap-2 text-[12px] text-gray-500">
                    Required <Switch on={q.required} onChange={(v) => setQuestion(i, { required: v })} label="Required" />
                  </span>
                </div>
                <input value={q.prompt} onChange={(e) => setQuestion(i, { prompt: e.target.value.slice(0, 200) })} placeholder="Type the question" className={`${INPUT} mt-2.5 font-medium`} />
                {q.kind === 'RATING' && (
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <input value={q.config.lowLabel ?? ''} onChange={(e) => setConfig(i, { lowLabel: e.target.value.slice(0, 30) })} placeholder="Low end, e.g. Poor" className={INPUT} />
                    <div className="w-28"><AppSelect compact value={String(q.config.scale ?? 5)} onChange={(v) => setConfig(i, { scale: Number(v) })} options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `1 to ${n}` }))} placeholder="Scale" /></div>
                    <input value={q.config.highLabel ?? ''} onChange={(e) => setConfig(i, { highLabel: e.target.value.slice(0, 30) })} placeholder="High end, e.g. Excellent" className={INPUT} />
                  </div>
                )}
                {q.kind === 'NUMBER' && (
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    <input type="number" value={q.config.min ?? ''} onChange={(e) => setConfig(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Lowest allowed (optional)" className={INPUT} />
                    <input type="number" value={q.config.max ?? ''} onChange={(e) => setConfig(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Highest allowed (optional)" className={INPUT} />
                  </div>
                )}
                {q.kind === 'FILE' && <p className="mt-1.5 text-[12px] text-gray-500">Images and files, up to 5 MB each.</p>}
                {q.kind === 'DEPARTMENT' && <p className="mt-1.5 text-[12px] text-gray-500">Uses your church departments list. The answer goes to the follow-up list.</p>}
                {q.kind === 'YESNO' && q.config.feeds === 'referral' && <p className="mt-1.5 text-[12px] text-gray-500">A Yes is logged for their support to confirm as a referral.</p>}
                <div className="mt-2.5 flex gap-1.5 text-[12px] font-semibold text-gray-500">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg bg-gray-100 px-2.5 py-1 disabled:opacity-40">Move up</button>
                  <button type="button" disabled={i === questions.length - 1} onClick={() => move(i, 1)} className="rounded-lg bg-gray-100 px-2.5 py-1 disabled:opacity-40">Move down</button>
                  <button type="button" disabled={locked} onClick={() => setQuestions((list) => list.filter((_, idx) => idx !== i))} className="ml-auto rounded-lg bg-red-50 px-2.5 py-1 text-red-600 disabled:opacity-40">Remove</button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 text-[12.5px] font-semibold">
            {ADDABLE_KINDS.map((k: SurveyQuestionKind) => (
              <button key={k} type="button" onClick={() => setQuestions((list) => [...list, emptyQuestion(k)])} className="rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-gray-600 hover:border-primary hover:text-primary">
                + {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default SurveyBuilderModal;
