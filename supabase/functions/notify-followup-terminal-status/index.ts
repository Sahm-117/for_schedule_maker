/**
 * Notify Follow-up Terminal Status Edge Function
 *
 * Sends a push notification to all admins when a non-admin user newly marks
 * a follow-up contact as closed, not interested, or not a TCN member.
 *
 * POST body:
 * {
 *   contactId: string,
 *   actorId: string,
 *   terminalState: 'CLOSE' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER'
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — web-push ESM build
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

const TERMINAL_LABELS: Record<string, string> = {
  CLOSE: 'Closed',
  NOT_INTERESTED: 'Not Interested',
  NOT_A_TCN_MEMBER: 'Not a TCN Member',
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
      terminalState: 'CLOSE' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER'
    }

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

    if (actor.role === 'ADMIN') {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'actor_is_admin' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: contact, error: contactError } = await supabase
      .from('FollowUpContact')
      .select('fullName')
      .eq('id', contactId)
      .single()

    if (contactError || !contact) {
      throw new Error(contactError?.message || 'Contact not found')
    }

    const { data: admins, error: adminsError } = await supabase
      .from('User')
      .select('id')
      .eq('role', 'ADMIN')

    if (adminsError) {
      throw new Error(adminsError.message)
    }

    const adminIds = Array.from(new Set((admins || []).map((admin: { id: string }) => admin.id).filter(Boolean)))
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', adminIds)

    if (subsError) {
      throw new Error(subsError.message)
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title: 'Follow-up updated',
      body: `${actor.name} marked ${contact.fullName} as ${TERMINAL_LABELS[terminalState] || 'closed'}.`,
      icon: '/icon-192.png',
      tag: `fof-followup-terminal-${contactId}-${terminalState}`,
    })

    let sent = 0
    for (const sub of subs as Array<{ userId: string; endpoint: string; p256dh: string; auth: string }>) {
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
    console.error('notify-followup-terminal-status error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
