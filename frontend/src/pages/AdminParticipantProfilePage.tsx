import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import { useToast } from '../components/Toast';
import ModalShell from '../components/followups/ModalShell';
import {
  buildWeekStats,
  cohortMode,
  currentWeekNumber,
  judgedWeekNumbers,
  type CohortHealthPayload,
} from '../components/dashboard/healthModel';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  attendanceApi,
  cohortsApi,
  departmentReferralsApi,
  faithProjectsApi,
  meetingAttendanceApi,
  participantFlagsApi,
  participantHandoversApi,
  participantNotesApi,
  participantOnboardingStatusApi,
  participantsApi,
  participantStageChangesApi,
  settingsApi,
} from '../services/api';
import type {
  AttendanceRecord,
  DepartmentReferral,
  FaithProject,
  JourneyStage,
  MeetingAttendance,
  Participant,
  ParticipantFlag,
  ParticipantHandover,
  ParticipantNote,
  ParticipantOnboardingStatus,
  ParticipantStageChange,
} from '../types';
import DepartmentHandoff from '../components/participants/DepartmentHandoff';
import LoginDetailsCard from '../components/participants/LoginDetailsCard';
import ParticipantAppActivity from '../components/participants/ParticipantAppActivity';
import { JOURNEY_STAGES, buildJourney } from '../utils/participantJourney';
import {
  COMPLETION_SCORE_ALL_MEETINGS,
  PERSON_HEALTH_LABEL,
  evaluateParticipants,
  type ParticipantEvaluation,
  type ProgrammeRules,
} from '../utils/programmeRules';

// One participant, end to end: who they are, where they are in the FOF journey,
// attendance, faith project, check-ins, concerns, completion and department handoff.

const CARD = 'surface-card p-5 sm:p-6';

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

const SOURCE_LABEL: Record<string, string> = { FOLLOW_UP: 'Follow-up', MANUAL: 'Added manually', IMPORT: 'Import' };

const NOTE_LABEL: Record<string, string> = {
  CHECK_IN: 'Check-in',
  MEETING: 'Group meeting note',
  HANDOVER: 'Handover note',
  FAITH_COACH: 'Faith project coaching',
  FAITH_OFFICE: 'Back office note',
};

const FAITH_STATUS: Record<string, { label: string; cls: string }> = {
  NOT_DRAFTED: { label: 'Not drafted', cls: 'bg-neutral-100 text-neutral-600' },
  AWAITING_DRAFT: { label: 'Awaiting draft', cls: 'bg-sky-100/80 text-sky-700' },
  UNDER_REFINEMENT: { label: 'Under refinement', cls: 'bg-amber-100/80 text-amber-700' },
  NEEDS_REFINEMENT: { label: 'Needs refinement', cls: 'bg-orange-100/80 text-orange-700' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-100/80 text-emerald-700' },
};

const HEALTH_PILL: Record<string, string> = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warning: 'bg-amber-100/80 text-amber-700',
  critical: 'bg-red-100/80 text-red-700',
  neutral: 'bg-neutral-100 text-neutral-600',
};

const SUNDAY_MARK: Record<string, { letter: string; label: string; cls: string }> = {
  PRESENT: { letter: 'P', label: 'Present', cls: 'bg-emerald-100/80 text-emerald-700' },
  LATE: { letter: 'L', label: 'Late', cls: 'bg-amber-100/80 text-amber-700' },
  ABSENT: { letter: 'A', label: 'Absent', cls: 'bg-red-100/80 text-red-700' },
};

const MEETING_MARK: Record<string, { letter: string; label: string; cls: string }> = {
  JOINED: { letter: 'J', label: 'Joined', cls: 'bg-emerald-100/80 text-emerald-700' },
  EXCUSED: { letter: 'E', label: 'Excused', cls: 'bg-sky-100/80 text-sky-700' },
  MISSED: { letter: 'M', label: 'Missed', cls: 'bg-red-100/80 text-red-700' },
};


interface ProfileData {
  participant: Participant;
  health: CohortHealthPayload | null;
  rules: ProgrammeRules;
  sunday: AttendanceRecord[];
  meeting: MeetingAttendance[];
  onboarding: ParticipantOnboardingStatus | null;
  faithProject: FaithProject | null;
  notes: ParticipantNote[];
  handovers: ParticipantHandover[];
  flags: ParticipantFlag[];
  referrals: DepartmentReferral[];
  changes: ParticipantStageChange[];
}

