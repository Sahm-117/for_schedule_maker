import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import LinkText from '../components/LinkText';
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

// Same card, pill buttons and tap-to-open rows as the participant week page.
const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const SECONDARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-60';
const FIELD = 'w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

const Chevron: React.FC<{ open?: boolean; className?: string }> = ({ open, className = '' }) => (
  <svg className={`h-4 w-4 flex-none text-gray-300 transition-transform ${open ? 'rotate-90' : ''} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
  </svg>
);

const DisclosureRow: React.FC<{ label: string; hint?: string; hintCls?: string; open: boolean; onToggle: () => void; wt?: string; children: React.ReactNode }> = ({ label, hint, hintCls, open, onToggle, wt, children }) => (
  <div data-wt={wt} className="border-t border-[#f0f0f2] first:border-t-0">
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[60px] w-full items-center gap-2 text-left">
      <span className="min-w-0 flex-1 text-[16px] font-semibold text-gray-900">{label}</span>
      {hint && <span className={`flex-none whitespace-nowrap text-[14px] ${hintCls ?? 'text-gray-400'}`}>{hint}</span>}
      <Chevron open={open} />
    </button>
    {open && <div className="pb-5">{children}</div>}
  </div>
);

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

const STATUS: Record<FaithProjectStatus, { label: string; dot: string; editable: boolean }> = {
  NOT_DRAFTED: { label: 'Start your project', dot: 'bg-gray-300', editable: true },
  AWAITING_DRAFT: { label: 'Changes requested', dot: 'bg-amber-400', editable: true },
  NEEDS_REFINEMENT: { label: 'With your support', dot: 'bg-orange-400', editable: false },
  UNDER_REFINEMENT: { label: 'With programme team', dot: 'bg-violet-500', editable: false },
  APPROVED: { label: 'Approved', dot: 'bg-emerald-500', editable: false },
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
      <div className="flex flex-col gap-6">
        {/* One card for the project itself: where it stands, what it says,
            and the one or two things to do next. */}
        <section data-wt="pf-project" className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
          <h2 className="mt-2 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">Your faith project</h2>
          {deadlineText && <p className={`mt-2 text-[14px] font-medium ${late ? 'text-amber-700' : 'text-gray-500'}`}>{late ? `Past the submission deadline: ${deadlineText}. You can still submit.` : `Submit by ${deadlineText}.`}</p>}

          {status.editable ? (
            <>
              {faith.project?.fromForm && draft === faith.project.body && (
                <p className="mt-4 text-[14px] leading-[1.6] text-gray-500">This is the SMART request you wrote on the registration form. It is saved as your draft. Shape it into your faith project, then submit it.</p>
              )}
              <label className="mt-5 block">
                <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">What are you believing God for?</span>
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError(''); }}
                  placeholder="Be specific. Who, what, and by when."
                  className={`${FIELD} min-h-[120px] resize-y`}
                />
              </label>
              {error && <p className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <button type="button" onClick={() => { void save(true); }} disabled={saving !== null} className={PRIMARY}>
                  {saving === 'submit' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Submit for review'}
                </button>
                <button type="button" onClick={() => { void save(false); }} disabled={saving !== null} className={SECONDARY}>
                  {saving === 'draft' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save draft'}
                </button>
              </div>
              <FaithProjectGuide className="mt-3 flex w-full items-center justify-center gap-1.5 py-1 text-center text-[13.5px] font-medium text-gray-500 hover:text-gray-900" />
            </>
          ) : (
            <>
              <figure className="mt-5 rounded-2xl bg-[#f5f5f7] px-5 py-4">
                <figcaption className="text-[12px] font-semibold text-gray-400">What you are believing God for</figcaption>
                <blockquote className="mt-1 whitespace-pre-wrap text-[16px] font-medium leading-[1.55] text-gray-900"><LinkText text={faith.project?.body || '—'} /></blockquote>
              </figure>
              {faith.project?.status !== 'APPROVED' && <p className="mt-3 text-[14px] leading-[1.6] text-gray-500">With {supportFirst} for now. Their replies show below.</p>}
              <div className="mt-6 flex">
                <FaithProjectGuide className={SECONDARY} />
              </div>
            </>
          )}
        </section>

        {/* Everything else, quietly, as tap-to-open rows. */}
        <section className={`${SURFACE} px-6 py-1.5 sm:px-8`}>
          <DisclosureRow
            wt="pf-thread"
            label="Support feedback"
            hint={home?.faithUnread && !trailOpen ? 'New reply' : replies === 0 ? 'None yet' : `${replies} ${replies === 1 ? 'reply' : 'replies'}`}
            hintCls={home?.faithUnread && !trailOpen ? 'font-semibold text-primary' : undefined}
            open={trailOpen}
            onToggle={() => setTrailOpen((open) => !open)}
          >
            {faith.trail.length === 0 ? (
              <p className="text-[14px] text-gray-500">No replies yet.</p>
            ) : (
              <ul className="space-y-2">
                {faith.trail.map((entry) => (
                  <li key={entry.id} className={`rounded-2xl p-4 ${entry.byParticipant ? 'bg-[#fff6ef]' : 'bg-[#f5f5f7]'}`}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13.5px] font-semibold text-gray-900">{entry.byParticipant ? 'You' : entry.authorName || 'Your support'}</span>
                      <span className="ml-auto text-[12px] text-gray-400">{shortMoment(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700"><LinkText text={entry.body} /></p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-start justify-center gap-2 px-2 text-center text-[12.5px] leading-normal text-gray-400">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" /></svg>
              <span>Notes between your support and the programme team are not shown here.</span>
            </div>
          </DisclosureRow>

          {faith.project?.status === 'APPROVED' && (
            <div className="flex min-h-[60px] items-center gap-3 border-t border-[#f0f0f2] py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold text-gray-900">Include in the general prayers</p>
                <p className="mt-0.5 text-[13px] leading-snug text-gray-500">Your name and project will be shown to the church team who pray together each week.</p>
              </div>
              <Switch on={prayerShare} onToggle={() => { void togglePrayerShare(); }} label="Include my Faith Project in the general prayers" disabled={prayerShareSaving} />
            </div>
          )}

          {faith.project?.status === 'APPROVED' && (
            faith.openHelpRequest ? (
              <div className="border-t border-[#f0f0f2] py-4">
                <p className="text-[16px] font-semibold text-gray-900">Is it going well?</p>
                <p className="mt-0.5 text-[13px] leading-snug text-gray-500">We&apos;ve let {supportFirst} know things aren&apos;t going well. They&apos;ll be in touch.</p>
              </div>
            ) : (
              <button type="button" onClick={() => setHelpSheetOpen(true)} className="flex min-h-[60px] w-full items-center gap-2 border-t border-[#f0f0f2] text-left">
                <span className="text-[16px] font-semibold text-gray-900">Is it going well?</span>
                <span className="ml-auto text-[14px] text-gray-400">Tell us if not</span>
                <Chevron />
              </button>
            )
          )}
        </section>

        <div className="-mt-2 flex justify-center">
          {supportLink
            ? <a href={supportLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-gray-500 hover:text-gray-900">Got questions? Reach out to your support <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 17 17 7m0 0H9m8 0v8" /></svg></a>
            : <button type="button" onClick={() => navigate('/me/group')} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-gray-500 hover:text-gray-900">Got questions? Find your support <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 17 17 7m0 0H9m8 0v8" /></svg></button>}
        </div>
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
