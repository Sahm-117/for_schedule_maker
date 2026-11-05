# FOF ↔ church app integration: spec and build plan

Written 2026-11-05. Owner: the FOF product owner. Status: **API v1.1.1 is live (read-only); everything after it is
planned.** This file is the single place an agent or developer should start from to continue the work.

Background and the decision behind it: [`church-platform-portability.md`](church-platform-portability.md)
(29 Oct 2026: connect through APIs now, single sign-on later, shared database not decided).
What the API serves today: [`docs/api/README.md`](../api/README.md). Database reference: [`docs/schema/SCHEMA.md`](../schema/SCHEMA.md).

---

## 0. If you are an agent picking this up

1. Read, in this order: `AGENTS.md`, `docs/handoffs/INDEX.md` (newest API or sign-up handoff), this file,
   `docs/api/README.md`, `FLOW_MAP.md` section 4 rules **1, 3, 67, 91, 95, 118, 129, 133**.
2. Find the first unticked box in [section 11, Status](#11-status-checklist). Do only that phase. Each phase has
   **Inputs** (what must be agreed first); if an input is not recorded in [section 10](#10-decisions-log), stop and ask
   the owner instead of guessing. Most church-side questions are still open.
3. Every database change is a new file in `supabase/migrations/`; test it in a rolled-back transaction first, apply live
   only with the owner's confirmation, then run `python3 scripts/schema-snapshot.py` and commit the snapshot with it.
4. Every endpoint change updates `supabase/functions/public-api/openapi.json` in the same commit and bumps `VERSION`
   in `index.ts` (minor for new endpoints, patch for fixes). Never break a `/v1` response shape; add fields only.
5. When a phase is done: tick it here, add a line to the decisions log if anything was decided, register any new rule
   in `FLOW_MAP.md` section 4, and write a handoff in `docs/handoffs/` with an `INDEX.md` row.
6. Never put keys, tokens, people's names or phone numbers in this repo (it is public). Use `isTest` people and a test
   API client for every check.

---

## 1. Goal

The church has (or is building) a members app. FOF is a separate app. The goal is that a church member never has to
type into FOF what the church already knows, and that the church can see a member's FOF journey, without either side
reading the other's database.

| # | Outcome | Who benefits |
|---|---|---|
| G1 | A church system can ask "is this person in FOF, and how far are they?" | Church staff, pastors, department heads |
| G2 | A member taps **Register for FOF** in the church app, answers only what FOF still needs, and sees their FOF login there | Members, FOF supports (fewer chases) |
| G3 | The two systems recognise the same person by a stable link, not by re-matching every time | Both |
| G4 | Later: signing in to the church app signs the person in to FOF (single sign-on) | Members |
| G5 | Optional: FOF tells the church when something changes (finished FOF, joined a department) | Church |
| G6 | Optional: FOF prefills its own sign-ups from the church's records | Members, FOF |

Non-goals for now: a shared database, FOF writing into church records, the church editing FOF data other than through
a registration, any change to how FOF staff (admins, supports) sign in.

---

## 2. What exists today (built and live)

### 2.1 The public API, v1.1.1

| Piece | Where |
|---|---|
| Edge function (JWT checks off; its own keys) | `supabase/functions/public-api/index.ts` |
| OpenAPI 3.1 description, also served at `GET /v1/openapi.json` | `supabase/functions/public-api/openapi.json` |
| Readable docs page (Scalar) | `frontend/public/api-docs.html`; `frontend/public/llms.txt` for AI tools |
| Keys and logs | `ApiClient` (`keyPrefix`, `keyHash` SHA-256, `scopes text[]`, `isActive`, `revokedAt`), `ApiRequestLog` (`method`, `path`, `status`, `durationMs`, `teenRecords`) |
| Database functions | `api_authenticate(p_key_hash, p_method, p_path, p_limit)` (checks key, rate limit, writes the log row), `api_finish_request`, `api_people_lookup`, `api_person`, `api_person_programme`, `api_person_attendance`, `api_person_faith_project`, `api_cohorts_current`, `api_cohort_*`, `api_planner_inputs`, `api_scriptures`, `api_announcements`, `api_resources`, `api_birthdays`, `api_birthday_person`, `api_is_teen`, `api_real_cohort` |
| Admin screen | Administration → Church app access (`api_admin_clients`, `api_admin_create_client`, `api_admin_update_client`, `api_admin_client_activity`) |
| Migration | `supabase/migrations/20261029120000_public_api_foundation.sql` and later `api_*` migrations |

- **Auth:** `Authorization: Bearer fof_live_…` or `X-API-Key`. A key is shown once and only its hash is stored.
- **Rate limit:** 60 requests a minute per key, answered `429 rate_limited`.
- **Errors:** `{ error: { code, message } }` with codes `missing_key`, `invalid_key`, `missing_scope`, `rate_limited`,
  `not_found`, `bad_request`, `method_not_allowed`, `server_error`.
- **CORS:** `GET, OPTIONS` only. Every route rejects anything but `GET` with `405`.
- **Scopes:** `people:lookup`, `people:read`, `teens:read`, `faith:read`, `team:read`, `groups:read`,
  `schedule:read`, `planner:read`, `content:read`, `birthdays:read`, `cohorts:read`.
- **Teens:** without `teens:read`, a teen comes back as `{ id, name, cohort, restricted: true }`. Each request
  records how many teen records it showed in full.
- **Excluded everywhere:** `isTest` people and Practice / test cohorts (`api_real_cohort`).
- **Lookup matches** by phone key (`fof_phone_key`) or lower-cased email. There is no church ID yet.

### 2.2 How someone becomes a FOF participant today

There is one door: the Google Form.

```
Google Form → Apps Script (integrations/) → receive-form-registration (edge fn, shared secret)
   1. SheetRegistration row (always, first; outcome MATCHED / CREATED / DUPLICATE / FAILED)
   2. find a FollowUpContact on the same phone (rules 3 and 91 decide if it is the same person)
        found     → mark REGISTERED, upsert Participant
        not found → new FollowUpContact (source 'Google Form', REGISTERED, unowned) + Participant; tell admins
   3. fill_profile_from_form(registration) copies the answers onto the profile (gender, age range, occupation,
      date of birth, SMART request → draft faith project, "Who registered you" → registeredById; a teen →
      TEENAGER for a Teen Support)
   4. run_followup_assignment (cron, every 10 min) gives the contact a support
   5. the support issues the login: participant_login_details(p_issue => true) → ParticipantAccount with a
      one-time code "FOF-XXXXXX", mustChangePassword; contact goes LOGIN_SHARED → ACCESS_CONFIRMED
```

Rules that bind any new door (FLOW_MAP section 4):

- **Rule 1, no form, no progress:** REGISTERED / LOGIN_SHARED / ACCESS_CONFIRMED need a linked `SheetRegistration`.
- **Rule 3:** one phone per cohort per name; teens aged "10 - 17" may share a number.
- **Rule 91:** everyone active in a cohort on one number shares one login. Issuing a login on a number that already
  has one gives the same password or waiting code; a new code resets everyone on the number.
- **Rule 95:** the in-app "Add someone on this number" writes a form record ("Added in the app by …") so rule 1 holds.
  The registration handshake should copy this pattern.
- **Rule 118:** other church apps reach FOF only through the public API, with their own key; teens only with `teens:read`.
- **Rule 133:** a participant login and a staff account on the same number never share a password.

The live form's question keys (as stored in `SheetRegistration.answers`), which the handshake must produce so
`fill_profile_from_form` works unchanged:

| Form key | FOF field |
|---|---|
| `What is your first name`, `What is your surname` | `fullName` (also sent separately as `fullName`) |
| `Please Share Your WhatsApp Number` | `phone` (also sent separately) |
| `Email Address` | `email` |
| `What's your Gender?` | `gender` (`Male` / `Female`) |
| `Age Range?` | `ageRange` (`10 - 17` = teen, `18 - 24`, …) |
| `Date of birth` | `dateOfBirth` |
| `What's your occupation?` (older: `Occupation`) | `occupation` |
| `Church Department/Unit (If any) ` (note the trailing space) | `departments` |
| `SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)` | `smartRequest`, draft faith project |
| `Are you willing to commit a couple of hours per week to engage in all the program's requirement for the next 8 weeks?` | commitment (not stored on the profile) |
| `How did you learn about the FOF program?` | how they heard |
| `Who Registered You for FOF?` | `registeredById` when it names a support |
| `An image of yourself that shows your face clearly` | photo (a Drive link today) |
| `Parent or Guardian's full name`, `Parent or Guardian's WhatsApp Number` | `guardianName`, `guardianPhone` (teens) |
| `Any Other Questions or Concerns? ` | free text |

---

## 3. Target picture

```
            Church members app (mobile/web)
                       │  (no FOF key in the app bundle)
                       ▼
            Church platform back end ──────────────► FOF public-api (edge fn)
              holds the FOF key                          │  /v1/people/*, /v1/registrations, /v1/links
                       ▲                                 ▼
                       │ webhooks (phase 5)        FOF database functions (api_*)
                       └──────────────────────────  SheetRegistration → FollowUpContact → Participant
                                                         ChurchPersonLink, ApiRegistration
            Church sign-in (OIDC provider)  ── phase 6 ──► FOF oidc-callback → AppSession
```

The church app's **back end** holds the FOF key. A key in a mobile app or web page can be read by anyone, so FOF
does not open CORS for writes; browser calls stay `GET` only.

---

## 4. Phase 0: agree with the church (blocks everything after phase 1)

Nothing in phases 2 to 6 should be built until these are answered and written into [section 10](#10-decisions-log).

| # | Question | Why it matters | Default if they have no view |
|---|---|---|---|
| Q1 | What is the church's unique person ID? Does it ever change or get reused? | The link table keys on it | Treat as opaque text, max 128 chars, never reused |
| Q2 | What do they hold: name, phone, email, gender, date of birth, occupation, department, photo, membership status? | Decides what FOF still has to ask | Assume name + phone only |
| Q3 | Phone format? Do two members share a phone? | Matching; rule 91 | FOF normalises; shared phones are normal |
| Q4 | What may FOF share back, and what must it never receive? | Data protection | Section 8 "never shared" list |
| Q5 | How do members consent to sharing between church apps? Who is the data controller (Nigeria Data Protection Act 2023)? | Legal basis | Consent tick in the church app, sent as `consentAt` |
| Q6 | Under-18s: may the church app register a teen? Who sees the teen's login, the teen or the parent? | Teen rules | Teens: registration allowed only with guardian details; login never returned to the church app (section 5.6) |
| Q7 | Their stack, sandbox, auth preference (API key vs OAuth client credentials), busy times | Build and test | API key; avoid Sunday deploys |
| Q8 | Do they want webhooks ("finished FOF", "joined department")? Which events? | Phase 5 scope | Not built |
| Q9 | Their sign-in product, OIDC support, token claims, timeline | Phase 6 | Not built |
| Q10 | Technical contact and how API changes are announced | Working together | Changes announced in the docs page changelog |

---

## 5. Phase 1 and 2: link table and registration handshake

### 5.1 Phase 1: church person link (can start now)

New table, new scope `links:write`, and `churchId` lookup.

```sql
CREATE TABLE public."ChurchPersonLink" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" uuid NOT NULL REFERENCES "ApiClient"(id),          -- which church system vouched for it
  "churchPersonId" text NOT NULL CHECK (char_length("churchPersonId") BETWEEN 1 AND 128),
  "participantId" uuid REFERENCES "Participant"(id) ON DELETE CASCADE,
  "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE,         -- FOF staff, for SSO later
  "linkedBy" text NOT NULL CHECK ("linkedBy" IN ('registration','lookup','admin','sso')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  CHECK (("participantId" IS NULL) <> ("userId" IS NULL))
);
-- One live link per church person per FOF person. A church person may link to several Participant rows
-- (one per cohort: a retake is a new Participant), so the unique key includes participantId.
CREATE UNIQUE INDEX ON "ChurchPersonLink" ("clientId", "churchPersonId", "participantId") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX ON "ChurchPersonLink" ("clientId", "churchPersonId", "userId") WHERE "revokedAt" IS NULL;
ALTER TABLE "ChurchPersonLink" ENABLE ROW LEVEL SECURITY;  -- no policies: functions only
```

Decision to confirm in phase 0: the link is per **client** (so a test client's links never mix with live ones). If the
church runs several systems sharing one person ID, add a `namespace` column instead of keying on `clientId`.

Endpoints:

| Call | Scope | Behaviour |
|---|---|---|
| `GET /v1/people/lookup?churchId=` | `people:lookup` | Matches through `ChurchPersonLink` first. Response adds `matchedBy: "churchId" \| "phone" \| "email"` per person. Existing `phone`/`email` behaviour unchanged |
| `PUT /v1/links/{churchPersonId}` body `{ "fofPersonId": "<participant id>" }` | `links:write` | Records a link after the church has confirmed a lookup match with the member. `201` new, `200` already linked, `409 link_conflict` if that FOF person is linked to another church ID |
| `DELETE /v1/links/{churchPersonId}` | `links:write` | Sets `revokedAt` (never a hard delete) |
| `GET /v1/people/{id}` | `people:read` | Adds `churchPersonId` when linked (additive field) |

Database functions: `api_link_put(p_client_id, p_church_id, p_participant_id)`, `api_link_revoke(...)`, and a
`p_church_id` argument on `api_people_lookup` (new overload or default parameter; keep the old signature working).
All `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC`, granted to `service_role` only (the edge
function calls them with the service key; `anon` must not reach them).

Edge function changes: allow `PUT`/`DELETE`/`POST`/`PATCH` methods server-side (route by method), keep CORS
`Allow-Methods: GET, OPTIONS`, and log the method in `ApiRequestLog` as today.

### 5.2 Phase 2: registration handshake, overview

```
church app                        church back end                     FOF
"Register for FOF" ─────────────► POST /v1/registrations ───────────► match or create; record a form-equivalent
                                  { churchPersonId, name, phone, … }    answer set; return status + missing[]
fills the missing fields ───────► PATCH /v1/registrations/{id} ──────► fill; when nothing is missing →
                                  { occupation, ageRange, … }           REGISTERED + Participant + login
shows "Your FOF login" ◄──────── { status: complete, login: {…} } ◄──
```

New scope `registrations:write`. New table to hold the conversation:

```sql
CREATE TABLE public."ApiRegistration" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" uuid NOT NULL REFERENCES "ApiClient"(id),
  "churchPersonId" text,
  "idempotencyKey" text,                          -- from the Idempotency-Key header
  status text NOT NULL DEFAULT 'needs_details'
    CHECK (status IN ('needs_details','complete','already_registered','rejected','expired')),
  fields jsonb NOT NULL DEFAULT '{}',             -- what the church sent, normalised (no secrets)
  "sheetRegistrationId" uuid REFERENCES "SheetRegistration"(id),
  "contactId" uuid REFERENCES "FollowUpContact"(id),
  "participantId" uuid REFERENCES "Participant"(id),
  "loginDeliveredAt" timestamptz,
  "rejectReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL DEFAULT now() + interval '14 days'
);
CREATE UNIQUE INDEX ON "ApiRegistration" ("clientId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
ALTER TABLE "ApiRegistration" ENABLE ROW LEVEL SECURITY;  -- no policies
```

And one column on `ApiClient`: `"isTest" boolean NOT NULL DEFAULT false`. A test client's registrations create
`isTest` contacts and participants, so they never show in counts, reminders or the API's own answers.

### 5.3 `POST /v1/registrations`

Headers: `Authorization`, `Content-Type: application/json`, `Idempotency-Key: <uuid>` (required; a retry with the
same key returns the first answer and does nothing else).

Request (all optional except `fullName`, `phone`, `consentAt`):

```json
{
  "churchPersonId": "C-12345",
  "fullName": "First Last",
  "phone": "08012345678",
  "email": "person@example.com",
  "gender": "Female",
  "dateOfBirth": "1995-04-12",
  "ageRange": "25 - 34",
  "occupation": "Teacher",
  "departments": ["Choir"],
  "smartRequest": "…",
  "howHeard": "Church app",
  "commitment": true,
  "photoUrl": "https://…",
  "guardian": { "fullName": "…", "phone": "…", "consentAt": "2026-11-20T10:00:00Z" },
  "consentAt": "2026-11-20T10:00:00Z"
}
```

Validation (400 `bad_request` with `error.fields: { field: message }`):
- `phone` must pass `fof_phone_key`; `gender` ∈ `Male`/`Female`; `dateOfBirth` a real date, age 10 to 100;
  `ageRange` one of the form's brackets (read the list from `fill_profile_from_form`, do not hard-code a second copy);
  `photoUrl` https only; text fields trimmed, max 500 chars (`smartRequest` 2000).
- If both `dateOfBirth` and `ageRange` are given and disagree, `dateOfBirth` wins.

Processing, in one database transaction where possible:

1. **Idempotency:** same `(clientId, Idempotency-Key)` → return the stored response.
2. **Is registration open?** Target cohort is `current_programme_cohort_id()`. If there is none, `409 registration_closed`
   with `nextCohort` from `api_cohorts_current`. (Confirm with the owner whether late sign-ups go to the next cohort.)
3. **Match**, in this order, and stop at the first hit:
   1. `ChurchPersonLink` for this client and `churchPersonId` → that participant. If they are in the target cohort,
      status `already_registered`.
   2. Phone, using **the same rules as the form** (rule 3, rule 91, the teen same-name rule, the gender check, the
      "shorter name is a prefix" claim). Do not re-implement them: move `normalisePhone`, `isBelow18`,
      `guardianFromAnswers`, `nameKey`, `namesOverlap`, `findContact`, `signedUpOnSameNumber` and `upsertParticipant`
      from `receive-form-registration/index.ts` into `supabase/functions/_shared/registration.ts`, import them in
      both functions, and redeploy `receive-form-registration` unchanged in behaviour (check with its `dryRun` flag
      against a few recent rows before and after).
   3. Email, only to **suggest** (`possibleMatch` in the response); never auto-link on email alone.
4. **Record the form-equivalent:** insert a `SheetRegistration` with `sheetRowKey = 'api:' || ApiRegistration.id`,
   `answers` built with the **form keys in section 2.2** plus `"Added in the app by": "<client name> (church app)"`
   (the rule 95 pattern), so rule 1 holds and `fill_profile_from_form` fills the profile with no new code.
5. **Work out what is missing** (section 5.5). If something is missing: create or update the `FollowUpContact` as the
   form does, but leave `registrationStatus` as it was (do not mark REGISTERED yet); status `needs_details`.
6. If nothing is missing: continue as `PATCH` step 3 (complete).
7. Link: insert `ChurchPersonLink` (`linkedBy = 'registration'`) once a participant exists.
8. Tell admins as the form does ("New sign-up from the church app"), not per retry.

Response `201` (or `200` for an idempotent repeat):

```json
{
  "registrationId": "uuid",
  "status": "needs_details",
  "fofPersonId": null,
  "cohort": { "id": "uuid", "name": "FOF 11", "startDate": "2026-12-06" },
  "missing": [
    { "field": "occupation", "label": "What's your occupation?", "type": "text", "required": true },
    { "field": "ageRange", "label": "Age range", "type": "choice", "options": ["10 - 17", "18 - 24", "…"], "required": true }
  ],
  "possibleMatch": null,
  "expiresAt": "2026-12-04T10:00:00Z"
}
```

`missing[].options` comes from the database (the form's brackets), so the church app renders whatever FOF asks for
without a release when FOF adds a question.

### 5.4 `PATCH /v1/registrations/{id}` and `GET /v1/registrations/{id}`

- `PATCH` takes any subset of the POST fields. Same validation. Only the client that created the registration may
  touch it (`404` otherwise, never `403`, so IDs cannot be probed). `409 registration_expired` after `expiresAt`.
- When nothing is missing:
  1. Update the `SheetRegistration.answers` with the new fields and run `fill_profile_from_form`.
  2. Mark the contact `REGISTERED` and upsert the `Participant` exactly as the form's matched branch does.
  3. Issue or reuse the login (section 5.6).
  4. Status `complete`; return the login block once. `loginDeliveredAt` is set; a later `GET` returns
     `login: { username, signInUrl, issued: true }` without the code.
- `GET` returns the same shape as the last answer (minus the code), for the church app to resume.

Completed response:

```json
{
  "registrationId": "uuid",
  "status": "complete",
  "fofPersonId": "uuid",
  "cohort": { "id": "uuid", "name": "FOF 11", "startDate": "2026-12-06" },
  "missing": [],
  "login": {
    "username": "08012345678",
    "accessCode": "FOF-ABC234",
    "signInUrl": "https://<fof site>/login",
    "mustChangePassword": true,
    "sharedNumber": false,
    "deliveredBy": ["church_app"]
  }
}
```

### 5.5 What counts as missing

Keep the list in one database function, `api_registration_missing(p_registration_id) RETURNS jsonb`, so FOF can change
it without touching the church app.

| Field | Adults | Teens (`10 - 17`) |
|---|---|---|
| `fullName`, `phone`, `consentAt` | required (400 if absent) | required |
| `gender` | required | required |
| `ageRange` or `dateOfBirth` | required | required |
| `occupation` | required | not asked |
| `commitment` (must be `true`) | required | required |
| `guardian.fullName`, `guardian.phone`, `guardian.consentAt` | not asked | required |
| `email`, `departments`, `smartRequest`, `howHeard`, `photoUrl` | optional, offered | optional |

Confirm against the live Google Form which of these it marks required, and match it.

### 5.6 Login delivery

`participant_login_details` needs a staff session, so add a service-only sibling rather than loosening it:

`api_issue_participant_login(p_client_id uuid, p_participant_id uuid) RETURNS jsonb`
- Same body as the issue branch of `participant_login_details` (rule 91 shared-number join; code `FOF-` + 6 chars
  from the same alphabet; `mustChangePassword`; `issuedById` NULL, which the column allows) and the password guard
  (rule 133) is untouched because no password is set here. Factor the shared part into one internal function used by
  both, so the two never drift.
- Moves the contact to `LOGIN_SHARED` (rule 1 is satisfied by the API's `SheetRegistration`).
- Returns:
  - new login → `{ username, accessCode, mustChangePassword: true, sharedNumber: false }`;
  - number already has a login with a waiting code → the same code, `sharedNumber: true`;
  - number already has a login with a password set → **no code**: `{ username, accessCode: null, sharedNumber: true,
    hint: "Use the password already set for this number" }`. Never reset another person's login from the API.
- **Teens:** never return a login to the church app. Status `complete` with `login: null` and
  `nextStep: "A Teen Support will contact the parent or guardian"`; the teen goes the normal teen route
  (`TEENAGER`, guardian consent from the API's `guardian.consentAt`, `assign_teen_contacts`). Revisit only after Q6.
- The support who owns the contact sees "Login shared through the church app" on the card instead of an
  "issue login" task (small frontend change in the follow-up card; check `LoginDetailsCard.tsx`).
- Email delivery later: add `"email"` to `deliveredBy`; the shape does not change.

### 5.7 Errors added

| HTTP | code | When |
|---|---|---|
| 400 | `bad_request` | Validation; `error.fields` lists each problem |
| 400 | `missing_idempotency_key` | POST without the header |
| 404 | `not_found` | Unknown registration or not this client's |
| 409 | `registration_closed` | No cohort taking sign-ups |
| 409 | `registration_expired` | PATCH after `expiresAt` |
| 409 | `link_conflict` | That FOF person is linked to a different church ID |
| 422 | `cannot_register` | A rule refused it (e.g. same name twice on a number); `message` says which, in plain words |

---

## 6. Later phases

### 6.1 Phase 3 (optional): finish-your-profile link

Only if the church app does not want to render `missing[]` itself. `POST /v1/registrations/{id}/link` returns a
one-time URL (`/join/<token>`, token hashed in the DB, 24 h, single use) that opens a FOF page asking only the missing
questions, then shows the login. Reuse the three-step layout of `ParticipantAddPersonPage.tsx`. Public route; rate-limit
by token.

### 6.2 Phase 4: more read for the church

Additive read endpoints once Q8 is answered, for example:
- `GET /v1/people/{id}/departments` (`DepartmentReferral`: `department`, `status`, `loggedAt`, `joinedAt`; no notes),
  scope `people:read`.
- `GET /v1/people/{id}/programme` already gives finished or not; add `completedAt` if the church needs a date.

### 6.3 Phase 5 (optional): webhooks to the church

- Table `ApiWebhook(clientId, url, secretHash, events text[], isActive)`; delivery log `ApiWebhookDelivery`.
- Events: `registration.completed`, `participant.finished`, `participant.moved_cohort`, `department.joined`.
- Sender: an edge function called by `pg_net` from triggers, or a 5-minute cron that drains an outbox table
  (preferred: `ApiOutbox`, retried with backoff, never blocking the user's action). Sign each body with
  HMAC-SHA256 in `X-FOF-Signature`; include `id` and `occurredAt` so the church can de-duplicate.
- Payloads carry IDs and states only; the church calls back for details with its key.

### 6.4 Phase 5b (optional): FOF calls the church API (G6)

When someone signs up on the Google Form, look them up in the church by phone (with consent the form asks for) and
prefill gender, date of birth and department, and store the `ChurchPersonLink`. Lives in `receive-form-registration`
behind an `AppSetting` switch; the church key is an edge-function secret (`CHURCH_API_KEY`), never in the database.
Fail open: if the church API is down, the sign-up goes through as today.

### 6.5 Phase 6: single sign-on (OpenID Connect)

FOF is the relying party; the church sign-in is the provider. Nothing to build until Q9 is answered.

- New edge function `oidc-callback`: authorization code flow with PKCE; validates the ID token (issuer, audience,
  signature from the provider's JWKS, expiry, nonce).
- Find the FOF person through `ChurchPersonLink` on the token's `sub` (`linkedBy = 'sso'` for links made at first
  sign-in, which need a one-time confirm: sign in with the FOF password once, or match on a verified phone claim).
- Create an `AppSession` exactly as `sign_in_check` does today (token hash, `x-session-token`), so the rest of the app
  is unchanged. The session is for that one person: no "Who is using the app now?" picker (rule 91), because the
  church sign-in already says who it is.
- Staff (`User`) can link the same way later; admins keep FOF passwords as a fallback.
- FOF's own sign-in stays until every active person is linked; then decide with the owner.
- Teens: follow the church's under-18 sign-in rules (Q6, Q9).

### 6.6 Phase 7 (not decided): shared PostgreSQL hosting

See `church-platform-portability.md`, Option 2. The API above stays the contract either way: other systems read FOF
through the API or read-only views, never the tables.

---

## 7. Implementation notes

- **Where the code goes:** new routes in `public-api/index.ts` (route by `req.method` + path), helpers in
  `supabase/functions/_shared/registration.ts`, SQL in one migration per phase
  (`<timestamp>_api_church_link.sql`, `<timestamp>_api_registrations.sql`).
- **Scopes** are free text in `ApiClient.scopes`; add `links:write` and `registrations:write` to the admin screen's
  scope picker (Church app access) with one-line explanations, and to the OpenAPI `securitySchemes` description.
- **Request size:** reject bodies over 32 KB.
- **Timezone:** dates are Lagos (`Africa/Lagos`), as in the rest of the app.
- **Admin visibility:** Church app access → a client's ⋯ menu gets "Registrations" (recent `ApiRegistration` rows with
  status). Follow-ups shows `source = 'Church app'` on contacts created this way.
- **Analytics:** count API registrations in PostHog or the `analytics` schema only after the owner asks.
- **Docs page:** update `info.description` in `openapi.json` (guide text) with the handshake walkthrough and examples.

---

## 8. Security and privacy

- Keys live in the church **back end**; FOF never enables browser writes (CORS stays GET-only).
- Least privilege: a client gets only the scopes it needs; test and live are separate clients; `isTest` on the
  test client.
- Every request is logged (`ApiRequestLog`), including teen records shown.
- **Never shared through the API:** passwords or hashes, access codes after first delivery, reflections, notes,
  private messages, prayer wall posts, faith project details without `faith:read`, guardian details without
  `teens:read`, call links, other people's data on a shared number.
- **Never accepted from the API:** roles, cohort or group placement, support assignment, attendance. Registration only.
- Teen data: guardian consent required; logins never returned (section 5.6) until the church's rules (Q6) are agreed.
- Consent: store `consentAt` from the church in `ApiRegistration.fields`; refuse a registration without it.
- Data protection (NDPA 2023): record in the decisions log who the controller is and the retention for
  `ApiRegistration` (proposal: delete `fields` 90 days after `complete`, keep the row).
- Idempotency keys and IDs are random UUIDs; unknown IDs answer `404`.

---

## 9. Testing and rollout

**Database:** for each migration, a rolled-back transaction test (`BEGIN; <migration>; DO $t$ … RAISE EXCEPTION
'RESULT …' $t$; ROLLBACK;`) covering: new person, phone match, link match, teen, shared number with a password set,
same name twice (refused), idempotent retry, expired registration, a second client cannot read the first one's
registration.

**Edge function:** a script in `scripts/api-smoke.sh` (to write) that uses a **test client** key from the environment
(never committed) and runs: health → lookup → POST (needs_details) → PATCH (complete) → GET → lookup by `churchId`.
Every person it creates is `isTest`; it prints their IDs so they can be cleaned up with the owner's approval.

**Form path unchanged:** before and after moving the matching code to `_shared/`, run `receive-form-registration` with
`dryRun: true` on a handful of recent payloads and compare the `wouldDo` text.

**App:** Playwright as an admin (test admin account): Church app access shows the new scopes and the Registrations
list; a support's follow-up card shows "Login shared through the church app".

**Rollout:**
1. Deploy with the routes behind the scope (no live client has it).
2. Give the church a **test** client with `registrations:write`; they build against it.
3. Owner reviews a handful of test registrations end to end.
4. Live client with the new scope, on a weekday, not in the week a cohort starts.
5. Watch `ApiRequestLog` errors and the admin alerts for a week.

---

## 10. Decisions log

Add a dated line for every answer from phase 0 and every design choice made while building.

| Date | Decision | Source |
|---|---|---|
| 2026-10-29 | Connect through APIs now; single sign-on long term; shared database not decided | Church meeting; `church-platform-portability.md` |
| 2026-10-29 | Matching order: church ID, then phone, then email | Same |
| 2026-10-29 | Login shown in the church app; later also emailed | Same; `docs/api/README.md` |
| 2026-11-05 | API registrations write a `SheetRegistration` with form keys so rule 1 and `fill_profile_from_form` apply unchanged | This spec (proposal; confirm when building) |
| 2026-11-05 | Teens: no login returned to the church app until Q6 is agreed | This spec (proposal) |

---

## 11. Status checklist

- [x] API v1.0: keys, scopes, logging, rate limit, lookup, person, programme, cohorts (29 Oct)
- [x] API v1.1: teens scope, attendance, faith project, team, groups, hubs, weeks, schedule, planner, content, birthdays
- [x] Admin screen: Church app access
- [x] OpenAPI 3.1 + docs page + `llms.txt`
- [ ] **Phase 0:** answers to Q1 to Q10 recorded in section 10
- [ ] **Phase 1:** `ChurchPersonLink`, `links:write`, `PUT/DELETE /v1/links/{churchPersonId}`, `churchId` lookup, non-GET routing
- [ ] **Phase 2a:** move form matching into `_shared/registration.ts`; `receive-form-registration` unchanged (dry-run compared)
- [ ] **Phase 2b:** `ApiRegistration`, `ApiClient.isTest`, `api_registration_missing`, `api_issue_participant_login` (shared with `participant_login_details`)
- [ ] **Phase 2c:** `POST/PATCH/GET /v1/registrations`, errors, idempotency, OpenAPI, docs page, FLOW_MAP rule
- [ ] **Phase 2d:** admin Registrations list; follow-up card "Login shared through the church app"; smoke script
- [ ] **Phase 2e:** church test client live; owner sign-off; live client
- [ ] Phase 3 (optional): finish-your-profile link
- [ ] Phase 4: department and completion read endpoints (after Q8)
- [ ] Phase 5 (optional): webhooks via outbox
- [ ] Phase 5b (optional): FOF prefills from the church API
- [ ] Phase 6: single sign-on (after Q9)

---

## 12. File map

| Topic | Files |
|---|---|
| API code and description | `supabase/functions/public-api/index.ts`, `openapi.json` |
| API docs | `docs/api/README.md`, `frontend/public/api-docs.html`, `frontend/public/llms.txt` |
| API database | `supabase/migrations/20261029120000_public_api_foundation.sql` and later `*api*` migrations; `docs/schema/SCHEMA.md` → "Public API" |
| Admin screen | `frontend/src/services/apiAccess.ts` and the page that imports it (Administration → Church app access) |
| Form sign-ups | `integrations/`, `supabase/functions/receive-form-registration/index.ts`, `fill_profile_from_form`, `run_followup_assignment` |
| Logins | `participant_login_details`, `shared_number_people`, `sign_in_check`, `LoginDetailsCard.tsx` |
| Household / add on number (pattern to copy) | `supabase/migrations/20261022150000_add_on_this_number.sql`, `ParticipantAddPersonPage.tsx` |
| Rules | `FLOW_MAP.md` section 4: 1, 3, 67, 91, 95, 118, 129, 133 |
| Decision background | `docs/specs/church-platform-portability.md` |
