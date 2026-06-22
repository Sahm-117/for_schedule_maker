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
 *   cohortId?: string | null,
 *   targetLabelId?: string | null
 * }
 *
 * Required Supabase secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
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
    const { subject, body, sentBy, scope = 'ACTIVE_COHORT', cohortId = null, targetLabelId = null } = await req.json() as {
      subject: string
      body: string
      sentBy?: string
      scope?: 'ACTIVE_COHORT' | 'ALL_USERS'
      cohortId?: string | null
      targetLabelId?: string | null
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
      .insert([{ subject, body, sentBy: sentBy || null, scope, cohortId, targetLabelId }])
      .select('id')
      .single()

    if (insertError || !announcement) {
      throw new Error(insertError?.message || 'Failed to insert announcement')
    }

    // 2. Resolve final recipients from scope, optional tag, and active users.
    let scopedUserIds: string[] = []

    if (scope === 'ACTIVE_COHORT' && cohortId) {
      const { data: memberships, error: membershipError } = await supabase
        .from('UserCohort')
        .select('userId')
        .eq('cohortId', cohortId)

      if (membershipError) {
        throw new Error(membershipError.message)
      }

      scopedUserIds = Array.from(new Set((memberships || []).map((row: any) => row.userId).filter(Boolean)))
    } else {
      const { data: users, error: usersError } = await supabase
        .from('User')
        .select('id')
        .eq('isActive', true)

      if (usersError) {
        throw new Error(usersError.message)
      }

      scopedUserIds = Array.from(new Set((users || []).map((row: any) => row.id).filter(Boolean)))
    }

    if (targetLabelId) {
      const { data: labelUsers, error: labelError } = await supabase
        .from('UserLabel')
        .select('userId')
        .eq('labelId', targetLabelId)

      if (labelError) {
        throw new Error(labelError.message)
      }

      const labelUserIds = new Set((labelUsers || []).map((row: any) => row.userId).filter(Boolean))
      scopedUserIds = scopedUserIds.filter((userId) => labelUserIds.has(userId))
    }

    if (scopedUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, announcementId: announcement.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: activeUsers, error: activeUsersError } = await supabase
      .from('User')
      .select('id')
      .in('id', scopedUserIds)
      .eq('isActive', true)

    if (activeUsersError) {
      throw new Error(activeUsersError.message)
    }

    const recipientIds = Array.from(new Set((activeUsers || []).map((row: any) => row.id).filter(Boolean)))
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, announcementId: announcement.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Record an in-app notification for EVERY targeted recipient — even
    //    those without a push subscription — so users who miss the push still
    //    see it in-app. (icon/tag are push-only; path opens the resources view.)
    await insertNotifications(
      supabase,
      recipientIds.map((userId) => ({
        userId,
        title: `📢 From FOF Ops`,
        body: `${subject}: ${body}`,
        path: '/resources',
        type: 'ANNOUNCEMENT',
      })),
    )

    // 4. Fetch push subscriptions for final recipients.
    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', recipientIds)

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, announcementId: announcement.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Build payload
    const payload = JSON.stringify({
      title: `📢 From FOF Ops`,
      body: `${subject}: ${body}`,
      icon: '/icon-192.png',
      tag: `fof-announcement-${announcement.id}`,
      cohortId,
      scope,
      targetLabelId,
    })

    // 6. Send to each subscription (reliable delivery: retries transient
    //    failures, deletes dead subscriptions, never aborts on one bad endpoint).
    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)

    if (failed > 0) {
      console.error(`send-announcement: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, removed, errors, announcementId: announcement.id }), {
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
