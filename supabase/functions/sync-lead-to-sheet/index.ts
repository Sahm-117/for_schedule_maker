/**
 * Sends a registered prospect to the Google Sheet (Apps Script web app).
 *
 * The prospect is read from the database here rather than taken from the caller, so
 * the browser can't put arbitrary rows in the sheet. Success and failure are
 * both recorded on the row: sheetSyncedAt when it lands, sheetSyncError when it
 * doesn't, which is what the daily retry looks for.
 *
 *   POST { contactId }            — send one prospect
 *   POST { pending: true }        — send everything still outstanding (daily job)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const WEBHOOK_URL = Deno.env.get('GOOGLE_SHEET_WEBHOOK_URL') ?? ''
const SHEET_SECRET = Deno.env.get('GOOGLE_SHEET_SECRET') ?? ''

const SELECT = '*, registeredBy:User!FollowUpContact_registeredById_fkey(name)'

const sendOne = async (contact: any): Promise<{ ok: boolean; detail: string; row?: number | null; warning?: string | null }> => {
  const payload = {
    secret: SHEET_SECRET,
    registeredAt: contact.createdAt,
    fullName: contact.fullName,
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    gender: contact.gender ?? '',
    ageRange: contact.ageRange ?? '',
    occupation: contact.occupation ?? '',
    note: contact.notes ?? '',
    registeredBy: contact.registeredBy?.name ?? '',
    source: contact.source ?? '',
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { /* Google returned a page, not our JSON */ }

    if (!response.ok || !parsed?.ok) {
      const detail = parsed?.error || `Sheet replied ${response.status}`
      await supabase.from('FollowUpContact').update({ sheetSyncError: String(detail).slice(0, 300) }).eq('id', contact.id)
      return { ok: false, detail }
    }

    // Landed, but some columns couldn't be found: the form probably changed.
    const missing: string[] = Array.isArray(parsed.missingHeadings) ? parsed.missingHeadings : []
    const warning = missing.length > 0
      ? `Missing in sheet: ${missing.join('; ')}`.slice(0, 300)
      : null

    await supabase.from('FollowUpContact')
      .update({ sheetSyncedAt: new Date().toISOString(), sheetSyncError: null, sheetSyncWarning: warning })
      .eq('id', contact.id)
    return { ok: true, detail: parsed.action ?? 'added', row: parsed.row ?? null, warning }
  } catch (error) {
    await supabase.from('FollowUpContact').update({ sheetSyncError: String(error).slice(0, 300) }).eq('id', contact.id)
    return { ok: false, detail: String(error) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  if (!WEBHOOK_URL || !SHEET_SECRET) return json({ ok: false, error: 'Sheet sync is not configured' }, 500)

  try {
    const { contactId, pending } = await req.json() as { contactId?: string; pending?: boolean }

    if (pending) {
      // Retry anything from the last 30 days that hasn't landed yet.
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const { data } = await supabase.from('FollowUpContact').select(SELECT)
        .is('sheetSyncedAt', null).not('registeredById', 'is', null).gte('createdAt', since).limit(50)
      const results = []
      for (const contact of (data ?? []) as any[]) results.push(await sendOne(contact))
      return json({ ok: true, attempted: results.length, sent: results.filter((r) => r.ok).length })
    }

    if (!contactId) return json({ ok: false, error: 'contactId is required' }, 400)
    const { data: contact } = await supabase.from('FollowUpContact').select(SELECT).eq('id', contactId).maybeSingle()
    if (!contact) return json({ ok: false, error: 'Prospect not found' }, 404)

    const result = await sendOne(contact)
    return json({ ok: result.ok, detail: result.detail, row: result.row ?? null, warning: result.warning ?? null }, result.ok ? 200 : 502)
  } catch (error) {
    console.error('sync-lead-to-sheet error:', String(error))
    return json({ ok: false, error: String(error) }, 500)
  }
})