const AdminParticipantProfilePage: React.FC = () => {
  const { participantId = '' } = useParams();
  const { user, isAdmin } = useAuth();
  const { cohorts } = useAppData();
  const showToast = useToast();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'checkin' | 'stage' | 'flag' | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const { participant } = await participantsApi.getById(participantId);
      if (!participant) {
        setError('This participant could not be found.');
        return;
      }
      const cohortId = participant.cohortId;
      const [health, rules, notes, handovers, flags, referrals, changes, faith, onboarding] = await Promise.all([
        cohortId ? cohortsApi.getHealth(cohortId).catch(() => null) : Promise.resolve(null),
        settingsApi.getProgrammeRules(),
        participantNotesApi.getForParticipants([participant.id]).then((r) => r.notes).catch(() => []),
        participantHandoversApi.getForParticipants([participant.id]).then((r) => r.handovers).catch(() => []),
        participantFlagsApi.getForParticipant(participant.id).then((r) => r.flags).catch(() => []),
        departmentReferralsApi.getForParticipants([participant.id]).then((r) => r.referrals).catch(() => []),
        participantStageChangesApi.getForParticipant(participant.id).then((r) => r.changes).catch(() => []),
        faithProjectsApi.getByParticipant(participant.id).then((r) => r.projects[0] ?? null).catch(() => null),
        participant.groupId
          ? participantOnboardingStatusApi.getForGroup(participant.groupId).then((r) => r.statuses.find((s) => s.participantId === participant.id) ?? null).catch(() => null)
          : Promise.resolve(null),
      ]);
      const weekIds = health?.weeks.map((w) => w.id) ?? [];
      const [sunday, meeting] = weekIds.length
        ? await Promise.all([
          attendanceApi.getForWeeks({ weekIds, participantIds: [participant.id] }).then((r) => r.records).catch(() => []),
          meetingAttendanceApi.getForWeeks(weekIds).then((r) => r.records.filter((m) => m.participantId === participant.id)).catch(() => []),
        ])
        : [[], []];
      setData({ participant, health, rules, sunday, meeting, onboarding, faithProject: faith, notes, handovers, flags, referrals, changes });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this participant.');
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const derived = useMemo(() => {
    if (!data) return null;
    const { participant, health } = data;
    const cohort = cohorts.find((c) => c.id === participant.cohortId) ?? null;
    const weeks = [...(health?.weeks ?? [])].sort((a, b) => a.weekNumber - b.weekNumber);
    let evaluation: ParticipantEvaluation | null = null;
    let judged: number[] = [];
    let mode: ReturnType<typeof cohortMode> | null = null;
    if (health && cohort) {
      mode = cohortMode({ startDate: health.cohort?.startDate ?? cohort.startDate, endDate: health.cohort?.endDate ?? cohort.endDate, status: cohort.status });
      const stats = buildWeekStats(health);
      const currentWeek = mode === 'completed' ? (stats[stats.length - 1]?.weekNumber ?? 0) : mode === 'upcoming' ? 0 : currentWeekNumber(cohort, stats);
      judged = judgedWeekNumbers(mode, stats, currentWeek);
      const judgedIds = weeks.filter((w) => judged.includes(w.weekNumber)).map((w) => w.id);
      [evaluation] = evaluateParticipants(
        {
          participants: [{ id: participant.id, fullName: participant.fullName, status: 'ACTIVE', departments: participant.departments ?? [], createdAt: participant.createdAt ?? '', groupId: participant.groupId ?? null, onboarded: false }],
          sunday: data.sunday.map((r) => ({ participantId: r.participantId, weekId: r.weekId, status: r.status })),
          meeting: data.meeting.map((r) => ({ participantId: r.participantId, weekId: r.weekId, status: r.status })),
          onboarding: [],
        },
        judgedIds,
        mode === 'completed',
        data.rules,
      );
    }
    const group = health?.groups.find((g) => g.id === participant.groupId) ?? null;
    const onboarded = data.onboarding && data.onboarding.contacted && data.onboarding.addedToGroup && data.onboarding.introductionDone && data.onboarding.venueAcknowledged;
    const attendedTimes = [
      ...data.sunday.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').map((r) => r.markedAt),
      ...data.meeting.filter((r) => r.status === 'JOINED').map((r) => r.markedAt),
    ].filter(Boolean).sort() as string[];
    const journey = buildJourney({
      registeredAt: participant.registrationDate ?? participant.createdAt ?? null,
      onboardedAt: onboarded ? data.onboarding?.updatedAt ?? null : null,
      onboardedBy: onboarded ? data.onboarding?.updatedByName ?? null : null,
      firstAttendedAt: attendedTimes[0] ?? null,
      completedAt: evaluation?.completion?.outcome === 'COMPLETED' ? (cohort?.endDate ?? health?.cohort?.endDate ?? null) : null,
      referrals: data.referrals,
      changes: data.changes,
    }, (value) => formatDate(value));
    return { cohort, weeks, judged, mode, evaluation, group, journey };
  }, [data, cohorts]);

  if (user?.role === 'SUPPORT') return <Navigate to="/support" replace />;

  if (loading && !data) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="surface-card h-40 animate-pulse" />
        <div className="surface-card h-28 animate-pulse" />
        <div className="surface-card h-64 animate-pulse" />
      </div>
    );
  }

  if (!data || !derived) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-gray-600">{error || 'This participant could not be found.'}</p>
        <NavLink to="/participants" className="mt-3 inline-block text-sm font-semibold text-primary">Back to participants</NavLink>
      </div>
    );
  }

  const { participant } = data;
  const { evaluation, group, journey, weeks, judged, mode, cohort } = derived;
  const archived = participant.status !== 'ACTIVE';
  const headerPill = archived
    ? { label: 'Withdrawn', cls: HEALTH_PILL.neutral }
    : evaluation && judged.length > 0
      ? { label: PERSON_HEALTH_LABEL[evaluation.health], cls: HEALTH_PILL[evaluation.health] }
      : { label: 'Not judged yet', cls: HEALTH_PILL.neutral };
  const openFlags = data.flags.filter((f) => !f.clearedAt);

  const history = [
    ...data.notes.map((n) => ({ id: `n-${n.id}`, at: n.createdAt, title: NOTE_LABEL[n.noteType] ?? 'Note', body: n.body, by: n.byParticipant ? 'Participant' : n.authorName })),
    ...data.handovers.map((h) => ({
      id: `h-${h.id}`,
      at: h.createdAt,
      title: h.eventType === 'GROUP_JOINED' ? 'Joined a group' : h.eventType === 'GROUP_LEFT' ? 'Left a group' : 'Support changed',
      body: [h.fromGroupName && `From ${h.fromGroupName}${h.fromSupportName ? ` (${h.fromSupportName})` : ''}`, h.toGroupName && `to ${h.toGroupName}${h.toSupportName ? ` (${h.toSupportName})` : ''}`].filter(Boolean).join(' '),
      by: null as string | null,
    })),
    {
      id: 'registered',
      at: participant.registrationDate ?? participant.createdAt ?? '',
      title: 'Registered',
      body: participant.source === 'FOLLOW_UP' ? 'Moved from a follow-up contact to a participant record.' : `Added by ${SOURCE_LABEL[participant.source]?.toLowerCase() ?? 'the back office'}.`,
      by: null,
    },
  ].filter((item) => item.at).sort((a, b) => (a.at < b.at ? 1 : -1));

  const markFor = (records: Array<{ weekId: number; status: string }>, weekId: number) => records.find((r) => r.weekId === weekId)?.status;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <NavLink to="/participants" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800">
        <span aria-hidden="true">←</span> Participants
      </NavLink>

      {/* Header */}
      <section className={CARD}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-[#fff1e7] text-xl font-bold text-[#c2410c]">
            {initialsOf(participant.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{participant.fullName}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {[participant.cohortName ?? cohort?.name, group?.name ?? participant.groupName ?? 'No group', group?.supportName ? `Support: ${group.supportName}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${headerPill.cls}`}>{headerPill.label}</span>
        </div>
        {isAdmin && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setModal('checkin')} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">Log a check-in</button>
            <button type="button" onClick={() => setModal('stage')} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">Move journey stage</button>
            <button type="button" onClick={() => setModal('flag')} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">Flag a concern</button>
          </div>
        )}
      </section>

      {/* Overview */}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Phone', participant.phone],
            ['Email', participant.email],
            ['Age range', participant.ageRange],
            ['Gender', participant.gender],
            ['Registered', participant.registrationDate || participant.createdAt ? formatDate(participant.registrationDate ?? participant.createdAt) : null],
            ['Source', SOURCE_LABEL[participant.source] ?? participant.source],
          ].map(([label, value]) => (
            <div key={label as string} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-gray-900">{value || <span className="text-gray-400">—</span>}</dd>
            </div>
          ))}
        </dl>
        {participant.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{participant.notes}</p>
        )}
      </section>

      {/* Participant app */}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-gray-900">Participant app</h2>
        <p className="mt-1 text-sm text-gray-500">Send {participant.fullName.split(' ')[0]} their login, and see what they have done in the app.</p>
        <LoginDetailsCard participantId={participant.id} className="mt-4 max-w-xl" />
        <ParticipantAppActivity participantId={participant.id} cohortId={participant.cohortId} weeks={weeks} />
      </section>

      {/* Journey */}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-gray-900">Journey</h2>
        <p className="text-sm text-gray-500">Worked out from records. Manual moves show who moved them and when.</p>
        <ol className="mt-4">
          {journey.map((step, index) => (
            <li key={step.stage} className="relative flex gap-3 pb-4 last:pb-0">
              {index < journey.length - 1 && (
                <span className={`absolute left-[7px] top-4 h-full w-0.5 ${journey[index + 1].reached ? 'bg-orange-200' : 'bg-gray-100'}`} aria-hidden="true" />
              )}
              <span className={`relative mt-1 h-4 w-4 flex-none rounded-full ${step.reached ? 'bg-primary' : 'bg-gray-200'} ${step.current ? 'ring-4 ring-orange-100' : ''}`} />
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${step.reached ? 'text-gray-900' : 'text-gray-400'}`}>
                  {step.label}
                  {step.current && <span className="ml-2 rounded-full bg-orange-100/80 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Current stage</span>}
                </p>
                <p className={`text-xs ${step.reached ? 'text-gray-500' : 'text-gray-400'}`}>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Attendance */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Attendance</h2>
          {evaluation && judged.length > 0 && (
            <p className="text-xs text-gray-500">
              {evaluation.sundayMisses} Sunday miss{evaluation.sundayMisses === 1 ? '' : 'es'} · {evaluation.meetingMisses} meeting miss{evaluation.meetingMisses === 1 ? '' : 'es'}
              {evaluation.sundayUnrecorded > 0 ? ` · ${evaluation.sundayUnrecorded} Sunday${evaluation.sundayUnrecorded === 1 ? '' : 's'} not recorded` : ''}
            </p>
          )}
        </div>
        {weeks.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No weeks set up for this cohort.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {[
              { title: 'Sunday class', records: data.sunday, marks: SUNDAY_MARK },
              { title: 'Group meeting', records: data.meeting, marks: MEETING_MARK },
            ].map((row) => (
              <div key={row.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{row.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {weeks.map((week) => {
                    const status = markFor(row.records, week.id);
                    const mark = status ? row.marks[status] : null;
                    const future = !judged.includes(week.weekNumber) && !status;
                    const label = `Week ${week.weekNumber}: ${mark ? mark.label : future ? 'not yet' : 'not recorded'}`;
                    return (
                      <span
                        key={week.id}
                        title={label}
                        aria-label={label}
                        className={`flex w-11 flex-col items-center rounded-xl py-1.5 ${mark ? mark.cls : future ? 'bg-white text-gray-300 ring-1 ring-inset ring-gray-100' : 'bg-neutral-100 text-neutral-500'}`}
                      >
                        <span className="text-[10px] font-medium opacity-80">W{week.weekNumber}</span>
                        <span className="text-sm font-bold">{mark ? mark.letter : '–'}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-gray-500">P present · L late (counts as attended) · A absent · J joined · E excused · M missed · – not recorded</p>
          </div>
        )}
      </section>

      {/* Faith project */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Faith project</h2>
          {data.faithProject && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${FAITH_STATUS[data.faithProject.status]?.cls ?? HEALTH_PILL.neutral}`}>
              {FAITH_STATUS[data.faithProject.status]?.label ?? data.faithProject.status}
            </span>
          )}
        </div>
        {data.faithProject?.body?.trim() || data.faithProject?.title?.trim() ? (
          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3">
            {data.faithProject.title?.trim() && <p className="text-sm font-semibold text-gray-900">{data.faithProject.title}</p>}
            {data.faithProject.body?.trim() && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{data.faithProject.body}</p>}
          </div>
        ) : participant.smartRequest ? (
          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">From registration</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{participant.smartRequest}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No faith project recorded yet.</p>
        )}
        <NavLink to="/faith-projects" className="mt-3 inline-block text-sm font-semibold text-primary">Open faith projects</NavLink>
      </section>

      {/* Check-ins and history */}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-gray-900">Check-ins and history</h2>
        <ul className="mt-3 space-y-2">
          {history.map((item) => (
            <li key={item.id} className="rounded-2xl border border-gray-100 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{formatDate(item.at)}</p>
              </div>
              {item.body && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{item.body}</p>}
              {item.by && <p className="mt-1 text-xs text-gray-500">By {item.by}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* Concerns */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Concerns</h2>
          {openFlags.length > 0 && <span className="rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-700">{openFlags.length} open</span>}
        </div>
        {data.flags.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No concerns raised.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.flags.map((flag) => (
              <ConcernRow key={flag.id} flag={flag} canClear={isAdmin && !!user} onClear={async () => {
                if (!user) return;
                await participantFlagsApi.clear(flag.id, user.id);
                showToast({ message: 'Concern cleared' });
                void load();
              }} />
            ))}
          </ul>
        )}
      </section>

      {/* Completion and department handoff */}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-gray-900">Completion and department</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Completion</p>
          <CompletionStatus evaluation={evaluation} mode={mode} archived={archived} rules={data.rules} />
        </div>
        <DepartmentHandoff
          participant={participant}
          referrals={data.referrals}
          userId={user?.id ?? null}
          onChanged={(message) => { showToast({ message }); void load(); }}
          onError={(message) => showToast({ message, tone: 'error' })}
        />
      </section>

      {user && (
        <>
          <CheckInModal
            isOpen={modal === 'checkin'}
            onClose={() => setModal(null)}
            onSave={async (body) => {
              await participantNotesApi.create({ participantId: participant.id, body, authorId: user.id, groupId: participant.groupId ?? null, noteType: 'CHECK_IN' });
              setModal(null);
              showToast({ message: 'Check-in logged' });
              void load();
            }}
          />
          <StageModal
            isOpen={modal === 'stage'}
            current={journey.find((s) => s.current)?.stage ?? null}
            onClose={() => setModal(null)}
            onSave={async (stage, note) => {
              await participantStageChangesApi.create({ participantId: participant.id, stage, note, changedById: user.id });
              setModal(null);
              showToast({ message: `Moved to ${JOURNEY_STAGES.find((s) => s.stage === stage)?.label}` });
              void load();
            }}
          />
          <FlagModal
            isOpen={modal === 'flag'}
            onClose={() => setModal(null)}
            onSave={async (reason, note) => {
              await participantFlagsApi.raise({
                participantId: participant.id,
                participantName: participant.fullName,
                groupId: participant.groupId ?? null,
                reason,
                note,
                raisedById: user.id,
                raisedByName: user.name,
              });
              setModal(null);
              showToast({ message: 'Concern flagged' });
              void load();
            }}
          />
        </>
      )}
    </div>
  );
};

