/**
 * Notify Follow-up Terminal Status Edge Function
 *
 * Sends a push notification to all admins when a non-admin user newly marks
 * a follow-up prospect with an end-of-the-road status.
 *
 * LOGIN_ISSUE ("Issue with login") is the one exception: it doesn't end the
 * follow-up, it asks for help. It is sent whoever reports it (admins too), to
 * every active admin plus the IT Support of the contact's owner support's hub
 * (followup_contact_it_support_ids), never back to the person who reported
 * it. The body carries the support's description (FollowUpLoginIssue), and IT
 * Support are pointed at /support/mobilisation?tab=it.
 *
 * POST body:
 * {
 *   contactId: string,
 *   actorId: string,
 *   terminalState: 'CLOSE' | 'ACCESS_CONFIRMED' | 'LOGIN_ISSUE' | 'NOT_INTERESTED'
 *                 | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'INCORRECT_NUMBER' | 'NO_RESPONSE'
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push ESM build
import webPush from 'https://esm.sh/web-push@3'
import { sendToSubscriptions } from '../_shared/webpush.ts'
import { insertNotifications } from '../_shared/notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com'

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Every state the app can send. A missing entry used to fall through to the
// word "closed", so three different outcomes all read as "Closed" to admins.
const TERMINAL_LABELS: Record<string, string> = {
  CLOSE: 'Closed',
  ACCESS_CONFIRMED: 'Confirmed access',
  LOGIN_ISSUE: 'Issue with login',
  // No longer sent (Login shared stopped closing a follow-up); kept so an app
  // version still cached on someone's phone doesn't read as "Updated".
  LOGIN_SHARED: 'Login shared',
  NOT_INTERESTED: 'Not interested',
  NOT_A_TCN_MEMBER: 'Not a TCN member',
  NOT_A_GOOD_TIME: 'Not a good time',
  INCORRECT_NUMBER: 'Wrong number',
  NO_RESPONSE: 'No response',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { contactId, actorId, terminalState } = await req.json() as {
      contactId: string
      actorId: string
      terminalState: 'CLOSE' | 'ACCESS_CONFIRMED' | 'LOGIN_ISSUE' | 'LOGIN_SHARED' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'INCORRECT_NUMBER' | 'NO_RESPONSE'
    }
    const loginIssue = terminalState === 'LOGIN_ISSUE'

    if (!contactId || !actorId || !terminalState) {
      return new Response(JSON.stringify({ ok: false, error: 'contactId, actorId, and terminalState are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: actor, error: actorError } = await supabase
      .from('User')
      .select('id, name, role')
      .eq('id', actorId)
      .single()

    if (actorError || !actor) {
      throw new Error(actorError?.message || 'Actor not found')
    }

    if (actor.role === 'ADMIN' && !loginIssue) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'actor_is_admin' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: contact, error: contactError } = await supabase
      .from('FollowUpContact')
      .select('fullName, cohortId')
      .eq('id', contactId)
      .single()

    if (contactError || !contact) {
      throw new Error(contactError?.message || 'Contact not found')
    }

    let adminQuery = supabase
      .from('User')
      .select('id')
      .eq('role', 'ADMIN')
    if (loginIssue) adminQuery = adminQuery.neq('isActive', false)
    const { data: admins, error: adminsError } = await adminQuery

    if (adminsError) {
      throw new Error(adminsError.message)
    }

    const adminRecipientIds: string[] = (admins || []).map((admin: { id: string }) => admin.id)
    let itRecipientIds: string[] = []
    let description = ''

    if (loginIssue) {
      // IT Support is a hub job, stored as HubItSupport rows. Only the IT
      // Support of the owner support's hub (in the contact's cohort) hear about
      // it; if the owner has no hub, every IT Support of that cohort. The rule
      // lives in followup_contact_it_support_ids
      // (20260928190000_followup_login_issues.sql) so the IT issues tab and
      // these alerts always agree.
      const { data: itIds, error: itError } = await supabase
        .rpc('followup_contact_it_support_ids', { p_contact_id: contactId, p_cohort_id: null })
      if (itError) {
        throw new Error(itError.message)
      }
      const adminSet = new Set(adminRecipientIds)
      itRecipientIds = ((itIds as string[] | null) || []).filter((id) => id && id !== actorId && !adminSet.has(id))

      // What the support wrote in "What's the problem?".
      const { data: openIssue } = await supabase
        .from('FollowUpLoginIssue')
        .select('description')
        .eq('contactId', contactId)
        .eq('status', 'OPEN')
        .order('updatedAt', { ascending: false })
        .limit(1)
        .maybeSingle()
      description = (openIssue?.description || '').trim()
    }

    // Admins, plus IT Support for a login problem. Never back to the reporter
    // for a login problem.
    const adminIds = Array.from(new Set(
      (loginIssue ? adminRecipientIds.filter((id) => id !== actorId) : adminRecipientIds).filter(Boolean),
    ))
    const itIds = Array.from(new Set(itRecipientIds))
    const allIds = adminIds.concat(itIds)
    if (allIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Who it is about leads; the one-word outcome is what an admin scans for.
    const title = `${contact.fullName}: ${TERMINAL_LABELS[terminalState] || 'Updated'}`
    const body = loginIssue
      ? description
        ? `${actor.name} reported a login problem for ${contact.fullName}: "${description}"`
        : `${actor.name} reported a login problem for ${contact.fullName}. They may need a new login code.`
      : `Follow up update from ${actor.name}`
    const IT_PATH = '/support/mobilisation?tab=it'

    // In-app feed for every recipient, regardless of push subscription. Admins
    // open Follow-ups; IT Support open their IT issues tab.
    await insertNotifications(
      supabase,
      adminIds.map((userId) => ({ userId, title, body, path: '/follow-ups', type: 'FOLLOWUP_TERMINAL' }))
        .concat(itIds.map((userId) => ({ userId, title, body, path: IT_PATH, type: 'FOLLOWUP_TERMINAL' }))),
    )

    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', allIds)

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tag = `fof-followup-terminal-${contactId}-${terminalState}`

    if (itIds.length > 0) {
      const itSet = new Set(itIds)
      const itSubs = (subs as any[]).filter((sub) => itSet.has(sub.userId))
      const adminSubs = (subs as any[]).filter((sub) => !itSet.has(sub.userId))
      let sentTotal = 0
      for (const [group, path] of [[adminSubs, '/follow-ups'], [itSubs, IT_PATH]] as const) {
        if (group.length === 0) continue
        const groupPayload = JSON.stringify({ title, body, icon: '/icon-192.png', tag, data: { path } })
        const result = await sendToSubscriptions(webPush, supabase, group, groupPayload)
        sentTotal += result.sent
        if (result.failed > 0) console.error(`notify-followup-terminal-status: ${result.sent} sent, ${result.failed} failed, ${result.removed} removed`, JSON.stringify(result.errors))
      }
      return new Response(JSON.stringify({ ok: true, sent: sentTotal }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      tag,
    })

    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
    if (failed > 0) console.error(`notify-followup-terminal-status: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-followup-terminal-status error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
