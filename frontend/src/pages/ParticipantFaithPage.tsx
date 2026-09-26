import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import FaithProjectGuide from '../components/FaithProjectGuide';
import SegmentedTabs from '../components/SegmentedTabs';
import TestimoniesTab from '../components/participantApp/TestimoniesTab';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { shortMoment } from '../utils/participantApp';
import { buildWhatsAppLink } from '../utils/phone';
import { FAITH_HELP_REASON_LABELS } from '../types';
import type { FaithHelpReason, FaithProjectStatus, ParticipantFaith } from '../types';
import Spinner from '../components/Spinner';

const REASON_OPTIONS = Object.entries(FAITH_HELP_REASON_LABELS) as Array<[FaithHelpReason, string]>;

// "Is it going well?" -- a quiet way to ask for help without waiting for a
// check-in. Same bottom-sheet shape as CheckInModal.
const NotGoingWellSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}> = ({ open, onClose, onSubmitted }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'reason' | 'done'>('reason');
  const [reason, setReason] = useState<FaithHelpReason | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<'contact' | 'save' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setStep('reason'); setReason(null); setNote(''); setError(''); }
  }, [open]);

  if (!open) return null;

  const submit = async (wantsContact: boolean) => {
    if (!reason) return;
    setSaving(wantsContact ? 'contact' : 'save');
    setError('');
    try {
      await participantAppApi.submitFaithHelpRequest({ reason, note: note.trim(), wantsContact }, user?.name || '');
      setStep('done');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="fh-title">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        {step === 'done' ? (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f2fbf5] text-[#15803d]" aria-hidden="true">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 13 4 4L19 7" /></svg>
            </span>
            <h2 id="fh-title" className="mt-3 text-lg font-bold text-gray-900">Thank you for telling us</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">We&apos;ve noted this. Your support has been told and will keep an eye out.</p>
            <button type="button" onClick={onClose} className="mt-5 min-h-[48px] w-full rounded-xl bg-primary px-4 text-[15px] font-semibold text-white">Close</button>
          </>
        ) : (
          <>
            <h2 id="fh-title" className="text-lg font-bold text-gray-900">It&apos;s not going well</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">That&apos;s okay. Tell us a bit more so we can help.</p>

            <p className="mt-4 text-[13px] font-semibold text-gray-900">What&apos;s going on?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASON_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReason(value)}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${reason === value ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-orange-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Anything else? (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Say a bit more if it helps"
                className="min-h-[90px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={() => { void submit(true); }} disabled={!reason || saving !== null} className="min-h-[48px] rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60">
                {saving === 'contact' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Ask my support to reach out'}
              </button>
              <button type="button" onClick={() => { void submit(false); }} disabled={!reason || saving !== null} className="min-h-[48px] rounded-xl border border-gray-200 bg-white px-4 text-[15px] font-semibold text-gray-700 disabled:opacity-60">
                {saving === 'save' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Just save it'}
              </button>
            </div>
            <button type="button" onClick={onClose} className="mt-1 block w-full py-2 text-center text-[13px] font-medium text-gray-400">Not now</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

// The participant's faith project: draft it, send it to their support, and read
// their support's replies. Notes between the support and the back office are
// never shown here. Matches the V2 design.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const Switch: React.FC<{ on: boolean; onToggle?: () => void; label: string; disabled?: boolean }> = ({ on, onToggle, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    disabled={disabled}
    className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition disabled:opacity-60 ${on ? 'bg-primary' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const STATUS: Record<FaithProjectStatus, { label: string; cls: string; editable: boolean }> = {
  NOT_DRAFTED: { label: 'Start your project', cls: 'bg-[#f6f7f9] text-gray-500', editable: true },
  AWAITING_DRAFT: { label: 'Changes requested', cls: 'bg-[#fef3c7] text-[#b45309]', editable: true },
  NEEDS_REFINEMENT: { label: 'With your support', cls: 'bg-[#fff1e6] text-[#c2410c]', editable: false },
  UNDER_REFINEMENT: { label: 'With programme team', cls: 'bg-[#ede9fe] text-[#6d28d9]', editable: false },
  APPROVED: { label: 'Approved', cls: 'bg-[#f2fbf5] text-[#15803d]', editable: false },
};

type FaithTab = 'project' | 'testimonies';

const ParticipantFaithPage: React.FC = () => {
  const { user } = useAuth();
  const { home, reload } = useParticipantApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<FaithTab>(searchParams.get('tab') === 'testimonies' ? 'testimonies' : 'project');
  const [faith, setFaith] = useState<ParticipantFaith | null>(null);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [trailOpen, setTrailOpen] = useState(false);
  const [helpSheetOpen, setHelpSheetOpen] = useState(false);
  const [prayerShare, setPrayerShare] = useState(false);
  const [prayerShareSaving, setPrayerShareSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    participantAppApi.getFaith()
      .then((data) => {
        if (cancelled) return;
        setFaith(data);
        setDraft(data.project?.body ?? '');
        setPrayerShare(!!data.project?.sharedForPrayer);
        // A new support reply deserves attention once; otherwise keep this compact.
        setTrailOpen(!!home?.faithUnread);
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your faith project.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePrayerShare = async () => {
    const next = !prayerShare;
    setPrayerShare(next);
    setPrayerShareSaving(true);
    try {
      await participantAppApi.setPrayerShare(next);
    } catch (err) {
      setPrayerShare(!next);
      toast({ message: err instanceof Error ? err.message : 'Could not save that. Please try again.', tone: 'error' });
    } finally {
      setPrayerShareSaving(false);
    }
  };

  useEffect(() => {
    if (!trailOpen || !home?.faithUnread) return;
    void participantAppApi.markFaithRead().then(() => reload()).catch(() => undefined);
  }, [trailOpen, home?.faithUnread, reload]);

  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;
  if (!faith) return <PageLoader />;

  const status = STATUS[faith.project?.status ?? 'NOT_DRAFTED'];
  const supportFirst = (home?.group?.supportName || 'your support').split(' ')[0];
  const deadline = faith.deadlineAt ? new Date(faith.deadlineAt) : null;
  const deadlineText = deadline && !Number.isNaN(deadline.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(deadline)
    : null;
  const late = !!deadline && deadline.getTime() < Date.now() && faith.project?.status !== 'APPROVED';
  const supportLink = buildWhatsAppLink(home?.group?.supportPhone, `Hi ${supportFirst}, I have a question about my Faith Project.`);

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
      <PageHeader title="Faith Project" tourId="participant:faith" />

      <div className="mb-3.5">
        <SegmentedTabs
          tabs={[
            { key: 'project', label: 'My Faith Project', shortLabel: 'Project' },
            { key: 'testimonies', label: 'Testimonies' },
          ]}
          active={tab}
          onChange={(key) => setTab(key as FaithTab)}
        />
      </div>

      {tab === 'testimonies' ? (
        <TestimoniesTab />
      ) : (
      <div className="flex flex-col gap-3.5">
        <FaithProjectGuide />

        <section data-wt="pf-project" className={CARD}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold text-gray-900">Your faith project</h2>
            </div>
            <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
          </div>

          {deadlineText && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${late ? 'bg-amber-50 text-amber-800' : 'bg-[#fff8f3] text-[#9a6a4b]'}`}>{late ? `Past the submission deadline: ${deadlineText}. You can still submit.` : `Submit by ${deadlineText}.`}</p>}
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
                  {saving === 'draft' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save draft'}
                </button>
                <button type="button" onClick={() => { void save(true); }} disabled={saving !== null} className="min-h-[46px] rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-60">
                  {saving === 'submit' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Submit for review'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 whitespace-pre-wrap rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800">{faith.project?.body || '—'}</div>
              <p className="mt-2.5 text-[12.5px] leading-[1.55] text-gray-500">
                {faith.project?.status === 'APPROVED' ? 'Approved' : `With ${supportFirst}`}
              </p>
            </>
          )}
        </section>

        {faith.project?.status === 'APPROVED' && (
          <section className="flex items-center justify-between gap-3 rounded-[16px] border border-[#eef0f4] bg-white px-4 py-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-900">Include my Faith Project in the general prayers</p>
              <p className="mt-0.5 text-[12.5px] text-gray-500">Your name and project will be shown to the church team who pray together each week.</p>
            </div>
            <Switch on={prayerShare} onToggle={() => { void togglePrayerShare(); }} label="Include my Faith Project in the general prayers" disabled={prayerShareSaving} />
          </section>
        )}

        {faith.project?.status === 'APPROVED' && (
          faith.openHelpRequest ? (
            <div className="rounded-[16px] bg-[#f6f7f9] px-4 py-3 text-[13px] leading-relaxed text-gray-600">
              We&apos;ve let {supportFirst} know things aren&apos;t going well. They&apos;ll be in touch.
            </div>
          ) : (
            <section className="flex items-center justify-between gap-3 rounded-[16px] border border-[#eef0f4] bg-white px-4 py-3.5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-gray-900">Is it going well?</p>
                <p className="mt-0.5 text-[12.5px] text-gray-500">Tell us if your faith project isn&apos;t going the way you hoped.</p>
              </div>
              <button type="button" onClick={() => setHelpSheetOpen(true)} className="flex-none rounded-xl border border-[#ffdeca] bg-[#fff8f3] px-3.5 py-2.5 text-[13px] font-semibold text-[#c2410c]">
                It&apos;s not going well
              </button>
            </section>
          )
        )}

        <div className="px-1 text-xs">
          {supportLink ? <a href={supportLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#c2410c]">Got questions? Reach out to your support <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 17 17 7m0 0H9m8 0v8" /></svg></a> : <button type="button" onClick={() => navigate('/me/group')} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#c2410c]">Got questions? Find your support <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 17 17 7m0 0H9m8 0v8" /></svg></button>}
        </div>
        <section data-wt="pf-thread" className={CARD}>
          <button type="button" onClick={() => setTrailOpen((open) => !open)} className="flex w-full items-center gap-2.5 text-left" aria-expanded={trailOpen}>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-gray-900">Feedback from your support</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">{replies === 0 ? 'No replies yet' : `${replies} ${replies === 1 ? 'reply' : 'replies'}`}</p>
            </div>
            <span className={`inline-flex h-8 w-8 flex-none items-center justify-center text-gray-500 transition-transform ${trailOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
            </span>
          </button>
          {trailOpen && (
            <>
              {faith.trail.length === 0 ? (
                <p className="mt-3 text-[13px] text-gray-500">No replies yet.</p>
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
      )}

      <NotGoingWellSheet
        open={helpSheetOpen}
        onClose={() => setHelpSheetOpen(false)}
        onSubmitted={() => {
          void participantAppApi.getFaith().then(setFaith).catch(() => undefined);
          void reload();
        }}
      />
    </div>
  );
};

export default ParticipantFaithPage;
