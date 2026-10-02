import type { SurveyAnswerValue, SurveyQuestion, SurveyQuestionKind, SurveyResults, SurveyState } from '../../types';

export const KIND_LABEL: Record<SurveyQuestionKind, string> = {
  TEXT: 'Text',
  TEXTAREA: 'Text area',
  NUMBER: 'Number',
  RATING: 'Rating',
  FILE: 'Image or file',
  DEPARTMENT: 'Department',
  YESNO: 'Yes / No',
};

// What an admin can add to a survey (Department and Yes / No exist for the built-in wrap-up).
export const ADDABLE_KINDS: SurveyQuestionKind[] = ['TEXT', 'TEXTAREA', 'NUMBER', 'RATING', 'FILE'];

export const STATE_LABEL: Record<SurveyState, string> = {
  DRAFT: 'Draft',
  OFF: 'Off',
  SCHEDULED: 'Scheduled',
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const STATE_TONE: Record<SurveyState, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  OFF: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-amber-50 text-amber-700',
  OPEN: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export const AUDIENCE_LABEL = { PARTICIPANTS: 'participants', SUPPORTS: 'supports', EVERYONE: 'everyone' } as const;

export const emptyQuestion = (kind: SurveyQuestionKind): SurveyQuestion => ({
  kind,
  prompt: '',
  required: true,
  config: kind === 'RATING' ? { scale: 5, lowLabel: '', highLabel: '' } : {},
});

const LAGOS = 'Africa/Lagos';

export const formatDay = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: LAGOS }) : '';

// A yyyy-mm-dd date in Lagos time → the instant it starts (or ends) there. Lagos has no daylight saving.
export const lagosStart = (day: string): string => new Date(`${day}T00:00:00+01:00`).toISOString();
export const lagosEnd = (day: string): string => new Date(`${day}T23:59:59+01:00`).toISOString();
export const toLagosDay = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: LAGOS }) : '';

export const answerText = (q: SurveyQuestion, value: SurveyAnswerValue): string => {
  if (value === undefined || value === null || value === '') return '';
  if (q.kind === 'FILE' && typeof value === 'object') return value.url;
  return String(value);
};

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildCsv = (results: SurveyResults): string => {
  const named = !results.survey.anonymous;
  const header = [...(named ? ['Name', 'Submitted'] : []), ...results.questions.map((q) => q.prompt)];
  const rows = (results.answers ?? []).map((a) => [
    ...(named ? [a.name ?? '', a.submittedAt ? new Date(a.submittedAt).toLocaleString('en-GB', { timeZone: LAGOS }) : ''] : []),
    ...results.questions.map((q) => answerText(q, q.id ? a.answers[q.id] : undefined)),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
};

export const downloadFile = (filename: string, content: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const safeFileName = (title: string) => title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'survey';

export interface RatingSummary { average: number; counts: number[]; total: number }

export const summariseRating = (q: SurveyQuestion, results: SurveyResults): RatingSummary => {
  const scale = q.config.scale ?? 5;
  const counts = Array.from({ length: scale }, () => 0);
  let sum = 0;
  let total = 0;
  for (const a of results.answers ?? []) {
    const v = Number(q.id ? a.answers[q.id] : undefined);
    if (!Number.isFinite(v) || v < 1 || v > scale) continue;
    counts[v - 1] += 1;
    sum += v;
    total += 1;
  }
  return { average: total ? sum / total : 0, counts, total };
};

export const summariseNumber = (q: SurveyQuestion, results: SurveyResults): { average: number; min: number; max: number; total: number } => {
  const nums = (results.answers ?? []).map((a) => Number(q.id ? a.answers[q.id] : undefined)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { average: 0, min: 0, max: 0, total: 0 };
  return { average: nums.reduce((x, y) => x + y, 0) / nums.length, min: Math.min(...nums), max: Math.max(...nums), total: nums.length };
};

export const summariseChoice = (q: SurveyQuestion, results: SurveyResults): Array<{ label: string; count: number }> => {
  const tally = new Map<string, number>();
  for (const a of results.answers ?? []) {
    const v = answerText(q, q.id ? a.answers[q.id] : undefined);
    if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally.entries()].map(([label, count]) => ({ label, count })).sort((x, y) => y.count - x.count);
};

export const exportSurveyPdf = async (results: SurveyResults, cohortName: string | null) => {
  const { default: JsPdf } = await import('jspdf');
  const pdf = new JsPdf({ unit: 'pt', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = width - margin * 2;
  let y = margin;

  const line = (text: string, size: number, bold = false, gap = 6, color: [number, number, number] = [31, 41, 55]) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    for (const part of pdf.splitTextToSize(text, maxWidth) as string[]) {
      if (y > height - margin) { pdf.addPage(); y = margin; }
      pdf.text(part, margin, y);
      y += size * 1.35;
    }
    y += gap;
  };

  line(results.survey.title, 20, true, 4);
  line(`${results.survey.anonymous ? 'Anonymous · ' : ''}${cohortName ? `${cohortName} · ` : ''}${results.answered} of ${results.eligible} answered`, 10, false, 14, [107, 114, 128]);

  if (results.survey.aiSummary) {
    line('Summary', 13, true, 2);
    line(results.survey.aiSummary, 10, false, 14);
  }

  results.questions.forEach((q, i) => {
    line(`${i + 1}. ${q.prompt}`, 12, true, 3);
    if (q.kind === 'RATING') {
      const r = summariseRating(q, results);
      line(`Average ${r.average.toFixed(1)} out of ${q.config.scale ?? 5} (${r.total} answers)`, 10, false, 2);
      line(r.counts.map((c, idx) => `${idx + 1}: ${c}`).join('   '), 10, false, 10, [107, 114, 128]);
    } else if (q.kind === 'NUMBER') {
      const n = summariseNumber(q, results);
      line(`Average ${n.average.toFixed(1)} · lowest ${n.min} · highest ${n.max} (${n.total} answers)`, 10, false, 10);
    } else if (q.kind === 'YESNO' || q.kind === 'DEPARTMENT') {
      line(summariseChoice(q, results).map((c) => `${c.label}: ${c.count}`).join('   ') || 'No answers', 10, false, 10);
    } else {
      const texts = (results.answers ?? []).map((a) => answerText(q, q.id ? a.answers[q.id] : undefined)).filter(Boolean);
      if (texts.length === 0) line('No answers', 10, false, 10, [107, 114, 128]);
      texts.forEach((t) => line(`• ${t}`, 10, false, 2));
      y += 8;
    }
  });
  pdf.save(`${safeFileName(results.survey.title)}.pdf`);
};
