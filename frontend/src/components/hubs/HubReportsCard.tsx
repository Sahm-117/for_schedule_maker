import React, { useEffect, useMemo, useState } from 'react';
import { supportSessionsApi } from '../../services/api';
import type { HubWeekReport, SupportAttendanceStatus, SupportHub, Week } from '../../types';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { formatDateTime } from '../../utils/time';

// ── Hub meeting reports for the admin Hubs page ──────────────────────────────
// Each hub's weekly meeting as its Hub Lead ran it: who came, the prayer, the notes, and whether the
// report was submitted. The current week shows as it happens (not only once the week is over), and
// earlier weeks are one tap away. "Read report" opens the full notes and every member's mark.

type ReportState = 'SUBMITTED' | 'DRAFT' | 'NOT_STARTED';

const STATE_INFO: Record<ReportState, { label: string; pill: string }> = {
  SUBMITTED: { label: 'Submitted', pill: 'bg-emerald-100/80 text-emerald-700' },
  DRAFT: { label: 'Started, not submitted', pill: 'bg-amber-100/80 text-amber-700' },
  NOT_STARTED: { label: 'Not started', pill: 'bg-neutral-100 text-neutral-600' },
};

const MARK_LABEL: Record<SupportAttendanceStatus, string> = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', EXCUSED: 'Excused' };
const MARK_TONE: Record<SupportAttendanceStatus, string> = {
  PRESENT: 'text-emerald-700',
  LATE: 'text-amber-700',
  ABSENT: 'text-rose-700',
  EXCUSED: 'text-gray-500',
};

interface HubReportsCardProps {
  cohortId: string;
  hubs: SupportHub[];
  membersByHub: Map<string, string[]>;
  /** Weeks that have started, oldest first; the last one opens by default. */
  weeks: Week[];
  nameById: Map<string, string>;
}

const countMarks = (memberIds: string[], marks: Map<string, SupportAttendanceStatus>) => {
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, notMarked: 0 };
  memberIds.forEach((id) => {
    const status = marks.get(id);
    if (status) counts[status] += 1;
    else counts.notMarked += 1;
  });
  return counts;
};