const CompletionStatus: React.FC<{ evaluation: ParticipantEvaluation | null; mode: string | null; archived: boolean; rules: ProgrammeRules }> = ({ evaluation, mode, archived, rules }) => {
  if (archived) return <span className="text-sm text-gray-500">Withdrawn</span>;
  const completion = evaluation?.completion;
  if (mode !== 'completed' || !completion) return <span className="text-sm text-gray-500">Assessed when the cohort ends</span>;
  if (completion.outcome === 'COMPLETED') {
    return (
      <span className="rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Completed · {completion.score}%{completion.score !== COMPLETION_SCORE_ALL_MEETINGS ? ' (missed a group meeting)' : ''}
      </span>
    );
  }
  if (completion.outcome === 'RECORDS_MISSING') {
    return <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">Missing attendance records</span>;
  }
  return (
    <span className="rounded-full bg-red-100/80 px-2.5 py-1 text-xs font-semibold text-red-700">
      To retake FOF · attended {evaluation!.sundayAttended} Sunday{evaluation!.sundayAttended === 1 ? '' : 's'}{evaluation!.sundayUnrecorded ? `, ${evaluation!.sundayUnrecorded} not recorded` : ''} · needs {rules.completionAttendancePct}%
    </span>
  );
};

const ConcernRow: React.FC<{ flag: ParticipantFlag; canClear: boolean; onClear: () => Promise<void> }> = ({ flag, canClear, onClear }) => {
  const [clearing, setClearing] = useState(false);
  const open = !flag.clearedAt;
  return (
    <li className={`rounded-2xl px-4 py-3 ${open ? 'bg-amber-50/80' : 'border border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${open ? 'text-amber-900' : 'text-gray-700'}`}>{flag.reason}</p>
          {flag.note && <p className="mt-1 text-sm text-gray-700">{flag.note}</p>}
          <p className="mt-1 text-xs text-gray-500">
            Raised by {flag.raisedByName || 'a support'}{flag.weekNumber ? ` · Week ${flag.weekNumber}` : ''} · {formatDate(flag.raisedAt)}
            {!open && ` · Cleared by ${flag.clearedByName || 'operations'} ${formatDate(flag.clearedAt)}`}
          </p>
        </div>
        {open && canClear && (
          <button
            type="button"
            disabled={clearing}
            onClick={async () => { setClearing(true); try { await onClear(); } finally { setClearing(false); } }}
            className="flex-none rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear'}
          </button>
        )}
      </div>
    </li>
  );
};

