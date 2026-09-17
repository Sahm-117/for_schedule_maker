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
 * window. All timing is derived in Africa/Lagos, never server-local: edge
 * functions run UTC and the users do not.
 *
 * Test modes (body JSON, both safe against the 20 real users):
 *   { "dryRun": true }            — compute everything, send nothing, log nothing
 *   { "onlyUserIds": ["<uuid>"] } — restrict delivery to specific users
 *   { "onlyParticipantIds": [...], "cohortId": "<uuid>", "asOf": "<ISO>" } — participant
 *     reminders only for those participants / that cohort, as if it were that moment
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

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com'

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const TERMINAL_REGISTRATION_STATUSES = new Set(['NOT_INTERESTED', 'NOT_A_TCN_MEMBER'])

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

interface LiveWeek {
  weekId: number
  weekNumber: number
  cohortId: string
}

/**
 * Which week is currently "live" for each ACTIVE, published cohort.
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
  const { data: cohorts } = await supabase
    .from('Cohort')
    .select('id, startDate, endDate, schedulePublished, status')
    .eq('status', 'ACTIVE')
    .eq('schedulePublished', true)

  const live: LiveWeek[] = []
  const anchorIso = lastSunday10amIso(todayIso, hour)

  for (const cohort of (cohorts || []) as any[]) {
    // A null startDate would otherwise pin the cohort to week 1 forever.
    if (!cohort.startDate) continue
    const startIso = String(cohort.startDate).slice(0, 10)
    if (cohort.endDate && todayIso > String(cohort.endDate).slice(0, 10)) continue

    const idealWeekNumber = Math.max(1, Math.floor(daysBetweenIso(startIso, anchorIso) / 7) + 1)

    const { data: weeks } = await supabase
      .from('Week')
      .select('id, weekNumber')
      .eq('cohortId', cohort.id)
      .order('weekNumber', { ascending: true })

    const sorted = (weeks || []) as any[]
    if (sorted.length === 0) continue

    // Clamp to the cohort's real range, exactly as getIdealWeekForCohort does.
    const exact = sorted.find((w: any) => w.weekNumber === idealWeekNumber)
    const chosen = exact
      ? exact
      : idealWeekNumber <= sorted[0].weekNumber
      ? sorted[0]
      : sorted[sorted.length - 1]

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
  kind: 'ACTIVITY' | 'GROUP_MEETING',
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
          title: `FOF Reminder — ${minuteLabel} away`,
          body: `${activity.time} — ${activity.description}`,
          icon: '/icon-192.png',
          tag: `fof-${activity.id}-${interval}`,
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
          .select('id, name, meetingTime, supportId')
          .eq('meetingDay', DAY_NAMES_UPPER[target.dayIndex])
          .not('supportId', 'is', null)
          .not('meetingTime', 'is', null)

        if (!groups || groups.length === 0) continue

        const matchingGroups = (groups as any[]).filter((g: any) => {
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
            title: `🙏 Group meeting reminder — ${minuteLabel} away`,
            body: `${group.name} prayer meeting at ${group.meetingTime}`,
            icon: '/icon-192.png',
            tag: `fof-groupmeeting-${group.id}-${interval}`,
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
        const { data: subs } = await supabase.from('ParticipantPushSubscription').select('participantId, endpoint, p256dh, auth').in('participantId', claimed)
        const rows = ((subs ?? []) as any[]).map((row) => ({ userId: row.participantId, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))
        if (rows.length === 0) return
        const payload = JSON.stringify({ title: message.title, body: message.body, icon: '/icon-192.png', tag: message.tag, data: { path: message.path } })
        const r = await sendToSubscriptions(webPush, supabase, rows, payload, undefined, PARTICIPANT_PUSH_STORE)
        if (r.failed > 0) console.error(`push-reminders (participants ${message.tag}): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
      }
      const autoReleaseAt = (startIso: string, weekNumber: number, meetingDay: string | null, meetingTime: string | null) => {
        const start = new Date(`${startIso}T00:00:00Z`).getTime()
        const t = meetingTime ? parseTime(meetingTime) : null
        const dayOffset = meetingDay ? DAY_NAMES_UPPER.indexOf(String(meetingDay).toUpperCase()) : -1
        if (dayOffset >= 0 && t !== null) {
          // Lagos wall clock is UTC+1: one hour after the meeting is the meeting's UTC clock reading.
          return start + ((weekNumber - 1) * 7 + dayOffset) * 86400000 + t * 60000
        }
        return start + weekNumber * 7 * 86400000 - 3600000
      }

      const { data: pCohorts } = onlyCohortId
        ? await supabase.from('Cohort').select('id, startDate, endDate, status').eq('id', onlyCohortId)
        : await supabase.from('Cohort').select('id, startDate, endDate, status').eq('status', 'ACTIVE')
      for (const cohort of (pCohorts ?? []) as any[]) {
        if (!cohort.startDate) continue
        const startIso = String(cohort.startDate).slice(0, 10)
        const endIso = cohort.endDate ? String(cohort.endDate).slice(0, 10) : null
        if (daysBetweenIso(startIso, pToday) < -1) continue
        if (endIso && daysBetweenIso(endIso, pToday) > 7) continue

        const [{ data: accounts }, { data: pWeeks }, { data: pGroups }, { data: settings }] = await Promise.all([
          supabase.from('ParticipantAccount').select('participantId, participant:Participant!inner(id, cohortId, status)').eq('isActive', true).eq('participant.cohortId', cohort.id).eq('participant.status', 'ACTIVE'),
          supabase.from('Week').select('id, weekNumber, title, shareWithParticipants, recapSummary, recapDocumentUrl').eq('cohortId', cohort.id),
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
          const sinceStart = daysBetweenIso(startIso, sundayIso)
          if (sinceStart < 0 || sinceStart % 7 !== 0) continue
          const week = weeks.find((w) => w.weekNumber === sinceStart / 7 + 1)
          if (!week) continue
          const { data: days } = await supabase.from('Day').select('Activity(time, description)').eq('weekId', week.id).eq('dayName', 'Sunday')
          const classActivity = ((days ?? []) as any[]).flatMap((d) => d.Activity ?? []).find((a: any) => /^\s*class\s*\d|introductory class/i.test(String(a.description || '')))
          if (!classActivity) continue
          const minutes = parseTime(String(classActivity.time))
          const time = minutes === null ? '' : `${((Math.floor(minutes / 60) + 11) % 12) + 1}:${String(minutes % 60).padStart(2, '0')} ${minutes >= 720 ? 'PM' : 'AM'}`
          const topic = String(week.title || '').trim()
          const message = nudge.key === 'SAT_NOON'
            ? { title: 'See you tomorrow! 🙌', body: `FOF class is at ${time}. We can't wait to see you in church.` }
            : nudge.key === 'SAT_EVENING'
            ? { title: "Tomorrow's the day", body: topic ? `This week's topic is ${topic}. Get some rest, your seat is waiting.` : 'Get some rest, your seat is waiting.' }
            : { title: 'Good morning! Church today 🙏', body: `FOF class starts at ${time}. See you soon.` }
          await pushParticipants([...participantIds], { ...message, path: '/me', tag: `SUNDAY_NUDGE:${week.id}:${nudge.key}` })
        }

        // b) Group call reminders at each participant's chosen timings.
        const intervals = [...new Set([...participantIds].flatMap(meetingMinutesFor))]
        for (const interval of intervals) {
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
              title: `🙏 Group meeting reminder — ${minuteLabel} away`,
              body: `${group.name} prayer meeting at ${group.meetingTime}`,
              path: '/me/group',
              tag: `GROUP_MEETING:${group.id}:${interval}:${target.isoDate}`,
            })
          }
        }

        // c) "Recap is out": within a day of the release (by the support, or automatic).
        const sharedWeeks = weeks.filter((w) => w.shareWithParticipants !== false && (String(w.recapSummary || '').trim() || w.recapDocumentUrl))
        if (sharedWeeks.length > 0) {
          const { data: releases } = await supabase.from('RecapRelease').select('groupId, weekId, releasedAt').in('weekId', sharedWeeks.map((w) => w.id))
          const releasedAt = new Map(((releases ?? []) as any[]).map((r) => [`${r.groupId}:${r.weekId}`, new Date(r.releasedAt).getTime()]))
          const nowMs = clock.getTime()
          for (const week of sharedWeeks) {
            for (const group of groups) {
              const at = releasedAt.get(`${group.id}:${week.id}`) ?? autoReleaseAt(startIso, week.weekNumber, group.meetingDay, group.meetingTime)
              if (at > nowMs || nowMs - at > 86400000) continue
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
        title: '⏰ Follow-up due',
        body: `${contact.fullName} — ${NEXT_ACTION_LABELS[contact.nextAction] || 'Follow up'}`,
        icon: '/icon-192.png',
        tag: `fof-followup-due-${contact.id}-${contact.dueDate}`,
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
        .select('id, ownerId, fullName, nextAction, registrationStatus')
        .is('archivedAt', null)
        .not('ownerId', 'is', null)

      const eligibleContacts = ((openContacts || []) as any[]).filter((contact) =>
        contact.nextAction !== 'CLOSE' && !TERMINAL_REGISTRATION_STATUSES.has(contact.registrationStatus)
      )

      const ownerIds = Array.from(new Set(eligibleContacts.map((contact) => contact.ownerId).filter(Boolean)))

      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('User')
          .select('id, role')
          .in('id', ownerIds)
          .neq('role', 'ADMIN')

        const eligibleOwnerIds = new Set((owners || []).map((owner: any) => owner.id))

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
          })

          {
            const r = await sendToSubscriptions(webPush, supabase, (subs || []) as any[], payload, notified)
            if (r.failed > 0) console.error(`push-reminders (followup-owner): ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`, JSON.stringify(r.errors))
          }
        }
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
