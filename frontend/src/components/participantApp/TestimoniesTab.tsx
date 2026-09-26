import React, { useEffect, useState } from 'react';
import { participantAppApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { shortMoment } from '../../utils/participantApp';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import PageLoader from '../PageLoader';
import type { ParticipantTestimony, TestimonyFeedItem, TestimonyVisibility } from '../../types';

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

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

const TEXT_INPUT = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

interface FormState {
  id: string | null; // null = new
  title: string;
  body: string;
  visibility: TestimonyVisibility;
}

const emptyForm: FormState = { id: null, title: '', body: '', visibility: 'SUPPORT' };

const TestimoniesTab: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mine, setMine] = useState<ParticipantTestimony[]>([]);
  const [feed, setFeed] = useState<TestimonyFeedItem[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    participantAppApi.getTestimonies()
      .then((data) => { setMine(data.mine); setFeed(data.feed); })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load testimonies.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ ...emptyForm }); setError(''); };
  const openEdit = (t: ParticipantTestimony) => { setForm({ id: t.id, title: t.title ?? '', body: t.body, visibility: t.visibility }); setError(''); };

  const save = async () => {
    if (!form || !form.body.trim()) { setError('Write your testimony first.'); return; }
    setSaving(true);
    setError('');
    try {
      const input = { title: form.title.trim(), body: form.body.trim(), visibility: form.visibility };
      if (form.id) {
        const updated = await participantAppApi.updateTestimony(form.id, input, user?.name || '');
        setMine((prev) => prev.map((t) => (t.id === form.id ? updated : t)));
      } else {
        const created = await participantAppApi.submitTestimony(input, user?.name || '');
        setMine((prev) => [created, ...prev]);
      }
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your testimony.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await participantAppApi.deleteTestimony(id);
      setMine((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* stays visible to try again */
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <PageLoader />;
  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} flex items-center justify-between gap-3 px-5 py-4`}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900">Your testimonies</h3>
          <p className="mt-0.5 text-[12.5px] text-gray-500">Share what God has done. Group and cohort ones are checked first.</p>
        </div>
        <button type="button" onClick={openNew} className="flex-none rounded-xl bg-primary px-3.5 py-2.5 text-[13px] font-semibold text-white">
          Share a testimony
        </button>
      </section>

      {form && (
        <section className={`${CARD} px-5 py-5`}>
          <h3 className="text-base font-bold text-gray-900">{form.id ? 'Edit testimony' : 'Share a testimony'}</h3>

          <label className="mt-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Title (optional)</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="A short title" className={`${TEXT_INPUT} min-h-[46px]`} />
          </label>

          <label className="mt-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">What happened?</span>
            <textarea
              value={form.body}
              onChange={(e) => { setForm({ ...form, body: e.target.value }); setError(''); }}
              placeholder="Tell us what God has done"
              className={`${TEXT_INPUT} min-h-[120px] resize-y`}
            />
          </label>

          <p className="mt-3.5 mb-1.5 text-[13px] font-semibold text-gray-900">Who can see it?</p>
          <div className="flex flex-wrap gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, visibility: opt.value })}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${form.visibility === opt.value ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-orange-50'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {form.visibility !== 'SUPPORT' && (
            <p className="mt-2 text-[12px] text-gray-500">Group and cohort testimonies are checked by the team before anyone else can see them.</p>
          )}

          {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setForm(null)} className="min-h-[46px] rounded-xl border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-700">Cancel</button>
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="min-h-[46px] rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center justify-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
            </button>
          </div>
        </section>
      )}

      <section className={`${CARD} px-5 py-5`}>
        <h3 className="mb-1 text-base font-bold text-gray-900">Your testimonies</h3>
        {mine.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">Nothing shared yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {mine.map((t) => {
              const chip = STATUS_CHIP[t.status];
              return (
                <div key={t.id} className="rounded-xl bg-[#f9fafb] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.title && <span className="text-[13.5px] font-bold text-gray-900">{t.title}</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                    <span className="ml-auto text-[11px] text-gray-400">{shortMoment(t.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700">{t.body}</p>
                  {t.status === 'PENDING' && (
                    <div className="mt-2.5 flex gap-2">
                      <button type="button" onClick={() => openEdit(t)} className="min-h-[34px] rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] font-semibold text-gray-700">Edit</button>
                      <button type="button" onClick={() => { void remove(t.id); }} disabled={deletingId === t.id} className="min-h-[34px] rounded-lg border border-red-200 bg-white px-3 text-[12.5px] font-semibold text-red-700 disabled:opacity-60">
                        {deletingId === t.id ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3 w-3" />Deleting…</span>) : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={`${CARD} px-5 py-5`}>
        <h3 className="mb-1 text-base font-bold text-gray-900">From your group &amp; cohort</h3>
        {feed.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">Nothing shared yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {feed.map((t) => (
              <div key={t.id} className="flex gap-3 rounded-xl bg-[#f9fafb] p-3.5">
                <Avatar name={t.participantName} avatarUrl={t.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-bold text-gray-900">{t.participantName}</span>
                    <span className="text-[11px] text-gray-400">{shortMoment(t.createdAt)}</span>
                  </div>
                  {t.title && <p className="mt-0.5 text-[13.5px] font-semibold text-gray-800">{t.title}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default TestimoniesTab;
