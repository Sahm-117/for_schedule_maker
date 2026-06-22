/**
 * Notify Faith Project Review Edge Function
 *
 * Called by the frontend when an admin approves or requests refinement on a
 * faith project. Sends an in-app notification + Web Push to the assigned
 * support user.
 *
 * POST body:
 * {
 *   supportUserId: string,
 *   participantName: string,
 *   action: 'APPROVED' | 'NEEDS_REFINEMENT',
 *   note?: string
 * }
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
    const { supportUserId, participantName, action, note } = await req.json() as {
      supportUserId: string
      participantName: string
      action: 'APPROVED' | 'NEEDS_REFINEMENT'
      note?: string
    }

    if (!supportUserId || !participantName || !action) {
      return new Response(JSON.stringify({ ok: false, error: 'supportUserId, participantName, and action are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const title = action === 'APPROVED'
      ? 'Faith project approved'
      : 'Faith project needs work'
    const body = action === 'APPROVED'
      ? `${participantName}'s faith project has been approved.`
      : `${participantName}: ${note || 'Please refine and resubmit.'}`

    await insertNotifications(supabase, [{
      userId: supportUserId,
      title,
      body,
      path: '/support/participants',
      type: 'FAITH_PROJECT_REVIEW',
    }])

    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .eq('userId', supportUserId)

    if (subsError) throw new Error(subsError.message)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      tag: `fof-faith-review-${Date.now()}`,
      data: { path: '/support/participants' },
    })

    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
    if (failed > 0) console.error(`notify-faith-project-review: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-faith-project-review error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
