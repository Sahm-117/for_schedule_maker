import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useSearchParams } from 'react-router-dom';
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
import { cohortsApi, participantNotesApi, settingsApi, supportHubsApi, supportNotesApi, supportSessionsApi, usersApi } from '../services/api';
import type { HubMembership, ParticipantNote, SupportHub, SupportNote, SupportSession, User } from '../types';
import AppSelect from '../components/AppSelect';
import { buildWhatsAppLink } from '../utils/phone';
import {
  PERSON_HEALTH_LABEL,
  buildTrainingCounts,
  evaluateSupports,
  trainingCountFor,
  type CohortPeoplePayload,
  type PersonHealth,
  type ProgrammeRules,
  type SupportEvaluation,
} from '../utils/programmeRules';

// Supports are judged by their group meeting records and onboarding progress.

const HEALTH_PILL: Record<PersonHealth, string> = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warning: 'bg-amber-100/80 text-amber-700',
  critical: 'bg-red-100/80 text-red-700',
};
const SEVERITY: Record<PersonHealth, number> = { critical: 0, warning: 1, good: 2 };

type Filter = 'all' | PersonHealth;

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
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [memberships, setMemberships] = useState<HubMembership[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Array<{ sessionId: string; userId: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filterParam = searchParams.get('health');
  const filter: Filter = filterParam === 'critical' || filterParam === 'warning' || filterParam === 'good' ? filterParam : 'all';
  const hubFilter = searchParams.get('hub') ?? '';

  const load = useCallback(async () => {
    if (!activeCohort?.id) { setLoading(false); return; }
    try {
      setError('');
      const [h, p, r, u, hb, ms, ts] = await Promise.all([
        cohortsApi.getHealth(activeCohort.id),
        cohortsApi.getPeople(activeCohort.id),
        settingsApi.getProgrammeRules(),
        usersApi.getAll().then((res) => res.users).catch(() => [] as User[]),
        supportHubsApi.getAll(activeCohort.id).then((res) => res.hubs).catch(() => [] as SupportHub[]),
        supportHubsApi.getMembershipsForCohort(activeCohort.id).then((res) => res.memberships).catch(() => [] as HubMembership[]),
        supportSessionsApi.getForCohort(activeCohort.id, ['PRE_COHORT_TRAINING']).catch(() => ({ sessions: [] as SupportSession[], attendance: [] as Array<{ sessionId: string; userId: string; status: string }> })),
      ]);
      setHealth(h);
      setPeople(p);
      setRules(r);
      setUsers(u);
      setHubs(hb);
      setMemberships(ms);
      setTrainingSessions(ts.sessions);
      setTrainingAttendance(ts.attendance);
      const groupIds = h.groups.map((g) => g.id);
      setReports(await participantNotesApi.getMeetingReports(groupIds).then((res) => res.notes).catch(() => [] as ParticipantNote[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supports.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id]);

  useEffect(() => { void load(); }, [load, liveRevision]);

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

  const trainingsTotal = trainingSessions.length;
  const trainingCounts = useMemo(
    () => buildTrainingCounts(trainingSessions.map((s) => s.id), trainingAttendance),
    [trainingSessions, trainingAttendance]
  );

  // A support's hub for the active cohort, and whether they lead it.
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const hubByUserId = new Map(memberships.map((m) => {
    const hub = hubById.get(m.hubId);
    return [m.userId, hub ? { id: hub.id, name: hub.name, isLead: hub.leadUserId === m.userId } : null] as const;
  }));

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const setFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('health'); else params.set('health', next);
    setSearchParams(params, { replace: true });
  };
  const setHubFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete('hub'); else params.set('hub', next);
    setSearchParams(params, { replace: true });
  };

  const visible = (model?.evaluations.filter((e) => filter === 'all' || e.health === filter) ?? [])
    .filter((e) => !hubFilter || hubByUserId.get(e.supportId)?.id === hubFilter);
  const userById = new Map(users.map((u) => [u.id, u]));
  const groupById = new Map((health?.groups ?? []).map((g) => [g.id, g]));

  // Supports who lead no group still show up as a simple card when they're in
  // a hub — otherwise the only trace of them is a name in the collapsed line
  // below, and the hub filter used to hide them from the page entirely. They
  // have no health, so a health filter other than "all" hides their card too.
  const notLeadingWithHub = (model?.notLeading ?? []).filter((u) => !!hubByUserId.get(u.id));
  const notLeadingCards = filter === 'all'
    ? notLeadingWithHub.filter((u) => !hubFilter || hubByUserId.get(u.id)?.id === hubFilter)
    : [];
  const notLeadingCardIds = new Set(notLeadingCards.map((u) => u.id));
  const notLeadingCollapsed = (model?.notLeading ?? []).filter((u) => !notLeadingCardIds.has(u.id));

  return (
    <div>
      <PageHeader title="Supports" subtitle="Group meeting records and onboarding for every support." tourId="admin:supports" />

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
              Each week a support submits the group meeting report and records meeting attendance for everyone.
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

          {hubs.length > 0 && (
            <div className="w-full sm:w-64">
              <AppSelect
                value={hubFilter}
                onChange={setHubFilter}
                options={[{ value: '', label: 'All hubs' }, ...hubs.map((h) => ({ value: h.id, label: h.name }))]}
                placeholder="All hubs"
                compact
              />
            </div>
          )}

          {visible.length === 0 && notLeadingCards.length === 0 ? (
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
                  hub={hubByUserId.get(evaluation.supportId) ?? null}
                  training={trainingCountFor(trainingCounts, evaluation.supportId, trainingsTotal)}
                  reportFor={(weekNumber) => {
                    const weekId = model.weekIdByNumber.get(weekNumber);
                    return weekId == null ? null : reportByKey.get(`${evaluation.groupId}:${weekId}`) ?? null;
                  }}
                />
              ))}
              {notLeadingCards.map((u) => (
                <NoLeadSupportCard key={u.id} user={u} hub={hubByUserId.get(u.id)!} training={trainingCountFor(trainingCounts, u.id, trainingsTotal)} />
              ))}
            </ul>
          )}

          {(model.unsupported.length > 0 || notLeadingCollapsed.length > 0) && (
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
              {notLeadingCollapsed.length > 0 && (
                <details className={model.unsupported.length > 0 ? 'mt-3' : ''}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">{notLeadingCollapsed.length} support{notLeadingCollapsed.length === 1 ? ' isn’t' : 's aren’t'} leading a group this cohort</summary>
                  <p className="mt-2 text-sm text-gray-600">{notLeadingCollapsed.map((u) => u.name).join(', ')}</p>
                </details>
              )}
            </section>
          )}

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
  hub: { id: string; name: string; isLead: boolean } | null;
  training: { attended: number; total: number };
  reportFor: (weekNumber: number) => ParticipantNote | null;
}> = ({ evaluation, user, groupName, supportName, rules, judgedCount, hub, training, reportFor }) => {
  const [open, setOpen] = useState(false);
  const [openReport, setOpenReport] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<SupportNote[] | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const whatsapp = buildWhatsAppLink(user?.phone, `Hi ${supportName.split(' ')[0]}, checking in on ${groupName}'s weekly records.`);
  const { onboarding } = evaluation;

  const toggleNotes = () => {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next && notes === null) {
      supportNotesApi.getForSupport(evaluation.supportId).then((res) => setNotes(res.notes)).catch(() => setNotes([]));
    }
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    setNoteSaving(true);
    try {
      const { note } = await supportNotesApi.create({ supportId: evaluation.supportId, hubId: hub?.id ?? null, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      setNoteBody('');
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  };

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
          <p className="text-base font-semibold text-gray-900">
            {supportName}
            {hub?.isLead && <span className="ml-2 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>}
          </p>
          <p className="text-sm text-gray-500">
            {groupName} · {evaluation.members} participant{evaluation.members === 1 ? '' : 's'}
            {hub && <span className="ml-1.5 rounded-full bg-indigo-100/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{hub.name}</span>}
            {training.total > 0 && (
              <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${training.attended >= rules.minTrainingsAttended ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-700'}`}>
                Trainings {training.attended}/{training.total}
              </span>
            )}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${HEALTH_PILL[evaluation.health]}`}>{PERSON_HEALTH_LABEL[evaluation.health]}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={evaluation.missedWeeks.length ? 'font-medium text-gray-900' : 'text-gray-600'}>
          {recordsText}
          {evaluation.weeks.length > 0 && (
            <NavLink to="/group-prayers" className="ml-2 text-xs font-semibold text-primary hover:text-primary-dark">See records</NavLink>
          )}
        </span>
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
        <button type="button" onClick={toggleNotes} aria-expanded={notesOpen} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          {notesOpen ? 'Hide notes' : 'Notes'}
        </button>
      </div>

      {notesOpen && (
        <div className="mt-3 rounded-xl border border-orange-100 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Private note — only admin and this support's hub lead can see it."
              className="flex-1 rounded-xl border border-orange-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void handleAddNote()}
              disabled={noteSaving || !noteBody.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {noteSaving ? 'Saving…' : 'Add'}
            </button>
          </div>
          {notes === null ? (
            <p className="mt-2 text-xs text-gray-400">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs text-gray-800">{n.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{n.authorName || 'Admin'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Week</th>
                <th className="py-1.5 pr-3 font-semibold">Meeting report</th>
                <th className="py-1.5 pr-3 font-semibold">Meeting attendance</th>
                <th className="py-1.5 font-semibold">Recap</th>
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
                      <td className={`py-1.5 pr-3 ${w.meetingMarked ? 'text-emerald-700' : 'font-semibold text-red-700'}`}>{w.meetingMarked ? '✓ Done' : '× Missing'}</td>
                      <td className={`py-1.5 ${w.recapMissed ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{w.recapMissed ? '× Absent' : '✓ OK'}</td>
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

// A support in a hub who doesn't lead a group: no weekly records to judge, so
// just their hub badge, a WhatsApp link and the same notes section the
// group-leading card has.
const NoLeadSupportCard: React.FC<{
  user: User;
  hub: { id: string; name: string; isLead: boolean };
  training: { attended: number; total: number };
}> = ({ user, hub, training }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<SupportNote[] | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const whatsapp = buildWhatsAppLink(user.phone, `Hi ${user.name.split(' ')[0]}`);

  const toggleNotes = () => {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next && notes === null) {
      supportNotesApi.getForSupport(user.id).then((res) => setNotes(res.notes)).catch(() => setNotes([]));
    }
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    setNoteSaving(true);
    try {
      const { note } = await supportNotesApi.create({ supportId: user.id, hubId: hub.id, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      setNoteBody('');
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  };

  return (
    <li className="surface-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900">
            {user.name}
            {hub.isLead && <span className="ml-2 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>}
          </p>
          <p className="text-sm text-gray-500">
            <span className="rounded-full bg-indigo-100/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{hub.name}</span>
            {training.total > 0 && (
              <span className="ml-1.5 rounded-full bg-sky-100/80 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                Trainings {training.attended}/{training.total}
              </span>
            )}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-600">Not leading a group yet</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-100/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">WhatsApp</a>
        )}
        <button type="button" onClick={toggleNotes} aria-expanded={notesOpen} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          {notesOpen ? 'Hide notes' : 'Notes'}
        </button>
      </div>

      {notesOpen && (
        <div className="mt-3 rounded-xl border border-orange-100 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Private note — only admin and this support's hub lead can see it."
              className="flex-1 rounded-xl border border-orange-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void handleAddNote()}
              disabled={noteSaving || !noteBody.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {noteSaving ? 'Saving…' : 'Add'}
            </button>
          </div>
          {notes === null ? (
            <p className="mt-2 text-xs text-gray-400">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs text-gray-800">{n.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{n.authorName || 'Admin'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

export default AdminSupportsPage;
