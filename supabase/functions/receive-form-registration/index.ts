/**
 * Takes a Google Form sign-up from the Apps Script trigger and brings it into
 * the app.
 *
 * The sheet used to be write-only: a support registered someone here and the
 * row was pushed out. That push is off. Filling in the form is what actually
 * registers someone, so submissions now come back the other way.
 *
 * Every sign-up is recorded in SheetRegistration whatever happens to it, so a
 * support can see it even when the matching goes wrong. Then:
 *
 *   matches a contact by phone  -> mark that contact REGISTERED, which is what
 *                                  promotes them to a Participant
 *   matches nobody              -> create an unowned FollowUpContact and tell
 *                                  the admins, the same as any unassigned prospect
 *
 *   POST { secret, responseId?, fullName, phone, email?, signedUpAt?, answers? }
 *
 * Two flags exist for bringing in the sign-ups that were already in the sheet
 * before any of this was connected:
 *
 *   dryRun   -- work out what would happen and say so, writing nothing at all
 *   backfill -- do the work, but stay quiet: no admin notification per row,
 *               which would otherwise mean one alert for every historical
 *               sign-up the moment the import runs
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { insertNotifications } from '../_shared/notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const SHEET_SECRET = Deno.env.get('GOOGLE_SHEET_SECRET') ?? ''

/**
 * Same rules as the app's normalizeToIntlPhone (frontend/src/utils/phone.ts):
 * Nigerian local numbers become 234..., other international numbers are kept,
 * anything unparseable is null. Matching is only ever done on this value, so
 * "0803 000 0000" and "+234 803 000 0000" are the same person.
 */
const normalisePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (/^0[7-9][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`
  if (/^234[7-9][01]\d{8}$/.test(digits)) return digits
  if (/^\d{10,15}$/.test(digits) && !digits.startsWith('0')) return digits
  return null
}

/** Mirrors participantsApi.upsertFromFollowUpContact, which lives in the browser. */
const upsertParticipant = async (contact: Record<string, unknown>) => {
  const { data: existing } = await supabase
    .from('Participant')
    .select('id')
    .eq('followUpContactId', contact.id)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('Participant')
      .update({ fullName: contact.fullName, phone: contact.phone, cohortId: contact.cohortId, updatedAt: new Date().toISOString() })
      .eq('id', existing.id)
    return existing.id
  }

  const { data: created } = await supabase
    .from('Participant')
    .insert([{
      fullName: contact.fullName,
      phone: contact.phone,
      cohortId: contact.cohortId ?? null,
      source: 'FOLLOW_UP',
      followUpContactId: contact.id,
    }])
    .select('id')
    .single()
  return created?.id ?? null
}

const tellAdmins = async (title: string, body: string) => {
  const { data: admins } = await supabase.from('User').select('id').eq('role', 'ADMIN').neq('isActive', false)
  if (!admins?.length) return
  await insertNotifications(
    supabase,
    admins.map((a: { id: string }) => ({ userId: a.id, title, body, path: '/follow-ups', type: 'FOLLOWUP_ASSIGNMENT' })),
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }

  if (!SHEET_SECRET || payload.secret !== SHEET_SECRET) {
    return json({ error: 'Not authorised' }, 401)
  }

  const fullName = String(payload.fullName ?? '').trim()
  const phone = String(payload.phone ?? '').trim()
  if (!fullName || !phone) {
    return json({ error: 'fullName and phone are required' }, 400)
  }

  const dryRun = payload.dryRun === true
  const backfill = payload.backfill === true
  const normalised = normalisePhone(phone)
  const signedUpAt = payload.signedUpAt ? new Date(String(payload.signedUpAt)).toISOString() : new Date().toISOString()
  const rowKey = payload.responseId ? String(payload.responseId) : null

  if (dryRun) {
    // Say what would happen and stop. Nothing is written, not even the
    // SheetRegistration row, so this can be run as often as it takes to decide.
    if (rowKey) {
      const { data: already } = await supabase
        .from('SheetRegistration').select('id').eq('sheetRowKey', rowKey).maybeSingle()
      if (already) return json({ ok: true, outcome: 'DUPLICATE', wouldDo: 'Already imported; nothing would change.' })
    }

    let match: { fullName: string; registrationStatus: string } | null = null
    if (normalised) {
      const { data: candidates } = await supabase
        .from('FollowUpContact').select('fullName, phone, registrationStatus').is('archivedAt', null).limit(5000)
      match = (candidates ?? []).find((c: { phone: string }) => normalisePhone(c.phone) === normalised) ?? null
    }
    return json({
      ok: true,
      outcome: match ? 'MATCHED' : 'CREATED',
      wouldDo: match
        ? (match.registrationStatus === 'REGISTERED'
            ? `${match.fullName} is already registered; only the sign-up would be recorded.`
            : `Mark ${match.fullName} registered and add them as a participant.`)
        : `Add ${fullName} as a new prospect waiting to be assigned.`,
    })
  }

  // Record the sign-up first, so it is never lost even if the rest fails.
  const { data: registration, error: insertError } = await supabase
    .from('SheetRegistration')
    .insert([{
      fullName,
      phone,
      phoneNormalised: normalised,
      email: payload.email ? String(payload.email).trim() : null,
      signedUpAt,
      answers: payload.answers ?? {},
      sheetRowKey: rowKey,
    }])
    .select('id')
    .single()

  if (insertError) {
    // A repeated responseId means Apps Script sent this one twice.
    if (insertError.code === '23505') return json({ ok: true, outcome: 'DUPLICATE' })
    console.error('receive-form-registration: could not record sign-up', insertError.message)
    return json({ error: 'Could not record the sign-up' }, 500)
  }

  const finish = async (outcome: string, detail: string | null, contactId: string | null) => {
    await supabase
      .from('SheetRegistration')
      .update({ outcome, outcomeDetail: detail, contactId })
      .eq('id', registration.id)
    return json({ ok: true, outcome })
  }

  try {
    // Which cohort a new prospect belongs to.
    const { data: activeCohort } = await supabase
      .from('Cohort')
      .select('id')
      .eq('status', 'ACTIVE')
      .order('startDate', { ascending: false })
      .limit(1)
      .maybeSingle()

    let contact: Record<string, unknown> | null = null
    if (normalised) {
      // Match on the normalised number rather than the raw text, so formatting
      // differences between the form and the app don't hide an existing prospect.
      // Numbers are stored as typed, so this compares in code rather than SQL;
      // with tens of active contacts that is cheaper than it looks, but it is
      // the thing to revisit if the table ever grows into the thousands.
      const { data: candidates } = await supabase
        .from('FollowUpContact')
        .select('id, fullName, phone, cohortId, registrationStatus')
        .is('archivedAt', null)
        .limit(5000)
      contact = (candidates ?? []).find((c: { phone: string }) => normalisePhone(c.phone) === normalised) ?? null
    }

    if (contact) {
      if (contact.registrationStatus !== 'REGISTERED') {
        await supabase
          .from('FollowUpContact')
          .update({ registrationStatus: 'REGISTERED', updatedAt: new Date().toISOString() })
          .eq('id', contact.id)
        await upsertParticipant(contact)
      }
      return await finish('MATCHED', `Matched ${contact.fullName} and marked them registered.`, String(contact.id))
    }

    // Nobody in the app knows this person yet: make them a prospect waiting to be
    // assigned, exactly like any other unowned prospect.
    const { data: created, error: createError } = await supabase
      .from('FollowUpContact')
      .insert([{
        fullName,
        phone,
        source: 'Google Form',
        cohortId: activeCohort?.id ?? null,
        followUpCount: 0,
        email: payload.email ? String(payload.email).trim() : null,
      }])
      .select('id')
      .single()

    if (createError) {
      console.error('receive-form-registration: could not create contact', createError.message)
      return await finish('FAILED', createError.message, null)
    }

    // An import of old sign-ups would otherwise raise one alert per row.
    if (!backfill) {
      await tellAdmins('New sign-up from the form', `${fullName} signed up on the registration form. They're waiting to be assigned.`)
    }
    return await finish('CREATED', 'Created a new prospect waiting to be assigned.', created.id)
  } catch (error) {
    console.error('receive-form-registration: failed', String(error))
    return await finish('FAILED', String(error), null)
  }
})
