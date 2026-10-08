import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import LinkText from '../components/LinkText';
import PageLoader from '../components/PageLoader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import Spinner from '../components/Spinner';
import ClassManualReader from '../components/classManual/ClassManualReader';
import { hasManualForWeek, loadManualForWeek } from '../components/classManual/manuals';
import type { ManualContent } from '../components/classManual/types';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { useTeenSupportIds } from '../hooks/useTeenSupportIds';
import { supportRecapsApi, manualQuestionsApi, participantPushApi } from '../services/api';
import type { ManualQuestion, SupportRecap } from '../types';
import { formatRecapReleaseAt } from '../utils/recapReleaseTimes';
import { classDateIso, lagosTodayIso, nextClassWeek, weekDayDate, type ClassWeek } from '../utils/participantApp';

// One big card for this week (or the newest week before the cohort starts),
// then every other week as a quiet list that opens in place. Each week shows
// one short summary, one thing to think about, and one or two clear actions.
// Participants' questions sit under the week they were asked about.

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]';
const SECONDARY = 'flex h-[52px] w-full sm:flex-1 items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98]';

const Chevron: React.FC<{ open?: boolean; className?: string }> = ({ open, className = '' }) => (
  <svg className={`h-4 w-4 flex-none text-gray-300 transition-transform duration-200 ${open ? 'rotate-90' : ''} ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
  </svg>
);

// The Intro Class guide is open to everyone before the course starts (participants
// read it in their Get ready list), so supports can read it from day one too.
const hasIntroGuide = (week: SupportRecap) => week.weekNumber === 1 && hasManualForWeek(week.title);

// A week opens once its manual is out (on its drop day, or earlier if an admin
// sends it ahead). Until then it shows when the manual arrives.
const isWeekOpen = (week: SupportRecap, teen = false) =>
  week.manualReleased || week.released || hasIntroGuide(week) || (teen && !!week.hasTeenRecap && !!week.teenRecapReleased);

// "Manual arrives …" / "Manual out · Recap arrives …" / "Recap out" — a dot and a few words.
const WeekState: React.FC<{ week: SupportRecap; teen?: boolean }> = ({ week, teen = false }) => {
  const at = (iso: string | null) => formatRecapReleaseAt(iso ? new Date(iso) : null);
  if (!isWeekOpen(week, teen)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400">
        <svg className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        {`Manual arrives ${at(week.manualReleasedAt)}`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
      <span className={`h-1.5 w-1.5 rounded-full ${week.released ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-hidden="true" />
      {week.released ? 'Recap out' : `Manual out · Recap arrives ${at(week.releasedAt)}`}
    </span>
  );
};

// "Sun 11 Oct" for a week's Sunday class.
const classDateLabel = (startDate: string | null | undefined, week: ClassWeek) => (
  startDate ? weekDayDate(startDate, week, 0).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null
);

const QuestionRow: React.FC<{ question: ManualQuestion; onChanged: () => void }> = ({ question, onChanged }) => {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const markInClass = async () => {
    setBusy(true);
    setError('');
    try {
      await manualQuestionsApi.markInClass(question.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this question.');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await manualQuestionsApi.reply(question.id, reply.trim());
      // Tell the participant (push + their bell); opens that week's page.
      const asked = question.body.length > 80 ? `${question.body.slice(0, 77).trimEnd()}…` : question.body;
      void participantPushApi.notify([question.participantId], 'Your support replied', `Week ${question.weekNumber}: ${asked}`, `/me/week/${question.weekNumber}`);
      setReplying(false);
      setReply('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your reply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl bg-[#f5f5f7] p-4">
      <p className="text-[13px] font-semibold text-gray-900">{question.participantName}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-700">{question.body}</p>
      {question.status === 'REPLIED' && question.reply ? (
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600"><span className="font-semibold text-gray-800">Reply: </span>{question.reply}</p>
      ) : (
        <>
          {replying ? (
            <div className="mt-2.5">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a short reply" className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void sendReply()} disabled={busy || !reply.trim()} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3 w-3" />Sending…</span>) : 'Send reply'}
                </button>
                <button type="button" onClick={() => { setReplying(false); setReply(''); }} className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-semibold text-gray-600">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void markInClass()} disabled={busy} className="rounded-full bg-amber-100/80 px-3 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-50">
                {question.status === 'IN_CLASS' ? 'To be answered in class ✓' : 'To be answered in class'}
              </button>
              <button type="button" onClick={() => setReplying(true)} disabled={busy} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50">Reply</button>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </li>
  );
};

// A Teen Support's own recap for their teens: written and/or a document, held until its release
// time. When nothing is uploaded they can use the adult recap instead.
const TeenRecapSection: React.FC<{ week: SupportRecap; onReadDocument: (url: string, name: string | null) => void; onReadAdult: () => void }> = ({ week, onReadDocument, onReadAdult }) => {
  const [useAdult, setUseAdult] = useState(false);
  const teen = week.teenRecap;
  const adultSummary = week.recapSummary?.trim();
  const adultPrompt = week.discussionPrompt?.trim();
  const adultReady = week.released && !!(week.recapDocumentUrl || adultSummary);
  const status = teen
    ? null
    : week.hasTeenRecap
    ? `Arrives ${formatRecapReleaseAt(week.teenRecapReleaseAt ? new Date(week.teenRecapReleaseAt) : null)}`
    : 'Not uploaded yet';
  return (
    <div className="mt-5 rounded-2xl border border-pink-100 bg-pink-50/40 px-5 py-4" data-wt="teen-recap">
      <p className="text-[12px] font-bold uppercase tracking-wide text-pink-700">For your teens</p>
      {teen ? (
        <>
          {teen.summary?.trim() && <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.7] text-gray-700"><LinkText text={teen.summary.trim()} /></p>}
          {teen.discussionPrompt?.trim() && (
            <figure className="mt-3 rounded-2xl bg-white px-4 py-3">
              <figcaption className="text-[12px] font-semibold text-gray-400">Something for the teens to think about</figcaption>
              <blockquote className="mt-1 text-[15px] font-medium leading-[1.55] text-gray-900">{teen.discussionPrompt.trim()}</blockquote>
            </figure>
          )}
          {teen.documentUrl && (
            <button type="button" onClick={() => onReadDocument(teen.documentUrl!, teen.documentName)} className={`${PRIMARY} mt-3`}>Read the teen recap</button>
          )}
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[14px] font-medium text-gray-600">{status}</p>
          {adultReady && !useAdult && (
            <button type="button" onClick={() => setUseAdult(true)} className={`${SECONDARY} mt-3`}>Use the adult recap</button>
          )}
          {useAdult && (
            <div className="mt-3">
              {adultSummary && <p className="whitespace-pre-line text-[15px] leading-[1.7] text-gray-700"><LinkText text={adultSummary} /></p>}
              {adultPrompt && <p className="mt-2 text-[15px] font-medium text-gray-900">{adultPrompt}</p>}
              {week.recapDocumentUrl && <button type="button" onClick={onReadAdult} className={`${SECONDARY} mt-3`}>Read the adult recap</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// The inside of a week: summary, one prompt, the actions, then questions.
const WeekBody: React.FC<{
  week: SupportRecap;
  questions: ManualQuestion[];
  onReadRecap: () => void;
  onOpenManual: () => void;
  onQuestionsChanged: () => void;
  teen?: boolean;
  onReadTeenDocument?: (url: string, name: string | null) => void;
}> = ({ week, questions, onReadRecap, onOpenManual, onQuestionsChanged, teen = false, onReadTeenDocument }) => {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  // Before the recap is out, the class manual is what there is to read.
  const summary = (week.released ? week.recapSummary : week.manual?.summary)?.trim();
  const prompt = (week.released ? week.discussionPrompt : week.manual?.discussionPrompt)?.trim()
    || week.manual?.discussionPrompt?.trim();
  const canReadRecap = week.released && !!week.recapDocumentUrl;
  const canOpenManual = !!week.manual?.documentUrl || hasIntroGuide(week);
  return (
    <>
      {summary && <p className="whitespace-pre-line text-[15px] leading-[1.7] text-gray-600"><LinkText text={summary} /></p>}
      {prompt && (
        <figure className="mt-5 rounded-2xl bg-[#f5f5f7] px-5 py-4">
          <figcaption className="text-[12px] font-semibold text-gray-400">Something to think about</figcaption>
          <blockquote className="mt-1 text-[15.5px] font-medium leading-[1.55] text-gray-900">{prompt}</blockquote>
        </figure>
      )}
      {(canReadRecap || canOpenManual) && (
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          {canOpenManual && <button type="button" onClick={onOpenManual} className={PRIMARY}>Open the manual</button>}
          {canReadRecap && <button type="button" onClick={onReadRecap} className={canOpenManual ? SECONDARY : PRIMARY}>Read the recap</button>}
        </div>
      )}
      {teen && onReadTeenDocument && <TeenRecapSection week={week} onReadDocument={onReadTeenDocument} onReadAdult={onReadRecap} />}
      {questions.length > 0 && (
        <div className="mt-5 border-t border-[#f0f0f2] pt-1">
          <button type="button" onClick={() => setQuestionsOpen((o) => !o)} aria-expanded={questionsOpen} className="flex min-h-[52px] w-full items-center gap-2 text-left">
            <span className="min-w-0 text-[15px] font-semibold text-gray-900">Questions from participants</span>
            {week.unreadQuestionCount > 0 && (
              <span className="flex-none whitespace-nowrap rounded-full bg-orange-100/80 px-2 py-0.5 text-[12px] font-bold text-orange-700">{week.unreadQuestionCount} new</span>
            )}
            <span className="ml-auto text-[14px] tabular-nums text-gray-400">{questions.length}</span>
            <Chevron open={questionsOpen} />
          </button>
          {questionsOpen && (
            <ul className="space-y-2 pb-1">
              {questions.map((q) => <QuestionRow key={q.id} question={q} onChanged={onQuestionsChanged} />)}
            </ul>
          )}
        </div>
      )}
    </>
  );
};

const SupportRecapPage: React.FC = () => {
  const { activeCohort, weeks } = useAppData();
  const { user } = useAuth();
  const { ids: teenSupportIds } = useTeenSupportIds(true);
  const isTeenSupport = !!user && !!teenSupportIds?.has(user.id);
  // Every week of the cohort (the list below only has weeks with content), to find the next class.
  const cohortWeeks = useMemo(() => weeks.filter((week) => week.cohortId === activeCohort?.id), [weeks, activeCohort?.id]);
  const [recaps, setRecaps] = useState<SupportRecap[]>([]);
  const [questions, setQuestions] = useState<ManualQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<{ url: string; title: string; fileName?: string | null } | null>(null);
  // Comic reader for weeks that have one; its "original PDF" button hands over to the doc viewer.
  const [reader, setReader] = useState<{ content: ManualContent; pdf: { url: string; title: string; fileName?: string | null } | null } | null>(null);
  const [openWeekId, setOpenWeekId] = useState<number | null>(null);

  const load = () => {
    if (!activeCohort?.id) { setLoading(false); return; }
    setError('');
    Promise.all([
      supportRecapsApi.getForCohort(activeCohort.id),
      manualQuestionsApi.listForCohort(activeCohort.id),
    ])
      .then(([recapRes, questionRes]) => { setRecaps(recapRes.recaps); setQuestions(questionRes.questions); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load classes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCohort?.id]);

  const readRecap = (week: SupportRecap) => {
    if (week.recapDocumentUrl) setDoc({ url: week.recapDocumentUrl, title: `Week ${week.weekNumber} recap`, fileName: week.recapDocumentName });
  };
  const openManual = (week: SupportRecap) => {
    const pdf = week.manual?.documentUrl
      ? { url: week.manual.documentUrl, title: `Week ${week.weekNumber} class manual`, fileName: week.manual.documentName }
      : null;
    if (!pdf && !hasIntroGuide(week)) return;
    loadManualForWeek(week.title)
      .then((content) => { if (content) setReader({ content, pdf }); else if (pdf) setDoc(pdf); })
      .catch(() => { if (pdf) setDoc(pdf); });
  };
  const bodyFor = (week: SupportRecap) => (
    <WeekBody
      week={week}
      questions={questions.filter((q) => q.weekId === week.weekId)}
      onReadRecap={() => readRecap(week)}
      onOpenManual={() => openManual(week)}
      onQuestionsChanged={load}
      teen={isTeenSupport}
      onReadTeenDocument={(url, name) => setDoc({ url, title: `Week ${week.weekNumber} teen recap`, fileName: name })}
    />
  );

  // The big card is the next class: Week 1 before the cohort starts, today's
  // class on a Sunday, otherwise the coming Sunday's. After the last class it
  // stays on the final week.
  const now = new Date();
  const nextWeek = nextClassWeek<ClassWeek>(activeCohort?.startDate, cohortWeeks.length ? cohortWeeks : recaps, now);
  const nextClassNumber = nextWeek ? nextWeek.weekNumber : Infinity;
  const lastWeek = recaps.reduce<SupportRecap | null>((last, w) => (!last || w.weekNumber > last.weekNumber ? w : last), null);
  const featured = recaps.find((w) => w.weekNumber === nextClassNumber)
    ?? (lastWeek && nextClassNumber > lastWeek.weekNumber ? lastWeek : null)
    ?? recaps[0] ?? null;
  // Classes run in order: ones already held above the big card, the rest below.
  const byNumber = [...recaps].sort((a, b) => a.weekNumber - b.weekNumber);
  const pastWeeks = featured ? byNumber.filter((w) => w.weekNumber < featured.weekNumber) : [];
  const upcomingWeeks = featured ? byNumber.filter((w) => w.weekNumber > featured.weekNumber) : [];
  const featuredIsNext = featured?.weekNumber === nextClassNumber;
  const featuredIsToday = featuredIsNext && !!nextWeek && !!activeCohort?.startDate
    && classDateIso(activeCohort.startDate, nextWeek) === lagosTodayIso(now);
  const featuredDate = featured ? classDateLabel(activeCohort?.startDate, featured) : null;

  const weekList = (title: string, weeks: SupportRecap[]) => weeks.length > 0 && (
    <section>
      <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-gray-500">{title}</h3>
      <ul className={`${SURFACE} divide-y divide-[#f0f0f2] overflow-hidden`}>
        {weeks.map((week) => {
          const available = isWeekOpen(week, isTeenSupport);
          const open = available && openWeekId === week.weekId;
          return (
            <li key={week.weekId}>
              <button type="button" onClick={() => setOpenWeekId(open ? null : week.weekId)} disabled={!available} aria-expanded={available ? open : undefined} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${available ? 'hover:bg-[#fafafa]' : 'cursor-default'}`}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[#f2f2f4] text-[15px] font-bold tabular-nums text-gray-900">{week.weekNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[16px] font-semibold ${available ? 'text-gray-900' : 'text-gray-400'}`}>{week.title || `Week ${week.weekNumber}`}</span>
                  <WeekState week={week} teen={isTeenSupport} />
                </span>
                {week.unreadQuestionCount > 0 && (
                  <span className="flex-none whitespace-nowrap rounded-full bg-orange-100/80 px-2 py-0.5 text-[12px] font-bold text-orange-700">{week.unreadQuestionCount} new</span>
                )}
                {available && <Chevron open={open} />}
              </button>
              {open && <div className="px-5 pb-6 pt-1">{bodyFor(week)}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="max-w-2xl">
      <PageHeader title="Classes" subtitle="The manual before each class, the recap after." back={{ label: 'Home', fallbackTo: '/support' }} />

      {loading ? (
        <PageLoader />
      ) : error ? (
        <p className="py-16 text-center text-sm text-red-600">{error}</p>
      ) : !featured ? (
        <section className={`${SURFACE} px-8 py-14 text-center`}>
          <p className="text-[19px] font-semibold tracking-[-0.01em] text-gray-900">No classes yet</p>
          <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-[1.55] text-gray-500">When a class is added, it will be here.</p>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          {weekList('Past classes', pastWeeks)}
          <section data-wt="support-recap-week" className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
            <p className="text-[13px] font-semibold text-primary">
              {featuredIsToday ? 'Today' : featuredIsNext ? 'Next class' : 'Last class'} · Week {featured.weekNumber}{featuredDate ? ` · ${featuredDate}` : ''}
            </p>
            <h2 className="mt-1.5 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900 sm:text-[36px]">{featured.title || `Week ${featured.weekNumber}`}</h2>
            <div className={isWeekOpen(featured, isTeenSupport) ? 'mb-5 mt-3' : 'mt-3'}><WeekState week={featured} teen={isTeenSupport} /></div>
            {isWeekOpen(featured, isTeenSupport) && bodyFor(featured)}
          </section>

          {weekList('Coming up', upcomingWeeks)}
        </div>
      )}

      <DocumentViewerSheet
        open={!!doc}
        url={doc?.url ?? null}
        title={doc?.title ?? ''}
        fileName={doc?.fileName}
        onClose={() => setDoc(null)}
      />
      {reader && (
        <ClassManualReader
          content={reader.content}
          onClose={() => setReader(null)}
          onOpenOriginalPdf={reader.pdf ? () => { if (reader.pdf) setDoc(reader.pdf); setReader(null); } : undefined}
        />
      )}
    </div>
  );
};

export default SupportRecapPage;
