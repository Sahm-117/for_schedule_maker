/**
 * Push Reminders Edge Function
 *
 * Invoked every 10 minutes by the `push_reminders_every_10min` pg_cron job,
 * created in migration `20260728000000_push_reminders_cron_and_dedupe.sql`.
 * (Historically this comment claimed a cron existed when none did, so the
 * function was deployed but never actually ran. The schedule now lives in a
 * committed migration — keep it there, not in the dashboard.)
 *
 * Reads AppSetting.remind_before_minutes to know which reminder intervals are
 * active, then sends Web Push to supports whose activities fall within each
 * window. Participants also get class nudges, group call and recap reminders,
 * a 7pm "Get ready" until their first class, and "view the venue map" on the Saturday (5pm, 8pm) and Sunday (6am) of the first two FOF Sundays. Supports also get a "no activity"
 * nudge (9am, 12pm, 4pm, 9pm) on follow-ups untouched 24 hours after assignment. All timing is derived in Africa/Lagos, never server-local: edge
 * functions run UTC and the users do not.
 *
 * Test modes (body JSON, both safe against the 20 real users):
 *   { "dryRun": true }            — compute everything, send nothing, log nothing
 *   { "onlyUserIds": ["<uuid>"] } — restrict delivery to specific users
 *   { "onlyParticipantIds": [...], "cohortId": "<uuid>", "asOf": "<ISO>" } — participant
 *     reminders only for those participants / that cohort, as if it were that moment
 *     (asOf also sets the moment for the follow-up "no activity" nudge)
 *
 * Required Supabase secrets:
 *   VAPID_PUBLIC_KEY  — from `npx web-push generate-vapid-keys`
 *   VAPID_PRIVATE_KEY — from the same command
 *   VAPID_SUBJECT     — e.g. "mailto:admin@fof.com"
 *   SUPABASE_URL      — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push ESM build
import webPush from 'https://esm.sh/web-push@3'
import { PARTICIPANT_PUSH_STORE, sendToSubscriptions } from '../_shared/webpush.ts'
import { insertNotifications, insertParticipantNotifications, moduleViewerIds } from '../_shared/notifications.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const getCurrentProgrammeCohortId = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc('current_programme_cohort_id')
  if (error) throw new Error(error.message)
  return data ? String(data) : null
}

// Meeting reminders use the one cohort selected by the database's
// automatic-current rule, then retain their existing safeguard of sending
// only while that selected programme is actually running. Do not cache the
// helper across edge requests: its date-based answer can change at midnight.
const getRunningCohortIds = async (todayISO: string): Promise<Set<string>> => {
  const currentId = await getCurrentProgrammeCohortId()
  if (!currentId) return new Set<string>()
  const { data, error } = await supabase
    .from('Cohort')
    .select('id, startDate, endDate')
    .eq('id', currentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.startDate || String(data.startDate).slice(0, 10) > todayISO) return new Set<string>()
  if (data.endDate && String(data.endDate).slice(0, 10) < todayISO) return new Set<string>()
  return new Set([currentId])
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com'

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// LOGIN_SHARED is the successful end of a follow-up, so it stops reminders the
// same way the give-up statuses do.
const TERMINAL_REGISTRATION_STATUSES = new Set(['LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_TCN_MEMBER'])

/** A support: the Support role, or an admin who also carries the Support tag (FLOW_MAP rule 16). Mirrors hasSupportRole in the app. */
const isSupportOrTagged = (user: { role?: string; roles?: string[] | null }): boolean =>
  user.role === 'SUPPORT' || !!user.roles?.includes('SUPPORT')

const getLagosDateParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    isoDate: `${read('year')}-${read('month')}-${read('day')}`,
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  }
}

const MINUTES_PER_DAY = 1440

// Keep in sync with DEFAULT_REMIND_BEFORE_MINUTES in
// frontend/src/services/supabase-api.ts. Deliberately one quiet reminder:
// users opt in to more rather than having to switch extras off.
const DEFAULT_REMIND_BEFORE_MINUTES = [60]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_NAMES_UPPER = DAY_NAMES.map((d) => d.toUpperCase())

// Weekday index for a Lagos ISO date (YYYY-MM-DD). Parsed as UTC midnight so the
// result can't be shifted by the server's own timezone.
const lagosDayIndex = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()

const addLagosDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// A week's class date: its own classDate once the Planner has moved it,
// otherwise the cohort's first class Sunday + (weekNumber - 1) weeks.
// Mirrors week_class_date() in the database.
type ClassWeek = { weekNumber: number; classDate?: string | null }
const classIsoFor = (startIso: string, week: ClassWeek): string =>
  week.classDate ? String(week.classDate).slice(0, 10) : addLagosDays(startIso, (week.weekNumber - 1) * 7)

const daysBetweenIso = (fromIso: string, toIso: string) =>
  Math.floor(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86400000
  )

/**
 * Resolve a reminder interval into a concrete target day + minute-of-day.
 *
 * Adding the interval straight onto the minute-of-day was the old bug: a value
 * over 1439 can never equal an activity time, so the 1440 ("tomorrow") interval
 * silently matched nothing, and any interval crossing midnight (e.g. 60 at
 * 23:30) was likewise dropped. Decompose into a day carry instead.
 */
const resolveTarget = (lagosNowMinutes: number, interval: number, todayIso: string) => {
  const total = lagosNowMinutes + interval
  const carry = Math.floor(total / MINUTES_PER_DAY)
  const isoDate = addLagosDays(todayIso, carry)
  return { carry, targetMinutes: total % MINUTES_PER_DAY, isoDate, dayIndex: lagosDayIndex(isoDate) }
}

/**
 * Most recent Sunday-10am boundary on or before the given Lagos date/time,
 * returned as a Lagos ISO date. Program weeks unlock at Sunday 10am.
 *
 * Ported from frontend/src/utils/weekFocus.ts (`lastSunday10am`). That file is
 * the source of truth for which week is "live" — if the rule changes there, it
 * must change here too, or reminders will disagree with what supports see.
 */
const lastSunday10amIso = (todayIso: string, hour: number): string => {
  const dayIndex = lagosDayIndex(todayIso)
  const sundayIso = addLagosDays(todayIso, -dayIndex)
  // On Sunday before 10:00 the boundary hasn't been crossed yet, so the live
  // week is still the previous one. Every other moment sits after it.
  const beforeBoundary = dayIndex === 0 && hour < 10
  return beforeBoundary ? addLagosDays(sundayIso, -7) : sundayIso
}

const parseTime = (timeStr: string): number | null => {
  // Handles "06:00 AM", "14:30", "6:00 AM" etc.
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!match) return null
  let hours = parseInt(match[1])
  const minutes = parseInt(match[2])
  const period = match[3]?.toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

interface RecapReleaseTimes {
  supportDay: string
  supportTime: string
  participantDay: string
  participantTime: string
  manualDay: string
  manualTime: string
}

const DEFAULT_RECAP_RELEASE_TIMES: RecapReleaseTimes = {
  supportDay: 'SUNDAY',
  supportTime: '16:00',
  participantDay: 'MONDAY',
  participantTime: '18:00',
  manualDay: 'THURSDAY',
  manualTime: '18:00',
}

// Default Sunday class start time used in the Sat/Sun participant nudges,
// used when the class_start_time AppSetting row is missing. Matches the
// time every "Class N" Sunday activity in the schedule has used to date.
const DEFAULT_CLASS_START_TIME = '09:30'

/**
 * Mirrors recap_release_at() in
 * supabase/migrations/20260929200000_week_class_date.sql: the week's class
 * Sunday (classIsoFor) plus the configured day
 * offset, as a Lagos isoDate + minute-of-day pair -- computed here in TS
 * (rather than an RPC round trip) using the same addLagosDays/parseTime
 * helpers the rest of this file already uses for Lagos time, so it stays
 * consistent with how every other reminder in this function is computed.
 */
const recapReleaseTarget = (startIso: string, week: ClassWeek, day: string, time: string) => {
  const offset = Math.max(0, DAY_NAMES_UPPER.indexOf(String(day || '').toUpperCase()))
  const isoDate = addLagosDays(classIsoFor(startIso, week), offset)
  const minutes = parseTime(time) ?? 0
  return { isoDate, minutes }
}

// The manual goes out before class: the chosen weekday on or before that
// week's class Sunday (Thursday = 3 days before). Mirrors recap_release_at('manual').
const manualReleaseTarget = (startIso: string, week: ClassWeek, day: string, time: string) => {
  const offset = Math.max(0, DAY_NAMES_UPPER.indexOf(String(day || '').toUpperCase()))
  const isoDate = addLagosDays(classIsoFor(startIso, week), -((7 - offset) % 7))
  const minutes = parseTime(time) ?? 0
  return { isoDate, minutes }
}

const recapReleaseHasPassed = (target: { isoDate: string; minutes: number }, todayIso: string, nowMinutes: number): boolean => {
  const diff = daysBetweenIso(target.isoDate, todayIso)
  if (diff > 0) return true
  if (diff < 0) return false
  return nowMinutes >= target.minutes
}

