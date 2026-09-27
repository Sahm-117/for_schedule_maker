import React, { useEffect, useState } from 'react';
import { participantAppApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../Toast';
import { shortMoment } from '../../utils/participantApp';
import Avatar from '../Avatar';
import PageLoader from '../PageLoader';
import type { ParticipantTestimony, TestimonyFeedItem, TestimonyVisibility } from '../../types';

// Same card and pill buttons as the participant week page.
const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]';
const SECONDARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98]';

const VISIBILITY_OPTIONS: Array<{ value: TestimonyVisibility; label: string }> = [
  { value: 'SUPPORT', label: 'Just my support' },
  { value: 'GROUP', label: 'My group' },
  { value: 'COHORT', label: 'Everyone in my cohort' },
];

const STATUS_CHIP: Record<ParticipantTestimony['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Waiting for approval', cls: 'bg-amber-100/80 text-amber-700' },
  APPROVED: { label: 'Shared', cls: 'bg-emerald-100/80 text-emerald-700' },
  HIDDEN: { label: 'Hidden', cls: 'bg-neutral-100 text-neutral-600' },
};

const TEXT_INPUT = 'w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

interface FormState {
  id: string | null; // null = new
  title: string;
  body: string;
  visibility: TestimonyVisibility;
  /** Status this testimony had before opening the editor (drives the re-approval note). */
  originalStatus: ParticipantTestimony['status'];
}

const emptyForm: FormState = { id: null, title: '', body: '', visibility: 'SUPPORT', originalStatus: 'PENDING' };

// Mirrors submit_testimony/update_testimony's own rule, so the UI can show the
// result instantly instead of waiting on the round trip.
const predictedStatus = (visibility: TestimonyVisibility): ParticipantTestimony['status'] => (visibility === 'SUPPORT' ? 'APPROVED' : 'PENDING');

