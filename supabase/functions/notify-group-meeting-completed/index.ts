/**
 * Records an in-app notification and sends Web Push to admins after a support
 * marks a weekly group meeting as done.
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

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webPush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const { groupName, weekNumber, supportName } = await req.json() as { groupName: string; weekNumber?: number; supportName: string }
    if (!groupName || !supportName) throw new Error('groupName and supportName are required')

    const { data: admins, error: adminError } = await supabase.from('User').select('id').eq('role', 'ADMIN')
    if (adminError) throw adminError
    const adminIds = Array.from(new Set((admins ?? []).map((admin: { id: string }) => admin.id).filter(Boolean)))
    if (adminIds.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const week = weekNumber ? `Week ${weekNumber}` : 'this week'
    const title = 'Group meeting completed'
    const body = `${supportName} marked ${groupName}'s ${week} meeting as done.`
    await insertNotifications(supabase, adminIds.map((userId) => ({ userId, title, body, path: '/group-prayers', type: 'GROUP_MEETING_COMPLETED' })))

    const { data: subscriptions, error: subscriptionError } = await supabase.from('PushSubscription').select('userId, endpoint, p256dh, auth').in('userId', adminIds)
    if (subscriptionError) throw subscriptionError
    if (!subscriptions?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const payload = JSON.stringify({ title, body, icon: '/icon-192.png', tag: `fof-group-meeting-${Date.now()}`, data: { path: '/group-prayers' } })
    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subscriptions as any[], payload)
    if (failed > 0) console.error(`notify-group-meeting-completed: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('notify-group-meeting-completed error:', String(error))
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
