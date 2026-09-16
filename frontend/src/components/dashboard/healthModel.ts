import type { Cohort } from '../../types';
import { getIdealWeekNumberForCohort } from '../../utils/weekFocus';

// Turns the raw cohort_health() payload into what the home page shows:
// which mode the cohort is in, per-week figures, the four vital signs and the
// "needs attention" list. Pure functions, no fetching, so they're easy to test.

export interface CohortHealthPayload {
  cohort: { id: string; name: string; startDate: string | null; endDate: string | null; status: string | null; schedulePublished: boolean | null } | null;
  weeks: Array<{ id: number; weekNumber: number; recapUploaded: boolean }>;
  participants: { active: number; archived: number; inGroups: number };
  groups: Array<{ id: string; name: string; supportId: string | null; supportName: string | null; members: number }>;
  attendance: Array<{ weekId: number; groupId: string; marked: number; present: number; late: number; absent: number }>;
  meetings: Array<{ weekId: number; groupId: string }>;
  faithProjects: Record<string, number>;
  followUps: { total: number; contacted: number; replied: number; registered: number; open: number };
  nextCohortPeople: number;
  openFlags: number;
  pendingCover: number;
  sheetSyncProblems: number;
}

export type HealthStatus = 'good' | 'warning' | 'critical' | 'neutral';
export type CohortMode = 'upcoming' | 'running' | 'completed';

// Agreed thresholds: 80%+ on track, 50-80% needs attention, under 50% at risk.
export const statusForRate = (rate: number | null): HealthStatus => {
  if (rate === null || Number.isNaN(rate)) return 'neutral';
  if (rate >= 0.8) return 'good';
  if (rate >= 0.5) return 'warning';
  return 'critical';
};

export const STATUS_LABEL: Record<HealthStatus, string> = {
  good: 'On track',
  warning: 'Needs attention',
  critical: 'At risk',
  neutral: 'Not enough data',
};

const RANK: Record<HealthStatus, number> = { neutral: 0, good: 1, warning: 2, critical: 3 };
export const worstStatus = (statuses: HealthStatus[]): HealthStatus =>
  statuses.reduce<HealthStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'neutral');

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOnly = (value?: string | null) => (value ? String(value).slice(0, 10) : null);

export const cohortMode = (cohort: Pick<Cohort, 'startDate' | 'endDate' | 'status'>, now = new Date()): CohortMode => {
  const today = dayKey(now);
  if (cohort.status === 'COMPLETED') return 'completed';
  const end = dateOnly(cohort.endDate);
  if (end && today > end) return 'completed';
  const start = dateOnly(cohort.startDate);
  if (start && today < start) return 'upcoming';
  return 'running';
};

export interface WeekStat {
  weekId: number;
  weekNumber: number;
  groupsWithMembers: number;
  recordedGroups: number;
  recordingRate: number | null;
  marked: number;
  attended: number;
  attendanceRate: number | null;
  meetingsSubmitted: number;
  meetingRate: number | null;
  recapUploaded: boolean;
}

export const buildWeekStats = (data: CohortHealthPayload): WeekStat[] => {
  const activeGroups = data.groups.filter((g) => g.members > 0);
  const activeGroupIds = new Set(activeGroups.map((g) => g.id));
  const groupCount = activeGroups.length;

  return [...data.weeks]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => {
      const rows = data.attendance.filter((row) => row.weekId === week.id && activeGroupIds.has(row.groupId));
      const recordedGroups = new Set(rows.map((row) => row.groupId)).size;
      const marked = rows.reduce((sum, row) => sum + Number(row.marked), 0);
      const attended = rows.reduce((sum, row) => sum + Number(row.present) + Number(row.late), 0);
      const meetingsSubmitted = new Set(
        data.meetings.filter((m) => m.weekId === week.id && activeGroupIds.has(m.groupId)).map((m) => m.groupId),
      ).size;
      return {
        weekId: week.id,
        weekNumber: week.weekNumber,
        groupsWithMembers: groupCount,
        recordedGroups,
        recordingRate: groupCount ? recordedGroups / groupCount : null,
        marked,
        attended,
        attendanceRate: marked ? attended / marked : null,
        meetingsSubmitted,
        meetingRate: groupCount ? meetingsSubmitted / groupCount : null,
        recapUploaded: week.recapUploaded,
      };
    });
};