const HubReportsCard: React.FC<HubReportsCardProps> = ({ cohortId, hubs, membersByHub, weeks, nameById }) => {
  const [weekId, setWeekId] = useState<number | null>(weeks.at(-1)?.id ?? null);
  const [reports, setReports] = useState<HubWeekReport[]>([]);
  const [attendance, setAttendance] = useState<Array<{ sessionId: string; userId: string; status: SupportAttendanceStatus }>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openHubId, setOpenHubId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // A new week starting (or the weeks loading late) moves the view to it.
  const latestWeekId = weeks.at(-1)?.id ?? null;
  useEffect(() => { setWeekId(latestWeekId); }, [latestWeekId]);

  useEffect(() => {
    if (weekId === null) { setReports([]); setAttendance([]); return undefined; }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    supportSessionsApi.getHubReportsForWeek(cohortId, weekId)
      .then((res) => { if (!cancelled) { setReports(res.reports); setAttendance(res.attendance); } })
      .catch(() => { if (!cancelled) { setReports([]); setAttendance([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortId, weekId]);

  const rows = useMemo(() => hubs.map((hub) => {
    const report = reports.find((r) => r.hubId === hub.id) ?? null;
    const marks = new Map(report ? attendance.filter((a) => a.sessionId === report.sessionId).map((a) => [a.userId, a.status] as const) : []);
    const memberIds = membersByHub.get(hub.id) ?? [];
    const state: ReportState = report?.submittedAt ? 'SUBMITTED' : report ? 'DRAFT' : 'NOT_STARTED';
    return { hub, report, marks, memberIds, counts: countMarks(memberIds, marks), state };
  }), [hubs, reports, attendance, membersByHub]);

  if (weeks.length === 0 || hubs.length === 0) return null;
  const week = weeks.find((w) => w.id === weekId) ?? null;
  const submitted = rows.filter((r) => r.state === 'SUBMITTED').length;
  const open = rows.find((r) => r.hub.id === openHubId) ?? null;

  return (
    <section data-testid="hub-reports" className="mb-5 rounded-[28px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
      <h2 className="text-[17px] font-bold text-gray-900">
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
          <span>Hub meeting reports</span>
          {week && !loading && !failed && (
            <span className="text-[13px] font-normal text-gray-500">Week {week.weekNumber} · {submitted} of {rows.length} submitted</span>
          )}
          <svg className={`ml-auto h-4 w-4 flex-shrink-0 self-center text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </button>
      </h2>
      {expanded && weeks.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a week">
          {[...weeks].reverse().map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWeekId(w.id)}
              aria-pressed={w.id === weekId}
              className={`min-h-[32px] rounded-full px-3 text-[13px] font-semibold ${w.id === weekId ? 'bg-gray-900 text-white' : 'bg-[#f5f5f7] text-gray-700'}`}
            >
              Week {w.weekNumber}
            </button>
          ))}
        </div>
      )}

      {!expanded ? null : loading ? (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading reports…</p>
      ) : failed ? (
        <p className="mt-4 text-sm text-rose-700">Could not load the reports. Refresh to try again.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {rows.map(({ hub, report, counts, memberIds, state }) => {
            const who = (id: string | null) => (id ? nameById.get(id) : undefined);
            const markParts = [
              counts.PRESENT ? `${counts.PRESENT} present` : null,
              counts.LATE ? `${counts.LATE} late` : null,
              counts.ABSENT ? `${counts.ABSENT} absent` : null,
              counts.EXCUSED ? `${counts.EXCUSED} excused` : null,
              counts.notMarked && report ? `${counts.notMarked} not marked` : null,
            ].filter(Boolean);
            const prayerParts = report ? [
              report.hubPrayerDoneAt ? 'Prayed for the hub' : null,
              report.prayedForCount > 0 ? `${report.prayedForCount} faith project${report.prayedForCount === 1 ? '' : 's'} prayed for` : null,
              report.prayerFinishedAt ? 'Prayer finished' : null,
            ].filter(Boolean) : [];
            return (
              <li key={hub.id} className="border-t border-[#f0f0f2] py-3 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-gray-900">{hub.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_INFO[state].pill}`}>{STATE_INFO[state].label}</span>
                  {report && (
                    <button type="button" onClick={() => setOpenHubId(hub.id)} className="ml-auto min-h-[32px] text-[13px] font-semibold text-[#c2410c]">
                      Read report ›
                    </button>
                  )}
                </div>
                {state === 'SUBMITTED' && report && (
                  <p className="mt-0.5 text-[12.5px] text-gray-500">
                    {who(report.submittedById) ? `By ${who(report.submittedById)} · ` : ''}{formatDateTime(report.submittedAt)}
                  </p>
                )}
                {state === 'DRAFT' && report && (
                  <p className="mt-0.5 text-[12.5px] text-amber-700">
                    Opened {who(report.startedById) ? `by ${who(report.startedById)} ` : ''}{formatDateTime(report.startedAt)}. Submit was not pressed.
                  </p>
                )}
                {state === 'NOT_STARTED' && (
                  <p className="mt-0.5 text-[12.5px] text-gray-500">{hub.leadName ? `${hub.leadName} has not opened the meeting.` : 'No Hub Lead yet.'}</p>
                )}
                {report && (
                  <p className="mt-1 text-[13px] text-gray-700">
                    {memberIds.length === 0 ? 'No members' : markParts.length > 0 ? markParts.join(' · ') : 'Attendance not marked'}
                    {prayerParts.length > 0 ? <span className="text-gray-500"> · {prayerParts.join(' · ')}</span> : null}
                  </p>
                )}
                {report?.notes && <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] text-gray-500">{report.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {open?.report && (
        <ModalShell
          isOpen
          onClose={() => setOpenHubId(null)}
          title={`${open.hub.name} · Week ${week?.weekNumber ?? ''}`}
          subtitle={STATE_INFO[open.state].label}
          wide
        >
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
              <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-gray-900">{open.report.notes || 'No notes written.'}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attendance</h3>
              {open.memberIds.length === 0 ? (
                <p className="mt-1.5 text-sm text-gray-500">No members in this hub.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col">
                  {[...open.memberIds]
                    .sort((a, b) => (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? ''))
                    .map((id) => {
                      const status = open.marks.get(id);
                      return (
                        <li key={id} className="flex items-center justify-between gap-3 border-t border-[#f0f0f2] py-2 text-[14px] first:border-t-0">
                          <span className="min-w-0 truncate text-gray-900">{nameById.get(id) ?? 'Support'}</span>
                          <span className={`flex-none font-semibold ${status ? MARK_TONE[status] : 'text-gray-400'}`}>{status ? MARK_LABEL[status] : 'Not marked'}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
            <div className="text-[13px] text-gray-500">
              {open.report.startedAt && <p>Opened {formatDateTime(open.report.startedAt)}{open.report.startedById && nameById.get(open.report.startedById) ? ` by ${nameById.get(open.report.startedById)}` : ''}</p>}
              {open.report.submittedAt && <p>Submitted {formatDateTime(open.report.submittedAt)}{open.report.submittedById && nameById.get(open.report.submittedById) ? ` by ${nameById.get(open.report.submittedById)}` : ''}</p>}
            </div>
          </div>
        </ModalShell>
      )}
    </section>
  );
};

export default HubReportsCard;