const TEXTAREA = 'w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const useSaving = () => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save. Try again.'); } finally { setSaving(false); }
  };
  return { saving, error, setError, run };
};

const ModalFooter: React.FC<{ onClose: () => void; saving: boolean; disabled: boolean; label: string; onSave: () => void }> = ({ onClose, saving, disabled, label, onSave }) => (
  <>
    <button type="button" onClick={onClose} disabled={saving} className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
    <button type="button" onClick={onSave} disabled={saving || disabled} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? 'Saving…' : label}</button>
  </>
);

const CheckInModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (body: string) => Promise<void> }> = ({ isOpen, onClose, onSave }) => {
  const [body, setBody] = useState('');
  const { saving, error, setError, run } = useSaving();
  useEffect(() => { if (isOpen) { setBody(''); setError(''); } }, [isOpen, setError]);
  return (
    <ModalShell isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Log a check-in" subtitle="A call, message or conversation with this participant."
      footer={<ModalFooter onClose={onClose} saving={saving} disabled={!body.trim()} label="Save check-in" onSave={() => { void run(() => onSave(body.trim())); }} />}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Called her. Work has been heavy; she'll be back on Sunday." className={TEXTAREA} autoFocus />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ModalShell>
  );
};

const StageModal: React.FC<{ isOpen: boolean; current: JourneyStage | null; onClose: () => void; onSave: (stage: JourneyStage, note: string) => Promise<void> }> = ({ isOpen, current, onClose, onSave }) => {
  const [stage, setStage] = useState<string>('');
  const [note, setNote] = useState('');
  const { saving, error, setError, run } = useSaving();
  useEffect(() => { if (isOpen) { setStage(''); setNote(''); setError(''); } }, [isOpen, setError]);
  return (
    <ModalShell isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Move journey stage" subtitle="Use this when the records can't show it. Your name and the date are saved with it."
      footer={<ModalFooter onClose={onClose} saving={saving} disabled={!stage || stage === current} label="Move" onSave={() => { void run(() => onSave(stage as JourneyStage, note)); }} />}>
      <div className="space-y-3">
        <AppSelect
          value={stage}
          onChange={setStage}
          options={JOURNEY_STAGES.map((s) => ({ value: s.stage, label: s.stage === current ? `${s.label} (current)` : s.label }))}
          placeholder="Choose a stage"
        />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Why? (optional)" className={TEXTAREA} />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
};

const FlagModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (reason: string, note: string) => Promise<void> }> = ({ isOpen, onClose, onSave }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const { saving, error, setError, run } = useSaving();
  useEffect(() => { if (isOpen) { setReason(''); setNote(''); setError(''); } }, [isOpen, setError]);
  return (
    <ModalShell isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Flag a concern" subtitle="Admins are notified, and it stays open until someone clears it."
      footer={<ModalFooter onClose={onClose} saving={saving} disabled={!reason.trim()} label="Flag concern" onSave={() => { void run(() => onSave(reason.trim(), note.trim())); }} />}>
      <div className="space-y-3">
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's the concern?" className={TEXTAREA} autoFocus />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Details (optional)" className={TEXTAREA} />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default AdminParticipantProfilePage;
