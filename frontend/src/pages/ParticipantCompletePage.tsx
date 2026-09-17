import React, { useState } from 'react';
import PageHeader from '../components/PageHeader';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { useChurchDepartments } from '../hooks/useChurchDepartments';
import { participantAppApi } from '../services/api';

// Wrapping up: which church department they want to join, and whether they want
// a referral. A referral is logged for their support to confirm. Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const ParticipantCompletePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, reload } = useParticipantApp();
  const departments = useChurchDepartments();
  const [department, setDepartment] = useState('');
  const [wantsReferral, setWantsReferral] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (loading || !home) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const submit = async () => {
    if (!department) { setError('Choose a department.'); return; }
    if (wantsReferral === null) { setError('Tell us if you would like a referral.'); return; }
    setSending(true);
    setError('');
    try {
      await participantAppApi.submitWrapUp({ department, wantsReferral, note }, user?.name || '');
      setSent(true);
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-[480px]">
      <PageHeader title="Wrapping up" subtitle="Tell us what comes next for you." />
      <section className={CARD}>
        {sent || home.wrapUp.submitted ? (
          <div className="px-2.5 py-5 text-center">
            <p className="text-2xl" aria-hidden="true">🎉</p>
            <p className="mt-2 text-[15px] font-bold text-gray-900">Congratulations on completing FOF.</p>
            <p className="mt-1.5 text-[13px] text-gray-500">Your support team has your details and will follow up.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <span className="mb-2 block text-[13px] font-semibold text-gray-900">Which department are you interested in?</span>
              <AppSelect
                value={department}
                onChange={(value) => { setDepartment(value); setError(''); }}
                options={departments.map((entry) => ({ value: entry.name, label: entry.name, meta: entry.description || undefined }))}
                placeholder="Choose a department"
              />
            </div>
            <div>
              <span className="mb-2 block text-[13px] font-semibold text-gray-900">Would you like a referral to join that department?</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Referral">
                {([[true, 'Yes, refer me'], [false, 'Not right now']] as Array<[boolean, string]>).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={wantsReferral === value}
                    onClick={() => { setWantsReferral(value); setError(''); }}
                    className={`min-h-[40px] rounded-full border px-3.5 py-2 text-[13px] font-semibold ${wantsReferral === value ? 'border-[#ffdeca] bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Anything else you&apos;d like to share?</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button type="button" onClick={() => { void submit(); }} disabled={sending} className="min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
              {sending ? 'Sending…' : 'Submit'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default ParticipantCompletePage;
