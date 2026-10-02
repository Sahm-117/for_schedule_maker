import React, { useEffect, useRef, useState } from 'react';
import Spinner from '../Spinner';
import AppSelect from '../AppSelect';
import Glyph from '../Glyph';
import { useChurchDepartments } from '../../hooks/useChurchDepartments';
import { surveyApi } from '../../services/api';
import type { SurveyForFilling, SurveyQuestion } from '../../types';

type Answer = string | number | { url: string; name: string } | undefined;

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const INPUT = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

interface Props {
  surveyId: string;
  participantName?: string;
  /** Called once the answers are saved. */
  onSubmitted?: () => void;
  /** Shown on the thank-you screen. */
  doneNote?: string;
  onLoaded?: (survey: SurveyForFilling) => void;
}

const SurveyFillForm: React.FC<Props> = ({ surveyId, participantName, onSubmitted, doneNote, onLoaded }) => {
  const departments = useChurchDepartments();
  const [survey, setSurvey] = useState<SurveyForFilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    surveyApi.get(surveyId).then((s) => {
      if (cancelled) return;
      setSurvey(s);
      onLoaded?.(s);
    }).catch((err: Error) => { if (!cancelled) setLoadError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  const set = (q: SurveyQuestion, value: Answer) => {
    if (!q.id) return;
    setAnswers((a) => ({ ...a, [q.id as string]: value }));
    setError('');
  };

  const pickFile = async (q: SurveyQuestion, file: File | undefined) => {
    if (!file || !q.id) return;
    setUploading(q.id);
    setError('');
    try {
      set(q, await surveyApi.uploadFile(surveyId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that file.');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (!survey?.questions) return;
    for (const q of survey.questions) {
      const v = q.id ? answers[q.id] : undefined;
      if (q.required && (v === undefined || v === '')) { setError(`Please answer: ${q.prompt}`); return; }
    }
    setSending(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      for (const q of survey.questions) {
        const v = q.id ? answers[q.id] : undefined;
        if (!q.id || v === undefined || v === '') continue;
        payload[q.id] = q.kind === 'FILE' && typeof v === 'object' ? { url: v.url, name: v.name } : v;
      }
      await surveyApi.submit(surveyId, payload, participantName);
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your answers.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (loadError || !survey) return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError || 'This survey is not available.'}</p>;

  if (done || survey.submitted) {
    return (
      <section className={CARD}>
        <div className="px-2.5 py-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Glyph name="check" className="h-7 w-7" /></span>
          <p className="mt-2 text-[15px] font-bold text-gray-900">{done ? 'Thank you.' : 'You have already answered this.'}</p>
          <p className="mt-1.5 text-[13px] text-gray-500">{done ? (doneNote || 'Your answers have been sent.') : 'Each survey can only be answered once.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={CARD}>
      {survey.description && <p className="mb-3 text-[13px] text-gray-600">{survey.description}</p>}
      {survey.anonymous && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600"><Glyph name="info" className="mt-0.5 h-4 w-4 flex-none" />Your answers are anonymous. Nobody can see which are yours.</p>
      )}
      <div className="flex flex-col gap-5">
        {(survey.questions ?? []).map((q, index) => {
          const v = q.id ? answers[q.id] : undefined;
          return (
            <div key={q.id}>
              <span className="mb-2 block text-[13px] font-semibold text-gray-900">
                {index + 1}. {q.prompt}{!q.required && <span className="font-normal text-gray-400"> (optional)</span>}
              </span>
              {q.kind === 'TEXT' && <input value={typeof v === 'string' ? v : ''} maxLength={500} onChange={(e) => set(q, e.target.value)} className={INPUT} />}
              {q.kind === 'TEXTAREA' && <textarea value={typeof v === 'string' ? v : ''} maxLength={5000} rows={4} onChange={(e) => set(q, e.target.value)} className={`${INPUT} resize-none`} />}
              {q.kind === 'NUMBER' && <input type="number" inputMode="decimal" min={q.config.min} max={q.config.max} value={typeof v === 'number' || typeof v === 'string' ? v : ''} onChange={(e) => set(q, e.target.value === '' ? undefined : e.target.value)} className={INPUT} />}
              {q.kind === 'RATING' && (
                <div>
                  <div className="flex gap-2" role="radiogroup" aria-label={q.prompt}>
                    {Array.from({ length: q.config.scale ?? 5 }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={v === n} onClick={() => set(q, n)}
                        className={`grid h-11 min-w-0 flex-1 place-items-center rounded-xl border text-[14px] font-semibold ${v === n ? 'border-primary bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 text-gray-700'}`}>{n}</button>
                    ))}
                  </div>
                  {(q.config.lowLabel || q.config.highLabel) && (
                    <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-gray-500"><span>{q.config.lowLabel}</span><span className="text-right">{q.config.highLabel}</span></div>
                  )}
                </div>
              )}
              {q.kind === 'YESNO' && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.prompt}>
                  {(q.config.feeds === 'referral' ? [['Yes', 'Yes, refer me'], ['No', 'Not right now']] : [['Yes', 'Yes'], ['No', 'No']]).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={v === value} onClick={() => set(q, value)}
                      className={`min-h-[40px] rounded-full border px-3.5 py-2 text-[13px] font-semibold ${v === value ? 'border-[#ffdeca] bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}>{label}</button>
                  ))}
                </div>
              )}
              {q.kind === 'DEPARTMENT' && (
                <AppSelect value={typeof v === 'string' ? v : ''} onChange={(value) => set(q, value)} placeholder="Choose a department"
                  options={departments.map((d) => ({ value: d.name, label: d.name, meta: d.description || undefined }))} />
              )}
              {q.kind === 'FILE' && (
                <div>
                  <input ref={(el) => { if (q.id) fileInputs.current[q.id] = el; }} type="file" className="hidden" onChange={(e) => { void pickFile(q, e.target.files?.[0]); e.target.value = ''; }} />
                  <button type="button" onClick={() => q.id && fileInputs.current[q.id]?.click()} disabled={uploading === q.id}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-left text-[13px] font-semibold text-gray-600">
                    {uploading === q.id ? <Spinner className="h-4 w-4" /> : <Glyph name="clip" className="h-4 w-4 flex-none" />}
                    <span className="min-w-0 truncate">{uploading === q.id ? 'Uploading…' : v && typeof v === 'object' ? v.name || 'File added' : 'Choose a photo or file (5 MB max)'}</span>
                  </button>
                  {v && typeof v === 'object' && /\.(png|jpe?g|gif|webp)$/i.test(v.url) && <img src={v.url} alt="" className="mt-2 max-h-40 rounded-xl" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={sending || !!uploading} className="mt-6 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
        {sending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Submit'}
      </button>
      <p className="mt-2 text-center text-[12px] text-gray-500">Once you submit you can't change your answers.</p>
    </section>
  );
};

export default SurveyFillForm;
