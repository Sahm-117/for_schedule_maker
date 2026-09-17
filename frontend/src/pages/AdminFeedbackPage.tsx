import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { aiApi, feedbackApi } from '../services/api';
import type { FeedbackAnswers, FeedbackRating, FeedbackResults } from '../types';

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

const AdminFeedbackPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort } = useAppData();
  const toast = useToast();
  const [results, setResults] = useState<FeedbackResults | null>(null);
  const [error, setError] = useState('');
  const [themes, setThemes] = useState<{ themes: string; createdAt: string } | null>(null);
  const [themesBusy, setThemesBusy] = useState(false);

  useEffect(() => {
    if (!activeCohort) return;
    setResults(null);
    setThemes(null);
    setError('');
    feedbackApi.getResults(activeCohort.id)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load feedback.'));
    aiApi.getFeedbackThemes(activeCohort.id).then(setThemes).catch(() => { /* none saved */ });
  }, [activeCohort?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <PageHeader title="Feedback" subtitle="Anonymous feedback participants send from their app. Answers show once at least five have come in." />

      {error ? (
        <p className={`${CARD} text-sm text-red-700`}>{error}</p>
      ) : !results ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading feedback…</p>
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
                    {themesBusy ? 'Summarising…' : themes ? 'Summarise again' : 'Summarise themes with AI'}
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
      )}
    </div>
  );
};

export default AdminFeedbackPage;