const TestimoniesTab: React.FC = () => {
  const { user } = useAuth();
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mine, setMine] = useState<ParticipantTestimony[]>([]);
  const [feed, setFeed] = useState<TestimonyFeedItem[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    participantAppApi.getTestimonies()
      .then((data) => { setMine(data.mine); setFeed(data.feed); })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load testimonies.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ ...emptyForm }); setError(''); };
  const openEdit = (t: ParticipantTestimony) => { setForm({ id: t.id, title: t.title ?? '', body: t.body, visibility: t.visibility, originalStatus: t.status }); setError(''); };

  // Optimistic save: the list updates immediately (predicting the same status
  // rule the RPC applies), then reconciles with the server response; a
  // failure reverts and shows an error toast, matching togglePrayerShare in
  // ParticipantFaithPage.tsx / applyMove in AdminAllocationPage.tsx.
  const save = async () => {
    if (!form || !form.body.trim()) { setError('Write your testimony first.'); return; }
    setError('');
    const input = { title: form.title.trim(), body: form.body.trim(), visibility: form.visibility };
    const status = predictedStatus(form.visibility);

    if (form.id) {
      const editingId = form.id;
      const previous = mine.find((t) => t.id === editingId) ?? null;
      setMine((prev) => prev.map((t) => (t.id === editingId ? { ...t, title: input.title || null, body: input.body, visibility: input.visibility, status } : t)));
      setForm(null);
      try {
        const updated = await participantAppApi.updateTestimony(editingId, input, user?.name || '');
        setMine((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } catch (err) {
        if (previous) setMine((prev) => prev.map((t) => (t.id === editingId ? previous : t)));
        showToast({ message: err instanceof Error ? err.message : 'Could not save your testimony.', tone: 'error' });
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: ParticipantTestimony = { id: tempId, title: input.title || null, body: input.body, visibility: input.visibility, status, createdAt: now, updatedAt: now };
      setMine((prev) => [optimistic, ...prev]);
      setForm(null);
      try {
        const created = await participantAppApi.submitTestimony(input, user?.name || '');
        setMine((prev) => prev.map((t) => (t.id === tempId ? created : t)));
      } catch (err) {
        setMine((prev) => prev.filter((t) => t.id !== tempId));
        showToast({ message: err instanceof Error ? err.message : 'Could not save your testimony.', tone: 'error' });
      }
    }
  };

  // Optimistic delete: gone from the list immediately; a failure puts it back
  // in place and shows an error toast.
  const remove = async (id: string) => {
    if (!confirm('Delete this testimony? This cannot be undone.')) return;
    const index = mine.findIndex((t) => t.id === id);
    if (index === -1) return;
    const previous = mine[index];
    setMine((prev) => prev.filter((t) => t.id !== id));
    try {
      await participantAppApi.deleteTestimony(id);
    } catch (err) {
      setMine((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, previous);
        return next;
      });
      showToast({ message: err instanceof Error ? err.message : 'Could not delete your testimony.', tone: 'error' });
    }
  };

  if (loading) return <PageLoader />;
  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;

  return (
    <div className="flex flex-col gap-6">
      {/* One card to share: a short line and one button, the form opens in place. */}
      <section className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
        <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">{form?.id ? 'Edit testimony' : 'Share a testimony'}</h2>
        {!form && <p className="mt-3 text-[15.5px] leading-[1.7] text-gray-600">Share what God has done. Group and cohort ones are checked first.</p>}

        {form ? (
          <>
            <label className="mt-5 block">
              <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">Title (optional)</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="A short title" className={`${TEXT_INPUT} min-h-[48px]`} />
            </label>

            <label className="mt-5 block">
              <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">What happened?</span>
              <textarea
                value={form.body}
                onChange={(e) => { setForm({ ...form, body: e.target.value }); setError(''); }}
                placeholder="Tell us what God has done"
                className={`${TEXT_INPUT} min-h-[120px] resize-y`}
              />
            </label>

            <p className="mb-[7px] mt-5 text-[14px] font-semibold text-gray-900">Who can see it?</p>
            <div className="flex flex-wrap gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, visibility: opt.value })}
                  className={`min-h-[40px] rounded-full px-4 text-[13.5px] font-semibold transition ${form.visibility === opt.value ? 'bg-gray-900 text-white' : 'bg-[#f2f2f4] text-gray-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.visibility !== 'SUPPORT' && (
              <p className="mt-2.5 text-[13px] leading-[1.55] text-gray-500">
                {form.originalStatus === 'APPROVED'
                  ? 'Saving will send this back to the team to check again before your group or cohort can see it.'
                  : 'Group and cohort testimonies are checked by the team before anyone else can see them.'}
              </p>
            )}

            {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button type="button" onClick={() => { void save(); }} className={PRIMARY}>Save</button>
              <button type="button" onClick={() => setForm(null)} className={SECONDARY}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="mt-6 flex">
            <button type="button" onClick={openNew} className={PRIMARY}>+ New testimony</button>
          </div>
        )}
      </section>

      <section className={`${SURFACE} px-6 py-5 sm:px-8`}>
        <h3 className="text-[16px] font-semibold text-gray-900">Your testimonies{mine.length > 0 && <span className="ml-1.5 text-[14px] font-normal text-gray-400">{mine.length}</span>}</h3>
        {mine.length === 0 ? (
          <p className="mt-2 text-[14px] text-gray-500">Nothing shared yet.</p>
        ) : (
          <ul className="mt-1">
            {mine.map((t) => {
              const chip = STATUS_CHIP[t.status];
              return (
                <li key={t.id} className="border-t border-[#f0f0f2] py-4 first:border-t-0">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 pt-1.5 text-[15px] font-semibold text-gray-900">{t.title || 'Testimony'}</p>
                    <div className="-mr-2 flex flex-none items-center">
                      {(t.status === 'PENDING' || t.status === 'APPROVED') && (
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          aria-label="Edit testimony"
                          title="Edit testimony"
                          className="grid h-9 w-9 flex-none place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" /></svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { void remove(t.id); }}
                        aria-label="Delete testimony"
                        title="Delete testimony"
                        className="grid h-9 w-9 flex-none place-items-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6 7h12M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7m2 0-.867 12.142A2 2 0 0 1 13.64 21h-3.28a2 2 0 0 1-1.993-1.858L7 7" /></svg>
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-600">{t.body}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${chip.cls}`}>{chip.label}</span>
                    <span className="text-[12.5px] text-gray-400">{shortMoment(t.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${SURFACE} px-6 py-5 sm:px-8`}>
        <h3 className="text-[16px] font-semibold text-gray-900">From your group &amp; cohort</h3>
        {feed.length === 0 ? (
          <p className="mt-2 text-[14px] text-gray-500">Nothing shared yet.</p>
        ) : (
          <ul className="mt-1">
            {feed.map((t) => (
              <li key={t.id} className="flex gap-3 border-t border-[#f0f0f2] py-4 first:border-t-0">
                <Avatar name={t.participantName} avatarUrl={t.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-gray-900">{t.participantName}</span>
                    <span className="text-[12.5px] text-gray-400">{shortMoment(t.createdAt)}</span>
                  </div>
                  {t.title && <p className="mt-0.5 text-[14.5px] font-semibold text-gray-800">{t.title}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-600">{t.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default TestimoniesTab;
