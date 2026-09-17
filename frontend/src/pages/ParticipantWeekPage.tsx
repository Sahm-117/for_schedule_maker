import React, { useEffect, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import { useToast } from '../components/Toast';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { recapHasContent, reflectionEditable, reflectionFor } from '../utils/participantApp';

// One week for a participant: the recap (once their support releases it) and
// their private three-question reflection. Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const FIELD = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const LockNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3.5 flex items-start gap-2 rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-[12.5px] leading-normal text-gray-500">
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
    </svg>
    <span>{children}</span>
  </div>
);

const ParticipantWeekPage: React.FC = () => {
  const { weekNumber: weekParam } = useParams();
  const { home, loading, applyReflection } = useParticipantApp();
  const toast = useToast();
  const [docOpen, setDocOpen] = useState(false);
  const [stoodOut, setStoodOut] = useState('');
  const [goal, setGoal] = useState('');
  const [goalCheck, setGoalCheck] = useState('');
  const [goalError, setGoalError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const week = home?.weeks.find((w) => w.weekNumber === Number(weekParam)) ?? null;
  const reflection = week && home ? reflectionFor(home.reflections, week.id) : null;
  const now = new Date();
  const editable = reflectionEditable(reflection, now);

  useEffect(() => {
    setStoodOut(reflection?.stoodOut ?? '');
    setGoal(reflection?.goal ?? '');
    setGoalCheck(reflection?.goalCheck ?? '');
    setGoalError(false);
    setSaveError('');
    // Reset the form only when a different or newly saved reflection arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflection?.weekId, reflection?.updatedAt]);

  if (loading) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;
  if (!home) return <Navigate to="/me" replace />;
  if (!week) return <Navigate to="/me" replace />;

  const save = async () => {
    if (!goal.trim()) { setGoalError(true); return; }
    setSaving(true);
    setSaveError('');
    try {
      applyReflection(await participantAppApi.saveReflection(week.id, { stoodOut, goal, goalCheck }));
      toast({ message: reflection ? 'Reflection updated' : 'Reflection saved' });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your reflection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Week ${week.weekNumber}`} subtitle="The recap and your reflection." tourId="participant:week" />

      <div className="flex flex-col gap-3.5">
        {!week.released ? (
          <section className={`${CARD} px-[22px] py-[34px] text-center`}>
            <p className="text-[15px] font-bold text-gray-900">
              {week.shared ? 'This week’s recap is not out yet' : 'No recap for this week'}
            </p>
            <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] leading-[1.55] text-gray-500">
              {week.shared ? 'Your support will release it after your group meeting.' : 'There is no recap to read this week. See you on Sunday.'}
            </p>
            <NavLink to="/me" className="mt-4 inline-block text-[13px] font-semibold text-[#c2410c]">Back to Home</NavLink>
          </section>
        ) : (
          <>
            <section data-wt="pw-recap" className={`${CARD} overflow-hidden`}>
              <div className="px-5 pt-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Week {week.weekNumber} recap</span>
                  <span className="ml-auto rounded-full bg-[#f2fbf5] px-[9px] py-[3px] text-[11px] font-bold text-[#15803d]">Released</span>
                </div>
                <h2 className="mt-2 text-xl font-bold tracking-[-0.01em] text-gray-900">{week.title || `Week ${week.weekNumber}`}</h2>
                {week.recapSummary?.trim() ? (
                  <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.65] text-gray-700">{week.recapSummary.trim()}</p>
                ) : !recapHasContent(week) ? (
                  <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-500">No written recap this week. You can still write your reflection below.</p>
                ) : null}
                {week.discussionPrompt?.trim() && (
                  <div className="mt-3 rounded-[14px] border border-[#f1f2f5] p-3.5">
                    <p className="text-[13px] font-bold text-gray-900">Something to think about</p>
                    <p className="mt-1 text-sm leading-normal text-gray-700">{week.discussionPrompt.trim()}</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-5 pt-4">
                {week.recapDocumentUrl && (
                  <button type="button" onClick={() => setDocOpen(true)} className="min-h-[46px] w-full rounded-xl border border-[#ffdeca] bg-[#fff8f3] p-3 text-[13.5px] font-semibold text-[#c2410c]">
                    Read the full recap
                  </button>
                )}
              </div>
            </section>

            <section data-wt="pw-reflection" className={`${CARD} p-5`}>
              <h3 className="text-base font-bold text-gray-900">Your reflection</h3>
              <p className="mt-[3px] text-[13px] leading-normal text-gray-500">Three short questions. Only you can read your answers.</p>

              {editable ? (
                <>
                  <label className="mt-[18px] block">
                    <span className="mb-[7px] block text-[13.5px] font-semibold text-gray-900">1. What stood out to you?</span>
                    <textarea value={stoodOut} onChange={(e) => setStoodOut(e.target.value)} placeholder="Anything from the recap that stayed with you." className={`${FIELD} min-h-[88px] resize-y`} />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-[3px] block text-[13.5px] font-semibold text-gray-900">2. What is one thing you will do this week because of it?</span>
                    <span className="mb-[7px] block text-[12.5px] text-gray-500">This becomes your goal. Keep it small enough to actually do.</span>
                    <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setGoalError(false); }} placeholder="Pray with my sister on Wednesday evening." className={`${FIELD} min-h-[76px] resize-y`} />
                    {goalError && <span className="mt-[5px] block text-xs font-medium text-red-700">Write one thing you will do.</span>}
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-[3px] block text-[13.5px] font-semibold text-gray-900">3. How will you know you did it?</span>
                    <span className="mb-[7px] block text-[12.5px] text-gray-500">Optional.</span>
                    <input value={goalCheck} onChange={(e) => setGoalCheck(e.target.value)} placeholder="We prayed, even for five minutes." className={`${FIELD} min-h-[48px]`} />
                  </label>
                  {saveError && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{saveError}</p>}
                  <button type="button" onClick={() => { void save(); }} disabled={saving} className="mt-[18px] min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
                    {saving ? 'Saving…' : reflection ? 'Update reflection' : 'Save reflection'}
                  </button>
                  <LockNote>Your support sees that you reflected, never what you wrote. You can change it for a week after you first save it.</LockNote>
                </>
              ) : reflection ? (
                <div className="mt-4 rounded-[14px] bg-[#f9fafb] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-gray-400">What stood out</p>
                  <p className="mt-[5px] text-sm leading-relaxed text-gray-700">{reflection.stoodOut || '—'}</p>
                  <div className="my-[13px] h-px bg-[#eef0f4]" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#9a6a4b]">Your goal</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{reflection.goal}</p>
                  {reflection.goalCheck && <p className="mt-1 text-[13px] text-gray-500">You will know when: {reflection.goalCheck}</p>}
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>

      <DocumentViewerSheet
        open={docOpen}
        url={week.recapDocumentUrl}
        title={`Week ${week.weekNumber} recap`}
        fileName={week.recapDocumentName}
        onClose={() => setDocOpen(false)}
      />
    </div>
  );
};

export default ParticipantWeekPage;
