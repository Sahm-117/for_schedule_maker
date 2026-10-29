# PostHog analytics (manual setup)

Date: 2026-10-28. Frontend only: no migration, no function. Not yet live until the key is set in Vercel.

## What changed
- `posthog-js` added; `src/lib/analytics.ts` starts it after load (idle callback, same moment as Clarity), in its own lazy chunk. Page views on route changes only; autocapture and session replay off; staff identified by id and role; participants anonymous. `track()` is there for named events later.
- `AnalyticsIdentity` in `App.tsx` calls `setAnalyticsUser` when the signed-in user changes.
- `vite.config.ts` reads `POSTHOG_KEY` / `POSTHOG_HOST` (or the `VITE_` spellings) at build time and bakes only those two into the bundle (`__POSTHOG_KEY__`, `__POSTHOG_HOST__`), so the Vercel variable can be a plain `POSTHOG_KEY` and avoids Vercel's public-prefix warning. `frontend/.env.example` documents them.
- The PostHog wizard (`npx @posthog/wizard`) was not run: it needs an interactive PostHog login and edits the project itself. This is the same result done by hand, with the privacy settings above.

## To switch it on (owner)
1. In PostHog, copy the project's public key (starts `phc_`).
2. In Vercel > the project > Settings > Environment Variables, add `POSTHOG_KEY` for Production (and `POSTHOG_HOST` only if the project is on the EU cloud: `https://eu.i.posthog.com`), then redeploy.
3. Open the app; PostHog's "Waiting for events" should turn to received within a minute.

## Tested
- `npm run build` with and without `POSTHOG_KEY`: the key is in the bundle only when set, and a `POSTHOG_API_KEY` set at the same time is not. With a dummy key a mocked-browser run loaded PostHog's config and flags requests with no console errors; with no key nothing is requested (code path returns early). Real events were not seen because there is no real key here.

## Open items
- Decide whether to send any named events (`track`); none are wired yet.
- Clarity and PostHog now both run; if only one is wanted, remove the other in `main.tsx`.
- Consider a privacy line for participants if they are told what is collected.

## Addendum (29 Oct): every button and link is named and its click captured
- `vite-plugins/nameClickTargets.ts` (Vite plugin, build time) adds `data-attr="Component.label"` to every button, `<a>`, `NavLink` and `Link` (about 1,440 in the bundle; about 60 stay generic such as `YearTimeline.button-2` because they have no text, label, destination or handler name). The source files are unchanged. A name is built only from text written in the source, so it cannot contain a person's name.
- PostHog autocapture now records clicks only on elements that carry a `data-attr`. `cleanEvent` (in `lib/analytics.ts`, as PostHog's `before_send`) strips the on-screen text and all other attributes, adds `button` (the name) and `page` (the route with ids as `:id`), and removes query strings and ids from every URL property. Checked with a mocked run: a click on a participant's name link was sent as `button = AdminParticipantsContent.to-participants-2`, `page = /participants`, with no name in the payload.
- Participants' clicks are captured too (by pseudonym since 29 Oct, see the addendum). Say if they should be left out.
- Gotcha for testing: PostHog drops events from headless or automated browsers (`navigator.webdriver`, bot user agents), so a Playwright run sends nothing unless `opt_out_useragent_filter` is turned on temporarily.
- Gotcha: `npm run build` is only `vite build` and does not type-check. `tsc -p tsconfig.app.json --noEmit` is the real check; it reports 7 errors already on `main` in `PracticeDock.tsx` and `AdminWebsitePage.tsx` and none in the files from this work.

## Addendum (29 Oct): participants identified by pseudonym
- Before this change the app identified every signed-in user in PostHog by `user.id`, which for a participant is the Participant record id (not anonymous as rule 111 said). PostHog held no participant persons yet (checked: only staff with role SUPPORT), so nothing had to be removed.
- Now `setAnalyticsUser` in `lib/analytics.ts` identifies participants as SHA-256 hex of `<id>:fof-analytics-v1` (`participantPseudonym`, private to that file), the same value `analytics.pid()` returns (checked against the live function). `App.tsx` just passes the signed-in user. Staff are unchanged.
- Reset logic reads PostHog's own stored identity (`_isIdentified()`, `get_distinct_id()`), not a module variable, because switching person on a shared number is a full page reload. It resets on sign-out (also when sign-out happens before PostHog has loaded), on a different person, before the async hash finishes if a staff or raw-UUID identity is still set, and for browsers an older build identified by raw record id.
- The suffix is public (it ships in the bundle), so the pseudonym is not a secret; rules 111 and 112 now say so instead of "salted".
- PostHog dashboards built over MCP (FOF · Active usage, Participants: Journey, manuals, recaps, Faith project and discussions, Questions and feedback) group audiences with `person.properties.role`, now including `PARTICIPANT`, falling back to `/me` pages for anonymous visits.
- Checked in a mocked browser (bot filter switched off for the test only): a participant's events carried only the pseudonym and role, never the record id.
