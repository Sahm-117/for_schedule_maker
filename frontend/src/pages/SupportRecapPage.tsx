import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import Spinner from '../components/Spinner';
import ClassManualReader from '../components/classManual/ClassManualReader';
import { manualContentForWeek } from '../components/classManual/manuals';
import type { ManualContent } from '../components/classManual/types';
import { useAppData } from '../context/AppDataContext';
import { supportRecapsApi, manualQuestionsApi } from '../services/api';
import type { ManualQuestion, SupportRecap } from '../types';
import { formatRecapReleaseAt } from '../utils/recapReleaseTimes';
import { currentWeekNumber } from '../utils/participantApp';

// Newest week first. Every week starts folded; tap to open. The current
// week is labelled. Before a week's support release time, the card just
// says when it arrives. Each week also carries its class manual (once
// released) and the questions participants asked about it.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

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
    <li className="rounded-[14px] bg-[#f9fafb] p-3.5">
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

// One tap-to-open block inside a week (Recap, Class manual, Questions), so an
// open week stays short until the support picks what they need.
const WeekPart: React.FC<{ label: string; badge?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ label, badge, open, onToggle, children }) => (
  <div className="border-t border-[#f1f2f5] px-5">
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[52px] w-full items-center gap-2 text-left">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">{label}</span>
      {badge}
      <svg className={`ml-auto h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
    {open && <div className="pb-5">{children}</div>}
  </div>
);

const SupportRecapPage: React.FC = () => {
  const { activeCohort } = useAppData();
  const [recaps, setRecaps] = useState<SupportRecap[]>([]);
  const [questions, setQuestions] = useState<ManualQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<{ url: string; title: string; fileName?: string | null } | null>(null);
  // Comic reader for weeks that have one; its "original PDF" button hands over to the doc viewer.
  const [reader, setReader] = useState<{ content: ManualContent; pdf: { url: string; title: string; fileName?: string | null } } | null>(null);
  const [openWeekIds, setOpenWeekIds] = useState<Set<number>>(new Set());
  const thisWeekNumber = currentWeekNumber(activeCohort?.startDate, new Date());
  const [openParts, setOpenParts] = useState<Set<string>>(new Set());
  const togglePart = (key: string) => setOpenParts((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleWeek = (weekId: number) => setOpenWeekIds((prev) => {
    const next = new Set(prev);
    if (next.has(weekId)) next.delete(weekId); else next.add(weekId);
    return next;
  });

  const load = () => {
    if (!activeCohort?.id) { setLoading(false); return; }
    setError('');
    Promise.all([
      supportRecapsApi.getForCohort(activeCohort.id),
      manualQuestionsApi.listForCohort(activeCohort.id),
    ])
      .then(([recapRes, questionRes]) => { setRecaps(recapRes.recaps); setQuestions(questionRes.questions); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load recaps.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCohort?.id]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="This week's recap" subtitle="What each class covered, for you to bring to your group." back={{ label: 'Home', fallbackTo: '/support' }} />

      {loading ? (
        <PageLoader />
      ) : error ? (
        <p className="py-16 text-center text-sm text-red-600">{error}</p>
      ) : recaps.length === 0 ? (
        <section className={`${CARD} px-[22px] py-[34px] text-center`}>
          <p className="text-[15px] font-bold text-gray-900">No recaps yet</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] leading-[1.55] text-gray-500">Once a class recap is added, it will show up here.</p>
        </section>
      ) : (
        <div className="flex flex-col gap-3.5">
          {recaps.map((week) => {
            const open = openWeekIds.has(week.weekId);
            const isThisWeek = week.weekNumber === thisWeekNumber;
            const weekQuestions = questions.filter((q) => q.weekId === week.weekId);
            return (
            <section key={week.weekId} data-wt="support-recap-week" className={`${CARD} overflow-hidden`}>
              <button type="button" onClick={() => toggleWeek(week.weekId)} aria-expanded={open} className={`flex w-full items-center gap-3 px-5 text-left ${open ? 'pt-5' : 'py-5'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Week {week.weekNumber}</span>
                    {isThisWeek && (
                      <span className="rounded-full bg-sky-100/80 px-[9px] py-[3px] text-[11px] font-bold text-sky-700">This week</span>
                    )}
                    {week.unreadQuestionCount > 0 && (
                      <span className="rounded-full bg-orange-100/80 px-[9px] py-[3px] text-[11px] font-bold text-orange-700">{week.unreadQuestionCount} new question{week.unreadQuestionCount === 1 ? '' : 's'}</span>
                    )}
                    <span className={`ml-auto rounded-full px-[9px] py-[3px] text-[11px] font-bold ${week.released ? 'bg-[#f2fbf5] text-[#15803d]' : 'bg-amber-100/80 text-amber-700'}`}>
                      {week.released ? 'Released' : 'Not out yet'}
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-bold tracking-[-0.01em] text-gray-900">{week.title || `Week ${week.weekNumber}`}</h2>
                </div>
                <svg className={`h-5 w-5 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {open && (
              <div className="mt-4">
              <WeekPart label="Recap" open={openParts.has(`${week.weekId}:recap`)} onToggle={() => togglePart(`${week.weekId}:recap`)}>
                {week.released ? (
                  <>
                    {week.recapSummary?.trim() && (
                      <p className="whitespace-pre-line text-[14.5px] leading-[1.65] text-gray-700">{week.recapSummary.trim()}</p>
                    )}
                    {week.discussionPrompt?.trim() && (
                      <div className="mt-3 rounded-[14px] border border-[#f1f2f5] p-3.5">
                        <p className="text-[13px] font-bold text-gray-900">Something to think about</p>
                        <p className="mt-1 text-sm leading-normal text-gray-700">{week.discussionPrompt.trim()}</p>
                      </div>
                    )}
                    {week.recapDocumentUrl && (
                      <button
                        type="button"
                        onClick={() => setDoc({ url: week.recapDocumentUrl as string, title: `Week ${week.weekNumber} recap`, fileName: week.recapDocumentName })}
                        className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white"
                      >
                        <svg className="h-[18px] w-[18px] flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.5A3.5 3.5 0 0 0 8.5 3H4v14h5a3 3 0 0 1 3 3m0-13.5A3.5 3.5 0 0 1 15.5 3H20v14h-5a3 3 0 0 0-3 3m0-13.5V20" />
                        </svg>
                        Read the full recap
                        <span aria-hidden="true">→</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[14.5px] leading-[1.65] text-gray-500">Arrives {formatRecapReleaseAt(week.releasedAt ? new Date(week.releasedAt) : null)}</p>
                )}
              </WeekPart>

              {week.manual && (
                <WeekPart label="Class manual" open={openParts.has(`${week.weekId}:manual`)} onToggle={() => togglePart(`${week.weekId}:manual`)}>
                  {week.manual.summary?.trim() && (
                    <p className="whitespace-pre-line text-[14.5px] leading-[1.65] text-gray-700">{week.manual.summary.trim()}</p>
                  )}
                  {week.manual.discussionPrompt?.trim() && (
                    <div className="mt-3 rounded-[14px] border border-[#f1f2f5] p-3.5">
                      <p className="text-[13px] font-bold text-gray-900">Something to think about</p>
                      <p className="mt-1 text-sm leading-normal text-gray-700">{week.manual.discussionPrompt.trim()}</p>
                    </div>
                  )}
                  {week.manual.documentUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        const pdf = { url: week.manual!.documentUrl as string, title: `Week ${week.weekNumber} class manual`, fileName: week.manual!.documentName };
                        const content = manualContentForWeek(week.title);
                        if (content) setReader({ content, pdf }); else setDoc(pdf);
                      }}
                      className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#3f4757] px-4 text-[14px] font-semibold text-white first:mt-0"
                    >
                      Open the manual
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </WeekPart>
              )}

              {weekQuestions.length > 0 && (
                <WeekPart
                  label="Questions"
                  badge={<span className="rounded-full bg-orange-100/80 px-[8px] py-[2px] text-[10.5px] font-bold text-orange-700">{weekQuestions.length}</span>}
                  open={openParts.has(`${week.weekId}:questions`)}
                  onToggle={() => togglePart(`${week.weekId}:questions`)}
                >
                  <ul className="space-y-2">
                    {weekQuestions.map((q) => <QuestionRow key={q.id} question={q} onChanged={load} />)}
                  </ul>
                </WeekPart>
              )}
              </div>
              )}
            </section>
            );
          })}
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
          onOpenOriginalPdf={() => { setDoc(reader.pdf); setReader(null); }}
        />
      )}
    </div>
  );
};

export default SupportRecapPage;