/** The week the cohort is in right now, clamped to the weeks that exist. */
export const currentWeekNumber = (cohort: Pick<Cohort, 'startDate'>, stats: WeekStat[], now = new Date()) => {
  if (stats.length === 0) return 0;
  const ideal = getIdealWeekNumberForCohort(cohort, now);
  return Math.min(Math.max(ideal, 1), stats[stats.length - 1].weekNumber);
};

export interface GroupEngagement {
  id: string;
  name: string;
  supportName: string | null;
  members: number;
  weeksCounted: number;
  weeksRecorded: number;
  reportsSubmitted: number;
  score: number;
  recentGap: number;
}

/** Per-group engagement over the weeks that have happened, weakest first. */
export const buildGroupEngagement = (data: CohortHealthPayload, weekNumbers: number[]): GroupEngagement[] => {
  const weekIds = new Set(data.weeks.filter((w) => weekNumbers.includes(w.weekNumber)).map((w) => w.id));
  const weekIdByNumber = new Map(data.weeks.map((w) => [w.weekNumber, w.id]));
  const recentWeeks = [...weekNumbers].sort((a, b) => b - a).slice(0, 3);

  return data.groups
    .filter((g) => g.members > 0)
    .map((g) => {
      const recorded = new Set(data.attendance.filter((a) => a.groupId === g.id && weekIds.has(a.weekId)).map((a) => a.weekId));
      const reports = new Set(data.meetings.filter((m) => m.groupId === g.id && weekIds.has(m.weekId)).map((m) => m.weekId));
      const weeksCounted = weekIds.size;
      // How many of the last three weeks had no attendance recorded at all.
      const recentGap = recentWeeks.filter((n) => !recorded.has(weekIdByNumber.get(n) as number)).length;
      const score = weeksCounted ? (recorded.size + reports.size) / (weeksCounted * 2) : 0;
      return {
        id: g.id,
        name: g.name,
        supportName: g.supportName,
        members: g.members,
        weeksCounted,
        weeksRecorded: recorded.size,
        reportsSubmitted: reports.size,
        score,
        recentGap,
      };
    })
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, undefined, { numeric: true }));
};

export const faithProjectCounts = (data: CohortHealthPayload) => {
  const fp = data.faithProjects ?? {};
  const approved = Number(fp.APPROVED ?? 0);
  // Anything past "not drafted" means the participant has started one.
  const started = Object.entries(fp).reduce((sum, [status, n]) => (status === 'NOT_DRAFTED' ? sum : sum + Number(n)), 0);
  const active = Number(data.participants.active);
  return { approved, started, notStarted: Math.max(0, active - started), active };
};

export interface AttentionItem {
  key: string;
  status: HealthStatus;
  text: string;
  actionLabel: string;
  to?: string;
  action?: 'assignNextCohort';
}

/** Weeks that are over and can fairly be judged. A finished cohort is judged on every week. */
export const judgedWeekNumbers = (mode: CohortMode, stats: WeekStat[], currentWeek: number): number[] => {
  if (mode === 'upcoming') return [];
  if (mode === 'completed') return stats.map((s) => s.weekNumber);
  return stats.filter((s) => s.weekNumber < currentWeek).map((s) => s.weekNumber);
};

