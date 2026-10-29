# FOF public API

How other church apps ask FOF questions. FLOW_MAP rule 118.

- **Code:** `supabase/functions/public-api/index.ts` (deployed with JWT checks off).
- **Description:** `supabase/functions/public-api/openapi.json` (OpenAPI 3.1). It is also served at `GET /v1/openapi.json`.
  Change it in the same commit as any endpoint.
- **Database:** `supabase/migrations/20261029120000_public_api_foundation.sql` (`ApiClient`, `ApiRequestLog`, `api_*` functions).
- **Readable docs page:** `/api-docs.html` on the FOF site (`frontend/public/api-docs.html`), drawn by Scalar (MIT,
  open source, pinned version from jsDelivr) from the live `/v1/openapi.json`. The guide text (keys, scopes, limits,
  errors, what's next) lives in the description's `info.description` as Markdown, so humans and AI edit one file.
- **For AI tools:** `frontend/public/llms.txt` points at the docs and the description.

## What it serves (1.1)

| Call | Scope | Answer |
|---|---|---|
| `GET /v1/health`, `/v1/openapi.json` | none | Up check; the OpenAPI document |
| `GET /v1/cohorts/current` | `cohorts:read` | Current and next cohort |
| `GET /v1/people/lookup?phone=&email=` | `people:lookup` | `found`, participants (one per cohort, with `isTeen`), FOF team roles |
| `GET /v1/people/{id}` | `people:read` | Full profile: contact details, photo, date of birth, group and support; guardian for a teen with `teens:read` |
| `GET /v1/people/{id}/programme` | `people:read` | Weeks held, Sunday class and group meeting counts |
| `GET /v1/people/{id}/attendance` | `people:read` | Week-by-week marks |
| `GET /v1/people/{id}/faith-project` | `faith:read` | The faith project |
| `GET /v1/cohorts/{cohort}/participants` | `people:read` | A cohort's participants, paged (`limit`, `offset`, `group`) |
| `GET /v1/cohorts/{cohort}/team` | `team:read` | Supports and admins, roles, hubs, groups led |
| `GET /v1/cohorts/{cohort}/groups`, `/hubs` | `groups:read` | Groups and hubs, meeting day and time, leads (no call links) |
| `GET /v1/cohorts/{cohort}/weeks`, `/schedule` | `schedule:read` | Class weeks; the weekly programme schedule |
| `GET /v1/planner?until=` | `planner:read` | Cohorts with phases, planned cohorts, church events, holidays |
| `GET /v1/scriptures`, `/announcements`, `/resources` | `content:read` | Opened scriptures with totals; everyone-wide announcements; shared resources |
| `GET /v1/birthdays?days=` | `birthdays:read` | Upcoming birthdays |
| `GET /v1/birthdays/{kind}/{id}/graphic.png?quote=` | `birthdays:read` | The finished birthday picture (PNG) |

`{cohort}` is a cohort id or `current`. Teens come back as id, name, cohort and `restricted: true` without
`teens:read`. Each request records how many teen records it showed in full (`ApiRequestLog."teenRecords"`):

```sql
SELECT c.name, l.path, l."teenRecords", l."createdAt" FROM "ApiRequestLog" l JOIN "ApiClient" c ON c.id = l."clientId"
WHERE l."teenRecords" > 0 ORDER BY l."createdAt" DESC;
```

## Issuing and switching off a key

Use the app: **Settings → Church app access** (full admins only). New key, choose what the app may read, copy the key
once; switch an app off or on, change its access, and see its recent requests from its ⋯ menu.

Or in SQL as the database owner. A key is shown once. Only its SHA-256 hash is stored. Run as the database owner (Management API SQL):

```sql
-- Add 'teens:read' only for an app approved for teenagers.
SELECT public.api_create_client('Church platform (test)', ARRAY['people:lookup','people:read','cohorts:read'], 'who asked, and why');
-- returns { id, name, scopes, key }  -> send the key to the app's developer privately, never in a group chat

UPDATE public."ApiClient" SET "isActive" = false, "revokedAt" = NOW() WHERE id = '<id>';  -- switch off
```

Give each app only the scopes it needs. A test key and a live key should be separate clients.

## Next: the registration handshake (planned, not built)

Agreed flow: someone registers for FOF in the church app, fills in only what FOF still needs there, and sees their
FOF login details in the church app. Later, once email is wired up, the same login details are also emailed.

| Call | Scope | What it does |
|---|---|---|
| `POST /v1/registrations` | `registrations:write` | Church app sends what it holds: `churchPersonId`, `fullName`, `phone`, `email`, `gender`, `dateOfBirth`. FOF matches an existing person (church ID, then phone, then email) or starts a new registration. Returns `registrationId`, `status` (`needs_details` or `complete`) and `missing` (the fields still needed, for example `occupation`, `ageRange`, guardian details for a teenager). |
| `PATCH /v1/registrations/{id}` | `registrations:write` | Church app sends the missing fields. When nothing is missing, returns `status: complete` and `login`: `{ username, accessCode, signInUrl, mustChangePassword: true, deliveredBy: ["church_app"] }`. |
| `GET /v1/registrations/{id}` | `registrations:write` | Where a registration stands. |

Build notes:

- Registrations must enter the same pipeline as Google Form sign-ups (`receive-form-registration`: `SheetRegistration`
  → `FollowUpContact` → `Participant`), so supports see them exactly as they do now and every existing rule holds,
  including rule 3 (one phone per cohort per name).
- The login is the same phone + access code staff share today (`participant_login_details`), issued without a staff
  session for an API client with `registrations:write`. The first sign-in already forces a new password.
- Store the church person ID in a link table (church ID ↔ FOF person). Single sign-on later uses the same table.
- When email delivery exists, add `"email"` to `deliveredBy`; the API shape does not change.
- Teenagers: agree with the church what is collected and who sees the login (guardian rules) before building.
