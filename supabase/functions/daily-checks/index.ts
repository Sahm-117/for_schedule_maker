/**
 * Daily nudges that nobody has to remember to send.
 *
 *   1. A cover period starting today  → the covering support
 *   2. A group meeting report still open at the end of its week → the support,
 *      plus one digest to operations
 *   3. Sunday class attendance still unmarked from Monday → the support
 *
 * Call it once a day from a scheduler (cron-job.org):
 *   POST /functions/v1/daily-checks       — send
 *   POST /functions/v1/daily-checks?dry=1 — report what it would send
 *
 * Re-running the same day is safe: a reminder is skipped when the same person
 * already has that reminder from the last 20 hours.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webPush from 'https://esm.sh/web-push@3'
import { sendToSubscriptions } from '../_shared/webpush.ts'
import { insertNotifications } from '../_shared/notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webPush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const MS_PER_DAY = 86_400_000
// The programme runs in Lagos (UTC+1, no daylight saving).
const LAGOS_OFFSET_MS = 60 * 60 * 1000
const lagosNow = () => new Date(Date.now() + LAGOS_OFFSET_MS)
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

interface Planned { userId: string; title: string; body: string; path: string; type: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  try {
    const now = lagosNow()
    const today = dayKey(now)
    const planned: Planned[] = []
    const add = (n: Planned) => { if (!planned.some((p) => p.userId === n.userId && p.title === n.title)) planned.push(n) }

    // ── 1. Cover periods starting today ──────────────────────────────────────
    const { data: covers } = await supabase
      .from('CoverRequest')
      .select('coverSupportId, supportId, startsAt, endsAt, status, support:User!CoverRequest_supportId_fkey(name)')
      .eq('status', 'ASSIGNED')
    for (const cover of (covers ?? []) as any[]) {
      if (!cover.coverSupportId || dayKey(new Date(cover.startsAt)) !== today) continue
      add({
        userId: cover.coverSupportId,
        title: 'Your cover starts today',
        body: `You are covering for ${cover.support?.name || 'another support'} today. Their group is in My Group while the cover lasts.`,
        path: '/support/participants',
        type: 'REMINDER',
      })
    }

    // ── Cohort week maths: week N starts (N-1) weeks after the cohort start ──
    const { data: cohorts } = await supabase.from('Cohort').select('id, name, startDate').eq('status', 'ACTIVE')
    const admins = ((await supabase.from('User').select('id').eq('role', 'ADMIN')).data ?? []).map((a: any) => a.id)
    const outstanding: string[] = []

    for (const cohort of (cohorts ?? []) as any[]) {
      if (!cohort.startDate) continue
      const start = new Date(`${cohort.startDate}T00:00:00Z`)
      const dayInCohort = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY)
      if (dayInCohort < 0) continue
      const weekNumber = Math.floor(dayInCohort / 7) + 1
      const dayOfWeek = dayInCohort % 7 // 0 = the cohort's start weekday

      const { data: weekRow } = await supabase
        .from('Week').select('id, weekNumber').eq('cohortId', cohort.id).eq('weekNumber', weekNumber).maybeSingle()
      if (!weekRow) continue

      const { data: groups } = await supabase
        .from('Group').select('id, name, supportId, members:GroupParticipant(participantId)').eq('cohortId', cohort.id)

      for (const group of (groups ?? []) as any[]) {
        if (!group.supportId) continue
        const participantIds = (group.members ?? []).map((m: any) => m.participantId)

        // 2. Meeting report still open near the end of the week
        if (dayOfWeek >= 5) {
          const { data: status } = await supabase
            .from('GroupPrayerStatus').select('done').eq('groupId', group.id).eq('weekId', weekRow.id).maybeSingle()
          if (!status?.done) {
            outstanding.push(group.name)
            add({
              userId: group.supportId,
              title: `Week ${weekRow.weekNumber} meeting report is still open`,
              body: `${group.name}'s meeting report hasn't been submitted yet. It only takes a minute.`,
              path: '/support/participants',
              type: 'REMINDER',
            })
          }
        }

        // 3. Sunday class attendance unmarked from Monday
        if (dayOfWeek >= 1 && participantIds.length > 0) {
          const { data: marks } = await supabase
            .from('AttendanceRecord').select('participantId').eq('weekId', weekRow.id).in('participantId', participantIds)
          const markedCount = new Set((marks ?? []).map((m: any) => m.participantId)).size
          if (markedCount < participantIds.length) {
            add({
              userId: group.supportId,
              title: 'Sunday attendance not marked',
              body: `${markedCount} of ${participantIds.length} marked for ${group.name} in Week ${weekRow.weekNumber}.`,
              path: '/support/participants?tab=sunday',
              type: 'REMINDER',
            })
          }
        }
      }
    }

    // One digest for operations rather than a message per group.
    if (outstanding.length > 0) {
      for (const adminId of admins) {
        add({
          userId: adminId,
          title: `${outstanding.length} meeting report${outstanding.length === 1 ? '' : 's'} outstanding`,
          body: `Still waiting on: ${outstanding.slice(0, 6).join(', ')}${outstanding.length > 6 ? ` and ${outstanding.length - 6} more` : ''}.`,
          path: '/group-prayers',
          type: 'REMINDER',
        })
      }
    }

    // ── Skip anyone who already got the same reminder today ──────────────────
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('Notification').select('userId, title').eq('type', 'REMINDER').gte('createdAt', since)
    const alreadySent = new Set(((recent ?? []) as any[]).map((r) => `${r.userId}|${r.title}`))
    const toSend = planned.filter((p) => !alreadySent.has(`${p.userId}|${p.title}`))

    if (dryRun) return json({ ok: true, dryRun: true, planned: planned.length, wouldSend: toSend.length, items: toSend })
    if (toSend.length === 0) return json({ ok: true, sent: 0, skipped: planned.length })

    await insertNotifications(supabase, toSend)

    const userIds = Array.from(new Set(toSend.map((n) => n.userId)))
    const { data: subscriptions } = await supabase
      .from('PushSubscription').select('userId, endpoint, p256dh, auth').in('userId', userIds)

    let sent = 0
    for (const item of toSend) {
      const theirs = ((subscriptions ?? []) as any[]).filter((s) => s.userId === item.userId)
      if (theirs.length === 0) continue
      const payload = JSON.stringify({ title: item.title, body: item.body, icon: '/icon-192.png', tag: `fof-reminder-${Date.now()}`, data: { path: item.path } })
      const result = await sendToSubscriptions(webPush, supabase, theirs, payload)
      sent += result.sent
    }

    return json({ ok: true, notified: toSend.length, sent, skipped: planned.length - toSend.length })
  } catch (error) {
    console.error('daily-checks error:', String(error))
    return json({ ok: false, error: String(error) }, 500)
  }
})