interface LiveWeek {
  weekId: number
  weekNumber: number
  cohortId: string
}

/**
 * Which week is currently "live" for the automatic current, published cohort.
 *
 * Mirrors getIdealWeekNumberForCohort/getIdealWeekForCohort in
 * frontend/src/utils/weekFocus.ts, evaluated in Lagos time. Without this the
 * reminder query matched a weekday in EVERY week at once (there is one "Monday"
 * row per week), so a single reminder fanned out across the whole programme.
 *
 * Unpublished cohorts are excluded: supports can't see those activities in the
 * app at all, so reminding them about one would be incoherent.
 */
const resolveLiveWeeks = async (todayIso: string, hour: number): Promise<LiveWeek[]> => {
  const currentCohortId = await getCurrentProgrammeCohortId()
  if (!currentCohortId) return []
  const { data: cohorts } = await supabase
    .from('Cohort')
    .select('id, startDate, endDate, schedulePublished, status')
    .eq('id', currentCohortId)
    .eq('status', 'ACTIVE')
    .eq('schedulePublished', true)

  const live: LiveWeek[] = []
  const anchorIso = lastSunday10amIso(todayIso, hour)

  for (const cohort of (cohorts || []) as any[]) {
    // A null startDate would otherwise pin the cohort to week 1 forever.
    if (!cohort.startDate) continue
    const startIso = String(cohort.startDate).slice(0, 10)
    // The helper may select the next upcoming programme when nothing is
    // running; activity reminders keep their pre-existing start-date gate.
    if (todayIso < startIso) continue
    if (cohort.endDate && todayIso > String(cohort.endDate).slice(0, 10)) continue

    const { data: weeks } = await supabase
      .from('Week')
      .select('id, weekNumber, classDate')
      .eq('cohortId', cohort.id)
      .order('weekNumber', { ascending: true })

    const sorted = (weeks || []) as any[]
    if (sorted.length === 0) continue

    // The latest week whose class Sunday is on or before the anchor; before
    // the first class, the first week (as getIdealWeekForCohort does).
    const chosen = [...sorted].reverse().find((w: any) => classIsoFor(startIso, w) <= anchorIso) ?? sorted[0]

    live.push({ weekId: chosen.id, weekNumber: chosen.weekNumber, cohortId: cohort.id })
  }

  return live
}

/**
 * Claim the right to send one reminder, so a repeat cron run can't double-send.
 *
 * The web-push `tag` only collapses notifications in the browser UI — it does
 * not stop a second send. With a 10-minute cron and a +/-5 minute match window
 * an activity can match two consecutive runs, so the guard has to be
 * server-side. Same unique-insert / 23505 pattern as FollowUpOwnerReminderLog
 * below. Claims before sending: a crash then costs one missed reminder rather
 * than a duplicate.
 */
const claimReminder = async (
  kind: 'ACTIVITY' | 'GROUP_MEETING' | 'HUB_MEETING' | 'HUB_LEADS_MEETING' | 'RECAP_SUPPORT' | 'MANUAL_SUPPORT',
  targetId: string,
  userId: string,
  reminderDate: string,
  intervalMinutes: number,
): Promise<boolean> => {
  const { error } = await supabase
    .from('PushReminderLog')
    .insert([{ kind, targetId, userId, reminderDate, intervalMinutes }])

  if (!error) return true
  if (error.code === '23505') return false // already sent
  throw new Error(error.message)
}

