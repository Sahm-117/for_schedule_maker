/**
 * Daily nudges that nobody has to remember to send.
 *
 *   1. A group meeting report still open at the end of its week → the support,
 *      plus one digest to operations
 *   2. Sunday class attendance still unmarked from Monday → the support
 *   3. Escalations by the programme rules (thresholds in AppSetting 'programme_rules'):
 *      - a participant missed a Sunday class or group meeting → their support
 *      - a participant reaches the "needs attention" misses → support + one admin digest
 *      - a support didn't fully record last week → the support
 *      - a support is behind by the "needs attention" number of weeks → admin digest
 *      - a group isn't fully onboarded: nudge the support near the deadline, then
 *        support + admin digest once it's late
 *      Each escalation is sent once (tracked in EscalationNotice), not every morning.
 *
 * Call it once a day from a scheduler (cron-job.org):
 *   POST /functions/v1/daily-checks       — send
 *   POST /functions/v1/daily-checks?dry=1 — report what it would send
 *   Dry runs can also replay a past day for one cohort (any status):
 *   POST /functions/v1/daily-checks?dry=1&asOf=2026-08-05T09:00:00Z&cohortId=<id>
 *
 * Both need the header  x-cron-key: <CRON_SECRET>  when that secret is set.
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
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

interface Planned { userId: string; title: string; body: string; path: string; type: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const params = new URL(req.url).searchParams
  const dryRun = params.get('dry') === '1'
  // Replaying a past day is only allowed in dry runs, which never send or write.
  const asOf = dryRun && params.get('asOf') ? Date.parse(params.get('asOf')!) : NaN
  const nowMs = Number.isFinite(asOf) ? asOf : Date.now()
  const replayCohortId = dryRun ? params.get('cohortId') : null

  // The scheduler's URL is public, so a shared secret keeps strangers from
  // firing everyone's reminders. Set it with:
  //   supabase secrets set CRON_SECRET=...
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-key') !== cronSecret) {
    return json({ ok: false, error: 'Not authorised' }, 401)
  }

  try {
    const now = new Date(nowMs + LAGOS_OFFSET_MS)
    const today = dayKey(now)
    const planned: Planned[] = []
    const add = (n: Planned) => { if (!planned.some((p) => p.userId === n.userId && p.title === n.title)) planned.push(n) }

    // ── Cohort week maths: week N starts (N-1) weeks after the cohort start ──
    const cohortQuery = supabase.from('Cohort').select('id, name, startDate')
    const { data: cohorts } = replayCohortId ? await cohortQuery.eq('id', replayCohortId) : await cohortQuery.eq('status', 'ACTIVE')
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

        // Sunday attendance is a shared cohort register, not a group duty.
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

    // ── 4. Escalations by the programme rules ────────────────────────────────
    const RULE_DEFAULTS: Record<string, number> = {
      participantRedSundayMisses: 2,
      participantRedMeetingMisses: 2,
      supportRedMissedWeeks: 2,
      onboardingMaxDays: 7,
    }
    const { data: ruleRow } = await supabase.from('AppSetting').select('value').eq('settingKey', 'programme_rules').maybeSingle()
    const rules = { ...RULE_DEFAULTS }
    for (const key of Object.keys(rules)) {
      const n = Number((ruleRow?.value as any)?.[key])
      if (Number.isFinite(n) && n >= 0) rules[key] = n
    }

    const { data: sentRows } = await supabase.from('EscalationNotice').select('key')
    const sentKeys = new Set(((sentRows ?? []) as any[]).map((r) => r.key))
    const newKeys: Array<{ key: string; cohortId: string }> = []
    // Returns true the first time a key is seen, so each alert goes out once.
    const firstTime = (key: string, cohortId: string) => {
      if (sentKeys.has(key)) return false
      sentKeys.add(key)
      newKeys.push({ key, cohortId })
      return true
    }
    const escalation = (userId: string, title: string, body: string, path: string) =>
      add({ userId, title, body, path, type: 'ESCALATION' })
    const firstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || 'them'

    const digestParticipants: string[] = []
    const digestSupports: string[] = []
    const digestOnboarding: string[] = []
    const recentCutoff = nowMs - 8 * MS_PER_DAY

    for (const cohort of (cohorts ?? []) as any[]) {
      if (!cohort.startDate) continue
      const start = new Date(`${cohort.startDate}T00:00:00Z`)
      const dayInCohort = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY)
      const currentWeek = dayInCohort < 0 ? 0 : Math.floor(dayInCohort / 7) + 1

      // Day 5 of the cohort: My Hub takes Mobilisation's spot on the bottom
      // bar for every support in a hub. Sent once per person (EscalationNotice
      // key), so someone added to a hub later still gets it.
      if (dayInCohort >= 5) {
        const { data: hubMembers } = await supabase.from('HubMembership').select('userId').eq('cohortId', cohort.id)
        for (const member of (hubMembers ?? []) as any[]) {
          if (!firstTime(`hub-nav-swap:${cohort.id}:${member.userId}`, cohort.id)) continue
          escalation(
            member.userId,
            'Mobilisation has moved to More',
            'My Hub is now on your menu bar so you can reach your hub faster.',
            '/support/my-hub',
          )
        }
      }

      const [{ data: weeks }, { data: groups }, { data: people }] = await Promise.all([
        supabase.from('Week').select('id, weekNumber').eq('cohortId', cohort.id),
        supabase.from('Group').select('id, name, supportId, support:User!Group_supportId_fkey(name), members:GroupParticipant(participantId)').eq('cohortId', cohort.id),
        supabase.from('Participant').select('id, fullName, status').eq('cohortId', cohort.id).eq('status', 'ACTIVE'),
      ])
      const weekById = new Map(((weeks ?? []) as any[]).map((w) => [w.id, w.weekNumber]))
      const weekIds = [...weekById.keys()]
      const personById = new Map(((people ?? []) as any[]).map((p) => [p.id, p]))
      const groupOf = new Map<string, any>()
      for (const g of (groups ?? []) as any[]) for (const m of g.members ?? []) groupOf.set(m.participantId, g)

      const [{ data: sunday }, { data: meeting }, { data: reports }, { data: onboardingRows }, { data: assigned }, { data: participantOnboarding }] = await Promise.all([
        weekIds.length ? supabase.from('AttendanceRecord').select('participantId, weekId, status, markedAt').in('weekId', weekIds) : Promise.resolve({ data: [] }),
        weekIds.length ? supabase.from('MeetingAttendance').select('participantId, weekId, status, markedAt').in('weekId', weekIds) : Promise.resolve({ data: [] }),
        weekIds.length ? supabase.from('GroupPrayerStatus').select('groupId, weekId, done').in('weekId', weekIds).eq('done', true) : Promise.resolve({ data: [] }),
        supabase.from('GroupOnboardingStatus').select('groupId, completedAt').in('groupId', ((groups ?? []) as any[]).map((g) => g.id)),
        supabase.from('OnboardingEvent').select('groupId, createdAt').eq('type', 'GROUP_ASSIGNED').in('groupId', ((groups ?? []) as any[]).map((g) => g.id)),
        supabase.from('ParticipantOnboardingStatus').select('participantId, contacted, addedToGroup, introductionDone, venueAcknowledged').in('participantId', [...personById.keys()]),
      ])

      // Participants: each new miss → their support; enough misses → needs attention.
      const sundayMisses = new Map<string, number>()
      const meetingMisses = new Map<string, number>()
      const missAlert = (record: any, kind: 'sunday' | 'meeting') => {
        const person = personById.get(record.participantId)
        const group = groupOf.get(record.participantId)
        if (!person || !group?.supportId) return
        const counts = kind === 'sunday' ? sundayMisses : meetingMisses
        counts.set(person.id, (counts.get(person.id) ?? 0) + 1)
        // Only fresh marks alert, so older history doesn't flood anyone.
        if (!record.markedAt || new Date(record.markedAt).getTime() < recentCutoff) return
        if (!firstTime(`${kind}-miss:${person.id}:${record.weekId}`, cohort.id)) return
        const what = kind === 'sunday' ? 'Sunday class' : 'the group meeting'
        escalation(
          group.supportId,
          `${person.fullName} missed ${what}`,
          `Week ${weekById.get(record.weekId)}. A quick call or message to ${firstName(person.fullName)} helps them stay on track.`,
          '/support/participants',
        )
      }
      for (const r of (sunday ?? []) as any[]) if (r.status === 'ABSENT') missAlert(r, 'sunday')
      for (const r of (meeting ?? []) as any[]) if (r.status === 'MISSED') missAlert(r, 'meeting')

      for (const person of personById.values()) {
        const a = sundayMisses.get(person.id) ?? 0
        const b = meetingMisses.get(person.id) ?? 0
        const group = groupOf.get(person.id)
        if (a < rules.participantRedSundayMisses || b < rules.participantRedMeetingMisses || !group?.supportId) continue
        if (!firstTime(`participant-red:${person.id}`, cohort.id)) continue
        escalation(
          group.supportId,
          `${person.fullName} needs attention`,
          `They've missed ${a} Sunday classes and ${b} group meetings. Please check in, and flag a concern if you need help.`,
          '/support/participants',
        )
        digestParticipants.push(person.fullName)
      }

      // Supports: last week fully recorded? Behind by enough weeks → admins.
      const sundayKeys = new Set(((sunday ?? []) as any[]).map((r) => `${r.participantId}:${r.weekId}`))
      const meetingKeys = new Set(((meeting ?? []) as any[]).map((r) => `${r.participantId}:${r.weekId}`))
      const reportKeys = new Set(((reports ?? []) as any[]).map((r) => `${r.groupId}:${r.weekId}`))
      const judgedWeeks = ((weeks ?? []) as any[]).filter((w) => w.weekNumber < currentWeek).sort((x, y) => x.weekNumber - y.weekNumber)
      const onboardedIds = new Set(((participantOnboarding ?? []) as any[])
        .filter((o) => o.contacted && o.addedToGroup && o.introductionDone && o.venueAcknowledged).map((o) => o.participantId))
      const completedAt = new Map(((onboardingRows ?? []) as any[]).map((o) => [o.groupId, o.completedAt]))

      for (const group of (groups ?? []) as any[]) {
        const members = (group.members ?? []).map((m: any) => m.participantId).filter((id: string) => personById.has(id))
        if (!group.supportId || members.length === 0) continue
        const supportName = group.support?.name || 'A support'

        const missed = judgedWeeks.map((w) => {
          const parts = [
            reportKeys.has(`${group.id}:${w.id}`) ? null : 'meeting report',
            members.every((m: string) => meetingKeys.has(`${m}:${w.id}`)) ? null : 'meeting attendance',
          ].filter(Boolean) as string[]
          return { week: w, parts }
        }).filter((entry) => entry.parts.length > 0)

        const lastWeek = judgedWeeks[judgedWeeks.length - 1]
        const lastMissed = lastWeek && missed.find((entry) => entry.week.id === lastWeek.id)
        if (lastMissed && firstTime(`support-week:${group.id}:${lastWeek.id}`, cohort.id)) {
          escalation(
            group.supportId,
            `Week ${lastWeek.weekNumber} isn't fully recorded`,
            `${group.name} is missing: ${lastMissed.parts.join(', ')}. Your participants are only counted once it's recorded.`,
            '/support/participants',
          )
        }
        if (missed.length >= rules.supportRedMissedWeeks && firstTime(`support-red:${group.id}`, cohort.id)) {
          digestSupports.push(`${supportName} (${group.name})`)
        }

        // Onboarding: finished when every member is onboarded and the group is marked complete.
        const assignedTimes = ((assigned ?? []) as any[]).filter((e) => e.groupId === group.id).map((e) => new Date(e.createdAt).getTime())
        if (assignedTimes.length === 0) continue
        const assignedAt = Math.max(...assignedTimes)
        const done = !!completedAt.get(group.id) && members.every((m: string) => onboardedIds.has(m))
        if (done) continue
        const days = Math.floor((nowMs - assignedAt) / MS_PER_DAY)
        const onboardedCount = members.filter((m: string) => onboardedIds.has(m)).length
        if (days >= Math.max(1, rules.onboardingMaxDays - 2) && days <= rules.onboardingMaxDays && firstTime(`onboarding-nudge:${group.id}:${assignedAt}`, cohort.id)) {
          escalation(
            group.supportId,
            `${group.name}: onboarding due soon`,
            `${onboardedCount} of ${members.length} participants onboarded. Onboarding should be finished within ${rules.onboardingMaxDays} days of getting the group.`,
            '/support/onboarding',
          )
        }
        if (days > rules.onboardingMaxDays && firstTime(`onboarding-late:${group.id}:${assignedAt}`, cohort.id)) {
          escalation(
            group.supportId,
            `${group.name} isn't fully onboarded`,
            `It's been ${days} days (${rules.onboardingMaxDays} allowed) and ${onboardedCount} of ${members.length} participants are onboarded.`,
            '/support/onboarding',
          )
          digestOnboarding.push(`${group.name} (${supportName})`)
        }
      }
    }

    const listOf = (names: string[]) => `${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}`
    for (const adminId of admins) {
      if (digestParticipants.length > 0) {
        escalation(adminId, `${digestParticipants.length} participant${digestParticipants.length === 1 ? ' needs' : 's need'} attention`,
          `Missed ${rules.participantRedSundayMisses}+ Sunday classes and ${rules.participantRedMeetingMisses}+ group meetings: ${listOf(digestParticipants)}.`,
          '/participants?health=critical')
      }
      if (digestSupports.length > 0) {
        escalation(adminId, `${digestSupports.length} support${digestSupports.length === 1 ? ' needs' : 's need'} attention`,
          `Not fully recorded for ${rules.supportRedMissedWeeks}+ weeks: ${listOf(digestSupports)}.`,
          '/supports?health=critical')
      }
      if (digestOnboarding.length > 0) {
        escalation(adminId, `${digestOnboarding.length} group${digestOnboarding.length === 1 ? ' isn’t' : 's aren’t'} fully onboarded`,
          `Past the ${rules.onboardingMaxDays}-day onboarding window: ${listOf(digestOnboarding)}.`,
          '/supports')
      }
    }

    // ── "I need help" from the participant app, not followed up in 48 hours ──
    const helpCutoff = new Date(nowMs - 2 * MS_PER_DAY).toISOString()
    const { data: staleHelp } = await supabase.from('ParticipantCheckIn')
      .select('id, createdAt, participant:Participant!ParticipantCheckIn_participantId_fkey(fullName, cohortId)')
      .eq('response', 'NEED_HELP').is('handledAt', null).lte('createdAt', helpCutoff)
    const helpNames: string[] = []
    for (const row of (staleHelp ?? []) as any[]) {
      if (!row.participant?.cohortId) continue
      if (!firstTime(`help-stale:${row.id}`, row.participant.cohortId)) continue
      helpNames.push(row.participant.fullName)
    }
    if (helpNames.length > 0) {
      for (const adminId of admins) {
        escalation(adminId, `${helpNames.length} participant${helpNames.length === 1 ? '' : 's'} asked for help 2+ days ago`,
          `No support has followed up yet: ${listOf(helpNames)}.`,
          '/participants')
      }
    }

    // ── Prospects that never reached the Google Sheet ────────────────────────
    // The nightly retry is switched off along with the push itself: it selects
    // every prospect with no sheetSyncedAt, so leaving it on would carry new ones
    // to the sheet within a day regardless. sync-lead-to-sheet still exists and
    // still works if called directly.
    const leadsRetried = 0

    // ── Sign-up sheet sync health: tell operations once a day if it's broken ─
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: failing } = await supabase.from('FollowUpContact')
      .select('fullName, sheetSyncError, createdAt')
      .not('sheetSyncError', 'is', null).is('sheetSyncedAt', null).gte('createdAt', weekAgo)
      .order('createdAt', { ascending: false })
    const { data: warned } = await supabase.from('FollowUpContact')
      .select('fullName, sheetSyncWarning, createdAt')
      .not('sheetSyncWarning', 'is', null).gte('createdAt', weekAgo)
      .order('createdAt', { ascending: false })
    const failCount = (failing ?? []).length
    const warnCount = (warned ?? []).length
    if (failCount > 0 || warnCount > 0) {
      const reason = failCount > 0 ? (failing as any[])[0].sheetSyncError : (warned as any[])[0].sheetSyncWarning
      const summary = failCount > 0
        ? `${failCount} prospect${failCount === 1 ? '' : 's'} didn't reach the Google sheet`
        : `${warnCount} prospect${warnCount === 1 ? '' : 's'} reached the sheet with missing columns`
      for (const adminId of admins) {
        add({
          userId: adminId,
          title: 'Sign-up sheet sync needs attention',
          body: `${summary}. ${String(reason).slice(0, 140)}`,
          path: '/follow-ups',
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

    if (dryRun) return json({ ok: true, dryRun: true, planned: planned.length, wouldSend: toSend.length, escalations: newKeys.length, leadsRetried, items: toSend })

    // Remember escalations so each is sent once.
    if (newKeys.length > 0) {
      const { error: keyError } = await supabase.from('EscalationNotice').upsert(newKeys, { onConflict: 'key', ignoreDuplicates: true })
      if (keyError) console.error('daily-checks: could not record escalations', keyError.message)
    }
    if (toSend.length === 0) return json({ ok: true, sent: 0, skipped: planned.length, escalations: newKeys.length, leadsRetried })

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

    return json({ ok: true, notified: toSend.length, sent, skipped: planned.length - toSend.length, escalations: newKeys.length, leadsRetried })
  } catch (error) {
    console.error('daily-checks error:', String(error))
    return json({ ok: false, error: String(error) }, 500)
  }
})
