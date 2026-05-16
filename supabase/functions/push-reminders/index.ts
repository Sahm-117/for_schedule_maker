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