export const buildAttention = (
  data: CohortHealthPayload,
  mode: CohortMode,
  stats: WeekStat[],
  currentWeek: number,
  extras: { pendingApprovals: number },
): AttentionItem[] => {
  const items: AttentionItem[] = [];
  const activeGroups = data.groups.filter((g) => g.members > 0);
  const noSupport = data.groups.filter((g) => !g.supportId).length;
  const unplaced = Math.max(0, Number(data.participants.active) - Number(data.participants.inGroups));

  if (mode === 'running' && stats.length) {
    const judged = judgedWeekNumbers(mode, stats, currentWeek);
    const lastFull = judged.length ? Math.max(...judged) : null;
    if (judged.length >= 3) {
      const gaps = buildGroupEngagement(data, judged).filter((g) => g.recentGap === 3).length;
      if (gaps > 0) {
        items.push({
          key: 'attendance-gap',
          status: gaps / Math.max(activeGroups.length, 1) >= 0.5 ? 'critical' : 'warning',
          text: `Attendance not recorded for the last 3 weeks in ${gaps} group${gaps === 1 ? '' : 's'}`,
          actionLabel: 'Open attendance',
          to: '/attendance',
        });
      }
    }
    if (lastFull !== null) {
      const week = stats.find((s) => s.weekNumber === lastFull)!;
      const missing = week.groupsWithMembers - week.meetingsSubmitted;
      if (missing > 0) {
        items.push({
          key: 'reports-missing',
          status: statusForRate(week.meetingRate),
          text: `${missing} meeting report${missing === 1 ? '' : 's'} missing for Week ${lastFull}`,
          actionLabel: 'Open meetings',
          to: '/group-prayers',
        });
      }
    }
    const recapsMissing = stats.filter((s) => s.weekNumber < currentWeek && !s.recapUploaded).length;
    if (recapsMissing > 0) {
      items.push({
        key: 'recaps',
        status: 'warning',
        text: `${recapsMissing} weekly recap${recapsMissing === 1 ? '' : 's'} not uploaded`,
        actionLabel: 'Upload',
        to: '/cohorts',
      });
    }
  }

  if (mode !== 'completed') {
    if (noSupport > 0) {
      items.push({ key: 'no-support', status: 'warning', text: `${noSupport} group${noSupport === 1 ? ' has' : 's have'} no support`, actionLabel: 'Assign', to: '/groups' });
    }
    if (unplaced > 0) {
      items.push({ key: 'unplaced', status: 'warning', text: `${unplaced} participant${unplaced === 1 ? ' is' : 's are'} not in a group`, actionLabel: 'Place', to: '/allocation' });
    }
  }

  if (data.nextCohortPeople > 0) {
    const text = `${data.nextCohortPeople} ${data.nextCohortPeople === 1 ? 'person' : 'people'} said they'd join the next cohort`;
    // Once a cohort is over there's nowhere to move them yet, so point at creating the next one.
    items.push(mode === 'completed'
      ? { key: 'next-cohort', status: 'warning', text, actionLabel: 'Create cohort', to: '/cohorts' }
      : { key: 'next-cohort', status: 'warning', text, actionLabel: 'Assign', action: 'assignNextCohort' });
  }
  if (data.openFlags > 0) {
    items.push({ key: 'flags', status: 'warning', text: `${data.openFlags} open concern${data.openFlags === 1 ? '' : 's'} about participants`, actionLabel: 'Review', to: '/participants' });
  }
  if (data.pendingCover > 0) {
    items.push({ key: 'cover', status: 'warning', text: `${data.pendingCover} cover request${data.pendingCover === 1 ? '' : 's'} waiting for a support`, actionLabel: 'Assign', to: '/approvals' });
  }
  if (extras.pendingApprovals > 0) {
    items.push({ key: 'approvals', status: 'warning', text: `${extras.pendingApprovals} schedule change${extras.pendingApprovals === 1 ? '' : 's'} to approve`, actionLabel: 'Review', to: '/approvals' });
  }
  if (data.sheetSyncProblems > 0) {
    items.push({ key: 'sheet', status: 'critical', text: `${data.sheetSyncProblems} lead${data.sheetSyncProblems === 1 ? '' : 's'} had trouble reaching the Google sheet`, actionLabel: 'View', to: '/follow-ups' });
  }

  const order: Record<HealthStatus, number> = { critical: 0, warning: 1, good: 2, neutral: 3 };
  return items.sort((a, b) => order[a.status] - order[b.status]);
};

export interface DashboardModel {
  mode: CohortMode;
  stats: WeekStat[];
  currentWeek: number;
  judged: number[];
  judgedStats: WeekStat[];
  lastJudged: WeekStat | null;
  engagement: GroupEngagement[];
  faith: ReturnType<typeof faithProjectCounts>;
  attention: AttentionItem[];
}

export const buildDashboardModel = (
  data: CohortHealthPayload,
  cohort: Pick<Cohort, 'startDate' | 'endDate' | 'status'>,
  pendingApprovals: number,
  now = new Date(),
): DashboardModel => {
  const mode = cohortMode(cohort, now);
  const stats = buildWeekStats(data);
  const currentWeek = mode === 'completed'
    ? (stats[stats.length - 1]?.weekNumber ?? 0)
    : mode === 'upcoming' ? 0 : currentWeekNumber(cohort, stats, now);
  const judged = judgedWeekNumbers(mode, stats, currentWeek);
  const judgedStats = stats.filter((s) => judged.includes(s.weekNumber));
  return {
    mode,
    stats,
    currentWeek,
    judged,
    judgedStats,
    lastJudged: judgedStats[judgedStats.length - 1] ?? null,
    engagement: buildGroupEngagement(data, judged),
    faith: faithProjectCounts(data),
    attention: buildAttention(data, mode, stats, currentWeek, { pendingApprovals }),
  };
};
