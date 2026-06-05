/**
 * Send Announcement Edge Function
 *
 * Called by the admin frontend to broadcast a push notification to all
 * subscribed users and record the announcement in the Announcement table.
 *
 * POST body:
 * {
 *   subject: string,
 *   body: string,
 *   sentBy: string (userId),
 *   scope?: 'ACTIVE_COHORT' | 'ALL_USERS',
 *   cohortId?: string | null
 * }
 *
 * Required Supabase secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webPush from 'https://esm.sh/web-push@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { subject, body, sentBy, scope = 'ACTIVE_COHORT', cohortId = null } = await req.json() as {
      subject: string
      body: string
      sentBy?: string
      scope?: 'ACTIVE_COHORT' | 'ALL_USERS'
      cohortId?: string | null
    }

    if (!subject || !body) {
      return new Response(JSON.stringify({ ok: false, error: 'subject and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (scope === 'ACTIVE_COHORT' && !cohortId) {
      return new Response(JSON.stringify({ ok: false, error: 'cohortId is required for ACTIVE_COHORT announcements' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Record the announcement
    const { data: announcement, error: insertError } = await supabase
      .from('Announcement')
      .insert([{ subject, body, sentBy: sentBy || null, scope, cohortId }])
      .select('id')
      .single()

    if (insertError || !announcement) {
      throw new Error(insertError?.message || 'Failed to insert announcement')
    }

    // 2. Fetch all push subscriptions
    let subscriptionQuery = supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')

    if (scope === 'ACTIVE_COHORT' && cohortId) {
      const { data: memberships, error: membershipError } = await supabase
        .from('UserCohort')
        .select('userId')
        .eq('cohortId', cohortId)

      if (membershipError) {
        throw new Error(membershipError.message)
      }

      const cohortUserIds = Array.from(new Set((memberships || []).map((row: any) => row.userId).filter(Boolean)))
      if (cohortUserIds.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      subscriptionQuery = subscriptionQuery.in('userId', cohortUserIds)
    }

    const { data: subs, error: subsError } = await subscriptionQuery

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Build payload
    const payload = JSON.stringify({
      title: `📢 From FOF Ops`,
      body: `${subject}: ${body}`,
      icon: '/icon-192.png',
      tag: `fof-announcement-${announcement.id}`,
      cohortId,
      scope,
    })

    // 4. Send to each subscription
    let sent = 0
    for (const sub of subs as any[]) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        await webPush.sendNotification(pushSub, payload)
        sent++
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

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-announcement error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
