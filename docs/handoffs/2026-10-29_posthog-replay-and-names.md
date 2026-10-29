# PostHog: session replays on, people shown by name

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 111 updated.

## Why
The owner could not see session recordings in PostHog, and people showed up as ids or pseudonyms.
The PostHog project already had recording switched on (`session_recording_opt_in: true`); the app itself
turned it off with `disable_session_recording: true` and identified people by id and role only.

## What changed
- `lib/analytics.ts`: `disable_session_recording: true` replaced with `session_recording: { maskAllInputs: true }`.
  Typed input stays masked; text on screen, names included, is visible in recordings (owner request).
- Everyone signed in is identified with person properties `role` and `name`, so PostHog lists people by name.
  Distinct ids are unchanged: staff by app id, participants by the `analytics.pid()` pseudonym, so the warehouse
  views (rule 112) still line up. Phone numbers and emails are still never sent.
- `App.tsx` passes the signed-in user's name to `setAnalyticsUser`.
- Click and page events are cleaned as before (`cleanEvent`): no on-screen text, no ids in URLs.

## Tested
- `npm run build`, `tsc --noEmit` (0 errors), eslint clean on the changed files.
- Local dev server with the project's public key, all PostHog requests blocked so nothing was sent: the app now
  loads `posthog-recorder.js`, which it did not before.
- Not yet seen live: check PostHog → Replay after the next deploy. Names fill in as people next open the app.

## Open items
- Clarity also records sessions. Two recorders on the same pages is extra load on phones; drop one if PostHog
  covers what Clarity did.
- Recordings now show participants' screens, including teenagers'. The owner asked for this; keep access to the
  PostHog project limited to the people who need it.
