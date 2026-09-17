import React, { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { participantAppApi } from '../services/api';
import type { FeedbackAnswers, FeedbackRating } from '../types';

// Anonymous feedback, any time. The answers are stored with no name, account or
// time attached. Surveys go out separately (e.g. a Google Form link in an
// announcement). Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const FIELD = 'min-h-[70px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const RATINGS: Array<[FeedbackRating, string]> = [['NOT_GREAT', 'Not great'], ['OKAY', 'Okay'], ['GREAT', 'Great']];

const RatingRow: React.FC<{ label: string; value: FeedbackRating | undefined; onChange: (value: FeedbackRating) => void }> = ({ label, value, onChange }) => (
  <div>
    <span className="mb-2 block text-[13px] font-semibold text-gray-900">{label}</span>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {RATINGS.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`min-h-[40px] rounded-full border px-3.5 py-2 text-[13px] font-semibold ${value === key ? 'border-[#ffdeca] bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}
        >
          {text}
        </button>
      ))}
    </div>
  </div>
);

const ParticipantFeedbackPage: React.FC = () => {
  const [answers, setAnswers] = useState<Partial<FeedbackAnswers>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (patch: Partial<FeedbackAnswers>) => { setAnswers((prev) => ({ ...prev, ...patch })); setError(''); };

  const submit = async () => {
    if (!answers.rating) { setError('Choose how the programme is going.'); return; }
    setSending(true);
    setError('');
    try {
      await participantAppApi.submitFeedback({
        rating: answers.rating,
        workingWell: answers.workingWell?.trim() || null,
        needsAttention: answers.needsAttention?.trim() || null,
      });
      setSent(true);
      setAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your feedback.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-[480px]">
      <PageHeader title="Feedback" subtitle="Anonymous. Share how the programme is going." />
      <section className={CARD}>
        {sent ? (
          <div className="px-2.5 py-5 text-center">
            <p className="text-[15px] font-bold text-gray-900">Thank you.</p>
            <p className="mt-1.5 text-[13px] text-gray-500">Your response is anonymous. We can&apos;t identify you or link it to your account.</p>
            <button type="button" onClick={() => setSent(false)} className="mt-4 text-[13px] font-semibold text-[#c2410c]">Send more feedback</button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-gray-500">Anonymous. Your name is never attached to this.</p>
            <RatingRow label="How is the programme going for you?" value={answers.rating} onChange={(rating) => set({ rating })} />
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">What&apos;s working well?</span>
              <textarea value={answers.workingWell ?? ''} onChange={(e) => set({ workingWell: e.target.value })} className={FIELD} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">What needs attention?</span>
              <textarea value={answers.needsAttention ?? ''} onChange={(e) => set({ needsAttention: e.target.value })} className={FIELD} />
            </label>
            {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button type="button" onClick={() => { void submit(); }} disabled={sending} className="min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
              {sending ? 'Sending…' : 'Submit anonymously'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default ParticipantFeedbackPage;
