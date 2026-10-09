import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import LinkText from '../components/LinkText';
import PageLoader from '../components/PageLoader';
import FaithProjectGuide from '../components/FaithProjectGuide';
import FaithProjectHistory from '../components/faithProjects/FaithProjectHistory';
import SegmentedTabs from '../components/SegmentedTabs';
import TestimoniesTab from '../components/participantApp/TestimoniesTab';
import PrayerChoiceSheet from '../components/participantApp/PrayerChoiceSheet';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { shortMoment } from '../utils/participantApp';
import { buildWhatsAppLink } from '../utils/phone';
import { FAITH_HELP_REASON_LABELS } from '../types';
import type { FaithHelpReason, ParticipantFaith } from '../types';
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

// The participant's faith project: write it, save it, edit it any time. Their support is told on every
// save, and every version is kept in the edit history. Corporate prayer is opt-out, with a switch here.

// Same card, pill buttons and tap-to-open rows as the participant week page.
const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const FIELD = 'w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

const Chevron: React.FC<{ open?: boolean; className?: string }> = ({ open, className = '' }) => (
  <svg className={`h-4 w-4 flex-none text-gray-300 transition-transform ${open ? 'rotate-90' : ''} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
  </svg>
);

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [helpSheetOpen, setHelpSheetOpen] = useState(false);
  // The field stays closed until they ask for it: "Write your faith project" the first time, the pencil afterwards.
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (editing) fieldRef.current?.focus(); }, [editing]);
  // NULL until they have answered the pop-up; the subtle "Prayer on / off" chip appears once they have.
  const [consent, setConsent] = useState<'IN' | 'OUT' | null>(null);
  const [prayerSaving, setPrayerSaving] = useState(false);
  const prayerSavingRef = useRef(false);
  const [prayerSheetOpen, setPrayerSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    participantAppApi.getFaith()
      .then((data) => {
        if (cancelled) return;
        setFaith(data);
        setDraft(data.project?.body ?? '');
        setConsent(data.prayerConsent);
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your faith project.'); });
    return () => { cancelled = true; };
  }, []);

  // The pop-up answers the same question: follow the app's current answer so the chip never shows an old one.
  const knownConsent = home?.prayerConsent;
  useEffect(() => {
    // Not while a choice is being saved: a refresh must not flip the chip back to the old answer.
    if (knownConsent !== undefined && !prayerSavingRef.current) setConsent(knownConsent);
  }, [knownConsent]);

  const choosePrayer = async (include: boolean) => {
    if (prayerSavingRef.current) return;
    const previous = consent;
    setConsent(include ? 'IN' : 'OUT');
    prayerSavingRef.current = true;
    setPrayerSaving(true);
    try {
      await participantAppApi.setPrayerConsent(include);
      void reload();
    } catch (err) {
      setConsent(previous);
      toast({ message: err instanceof Error ? err.message : 'Could not save that. Please try again.', tone: 'error' });
    } finally {
      prayerSavingRef.current = false;
      setPrayerSaving(false);
    }
  };

  if (loadError) return <p className="py-16 text-center text-sm text-gray-500">{loadError}</p>;
  if (!faith) return <PageLoader />;

  const saved = faith.project?.status === 'SAVED';
  // Someone who switched sharing on before the pop-up existed is already in, so they get the chip (and a way out) too.
  const chipConsent: 'IN' | 'OUT' | null = consent ?? (faith.project?.sharedForPrayer ? 'IN' : null);
  const supportFirst = (home?.group?.supportName || 'your support').split(' ')[0];
  const deadline = faith.deadlineAt ? new Date(faith.deadlineAt) : null;
  const deadlineText = deadline && !Number.isNaN(deadline.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(deadline)
    : null;
  const late = !!deadline && deadline.getTime() < Date.now() && !saved;
  const startsOn = faith.prayersStartsOn ? new Date(`${faith.prayersStartsOn}T12:00:00`) : null;
  const startsText = startsOn && !Number.isNaN(startsOn.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(startsOn)
    : null;
  const supportLink = buildWhatsAppLink(home?.group?.supportPhone, `Hi ${supportFirst}, I have a question about my Faith Project.`);
  const trimmed = draft.trim();
  const hasText = !!faith.project?.body?.trim();
  const canSave = !!trimmed && (!saved || trimmed !== (faith.project?.body ?? '').trim());

  const save = async () => {
    if (!trimmed) { setError('Write your project before saving.'); return; }
    setSaving(true);
    setError('');
    try {
      await participantAppApi.saveFaithProject(draft, user?.name || '');
      const fresh = await participantAppApi.getFaith();
      setFaith(fresh);
      setDraft(fresh.project?.body ?? draft);
      setEditing(false);
      toast({ message: 'Saved' });
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your faith project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Faith Project"
        tourId="participant:faith"
        inlineAction={tab === 'project' && chipConsent ? (
          <button
            type="button"
            onClick={() => setPrayerSheetOpen(true)}
            aria-label={`Corporate prayers: ${chipConsent === 'OUT' ? 'off' : 'on'}. Change`}
            className="inline-flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-full bg-black/[0.05] px-3 text-[12px] font-semibold text-gray-600 transition active:scale-95"
          >
            <span className={`h-[7px] w-[7px] rounded-full ${chipConsent === 'OUT' ? 'bg-gray-400' : 'bg-emerald-500'}`} aria-hidden="true" />
            {chipConsent === 'OUT' ? 'Prayer off' : 'Prayer on'}
          </button>
        ) : undefined}
      />

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
        <section data-wt="pf-project" className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${saved ? 'bg-emerald-500' : 'bg-gray-300'}`} aria-hidden="true" />
            {saved && faith.project ? `Written · edited ${shortMoment(faith.project.updatedAt)}` : 'Not written yet'}
          </span>
          <h2 className="mt-2 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">Your faith project</h2>
          {deadlineText && <p className={`mt-2 text-[14px] font-medium ${late ? 'text-amber-700' : 'text-gray-500'}`}>{late ? `The date to write it by was ${deadlineText}. You can still save it any time.` : saved ? `Write it by ${deadlineText}. You can edit it any time.` : `Write it by ${deadlineText}.`}</p>}

          {editing ? (
            <>
              <label className="mt-5 block">
                <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">What are you believing God for?</span>
                <textarea
                  ref={fieldRef}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError(''); }}
                  placeholder="Be specific. Who, what, and by when."
                  className={`${FIELD} min-h-[120px] resize-y`}
                />
              </label>
              {error && <p className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
              <div className="mt-5 flex flex-col gap-2.5">
                <button type="button" onClick={() => { void save(); }} disabled={saving || !canSave} className={PRIMARY}>
                  {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                </button>
                {hasText && (
                  <button type="button" onClick={() => { setDraft(faith.project?.body ?? ''); setError(''); setEditing(false); }} disabled={saving} className="min-h-[44px] text-[14px] font-semibold text-gray-500">Cancel</button>
                )}
              </div>
            </>
          ) : hasText ? (
            <>
              {faith.project?.fromForm && (
                <p className="mt-4 text-[14px] leading-[1.6] text-gray-500">This is the SMART request you wrote on the registration form. Tap the pencil to shape it into your faith project, then save it.</p>
              )}
              <div className="mt-5">
                <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">What are you believing God for?</span>
                <div className="flex items-start gap-2 rounded-2xl bg-[#f5f5f7] py-3.5 pl-4 pr-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-[1.55] text-gray-900"><LinkText text={faith.project?.body ?? ''} /></p>
                  <button type="button" onClick={() => setEditing(true)} aria-label="Edit faith project" className="grid h-11 w-11 flex-none place-items-center rounded-full text-gray-500 transition hover:bg-white hover:text-gray-900 active:scale-95">
                    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-snug text-gray-500">Tap the pencil to edit any time.</p>
            </>
          ) : (
            <div className="mt-5">
              <button type="button" onClick={() => setEditing(true)} className={PRIMARY}>Write your faith project</button>
            </div>
          )}
          <FaithProjectGuide className="mt-2 flex w-full items-center justify-center gap-1.5 py-1 text-center text-[13.5px] font-medium text-gray-500 hover:text-gray-900" />
        </section>

        <section className={`${SURFACE} px-6 py-1.5 sm:px-8`}>
          <FaithProjectHistory versions={faith.history} participantLabel="You" />

          {saved && (
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

      {prayerSheetOpen && chipConsent && (
        <PrayerChoiceSheet consent={chipConsent} startsText={startsText} saving={prayerSaving} onChoose={(include) => { void choosePrayer(include); }} onClose={() => setPrayerSheetOpen(false)} />
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
