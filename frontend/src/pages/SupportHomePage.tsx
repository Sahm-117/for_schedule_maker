import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ActivityText from '../components/ActivityText';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi, faithProjectsApi, groupsApi, participantCheckInsApi, participantsApi, resourcesApi, supportActivityCompletionsApi, supportChecklistApi } from '../services/api';
import type { Announcement, FaithProject, Group, Participant, ParticipantCheckIn, SupportActivityCompletion, SupportChecklistItem, User } from '../types';
import { getCurrentProgramDayName, getProgramDayIndex } from '../utils/schedule';
import { sortByText } from '../utils/sort';
import { getIdealWeekNumberForCohort } from '../utils/weekFocus';
import { normalizeLink } from '../utils/links';
import { CountdownRing, useChecklistAutoHide } from '../components/ChecklistAutoHide';

type HomeActivity = {
  id: number;
  description: string;
  time: string;
  period: string;
  labels?: Array<{ id: string; name: string; color: string }>;
  dayName: string;
  dayIndex: number;
};

const PERIOD_LABEL: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
};

const SupportHomePage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role !== 'SUPPORT') return <Navigate to="/dashboard" replace />;
  return <SupportHomeContent user={user} />;
};

const SupportHomeContent: React.FC<{ user: User }> = ({ user }) => {
  const { userLabelIds, userCohortIds } = useAuth();
  const { activeCohort, selectedWeek, weeks, newResourceCount, liveRevision, myHub } = useAppData();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [resourceCount, setResourceCount] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [faithProjects, setFaithProjects] = useState<FaithProject[]>([]);
  const [helpRequests, setHelpRequests] = useState<ParticipantCheckIn[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [tickNow, setTickNow] = useState(() => new Date());
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  const [completionSavingIds, setCompletionSavingIds] = useState<number[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState<SupportChecklistItem[]>([]);
  const [homeAnnouncement, setHomeAnnouncement] = useState<Announcement | null>(null);
  const autoHide = useChecklistAutoHide();

  // Sunday-evening nudge for a hub lead who hasn't marked this week's recap yet.
  const isHubLead = !!myHub?.isLead;
  const recapMarkedThisWeek = useMemo(() => {
    if (!selectedWeek) return true;
    return (myHub?.myAttendance ?? []).some((a) => a.type === 'SUNDAY_RECAP' && a.weekId === selectedWeek.id);
  }, [myHub?.myAttendance, selectedWeek]);
  const showRecapNudge = isHubLead && !recapMarkedThisWeek && tickNow.getDay() === 0 && tickNow.getHours() >= 17;


  useEffect(() => {
    if (!user) return;
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user.id,
      isAdmin: false,
      accessibleCohortIds: userCohortIds,
      userLabelIds,
    }).then((res) => {
      setAnnouncements(res.announcements.slice(0, 1));
      setHomeAnnouncement(res.announcements.find((item) => item.showOnHome && item.homeUntil && new Date(item.homeUntil).getTime() > Date.now()) ?? null);
    }).catch(() => {});
  }, [activeCohort?.id, liveRevision, user, userCohortIds, userLabelIds]);

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
        // Unanswered "I need help" from the participant app.
        participantCheckInsApi.getForParticipants(participantsRes.participants.map((participant) => participant.id))
          .then(({ checkIns }) => setHelpRequests(checkIns.filter((checkIn) => checkIn.response === 'NEED_HELP' && !checkIn.handledAt)))
          .catch(() => setHelpRequests([]));
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

  const activeWeekId = (selectedWeek || weeks[0] || null)?.id ?? null;
  useEffect(() => {
    if (!user || activeWeekId === null) { setCompletions([]); return; }
    let cancelled = false;
    supportActivityCompletionsApi.getMineForWeek(activeWeekId, user.id)
      .then((response) => { if (!cancelled) setCompletions(response.completions); })
      .catch(() => { if (!cancelled) setCompletions([]); });
    return () => { cancelled = true; };
  }, [activeWeekId, user, liveRevision]);

  useEffect(() => {
    if (!user || activeWeekId === null) { setChecklist([]); return; }
    let cancelled = false;
    supportChecklistApi.getForWeek(user.id, activeWeekId)
      .then(({ items }) => { if (!cancelled) setChecklist(items); })
      .catch(() => { if (!cancelled) setChecklist([]); });
    return () => { cancelled = true; };
  }, [activeWeekId, user, liveRevision]);

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
  const todayActivities: HomeActivity[] = myActivities.filter((activity) => activity.dayName === todayName);
  const completedActivityIds = new Set(completions.map((completion) => completion.activityId));

  const toggleActivityDone = async (activityId: number) => {
    if (completionSavingIds.includes(activityId)) return;
    setCompletionSavingIds((prev) => [...prev, activityId]);
    try {
      if (completedActivityIds.has(activityId)) {
        await supportActivityCompletionsApi.markUndone(activityId, user.id);
        setCompletions((prev) => prev.filter((completion) => completion.activityId !== activityId));
      } else {
        const response = await supportActivityCompletionsApi.markDone(activityId, user.id);
        setCompletions((prev) => [...prev.filter((completion) => completion.activityId !== activityId), response.completion]);
      }
    } catch (error) {
      console.warn('Failed to update activity completion:', error);
    } finally {
      setCompletionSavingIds((prev) => prev.filter((id) => id !== activityId));
    }
  };

  const toggleChecklistItem = async (item: SupportChecklistItem) => {
    setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: !item.done } : entry));
    if (item.done) autoHide.cancel(item.id); else autoHide.start(item.id);
    try {
      await supportChecklistApi.setDone(item.id, !item.done);
    } catch {
      autoHide.cancel(item.id);
      setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: item.done } : entry));
    }
  };

  // Next Group Prayer: computed from the group's locked meeting slot
  const myGroup = myGroups[0] ?? null;
  // Same resolution as GroupCallCard: the group's own link, falling back to the
  // support's WhatsApp group link for older groups that never set one.
  const groupCallLink = normalizeLink(myGroup?.callLink?.trim() || user.whatsappGroupUrl?.trim() || '') || null;
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

  const checkedCount = checklist.filter((item) => item.done).length;
  const checklistPct = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;
  const todayEmptyText = !schedulePublished
    ? 'Schedule not published yet. Check back once your coordinator publishes it.'
    : userLabelIds.length === 0
      ? 'No activities are assigned to your tags yet.'
      : 'Nothing scheduled for you today.';

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle={activeCohort ? `${activeCohort.name} is running. Here is what is lined up for you.` : 'Here is what is lined up for you today.'}
        tourId="support:home"
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
          <section data-wt="home-metrics" className="rounded-[22px] border border-[#ffdeca] bg-white p-5 shadow-[0_2px_6px_-2px_rgba(17,24,39,0.08)]">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">Programme progress</p>
              <NavLink to="/support/schedule" className="ml-auto text-[13px] font-bold text-[#c2410c]">Open schedule →</NavLink>
            </div>
            <h2 className="mt-1.5 text-[26px] font-extrabold text-gray-900">
              {activeWeek ? `Week ${activeWeek.weekNumber}` : 'No week selected'}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {cohortWeeks.length > 0 && currentWeekPosition > 0
                ? `${currentWeekPosition} of ${cohortWeeks.length}`
                : 'Your current cohort timeline will show here once weeks are available.'}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickStat title="Activities today" value={todayActivities.length} detail={todayName} to="/support/schedule" tone="plain" />
              <QuickStat title="Next Group Meeting" value={nextGroupPrayerDisplay?.label ?? 'Not set'} detail={nextGroupPrayerDisplay?.detail ?? 'Weekly group meeting'} to="/support/participants" tone="rose" />
              <QuickStat title="Faith Projects" value={`${draftedProjectCount}/${participants.length}`} detail={participants.length > 0 ? 'Participants drafted' : 'No participants yet'} to="/support/participants" tone="green" />
              <QuickStat title="Next class" value={nextWeek?.title?.trim() || 'Not set'} detail={nextWeek ? "This week's topic" : 'Programme complete'} to="/support/schedule" tone="blue" />
            </div>
          </section>

          {homeAnnouncement && (
            <section className="rounded-[18px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#b91c1c]">
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m3 11 18-5v12L3 13v-2ZM11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
                Urgent
              </div>
              <p className="mt-1.5 text-[15px] font-bold text-gray-900">{homeAnnouncement.subject}</p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-600">{homeAnnouncement.body}</p>
              {homeAnnouncement.linkUrl && (/^https?:\/\//i.test(homeAnnouncement.linkUrl) ? (
                <a href={homeAnnouncement.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-[#b91c1c] px-3.5 text-[13px] font-semibold text-white">
                  {homeAnnouncement.linkLabel || 'Open'}
                </a>
              ) : (
                <NavLink to={homeAnnouncement.linkUrl} className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-[#b91c1c] px-3.5 text-[13px] font-semibold text-white">
                  {homeAnnouncement.linkLabel || 'Open'}
                </NavLink>
              ))}
            </section>
          )}

          {helpRequests.length > 0 && (
            <section className="rounded-[18px] bg-red-100/80 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-red-700">Asked for help</p>
              <p className="mt-1.5 text-[15px] font-bold text-gray-900">
                {helpRequests
                  .map((request) => participants.find((participant) => participant.id === request.participantId)?.fullName)
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">They answered &ldquo;I need help&rdquo; in the participant app. Please reach out today.</p>
              <NavLink to="/support/participants" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-red-700 px-3.5 text-[13px] font-semibold text-white">
                Open my group
              </NavLink>
            </section>
          )}

          {showRecapNudge && (
            <section className="rounded-[18px] bg-amber-100/80 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-amber-700">Hub recap</p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-700">This week's Sunday recap attendance isn't marked yet.</p>
              <NavLink to="/support/my-hub" className="mt-3 inline-flex min-h-[38px] items-center rounded-[10px] bg-amber-700 px-3.5 text-[13px] font-semibold text-white">
                Mark recap
              </NavLink>
            </section>
          )}

          <NavLink
            to="/support/attendance"
            data-wt="home-attendance"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-[#3f4757] px-2.5 py-3.5 text-[13px] font-bold text-white sm:min-h-[56px] sm:justify-start sm:gap-2.5 sm:px-[22px] sm:py-4 sm:text-[15px]"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0-2h6v3H9V3Zm-1 9 2 2 4-4" /></svg>
            Mark attendance
          </NavLink>

          <div data-wt="home-quick-links" className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <QuickLink
              to={groupCallLink ? undefined : '/support/participants'}
              href={groupCallLink ?? undefined}
              label="Join call"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 10.5 21 7v10l-6-3.5ZM3 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />}
            />
            <QuickLink to="/support/schedule?tab=checklist" label="My Tasks" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 11l3 3L22 4M2 12a10 10 0 1 0 5-8.66" />} />
            <QuickLink to="/support/resources" label="Resources" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Zm0 17A2.5 2.5 0 0 1 6.5 19H20" />} />
            <QuickLink to="/support/recap" label="Recap" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6" />} />
          </div>

          <section data-wt="home-schedule" className="overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex flex-wrap items-center gap-3 px-5 pb-3.5 pt-[18px]">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Today</h2>
                <p className="mt-0.5 text-[13px] text-gray-500">{activeWeek ? `${todayName} · Week ${activeWeek.weekNumber}` : todayName}</p>
              </div>
              <span className="ml-auto flex-none rounded-full bg-primary px-[11px] py-1 text-xs font-bold text-white">{todayActivities.length}</span>
            </div>

            {todayActivities.length === 0 ? (
              <p className="px-5 pb-2 pt-2 text-sm leading-relaxed text-gray-500">{todayEmptyText}</p>
            ) : (
              <div className="flex flex-col gap-2.5 px-5 pb-1">
                {todayActivities.map((activity) => {
                  const done = completedActivityIds.has(activity.id);
                  const saving = completionSavingIds.includes(activity.id);
                  return (
                    <div key={`${activity.id}-${activity.dayName}`} className="rounded-2xl border border-[#f4ece5] bg-[#fffdfb] p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{activity.time}</span>
                        <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563eb]">{PERIOD_LABEL[activity.period] ?? activity.period}</span>
                      </div>
                      <p className="mt-1.5 text-[15.5px] font-bold leading-snug text-gray-900"><ActivityText text={activity.description} /></p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {activity.labels?.filter((label) => userLabelIds.includes(label.id)).map((label) => (
                          <span key={label.id} className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">{label.name}</span>
                        ))}
                        <button
                          type="button"
                          onClick={() => { void toggleActivityDone(activity.id); }}
                          disabled={saving}
                          className={`ml-auto min-h-[40px] flex-none rounded-[10px] border px-3.5 py-2 text-[12.5px] font-semibold transition disabled:opacity-60 ${done ? 'border-[#15803d] bg-[#15803d] text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                          {saving ? 'Saving…' : done ? '✓ Done' : 'Mark done'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <NavLink to="/support/schedule" className="mt-3.5 block w-full border-t border-[#f4f5f7] p-3.5 text-center text-[13.5px] font-semibold text-[#c2410c]">
              See the full week →
            </NavLink>
          </section>

          <section data-wt="home-checklist" className="overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
            <div className="flex items-center gap-2 pr-5">
            <button
              type="button"
              onClick={() => setChecklistOpen((open) => !open)}
              aria-expanded={checklistOpen}
              className="flex min-w-0 flex-1 items-center gap-3 pb-3 pl-5 pt-[18px] text-left"
            >
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-gray-900">Weekly checklist</h2>
                <p className="mt-0.5 text-[13px] text-gray-500">{checkedCount} of {checklist.length} done this week</p>
              </div>
              <svg className={`ml-auto h-4 w-4 flex-none text-gray-400 transition-transform ${checklistOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
            </button>            </div>
            <div className="px-5 pb-4">
              <div className="h-[7px] overflow-hidden rounded-full bg-[#f4f5f7]">
                <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${checklistPct}%` }} />
              </div>
            </div>
            {checklistOpen && (
              <div className="flex flex-col gap-0.5 px-5 pb-5">
                {checklist.filter((item) => autoHide.isVisible(item)).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { void toggleChecklistItem(item); }}
                    className="flex w-full items-center gap-[11px] py-2 text-left"
                  >
                    <span className={`grid h-[19px] w-[19px] flex-none place-items-center rounded-md border-[1.5px] text-[11px] text-white ${item.done ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}>
                      {item.done ? '✓' : ''}
                    </span>
                    <span className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
                    {autoHide.countdowns[item.id] !== undefined && <CountdownRing seconds={autoHide.countdowns[item.id]} />}
                  </button>
                ))}
                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => autoHide.setShowCompleted((value) => !value)}
                    aria-pressed={autoHide.showCompleted}
                    className="mt-1.5 self-start text-xs font-semibold text-primary"
                  >
                    {autoHide.showCompleted ? 'Hide completed' : `Show completed (${checkedCount})`}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="flex w-full min-w-0 flex-[1_1_280px] flex-col gap-5 self-start rounded-[22px] border border-[#ffeadb] bg-[#fffaf5] p-[18px] shadow-[0_2px_6px_-2px_rgba(17,24,39,0.08)] lg:sticky lg:top-24 lg:max-w-[340px]">
          <section>
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-sm font-bold text-gray-600">Recent announcements</h2>
              <NavLink to="/support/announcements" className="ml-auto text-xs font-semibold text-[#c2410c]">View all</NavLink>
            </div>
            <div className="mt-3 flex flex-col gap-2.5">
              {announcements.length === 0 ? (
                <p className="rounded-2xl border border-[#f4ece5] bg-white p-3.5 text-[13px] text-gray-500">No announcements have been posted yet.</p>
              ) : announcements.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#f4ece5] bg-white p-3.5">
                  <p className="text-sm font-bold text-gray-900">{item.subject}</p>
                  <p className="mt-1 line-clamp-3 text-[13px] text-gray-600">{item.body}</p>
                  <p className="mt-2 text-[11px] text-gray-500">{formatWhen(item.sentAt)}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
};

const QUICK_STAT_TONES = {
  plain: { box: 'border-[#f1f2f5] bg-white', title: 'text-gray-500', detail: 'text-gray-400' },
  rose: { box: 'border-[#fbe4e8] bg-[#fdf2f4]', title: 'text-[#9d5b68]', detail: 'text-[#9d5b68]' },
  green: { box: 'border-[#dcefe1] bg-[#f0f9f2]', title: 'text-[#3f7a52]', detail: 'text-[#3f7a52]' },
  blue: { box: 'border-[#dbe7f6] bg-[#eef4fb]', title: 'text-[#3c6da3]', detail: 'text-[#3c6da3]' },
} as const;

const QuickStat: React.FC<{
  title: string;
  value: React.ReactNode;
  detail: string;
  to: string;
  tone: keyof typeof QUICK_STAT_TONES;
}> = ({ title, value, detail, to, tone }) => {
  const style = QUICK_STAT_TONES[tone];
  return (
    <NavLink to={to} className={`rounded-2xl border p-3.5 transition hover:shadow-sm ${style.box}`}>
      <p className={`text-xs font-semibold ${style.title}`}>{title}</p>
      <p className="mt-1.5 line-clamp-2 text-xl font-extrabold leading-tight text-gray-900">{value}</p>
      <p className={`mt-0.5 line-clamp-2 text-xs ${style.detail}`}>{detail}</p>
    </NavLink>
  );
};

const QUICK_LINK_CLASS = 'flex min-h-[44px] min-w-0 flex-col items-center gap-2.5 rounded-2xl border border-[#eef0f4] bg-white px-1 py-4 transition hover:border-[#ffdeca]';

const QuickLink: React.FC<{ to?: string; href?: string; label: string; icon: React.ReactNode }> = ({ to, href, label, icon }) => {
  const content = (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
      </span>
      <span className="whitespace-nowrap text-center text-[13px] font-semibold text-gray-800">{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={QUICK_LINK_CLASS}>
        {content}
      </a>
    );
  }
  return (
    <NavLink to={to ?? '/support'} className={QUICK_LINK_CLASS}>
      {content}
    </NavLink>
  );
};

export default SupportHomePage;
