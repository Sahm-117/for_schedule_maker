/**
 * Notify Follow-up Issue Edge Function
 *
 * Sends a push notification to all admins when a non-admin logs a follow-up
 * issue. Admin-authored issues do not send notifications.
 *
 * POST body:
 * {
 *   issueId: string,
 *   reporterId: string
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

const truncate = (value: string, max = 120) => (
  value.length > max ? `${value.slice(0, max - 1).trim()}…` : value
)

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
    const { issueId, reporterId } = await req.json() as {
      issueId: string
      reporterId: string
    }

    if (!issueId || !reporterId) {
      return new Response(JSON.stringify({ ok: false, error: 'issueId and reporterId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: reporter, error: reporterError } = await supabase
      .from('User')
      .select('id, name, role')
      .eq('id', reporterId)
      .single()

    if (reporterError || !reporter) {
      throw new Error(reporterError?.message || 'Reporter not found')
    }

    if (reporter.role === 'ADMIN') {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'reporter_is_admin' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: issue, error: issueError } = await supabase
      .from('FollowUpIssue')
      .select('issue, contact:FollowUpContact(fullName)')
      .eq('id', issueId)
      .single()

    if (issueError || !issue) {
      throw new Error(issueError?.message || 'Issue not found')
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

    const contactName = issue.contact?.fullName?.trim()
    const body = contactName
      ? `${reporter.name} logged an issue for ${contactName}: ${truncate(issue.issue)}`
      : `${reporter.name} logged a follow-up issue: ${truncate(issue.issue)}`

    const payload = JSON.stringify({
      title: 'New follow-up issue',
      body,
      icon: '/icon-192.png',
      tag: `fof-followup-issue-${issueId}`,
    })

    const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
    if (failed > 0) console.error(`notify-followup-issue: ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-followup-issue error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
