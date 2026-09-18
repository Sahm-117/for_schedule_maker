import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import CoverRequestsPanel from '../components/CoverRequestsPanel';
import PageHeader from '../components/PageHeader';
import {
  buildWeekStats,
  cohortMode,
  currentWeekNumber,
  judgedWeekNumbers,
  type CohortHealthPayload,
} from '../components/dashboard/healthModel';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { cohortsApi, participantNotesApi, settingsApi, usersApi } from '../services/api';
import type { ParticipantNote, User } from '../types';
import { buildWhatsAppLink } from '../utils/phone';
import {
  PERSON_HEALTH_LABEL,
  evaluateSupports,
  type CohortPeoplePayload,
  type PersonHealth,
  type ProgrammeRules,
  type SupportEvaluation,
  type SupportWeekRecord,
} from '../utils/programmeRules';

// Supports at a glance, judged by the agreed minimums: each week they log Sunday
// attendance, submit the group meeting report and mark everyone at the meeting;
// and their group is fully onboarded within the allowed days. Cover requests live here too.

const HEALTH_PILL: Record<PersonHealth, string> = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warning: 'bg-amber-100/80 text-amber-700',
  critical: 'bg-red-100/80 text-red-700',
};
const SEVERITY: Record<PersonHealth, number> = { critical: 0, warning: 1, good: 2 };

type Filter = 'all' | PersonHealth;

const weekParts = (w: SupportWeekRecord) => [
  w.sundayMarked ? null : 'Sunday attendance',
  w.reportSubmitted ? null : 'meeting report',
  w.meetingMarked ? null : 'meeting attendance',
].filter(Boolean) as string[];

const AdminSupportsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [health, setHealth] = useState<CohortHealthPayload | null>(null);
  const [people, setPeople] = useState<CohortPeoplePayload | null>(null);
  const [rules, setRules] = useState<ProgrammeRules | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  // The weekly meeting reports supports write in Meeting Mode. They are stored as
  // MEETING notes keyed by group and week, so they are fetched separately.
  const [reports, setReports] = useState<ParticipantNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filterParam = searchParams.get('health');
  const filter: Filter = filterParam === 'critical' || filterParam === 'warning' || filterParam === 'good' ? filterParam : 'all';

  const load = useCallback(async () => {
    if (!activeCohort?.id) { setLoading(false); return; }
    try {
      setError('');
      const [h, p, r, u] = await Promise.all([
        cohortsApi.getHealth(activeCohort.id),
        cohortsApi.getPeople(activeCohort.id),
        settingsApi.getProgrammeRules(),
        usersApi.getAll().then((res) => res.users).catch(() => [] as User[]),
      ]);
      setHealth(h);
      setPeople(p);
      setRules(r);
      setUsers(u);
      const groupIds = h.groups.map((g) => g.id);
      setReports(await participantNotesApi.getMeetingReports(groupIds).then((res) => res.notes).catch(() => [] as ParticipantNote[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supports.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  // Links to cover requests (notifications, dashboard) land on that section.
  const location = useLocation();
  const loaded = !loading;
  useEffect(() => {
    if (loaded && location.hash === '#cover') document.getElementById('cover')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, location.hash]);

  const model = useMemo(() => {
    if (!health || !people || !rules || !activeCohort) return null;
    const mode = cohortMode({ startDate: health.cohort?.startDate ?? activeCohort.startDate, endDate: health.cohort?.endDate ?? activeCohort.endDate, status: activeCohort.status });
    const stats = buildWeekStats(health);
    const currentWeek = mode === 'completed' ? (stats[stats.length - 1]?.weekNumber ?? 0) : mode === 'upcoming' ? 0 : currentWeekNumber(activeCohort, stats);
    const judged = judgedWeekNumbers(mode, stats, currentWeek);
    const judgedWeeks = health.weeks.filter((w) => judged.includes(w.weekNumber));
    const evaluations = evaluateSupports(people, health.groups, health.meetings, judgedWeeks, rules)
      .sort((a, b) => SEVERITY[a.health] - SEVERITY[b.health] || b.missedWeeks.length - a.missedWeeks.length);
    // A support leading two groups is judged by the weaker one.
    const bySupport = new Map<string, PersonHealth>();
    evaluations.forEach((e) => {
      const prev = bySupport.get(e.supportId);
      if (!prev || SEVERITY[e.health] < SEVERITY[prev]) bySupport.set(e.supportId, e.health);
    });
    const counts = { critical: 0, warning: 0, good: 0 };
    bySupport.forEach((h) => { counts[h] += 1; });
    const unsupported = health.groups.filter((g) => !g.supportId && g.members > 0);
    const leading = new Set(health.groups.map((g) => g.supportId).filter(Boolean));
    const notLeading = users.filter((u) => u.role === 'SUPPORT' && !leading.has(u.id));
    const weekIdByNumber = new Map(health.weeks.map((w) => [w.weekNumber, w.id]));
    return { mode, judged, evaluations, counts, total: bySupport.size, unsupported, notLeading, weekIdByNumber };
  }, [health, people, rules, users, activeCohort]);

  // Newest report per group+week: a support can submit more than once, and the
  // latest one is what the back office should read.
  const reportByKey = useMemo(() => {
    const map = new Map<string, ParticipantNote>();
    for (const note of [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (note.groupId && note.weekId != null) map.set(`${note.groupId}:${note.weekId}`, note);
    }
    return map;
  }, [reports]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const setFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('health'); else params.set('health', next);
    setSearchParams(params, { replace: true });
  };

  const visible = model?.evaluations.filter((e) => filter === 'all' || e.health === filter) ?? [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const groupById = new Map((health?.groups ?? []).map((g) => [g.id, g]));

  return (
    <div>
      <PageHeader title="Supports" subtitle="Weekly records, onboarding and cover for every support." tourId="admin:supports" />

      {loading && !model ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="surface-card h-28 animate-pulse" />)}
        </div>
      ) : error && !model ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">Try again</button>
        </div>
      ) : !model || !rules ? (
        <div className="surface-card p-8 text-center text-sm text-gray-500">No cohort selected.</div>
      ) : (
        <div className="space-y-5">
          <section data-wt="supports-rules" className="surface-card p-4 sm:p-5">
            <p className="text-sm text-gray-600">
              Each week a support logs Sunday attendance, submits the group meeting report and records meeting attendance for everyone.
              {' '}{rules.supportAmberMissedWeeks} unrecorded week{rules.supportAmberMissedWeeks === 1 ? '' : 's'} = keep an eye on, {rules.supportRedMissedWeeks} = needs attention.
              {' '}Groups should be fully onboarded within {rules.onboardingMaxDays} days.
              {' '}<NavLink to="/settings" className="font-semibold text-primary">Change rules</NavLink>
            </p>
            {model.mode === 'upcoming' && <p className="mt-2 text-sm font-medium text-gray-800">The cohort hasn't started, so only onboarding is judged for now.</p>}
            {model.mode === 'running' && model.judged.length === 0 && <p className="mt-2 text-sm font-medium text-gray-800">Weekly records are judged once Week 1 is over.</p>}
            <div className="mt-4">
              {/* Same look as SegmentedTabs, but wraps to two rows on phones so counts stay readable. */}
              <div role="tablist" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-[#eef0f4] bg-white p-[5px] sm:grid-cols-4">
                {([
                  ['all', 'All', model.total],
                  ['critical', 'Needs attention', model.counts.critical],
                  ['warning', 'Keep an eye on', model.counts.warning],
                  ['good', 'On track', model.counts.good],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={`min-w-0 truncate rounded-xl px-1.5 py-[9px] text-[12.5px] font-semibold transition ${filter === key ? 'bg-[#3f4757] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {visible.length === 0 ? (
            <div className="surface-card p-8 text-center text-sm text-gray-500">No supports here.</div>
          ) : (
            <ul data-wt="supports-list" className="space-y-3">
              {visible.map((evaluation) => (
                <SupportCard
                  key={evaluation.groupId}
                  evaluation={evaluation}
                  user={userById.get(evaluation.supportId) ?? null}
                  groupName={groupById.get(evaluation.groupId)?.name ?? 'Group'}
                  supportName={groupById.get(evaluation.groupId)?.supportName ?? 'Support'}
                  rules={rules}
                  judgedCount={model.judged.length}
                  reportFor={(weekNumber) => {
                    const weekId = model.weekIdByNumber.get(weekNumber);
                    return weekId == null ? null : reportByKey.get(`${evaluation.groupId}:${weekId}`) ?? null;
                  }}
                />
              ))}
            </ul>
          )}

          {(model.unsupported.length > 0 || model.notLeading.length > 0) && (
            <section className="surface-card p-5 sm:p-6">
              {model.unsupported.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-800">
                    <span className="font-semibold">{model.unsupported.length} group{model.unsupported.length === 1 ? '' : 's'} without a support:</span>{' '}
                    {model.unsupported.map((g) => g.name).join(', ')}
                  </p>
                  <NavLink to="/groups" className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Assign</NavLink>
                </div>
              )}
              {model.notLeading.length > 0 && (
                <details className={model.unsupported.length > 0 ? 'mt-3' : ''}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">{model.notLeading.length} support{model.notLeading.length === 1 ? ' isn’t' : 's aren’t'} leading a group this cohort</summary>
                  <p className="mt-2 text-sm text-gray-600">{model.notLeading.map((u) => u.name).join(', ')}</p>
                </details>
              )}
            </section>
          )}

          <div id="cover" data-wt="supports-cover">
            <CoverRequestsPanel />
          </div>
        </div>
      )}
    </div>
  );
};

const SupportCard: React.FC<{
  evaluation: SupportEvaluation;
  user: User | null;
  groupName: string;
  supportName: string;
  rules: ProgrammeRules;
  judgedCount: number;
  reportFor: (weekNumber: number) => ParticipantNote | null;
}> = ({ evaluation, user, groupName, supportName, rules, judgedCount, reportFor }) => {
  const [open, setOpen] = useState(false);
  const [openReport, setOpenReport] = useState<number | null>(null);
  const whatsapp = buildWhatsAppLink(user?.phone, `Hi ${supportName.split(' ')[0]}, checking in on ${groupName}'s weekly records.`);
  const { onboarding } = evaluation;

  const onboardingText = onboarding.completedAt && onboarding.allOnboarded
    ? `Onboarded in ${onboarding.days} day${onboarding.days === 1 ? '' : 's'}${onboarding.late ? ` (over ${rules.onboardingMaxDays})` : ''}`
    : onboarding.assignedAt
      ? `Onboarding not finished · ${Math.floor(onboarding.days ?? 0)} day${Math.floor(onboarding.days ?? 0) === 1 ? '' : 's'} since assigned`
      : 'Onboarding not started';

  const recordsText = judgedCount === 0
    ? 'No weeks to judge yet'
    : evaluation.missedWeeks.length === 0
      ? `Recorded all ${judgedCount} week${judgedCount === 1 ? '' : 's'}`
      : `Missing records for week${evaluation.missedWeeks.length === 1 ? '' : 's'} ${evaluation.missedWeeks.join(', ')}`;

  return (
    <li className="surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900">{supportName}</p>
          <p className="text-sm text-gray-500">{groupName} · {evaluation.members} participant{evaluation.members === 1 ? '' : 's'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${HEALTH_PILL[evaluation.health]}`}>{PERSON_HEALTH_LABEL[evaluation.health]}</span>
      </div>

      {evaluation.weeks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {evaluation.weeks.map((w) => {
            const missing = weekParts(w);
            const none = missing.length === 3;
            const label = w.recorded ? `Week ${w.weekNumber}: recorded` : `Week ${w.weekNumber}: missing ${missing.join(', ')}`;
            return (
              <span
                key={w.weekNumber}
                title={label}
                aria-label={label}
                className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg text-[10px] font-semibold leading-tight ${w.recorded ? 'bg-emerald-100/80 text-emerald-700' : none ? 'bg-red-100/80 text-red-700' : 'bg-amber-100/80 text-amber-700'}`}
              >
                <span className="opacity-80">W{w.weekNumber}</span>
                <span className="text-xs">{w.recorded ? '✓' : none ? '×' : '!'}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={evaluation.missedWeeks.length ? 'font-medium text-gray-900' : 'text-gray-600'}>{recordsText}</span>
        <span className={onboarding.late || !onboarding.allOnboarded ? 'font-medium text-gray-900' : 'text-gray-600'}>
          {onboardingText}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {evaluation.weeks.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            {open ? 'Hide weeks' : 'Week by week'}
          </button>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-100/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">WhatsApp</a>
        )}
        <NavLink to={`/groups?group=${evaluation.groupId}`} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Open group</NavLink>
      </div>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Week</th>
                <th className="py-1.5 pr-3 font-semibold">Sunday attendance</th>
                <th className="py-1.5 pr-3 font-semibold">Meeting report</th>
                <th className="py-1.5 font-semibold">Meeting attendance</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              {evaluation.weeks.map((w) => {
                const report = reportFor(w.weekNumber);
                const showing = openReport === w.weekNumber;
                return (
                  <React.Fragment key={w.weekNumber}>
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 font-semibold">{w.weekNumber}</td>
                      <td className={`py-1.5 pr-3 ${w.sundayMarked ? 'text-emerald-700' : 'font-semibold text-red-700'}`}>{w.sundayMarked ? '✓ Done' : '× Missing'}</td>
                      <td className="py-1.5 pr-3">
                        <span className={w.reportSubmitted ? 'text-emerald-700' : 'font-semibold text-red-700'}>{w.reportSubmitted ? '✓ Done' : '× Missing'}</span>
                        {report ? (
                          <button
                            type="button"
                            onClick={() => setOpenReport(showing ? null : w.weekNumber)}
                            aria-expanded={showing}
                            className="ml-2 rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                          >
                            {showing ? 'Hide notes' : 'Read notes'}
                          </button>
                        ) : w.reportSubmitted ? (
                          <span className="ml-2 text-[11px] text-gray-400">no notes</span>
                        ) : null}
                      </td>
                      <td className={`py-1.5 ${w.meetingMarked ? 'text-emerald-700' : 'font-semibold text-red-700'}`}>{w.meetingMarked ? '✓ Done' : '× Missing'}</td>
                    </tr>
                    {showing && report && (
                      <tr className="border-t border-gray-100 bg-gray-50/70">
                        <td colSpan={4} className="px-1 py-2.5">
                          <p className="whitespace-pre-line text-[13px] leading-normal text-gray-800">{report.body}</p>
                          <p className="mt-1.5 text-[11px] text-gray-500">
                            {report.authorName || 'A support'} · {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
};

export default AdminSupportsPage;
