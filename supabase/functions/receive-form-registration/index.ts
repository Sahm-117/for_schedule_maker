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
// @ts-ignore — web-push ESM build
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
const SHEET_SECRET = Deno.env.get('GOOGLE_SHEET_SECRET') ?? ''

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fof.com'

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Already signed up. Login shared / Issue with login stay open now (they no
// longer file the contact away), so a repeat form must not knock them back to
// Registered.
const SIGNED_UP_STATUSES = new Set(['REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED'])

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

/**
 * The form's youngest age answer, same list as fill_profile_from_form. A teen is 10 - 17; the form's current wording
 * "18 and below" (and the earlier "Below 18") still counts as a teen until the form itself says "17 and below" / "10 - 17".
 */
const isBelow18 = (answers: Record<string, unknown>): boolean =>
  ['below 18', 'under 18', 'under-18', 'under18', '<18', 'below18', '18 and below', '18 & below', '18 and under', '18 & under',
    '17 and below', '17 & below', '17 and under', '17 & under', '10 - 17', '10-17', '10 to 17']
    .includes(String(answers['Age Range?'] ?? '').trim().toLowerCase().replace(/\s*-\s*/g, '-'))

/**
 * A teen's parent or guardian, from the form: any question that mentions a parent or guardian
 * and a name, or a phone/number/WhatsApp. Matched on the wording so the form can be reworded.
 */
const guardianFromAnswers = (answers: Record<string, unknown>): { guardianName?: string; guardianPhone?: string } => {
  const out: { guardianName?: string; guardianPhone?: string } = {}
  for (const [question, answer] of Object.entries(answers)) {
    const key = question.toLowerCase()
    const value = String(answer ?? '').trim()
    if (!value || !/parent|guardian/.test(key)) continue
    if (/name/.test(key)) out.guardianName = value
    else if (/phone|number|whatsapp|contact/.test(key)) out.guardianPhone = value
  }
  return out
}

/** A name as a sorted set of words, so "Abimbola Oluwaseye" equals "Oluwaseye Abimbola". Mirrors fof_name_key. */
const nameKey = (name: string): string =>
  Array.from(new Set(name.toLowerCase().trim().split(/\s+/).filter(Boolean))).sort().join(' ')

/** Mirrors participantsApi.upsertFromFollowUpContact, which lives in the browser. */
const upsertParticipant = async (contact: Record<string, unknown>) => {
  if (!contact.id) throw new Error('Cannot create a participant without a follow-up contact')

  const { data: existing, error: existingError } = await supabase
    .from('Participant')
    .select('id')
    .eq('followUpContactId', contact.id)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)

  const participantFields: Record<string, unknown> = {
    fullName: contact.fullName,
    phone: contact.phone,
    cohortId: contact.cohortId,
    updatedAt: new Date().toISOString(),
  }
  if ('email' in contact) participantFields.email = contact.email
  if (contact.ageRange) participantFields.ageRange = contact.ageRange
  if (contact.guardianPhone) participantFields.guardianPhone = contact.guardianPhone

  if (existing) {
    const { error: updateError } = await supabase
      .from('Participant')
      .update(participantFields)
      .eq('id', existing.id)
    if (updateError) throw new Error(updateError.message)
    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from('Participant')
    .insert([{
      fullName: contact.fullName,
      phone: contact.phone,
      cohortId: contact.cohortId ?? null,
      ...(contact.email !== undefined ? { email: contact.email } : {}),
      // A teen is created as one so the phone rule (teens may share a number) applies from the first write.
      ...(contact.ageRange ? { ageRange: contact.ageRange } : {}),
      ...(contact.guardianPhone ? { guardianPhone: contact.guardianPhone } : {}),
      source: 'FOLLOW_UP',
      followUpContactId: contact.id,
    }])
    .select('id')
    .single()
  if (createError || !created?.id) throw new Error(createError?.message || 'Failed to create participant')
  return created.id
}

/**
 * The contact this number belongs to. Looks at everyone still being followed up,
 * plus anyone in the current cohort whose follow-up has closed (logged in,
 * say), so a second form from someone already signed up -- often to correct
 * their name -- finds their record instead of creating a duplicate. A match in
 * the target cohort wins over an unscoped open contact; contacts belonging to
 * another cohort are ignored so a retaker gets a new target-cohort record.
 */
const findContact = async (normalised: string | null, targetCohortId: string | null, formName: string, teenForm: boolean) => {
  if (!normalised) return null
  // Numbers are stored as typed, so this compares in code rather than SQL;
  // with tens of active contacts that is cheaper than it looks, but it is the
  // thing to revisit if the table ever grows into the thousands.
  let query = supabase
    .from('FollowUpContact')
    .select('id, fullName, phone, email, cohortId, registrationStatus, archivedAt, nextAction, createdAt, guardianPhone, guardianName')
    .limit(5000)
  query = targetCohortId ? query.or(`cohortId.eq.${targetCohortId},cohortId.is.null`) : query.is('cohortId', null)
  const { data: candidates, error } = await query
  if (error) throw new Error(error.message)
  // A teen's number is often a parent's, shared by brothers and sisters. For a
  // "Below 18" form only a contact with the same name (in any word order) is the
  // same person; anyone else on that number is a new teen, not a correction.
  const matches = ((candidates ?? []) as Array<Record<string, unknown>>)
    .filter((c) => normalisePhone(String(c.phone ?? '')) === normalised)
    // A teen form needs the same name. An adult form must not take over a teen's
    // contact just because they share a phone (a parent's number): teens match only
    // on the same name, whoever is filling the form.
    .filter((c) => {
      const sameName = nameKey(String(c.fullName ?? '')) === nameKey(formName)
      if (teenForm) return sameName
      const isTeen = c.registrationStatus === 'TEENAGER' || c.registrationStatus === 'TEEN_ONBOARDED'
      return !isTeen || sameName
    })
  const targetMatch = matches.find((c) => targetCohortId && c.cohortId === targetCohortId)
  const unscopedOpenMatch = matches.find((c) =>
    c.cohortId == null && c.archivedAt == null && c.nextAction !== 'CLOSE'
  )
  return targetMatch ?? unscopedOpenMatch ?? null
}

const currentProgrammeCohortId = async () => {
  const { data, error } = await supabase.rpc('current_programme_cohort_id')
  if (error) throw new Error(error.message)
  return data ? String(data) : null
}

const tellAdmins = async (title: string, body: string) => {
  const { data: admins } = await supabase.from('User').select('id').eq('role', 'ADMIN').neq('isActive', false)
  if (!admins?.length) return
  const adminIds = admins.map((a: { id: string }) => a.id)
  await insertNotifications(
    supabase,
    adminIds.map((userId) => ({ userId, title, body, path: '/follow-ups', type: 'FOLLOWUP_ASSIGNMENT' })),
  )

  const { data: subs } = await supabase
    .from('PushSubscription')
    .select('userId, endpoint, p256dh, auth')
    .in('userId', adminIds)
  if (!subs?.length) return
  const payload = JSON.stringify({
    title, body, icon: '/icon-192.png', tag: `fof-signup-${Date.now()}`, data: { path: '/follow-ups' },
  })
  const { sent, failed, removed, errors } = await sendToSubscriptions(webPush, supabase, subs as any[], payload)
  if (failed > 0) console.error(`receive-form-registration (tellAdmins): ${sent} sent, ${failed} failed, ${removed} removed`, JSON.stringify(errors))
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

  // Defence in depth: the sheet-side sync already skips rows added in the app
  // rather than filled in on the form, but if one slips through anyway (an
  // older Apps Script deploy, a stale marker), catch it here too so it never
  // becomes a SheetRegistration row or a "signed up on the form" contact.
  const answers = (payload.answers ?? {}) as Record<string, unknown>
  const isAppAddedRow = Object.values(answers).some(
    (value) => String(value ?? '').trim().toLowerCase() === 'registered in the fof app',
  )
  if (isAppAddedRow) {
    return json({ ok: true, skipped: true, reason: 'app-added' })
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

    const match = await findContact(normalised, await currentProgrammeCohortId(), fullName, isBelow18(answers))
    return json({
      ok: true,
      outcome: match ? 'MATCHED' : 'CREATED',
      wouldDo: match
        ? (SIGNED_UP_STATUSES.has(String(match.registrationStatus))
            ? (match.fullName !== fullName
                ? `${match.fullName} is already registered; their name would be corrected to ${fullName}.`
                : `${match.fullName} is already registered; only the sign-up would be recorded.`)
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
    // Copy their form answers onto their profile (and the SMART request into a
    // draft faith project), so they don't have to type it all again.
    if (contactId) {
      const { error: fillError } = await supabase.rpc('fill_profile_from_form', { p_registration_id: registration.id })
      if (fillError) console.error('receive-form-registration: could not fill profile', fillError.message)
    }
    return json({ ok: true, outcome })
  }

  try {
    // Which cohort a new prospect belongs to.
    const cohortId = await currentProgrammeCohortId()
    const guardian = guardianFromAnswers(answers)

    // Match on the normalised number rather than the raw text, so formatting
    // differences between the form and the app don't hide an existing prospect.
    const contact = await findContact(normalised, cohortId, fullName, isBelow18(answers))

    if (contact) {
      const adoptingUnscopedContact = contact.cohortId == null && cohortId != null
      if (!SIGNED_UP_STATUSES.has(String(contact.registrationStatus))) {
        const { data: updatedContact, error: updateError } = await supabase
          .from('FollowUpContact')
          .update({
            ...(adoptingUnscopedContact ? { cohortId } : {}),
            ...guardian,
            registrationStatus: 'REGISTERED',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id)
          .select('id, fullName, phone, email, cohortId, registrationStatus, archivedAt, nextAction, createdAt, guardianPhone')
          .single()
        if (updateError || !updatedContact) throw new Error(updateError?.message || 'Failed to update contact')
        await upsertParticipant({ ...contact, ...updatedContact })
        return await finish('MATCHED', `Matched ${contact.fullName} and marked them registered.`, String(contact.id))
      }
      // Already signed up and filling the form again, usually to correct their
      // name or email: update their record rather than keeping the old details.
      const email = payload.email ? String(payload.email).trim() : ''
      const changes: Record<string, unknown> = {}
      if (contact.fullName !== fullName) changes.fullName = fullName
      if (email && contact.email !== email) changes.email = email
      if (adoptingUnscopedContact) changes.cohortId = cohortId
      if (guardian.guardianPhone && contact.guardianPhone !== guardian.guardianPhone) changes.guardianPhone = guardian.guardianPhone
      if (guardian.guardianName && contact.guardianName !== guardian.guardianName) changes.guardianName = guardian.guardianName
      let effectiveContact = contact
      if (Object.keys(changes).length) {
        const updatedAt = new Date().toISOString()
        const { data: updatedContact, error: updateError } = await supabase
          .from('FollowUpContact')
          .update({ ...changes, updatedAt })
          .eq('id', contact.id)
          .select('id, fullName, phone, email, cohortId, registrationStatus, archivedAt, nextAction, createdAt, guardianPhone')
          .single()
        if (updateError || !updatedContact) throw new Error(updateError?.message || 'Failed to update contact')
        effectiveContact = { ...contact, ...updatedContact }
      }
      await upsertParticipant(effectiveContact)
      const profileChanged = Boolean(changes.fullName || changes.email)
      if (profileChanged) {
        const what = [changes.fullName ? `name to ${fullName}` : null, changes.email ? `email to ${email}` : null].filter(Boolean).join(' and ')
        return await finish('MATCHED', `${contact.fullName} filled the form again; updated their ${what}.`, String(contact.id))
      }
      return await finish('MATCHED', `${contact.fullName} is already signed up; recorded the sign-up.`, String(contact.id))
    }

    // Nobody in the app knows this person yet: make them a prospect waiting to be
    // assigned, exactly like any other unowned prospect.
    //
    // They are born REGISTERED. Filling in this form IS registering, and someone
    // a support had already saved gets stamped REGISTERED on the branch above --
    // leaving this one at the NOT_REGISTERED default meant the same act produced
    // two different statuses depending on whether a support happened to know them,
    // and these people could never reach LOGIN_SHARED to close.
    const { data: created, error: createError } = await supabase
      .from('FollowUpContact')
      .insert([{
        fullName,
        phone,
        source: 'Google Form',
        cohortId: cohortId,
        followUpCount: 0,
        registrationStatus: 'REGISTERED',
        replyStatus: 'REPLIED',
        email: payload.email ? String(payload.email).trim() : null,
        ...guardian,
      }])
      .select('id')
      .single()

    if (createError) {
      console.error('receive-form-registration: could not create contact', createError.message)
      return await finish('FAILED', createError.message, null)
    }

    // Registered with no Participant row means participant_login_details returns
    // NO_PARTICIPANT, so their login could never be issued and the follow-up could
    // never close. The matched branch above already does this.
    await upsertParticipant({
      id: created.id,
      fullName,
      phone,
      email: payload.email ? String(payload.email).trim() : null,
      cohortId: cohortId,
      ageRange: isBelow18(answers) ? '10 - 17' : undefined,
      guardianPhone: guardian.guardianPhone,
    })

    // An import of old sign-ups would otherwise raise one alert per row.
    if (!backfill) {
      // Only say "they go to a Teen Support" when teen handling is actually on.
      const { data: teenSetting } = await supabase.from('AppSetting').select('value').eq('settingKey', 'teen_flow_enabled').maybeSingle()
      if (isBelow18(answers) && teenSetting?.value === true) {
        await tellAdmins('New teen sign-up from the form', `${fullName} signed up on the registration form as a teen. They go to a Teen Support.`)
      } else if (normalised) {
        await tellAdmins('New sign-up from the form', `${fullName} signed up on the registration form. They're waiting to be assigned their login.`)
      } else {
        // run_followup_assignment holds these back until the number is fixed.
        await tellAdmins('Sign-up needs a valid number', `${fullName} wrote "${phone}" as their WhatsApp number. Fix it on Follow-ups so they can be assigned.`)
      }
    }
    return await finish('CREATED', 'Registered them and created a prospect waiting to be assigned.', created.id)
  } catch (error) {
    console.error('receive-form-registration: failed', String(error))
    return await finish('FAILED', String(error), null)
  }
})
