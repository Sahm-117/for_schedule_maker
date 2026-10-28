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
