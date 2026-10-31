import type { CaptureResult, PostHog } from 'posthog-js'

// PostHog product analytics. Off unless POSTHOG_KEY (or VITE_POSTHOG_KEY) is set. It loads after the
// first screen, like Clarity (see main.tsx).
//
// What it records: page views, and a click on every button and link. Every one of those carries a stable
// name (`data-attr`, added at build time by vite-plugins/nameClickTargets.ts from text written in the source),
// so a click arrives as "ParticipantCard.login-details" on page "/participants/:id".
//
// Click and page events never carry the text on screen (a button can be a person's name), other element
// attributes (a label can say "Message Ada"), the query string, or an id in a URL; `cleanEvent` below enforces
// that for every event. Session replay is on so the team can watch how people use the app: everything typed
// into a field stays masked, but text on screen, names included, is visible in a recording.
// Everyone signed in is shown in PostHog by name (person property `name`), with their role. Staff are
// identified by app id; participants by a pseudonym (`participantPseudonym`), the same one the database's
// `analytics.pid()` gives, so their devices merge into one person and the warehouse views line up.
const KEY = __POSTHOG_KEY__ || undefined
const HOST = __POSTHOG_HOST__ || 'https://us.i.posthog.com'

let client: PostHog | null = null
let starting: Promise<void> | null = null
// What the app asked for before PostHog finished loading, replayed once it has.
// undefined: the app has not said yet (or a participant's pseudonym is still being worked out).
let wantedIdentity: AnalyticsUser | null | undefined
const queued: Array<[string, Record<string, unknown> | undefined]> = []

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "/participants/6f1c…" becomes "/participants/:id"; no query string, no hash. Anything unparseable becomes ''. */
const cleanPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return ''
  let path = value
  try { path = new URL(value, 'https://app.invalid').pathname } catch { return '' }
  return path.split('/').map((part) => (UUID.test(part) || /^\d{3,}$/.test(part) ? ':id' : part)).join('/')
}

const cleanUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return ''
  try {
    const url = new URL(value)
    return `${url.origin}${cleanPath(url.pathname)}`
  } catch { return cleanPath(value) }
}

/** Last gate before anything leaves the browser: drops on-screen text and unnamed attributes, and strips ids from URLs. */
const cleanEvent = (event: CaptureResult | null): CaptureResult | null => {
  if (!event) return null
  if (holdForIdentity(event)) return null
  const props = event.properties as Record<string, unknown>
  // Every URL / path / referrer property, including the "session entry" and "previous page" ones.
  Object.keys(props).forEach((key) => {
    if (/(^|_)(url|referrer)$/.test(key)) props[key] = cleanUrl(props[key])
    else if (/pathname$/.test(key)) props[key] = cleanPath(props[key])
  })
  if (event.event === '$autocapture') {
    // PostHog sends the clicked element and its parents as one string (or an array in older setups), with the
    // on-screen text and every attribute. Keep only the tag and the build-time name of each, innermost first.
    const parts: Array<{ tag: string; name: string }> = []
    if (typeof props.$elements_chain === 'string') {
      props.$elements_chain.split(';').forEach((segment) => {
        const name = /attr__data-attr="([^"]*)"/.exec(segment)?.[1]
        const tag = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(segment)?.[1]
        if (name && tag) parts.push({ tag, name: name.replace(/[^A-Za-z0-9._-]/g, '') })
      })
    }
    if (Array.isArray(props.$elements)) {
      (props.$elements as Array<Record<string, unknown>>).forEach((el) => {
        const name = el['attr__data-attr']
        if (typeof name === 'string' && typeof el.tag_name === 'string') parts.push({ tag: el.tag_name, name: name.replace(/[^A-Za-z0-9._-]/g, '') })
      })
      props.$elements = parts.slice(0, 6).map((p) => ({ tag_name: p.tag, 'attr__data-attr': p.name }))
    }
    props.$elements_chain = parts.slice(0, 6).map((p) => `${p.tag}:attr__data-attr="${p.name}"`).join(';')
    delete props.$el_text
    delete props.$elements_chain_href
    delete props.$elements_chain_texts
    delete props.$elements_chain_elements
    delete props.$elements_chain_ids
    props.button = parts[0]?.name
    props.page = cleanPath(props.$pathname ?? props.$current_url)
  }
  return event
}

// A page view sent before PostHog knows who is signed in is filed under nobody, and stays there: with
// identified-only profiles PostHog never links it to the person identified a second later. That is what filled
// the dashboards' "Visitors (not signed in)" with supports and admins opening the app. So while the app has not
// said who is signed in yet (startup, or a participant's pseudonym being worked out), page views wait here and
// go out once it has, under that person. After HOLD_MS they go anyway, unidentified.
const HOLD_MS = 10000
const held: CaptureResult[] = []
let holdTimer: ReturnType<typeof setTimeout> | null = null
let releasing = false

