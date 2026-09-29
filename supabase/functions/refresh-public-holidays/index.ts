/**
 * refresh-public-holidays
 *
 * Fills "PublicHoliday" for the FOF Planner from Google's public Nigerian
 * holiday calendar (every year the feed covers, usually last year to next).
 * Only public holidays are kept, not observances like Valentine's Day.
 * Moon-sighted dates (Eid and so on) come marked "(tentative)" and are stored
 * with isEstimate until the feed firms them up.
 *
 * Called by pg_cron every 14 days (invoke_refresh_public_holidays, service
 * role) and by an admin's "Refresh now" on the Planner (x-session-token).
 *
 * Required Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FEED_URL = 'https://calendar.google.com/calendar/ical/en.ng%23holiday%40group.v.calendar.google.com/public/basic.ics'
const SOURCE = 'google-ng'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// The gateway has already checked the JWT (verify_jwt), so its role claim can be trusted.
const jwtRole = (req: Request): string | null => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

type Holiday = { date: string; name: string; isEstimate: boolean }

/** Public holidays from an iCalendar feed. */
export const parseHolidays = (ics: string): Holiday[] => {
  const text = ics.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n')
  const out: Holiday[] = []
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const event = block.split('END:VEVENT')[0]
    const date = event.match(/^DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/m)
    const summary = event.match(/^SUMMARY:(.*)$/m)?.[1]?.trim() ?? ''
    const description = (event.match(/^DESCRIPTION:(.*)$/m)?.[1] ?? '').replace(/\\n/g, '\n').replace(/\\,/g, ',')
    if (!date || !summary || !/^Public holiday/i.test(description)) continue
    const isEstimate = /tentative/i.test(summary) || /tentative/i.test(description)
    const name = summary.replace(/\s*\(tentative\)\s*/i, '').replace(/\\,/g, ',').trim()
    out.push({ date: `${date[1]}-${date[2]}-${date[3]}`, name, isEstimate })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Cron runs as the service role; anyone else must be a signed-in admin.
  if (jwtRole(req) !== 'service_role') {
    const token = req.headers.get('x-session-token')
    if (!token) return json({ ok: false, error: 'Not authorised' }, 401)
    const { data: staff } = await supabase.rpc('app_staff', { p_token: token })
    if (!staff?.id || staff.role !== 'ADMIN') return json({ ok: false, error: 'Only admins can refresh holidays' }, 403)
  }

  try {
    const res = await fetch(FEED_URL)
    if (!res.ok) throw new Error(`Holiday feed returned ${res.status}`)
    const holidays = parseHolidays(await res.text())
    // A near-empty feed means something went wrong upstream; keep what we have.
    if (holidays.length < 5) throw new Error(`Holiday feed looked empty (${holidays.length} holidays)`)

    const fetchedAt = new Date().toISOString()
    const { error: upsertError } = await supabase
      .from('PublicHoliday')
      .upsert(holidays.map((h) => ({ ...h, source: SOURCE, fetchedAt })), { onConflict: 'date,name' })
    if (upsertError) throw new Error(upsertError.message)

    // Dates that moved (an Eid firmed up) leave an old row behind: drop rows in
    // the years the feed covers that it no longer lists.
    const years = [...new Set(holidays.map((h) => h.date.slice(0, 4)))].sort()
    const keep = new Set(holidays.map((h) => `${h.date}|${h.name}`))
    const { data: existing } = await supabase
      .from('PublicHoliday').select('id, date, name')
      .eq('source', SOURCE).gte('date', `${years[0]}-01-01`).lte('date', `${years[years.length - 1]}-12-31`)
    const stale = ((existing ?? []) as any[]).filter((row) => !keep.has(`${row.date}|${row.name}`)).map((row) => row.id)
    if (stale.length > 0) await supabase.from('PublicHoliday').delete().in('id', stale)

    return json({ ok: true, holidays: holidays.length, years, removed: stale.length, fetchedAt })
  } catch (err) {
    console.error('refresh-public-holidays:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
