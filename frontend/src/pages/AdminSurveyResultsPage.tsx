import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import LinkText from '../components/LinkText';
import SegmentedTabs from '../components/SegmentedTabs';
import Spinner from '../components/Spinner';
import Glyph from '../components/Glyph';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { surveyApi } from '../services/api';
import type { SurveyQuestion, SurveyResults } from '../types';
import {
  AUDIENCE_LABEL, answerText, buildCsv, downloadFile, exportSurveyPdf, formatDay, safeFileName,
  summariseChoice, summariseNumber, summariseRating,
} from '../components/surveys/surveyUtils';

const CARD = 'surface-card p-5 sm:p-6';

const AdminSurveyResultsPage: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('surveys', 'edit');
  const { activeCohort } = useAppData();
  const toast = useToast();
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [summary, setSummary] = useState<{ text: string; at: string | null }>({ text: '', at: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('summary');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await surveyApi.adminResults(id, activeCohort?.id ?? null);
      setResults(data);
      setSummary({ text: data.survey.aiSummary ?? '', at: data.survey.aiSummaryAt });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the results.');
    } finally {
      setLoading(false);
    }
  }, [id, activeCohort?.id]);

  useEffect(() => { void load(); }, [load]);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || !results) return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error || 'Survey not found.'}</p>;

  const { survey, questions } = results;
  const rate = results.eligible ? Math.round((results.answered / results.eligible) * 100) : 0;

  const summarise = async () => {
    if (!id) return;
    setAiBusy(true);
    setAiError('');
    try {
      const res = await surveyApi.summarise(id, activeCohort?.id ?? null);
      setSummary({ text: res.summary, at: res.createdAt });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not write the summary.');
    } finally {
      setAiBusy(false);
    }
  };

  const exportCsv = () => {
    if (!results.visible) { toast({ message: 'Answers appear once at least five people have answered.', tone: 'info' }); return; }
    downloadFile(`${safeFileName(survey.title)}.csv`, `﻿${buildCsv(results)}`, 'text/csv;charset=utf-8');
  };
  const exportPdf = async () => {
    if (!results.visible) { toast({ message: 'Answers appear once at least five people have answered.', tone: 'info' }); return; }
    setPdfBusy(true);
    try { await exportSurveyPdf({ ...results, survey: { ...survey, aiSummary: summary.text || null } }, survey.scope === 'GENERAL' ? activeCohort?.name ?? null : null); }
    catch { toast({ message: 'Could not make the PDF.', tone: 'error' }); }
    finally { setPdfBusy(false); }
  };

  const renderQuestion = (q: SurveyQuestion, index: number) => {
    const header = <p className="text-[13px] font-semibold text-gray-900">{index + 1}. {q.prompt}</p>;
    if (q.kind === 'RATING') {
      const r = summariseRating(q, results);
      const max = Math.max(1, ...r.counts);
      return (
        <div key={q.id}>
          <p className="text-[13px] font-semibold text-gray-900">{index + 1}. {q.prompt} <span className="font-normal text-gray-500">Average {r.average.toFixed(1)} of {q.config.scale ?? 5}</span></p>
          <div className="mt-2 space-y-1.5">
            {r.counts.map((count, i) => {
              const n = i + 1;
              const label = n === 1 && q.config.lowLabel ? `1 ${q.config.lowLabel}` : n === r.counts.length && q.config.highLabel ? `${n} ${q.config.highLabel}` : String(n);
              return (
                <div key={n} className="flex items-center gap-3 text-sm">
                  <span className="w-28 flex-none truncate text-gray-600">{label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} /></span>
                  <span className="w-16 flex-none text-right text-gray-500">{count} · {r.total ? Math.round((count / r.total) * 100) : 0}%</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    if (q.kind === 'NUMBER') {
      const n = summariseNumber(q, results);
      return <div key={q.id}>{header}<p className="mt-1 text-sm text-gray-600">{n.total ? `Average ${n.average.toFixed(1)} · lowest ${n.min} · highest ${n.max} · ${n.total} answers` : 'No answers yet.'}</p></div>;
    }
    if (q.kind === 'YESNO' || q.kind === 'DEPARTMENT') {
      const tally = summariseChoice(q, results);
      const total = tally.reduce((sum, t) => sum + t.count, 0) || 1;
      return (
        <div key={q.id}>{header}
          <div className="mt-2 space-y-1.5">
            {tally.length === 0 && <p className="text-sm text-gray-500">No answers yet.</p>}
            {tally.map((t) => (
              <div key={t.label} className="flex items-center gap-3 text-sm">
                <span className="w-40 flex-none truncate text-gray-600">{t.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-primary" style={{ width: `${(t.count / total) * 100}%` }} /></span>
                <span className="w-10 flex-none text-right text-gray-500">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (q.kind === 'FILE') {
      const files = (results.answers ?? []).map((a) => (q.id ? a.answers[q.id] : undefined)).filter((v): v is { url: string; name?: string } => !!v && typeof v === 'object');
      return (
        <div key={q.id}>{header}
          {files.length === 0 ? <p className="mt-1 text-sm text-gray-500">No files yet.</p> : (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-center text-[11px] text-gray-600">
                  {/\.(png|jpe?g|gif|webp|heic)$/i.test(f.url) ? <img src={f.url} alt={f.name || 'Upload'} className="h-24 w-full object-cover" loading="lazy" /> : <span className="grid h-24 place-items-center px-2"><Glyph name="clip" className="h-6 w-6" /><span className="line-clamp-2">{f.name || 'File'}</span></span>}
                </a>
              ))}
            </div>
          )}
        </div>
      );
    }
    const texts = (results.answers ?? []).map((a) => answerText(q, q.id ? a.answers[q.id] : undefined)).filter(Boolean);
    return (
      <div key={q.id}>{header}
        {texts.length === 0 ? <p className="mt-1 text-sm text-gray-500">No answers yet.</p> : (
          <ul className="mt-2 space-y-2">{texts.map((t, i) => <li key={i} className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-700 whitespace-pre-line"><LinkText text={t} /></li>)}</ul>
        )}
      </div>
    );
  };

  const meta = `${survey.anonymous ? 'Anonymous · ' : ''}For ${AUDIENCE_LABEL[survey.audience]} · ${survey.scope === 'GENERAL' ? 'All cohorts' : 'This cohort'}${survey.closesAt ? ` · Closes ${formatDay(survey.closesAt)}` : ''}`;

  return (
    <div>
      <PageHeader
        back={{ label: 'Surveys', fallbackTo: '/surveys' }}
        title={survey.title}
        subtitle={meta}
        action={(
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} className="inline-flex h-11 items-center rounded-2xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Export CSV</button>
            <button type="button" onClick={() => void exportPdf()} disabled={pdfBusy} className="inline-flex h-11 items-center rounded-2xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60">{pdfBusy ? 'Making PDF…' : 'Export PDF'}</button>
          </div>
        )}
      />
      <SegmentedTabs tabs={[{ key: 'summary', label: 'Summary' }, { key: 'answers', label: 'All answers' }, { key: 'who', label: 'Who answered' }]} active={tab} onChange={setTab} className="mb-4 max-w-md" />

      {tab === 'summary' && (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className={CARD}>
            <p className="text-sm font-semibold text-gray-900">{results.answered} of {results.eligible} answered · {rate}%</p>
            {!results.visible ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">This survey is anonymous, so the answers appear once at least five people have answered. {results.answered} so far.</p>
            ) : questions.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">This survey has no questions.</p>
            ) : (
              <div className="mt-4 space-y-6">{questions.map(renderQuestion)}</div>
            )}
          </section>
          <section className={`${CARD} h-fit`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">AI summary</p>
              {canEdit && <button type="button" onClick={() => void summarise()} disabled={aiBusy || !results.visible || results.answered === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                {aiBusy ? (<><Spinner className="h-3.5 w-3.5" />Writing…</>) : (summary.text ? 'Refresh' : 'Summarise')}
              </button>}
            </div>
            {aiError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{aiError}</p>}
            {summary.text ? (
              <>
                <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-gray-600">{summary.text}</p>
                <p className="mt-3 text-[11.5px] text-gray-400">Written from the answers{summary.at ? `, ${formatDay(summary.at)}` : ''}. Check it before sharing.</p>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-gray-500">{canEdit ? 'Tap Summarise for the main themes in the answers.' : 'No summary yet.'}</p>
            )}
          </section>
        </div>
      )}

      {tab === 'answers' && (
        <section className={CARD}>
          {!results.visible ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Answers appear once at least five people have answered.</p>
          ) : (results.answers ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No answers yet.</p>
          ) : (
            <div className="space-y-4">
              {(results.answers ?? []).map((a, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 p-4">
                  {!survey.anonymous && <p className="text-sm font-semibold text-gray-900">{a.name}</p>}
                  <dl className="mt-1 space-y-1.5">
                    {questions.map((q) => {
                      const text = answerText(q, q.id ? a.answers[q.id] : undefined);
                      return text ? (<div key={q.id}><dt className="text-[12px] text-gray-500">{q.prompt}</dt><dd className="text-sm text-gray-800 whitespace-pre-line">{text}</dd></div>) : null;
                    })}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'who' && (
        <section className={CARD}>
          <p className="text-sm font-semibold text-gray-900">{results.answered} of {results.eligible} have answered</p>
          {survey.anonymous && <p className="mt-1 text-[12.5px] text-gray-500">You can see who has answered, not what they said.</p>}
          <ul className="mt-3 divide-y divide-gray-100">
            {results.people.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-800">{p.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${p.answered ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{p.answered ? 'Answered' : 'Not yet'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default AdminSurveyResultsPage;