Deno.serve(async (req) => {
  try {
    // Test hooks. dryRun computes everything but sends/logs nothing; onlyUserIds
    // shrinks the blast radius to specific users for a live smoke test.
    let dryRun = false
    let onlyUserIds: string[] | null = null
    let onlyParticipantIds: string[] | null = null
    // Replay a moment in time (dry runs of the participant reminders).
    let asOf: Date | null = null
    // Limit the participant reminders to one cohort, whatever its status (dry runs).
    let onlyCohortId: string | null = null
    try {
      const body = await req.json()
      dryRun = body?.dryRun === true
      if (Array.isArray(body?.onlyUserIds) && body.onlyUserIds.length > 0) {
        onlyUserIds = body.onlyUserIds.map(String)
      }
      if (Array.isArray(body?.onlyParticipantIds) && body.onlyParticipantIds.length > 0) {
        onlyParticipantIds = body.onlyParticipantIds.map(String)
      }
      if (typeof body?.cohortId === 'string') onlyCohortId = body.cohortId
      if (typeof body?.asOf === 'string' && !Number.isNaN(Date.parse(body.asOf))) {
        asOf = new Date(body.asOf)
      }
    } catch {
      // No/invalid body — normal cron invocation.
    }

    const debug: Record<string, unknown>[] = []

    // 1. Reminder timings are per user (UserNotificationSetting). Load them all
    //    up front: the loops below scan the UNION of every user's chosen
    //    intervals, then only notify the users who actually asked for that
    //    interval. A user with no row keeps the quiet default, and a user who
    //    saved an empty list gets nothing.
    const { data: userSettings } = await supabase
      .from('UserNotificationSetting')
      .select('userId, remindBeforeMinutes')

    const intervalsByUser = new Map<string, number[]>()
    for (const row of (userSettings || []) as any[]) {
      if (Array.isArray(row.remindBeforeMinutes)) {
        intervalsByUser.set(row.userId, row.remindBeforeMinutes.map(Number).filter(Number.isFinite))
      }
    }

    const intervalsFor = (userId: string): number[] =>
      intervalsByUser.get(userId) ?? DEFAULT_REMIND_BEFORE_MINUTES

    const wantsInterval = (userId: string, interval: number) =>
      intervalsFor(userId).includes(interval)

    // Every interval anyone has opted into, plus the default for users with no row.
    const remindIntervals: number[] = [...new Set([
      ...DEFAULT_REMIND_BEFORE_MINUTES,
      ...[...intervalsByUser.values()].flat(),
    ])].sort((a, b) => a - b)

    const now = new Date()
    // Everything below is Lagos-relative. Edge functions run UTC, so using
    // now.getHours()/getDay() (as this loop used to) shifted every activity
    // reminder by an hour and could pick the wrong weekday near midnight.
    const lagos = getLagosDateParts(now)
    const lagosNowMinutes = lagos.hour * 60 + lagos.minute
    const todayISO = lagos.isoDate

    // 2. For each interval, compute the target time window
    // "Send reminder X minutes before activity" → activity time ≈ now + X (within ±5 min window)
    const WINDOW = 5 // ±5 minutes tolerance

    const notified: string[] = []

    const liveWeeks = await resolveLiveWeeks(todayISO, lagos.hour)
    const liveWeekIds = liveWeeks.map((w) => w.weekId)
    if (dryRun) debug.push({ todayISO, lagosNowMinutes, remindIntervals, liveWeeks })

    // Skip the activity pass entirely when no cohort is live and published —
    // otherwise an unscoped query would match every week at once.
    for (const interval of liveWeekIds.length === 0 ? [] : remindIntervals) {
      const target = resolveTarget(lagosNowMinutes, interval, todayISO)

      // 3. Fetch the target day's activities near that target time, restricted
      //    to the live week (one "Day" row exists per weekday *per week*).
      const { data: activities } = await supabase
        .from('Activity')
        .select(`
          id, time, description, period,
          Day!inner(dayName, weekId),
          ActivityLabel(labelId)
        `)
        .eq('Day.dayName', DAY_NAMES[target.dayIndex])
        .in('Day.weekId', liveWeekIds)

      if (!activities) continue

      const matchingActivities = activities.filter((a: any) => {
        const t = parseTime(a.time)
        if (t === null) return false
        return Math.abs(t - target.targetMinutes) <= WINDOW
      })

      if (dryRun) {
        debug.push({
          interval,
          carry: target.carry,
          targetIsoDate: target.isoDate,
          targetDay: DAY_NAMES[target.dayIndex],
          targetMinutes: target.targetMinutes,
          candidates: activities.length,
          matched: matchingActivities.map((a: any) => ({ id: a.id, time: a.time })),
        })
      }

      if (matchingActivities.length === 0) continue

      // 4. For each matching activity, find users assigned to its labels via UserLabel
      for (const activity of matchingActivities) {
        const labelIds = (activity.ActivityLabel as any[]).map((al: any) => al.labelId)
        if (labelIds.length === 0) continue

        const { data: userLabels } = await supabase
          .from('UserLabel')
          .select('userId')
          .in('labelId', labelIds)

        if (!userLabels || userLabels.length === 0) continue

        let userIds = [...new Set((userLabels as any[]).map((ul: any) => ul.userId))]

        // Labels can be reused across cohorts, so keep recipients to members of
        // the cohort that owns this activity's week.
        const owningWeek = liveWeeks.find((w) => w.weekId === (activity.Day as any).weekId)
        if (owningWeek) {
          const { data: members } = await supabase
            .from('UserCohort')
            .select('userId')
            .eq('cohortId', owningWeek.cohortId)
            .in('userId', userIds)
          const memberIds = new Set((members || []).map((m: any) => m.userId))
          userIds = userIds.filter((id) => memberIds.has(id))
        }

        // Respect each user's own reminder timings.
        userIds = userIds.filter((id) => wantsInterval(id, interval))
        if (onlyUserIds) userIds = userIds.filter((id) => onlyUserIds!.includes(id))
        if (userIds.length === 0) continue

        // 5. Fetch push subscriptions for those users
        const { data: subs } = await supabase
          .from('PushSubscription')
          .select('userId, endpoint, p256dh, auth')
          .in('userId', userIds)

        if (!subs || subs.length === 0) continue

        const minuteLabel = interval < 60
          ? `${interval} mins`
          : interval === 60
          ? '1 hour'
          : interval === 1440
          ? 'tomorrow'
          : `${Math.round(interval / 60)} hours`

        const payload = JSON.stringify({
          title: `FOF reminder: ${minuteLabel} away`,
          body: `${activity.time} · ${activity.description}`,
          icon: '/icon-192.png',
          tag: `fof-${activity.id}-${interval}`,
          data: { path: '/support/schedule' },
        })

        // 6. Send push per user, claiming the dedupe row first so a repeat cron
        //    run inside the same window can't double-send.
        for (const userId of userIds) {
          const userSubs = (subs as any[]).filter((s: any) => s.userId === userId)
          if (userSubs.length === 0) continue

          if (dryRun) {
            debug.push({ wouldSend: 'ACTIVITY', activityId: activity.id, interval, userId, subs: userSubs.length })
            continue
          }

          if (!(await claimReminder('ACTIVITY', String(activity.id), userId, target.isoDate, interval))) continue

          const r = await sendToSubscriptions(webPush, supabase, userSubs, payload, notified)
          if (r.failed > 0) console.error(`push-reminders (activity): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
        }
      }
    }

    // 6b. Group prayer-meeting reminders — remind each group's assigned Support
    //     ahead of the weekly meeting slot, timed by the same remind_before_minutes
    //     offsets used for activities. Recurs weekly: the query keys off the
    //     Lagos weekday matching the group's meetingDay.
    //
    //     Uses the same Lagos clock as the activity pass above, and the same
    //     day-carry target resolution so an interval crossing midnight (or the
    //     1440 "tomorrow" offset) lands on the right weekday.
    {
      for (const interval of remindIntervals) {
        const target = resolveTarget(lagosNowMinutes, interval, todayISO)

        const { data: groups } = await supabase
          .from('Group')
          .select('id, name, meetingTime, supportId, cohortId')
          .eq('meetingDay', DAY_NAMES_UPPER[target.dayIndex])
          .not('supportId', 'is', null)
          .not('meetingTime', 'is', null)

        if (!groups || groups.length === 0) continue

        const runningCohortIds = await getRunningCohortIds(todayISO)
        const matchingGroups = (groups as any[]).filter((g: any) => {
          if (!runningCohortIds.has(g.cohortId)) return false
          const t = parseTime(g.meetingTime)
          if (t === null) return false
          return Math.abs(t - target.targetMinutes) <= WINDOW
        })

        const minuteLabel = interval < 60
          ? `${interval} mins`
          : interval === 60
          ? '1 hour'
          : interval === 1440
          ? 'tomorrow'
          : `${Math.round(interval / 60)} hours`

        for (const group of matchingGroups) {
          if (!wantsInterval(group.supportId, interval)) continue
          if (onlyUserIds && !onlyUserIds.includes(group.supportId)) continue

          const { data: subs } = await supabase
            .from('PushSubscription')
            .select('userId, endpoint, p256dh, auth')
            .eq('userId', group.supportId)

          if (!subs || subs.length === 0) continue

          const payload = JSON.stringify({
            title: `Group meeting reminder: ${minuteLabel} away`,
            body: `${group.name} weekly meeting at ${group.meetingTime}`,
            icon: '/icon-192.png',
            tag: `fof-groupmeeting-${group.id}-${interval}`,
            data: { path: '/support/participants?tab=prayers' },
          })

          if (dryRun) {
            debug.push({ wouldSend: 'GROUP_MEETING', groupId: group.id, interval, userId: group.supportId, targetIsoDate: target.isoDate })
            continue
          }

          if (!(await claimReminder('GROUP_MEETING', String(group.id), group.supportId, target.isoDate, interval))) continue

          const r = await sendToSubscriptions(webPush, supabase, subs as any[], payload, notified)
          if (r.failed > 0) console.error(`push-reminders (group-meeting): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
        }
      }
    }

    // 6c. Hub meeting reminders — the recap/catch-up call the hub's lead sets
    //     for the whole hub (SupportHub.meetingDay/meetingTime), same shape as
    //     the group meeting block above but fanned out to every hub member
    //     (not just the lead), each at their own remind_before_minutes timings.
    {
      for (const interval of remindIntervals) {
        const target = resolveTarget(lagosNowMinutes, interval, todayISO)

        const { data: hubs } = await supabase
          .from('SupportHub')
          .select('id, name, meetingTime, callLink, leadUserId, assistantLeadUserId, recapLeadUserIds, prayerLeadUserIds, cohortId')
          .eq('meetingDay', DAY_NAMES_UPPER[target.dayIndex])
          .not('meetingTime', 'is', null)
          .not('callLink', 'is', null)

        if (!hubs || hubs.length === 0) continue

        const runningCohortIds = await getRunningCohortIds(todayISO)
        const matchingHubs = (hubs as any[]).filter((h: any) => {
          if (!runningCohortIds.has(h.cohortId)) return false
          const t = parseTime(h.meetingTime)
          if (t === null) return false
          return Math.abs(t - target.targetMinutes) <= WINDOW
        })

        if (matchingHubs.length === 0) continue

        const minuteLabel = interval < 60
          ? `${interval} mins`
          : interval === 60
          ? '1 hour'
          : interval === 1440
          ? 'tomorrow'
          : `${Math.round(interval / 60)} hours`

        for (const hub of matchingHubs) {
          const { data: members } = await supabase
            .from('HubMembership')
            .select('userId')
            .eq('hubId', hub.id)

          // Operational IT supports cover this hub without a HubMembership
          // row, but still get the reminder — deduped against members.
          const { data: itSupports } = await supabase
            .from('HubItSupport')
            .select('userId')
            .eq('hubId', hub.id)

          let memberIds = [...new Set([
            ...((members || []) as any[]).map((m: any) => m.userId),
            ...((itSupports || []) as any[]).map((m: any) => m.userId),
          ])]
          memberIds = memberIds.filter((id) => wantsInterval(id, interval))
          if (onlyUserIds) memberIds = memberIds.filter((id) => onlyUserIds!.includes(id))
          if (memberIds.length === 0) continue

          const { data: subs } = await supabase
            .from('PushSubscription')
            .select('userId, endpoint, p256dh, auth')
            .in('userId', memberIds)

          if (!subs || subs.length === 0) continue

          const baseBody = `${hub.name} meets at ${hub.meetingTime}. Join: ${hub.callLink}`

          for (const userId of memberIds) {
            const userSubs = (subs as any[]).filter((s: any) => s.userId === userId)
            if (userSubs.length === 0) continue

            // Personal line for whichever job(s) this recipient holds on the
            // hub — IT supports and plain members get none.
            const jobPhrases: string[] = []
            if (hub.leadUserId === userId) jobPhrases.push("leading Announcements")
            if (hub.assistantLeadUserId === userId) jobPhrases.push("making sure everyone is there")
            if ((hub.recapLeadUserIds ?? []).includes(userId)) jobPhrases.push("leading Review & Recap")
            if ((hub.prayerLeadUserIds ?? []).includes(userId)) jobPhrases.push("leading prayer")
            const personalLine = jobPhrases.length === 0
              ? ''
              : jobPhrases.length === 1
              ? ` You're ${jobPhrases[0]}.`
              : ` You're ${jobPhrases.slice(0, -1).join(', ')} and ${jobPhrases[jobPhrases.length - 1]}.`

            const payload = JSON.stringify({
              title: `Hub meeting reminder: ${minuteLabel} away`,
              body: `${baseBody}${personalLine}`,
              icon: '/icon-192.png',
              tag: `fof-hubmeeting-${hub.id}-${interval}`,
              data: { path: '/support/my-hub' },
            })

            if (dryRun) {
              debug.push({ wouldSend: 'HUB_MEETING', hubId: hub.id, interval, userId, subs: userSubs.length })
              continue
            }

            if (!(await claimReminder('HUB_MEETING', String(hub.id), userId, target.isoDate, interval))) continue

            const r = await sendToSubscriptions(webPush, supabase, userSubs, payload, notified)
            if (r.failed > 0) console.error(`push-reminders (hub-meeting): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
      }
    }

    // 6d. Hub Leads meeting reminders — one weekly meeting for the Hub Leads of
    //     a cohort, set by an admin (HubLeadsMeeting). Same shape as 6c, sent
    //     to that cohort's Hub Leads only, each at their own timings.
    {
      for (const interval of remindIntervals) {
        const target = resolveTarget(lagosNowMinutes, interval, todayISO)

        const { data: meetings } = await supabase
          .from('HubLeadsMeeting')
          .select('cohortId, meetingTime, callLink')
          .eq('meetingDay', DAY_NAMES_UPPER[target.dayIndex])
          .not('meetingTime', 'is', null)
          .not('callLink', 'is', null)

        if (!meetings || meetings.length === 0) continue

        const runningCohortIds = await getRunningCohortIds(todayISO)
        const matching = (meetings as any[]).filter((m: any) => {
          if (!runningCohortIds.has(m.cohortId)) return false
          const t = parseTime(m.meetingTime)
          return t !== null && Math.abs(t - target.targetMinutes) <= WINDOW
        })
        if (matching.length === 0) continue

        const minuteLabel = interval < 60
          ? `${interval} mins`
          : interval === 60
          ? '1 hour'
          : interval === 1440
          ? 'tomorrow'
          : `${Math.round(interval / 60)} hours`

        for (const meeting of matching) {
          const { data: leadHubs } = await supabase
            .from('SupportHub')
            .select('leadUserId')
            .eq('cohortId', meeting.cohortId)
            .not('leadUserId', 'is', null)

          let leadIds = [...new Set(((leadHubs || []) as any[]).map((h: any) => h.leadUserId))] as string[]
          leadIds = leadIds.filter((id) => wantsInterval(id, interval))
          if (onlyUserIds) leadIds = leadIds.filter((id) => onlyUserIds!.includes(id))
          if (leadIds.length === 0) continue

          const { data: subs } = await supabase
            .from('PushSubscription')
            .select('userId, endpoint, p256dh, auth')
            .in('userId', leadIds)
          if (!subs || subs.length === 0) continue

          for (const userId of leadIds) {
            const userSubs = (subs as any[]).filter((s: any) => s.userId === userId)
            if (userSubs.length === 0) continue

            const payload = JSON.stringify({
              title: `Hub Leads meeting: ${minuteLabel} away`,
              body: `The Hub Leads meet at ${meeting.meetingTime}. Open My Hub, then Leads, to join.`,
              icon: '/icon-192.png',
              tag: `fof-hubleadsmeeting-${meeting.cohortId}-${interval}`,
              data: { path: '/support/my-hub?tab=leads' },
            })

            if (dryRun) {
              debug.push({ wouldSend: 'HUB_LEADS_MEETING', cohortId: meeting.cohortId, interval, userId, subs: userSubs.length })
              continue
            }

            if (!(await claimReminder('HUB_LEADS_MEETING', String(meeting.cohortId), userId, target.isoDate, interval))) continue

            const r = await sendToSubscriptions(webPush, supabase, userSubs, payload, notified)
            if (r.failed > 0) console.error(`push-reminders (hub-leads-meeting): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
      }
    }

    // 8. Participant app reminders: Sunday class nudges (always on), group call
    //    reminders at the timings each participant picked, and "recap is out".
    //    Deduped per participant in ParticipantReminderLog. Staff filters
    //    (onlyUserIds) skip this block; use onlyParticipantIds to test it.
    if (!onlyUserIds) {
      const clock = asOf ?? now
      const pLagos = getLagosDateParts(clock)
      const pNowMinutes = pLagos.hour * 60 + pLagos.minute
      const pToday = pLagos.isoDate
      const pDayIndex = lagosDayIndex(pToday)

      const { data: recapSettingRow } = await supabase
        .from('AppSetting').select('value').eq('settingKey', 'recap_release_times').maybeSingle()
      const recapTimes: RecapReleaseTimes = {
        supportDay: (recapSettingRow as any)?.value?.supportDay || DEFAULT_RECAP_RELEASE_TIMES.supportDay,
        supportTime: (recapSettingRow as any)?.value?.supportTime || DEFAULT_RECAP_RELEASE_TIMES.supportTime,
        participantDay: (recapSettingRow as any)?.value?.participantDay || DEFAULT_RECAP_RELEASE_TIMES.participantDay,
        participantTime: (recapSettingRow as any)?.value?.participantTime || DEFAULT_RECAP_RELEASE_TIMES.participantTime,
        manualDay: (recapSettingRow as any)?.value?.manualDay || DEFAULT_RECAP_RELEASE_TIMES.manualDay,
        manualTime: (recapSettingRow as any)?.value?.manualTime || DEFAULT_RECAP_RELEASE_TIMES.manualTime,
      }

      const { data: classStartSettingRow } = await supabase
        .from('AppSetting').select('value').eq('settingKey', 'class_start_time').maybeSingle()
      const classStartTime: string = (classStartSettingRow as any)?.value || DEFAULT_CLASS_START_TIME

      const claimParticipant = async (kind: string, targetKey: string, participantId: string, occurrence: string) => {
        if (dryRun) return true
        const { error } = await supabase.from('ParticipantReminderLog').insert([{ kind, targetKey, participantId, occurrence }])
        if (!error) return true
        if (error.code === '23505') return false
        throw new Error(error.message)
      }
      const pushParticipants = async (participantIds: string[], message: { title: string; body: string; path: string; tag: string }) => {
        const targets = onlyParticipantIds ? participantIds.filter((id) => onlyParticipantIds!.includes(id)) : participantIds
        if (targets.length === 0) return
        if (dryRun) { debug.push({ wouldSendParticipants: message.tag, count: targets.length, title: message.title, body: message.body }); return }
        const claimed: string[] = []
        // Each tag already names the week, group or date it is about, so one send per participant per tag.
        for (const id of targets) if (await claimParticipant(message.tag.split(':')[0], message.tag, id, 'once')) claimed.push(id)
        if (claimed.length === 0) return
        // Participant bell row for everyone claimed, push or not.
        await insertParticipantNotifications(supabase, claimed.map((participantId) => ({
          participantId, title: message.title, body: message.body, path: message.path, type: 'REMINDER',
        })))
        const { data: subs } = await supabase.from('ParticipantPushSubscription').select('participantId, endpoint, p256dh, auth').in('participantId', claimed)
        const rows = ((subs ?? []) as any[]).map((row) => ({ userId: row.participantId, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))
        if (rows.length === 0) return
        const payload = JSON.stringify({ title: message.title, body: message.body, icon: '/icon-192.png', tag: message.tag, data: { path: message.path } })
        const r = await sendToSubscriptions(webPush, supabase, rows, payload, undefined, PARTICIPANT_PUSH_STORE)
        if (r.failed > 0) console.error(`push-reminders (participants ${message.tag}): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
      }

      const participantCohortId = onlyCohortId ?? await getCurrentProgrammeCohortId()
      const { data: pCohorts } = participantCohortId
        ? await supabase.from('Cohort').select('id, startDate, endDate, status').eq('id', participantCohortId)
        : { data: [] }
      for (const cohort of (pCohorts ?? []) as any[]) {
        if (!cohort.startDate) continue
        const startIso = String(cohort.startDate).slice(0, 10)
        const endIso = cohort.endDate ? String(cohort.endDate).slice(0, 10) : null
        if (daysBetweenIso(startIso, pToday) < -1) continue
        if (endIso && daysBetweenIso(endIso, pToday) > 7) continue

        const [{ data: accounts }, { data: pWeeks }, { data: pGroups }, { data: settings }] = await Promise.all([
          supabase.from('ParticipantAccount').select('participantId, participant:Participant!inner(id, cohortId, status)').eq('isActive', true).eq('participant.cohortId', cohort.id).eq('participant.status', 'ACTIVE'),
          supabase.from('Week').select('id, weekNumber, classDate, title, shareWithParticipants, recapSummary, recapDocumentUrl, participantReleasedEarlyAt, manualDocumentUrl, manualReleasedEarlyAt').eq('cohortId', cohort.id),
          supabase.from('Group').select('id, name, meetingDay, meetingTime, members:GroupParticipant(participantId)').eq('cohortId', cohort.id),
          supabase.from('ParticipantReminderSetting').select('participantId, meetingRemindMinutes, recapReleased'),
        ])
        const participantIds = new Set(((accounts ?? []) as any[]).map((a) => a.participantId))
        if (participantIds.size === 0) continue
        const settingBy = new Map(((settings ?? []) as any[]).map((row) => [row.participantId, row]))
        const meetingMinutesFor = (id: string): number[] => {
          const row = settingBy.get(id)
          return Array.isArray(row?.meetingRemindMinutes) ? row.meetingRemindMinutes.map(Number).filter(Number.isFinite) : DEFAULT_REMIND_BEFORE_MINUTES
        }
        const weeks = ((pWeeks ?? []) as any[])
        const groups = ((pGroups ?? []) as any[])

        // a) Sunday class nudges: Saturday 12:00, Saturday 20:00, Sunday 06:00.
        const NUDGES = [
          { day: 6, minutes: 12 * 60, key: 'SAT_NOON' },
          { day: 6, minutes: 20 * 60, key: 'SAT_EVENING' },
          { day: 0, minutes: 6 * 60, key: 'SUN_MORNING' },
        ]
        for (const nudge of NUDGES) {
          if (pDayIndex !== nudge.day || pNowMinutes < nudge.minutes || pNowMinutes >= nudge.minutes + 10) continue
          const sundayIso = nudge.day === 6 ? addLagosDays(pToday, 1) : pToday
          const week = weeks.find((w) => classIsoFor(startIso, w) === sundayIso)
          if (!week) continue
          const { data: days } = await supabase.from('Day').select('Activity(time, description)').eq('weekId', week.id).eq('dayName', 'Sunday')
          const classActivity = ((days ?? []) as any[]).flatMap((d) => d.Activity ?? []).find((a: any) => /^\s*class\s*\d|introductory class/i.test(String(a.description || '')))
          if (!classActivity) continue
          // Display time comes from the admin-configured class_start_time
          // setting (Settings > Programme > Timings), not the schedule row --
          // classActivity above is only used to confirm this week has a class.
          const minutes = parseTime(classStartTime)
          const time = minutes === null ? '' : `${((Math.floor(minutes / 60) + 11) % 12) + 1}:${String(minutes % 60).padStart(2, '0')} ${minutes >= 720 ? 'PM' : 'AM'}`
          const topic = String(week.title || '').trim()
          const message = nudge.key === 'SAT_NOON'
            ? { title: 'See you tomorrow!', body: `FOF class is at ${time}. We can't wait to see you in church.` }
            : nudge.key === 'SAT_EVENING'
            ? { title: "Tomorrow's the day", body: topic ? `This week's topic is ${topic}. Get some rest, your seat is waiting.` : 'Get some rest, your seat is waiting.' }
            : { title: 'Good morning! Church today', body: `FOF class starts at ${time}. See you soon.` }
          await pushParticipants([...participantIds], { ...message, path: '/me', tag: `SUNDAY_NUDGE:${week.id}:${nudge.key}` })
        }

        // b) Group call reminders at each participant's chosen timings.
        const intervals = [...new Set([...participantIds].flatMap(meetingMinutesFor))]
        // No group call reminders before the cohort has started.
        const cohortStarted = daysBetweenIso(startIso, pToday) >= 0
        for (const interval of cohortStarted ? intervals : []) {
          const target = resolveTarget(pNowMinutes, interval, pToday)
          if (endIso && target.isoDate > endIso) continue
          for (const group of groups) {
            if (!group.meetingDay || !group.meetingTime) continue
            if (String(group.meetingDay).toUpperCase() !== DAY_NAMES_UPPER[target.dayIndex]) continue
            const t = parseTime(group.meetingTime)
            if (t === null || Math.abs(t - target.targetMinutes) > WINDOW) continue
            const members = ((group.members ?? []) as any[]).map((m) => m.participantId).filter((id: string) => participantIds.has(id) && meetingMinutesFor(id).includes(interval))
            // Same wording as the support group meeting reminder above.
            const minuteLabel = interval < 60 ? `${interval} mins` : interval === 60 ? '1 hour' : interval === 1440 ? 'tomorrow' : `${Math.round(interval / 60)} hours`
            await pushParticipants(members, {
              title: `Group meeting reminder: ${minuteLabel} away`,
              body: `${group.name} weekly meeting at ${group.meetingTime}`,
              path: '/me/group',
              tag: `GROUP_MEETING:${group.id}:${interval}:${target.isoDate}`,
            })
          }
        }

        // c) "Recap is out", once the configured participant release time has
        //    passed (or a support used "Send to participants now"). Computed the
        //    same way recap_release_at(...,'participant') is in SQL -- see
        //    recapReleaseTarget above. pushParticipants claims one RECAP:<weekId>
        //    row per participant, so the 10-minute cron tells each person exactly
        //    once however long it stays up.
        const sharedWeeks = weeks.filter((w) => {
          if (w.shareWithParticipants === false) return false
          if (!(String(w.recapSummary || '').trim() || w.recapDocumentUrl)) return false
          if (w.participantReleasedEarlyAt) return true
          const target = recapReleaseTarget(startIso, w, recapTimes.participantDay, recapTimes.participantTime)
          return recapReleaseHasPassed(target, pToday, pNowMinutes)
        })
        for (const week of sharedWeeks) {
          for (const group of groups) {
            const members = ((group.members ?? []) as any[]).map((m) => m.participantId)
              .filter((id: string) => participantIds.has(id) && settingBy.get(id)?.recapReleased !== false)
            await pushParticipants(members, {
              title: `Week ${week.weekNumber} recap is out`,
              body: `${week.title ? `${String(week.title).trim()}. ` : ''}Read it and write this week's reflection.`,
              path: `/me/week/${week.weekNumber}`,
              tag: `RECAP:${week.id}`,
            })
          }
        }

        // d) Supports get their own recap push+bell once their configured release
        //    time has passed (independent of shareWithParticipants -- that switch
        //    only ever held recaps back from participants). One push per support
        //    per week, deduped via PushReminderLog same as HUB_MEETING above.
        //    Only the newest released week is announced, so older weeks (or a
        //    batch of recaps uploaded late) never arrive as a pile of alerts.
        const supportWeeks = weeks.filter((w) => {
          if (!(String(w.recapSummary || '').trim() || w.recapDocumentUrl)) return false
          const target = recapReleaseTarget(startIso, w, recapTimes.supportDay, recapTimes.supportTime)
          return recapReleaseHasPassed(target, pToday, pNowMinutes)
        }).sort((a, b) => b.weekNumber - a.weekNumber).slice(0, 1)
        if (supportWeeks.length > 0) {
          const { data: cohortGroups } = await supabase
            .from('Group').select('supportId').eq('cohortId', cohort.id).is('archivedAt', null)
          const supportIds = [...new Set(((cohortGroups ?? []) as any[]).map((g) => g.supportId).filter(Boolean))] as string[]

          for (const week of supportWeeks) {
            if (dryRun) { debug.push({ wouldSend: 'RECAP_SUPPORT', weekId: week.id, supports: supportIds.length }); continue }
            const releaseDateIso = recapReleaseTarget(startIso, week, recapTimes.supportDay, recapTimes.supportTime).isoDate
            const claimed: string[] = []
            for (const userId of supportIds) {
              if (await claimReminder('RECAP_SUPPORT', String(week.id), userId, releaseDateIso, 0)) claimed.push(userId)
            }
            if (claimed.length === 0) continue

            const title = `Week ${week.weekNumber} recap is ready`
            const body = `${week.title ? `${String(week.title).trim()}. ` : ''}Discuss it in your hub in preparation for your group meeting.`
            await insertNotifications(supabase, claimed.map((userId) => ({ userId, title, body, path: '/support/recap', type: 'REMINDER' })))

            const { data: subs } = await supabase
              .from('PushSubscription').select('userId, endpoint, p256dh, auth').in('userId', claimed)
            const rows = ((subs ?? []) as any[]).map((row) => ({ userId: row.userId, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))
            if (rows.length === 0) continue
            const payload = JSON.stringify({ title, body, icon: '/icon-192.png', tag: `RECAP_SUPPORT:${week.id}`, data: { path: '/support/recap' } })
            const r = await sendToSubscriptions(webPush, supabase, rows, payload)
            if (r.failed > 0) console.error(`push-reminders (RECAP_SUPPORT:${week.id}): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }

        // e) "Class manual is out", once the configured manual release time has
        //    passed (or an early release) -- one moment for both audiences.
        //    Only the newest released week is announced (same "backlog" guard
        //    as RECAP_SUPPORT above), so a batch of manuals uploaded late never
        //    fans out into a pile of alerts.
        const manualWeeks = weeks.filter((w) => {
          if (!w.manualDocumentUrl) return false
          if (w.manualReleasedEarlyAt) return true
          const target = manualReleaseTarget(startIso, w, recapTimes.manualDay, recapTimes.manualTime)
          return recapReleaseHasPassed(target, pToday, pNowMinutes)
        }).sort((a, b) => b.weekNumber - a.weekNumber).slice(0, 1)

        for (const week of manualWeeks) {
          // Participants: same claim/bell/push helper as the recap-out block above.
          await pushParticipants([...participantIds], {
            title: `Week ${week.weekNumber} class manual is out`,
            body: `${week.title ? `${String(week.title).trim()}. ` : ''}Read it before your group meeting.`,
            path: `/me/week/${week.weekNumber}`,
            tag: `MANUAL:${week.id}`,
          })

          // Supports: same PushReminderLog claim/bell/push shape as RECAP_SUPPORT.
          if (!dryRun) {
            const { data: cohortGroups } = await supabase
              .from('Group').select('supportId').eq('cohortId', cohort.id).is('archivedAt', null)
            const supportIds = [...new Set(((cohortGroups ?? []) as any[]).map((g) => g.supportId).filter(Boolean))] as string[]
            const releaseDateIso = week.manualReleasedEarlyAt
              ? pToday
              : manualReleaseTarget(startIso, week, recapTimes.manualDay, recapTimes.manualTime).isoDate
            const claimed: string[] = []
            for (const userId of supportIds) {
              if (await claimReminder('MANUAL_SUPPORT', String(week.id), userId, releaseDateIso, 0)) claimed.push(userId)
            }
            if (claimed.length > 0) {
              const title = `Week ${week.weekNumber} class manual is ready`
              const body = `${week.title ? `${String(week.title).trim()}. ` : ''}Read it before your group meeting.`
              await insertNotifications(supabase, claimed.map((userId) => ({ userId, title, body, path: '/support/recap', type: 'REMINDER' })))
              const { data: subs } = await supabase
                .from('PushSubscription').select('userId, endpoint, p256dh, auth').in('userId', claimed)
              const rows = ((subs ?? []) as any[]).map((row) => ({ userId: row.userId, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))
              if (rows.length > 0) {
                const payload = JSON.stringify({ title, body, icon: '/icon-192.png', tag: `MANUAL_SUPPORT:${week.id}`, data: { path: '/support/recap' } })
                const r = await sendToSubscriptions(webPush, supabase, rows, payload)
                if (r.failed > 0) console.error(`push-reminders (MANUAL_SUPPORT:${week.id}): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
              }
            }
          } else {
            debug.push({ wouldSend: 'MANUAL', weekId: week.id })
          }
        }
      }

      // f) "Get ready" reminder at 7pm, only for cohorts whose first class is still
      //    ahead (the loop above starts a day before the start, too late for this).
      //    Tag is per day and the 10-minute window is narrow, so a missed run never
      //    turns into a backlog. Lists only what each person still has to do.
      if (pNowMinutes >= 19 * 60 && pNowMinutes < 19 * 60 + 10 && pToday !== '2026-10-10') {
        const readyCohortId = onlyCohortId ?? await getCurrentProgrammeCohortId()
        const { data: readyCohorts } = readyCohortId
          ? await supabase.from('Cohort').select('id, startDate, status').eq('id', readyCohortId)
          : { data: [] }
        for (const cohort of (readyCohorts ?? []) as any[]) {
          if (!cohort.startDate || cohort.status === 'COMPLETED') continue
          const startIso = String(cohort.startDate).slice(0, 10)
          const { data: week1 } = await supabase.from('Week').select('weekNumber, classDate, title').eq('cohortId', cohort.id).eq('weekNumber', 1).maybeSingle()
          const firstClassIso = week1 ? classIsoFor(startIso, week1 as any) : startIso
          if (daysBetweenIso(pToday, firstClassIso) < 1) continue
          const { data: accounts } = await supabase
            .from('ParticipantAccount').select('participantId, participant:Participant!inner(id, cohortId, status)')
            .eq('isActive', true).eq('participant.cohortId', cohort.id).eq('participant.status', 'ACTIVE')
          const rows = (accounts ?? []) as any[]
          if (rows.length === 0) continue
          const ids = rows.map((a) => a.participantId)
          // Where each person stands comes from the same database function the app uses
          // (introduction posted, support's intro posted, guide read, profile at 100%,
          // ready confirmed, completed). Service role can call it.
          const [{ data: stepRows }, stateList] = await Promise.all([
            supabase.from('ParticipantReadyStep').select('participantId, step').in('participantId', ids),
            Promise.all(ids.map(async (id: string) => {
              const { data, error } = await supabase.rpc('participant_onboarding_state', { p_participant_id: id })
              return [id, error ? null : (data as any)] as const
            })),
          ])
          const doneSteps = new Set(((stepRows ?? []) as any[]).map((r) => `${r.participantId}:${r.step}`))
          const states = new Map<string, any>(stateList)

          // Group people by identical wording: one send per message.
          const byBody = new Map<string, string[]>()
          for (const a of rows) {
            const st = states.get(a.participantId)
            if (!st || st.completed || st.hasAttended) continue
            const guideRead = !!st.introGuideRead || doneSteps.has(`${a.participantId}:intro`)
            const left: string[] = []
            if (st.supportIntroPosted && !st.introPosted) left.push('introduce yourself')
            if (!guideRead) left.push('read the Intro Class guide')
            if (!st.profileComplete) left.push('finish your profile')
            if (!st.venueMapAcknowledged) left.push('check the venue map')
            if (left.length === 0 && st.introPosted && !st.readyConfirmed) left.push("confirm you're ready for class")
            if (left.length === 0) continue
            const body = `Still to do: ${left.join(', ')}`
            byBody.set(body, [...(byBody.get(body) ?? []), a.participantId])
          }
          for (const [body, participantIds] of byBody) {
            await pushParticipants(participantIds, { title: 'Get ready for FOF', body, path: '/me', tag: `GET_READY:${pToday}` })
          }
        }
      }

      // h) One-off onboarding nudges on Saturday 10 Oct 2026: 6:00 pm "introductions in your group" (tells people to nudge their
      //    support if the support has not introduced themselves yet) and 8:00 pm "here is what is still open" with the readiness badge. Everyone with an active
      //    account in the running cohort who has not attended or completed is considered; each person only gets what applies.
      //    The 7pm "Get ready" above is skipped on this day so nobody gets three in two hours.
      if (pToday === '2026-10-10' && ((pNowMinutes >= 18 * 60 && pNowMinutes < 18 * 60 + 10) || (pNowMinutes >= 20 * 60 && pNowMinutes < 20 * 60 + 10))) {
        const nudgeCohortId = onlyCohortId ?? await getCurrentProgrammeCohortId()
        if (nudgeCohortId) {
          const { data: accounts } = await supabase
            .from('ParticipantAccount').select('participantId, participant:Participant!inner(id, cohortId, status)')
            .eq('isActive', true).eq('participant.cohortId', nudgeCohortId).eq('participant.status', 'ACTIVE')
          const ids = ((accounts ?? []) as any[]).map((a) => a.participantId)
          if (ids.length > 0) {
            const [{ data: stepRows }, stateList] = await Promise.all([
              supabase.from('ParticipantReadyStep').select('participantId, step').in('participantId', ids),
              Promise.all(ids.map(async (id: string) => {
                const { data, error } = await supabase.rpc('participant_onboarding_state', { p_participant_id: id })
                return [id, error ? null : (data as any)] as const
              })),
            ])
            const doneSteps = new Set(((stepRows ?? []) as any[]).map((r) => `${r.participantId}:${r.step}`))
            const states = new Map<string, any>(stateList)
            if (pNowMinutes < 19 * 60) {
              // Only people already in a group (otherwise there is no support to nudge and nowhere to introduce yourself).
              const { data: grouped } = await supabase.from('GroupParticipant').select('participantId').in('participantId', ids)
              const inGroup = new Set(((grouped ?? []) as any[]).map((r) => r.participantId))
              const byText = new Map<string, string[]>()
              for (const id of ids) {
                const st = states.get(id)
                if (!st || st.completed || st.hasAttended || !inGroup.has(id)) continue
                let body: string | null = null
                if (!st.supportIntroPosted) {
                  body = st.introPosted
                    ? 'Has your support introduced themselves in your group yet? If not, give them a nudge to do so.'
                    : 'Has your support introduced themselves in your group yet? If not, nudge them to do so. Then introduce yourself too.'
                } else if (!st.introPosted) {
                  body = 'Have you introduced yourself in your group yet? Say hi now so everyone gets to know you.'
                }
                if (body) byText.set(body, [...(byText.get(body) ?? []), id])
              }
              for (const [body, group] of byText) {
                await pushParticipants(group, { title: 'Introductions in your group', body, path: '/me/group', tag: 'ONBOARD_NUDGE:2026-10-10:1800' })
              }
            } else {
              const byBody = new Map<string, string[]>()
              for (const id of ids) {
                const st = states.get(id)
                if (!st || st.completed || st.hasAttended) continue
                const guideRead = !!st.introGuideRead || doneSteps.has(`${id}:intro`)
                const left: string[] = []
                if (!st.introPosted) left.push('introduce yourself')
                if (!guideRead) left.push('read the Intro Class guide')
                if (!st.profileComplete) left.push('finish your profile')
                if (!st.venueMapAcknowledged) left.push('check the venue map')
                if (left.length === 0 && !st.readyConfirmed) left.push("confirm you're ready for class")
                if (left.length === 0) continue
                const body = `Almost there. Still to do: ${left.join(', ')}. Finish every step to earn your readiness badge.`
                byBody.set(body, [...(byBody.get(body) ?? []), id])
              }
              for (const [body, group] of byBody) {
                await pushParticipants(group, { title: 'Finish getting ready for FOF', body, path: '/me', tag: 'ONBOARD_NUDGE:2026-10-10:2000' })
              }
            }
          }
        }
      }

      // g) "View the venue map" for the first two FOF Sundays: Saturday 5:00 pm and 8:00 pm, then Sunday 6:00 am.
      //    Everyone with an active account in the running cohort gets it, whether or not they have opened the map
      //    before, because the point is to know where to go after first service. Tag is per service day and slot,
      //    and each window is one 10-minute cron run wide, so a missed run never becomes a backlog.
      //    "First two weeks" = the first two Sundays from the cohort's start date.
      {
        const VENUE_SLOTS = [
          { code: '1700', minute: 17 * 60, dayIndex: 6, daysAhead: 1 },
          { code: '2000', minute: 20 * 60, dayIndex: 6, daysAhead: 1 },
          { code: '0600', minute: 6 * 60, dayIndex: 0, daysAhead: 0 },
        ]
        const slot = VENUE_SLOTS.find((v) => pDayIndex === v.dayIndex && pNowMinutes >= v.minute && pNowMinutes < v.minute + 10)
        const mapCohortId = slot ? (onlyCohortId ?? await getCurrentProgrammeCohortId()) : null
        if (slot && mapCohortId) {
          const serviceIso = addLagosDays(pToday, slot.daysAhead)
          const { data: mapCohort } = await supabase.from('Cohort').select('id, startDate, status').eq('id', mapCohortId).maybeSingle()
          if (mapCohort?.startDate && (mapCohort as any).status !== 'COMPLETED') {
            const startIso = String((mapCohort as any).startDate).slice(0, 10)
            // The first two Sundays on or after the cohort's start date, wherever the Planner puts the classes.
            // (If the start date is not itself a Sunday, the first Sunday after it is the first service.)
            const firstSunday = addLagosDays(startIso, (7 - lagosDayIndex(startIso)) % 7)
            const serviceDays = new Set([firstSunday, addLagosDays(firstSunday, 7)])
            if (serviceDays.has(serviceIso)) {
              const { data: accounts } = await supabase
                .from('ParticipantAccount').select('participantId, participant:Participant!inner(id, cohortId, status)')
                .eq('isActive', true).eq('participant.cohortId', mapCohortId).eq('participant.status', 'ACTIVE')
              const ids = ((accounts ?? []) as any[]).map((a) => a.participantId)
              if (ids.length > 0) {
                const sunday = slot.daysAhead === 0
                await pushParticipants(ids, {
                  title: sunday ? 'Today at FOF' : 'Tomorrow at FOF',
                  body: sunday
                    ? 'After first service, head to the New VIP Lounge. Open the venue map now so you know the way.'
                    : 'After first service, view the venue map so you know where to go.',
                  path: '/me?map=1',
                  tag: `VENUE_MAP:${serviceIso}:${slot.code}`,
                })
              }
            }
          }
        }
      }
    }

    // 7. Follow-up due-date reminders — one push per contact per due date.
    //    dueReminderSentAt acts as the dedupe guard across 10-minute cron runs;
    //    changing a contact's due date resets it to null (re-arms the reminder).
    const { data: dueContacts } = await supabase
      .from('FollowUpContact')
      .select('id, fullName, nextAction, dueDate, ownerId, registrationStatus')
      .lte('dueDate', todayISO)
      .is('archivedAt', null)
      .is('dueReminderSentAt', null)
      .is('noResponseAt', null)
      .not('ownerId', 'is', null)

    const NEXT_ACTION_LABELS: Record<string, string> = {
      SEND_MESSAGE: 'Send message',
      SEND_REMINDER: 'Send reminder',
      CALL: 'Call',
      CLOSE: 'Close',
    }

    for (const contact of (dryRun ? [] : ((dueContacts || []) as any[])).filter((row) =>
      row.nextAction !== 'CLOSE' && !TERMINAL_REGISTRATION_STATUSES.has(row.registrationStatus)
    )) {
      if (onlyUserIds && !onlyUserIds.includes(contact.ownerId)) continue

      const { data: subs } = await supabase
        .from('PushSubscription')
        .select('userId, endpoint, p256dh, auth')
        .eq('userId', contact.ownerId)

      const payload = JSON.stringify({
        title: 'Follow-up due',
        body: `${contact.fullName}: ${NEXT_ACTION_LABELS[contact.nextAction] || 'Follow up'}`,
        icon: '/icon-192.png',
        tag: `fof-followup-due-${contact.id}-${contact.dueDate}`,
        data: { path: '/support/mobilisation?tab=follow' },
      })

      {
        const r = await sendToSubscriptions(webPush, supabase, (subs || []) as any[], payload, notified)
        if (r.failed > 0) console.error(`push-reminders (followup-due): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
      }

      // Mark as reminded even with no active subscriptions, so the contact
      // isn't re-processed every 10 minutes.
      await supabase
        .from('FollowUpContact')
        .update({ dueReminderSentAt: now.toISOString() })
        .eq('id', contact.id)
    }

    // 8:00 AM WAT owner reminder — once per owner per day for open follow-ups.
    if (!dryRun && lagos.hour === 8 && lagos.minute < 10) {
      const { data: openContacts } = await supabase
        .from('FollowUpContact')
        .select('id, ownerId, fullName, nextAction, registrationStatus, cohortId')
        .is('archivedAt', null)
        .is('noResponseAt', null)
        .not('ownerId', 'is', null)

      // Only the current cohort: supports can't see past-cohort people, so nudging about them is noise.
      const currentCohortId = await getCurrentProgrammeCohortId()
      const inCurrentCohort = (contact: any) => !contact.cohortId || contact.cohortId === currentCohortId

      const eligibleContacts = ((openContacts || []) as any[]).filter((contact) =>
        contact.nextAction !== 'CLOSE' && !TERMINAL_REGISTRATION_STATUSES.has(contact.registrationStatus)
        && inCurrentCohort(contact)
      )

      const ownerIds = Array.from(new Set(eligibleContacts.map((contact) => contact.ownerId).filter(Boolean)))

      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('User')
          .select('id, role, roles')
          .in('id', ownerIds)

        // Admins who also carry the Support tag are supports here too.
        const eligibleOwnerIds = new Set((owners || []).filter(isSupportOrTagged).map((owner: any) => owner.id))

        for (const ownerId of ownerIds) {
          if (!eligibleOwnerIds.has(ownerId)) continue

          const { error: logError } = await supabase
            .from('FollowUpOwnerReminderLog')
            .insert([{
              userId: ownerId,
              reminderDate: todayISO,
              kind: 'OPEN_CONTACTS_8AM',
            }])

          if (logError) {
            if (logError.code === '23505') continue
            throw new Error(logError.message)
          }

          const contactCount = eligibleContacts.filter((contact) => contact.ownerId === ownerId).length
          const { data: subs } = await supabase
            .from('PushSubscription')
            .select('userId, endpoint, p256dh, auth')
            .eq('userId', ownerId)

          const payload = JSON.stringify({
            title: 'Follow-ups need attention',
            body: `You still have ${contactCount} follow-up contact${contactCount === 1 ? '' : 's'} to check today. Check in so no one slips through.`,
            icon: '/icon-192.png',
            tag: `fof-followup-owner-reminder-${ownerId}-${todayISO}`,
            data: { path: '/support/mobilisation?tab=follow' },
          })

          {
            const r = await sendToSubscriptions(webPush, supabase, (subs || []) as any[], payload, notified)
            if (r.failed > 0) console.error(`push-reminders (followup-owner): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
      }
    }

    // "No activity" nudge at 9am, 12pm, 4pm and 9pm Lagos: a support is nudged while a
    // contact given to them 24+ hours ago has had no status change since, and no issue
    // logged on it since. Honours asOf (dry runs can pretend it's 9:05 tomorrow).
    // One alert per support per slot, deduped in FollowUpOwnerReminderLog.
    {
      const naClock = asOf ?? now
      const naLagos = getLagosDateParts(naClock)
      const naMinutes = naLagos.hour * 60 + naLagos.minute
      const naSlot = [[9, '0900'], [12, '1200'], [16, '1600'], [21, '2100']]
        .find(([hour]) => naMinutes >= (hour as number) * 60 && naMinutes < (hour as number) * 60 + 10)
      if (naSlot) {
        const naKind = `NO_ACTIVITY_${naSlot[1]}`
        const cutoffIso = new Date(naClock.getTime() - 24 * 60 * 60 * 1000).toISOString()
        const naCurrentCohortId = await getCurrentProgrammeCohortId()
        const { data: assigned } = await supabase
          .from('FollowUpContact')
          .select('id, ownerId, fullName, nextAction, registrationStatus, ownerAssignedAt, statusChangedAt, cohortId')
          .is('archivedAt', null)
          .is('noResponseAt', null)
          .not('ownerId', 'is', null)
          .not('ownerAssignedAt', 'is', null)
          .lte('ownerAssignedAt', cutoffIso)

        // Status hasn't changed since it was assigned.
        const unmoved = ((assigned || []) as any[]).filter((contact) =>
          contact.nextAction !== 'CLOSE'
          && !TERMINAL_REGISTRATION_STATUSES.has(contact.registrationStatus)
          && (!contact.statusChangedAt || contact.statusChangedAt < contact.ownerAssignedAt)
          && (!onlyUserIds || onlyUserIds.includes(contact.ownerId))
          && (!contact.cohortId || contact.cohortId === naCurrentCohortId)
        )

        // An issue logged on the contact since it was assigned (any status) also stops the nudge.
        const withIssue = new Set<string>()
        if (unmoved.length > 0) {
          const { data: links } = await supabase
            .from('FollowUpIssueContact')
            .select('contactId, issue:FollowUpIssue!inner(createdAt)')
            .in('contactId', unmoved.map((contact) => contact.id))
          const assignedAtById = new Map(unmoved.map((contact) => [contact.id, contact.ownerAssignedAt as string]))
          for (const link of (links || []) as any[]) {
            const issue = Array.isArray(link.issue) ? link.issue[0] : link.issue
            const assignedAt = assignedAtById.get(link.contactId)
            if (issue?.createdAt && assignedAt && issue.createdAt >= assignedAt) withIssue.add(link.contactId)
          }
        }

        const staleByOwner = new Map<string, any[]>()
        for (const contact of unmoved) {
          if (withIssue.has(contact.id)) continue
          staleByOwner.set(contact.ownerId, [...(staleByOwner.get(contact.ownerId) ?? []), contact])
        }

        if (staleByOwner.size > 0) {
          const { data: owners } = await supabase
            .from('User')
            .select('id, role, roles')
            .in('id', [...staleByOwner.keys()])

          for (const owner of ((owners || []) as any[]).filter(isSupportOrTagged)) {
            const stale = staleByOwner.get(owner.id) ?? []
            if (stale.length === 0) continue
            const ending = 'Any challenge? Tap ⋮ on the person and Log an issue, and these reminders stop.'
            const firstNames = stale.map((contact) => String(contact.fullName || '').trim().split(/\s+/)[0]).filter(Boolean)
            const shown = firstNames.slice(0, 2).join(', ')
            const more = firstNames.length > 2 ? `, +${firstNames.length - 2}` : ''
            const title = 'No activity on your follow-ups'
            const body = stale.length === 1
              ? `${String(stale[0].fullName || '').trim()} was given to you over a day ago and hasn't moved yet. ${ending}`
              : `${stale.length} people you were given over a day ago haven't moved yet (${shown}${more}). ${ending}`

            if (dryRun) {
              debug.push({ wouldSend: naKind, userId: owner.id, title, body })
              continue
            }

            const { error: logError } = await supabase
              .from('FollowUpOwnerReminderLog')
              .insert([{ userId: owner.id, reminderDate: naLagos.isoDate, kind: naKind }])
            if (logError) {
              if (logError.code === '23505') continue
              throw new Error(logError.message)
            }

            const path = '/support/mobilisation?tab=follow'
            await insertNotifications(supabase, [{ userId: owner.id, title, body, path, type: 'REMINDER' }])
            const { data: subs } = await supabase
              .from('PushSubscription')
              .select('userId, endpoint, p256dh, auth')
              .eq('userId', owner.id)
            const payload = JSON.stringify({
              title,
              body,
              icon: '/icon-192.png',
              tag: `fof-followup-no-activity-${owner.id}-${naLagos.isoDate}-${naSlot[1]}`,
              data: { path },
            })
            const r = await sendToSubscriptions(webPush, supabase, (subs || []) as any[], payload, notified)
            if (r.failed > 0) console.error(`push-reminders (followup-no-activity): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
      }
    }

    // Surveys that have just opened: one announcement per survey and cohort, to
    // whoever the survey is for. Skipped in the test modes.
    if (!dryRun && !onlyUserIds && !onlyParticipantIds && !onlyCohortId) {
      try {
        const { data: dueSurveys } = await supabase.rpc('survey_notifications_due')
        for (const due of (dueSurveys ?? []) as any[]) {
          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-announcement`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: due.title,
              body: 'Open the app and tap it on your Home screen to answer. It only takes a couple of minutes.',
              sentBy: due.created_by,
              scope: due.cohort_id ? 'ACTIVE_COHORT' : 'ALL_USERS',
              cohortId: due.cohort_id,
              audience: due.audience,
              targetHubId: due.hub_id,
              targetLabelId: due.label_id,
              targetGroupId: due.group_id,
            }),
          })
          if (res.ok) {
            await supabase.rpc('survey_mark_notified', { p_survey: due.survey_id, p_cohort: due.cohort_id })
          } else {
            console.error('push-reminders (survey open): send-announcement failed', res.status, (await res.text()).slice(0, 300))
          }
        }
      } catch (surveyError) {
        console.error('push-reminders (survey open) failed:', String(surveyError))
      }
    }

    // Birthdays: tell every admin two days and one day before someone's birthday
    // (supports, and participants in a running cohort). Sent from 8am Lagos time;
    // the log in the database stops any alert repeating. Skipped in the test modes.
    if (!dryRun && !onlyUserIds && !onlyParticipantIds && !onlyCohortId) {
      try {
        if (getLagosDateParts(new Date()).hour >= 8) {
          const { data: dueBirthdays } = await supabase.rpc('birthday_alerts_due')
          const alerts = (dueBirthdays ?? []) as Array<{ subject_key: string; person_name: string; kind: string; birthday_date: string; days_before: number }>
          if (alerts.length > 0) {
            // Everyone who can See Birthdays (admins, and Team members whose roles include it), test accounts left out.
            const viewerIds = await moduleViewerIds(supabase, 'birthdays')
            const { data: adminRows } = viewerIds.length > 0
              ? await supabase.from('User').select('id, isTest').in('id', viewerIds)
              : { data: [] }
            const adminIds = ((adminRows ?? []) as any[]).filter((a) => a.isTest !== true).map((a) => a.id as string)
            const ordinal = (n: number) => {
              const v = n % 100
              if (v >= 11 && v <= 13) return `${n}th`
              return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
            }
            for (const daysBefore of [2, 1]) {
              const group = alerts.filter((a) => a.days_before === daysBefore)
              if (group.length === 0 || adminIds.length === 0) continue
              const when = daysBefore === 1 ? 'tomorrow' : 'in 2 days'
              const title = group.length === 1 ? `Birthday ${when}` : `${group.length} birthdays ${when}`
              const describe = (a: typeof group[number]) =>
                `${a.person_name} (${a.kind === 'SUPPORT' ? 'support' : 'participant'}), the ${ordinal(Number(a.birthday_date.slice(8, 10)))}`
              const shown = group.slice(0, 5).map(describe).join('; ')
              const body = group.length > 5 ? `${shown}; +${group.length - 5} more` : shown
              const path = '/birthdays'
              await insertNotifications(supabase, adminIds.map((userId) => ({ userId, title, body, path, type: 'REMINDER' })))
              const { data: subs } = await supabase
                .from('PushSubscription')
                .select('userId, endpoint, p256dh, auth')
                .in('userId', adminIds)
              const payload = JSON.stringify({
                title,
                body,
                icon: '/icon-192.png',
                tag: `fof-birthday-${daysBefore}-${getLagosDateParts(new Date()).isoDate}`,
                data: { path },
              })
              const r = await sendToSubscriptions(webPush, supabase, (subs || []) as any[], payload, notified)
              if (r.failed > 0) console.error(`push-reminders (birthdays): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
            }
            await supabase.rpc('birthday_alerts_mark', {
              p_alerts: alerts.map((a) => ({ subjectKey: a.subject_key, birthdayDate: a.birthday_date, daysBefore: a.days_before })),
            })
          }
        }
      } catch (birthdayError) {
        console.error('push-reminders (birthdays) failed:', String(birthdayError))
      }
    }

    // Get-the-app nudge: once a day (9am to 7pm Lagos), tell each support which of their
    // participants have signed in but not installed the app, or installed it with alerts off.
    // Ends the day the cohort starts. The database claims each support once per day.
    if (!dryRun && !onlyUserIds && !onlyParticipantIds && !onlyCohortId) {
      try {
        const lagosNow = getLagosDateParts(new Date())
        if (lagosNow.hour >= 9 && lagosNow.hour < 19) {
          const { data: dueNudges } = await supabase.rpc('app_nudge_due')
          const nudges = (dueNudges ?? []) as Array<{ ownerId: string; notInstalled: number; noAlerts: number; names: string[] }>
          for (const nudge of nudges) {
            const total = nudge.notInstalled + nudge.noAlerts
            if (total === 0) continue
            const shown = (nudge.names ?? []).slice(0, 3).map((n) => n.split(' ')[0]).join(', ')
            const more = total > 3 ? ` +${total - 3}` : ''
            const what = nudge.notInstalled > 0 && nudge.noAlerts > 0
              ? 'have not installed the app or have alerts off'
              : nudge.notInstalled > 0 ? 'have signed in but not installed the app' : 'have the app but alerts are off'
            const title = total === 1 ? '1 participant still needs the app' : `${total} participants still need the app`
            const body = `${shown}${more} ${what}. Send them the install video. You can also send it to anyone you follow up from Message templates on Follow-ups.`
            const path = '/support'
            await insertNotifications(supabase, [{ userId: nudge.ownerId, title, body, path, type: 'REMINDER' }])
            const { data: nudgeSubs } = await supabase
              .from('PushSubscription')
              .select('userId, endpoint, p256dh, auth')
              .eq('userId', nudge.ownerId)
            const r = await sendToSubscriptions(webPush, supabase, (nudgeSubs || []) as any[], JSON.stringify({
              title,
              body,
              icon: '/icon-192.png',
              tag: `fof-app-nudge-${nudge.ownerId}-${lagosNow.isoDate}`,
              data: { path },
            }), notified)
            if (r.failed > 0) console.error(`push-reminders (app nudge): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
      } catch (nudgeError) {
        console.error('push-reminders (app nudge) failed:', String(nudgeError))
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notified: notified.length, ...(dryRun ? { dryRun: true, debug } : {}) }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('push-reminders error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