const holdForIdentity = (event: CaptureResult): boolean => {
  if (releasing || event.event !== '$pageview' || wantedIdentity !== undefined) return false
  held.push(event)
  if (!holdTimer) holdTimer = setTimeout(releaseHeld, HOLD_MS)
  return true
}

function releaseHeld() {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  if (!client || held.length === 0) return
  releasing = true
  try {
    held.splice(0).forEach((event) => {
      // Sent again as the person now identified: PostHog fills in who it is, not the copy kept from before.
      const props = { ...(event.properties as Record<string, unknown>) }
      ;['distinct_id', '$is_identified', '$process_person_profile', 'token'].forEach((key) => delete props[key])
      client?.capture(event.event, props, event.timestamp ? { timestamp: new Date(event.timestamp) } : undefined)
    })
  } finally {
    releasing = false
  }
}

export const startAnalytics = (): Promise<void> => {
  if (!KEY) return Promise.resolve()
  if (starting) return starting
  starting = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      person_profiles: 'identified_only',
      // Clicks only, and only on what the build named (every button and link).
      autocapture: { dom_event_allowlist: ['click'], css_selector_allowlist: ['[data-attr]'], capture_copied_text: false },
      capture_pageview: 'history_change',
      // Typed input (passwords, messages) is masked; the rest of the screen is recorded as seen.
      session_recording: { maskAllInputs: true },
      before_send: cleanEvent,
    })
    client = posthog
    if (wantedIdentity !== undefined) applyIdentity(posthog, wantedIdentity)
    releaseHeld()
    queued.splice(0).forEach(([event, props]) => posthog.capture(event, props))
  }).catch(() => { /* analytics must never break the app */ })
  return starting
}

type AnalyticsUser = { id: string; role: string; name?: string }

// PostHog keeps who it identified in its own storage, so this survives the reload that switching person on a
// shared number does. Whenever that is not the person now signed in (or nobody is), it starts a fresh profile
// rather than merging the two people. This also clears browsers an older build identified by a participant's
// raw record id.
const applyIdentity = (posthog: PostHog, user: AnalyticsUser | null) => {
  const identified = posthog._isIdentified()
  if (!user) {
    if (identified) posthog.reset()
    return
  }
  if (identified && posthog.get_distinct_id() !== user.id) posthog.reset()
  posthog.identify(user.id, { role: user.role, ...(user.name ? { name: user.name } : {}) })
}

const PSEUDONYM = /^[0-9a-f]{64}$/
let identityRequest = 0

/**
 * Tie events to whoever is signed in, by app id, role and name; pass null when nobody is (signed out, or no saved
 * session at startup). Call it only once that is known: until then page views are held (see holdForIdentity).
 * A participant is never sent by record id: they are identified by `participantPseudonym` instead, or left anonymous
 * where it cannot be worked out.
 */
export const setAnalyticsUser = (user: AnalyticsUser | null): void => {
  const request = ++identityRequest
  const apply = (resolved: AnalyticsUser | null) => {
    if (request !== identityRequest) return
    wantedIdentity = resolved
    if (client) applyIdentity(client, resolved)
    releaseHeld()
  }
  if (user?.role !== 'PARTICIPANT') { apply(user); return }
  // Hashing is async. Until it finishes, no event may land on a different person's profile, so drop any
  // identity that cannot be this participant's pseudonym now (a staff id, or a raw record id from an old build).
  if (client?._isIdentified() && !PSEUDONYM.test(client.get_distinct_id())) client.reset()
  wantedIdentity = undefined
  void participantPseudonym(user.id).then((pseudonym) => apply(pseudonym ? { id: pseudonym, role: user.role, name: user.name } : null))
}

/**
 * A participant's pseudonym: SHA-256 of "<participant id>:fof-analytics-v1" in hex, exactly what
 * `analytics.pid()` returns in the database (migration 20261028100000). The suffix ships in the bundle, so this is
 * not a secret: anyone who already holds a record id can work out its pseudonym. What it does is keep the record id
 * itself out of PostHog. Null where the browser cannot hash (an insecure page); the participant then stays anonymous.
 */
const participantPseudonym = async (participantId: string): Promise<string | null> => {
  try {
    if (!globalThis.crypto?.subtle) return null
    const bytes = new TextEncoder().encode(`${participantId.toLowerCase()}:fof-analytics-v1`)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** A named event. Properties must never carry names, phone numbers, emails or free text. */
export const track = (event: string, props?: Record<string, unknown>) => {
  if (!KEY) return
  if (client) client.capture(event, props)
  else queued.push([event, props])
}
