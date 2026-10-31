import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { participantAppApi } from '../../services/api';
import Spinner from '../Spinner';

// "How was today's class?" — shown after the check-in and before the
// notification prompt, once the configured feedback time has passed.
// Anonymous unless they tick "Show my name with this". Same portal/shape as
// CheckInModal. The scale is faces with one word each, red (poor) to green
// (excellent), so nobody reads 1 as best; a short comment is required.

const SCALE = [
  { value: 1, face: '😞', word: 'Poor', on: 'border-red-300 bg-red-50 text-red-700' },
  { value: 2, face: '🙁', word: 'Fair', on: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 3, face: '😐', word: 'Okay', on: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 4, face: '🙂', word: 'Good', on: 'border-lime-300 bg-lime-50 text-lime-700' },
  { value: 5, face: '😍', word: 'Great', on: 'border-green-300 bg-green-50 text-green-700' },
] as const;

interface ClassFeedbackModalProps {
  weekId: number;
  weekNumber: number;
  onAnswered: () => void;
  onLater: () => void;
}

const ClassFeedbackModal: React.FC<ClassFeedbackModalProps> = ({ weekId, weekNumber, onAnswered, onLater }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [showName, setShowName] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating) { setError('Tap a face to rate the class.'); return; }
    if (comment.trim().length < 3) { setError('Please tell us why in a few words.'); return; }
    setSending(true);
    setError('');
    try {
      await participantAppApi.submitClassFeedback({ weekId, rating, comment, showName });
      onAnswered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="classfeedback-title">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" /></svg>
        </span>
        <h2 id="classfeedback-title" className="mt-3 text-lg font-bold text-gray-900">How was Week {weekNumber}'s class?</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">Tap a face, then tell us why.</p>

        <div className="mt-4 flex justify-between gap-1.5" role="radiogroup" aria-label="Rating, from poor to great">
          {SCALE.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={rating === option.value}
              aria-label={option.word}
              onClick={() => { setRating(option.value); setError(''); }}
              className={`flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 ${rating === option.value ? option.on : 'border-gray-100 bg-white text-gray-500'} ${rating && rating !== option.value ? 'opacity-50' : ''}`}
            >
              <span className="text-[26px] leading-none" aria-hidden="true">{option.face}</span>
              <span className="text-[11.5px] font-semibold">{option.word}</span>
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between px-1 text-[11px] font-semibold" aria-hidden="true">
          <span className="text-red-600">← Not good</span>
          <span className="text-green-700">Very good →</span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Why? <span className="text-red-600">*</span></span>
          <textarea value={comment} onChange={(e) => { setComment(e.target.value); setError(''); }} rows={3} required placeholder="What stood out, or what could be better?" className="min-h-[70px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </label>

        <label className="mt-3 flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="accent-primary" />
          Show my name with this
        </label>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={() => { void submit(); }} disabled={sending} className="min-h-[48px] rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60">
            {sending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send'}
          </button>
          <button type="button" onClick={onLater} disabled={sending} className="min-h-[44px] rounded-xl text-[14px] font-semibold text-gray-500 disabled:opacity-60">
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ClassFeedbackModal;
