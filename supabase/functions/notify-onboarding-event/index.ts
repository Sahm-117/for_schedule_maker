/**
 * Notify onboarding events.
 *
 * POST body:
 * {
 *   eventId: string
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - web-push ESM build
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

type EventRow = {
  id: string
  type: string
  actorId: string | null
  payload: Record<string, unknown>
  group: {
    id: string
    name: string
    supportId: string | null
    support?: { id: string; name: string | null } | null
  } | null
  actor?: { id: string; name: string | null; role: string | null } | null
}

const buildNotification = (event: EventRow): {
  userIds: string[]
  title: string
  body: string
  path: string
  tag: string
} | null => {
  const actorName = event.actor?.name?.trim() || 'A support'
  const groupName = event.group?.name?.trim() || 'a group'
  const payload = event.payload || {}

  switch (event.type) {
    case 'GROUP_ASSIGNED': {
      if (!event.group?.supportId) return null
      return {
        userIds: [event.group.supportId],
        title: 'New group assigned',
        body: `${groupName} has been assigned to you.`,
        path: '/support/participants',
        tag: `fof-onboarding-group-assigned-${event.group.id}`,
      }
    }
    case 'PARTICIPANTS_ASSIGNED': {
      if (!event.group?.supportId) return null
      const count = Number(payload.participantCount || 0)
      return {
        userIds: [event.group.supportId],
        title: 'Participants added',
        body: count > 0
          ? `${count} participant${count === 1 ? '' : 's'} were added to ${groupName}.`
          : `Participants were added to ${groupName}.`,
        path: '/support/onboarding',
        tag: `fof-onboarding-participants-${event.group.id}-${event.id}`,
      }
    }
    case 'GROUP_CREATED_UPDATED':
    case 'PARTICIPANT_STATUS_UPDATED':
    case 'GROUP_COMPLETED':
      return null
    default:
      return null
  }
}

const getAdminIds = async (): Promise<string[]> => {
  const { data, error } = await supabase.from('User').select('id').eq('role', 'ADMIN')
  if (error) throw new Error(error.message)
  return Array.from(new Set((data || []).map((row: { id: string }) => row.id).filter(Boolean)))
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
    const { eventId } = await req.json() as { eventId?: string }
    if (!eventId) {
      return new Response(JSON.stringify({ ok: false, error: 'eventId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await supabase
      .from('OnboardingEvent')
      .select(`
        id,
        type,
        actorId,
        payload,
        actor:User!OnboardingEvent_actorId_fkey(id, name, role),
        group:Group!OnboardingEvent_groupId_fkey(
          id,
          name,
          supportId,
          support:User!Group_supportId_fkey(id, name)
        )
      `)
      .eq('id', eventId)
      .single()

    if (error || !data) {
      throw new Error(error?.message || 'Onboarding event not found')
    }

    const event = data as unknown as EventRow
    let notification = buildNotification(event)

    if ((event.type === 'GROUP_CREATED_UPDATED' || event.type === 'PARTICIPANT_STATUS_UPDATED' || event.type === 'GROUP_COMPLETED') && event.actor?.role !== 'ADMIN') {
      const adminIds = await getAdminIds()
      const title = event.type === 'GROUP_COMPLETED'
        ? 'Group fully onboarded'
        : event.type === 'GROUP_CREATED_UPDATED'
          ? 'Group created updated'
          : 'Participant onboarding updated'
      const body = event.type === 'GROUP_COMPLETED'
        ? `${event.actor?.name || 'A support'} completed onboarding for ${event.group?.name || 'a group'}.`
        : event.type === 'GROUP_CREATED_UPDATED'
          ? `${event.actor?.name || 'A support'} updated group setup for ${event.group?.name || 'a group'}.`
          : `${event.actor?.name || 'A support'} updated participant onboarding for ${event.group?.name || 'a group'}.`
      notification = {
        userIds: adminIds,
        title,
        body,
        path: '/onboarding',
        tag: `fof-onboarding-admin-${event.type.toLowerCase()}-${event.id}`,
      }
    }

    if (!notification || notification.userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'no_recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: subs, error: subsError } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', notification.userIds)

    if (subsError) throw new Error(subsError.message)
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: '/icon-192.png',
      tag: notification.tag,
      data: { path: notification.path },
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
    console.error('notify-onboarding-event error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
