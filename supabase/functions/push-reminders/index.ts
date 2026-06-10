/**
 * Push Reminders Edge Function
 *
 * Triggered by a Supabase cron (every 10 minutes).
 * Reads notification_settings to know which reminder intervals are active,
 * then sends Web Push to supports whose activities fall within each window.
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

Deno.serve(async (_req) => {
  try {
    // 1. Get configured reminder intervals
    const { data: settingRow } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'remind_before_minutes')
      .maybeSingle()

    const remindIntervals: number[] = Array.isArray(settingRow?.value)
      ? (settingRow.value as number[])
      : [60]

    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    // 2. For each interval, compute the target time window
    // "Send reminder X minutes before activity" → activity time ≈ now + X (within ±5 min window)
    const WINDOW = 5 // ±5 minutes tolerance

    const notified: string[] = []

    for (const interval of remindIntervals) {
      const targetMinutes = nowMinutes + interval

      // 3. Fetch today's activities near that target time
      const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = dayOrder[now.getDay()]

      const { data: activities } = await supabase
        .from('Activity')
        .select(`
          id, time, description, period,
          Day!inner(dayName, weekId),
          ActivityLabel(labelId)
        `)
        .eq('Day.dayName', todayName)

      if (!activities) continue

      const matchingActivities = activities.filter((a: any) => {
        const t = parseTime(a.time)
        if (t === null) return false
        return Math.abs(t - targetMinutes) <= WINDOW
      })

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

        const userIds = [...new Set((userLabels as any[]).map((ul: any) => ul.userId))]

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

        // 6. Send push to each subscription
        for (const sub of subs as any[]) {
          const pushSub = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          }
          try {
            await webPush.sendNotification(pushSub, payload)
            notified.push(sub.userId)
          } catch (err: any) {
            // 410 Gone = subscription expired, clean it up
            if (err?.statusCode === 410) {
              await supabase
                .from('PushSubscription')
                .delete()
                .eq('userId', sub.userId)
                .eq('endpoint', sub.endpoint)
            }
          }
        }
      }
    }

    // 7. Follow-up due-date reminders — one push per contact per due date.
    //    dueReminderSentAt acts as the dedupe guard across 10-minute cron runs;
    //    changing a contact's due date resets it to null (re-arms the reminder).
    const lagosNow = getLagosDateParts(now)
    const todayISO = lagosNow.isoDate

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

    for (const contact of ((dueContacts || []) as any[]).filter((row) =>
      row.nextAction !== 'CLOSE' && !TERMINAL_REGISTRATION_STATUSES.has(row.registrationStatus)
    )) {
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

      for (const sub of (subs || []) as any[]) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }
        try {
          await webPush.sendNotification(pushSub, payload)
          notified.push(sub.userId)
        } catch (err: any) {
          if (err?.statusCode === 410) {
            await supabase
              .from('PushSubscription')
              .delete()
              .eq('userId', sub.userId)
              .eq('endpoint', sub.endpoint)
          }
        }
      }

      // Mark as reminded even with no active subscriptions, so the contact
      // isn't re-processed every 10 minutes.
      await supabase
        .from('FollowUpContact')
        .update({ dueReminderSentAt: now.toISOString() })
        .eq('id', contact.id)
    }

    // 8:00 AM WAT owner reminder — once per owner per day for open follow-ups.
    if (lagosNow.hour === 8 && lagosNow.minute < 10) {
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

          for (const sub of (subs || []) as any[]) {
            const pushSub = {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            }
            try {
              await webPush.sendNotification(pushSub, payload)
              notified.push(sub.userId)
            } catch (err: any) {
              if (err?.statusCode === 410) {
                await supabase
                  .from('PushSubscription')
                  .delete()
                  .eq('userId', sub.userId)
                  .eq('endpoint', sub.endpoint)
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notified: notified.length }),
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
