# FOF public API v1: live

Date: 2026-10-29. FLOW_MAP rule 118 (new). Docs: `docs/api/README.md`.

## Why
The church is connecting its apps. Decision: APIs first, single sign-on later, shared database not decided. Other
church apps need to ask FOF "is this person in FOF, and where are they in the programme?" without touching FOF tables.

## What changed
- Migration `20261029120000_public_api_foundation.sql` (**applied live** 29 Oct): locked tables `ApiClient` (hashed
  keys, scopes, on/off) and `ApiRequestLog`; service-role-only functions `api_authenticate` (checks the key and books
  the request against the 60-a-minute limit under a per-key advisory lock), `api_finish_request`, `api_create_client`,
  `api_people_lookup`, `api_person`, `api_person_programme`, `api_cohorts_current`, helper `api_real_cohort`.
- Edge function `public-api` (**deployed live**, version 1, `verify_jwt: false`, with `openapi.json`): `/v1/health`,
  `/v1/openapi.json`, `/v1/cohorts/current`, `/v1/people/lookup`, `/v1/people/{id}`, `/v1/people/{id}/programme`.
- Docs: `frontend/public/api-docs.html` (Scalar 1.73.1, MIT, from jsDelivr) reads the live `/v1/openapi.json`. The
  guide text (keys, scopes, limits, errors, what's next) is Markdown inside the description's `info.description`, so
  there is one file to edit. Scalar's AI chat, MCP generator, developer toolbar and telemetry are off.
  `frontend/public/llms.txt` points AI tools at it. The earlier Claude-hosted docs page was deleted (owner's choice).
- Registration handshake designed in `docs/api/README.md`, not built.

## Code review (/code-review medium), all fixed before going live
- Single-role staff got no team roles: now `app_user_roles`.
- Archived cohorts were hidden from "has this person taken FOF?": now included (Practice and "ZZ" test cohorts stay out).
- Rate limit: refused requests kept a retrying client locked out, and parallel requests all slipped through. Now
  booked and counted in one locked step, 429s not counted.
- Phone matching used the last 10 digits (could match a different country's number): now `fof_phone_key`.
- Group meetings dropped EXCUSED; Sunday class counted unexcused late as present. Both now match FOF's own figures.
- `teamRoles` was a closed list in the description: now any role name.
- Requests with no or unknown key are no longer written to the log, so junk traffic cannot grow it.

## Tested live
Two temporary keys, every address called, then both keys and their 75 log rows deleted. No keys exist now.
- health and openapi.json without a key: 200. No key: 401 `missing_key`; made-up key: 401 `invalid_key`.
- Current cohort: Cohort 10, running. Lookup of a Cohort 10 participant in +234 form: found, one participation.
  Made-up number: not found. A support: found with `teamRoles: ["SUPPORT"]`. Nothing given: 400. Unreadable phone: 400.
- Profile and programme: 200 with the documented fields. Unknown person: 404. Lookup-only key reading a profile: 403.
  POST: 405. Unknown address: 404. 62 quick requests: 60 answered, then 429 with `Retry-After: 60`.
- The log held paths and statuses only, no phone numbers.
- Before going live, the migration ran twice in rolled-back transactions (keys, limit, lookup, roles, Cohort 9 weeks).
- The docs page rendered from the live description at desktop and phone width, no console errors.

## Open items
- Issue the church platform's test key when asked (see `docs/api/README.md`), with only the scopes they need.
- Build the registration handshake after the church digital team answers the questions on the church platform page.
- `api_person` returns gender, age range, occupation and departments. Confirm with the church that these may be shared.
