import React, { useEffect, useState } from 'react';
import { aiApi } from '../../services/api';
import type { ParticipantSummaryState } from '../../types';
import Spinner from '../Spinner';

// End-of-FOF summary on My Journey. Written by a free AI service from the
// participant's own reflections, only if they choose to turn it on. It is a
// reflection aid, never a score of their spiritual growth.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-[22px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

// The summary comes back as short headed paragraphs; show headings in bold.
const HEADINGS = new Set(['What kept coming up', 'What you set out to do', 'Worth revisiting']);

const EndSummaryCard: React.FC<{ lastWeek: number; reflectionCount: number }> = ({ lastWeek, reflectionCount }) => {
  const [state, setState] = useState<ParticipantSummaryState | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'opt' | 'generate' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    aiApi.getSummaryState().then(setState).catch(() => setState({ optedIn: false, unlocked: false, summary: null }));
  }, []);

  const setOptIn = async (optIn: boolean) => {
    setBusy('opt');
    setError('');
    try {
      await aiApi.setOptIn(optIn);
      setState((prev) => prev && { ...prev, optedIn: optIn, summary: optIn ? prev.summary : null });
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('generate');
    setError('');
    try {
      const summary = await aiApi.generateSummary();
      setState((prev) => prev && { ...prev, summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write your summary.');
    } finally {
      setBusy(null);
    }
  };

  const intro = (
    <>
      <p className="text-[15px] font-bold text-gray-900">Your end-of-FOF summary</p>
      <p className="mx-auto mt-[7px] max-w-[42ch] text-[13.5px] leading-relaxed text-gray-500">
        A summary built from what you wrote, in your own words. It is a reflection aid, not a score of your spiritual growth.
      </p>
    </>
  );

  if (!state) return <section className={`${CARD} text-center`}>{intro}</section>;

  if (!state.unlocked) {
    return (
      <section className={`${CARD} text-center`}>
        {intro}
        <span className="mt-3 inline-block rounded-full bg-[#f6f7f9] px-3 py-[5px] text-[11px] font-bold text-gray-500">Unlocks at week {lastWeek}</span>
      </section>
    );
  }

  if (!state.optedIn) {
    return (
      <section className={CARD}>
        <div className="text-center">{intro}</div>
        <div className="mt-4 rounded-[14px] bg-[#fff8f3] p-3.5 text-[13px] leading-relaxed text-gray-700">
          To write it, your reflections are sent to a free outside AI service (through OpenRouter). Nobody on the FOF team reads your reflections or your summary. The service may keep what is sent. You can turn this off at any time.
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] text-gray-800">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-primary)]" />
          <span>I understand and want an AI summary of my reflections</span>
        </label>
        {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        <button type="button" onClick={() => { void setOptIn(true); }} disabled={!consent || busy !== null} className="mt-3.5 min-h-[46px] w-full rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy === 'opt' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Turn on AI summary'}
        </button>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <div className="text-center">{intro}</div>
      {state.summary ? (
        <div className="mt-4 rounded-[14px] bg-[#f9fafb] p-4 text-[14px] leading-relaxed text-gray-700">
          {state.summary.text.split(/\n+/).map((line, index) => {
            const clean = line.replace(/^#+\s*|\*\*/g, '').trim();
            if (!clean) return null;
            if (HEADINGS.has(clean.replace(/:$/, ''))) {
              return <p key={index} className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-[#9a6a4b] first:mt-0">{clean.replace(/:$/, '')}</p>;
            }
            return <p key={index} className="mt-1.5">{clean.replace(/^[-*]\s+/, '• ')}</p>;
          })}
        </div>
      ) : reflectionCount === 0 ? (
        <p className="mt-4 text-center text-[13px] text-gray-500">Write at least one weekly reflection first.</p>
      ) : null}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        {reflectionCount > 0 && (
          <button type="button" onClick={() => { void generate(); }} disabled={busy !== null} className="min-h-[44px] flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy === 'generate' ? 'Writing your summary…' : state.summary ? 'Write it again' : 'Write my summary'}
          </button>
        )}
        <button type="button" onClick={() => { void setOptIn(false); }} disabled={busy !== null} className="text-[13px] font-semibold text-gray-500 disabled:opacity-60">
          Turn off and delete
        </button>
      </div>
      {state.summary && <p className="mt-2 text-xs text-gray-400">You can write it again once a day.</p>}
    </section>
  );
};

export default EndSummaryCard;
