import React, { useMemo, useState } from 'react';
import type { Cohort, SupportAttendanceStatus, SupportHub, SupportSession, SupportSessionType, Week } from '../../types';

// ── Attendance overview strip for the admin Hubs page ─────────────────────────
// Sits above the Hubs/Trainings tabs. Two headline cards (last recap week,
// trainings overall) plus a collapsed "week by week" table. All numbers are
// derived from data the page already loads — no extra fetches live here.

interface AttendanceSummaryStripProps {
  hubs: SupportHub[];
  membersByHub: Map<string, string[]>;
  weeks: Week[];
  summaryWeek: Week | null;
  /** Recap marks keyed "hubId:weekId" -> { userId: status }, kept in step by the page. */
  recapMarksByHubWeek: Record<string, Record<string, SupportAttendanceStatus>>;
  trainingSessions: SupportSession[];
  trainingAttendance: Array<{ sessionId: string; userId: string; status: SupportAttendanceStatus }>;
  // Support user ids enrolled in each cohort — a session is judged only
  // against the supports of the cohort it's for.
  supportIdsByCohort: Map<string, Set<string>>;
  cohortById: Map<string, Cohort>;
  sessionTypePill: Record<SupportSessionType, string>;
  sessionTypeLabel: Record<SupportSessionType, string>;
}

const isPresentish = (status?: SupportAttendanceStatus) => status === 'PRESENT' || status === 'LATE';

// Present/late/absent/excused/not-marked breakdown for one week, across ALL
// hubs, against each hub's CURRENT members (not who was on it at the time).
const recapCountsForWeek = (
  hubs: SupportHub[],
  membersByHub: Map<string, string[]>,
  recapMarksByHubWeek: Record<string, Record<string, SupportAttendanceStatus>>,
  weekId: number,
) => {
  let present = 0, late = 0, absent = 0, excused = 0, notMarked = 0, total = 0, anyMarks = false;
  hubs.forEach((h) => {
    const memberIds = membersByHub.get(h.id) ?? [];
    const marks = recapMarksByHubWeek[`${h.id}:${weekId}`];
    if (marks && Object.keys(marks).length > 0) anyMarks = true;
    memberIds.forEach((id) => {
      total += 1;
      const status = marks?.[id];
      if (status === 'PRESENT') present += 1;
      else if (status === 'LATE') late += 1;
      else if (status === 'ABSENT') absent += 1;
      else if (status === 'EXCUSED') excused += 1;
      else notMarked += 1;
    });
  });
  return { present, late, absent, excused, notMarked, total, anyMarks, presentOrLate: present + late };
};

