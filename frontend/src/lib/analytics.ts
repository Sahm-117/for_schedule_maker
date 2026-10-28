import type { PostHog } from 'posthog-js'

// PostHog product analytics. Off unless POSTHOG_KEY (or VITE_POSTHOG_KEY) is set (the project's public key), so local
// and preview builds send nothing. It loads after the first screen, like Clarity (see main.tsx).
//
// Kept deliberately light for a programme with young participants: no autocapture (it records the text
// of whatever was tapped, which can be a person's name), no session replay (Clarity already covers
// that), and staff are identified by their app id and role only, never a name, number or email.
const KEY = __POSTHOG_KEY__ || undefined
const HOST = __POSTHOG_HOST__ || 'https://us.i.posthog.com'

let client: PostHog | null = null
let starting: Promise<void> | null = null
// What the app asked for before PostHog finished loading, replayed once it has.
let wantedIdentity: { id: string; role: string } | null | undefined
const queued: Array<[string, Record<string, unknown> | undefined]> = []

export const startAnalytics = (): Promise<void> => {
  if (!KEY) return Promise.resolve()
  if (starting) return starting
  starting = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: 'history_change',
      disable_session_recording: true,
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
