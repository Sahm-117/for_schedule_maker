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
import { sendToSubscriptions } from '../_shared/webpush.ts'

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
    try {
      const body = await req.json()
      dryRun = body?.dryRun === true
      if (Array.isArray(body?.onlyUserIds) && body.onlyUserIds.length > 0) {
        onlyUserIds = body.onlyUserIds.map(String)
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
