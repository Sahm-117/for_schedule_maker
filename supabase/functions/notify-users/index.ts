/**
 * One notification sender for the events that don't need their own function.
 *
 * Recipients can be named directly (userIds), or resolved by role and cohort,
 * so callers don't have to look people up in the browser. Every notification is
 * written to the in-app feed first — more than half the team has no push
 * subscription — and then pushed to whoever does.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webPush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

interface NotifyRequest {
  userIds?: string[]
  role?: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'
  cohortId?: string
  excludeUserId?: string
  title: string
  body: string
  path?: string
  type?: string
}

const resolveRecipients = async (input: NotifyRequest): Promise<string[]> => {
  const ids = new Set<string>()

  if (input.userIds?.length) {
    const { data } = await supabase.from('User').select('id').in('id', input.userIds).neq('isActive', false)
    ;(data ?? []).forEach((row: { id: string }) => ids.add(row.id))
  }

  if (input.role) {
    let query = supabase.from('User').select('id').eq('role', input.role).neq('isActive', false)
    if (input.cohortId) {
      const { data: members } = await supabase.from('UserCohort').select('userId').eq('cohortId', input.cohortId)
      const memberIds = (members ?? []).map((row: { userId: string }) => row.userId)
      // No cohort membership rows means the cohort isn't scoped that way; fall
      // back to everyone in the role rather than silently notifying nobody.
      if (memberIds.length > 0) query = query.in('id', memberIds)
    }
    const { data } = await query
    ;(data ?? []).forEach((row: { id: string }) => ids.add(row.id))
  }

  if (input.excludeUserId) ids.delete(input.excludeUserId)
  return Array.from(ids)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const input = await req.json() as NotifyRequest
    if (!input?.title || !input?.body) return json({ ok: false, error: 'title and body are required' }, 400)
    if (!input.userIds?.length && !input.role) return json({ ok: false, error: 'userIds or role is required' }, 400)

    const recipients = await resolveRecipients(input)
    if (recipients.length === 0) return json({ ok: true, notified: 0, sent: 0 })

    const path = input.path ?? null
    const type = input.type ?? 'GENERAL'
    await insertNotifications(supabase, recipients.map((userId) => ({ userId, title: input.title, body: input.body, path, type })))

    const { data: subscriptions } = await supabase
      .from('PushSubscription')
      .select('userId, endpoint, p256dh, auth')
      .in('userId', recipients)

    if (!subscriptions?.length) return json({ ok: true, notified: recipients.length, sent: 0 })

    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      icon: '/icon-192.png',
      tag: `fof-${type.toLowerCase()}-${Date.now()}`,
      data: { path },
    })
    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subscriptions as any[], payload)
    if (failed > 0) console.error(`notify-users(${type}): ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return json({ ok: true, notified: recipients.length, sent })
  } catch (error) {
    console.error('notify-users error:', String(error))
    return json({ ok: false, error: String(error) }, 500)
  }
})
