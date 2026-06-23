import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ActivityText from '../components/ActivityText';
import LabelChip from '../components/LabelChip';
import { PeriodBadge } from '../components/PeriodIcon';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi, faithProjectsApi, groupsApi, participantsApi, resourcesApi } from '../services/api';
import type { Announcement, FaithProject, Group, Participant } from '../types';
import { getCurrentProgramDayName, getProgramDayIndex } from '../utils/schedule';
import { sortByText } from '../utils/sort';
import { getIdealWeekNumberForCohort } from '../utils/weekFocus';
import { useWalkthrough } from '../hooks/useWalkthrough';
import WalkthroughPopup from '../components/walkthrough/WalkthroughPopup';

type HomeActivity = {
  id: number;
  description: string;
  time: string;
  period: string;
  labels?: Array<{ id: string; name: string; color: string }>;
  dayName: string;
  dayIndex: number;
};



const SupportHomePage: React.FC = () => {
  const { user, userLabelIds, userCohortIds } = useAuth();
  const { activeCohort, selectedWeek, weeks, newResourceCount, liveRevision } = useAppData();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [resourceCount, setResourceCount] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [faithProjects, setFaithProjects] = useState<FaithProject[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [tickNow, setTickNow] = useState(() => new Date());

  const wt = useWalkthrough('home');

  useEffect(() => {
    if (!user) return;
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user.id,
      isAdmin: false,
      accessibleCohortIds: userCohortIds,
    }).then((res) => setAnnouncements(res.announcements.slice(0, 3))).catch(() => {});
  }, [activeCohort?.id, liveRevision, user, userCohortIds]);

  useEffect(() => {
    resourcesApi.getAll()
      .then((res) => setResourceCount(res.resources.length))
      .catch(() => setResourceCount(0));
  }, [liveRevision]);

  useEffect(() => {
    if (!user || !activeCohort) {
      setParticipants([]);
      setFaithProjects([]);
      return;
    }
    Promise.all([
      participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }).catch(() => ({ participants: [] as Participant[] })),
      faithProjectsApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ projects: [] as FaithProject[] })),
    ])
      .then(([participantsRes, faithProjectsRes]) => {
        setParticipants(sortByText(participantsRes.participants, (participant) => participant.fullName));
        setFaithProjects(sortByText(faithProjectsRes.projects, (project) => project.title || project.participantName));
      })
      .catch(() => {
        setParticipants([]);
        setFaithProjects([]);
      });
  }, [activeCohort, user, liveRevision]);

  useEffect(() => {
    if (!user || !activeCohort) { setMyGroups([]); return; }
    groupsApi.getAll({ cohortId: activeCohort.id })
      .then((res) => setMyGroups(res.groups.filter((g) => g.supportId === user.id)))
      .catch(() => setMyGroups([]));
  }, [activeCohort, user, liveRevision]);

  // Ticking clock so open sessions roll over at Sunday-10am boundaries
  useEffect(() => {
    const id = setInterval(() => setTickNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/dashboard" replace />;
  }

  const activeWeek = selectedWeek || weeks[0] || null;
  const todayName = getCurrentProgramDayName();
  const now = tickNow;
  const cohortWeeks = useMemo(
    () => (weeks ?? []).filter((week) => week.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );
  const currentWeekPosition = activeWeek ? cohortWeeks.findIndex((week) => week.id === activeWeek.id) + 1 : 0;

  const schedulePublished = activeCohort?.schedulePublished !== false;
  const myActivities = useMemo(() => {
    if (!activeWeek || userLabelIds.length === 0 || !schedulePublished) return [];
    return activeWeek.days.flatMap((day) =>
      day.activities
        .filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id)))
        .map((activity) => ({
          ...activity,
          dayName: day.dayName,
          dayIndex: getProgramDayIndex(day.dayName),
        })),
    );
  }, [activeWeek, userLabelIds, schedulePublished]);
  const todayActivities = myActivities.filter((activity) => activity.dayName === todayName);
  // Next Group Prayer: computed from the group's locked meeting slot
  const myGroup = myGroups[0] ?? null;
  const nextGroupPrayerDisplay = (() => {
    if (!myGroup?.meetingDay || !myGroup?.meetingTime) return null;
    const [h, m] = myGroup.meetingTime.split(':').map(Number);
    const dayLabel = myGroup.meetingDay.charAt(0) + myGroup.meetingDay.slice(1).toLowerCase();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const displayM = String(m).padStart(2, '0');
    return { label: `${dayLabel}, ${displayH}:${displayM} ${ampm}`, detail: 'Weekly group meeting' };
  })();
  const draftedProjectCount = useMemo(() => {
    const participantIds = new Set(participants.map((participant) => participant.id));
    return faithProjects.filter(
      (project) => participantIds.has(project.participantId) && ['UNDER_REFINEMENT', 'NEEDS_REFINEMENT', 'APPROVED'].includes(project.status)
    ).length;
  }, [faithProjects, participants]);
  // Next class: the week after the current program week (rolls Sunday 10am)
  const currentIdealWeekNumber = getIdealWeekNumberForCohort(activeCohort, now);
  const currentIdealIndex = cohortWeeks.findIndex((w) => w.weekNumber === currentIdealWeekNumber);
  const nextWeek = currentIdealIndex >= 0 ? cohortWeeks[currentIdealIndex + 1] ?? null : null;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle={activeCohort ? `${activeCohort.name} is running. Here is what is lined up for you.` : 'Here is what is lined up for you today.'}
        onHelp={wt.reopen}
      />

      <section data-wt="home-metrics" className="mb-6 rounded-[24px] border border-orange-100 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.14),_transparent_52%),linear-gradient(180deg,_#fffaf5_0%,_#ffffff_76%)] px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-primary/80">Programme progress</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
                {activeWeek ? `Week ${activeWeek.weekNumber}` : 'No week selected'}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {cohortWeeks.length > 0 && currentWeekPosition > 0
                  ? `${currentWeekPosition} of ${cohortWeeks.length}`
                  : 'Your current cohort timeline will show here once weeks are available.'}
              </p>
            </div>
            <NavLink to="/support/schedule" className="whitespace-nowrap text-xs font-semibold text-primary hover:text-primary-dark">
              Open schedule
            </NavLink>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <QuickStat title="Activities today" value={todayActivities.length} detail={todayName} to="/support/schedule" accent="orange" />
            <QuickStat title="Next Group Meeting" value={nextGroupPrayerDisplay?.label ?? 'Not set'} detail={nextGroupPrayerDisplay?.detail ?? 'No meeting slot set'} to="/support/participants" accent="rose" />
            <QuickStat title="Faith Projects" value={`${draftedProjectCount}/${participants.length}`} detail={participants.length > 0 ? 'Participants drafted' : 'No participants yet'} to="/support/participants" accent="emerald" />
            <QuickStat title="Next class" value={nextWeek?.title?.trim() || 'Not set'} detail={nextWeek ? `Week ${nextWeek.weekNumber}` : 'Programme complete'} to="/support/schedule" accent="sky" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div data-wt="home-schedule" className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Today's plan</h3>
              <p className="text-sm text-gray-500">{activeWeek ? `${todayName} in Week ${activeWeek.weekNumber}` : 'No week selected'}</p>
            </div>
            <NavLink to="/support/schedule" className="text-sm font-semibold text-primary hover:text-primary-dark">Open schedule</NavLink>
          </div>
            <div className="space-y-3">
            {todayActivities.length === 0 ? (
              <EmptyState text={!schedulePublished ? 'Schedule not published yet. Check back once your coordinator publishes it.' : userLabelIds.length === 0 ? 'No activities are assigned to your tags yet.' : 'Nothing scheduled for you today in this week.'} />
            ) : todayActivities.slice(0, 6).map((activity) => (
              <div key={`${activity.id}-${activity.dayName}`} className="surface-muted rounded-2xl px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900"><ActivityText text={activity.description} /></p>
                    <p className="mt-1 text-xs text-gray-500">{activity.dayName} • {activity.time}</p>
                  </div>
                  <PeriodBadge period={activity.period} compact />
                </div>
                {activity.labels && activity.labels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activity.labels.map((label) => (
                      <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">Recent announcements</h3>
                <p className="text-sm text-gray-500">Messages meant for you and everyone else.</p>
              </div>
              <NavLink to="/support/announcements" className="whitespace-nowrap text-xs font-semibold text-primary hover:text-primary-dark">View all</NavLink>
            </div>
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <EmptyState text="No announcements have been posted yet." />
              ) : announcements.map((item) => (
                <div key={item.id} className="surface-muted px-4 py-4">
                  <p className="text-sm font-semibold text-gray-900">{item.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card p-6">
            <h3 className="text-lg font-semibold text-gray-900">Quick links</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink to="/support/participants" label="My group" />
              <QuickLink to="/support/resources" label="Browse resources" />
              <QuickLink to="/support/announcements" label="View announcements" />
              <QuickLink to="/support/follow-ups" label="My follow-ups" />
              <QuickLink to="/support/profile" label="Profile & alerts" />
            </div>
          </div>
        </div>
      </div>

      {wt.show && (
        <WalkthroughPopup
          steps={[
            { targetSelector: '[data-wt="home-metrics"]', title: 'Your week at a glance', body: 'This top section shows where you are in the cohort and the most useful next numbers to check before you move.', position: 'bottom' },
            { targetSelector: '[data-wt="home-schedule"]', title: "Today's activities", body: 'Your activities for today show up here. Tap "Open schedule" to see the full week and mark things done.', position: 'top' },
          ]}
          onDone={wt.done}
          onSkip={wt.skipAll}
        />
      )}
    </div>
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-8 text-center text-sm text-gray-500">
    {text}
  </div>
);

const QUICK_STAT_ACCENTS = {
  orange: 'bg-white text-gray-950 border-orange-100',
  rose: 'bg-rose-50/70 text-gray-950 border-rose-100',
  emerald: 'bg-emerald-50/70 text-gray-950 border-emerald-100',
  sky: 'bg-sky-50/70 text-gray-950 border-sky-100',
} as const;

const QuickStat: React.FC<{
  title: string;
  value: React.ReactNode;
  detail: string;
  to: string;
  accent: keyof typeof QUICK_STAT_ACCENTS;
}> = ({ title, value, detail, to, accent }) => (
  <NavLink to={to} className={`min-h-[124px] rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-sm ${QUICK_STAT_ACCENTS[accent]}`}>
    <p className="text-xs font-semibold text-gray-500">{title}</p>
    <p className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-gray-950 sm:text-2xl">{value}</p>
    <p className="mt-2 line-clamp-2 text-xs text-gray-500">{detail}</p>
  </NavLink>
);

const QuickLink: React.FC<{ to: string; label: string }> = ({ to, label }) => (
  <NavLink to={to} className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4 text-sm font-semibold text-gray-700 hover:bg-orange-100/70">
    {label}
  </NavLink>
);

export default SupportHomePage;
