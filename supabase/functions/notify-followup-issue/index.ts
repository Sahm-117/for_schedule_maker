/**
 * Notify Follow-up Issue Edge Function
 *
 * Sends a push notification to all admins when a non-admin logs a follow-up
 * issue. Admin-authored issues do not send notifications.
 *
 * A reply is different: when an admin (or IT support) replies to an issue, only
 * the support who logged it hears about it. Admins are never notified again for a
 * reply. A reply is recognised by kind = 'REPLY', or, for older app versions that
 * do not send it, by the "---\nReply:" the app appends to the issue text.
 *
 * POST body:
 * {
 *   issueId: string,
 *   reporterId: string,
 *   replierId?: string,
 *   kind?: 'REPLY'
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
import { insertNotifications } from '../_shared/notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
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
    const { issueId, reporterId, replierId, kind } = await req.json() as {
      issueId: string
      reporterId: string
      replierId?: string
      kind?: string
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
      .select('issue, contact:FollowUpContact!FollowUpIssue_contactId_fkey(fullName)')
      .eq('id', issueId)
      .single()

    if (issueError || !issue) {
      throw new Error(issueError?.message || 'Issue not found')
    }

    // A reply: tell the support who logged the issue, and nobody else.
    if (kind === 'REPLY' || /\n---\nReply:/.test(issue.issue)) {
      if (replierId && replierId === reporterId) {
        return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'replier_is_reporter' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      let replierName = 'Someone'
      if (replierId) {
        const { data: replier } = await supabase.from('User').select('name').eq('id', replierId).maybeSingle()
        if (replier?.name) replierName = replier.name
      }
      const lastReply = issue.issue.split(/\n---\nReply:/).pop()?.trim() ?? ''
      const contactForReply = issue.contact?.fullName?.trim()
      const replyTitle = 'Reply to your issue'
      const replyBody = `${replierName} replied${contactForReply ? ` about ${contactForReply}` : ''}: ${truncate(lastReply)}`
      await insertNotifications(supabase, [{ userId: reporterId, title: replyTitle, body: replyBody, path: '/support/mobilisation?tab=follow', type: 'FOLLOWUP_ISSUE' }])
      const { data: replySubs, error: replySubsError } = await supabase
        .from('PushSubscription')
        .select('userId, endpoint, p256dh, auth')
        .eq('userId', reporterId)
      if (replySubsError) throw new Error(replySubsError.message)
      if (!replySubs || replySubs.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: 0, reply: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const replyPayload = JSON.stringify({
        title: replyTitle,
        body: replyBody,
        icon: '/icon-192.png',
        tag: `fof-followup-issue-reply-${issueId}`,
        data: { path: '/support/mobilisation?tab=follow' },
      })
      const replyResult = await sendToSubscriptions(webPush, supabase, replySubs as any[], replyPayload)
      if (replyResult.failed > 0) console.error(`notify-followup-issue (reply): ${replyResult.sent} sent, ${replyResult.failed} failed`, JSON.stringify(replyResult.errors))
      return new Response(JSON.stringify({ ok: true, sent: replyResult.sent, reply: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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

    const contactName = issue.contact?.fullName?.trim()
    const title = 'New follow-up issue'
    const body = contactName
      ? `${reporter.name} logged an issue for ${contactName}: ${truncate(issue.issue)}`
      : `${reporter.name} logged a follow-up issue: ${truncate(issue.issue)}`

    // In-app feed for every admin, regardless of push subscription.
    await insertNotifications(
      supabase,
      adminIds.map((userId) => ({ userId, title, body, path: '/follow-ups', type: 'FOLLOWUP_ISSUE' })),
    )

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
      title,
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
