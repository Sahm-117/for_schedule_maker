// Shared web-push delivery helper for all edge functions.
//
// Why this exists: every function previously had its own send loop that only
// handled HTTP 410 (expired subscription) and silently swallowed every other
// error — so transient blips and broken keys lost notifications with zero
// visibility. This centralizes reliable delivery so the behaviour is identical
// everywhere and fixed in one place.
//
// Behaviour:
//   - 404 / 410          -> subscription is permanently gone; delete it.
//   - 429 / 5xx / network -> transient; retry with linear backoff.
//   - anything else (e.g. 400 bad VAPID key) -> count as failed + log.
// One bad endpoint never aborts the rest of the batch. Returns a summary so
// callers can surface { sent, failed, removed } in their response + logs.

// deno-lint-ignore no-explicit-any
type WebPush = any
// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export interface PushSubRow {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface DeliverySummary {
  sent: number
  failed: number
  removed: number
  errors: { endpoint: string; statusCode?: number; message: string }[]
}

// Only log the tail of an endpoint — never the full URL (it's a capability).
const endpointTail = (endpoint: string) => endpoint.slice(-12)

/**
 * Send one payload to many subscriptions reliably.
 * @param notifiedUserIds optional array that receives the userId of each
 *        successful delivery (some callers track who was reached).
 * @param store which subscription table the rows came from, so expired ones are
 *        removed from the right place (defaults to staff PushSubscription).
 */
export async function sendToSubscriptions(
  webPush: WebPush,
  supabase: SupabaseClient,
  subs: PushSubRow[],
  payload: string,
  notifiedUserIds?: string[],
  // Participant devices live in their own table; `userId` then holds the participantId.
  store: { table: string; ownerColumn: string } = { table: 'PushSubscription', ownerColumn: 'userId' },
): Promise<DeliverySummary> {
  const summary: DeliverySummary = { sent: 0, failed: 0, removed: 0, errors: [] }
  const maxAttempts = 3
  const payloadFor = store.table === PARTICIPANT_PUSH_STORE.table ? await sharedPhoneLabeller(supabase, subs, payload) : () => payload

  for (const sub of subs) {
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
    let delivered = false
    // deno-lint-ignore no-explicit-any
    let lastErr: any = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await webPush.sendNotification(pushSub, payloadFor(sub))
        delivered = true
        break
      } catch (err) {
        lastErr = err
        // deno-lint-ignore no-explicit-any
        const status = (err as any)?.statusCode

        if (status === 404 || status === 410) {
          await supabase
            .from(store.table)
            .delete()
            .eq(store.ownerColumn, sub.userId)
            .eq('endpoint', sub.endpoint)
          summary.removed++
          break
        }

        const transient = status === 429 || (typeof status === 'number' && status >= 500) || status === undefined
        if (transient && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 500))
          continue
        }
        break
      }
    }

    if (delivered) {
      summary.sent++
      if (notifiedUserIds) notifiedUserIds.push(sub.userId)
    } else {
      summary.failed++
      summary.errors.push({
        endpoint: endpointTail(sub.endpoint),
        // deno-lint-ignore no-explicit-any
        statusCode: (lastErr as any)?.statusCode,
        // deno-lint-ignore no-explicit-any
        message: String((lastErr as any)?.body || (lastErr as any)?.message || lastErr),
      })
    }
  }

  return summary
}

export const PARTICIPANT_PUSH_STORE = { table: 'ParticipantPushSubscription', ownerColumn: 'participantId' }

// One phone, several people (FLOW_MAP rule 91): when a phone is registered for more than one active participant
// of the same cohort, each alert says whose it is ("Tomi: …"), keeps its own tag so two people's alerts do not
// replace each other, and opens with ?for=<participantId> so the app switches to that person. data.readTitle keeps
// the bell copy's title for marking it read on tap. If the lookup fails the alert goes out unlabelled, as before.
const NAME_TITLES = new Set(['mr', 'mrs', 'miss', 'ms', 'dr', 'pastor', 'pst', 'bro', 'brother', 'sis', 'sister', 'deacon', 'dcn', 'deaconess', 'evang', 'prof', 'engr', 'barr', 'chief', 'mummy', 'daddy', 'aunty', 'uncle'])
const firstNameOf = (fullName: string): string => {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  return words.find((w) => !NAME_TITLES.has(w.toLowerCase().replace(/[^a-z]/g, ''))) ?? words[0] ?? ''
}
type Person = { id: string; fullName: string; status: string; cohortId: string | null }
// Cached briefly so a run that sends in a loop (push-reminders) looks each phone and person up once.
const CACHE_MS = 5 * 60 * 1000
const ownersCache = new Map<string, { at: number; ids: string[] }>()
const peopleCache = new Map<string, { at: number; person: Person | null }>()

async function sharedPhoneLabeller(supabase: SupabaseClient, subs: PushSubRow[], payload: string): Promise<(sub: PushSubRow) => string> {
  try {
    const now = Date.now()
    const endpoints = [...new Set(subs.map((s) => s.endpoint))]
    const missing = endpoints.filter((e) => (ownersCache.get(e)?.at ?? 0) < now - CACHE_MS)
    if (missing.length > 0) {
      const { data: rows, error } = await supabase.from(PARTICIPANT_PUSH_STORE.table).select('participantId, endpoint').in('endpoint', missing)
      if (error) return () => payload
      const found = new Map<string, string[]>(missing.map((e) => [e, []]))
      for (const row of (rows ?? []) as Array<{ participantId: string; endpoint: string }>) found.get(row.endpoint)?.push(row.participantId)
      for (const [e, ids] of found) ownersCache.set(e, { at: now, ids: [...new Set(ids)] })
    }
    const ownersOf = (e: string) => ownersCache.get(e)?.ids ?? []
    // Only a phone saved for two or more people needs names.
    const ids = [...new Set(endpoints.filter((e) => ownersOf(e).length > 1).flatMap(ownersOf))]
    if (ids.length === 0) return () => payload
    const needPeople = ids.filter((id) => (peopleCache.get(id)?.at ?? 0) < now - CACHE_MS)
    if (needPeople.length > 0) {
      const { data: people, error } = await supabase.from('Participant').select('id, fullName, status, cohortId').in('id', needPeople)
      if (error) return () => payload
      const byId = new Map(((people ?? []) as Person[]).map((p) => [p.id, p]))
      for (const id of needPeople) peopleCache.set(id, { at: now, person: byId.get(id) ?? null })
    }
    const person = (id: string) => peopleCache.get(id)?.person ?? null
    // The people this phone serves now: active, in the same cohort as the person the alert is for.
    const sharesWith = (sub: PushSubRow) => {
      const me = person(sub.userId)
      if (!me) return 0
      return ownersOf(sub.endpoint).filter((id) => { const p = person(id); return p && p.status === 'ACTIVE' && p.cohortId === me.cohortId }).length
    }
    const base = JSON.parse(payload)
    return (sub: PushSubRow) => {
      const name = firstNameOf(String(person(sub.userId)?.fullName ?? ''))
      if (!name || sharesWith(sub) < 2) return payload
      const path = typeof base?.data?.path === 'string' ? base.data.path : '/me'
      return JSON.stringify({
        ...base,
        title: `${name}: ${base.title ?? ''}`,
        tag: `${base.tag || 'fof-reminder'}-${sub.userId.slice(0, 8)}`,
        data: { ...(base.data ?? {}), readTitle: base.title ?? '', path: `${path}${path.includes('?') ? '&' : '?'}for=${sub.userId}` },
      })
    }
  } catch {
    return () => payload
  }
}
