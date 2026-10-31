# PostHog: "Visitors (not signed in)" were signed-in staff

Date: 2026-10-31. FLOW_MAP rule 111.

## What was wrong
The audience charts showed about 36 "Visitors (not signed in)" a week. Almost all of them were supports and admins.
- The app sent the first page view of each visit about a second before it told PostHog who was signed in.
- With identified-only profiles, PostHog files that page view under nobody and never links it to the person
  identified a moment later.
- The charts read the role stored on each event, so those page views had no role.

## What changed
- **App** (`lib/analytics.ts`, `App.tsx`, `hooks/useAuth.tsx`):
  - page views wait until the app knows who is signed in, then go out under that person (after 10 seconds they go
    anyway, unidentified);
  - the identity step waits for the saved session check instead of reporting "nobody" first;
  - signing in tells PostHog straight away, so the first screen after sign-in is already that person's.
- **PostHog project setting:** person properties are now read from the current person (`modifiers.personsOnEventsMode`
  = `person_id_override_properties_joined`). Older anonymous page views on a device that later signed in now count under
  that person's role. To undo, set `modifiers` back to null in the project settings.
- **Audience charts:** the 7 role-based insights now share one grouping. Role comes first (Admins, Supports,
  Participants, or a `/me` page). Then come "Opened sign-in, did not sign in" (`/`, `/login`, `/signup`) and "Staff
  device not linked to an account". The insights are the daily, weekly, monthly, today and this-week audience charts,
  feedback by audience, discussions by audience, and scripture engagement by role. The three "today vs same day last
  week" role tiles needed no change.

## Tested
- In a browser, with every PostHog request caught locally so nothing reached the real project:
  - **Old code:** an admin's first page view went out anonymous with no person attached.
  - **New code:** the same page view went out under the admin.
  - **Participant:** the `/me` page view waited for the pseudonym and went out under it.
  - **Session that turned out to be signed out:** the held page view went out unidentified.
- Both temporary sessions were deleted.
- `npm run build` passes.

## Open items
- About 12 page views from 29 to 30 Oct come from one Mac browser that never kept PostHog's id, each a single page. Only
  one signed-in person used that browser and system version that week, an admin. Merging those ids into that person
  would move them to Admins, but a merge can't be undone, so it waits for the owner.
- Local browser checks with analytics on need a normal user agent, `navigator.webdriver` hidden and
  `navigator.userAgentData` hidden, or PostHog drops the events as a bot.

## Gotchas
- Don't send a page view before identity is known again (for example a manual `capture('$pageview')` at startup). It
  lands on no one.
