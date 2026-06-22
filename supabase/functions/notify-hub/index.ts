/**
 * Notify Hub Edge Function
 *
 * Called by the frontend for any Hub event that should reach other users:
 *   - @mention in a topic / comment / reply
 *   - new comment on a topic (notifies the topic author)
 *   - new reply to a comment (notifies the comment author)
 *   - a topic being closed / reopened (notifies participants)
 *
 * The audience is resolved on the client (it depends on parsing post text
 * against the user list), so the caller passes already-resolved recipients.
 * This function does both halves server-side with the service role, matching
 * every other notify-* function: in-app feed row (insertNotifications) AND
 * Web Push (sendToSubscriptions).
 *
 * POST body:
 * {
 *   recipients: Array<{ userId: string; path: string }>,  // path is per-recipient (role-aware)
 *   title: string,
 *   body: string
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

interface Recipient { userId: string; path: string }

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
    const { recipients, title, body } = await req.json() as {
      recipients: Recipient[]
      title: string
      body: string
    }

    if (!Array.isArray(recipients) || recipients.length === 0 || !title || !body) {
      return new Response(JSON.stringify({ ok: false, error: 'recipients, title, and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Dedupe by userId, keeping the first path supplied for each.
    const byUser = new Map<string, string>()
    for (const r of recipients) {
      if (r?.userId && !byUser.has(r.userId)) byUser.set(r.userId, r.path || '/hub')
    }
    const userIds = [...byUser.keys()]
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // In-app feed rows (one per recipient, role-aware path).
    await insertNotifications(supabase, userIds.map((userId) => ({
      userId,
      title,
      body,
      path: byUser.get(userId) ?? '/hub',
      type: 'HUB',
    })))

    // Web push to whichever recipients have subscriptions.
    const { data: subs } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', userIds)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Push payload's deep-link must match the recipient's in-app path, so send
    // per-user (the path differs by role). Group subscriptions by user.
    const subsByUser = new Map<string, any[]>()
    for (const s of subs as any[]) {
      const list = subsByUser.get(s.userId) ?? []
      list.push(s)
      subsByUser.set(s.userId, list)
    }

    let totalSent = 0
    let totalFailed = 0
    for (const [userId, userSubs] of subsByUser) {
      const path = byUser.get(userId) ?? '/hub'
      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon-192.png',
        tag: `fof-hub-${Date.now()}`,
        data: { path },
      })
      const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, userSubs, payload)
      totalSent += sent
      totalFailed += failed
      if (failed > 0) console.error(`notify-hub: user ${userId} → ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent, failed: totalFailed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-hub error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
