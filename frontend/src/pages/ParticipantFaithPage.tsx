import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { shortMoment } from '../utils/participantApp';
import type { FaithProjectStatus, ParticipantFaith } from '../types';

// The participant's faith project: draft it, send it to their support, and read
// their support's replies. Notes between the support and the back office are
// never shown here. Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const STATUS: Record<FaithProjectStatus, { label: string; cls: string; editable: boolean }> = {
  NOT_DRAFTED: { label: 'Not started', cls: 'bg-[#f6f7f9] text-gray-500', editable: true },
  AWAITING_DRAFT: { label: 'Needs a change', cls: 'bg-[#fef3c7] text-[#b45309]', editable: true },
  NEEDS_REFINEMENT: { label: 'With your support', cls: 'bg-[#fff1e6] text-[#c2410c]', editable: false },
  UNDER_REFINEMENT: { label: 'With your support', cls: 'bg-[#fff1e6] text-[#c2410c]', editable: false },
  APPROVED: { label: 'Approved', cls: 'bg-[#f2fbf5] text-[#15803d]', editable: false },
};

const ParticipantFaithPage: React.FC = () => {
  const { user } = useAuth();
  const { home, reload } = useParticipantApp();
  const toast = useToast();
  const [faith, setFaith] = useState<ParticipantFaith | null>(null);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [trailOpen, setTrailOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    participantAppApi.getFaith()
      .then((data) => {
        if (cancelled) return;
        setFaith(data);
        setDraft(data.project?.body ?? '');
        // Opening it marked the conversation read, so clear the dot.
        if (home?.faithUnread) void reload();
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your faith project.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;
  if (!faith) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const status = STATUS[faith.project?.status ?? 'NOT_DRAFTED'];
  const supportFirst = (home?.group?.supportName || 'your support').split(' ')[0];

  const save = async (submit: boolean) => {
    if (submit && !draft.trim()) { setError('Write your project before submitting.'); return; }
    setSaving(submit ? 'submit' : 'draft');
    setError('');
    try {
      await participantAppApi.saveFaithProject(draft, submit, user?.name || '');
      setFaith(await participantAppApi.getFaith());
      toast({ message: submit ? `Sent to ${supportFirst}` : 'Draft saved' });
      if (submit) void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your faith project.');
    } finally {
      setSaving(null);
    }
  };

  const replies = faith.trail.filter((entry) => !entry.byParticipant).length;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Faith Project" subtitle="A private space to reflect, visible to you and your support team." />

      <div className="flex flex-col gap-3.5">
        <section className={CARD}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold text-gray-900">Your faith project</h2>
              <p className="mt-0.5 text-[13px] text-gray-500">One thing you are trusting God for across the programme.</p>
            </div>
            <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
          </div>

          {status.editable ? (
            <>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[13.5px] font-semibold text-gray-900">What are you believing God for?</span>
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError(''); }}
                  placeholder="Be specific. Who, what, and by when."
                  className="min-h-[120px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              {error && <p className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => { void save(false); }} disabled={saving !== null} className="min-h-[46px] rounded-xl border border-[#ffdeca] bg-white p-3 text-sm font-semibold text-[#c2410c] disabled:opacity-60">
                  {saving === 'draft' ? 'Saving…' : 'Save draft'}
                </button>
                <button type="button" onClick={() => { void save(true); }} disabled={saving !== null} className="min-h-[46px] rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-60">
                  {saving === 'submit' ? 'Sending…' : 'Submit for review'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 whitespace-pre-wrap rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800">{faith.project?.body || '—'}</div>
              <p className="mt-2.5 text-[12.5px] leading-[1.55] text-gray-500">
                {faith.project?.status === 'APPROVED'
                  ? 'Approved. You can still talk to your support about how it is going.'
                  : `With ${supportFirst} to review. They will reply here.`}
              </p>
            </>
          )}
        </section>

        <section className={CARD}>
          <button type="button" onClick={() => setTrailOpen((open) => !open)} className="flex w-full items-center gap-2.5 text-left" aria-expanded={trailOpen}>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-gray-900">Feedback from your support</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">{replies === 0 ? 'No replies yet' : `${replies} ${replies === 1 ? 'reply' : 'replies'}`}</p>
            </div>
            <span className={`flex-none text-xs text-gray-400 transition-transform ${trailOpen ? 'rotate-180' : ''}`} aria-hidden="true">&#9662;</span>
          </button>
          {trailOpen && (
            <>
              {faith.trail.length === 0 ? (
                <p className="mt-3 text-[13px] text-gray-500">Nothing yet. Your support will reply once you submit.</p>
              ) : (
                <div className="mt-3.5 flex flex-col gap-2.5">
                  {faith.trail.map((entry) => (
                    <div key={entry.id} className={`rounded-xl px-3.5 py-3 ${entry.byParticipant ? 'bg-[#fff8f3]' : 'bg-[#f6f7f9]'}`}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[13px] font-bold text-gray-900">{entry.byParticipant ? 'You' : entry.authorName || 'Your support'}</span>
                        <span className="text-[11px] font-semibold text-gray-400">{entry.byParticipant ? 'Submitted' : 'Support'}</span>
                        <span className="ml-auto text-[11px] text-gray-400">{shortMoment(entry.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700">{entry.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3.5 flex items-start gap-2 rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-[12.5px] leading-normal text-gray-500">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" /></svg>
                <span>Notes between your support and the programme team are not shown here.</span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ParticipantFaithPage;
