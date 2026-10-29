import type { CaptureResult, PostHog } from 'posthog-js'

// PostHog product analytics. Off unless POSTHOG_KEY (or VITE_POSTHOG_KEY) is set. It loads after the
// first screen, like Clarity (see main.tsx).
//
// What it records: page views, and a click on every button and link. Every one of those carries a stable
// name (`data-attr`, added at build time by vite-plugins/nameClickTargets.ts from text written in the source),
// so a click arrives as "ParticipantCard.login-details" on page "/participants/:id".
//
// What it never records, because many participants are young: the text on screen (a button can be a person's
// name), other element attributes (a label can say "Message Ada"), the query string, or an id in a URL.
// `cleanEvent` below enforces that for everything sent. No session replay (Clarity already covers that).
// Staff are identified by their app id and role only, never a name, number or email.
const KEY = __POSTHOG_KEY__ || undefined
const HOST = __POSTHOG_HOST__ || 'https://us.i.posthog.com'

let client: PostHog | null = null
let starting: Promise<void> | null = null
// What the app asked for before PostHog finished loading, replayed once it has.
let wantedIdentity: { id: string; role: string } | null | undefined
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
      disable_session_recording: true,
      before_send: cleanEvent,
    })
    client = posthog
    if (wantedIdentity) posthog.identify(wantedIdentity.id, { role: wantedIdentity.role })
    queued.splice(0).forEach(([event, props]) => posthog.capture(event, props))
  }).catch(() => { /* analytics must never break the app */ })
  return starting
}

/** Tie events to a signed-in staff member by id and role. Pass null on sign-out. */
export const setAnalyticsUser = (user: { id: string; role: string } | null) => {
  wantedIdentity = user
  if (!client) return
  if (user) client.identify(user.id, { role: user.role })
  else client.reset()
}

/** A named event. Properties must never carry names, phone numbers, emails or free text. */
export const track = (event: string, props?: Record<string, unknown>) => {
  if (!KEY) return
  if (client) client.capture(event, props)
  else queued.push([event, props])
}
