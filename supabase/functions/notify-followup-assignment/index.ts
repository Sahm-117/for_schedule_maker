/**
 * Notify Follow-up Assignment Edge Function
 *
 * Called by the frontend when an admin assigns follow-up contact(s) to a
 * support user. Sends a targeted Web Push to that user's subscriptions only.
 *
 * POST body:
 * {
 *   ownerId: string (userId of the assigned support),
 *   contactCount: number,
 *   sample?: string[] (up to 3 contact names for the notification body)
 * }
 *
 * Required Supabase secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push ESM build
import webPush from 'https://esm.sh/web-push@3'
import { sendToSubscriptions } from '../_shared/webpush.ts'

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
    const { ownerId, contactCount, sample = [] } = await req.json() as {
      ownerId: string
      contactCount: number
      sample?: string[]
    }

    if (!ownerId || !contactCount) {
      return new Response(JSON.stringify({ ok: false, error: 'ownerId and contactCount are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .eq('userId', ownerId)

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const names = sample.filter(Boolean).join(', ')
    const suffix = contactCount > sample.length ? '…' : ''
    const payload = JSON.stringify({
      title: '🤝 New follow-up assignment',
      body: `You've been assigned ${contactCount} follow-up contact${contactCount === 1 ? '' : 's'}${names ? `: ${names}${suffix}` : ''}`,
      icon: '/icon-192.png',
      tag: `fof-followup-assignment-${Date.now()}`,
    })

    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
    if (failed > 0) console.error(`notify-followup-assignment: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-followup-assignment error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
