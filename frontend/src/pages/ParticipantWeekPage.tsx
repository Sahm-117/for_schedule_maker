import React, { useEffect, useRef, useState } from 'react';
import Clarity from '@microsoft/clarity';
import { Navigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import SaveStatus, { type SaveState } from '../components/SaveStatus';
import { useToast } from '../components/Toast';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import { recapHasContent, reflectionEditable, reflectionFor } from '../utils/participantApp';
import Spinner from '../components/Spinner';
import ClassManualReader from '../components/classManual/ClassManualReader';
import { useManualContent } from '../components/classManual/manuals';

const MANUAL_QUESTION_STATUS_LABEL: Record<string, string> = {
  NEW: 'To be answered in class',
  IN_CLASS: 'To be answered in class',
  REPLIED: 'Replied',
};

// Private "My notes" box: autosaves 900ms after typing stops, same
// spinner/tick feedback as SaveStatus everywhere else in the app.
const ManualNoteBox: React.FC<{ weekId: number; initialBody: string | null; onSaved: (weekId: number, body: string) => void; bare?: boolean }> = ({ weekId, initialBody, onSaved, bare }) => {
  const [body, setBody] = useState(initialBody ?? '');
  const [saveState, setSaveState] = useState<SaveState | undefined>(undefined);
  const savedBody = useRef(initialBody ?? '');

  useEffect(() => {
    setBody(initialBody ?? '');
    savedBody.current = initialBody ?? '';
  }, [weekId, initialBody]);

  useEffect(() => {
    if (body === savedBody.current) return undefined;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      participantAppApi.saveManualNote(weekId, body)
        .then(() => {
          savedBody.current = body;
          onSaved(weekId, body);
          setSaveState('saved');
          Clarity.event('manual_note_saved');
          window.setTimeout(() => setSaveState((s) => (s === 'saved' ? undefined : s)), 2000);
        })
        .catch(() => setSaveState('error'));
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  return (
    <div className={bare ? '' : 'mt-4'}>
      <div className={`mb-1.5 flex items-center gap-2${bare && !saveState ? ' hidden' : ''}`}>
        {!bare && <span className="text-[13.5px] font-semibold text-gray-900">My notes</span>}
        <span className="ml-auto"><SaveStatus state={saveState} /></span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Private notes only you can see."
        className="w-full min-h-[88px] resize-y rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
};

// One week for a participant: the recap (once their support releases it) and
// their private three-question reflection. Matches the V2 design.

// Compact tap-to-open row: keeps the week page to one clear action (the
// manual) with everything else one tap away.
const DisclosureRow: React.FC<{ label: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ label, hint, open, onToggle, children }) => (
  <div className="border-t border-[#f0f0f2] first:border-t-0">
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[60px] w-full items-center gap-2 text-left">
      <span className="text-[16px] font-semibold text-gray-900">{label}</span>
      {hint && <span className="ml-auto text-[14px] text-gray-400">{hint}</span>}
      <svg className={`h-4 w-4 flex-none text-gray-300 transition-transform ${hint ? '' : 'ml-auto'} ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
      </svg>
    </button>
    {open && <div className="pb-5">{children}</div>}
  </div>
);

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]';
const SECONDARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98]';
const FIELD = 'w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

const LockNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-4 flex items-start justify-center gap-2 px-2 text-center text-[12.5px] leading-normal text-gray-400">
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
    </svg>
    <span>{children}</span>
  </div>
);

const ParticipantWeekPage: React.FC = () => {
  const { weekNumber: weekParam } = useParams();
  const { home, loading, applyReflection, applyManualQuestion, applyManualNote } = useParticipantApp();
  const toast = useToast();
  const [docOpen, setDocOpen] = useState(false);
  const [manualDocOpen, setManualDocOpen] = useState(false);
  const [manualReaderOpen, setManualReaderOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [stoodOut, setStoodOut] = useState('');
  const [goal, setGoal] = useState('');
  const [goalCheck, setGoalCheck] = useState('');
  const [goalError, setGoalError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [question, setQuestion] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState('');

  const week = home?.weeks.find((w) => w.weekNumber === Number(weekParam)) ?? null;
  const manualComic = useManualContent(week?.title);
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

  useEffect(() => {
    if (week?.manual) Clarity.event('manual_opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week?.id, !!week?.manual]);

  if (loading) return <PageLoader />;
  if (!home) return <Navigate to="/me" replace />;
  if (!week) return <Navigate to="/me" replace />;

  const askQuestion = async () => {
    if (!question.trim()) { setQuestionError('Write your question first.'); return; }
    setAskingQuestion(true);
    setQuestionError('');
    try {
      applyManualQuestion(week.id, await participantAppApi.askManualQuestion(week.id, question.trim(), week.weekNumber, home.participant.name));
      setQuestion('');
      Clarity.event('manual_question_sent');
      toast({ message: 'Question sent' });
    } catch (err) {
      setQuestionError(err instanceof Error ? err.message : 'Could not send your question.');
    } finally {
      setAskingQuestion(false);
    }
  };

  // Same form on the week page and at the end of the comic reader, so asking
  // a question never takes the participant out of the reader.
  const questionForm = (
    <>
      <textarea
        value={question}
        onChange={(e) => { setQuestion(e.target.value); setQuestionError(''); }}
        placeholder="Ask anything about this week's manual."
        rows={2}
        className="w-full resize-y rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {questionError && <p className="mt-1.5 text-xs font-medium text-red-700">{questionError}</p>}
      <button
        type="button"
        onClick={() => void askQuestion()}
        disabled={askingQuestion}
        className="mt-3 min-h-[44px] rounded-full bg-gray-900 px-5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {askingQuestion ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send question'}
      </button>

      {week.manualQuestions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {week.manualQuestions.map((q) => (
            <li key={q.id} className="rounded-2xl bg-[#f5f5f7] p-4">
              <p className="text-sm leading-relaxed text-gray-800">{q.body}</p>
              {q.status === 'REPLIED' && q.reply ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600"><span className="font-semibold text-gray-800">Reply: </span>{q.reply}</p>
              ) : (
                <p className="mt-1.5 text-[12.5px] font-semibold text-amber-700">{MANUAL_QUESTION_STATUS_LABEL[q.status]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

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

  // Before the recap is out, the class manual is what there is to read.
  const summary = (week.released ? week.recapSummary : week.manual?.summary)?.trim();
  const prompt = (week.released ? week.discussionPrompt : week.manual?.discussionPrompt)?.trim()
    || week.manual?.discussionPrompt?.trim();
  const canReadRecap = week.released && !!week.recapDocumentUrl;
  const canOpenManual = !!week.manual?.documentUrl;
  const openManual = () => {
    if (manualComic) { setManualReaderOpen(true); Clarity.event('manual_reader_opened'); }
    else { setManualDocOpen(true); Clarity.event('manual_pdf_opened'); }
  };
  const stateLabel = week.released ? 'Recap out' : week.shared ? 'Recap coming soon' : 'No recap this week';

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Week ${week.weekNumber}`} tourId="participant:week" back={{ label: 'Journey', fallbackTo: '/me/journey' }} />

      <div className="flex flex-col gap-6">
        {/* One card for the week: what it's about, one thing to think about,
            and the one or two things to open. */}
        <section data-wt="pw-recap" className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${week.released ? 'bg-emerald-500' : week.shared ? 'bg-amber-400' : 'bg-gray-300'}`} aria-hidden="true" />
            {stateLabel}
          </span>
          <h2 className="mt-2 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">{week.title || `Week ${week.weekNumber}`}</h2>

          {summary ? (
            <p className="mt-4 whitespace-pre-line text-[15.5px] leading-[1.7] text-gray-600">{summary}</p>
          ) : week.released && !recapHasContent(week) ? (
            <p className="mt-4 text-[15.5px] leading-[1.7] text-gray-500">No written recap this week. You can still write your reflection below.</p>
          ) : !week.released ? (
            <p className="mt-4 text-[15.5px] leading-[1.7] text-gray-500">
              {week.shared ? 'You will be notified as soon as the recap is out.' : 'There is no recap to read this week. See you on Sunday.'}
            </p>
          ) : null}

          {prompt && (
            <figure className="mt-5 rounded-2xl bg-[#f5f5f7] px-5 py-4">
              <figcaption className="text-[12px] font-semibold text-gray-400">Something to think about</figcaption>
              <blockquote className="mt-1 text-[16px] font-medium leading-[1.55] text-gray-900">{prompt}</blockquote>
            </figure>
          )}

          {(canReadRecap || canOpenManual) && (
            <div data-wt="pw-manual" className="mt-6">
              <div className="flex flex-col gap-2.5 sm:flex-row">
                {canReadRecap && <button type="button" onClick={() => setDocOpen(true)} className={PRIMARY}>Read the recap</button>}
                {canOpenManual && <button type="button" onClick={openManual} className={canReadRecap ? SECONDARY : PRIMARY}>Open the manual</button>}
              </div>
              {canOpenManual && manualComic && (
                <button
                  type="button"
                  onClick={() => { setManualDocOpen(true); Clarity.event('manual_pdf_opened'); }}
                  className="mt-3 w-full py-1 text-center text-[13.5px] font-medium text-gray-500 hover:text-gray-900"
                >
                  Prefer the plain PDF? Open the PDF instead
                </button>
              )}
            </div>
          )}
        </section>

        {week.released && (
          <section data-wt="pw-reflection" className={`${SURFACE} px-6 py-1.5 sm:px-8`}>
            <DisclosureRow label="Your reflection" hint={reflection ? 'Done ✓' : '3 short questions'} open={reflectionOpen} onToggle={() => setReflectionOpen((o) => !o)}>

              {editable ? (
                <>
                  <label className="block">
                    <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">1. What stood out to you?</span>
                    <textarea value={stoodOut} onChange={(e) => setStoodOut(e.target.value)} placeholder="Anything from the recap that stayed with you." className={`${FIELD} min-h-[88px] resize-y`} />
                  </label>
                  <label className="mt-5 block">
                    <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">2. What is one thing you will do this week because of it?</span>
                    <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setGoalError(false); }} placeholder="Pray with my sister on Wednesday evening." className={`${FIELD} min-h-[76px] resize-y`} />
                    {goalError && <span className="mt-[5px] block text-xs font-medium text-red-700">Write one thing you will do.</span>}
                  </label>
                  <label className="mt-5 block">
                    <span className="mb-[7px] block text-[14px] font-semibold text-gray-900">3. How will you know you did it?</span>
                    <input value={goalCheck} onChange={(e) => setGoalCheck(e.target.value)} placeholder="We prayed, even for five minutes." className={`${FIELD} min-h-[48px]`} />
                  </label>
                  {saveError && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{saveError}</p>}
                  <button type="button" onClick={() => { void save(); }} disabled={saving} className={`${PRIMARY} mt-6 w-full disabled:opacity-60`}>
                    {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : reflection ? 'Update reflection' : 'Save reflection'}
                  </button>
                  <LockNote>Your support sees that you reflected, never what you wrote. You can change it for a week after you first save it.</LockNote>
                </>
              ) : reflection ? (
                <div className="rounded-2xl bg-[#f5f5f7] p-4">
                  <p className="text-[12px] font-semibold text-gray-400">What stood out</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{reflection.stoodOut || '—'}</p>
                  <div className="my-4 h-px bg-[#e8e8ec]" />
                  <p className="text-[12px] font-semibold text-primary">Your goal</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-gray-900">{reflection.goal}</p>
                  {reflection.goalCheck && <p className="mt-1 text-[13.5px] text-gray-500">You will know when: {reflection.goalCheck}</p>}
                </div>
              ) : null}
            </DisclosureRow>
          </section>
        )}

        {week.manual && (
          <section className={`${SURFACE} px-6 py-1.5 sm:px-8`}>
            <DisclosureRow label="My notes" hint={week.manualNote?.trim() ? 'Saved' : undefined} open={notesOpen} onToggle={() => setNotesOpen((o) => !o)}>
              <ManualNoteBox weekId={week.id} initialBody={week.manualNote} onSaved={applyManualNote} bare />
            </DisclosureRow>
            <DisclosureRow
              label="Ask a question"
              hint={week.manualQuestions.length > 0 ? `${week.manualQuestions.length} sent` : undefined}
              open={questionOpen}
              onToggle={() => setQuestionOpen((o) => !o)}
            >
              {questionForm}
            </DisclosureRow>
          </section>
        )}
      </div>

      <DocumentViewerSheet
        open={docOpen}
        url={week.recapDocumentUrl}
        title={`Week ${week.weekNumber} recap`}
        fileName={week.recapDocumentName}
        onClose={() => setDocOpen(false)}
      />
      <DocumentViewerSheet
        open={manualDocOpen}
        url={week.manual?.documentUrl ?? null}
        title={`Week ${week.weekNumber} class manual`}
        fileName={week.manual?.documentName}
        onClose={() => setManualDocOpen(false)}
      />
      {manualReaderOpen && manualComic && (
        <ClassManualReader
          content={manualComic}
          onClose={() => setManualReaderOpen(false)}
          onOpenOriginalPdf={week.manual?.documentUrl ? () => { setManualReaderOpen(false); setManualDocOpen(true); } : undefined}
          renderEndCard={() => (
            <>
              <ManualNoteBox weekId={week.id} initialBody={week.manualNote} onSaved={applyManualNote} />
              <div className="mt-4">
                <p className="mb-1.5 text-[13.5px] font-semibold text-gray-900">Ask a question</p>
                {questionForm}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
};

export default ParticipantWeekPage;
