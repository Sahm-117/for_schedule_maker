import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { aiApi, cohortsApi, feedbackApi } from '../services/api';
import type { FeedbackAnswers, FeedbackRating, FeedbackResults } from '../types';

// Anonymous participant feedback for the active cohort: the mid-programme check-in
// and the end-of-cohort survey. Response rates show while a round is open; the
// answers only once it has closed with at least five responses.

const CARD = 'surface-card p-5 sm:p-6';
const RATING_LABEL: Record<FeedbackRating, string> = { GREAT: 'Great', OKAY: 'Okay', NOT_GREAT: 'Not great' };
const RATING_BAR: Record<FeedbackRating, string> = { GREAT: 'bg-emerald-500', OKAY: 'bg-amber-500', NOT_GREAT: 'bg-red-500' };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

const RatingBreakdown: React.FC<{ title: string; answers: FeedbackAnswers[]; field: keyof FeedbackAnswers }> = ({ title, answers, field }) => {
  const values = answers.map((a) => a[field]).filter(Boolean) as FeedbackRating[];
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <div className="mt-2 space-y-1.5">
        {(['GREAT', 'OKAY', 'NOT_GREAT'] as FeedbackRating[]).map((rating) => {
          const count = values.filter((v) => v === rating).length;
          const pct = Math.round((count / values.length) * 100);
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
};

const AdminFeedbackPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, reloadCohorts } = useAppData();
  const toast = useToast();
  const [results, setResults] = useState<FeedbackResults | null>(null);
  const [error, setError] = useState('');
  const [midWeek, setMidWeek] = useState('5');
  const [savingWeek, setSavingWeek] = useState(false);
  const [themes, setThemes] = useState<Partial<Record<'MID' | 'END', { themes: string; createdAt: string }>>>({});
  const [themesBusy, setThemesBusy] = useState<'MID' | 'END' | null>(null);

  useEffect(() => {
    if (!activeCohort) return;
    setMidWeek(String(activeCohort.midFeedbackWeek ?? 5));
    setResults(null);
    setError('');
    feedbackApi.getResults(activeCohort.id)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load feedback.'));
    setThemes({});
    aiApi.getFeedbackThemes(activeCohort.id)
      .then((rows) => setThemes(Object.fromEntries(rows.map((row) => [row.round, row]))))
      .catch(() => { /* none saved */ });
  }, [activeCohort?.id, activeCohort?.midFeedbackWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const saveMidWeek = async () => {
    if (!activeCohort) return;
    const week = Number(midWeek);
    if (!Number.isInteger(week) || week < 1) { toast({ message: 'Enter a week number.', tone: 'error' }); return; }
    setSavingWeek(true);
    try {
      await cohortsApi.update(activeCohort.id, { midFeedbackWeek: week });
      await reloadCohorts();
      toast({ message: `Mid-programme feedback opens in week ${week}` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save.', tone: 'error' });
    } finally {
      setSavingWeek(false);
    }
  };

  const summariseThemes = async (round: 'MID' | 'END') => {
    if (!activeCohort) return;
    setThemesBusy(round);
    try {
      const result = await aiApi.summariseFeedback(activeCohort.id, round);
      setThemes((prev) => ({ ...prev, [round]: result }));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'AI help is not available right now.', tone: 'error' });
    } finally {
      setThemesBusy(null);
    }
  };

  const now = Date.now();

  return (
    <div>
      <PageHeader title="Feedback" subtitle="Anonymous feedback from participants. Answers show once a round closes with at least five responses." />

      <section className={`${CARD} mb-6`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mid-programme feedback opens in week</span>
            <input type="number" min={1} value={midWeek} onChange={(e) => setMidWeek(e.target.value)} className="w-28 rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </label>
          <button type="button" onClick={() => { void saveMidWeek(); }} disabled={savingWeek || String(activeCohort?.midFeedbackWeek ?? 5) === midWeek} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {savingWeek ? 'Saving…' : 'Save'}
          </button>
          <p className="basis-full text-xs text-gray-500">It stays open for two weeks. The end-of-FOF survey opens in the last week and closes a week after the cohort ends. Tell participants with a “stay on Home” announcement linked to Feedback.</p>
        </div>
      </section>

      {error ? (
        <p className={`${CARD} text-sm text-red-700`}>{error}</p>
      ) : !results ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading feedback…</p>
      ) : results.rounds.length === 0 ? (
        <p className={`${CARD} text-sm text-gray-500`}>This cohort needs a start date and weeks before feedback can open.</p>
      ) : (
        <div className="space-y-6">
          {results.rounds.map((round) => {
            const state = now < new Date(round.opensAt).getTime() ? 'Upcoming' : now < new Date(round.closesAt).getTime() ? 'Open' : 'Closed';
            const stateCls = state === 'Open' ? 'bg-sky-100/80 text-sky-700' : state === 'Upcoming' ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-100/80 text-emerald-700';
            const answers = round.answers ?? [];
            const texts = (field: 'workingWell' | 'needsAttention') => answers.map((a) => a[field]?.trim()).filter(Boolean) as string[];
            return (
              <section key={round.round} className={CARD}>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">{round.round === 'MID' ? 'Mid-programme check-in' : 'End of FOF survey'}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateCls}`}>{state}</span>
                  <span className="text-sm text-gray-500">{formatDate(round.opensAt)} – {formatDate(round.closesAt)}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-semibold">{round.responses}</span> of {results.eligible} participants responded
                  <span className="text-gray-500"> · {results.withApp} have the app</span>
                </p>

                {!round.visible ? (
                  <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    {state === 'Closed' ? 'Fewer than five responses, so the answers stay hidden to protect anonymity.' : 'Answers show once this round closes, if at least five people responded.'}
                  </p>
                ) : (
                  <>
                  <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-semibold text-gray-900">Themes</p>
                      {themes[round.round] && <span className="text-xs text-gray-500">Written by AI · {formatDate(themes[round.round]!.createdAt)}</span>}
                      <button type="button" onClick={() => { void summariseThemes(round.round); }} disabled={themesBusy !== null} className="ml-auto rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        {themesBusy === round.round ? 'Summarising…' : themes[round.round] ? 'Summarise again' : 'Summarise themes with AI'}
                      </button>
                    </div>
                    {themes[round.round] ? (
                      <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{themes[round.round]!.themes.replace(/\*\*/g, '')}</div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Groups the written comments into themes. Only the anonymous comments are sent, to a free AI service (OpenRouter).</p>
                    )}
                  </div>
                  <div className="mt-5 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-5">
                      <RatingBreakdown title="How the programme is going" answers={answers} field="rating" />
                      <RatingBreakdown title="Sunday classes" answers={answers} field="classesRating" />
                      <RatingBreakdown title="Group meetings" answers={answers} field="meetingsRating" />
                      <RatingBreakdown title="Supports" answers={answers} field="supportRating" />
                    </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminFeedbackPage;
