/**
 * Scheduled follow-up auto-assignment.
 *
 * Invoked every 10 minutes by the `followup_assignment_every_10min` pg_cron
 * job (supabase/migrations/20260928160000_followup_auto_assignment.sql), the
 * same pg_net + vault pattern as push-reminders' own cron.
 *
 * The assignment rule itself lives in one place, the Postgres function
 * `run_followup_assignment` -- this function only:
 *   1. calls it (contacts unassigned for 2+ hours get an owner),
 *   2. tells each newly-assigned owner, reusing notify-followup-assignment
 *      exactly the way a manual bulk-assign already does (same payload shape),
 *   3. tells admins, at most once every 2 hours, while anyone in the current
 *      cohort is still waiting to be assigned past 2 hours (the same people
 *      the Follow-ups page counts; test contacts and closed ones never count).
 *
 *   4. runs the reassignment sweep (run_followup_reassignment, see
 *      supabase/migrations/20260930330000_followup_auto_reassign.sql): asks supports who have not
 *      moved their people in 24h if they are following up, and hands unmoved people to active
 *      supports when the time is up, telling everyone involved.
 *
 * The admin "Assign now" button runs the same Postgres function directly
 * (via the assign_followups_now RPC) and notifies owners itself from the
 * browser -- see followUpContactsApi.assignPendingNow in
 * frontend/src/services/supabase-api.ts. It does not come through here.
 *
 * Required Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (auto-injected), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push ESM build
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com'

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Same aggregate-per-owner shape notify-followup-assignment already expects
// from a manual bulk assign.
const notifyOwner = async (ownerId: string, contactCount: number, sample: string[]) => {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-followup-assignment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ ownerId, contactCount, sample }),
    })
  } catch (err) {
    console.error('run-followup-assignment: notify-followup-assignment failed', String(err))
  }
}

// One bell notification plus a push, for a single person.
const tellUser = async (userId: string, title: string, body: string, path: string, tag: string) => {
  try {
    await insertNotifications(supabase, [{ userId, title, body, path, type: 'FOLLOWUP_ASSIGNMENT' }])
    const { data: subs } = await supabase.from('PushSubscription').select('userId, endpoint, p256dh, auth').eq('userId', userId)
    if (subs?.length) {
      const payload = JSON.stringify({ title, body, icon: '/icon-192.png', tag: `fof-${tag}-${userId}-${Date.now()}`, data: { path } })
      const { failed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
      if (failed > 0) console.error('run-followup-assignment: push had failures', JSON.stringify(errors))
    }
  } catch (err) {
    console.error('run-followup-assignment: tellUser failed', String(err))
  }
}

const listNames = (names: string[], total: number) => {
  const shown = names.slice(0, 3).map((n) => n.split(' ')[0])
  return shown.join(', ') + (total > shown.length ? ` +${total - shown.length}` : '')
}

// Floor "now" to the start of its 2-hour UTC bucket -- the alert dedupe key.
const twoHourWindowStart = (date: Date): string => {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(d.getUTCHours() - (d.getUTCHours() % 2))
  return d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { data, error } = await supabase.rpc('run_followup_assignment', { p_manual: false })
    if (error) {
      console.error('run-followup-assignment: run_followup_assignment failed', error.message)
      return json({ ok: false, error: error.message }, 500)
    }

    const batches = (data?.batches ?? {}) as Record<string, { count: number; names: string[] }>
    const ownerIds = Object.keys(batches)
    for (const ownerId of ownerIds) {
      await notifyOwner(ownerId, batches[ownerId].count, batches[ownerId].names ?? [])
    }

    // Reassignment sweep: ask quiet supports if they are following up, and hand their unmoved
    // people to active supports once the time is up. Never lets a failure here stop the rest.
    let reassignSummary: Record<string, unknown> = { enabled: false }
    try {
      const { data: re, error: reError } = await supabase.rpc('run_followup_reassignment')
      if (reError) {
        console.error('run-followup-assignment: run_followup_reassignment failed', reError.message)
      } else if (re?.enabled) {
        const followPath = '/support/mobilisation?tab=follow'
        for (const p of (re.prompted ?? []) as Array<{ ownerId: string; count: number; names: string[] }>) {
          await tellUser(
            p.ownerId,
            'Quick check-in on your participants',
            `How is it going with ${listNames(p.names ?? [], p.count)}? Let us know you are on it, or we will hand ${p.count === 1 ? 'them' : 'them'} to someone who can help.`,
            followPath,
            'followup-check',
          )
        }
        const movedTo = (re.movedTo ?? {}) as Record<string, { count: number; names: string[] }>
        for (const ownerId of Object.keys(movedTo)) {
          await notifyOwner(ownerId, movedTo[ownerId].count, movedTo[ownerId].names ?? [])
        }
        const movedFrom = (re.movedFrom ?? {}) as Record<string, { count: number; names: string[] }>
        for (const ownerId of Object.keys(movedFrom)) {
          const m = movedFrom[ownerId]
          await tellUser(
            ownerId,
            'We passed some of your follow-ups on',
            `${listNames(m.names ?? [], m.count)} ${m.count === 1 ? 'has' : 'have'} gone to someone who can help. Thank you for all you do.`,
            followPath,
            'followup-handed-on',
          )
        }
        reassignSummary = { enabled: true, prompted: (re.prompted ?? []).length, moved: re.moved ?? 0, stuckNoReceiver: re.stuckNoReceiver ?? 0 }
      }
    } catch (err) {
      console.error('run-followup-assignment: reassignment sweep failed', String(err))
    }

    // Admin alert: independent of whether the sweep above is switched on --
    // people can be stuck waiting either because assignment is off, or
    // because nobody currently qualifies. One alert per 2-hour window.
    let waitingCount = 0
    let alertSent = false
    const { data: alertsEnabledRow } = await supabase
      .from('AppSetting').select('value').eq('settingKey', 'followup_admin_alerts_enabled').maybeSingle()
    const alertsEnabled = alertsEnabledRow?.value !== false

    if (alertsEnabled) {
      // Same people the Follow-ups page shows as "Waiting to be assigned"
      // (isWaitingForAssignment), in the current cohort only: the running
      // ACTIVE cohort with the latest start, plus contacts with no cohort yet,
      // which the app treats as belonging to it. Test contacts, closed
      // outcomes and wrong numbers are never waiting.
      const { data: currentCohort } = await supabase
        .from('Cohort').select('id').eq('status', 'ACTIVE')
        .order('startDate', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      let waitingQuery = supabase
        .from('FollowUpContact')
        .select('id', { count: 'exact', head: true })
        .is('ownerId', null)
        .is('archivedAt', null)
        .eq('isTest', false)
        .not('registrationStatus', 'in', '(ACCESS_CONFIRMED,ATTENDED,NEXT_COHORT,NOT_INTERESTED,NOT_A_GOOD_TIME,NOT_A_TCN_MEMBER,NO_RESPONSE)')
        .neq('replyStatus', 'INCORRECT_NUMBER')
        .neq('callStatus', 'INCORRECT_NUMBER')
        .lte('createdAt', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      waitingQuery = currentCohort?.id
        ? waitingQuery.or(`cohortId.eq.${currentCohort.id},cohortId.is.null`)
        : waitingQuery.is('cohortId', null)
      const { count } = await waitingQuery
      waitingCount = count ?? 0

      if (waitingCount > 0) {
        const windowStart = twoHourWindowStart(new Date())
        const { error: claimError } = await supabase
          .from('FollowUpAdminAlertLog')
          .insert([{ windowStart, waitingCount }])

        if (!claimError) {
          alertSent = true
          const title = 'Follow-ups waiting to be assigned'
          const body = `${waitingCount} ${waitingCount === 1 ? 'person has' : 'people have'} been waiting more than 2 hours for a follow-up support.`
          const { data: admins } = await supabase.from('User').select('id').eq('role', 'ADMIN').neq('isActive', false)
          const adminIds = (admins ?? []).map((a: { id: string }) => a.id)
          if (adminIds.length > 0) {
            await insertNotifications(supabase, adminIds.map((userId: string) => ({ userId, title, body, path: '/follow-ups', type: 'FOLLOWUP_ASSIGNMENT' })))
            const { data: subs } = await supabase
              .from('PushSubscription').select('userId, endpoint, p256dh, auth').in('userId', adminIds)
            if (subs?.length) {
              const payload = JSON.stringify({ title, body, icon: '/icon-192.png', tag: `fof-followup-waiting-${windowStart}`, data: { path: '/follow-ups' } })
              const { failed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
              if (failed > 0) console.error('run-followup-assignment: admin push had failures', JSON.stringify(errors))
            }
          }
        } else if (claimError.code !== '23505') {
          console.error('run-followup-assignment: could not claim admin alert window', claimError.message)
        }
      }
    }

    return json({
      ok: true,
      enabled: data?.enabled ?? true,
      assigned: data?.assigned ?? 0,
      stuckNoGender: data?.stuckNoGender ?? 0,
      stuckUnknownGender: data?.stuckUnknownGender ?? 0,
      waitingCount,
      alertSent,
      reassign: reassignSummary,
    })
  } catch (err) {
    console.error('run-followup-assignment: failed', String(err))
    return json({ ok: false, error: String(err) }, 500)
  }
})
