import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AppSelect from '../components/AppSelect';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { aiApi, feedbackApi, groupsApi, manualQuestionsApi } from '../services/api';
import type { ClassFeedbackWeekResult, FeedbackAnswers, FeedbackRating, FeedbackResults, Group, ManualQuestion } from '../types';
import Spinner from '../components/Spinner';
import SegmentedTabs from '../components/SegmentedTabs';

// Anonymous feedback participants send from their app, for the active cohort.
// The answers show once at least five have come in, so nobody can be picked out.
// Surveys are sent separately (e.g. a Google Form link in an announcement).

const CARD = 'surface-card p-5 sm:p-6';
const RATING_LABEL: Record<FeedbackRating, string> = { GREAT: 'Great', OKAY: 'Okay', NOT_GREAT: 'Not great' };
const RATING_BAR: Record<FeedbackRating, string> = { GREAT: 'bg-emerald-500', OKAY: 'bg-amber-500', NOT_GREAT: 'bg-red-500' };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

const RatingBreakdown: React.FC<{ answers: FeedbackAnswers[] }> = ({ answers }) => (
  <div>
    <p className="text-sm font-semibold text-gray-900">How the programme is going</p>
    <div className="mt-2 space-y-1.5">
      {(['GREAT', 'OKAY', 'NOT_GREAT'] as FeedbackRating[]).map((rating) => {
        const count = answers.filter((a) => a.rating === rating).length;
        const pct = answers.length ? Math.round((count / answers.length) * 100) : 0;
        return (
          <div key={rating} className="flex items-center gap-3 text-sm">
            <span className="w-20 flex-none text-gray-600">{RATING_LABEL[rating]}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span className={`block h-full rounded-full ${RATING_BAR[rating]}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-16 flex-none text-right text-gray-500">{count} · {pct}%</span>
          </div>
        );
      })}
    </div>
  </div>
);

// Post-class feedback for one week: each support's note (or "None"), who
// hasn't answered yet, and the participant ratings/comments once at least
// five have come in.
const ClassFeedbackWeekCard: React.FC<{ week: ClassFeedbackWeekResult }> = ({ week }) => {
  const answers = week.participants.answers ?? [];
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold text-gray-900">Supports ({week.supports.length})</p>
        {week.supports.length === 0 ? (
          <p className="mt-1 text-sm text-gray-400">No answers yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {week.supports.map((s) => (
              <li key={s.supportId} className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm">
                <span className="font-semibold text-gray-900">{s.supportName}</span>{' '}
                <span className="text-gray-700">{s.isNone ? 'None' : s.note || 'None'}</span>
              </li>
            ))}
          </ul>
        )}
        {week.supportsMissing.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">Hasn't answered ({week.supportsMissing.length}): {week.supportsMissing.join(', ')}</p>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">
          Participants ({week.participants.count}){week.participants.average != null ? ` · avg ${week.participants.average}/5` : ''}
        </p>
        {!week.participants.visible ? (
          <p className="mt-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Answers show once at least five participants have answered, to protect their anonymity.
          </p>
        ) : answers.length === 0 ? (
          <p className="mt-1 text-sm text-gray-400">No comments.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {answers.map((a, index) => (
              <li key={index} className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{a.rating}/5</span>
                {a.name && <span className="ml-2 text-xs text-gray-500">— {a.name}</span>}
                {a.comment && <p className="mt-1">{a.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// A question as list_manual_questions() returns it to an admin (every group),
// with the same "To be answered in class" / "Reply" actions as the support
// Recap page's version, plus the group name since an admin sees every group.
const ManualQuestionRow: React.FC<{ question: ManualQuestion; onChanged: () => void }> = ({ question, onChanged }) => {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');

  const markInClass = async () => {
    setBusy(true);
    setRowError('');
    try {
      await manualQuestionsApi.markInClass(question.id);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not update this question.');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setRowError('');
    try {
      await manualQuestionsApi.reply(question.id, reply.trim());
      setReplying(false);
      setReply('');
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not send your reply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-sm font-semibold text-gray-900">{question.participantName}{question.groupName ? ` · ${question.groupName}` : ''}</p>
      <p className="mt-1 text-sm text-gray-700">{question.body}</p>
      {question.status === 'REPLIED' && question.reply ? (
        <p className="mt-2 text-sm text-gray-600"><span className="font-semibold text-gray-800">Reply: </span>{question.reply}</p>
      ) : replying ? (
        <div className="mt-2">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a short reply" className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void sendReply()} disabled={busy || !reply.trim()} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3 w-3" />Sending…</span>) : 'Send reply'}
            </button>
            <button type="button" onClick={() => { setReplying(false); setReply(''); }} className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-semibold text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void markInClass()} disabled={busy} className="rounded-full bg-amber-100/80 px-3 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-50">
            {question.status === 'IN_CLASS' ? 'To be answered in class ✓' : 'To be answered in class'}
          </button>
          <button type="button" onClick={() => setReplying(true)} disabled={busy} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50">Reply</button>
        </div>
      )}
      {rowError && <p className="mt-1.5 text-xs text-red-700">{rowError}</p>}
    </li>
  );
};

type FeedbackTab = 'general' | 'class' | 'manual';

const FEEDBACK_TABS: Array<{ key: FeedbackTab; label: string; shortLabel?: string }> = [
  { key: 'general', label: 'General' },
  { key: 'class', label: 'After class' },
  { key: 'manual', label: 'Manual questions', shortLabel: 'Questions' },
];

const AdminFeedbackPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, weeks } = useAppData();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<FeedbackTab>(() => (searchParams.get('tab') === 'manual' ? 'manual' : 'general'));
  const [results, setResults] = useState<FeedbackResults | null>(null);
  const [error, setError] = useState('');
  const [themes, setThemes] = useState<{ themes: string; createdAt: string } | null>(null);
  const [themesBusy, setThemesBusy] = useState(false);
  const [classFeedback, setClassFeedback] = useState<ClassFeedbackWeekResult[] | null>(null);
  const [classFeedbackError, setClassFeedbackError] = useState('');
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [questions, setQuestions] = useState<ManualQuestion[] | null>(null);
  const [questionsError, setQuestionsError] = useState('');
  const [questionWeekId, setQuestionWeekId] = useState('');
  const [questionGroupId, setQuestionGroupId] = useState('');

  useEffect(() => {
    if (!activeCohort) return;
    setResults(null);
    setThemes(null);
    setError('');
    setClassFeedback(null);
    setClassFeedbackError('');
    feedbackApi.getResults(activeCohort.id)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load feedback.'));
    aiApi.getFeedbackThemes(activeCohort.id).then(setThemes).catch(() => { /* none saved */ });
    feedbackApi.getClassFeedbackResults(activeCohort.id)
      .then((rows) => { setClassFeedback(rows); setSelectedWeekId(rows[0] ? String(rows[0].weekId) : ''); })
      .catch((err) => setClassFeedbackError(err instanceof Error ? err.message : 'Could not load after-class feedback.'));
    groupsApi.getAll({ cohortId: activeCohort.id }).then((res) => setGroups(res.groups)).catch(() => setGroups([]));
  }, [activeCohort?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadQuestions = () => {
    if (!activeCohort) return;
    manualQuestionsApi.listForCohort(activeCohort.id, {
      weekId: questionWeekId ? Number(questionWeekId) : undefined,
      groupId: questionGroupId || undefined,
    })
      .then((res) => setQuestions(res.questions))
      .catch((err) => setQuestionsError(err instanceof Error ? err.message : 'Could not load manual questions.'));
  };

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCohort?.id, questionWeekId, questionGroupId]);

  useEffect(() => {
    if (searchParams.get('tab') === 'manual') setTab('manual');
  }, [searchParams]);

  const weekOptions = useMemo(
    () => [...weeks].sort((a, b) => b.weekNumber - a.weekNumber).map((w) => ({ value: String(w.id), label: w.title ? `Week ${w.weekNumber} — ${w.title}` : `Week ${w.weekNumber}` })),
    [weeks],
  );
  const questionWeekOptions = useMemo(() => [{ value: '', label: 'All weeks' }, ...weekOptions], [weekOptions]);
  const groupOptions = useMemo(
    () => [{ value: '', label: 'All groups' }, ...groups.map((g) => ({ value: g.id, label: g.name }))],
    [groups],
  );
  const selectedWeek = classFeedback?.find((w) => String(w.weekId) === selectedWeekId) ?? null;

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const summariseThemes = async () => {
    if (!activeCohort) return;
    setThemesBusy(true);
    try {
      setThemes(await aiApi.summariseFeedback(activeCohort.id));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'AI help is not available right now.', tone: 'error' });
    } finally {
      setThemesBusy(false);
    }
  };

  const answers = results?.answers ?? [];
  const texts = (field: 'workingWell' | 'needsAttention') => answers.map((a) => a[field]?.trim()).filter(Boolean) as string[];

  return (
    <div>
      <PageHeader title="Feedback" subtitle="What participants send from their app." />

      <div className="mb-4">
        <SegmentedTabs tabs={FEEDBACK_TABS} active={tab} onChange={(k) => setTab(k as FeedbackTab)} />
      </div>

      {tab === 'general' && (error ? (
        <p className={`${CARD} text-sm text-red-700`}>{error}</p>
      ) : !results ? (
        <p className="flex items-center justify-center gap-1.5 py-12 text-center text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading feedback…</p>
      ) : (
        <section className={CARD}>
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{results.count}</span> {results.count === 1 ? 'response' : 'responses'} from {activeCohort?.name ?? 'this cohort'}
          </p>
          <p className="mt-1 text-xs text-gray-500">For surveys, send a Google Form link in a participant announcement.</p>

          {!results.visible ? (
            <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Answers show once at least five participants have sent feedback, to protect their anonymity.
            </p>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-gray-900">Themes</p>
                  {themes && <span className="text-xs text-gray-500">Written by AI · {formatDate(themes.createdAt)}</span>}
                  <button type="button" onClick={() => { void summariseThemes(); }} disabled={themesBusy} className="ml-auto rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {themesBusy ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Summarising…</span>) : themes ? 'Summarise again' : 'Summarise themes with AI'}
                  </button>
                </div>
                {themes ? (
                  <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{themes.themes.replace(/\*\*/g, '')}</div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">Groups the written comments into themes. Only the anonymous comments are sent, to a free AI service (OpenRouter).</p>
                )}
              </div>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <RatingBreakdown answers={answers} />
                <div className="space-y-5">
                  {([['workingWell', 'What’s working well'], ['needsAttention', 'What needs attention']] as Array<['workingWell' | 'needsAttention', string]>).map(([field, title]) => (
                    <div key={field}>
                      <p className="text-sm font-semibold text-gray-900">{title} ({texts(field).length})</p>
                      {texts(field).length === 0 ? (
                        <p className="mt-1 text-sm text-gray-400">No comments.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {texts(field).map((text, index) => (
                            <li key={index} className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-700">{text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      ))}

      {tab === 'class' && (classFeedbackError ? (
        <p className={`${CARD} text-sm text-red-700`}>{classFeedbackError}</p>
      ) : classFeedback === null ? (
        <p className="flex items-center justify-center gap-1.5 py-8 text-center text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading after-class feedback…</p>
      ) : classFeedback.length === 0 ? (
        <p className={`${CARD} text-sm text-gray-500`}>No weeks yet for this cohort.</p>
      ) : (
        <section className={CARD}>
          <div className="max-w-xs">
            <AppSelect value={selectedWeekId} onChange={setSelectedWeekId} options={weekOptions} placeholder="Choose a week" compact />
          </div>
          {selectedWeek ? <ClassFeedbackWeekCard week={selectedWeek} /> : (
            <p className="mt-4 text-sm text-gray-500">Choose a week to see answers.</p>
          )}
        </section>
      ))}

      {tab === 'manual' && (
        <section className={CARD}>
          <div className="flex flex-wrap gap-3">
            <div className="w-full max-w-xs sm:w-auto"><AppSelect value={questionWeekId} onChange={setQuestionWeekId} options={questionWeekOptions} placeholder="All weeks" compact /></div>
            <div className="w-full max-w-xs sm:w-auto"><AppSelect value={questionGroupId} onChange={setQuestionGroupId} options={groupOptions} placeholder="All groups" compact /></div>
          </div>
          {questionsError ? (
            <p className="mt-4 text-sm text-red-700">{questionsError}</p>
          ) : questions === null ? (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading questions…</p>
          ) : questions.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No questions yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {questions.map((q) => <ManualQuestionRow key={q.id} question={q} onChanged={loadQuestions} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminFeedbackPage;
