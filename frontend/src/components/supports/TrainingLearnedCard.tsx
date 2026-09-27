import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupportSession } from '../../types';
import { supportSessionsApi } from '../../services/api';
import Spinner from '../Spinner';

// Support home: from 12 noon on a pre-cohort training's day, a support marked
// present must answer two questions (a sentence or more each): what they
// learned and what they'll apply. It's a popup with no close — it stays until
// they send it. One training at a time if several are waiting.
const isSentence = (text: string) => text.trim().length >= 15 && text.trim().split(/\s+/).length >= 4;

const TrainingLearnedCard: React.FC<{ userId: string }> = ({ userId }) => {
  const [pending, setPending] = useState<SupportSession[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { learned: string; apply: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    supportSessionsApi.getMyPendingLearned(userId).then((res) => setPending(res.sessions)).catch(() => setPending([]));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const submit = async (session: SupportSession) => {
    const learned = (drafts[session.id]?.learned ?? '').trim();
    const apply = (drafts[session.id]?.apply ?? '').trim();
    if (!isSentence(learned) || !isSentence(apply)) {
      setError((prev) => ({ ...prev, [session.id]: 'Write at least one full sentence for each question.' }));
      return;
    }
    setSaving(session.id);
    setError((prev) => ({ ...prev, [session.id]: '' }));
    try {
      await supportSessionsApi.submitLearned(session.id, learned, apply);
      setPending((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      setError((prev) => ({ ...prev, [session.id]: e instanceof Error ? e.message : 'Could not send. Try again.' }));
    } finally {
      setSaving(null);
    }
  };

  const session = pending[0];
  if (!session) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="What did you learn?">
        <section className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)]">
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">What did you learn?</p>
          <h3 className="mt-1 text-base font-bold text-gray-900">{session.title}</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">You were at this training. Answer both in a sentence or more.</p>
          {([['learned', 'What did you learn?', 'I learned that…'], ['apply', 'What will you apply going forward?', 'Going forward I will…']] as const).map(([field, label, hint]) => (
            <label key={field} className="mt-3 block">
              <span className="text-sm font-semibold text-gray-800">{label}</span>
              <textarea
                value={drafts[session.id]?.[field] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [session.id]: { ...(prev[session.id] ?? { learned: '', apply: '' }), [field]: e.target.value } }))}
                placeholder={hint}
                className="mt-1.5 min-h-[80px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
              />
            </label>
          ))}
          {error[session.id] && <p className="mt-2 text-xs font-medium text-red-600">{error[session.id]}</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => { void submit(session); }}
              disabled={saving === session.id || !isSentence(drafts[session.id]?.learned ?? '') || !isSentence(drafts[session.id]?.apply ?? '')}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving === session.id ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send'}
            </button>
          </div>
          {pending.length > 1 && <p className="mt-2 text-center text-xs text-gray-400">{pending.length - 1} more training{pending.length === 2 ? '' : 's'} after this one</p>}
        </section>
    </div>,
    document.body
  );
};

export default TrainingLearnedCard;
