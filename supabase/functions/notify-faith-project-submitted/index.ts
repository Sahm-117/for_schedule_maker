/**
 * Notify Faith Project Submitted Edge Function
 *
 * Called by the frontend when a support user submits (or re-submits) a faith
 * project for admin review (status → UNDER_REFINEMENT). Sends in-app
 * notifications + Web Push to all ADMIN-role users.
 *
 * POST body:
 * {
 *   participantName: string,
 *   supportName: string,
 *   groupName?: string
 * }
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
    const { participantName, supportName, groupName } = await req.json() as {
      participantName: string
      supportName: string
      groupName?: string
    }

    if (!participantName || !supportName) {
      return new Response(JSON.stringify({ ok: false, error: 'participantName and supportName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const title = 'Faith project submitted for review'
    const body = groupName
      ? `${supportName} submitted ${participantName}'s faith project (${groupName})`
      : `${supportName} submitted ${participantName}'s faith project`

    // Look up all admin user IDs
    const { data: admins, error: adminsError } = await supabase
      .from('User')
      .select('id')
      .eq('role', 'ADMIN')

    if (adminsError) throw new Error(adminsError.message)
    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminIds = admins.map((a: { id: string }) => a.id)

    await insertNotifications(supabase, adminIds.map((userId: string) => ({
      userId,
      title,
      body,
      path: '/faith-projects',
      type: 'FAITH_PROJECT_SUBMITTED',
    })))

    const { data: subs } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', adminIds)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      tag: `fof-faith-submitted-${Date.now()}`,
      data: { path: '/faith-projects' },
    })

    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
    if (failed > 0) console.error(`notify-faith-project-submitted: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-faith-project-submitted error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