const AttendanceSummaryStrip: React.FC<AttendanceSummaryStripProps> = ({
  hubs, membersByHub, weeks, summaryWeek, recapMarksByHubWeek,
  trainingSessions, trainingAttendance, supportIdsByCohort, cohortById,
  sessionTypePill, sessionTypeLabel,
}) => {
  const [open, setOpen] = useState(false);

  const recapSummary = useMemo(
    () => (summaryWeek ? recapCountsForWeek(hubs, membersByHub, recapMarksByHubWeek, summaryWeek.id) : null),
    [hubs, membersByHub, recapMarksByHubWeek, summaryWeek]
  );

  const weekRows = useMemo(() => {
    if (!summaryWeek) return [];
    return [...weeks]
      .filter((w) => w.weekNumber <= summaryWeek.weekNumber)
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((w) => ({ week: w, counts: recapCountsForWeek(hubs, membersByHub, recapMarksByHubWeek, w.id) }));
  }, [weeks, summaryWeek, hubs, membersByHub, recapMarksByHubWeek]);

  const trainingRows = useMemo(
    () => [...trainingSessions]
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
      .map((s) => {
        const cohortSupportIds = supportIdsByCohort.get(s.cohortId) ?? new Set<string>();
        return {
          session: s,
          present: trainingAttendance.filter((a) => a.sessionId === s.id && cohortSupportIds.has(a.userId) && isPresentish(a.status)).length,
          total: cohortSupportIds.size,
        };
      }),
    [trainingSessions, trainingAttendance, supportIdsByCohort]
  );

  const trainingsOverall = useMemo(() => {
    const sessionCount = trainingRows.length;
    const possible = trainingRows.reduce((sum, r) => sum + r.total, 0);
    if (sessionCount === 0 || possible === 0) return null;
    const presentOrLate = trainingRows.reduce((sum, r) => sum + r.present, 0);
    const supportIds = new Set(trainingRows.flatMap((r) => [...(supportIdsByCohort.get(r.session.cohortId) ?? [])]));
    return { pct: Math.round((presentOrLate / possible) * 100), sessionCount, supportUserCount: supportIds.size };
  }, [trainingRows, supportIdsByCohort]);

  const recapBreakdownParts: string[] = [];
  if (recapSummary) {
    if (recapSummary.late > 0) recapBreakdownParts.push(`${recapSummary.late} late`);
    if (recapSummary.absent > 0) recapBreakdownParts.push(`${recapSummary.absent} absent`);
    if (recapSummary.excused > 0) recapBreakdownParts.push(`${recapSummary.excused} excused`);
    if (recapSummary.notMarked > 0) recapBreakdownParts.push(`${recapSummary.notMarked} not marked`);
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {summaryWeek ? `Last recap · Week ${summaryWeek.weekNumber}` : 'Last recap'}
          </p>
          {!summaryWeek || !recapSummary ? (
            <p className="mt-1 text-sm text-gray-400">No recap weeks finished yet.</p>
          ) : (
            <>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {recapSummary.presentOrLate} of {recapSummary.total} present
              </p>
              {recapBreakdownParts.length > 0 && (
                <p className="mt-0.5 text-xs text-gray-500">{recapBreakdownParts.join(' · ')}</p>
              )}
            </>
          )}
        </div>
        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trainings overall</p>
          {!trainingsOverall ? (
            <p className="mt-1 text-sm text-gray-400">No trainings yet.</p>
          ) : (
            <>
              <p className="mt-1 text-lg font-bold text-gray-900">{trainingsOverall.pct}% attended</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {trainingsOverall.sessionCount} session{trainingsOverall.sessionCount === 1 ? '' : 's'} · {trainingsOverall.supportUserCount} supports
              </p>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-orange-100 bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-semibold text-gray-700"
        >
          <span>See week by week</span>
          <svg className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="flex flex-col gap-4 border-t border-orange-100 px-3.5 py-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recap</p>
              {weekRows.length === 0 ? (
                <p className="text-sm text-gray-400">No weeks yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {weekRows.map(({ week, counts }) => (
                    <li key={week.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">Week {week.weekNumber}</span>
                      {counts.anyMarks ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${counts.notMarked > 0 || counts.absent > 0 ? 'bg-amber-100/80 text-amber-700' : 'bg-emerald-100/80 text-emerald-700'}`}>
                          {counts.presentOrLate}/{counts.total} present
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">Not marked</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Trainings &amp; get-togethers</p>
              {trainingRows.length === 0 ? (
                <p className="text-sm text-gray-400">No trainings yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {trainingRows.map(({ session, present, total }) => (
                    <li key={session.id} className="flex flex-col gap-1 rounded-lg border border-orange-50 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 truncate">
                        <span className={`mr-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${sessionTypePill[session.type]}`}>{sessionTypeLabel[session.type]}</span>
                        <span className="mr-1.5 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{cohortById.get(session.cohortId)?.name ?? 'Cohort'}</span>
                        <span className="text-sm font-semibold text-gray-800">{session.title}</span>
                      </span>
                      <span className="w-fit flex-shrink-0 rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                        {present}/{total} present
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceSummaryStrip;
