# FOF Ops Flow Map

**What this is:** the logic map of the whole platform. Read this before changing
anything, so a fix in one place does not silently break another. If you add a
rule, register it in section 4 and link the migration or function.

**What this is not:** user docs, API reference, or a copy of AGENTS.md. The
repo conventions (shells, dropdowns, portals, export scopes, verification,
push rules) live in `AGENTS.md` and still apply.

## 1. Roles and entry points

Three roles (`frontend/src/types/index.ts:64`): `ADMIN`, `SUPPORT`, `PARTICIPANT`.
Staff can hold two roles and switch (`hooks/useAuth.tsx:129-134`).

| Who | Shell | Routes |
|---|---|---|
| Participant | `components/participantApp/ParticipantShell.tsx` (own nav: Home, Group, Journey, Faith, more: People, Resources, Feedback, Profile) | `/me/*`, plus `/me/welcome` and `/me/setup` standalone |
| Support | `components/StaffApp.tsx` + `AppShell.tsx` | `/support`, `/support/schedule`, `/support/mobilisation`, `/support/participants`, `/support/my-hub`, `/support/attendance`, `/support/onboarding`, `/support/community`, `/support/practice`, `/support/resources`, `/support/profile`, `/support/recap` |
| Admin | same staff shell | `/`, `/dashboard`, `/schedule`, `/planner`, `/participants*`, `/groups`, `/supports`, `/hubs`, `/cohorts`, `/approvals`, `/users`, `/announcements`, `/resources`, `/settings`, plus all support pages |

Guards: `components/ProtectedRoute.tsx:25-53` splits staff vs participant
audiences only. There is **no per-role route guard**; the split inside staff
pages is done in-shell (`AppShell.tsx:214` adminOnly, hub visibility flags,
`hooks/useAuth.tsx:312` isAdmin). Admin mobile nav is limited to Dashboard,
Schedule, Participants, Supports, Community. Support mobile nav is Home,
Mobilisation, Schedule, Group, with the rest under More. Do not widen these
without admin sign-off.

## 2. Data model (migrations are truth, not `supabase-schema.sql`)

`supabase-schema.sql` is stale. The 230+ files in `supabase/migrations/` are
the real schema. Key tables:

- `"User"`: staff accounts. `ParticipantAccount`: participant credentials,
  keyed by `participantId`, deliberately separate from `User`.
- `"Cohort"`: everything hangs off a cohort (weeks, groups, contacts,
  participants, hubs). `UserCohort`: staff membership plus support kind.
- `"SheetRegistration"`: one row per Google Form submission (`contactId`
  links it to a contact; outcome PENDING/MATCHED/CREATED/DUPLICATE/FAILED).
- `"FollowUpContact"`: the prospect pipeline. Owner, cohort, who registered
  them. Status lives in four columns, not one (see below).
- `"Participant"`: the enrolled person, `followUpContactId` back to the
  prospect. Groups via `GroupParticipant`.
- `"Group"`, `"SupportHub"`/`"HubMembership"`: per-cohort groups and hubs.
- `"Announcement"`/`"Notification"`, `"Resource"`, attendance and faith
  tables, `FaithProject`.

Follow-up status is four columns (`types/index.ts:401-406`):
reply (NO_REPLY/REPLIED/NEEDS_REMINDER/INCORRECT_NUMBER), call
(NOT_CALLED/CALLED/MISSED_CALL/CALL_BACK_LATER/NOT_APPLICABLE/INCORRECT_NUMBER),
registration (NOT_REGISTERED/PENDING_CONFIRMATION/REGISTERED/STILL_THINKING/
NOT_INTERESTED/NOT_A_TCN_MEMBER/NOT_A_GOOD_TIME/NO_RESPONSE/NEXT_COHORT/
LOGIN_SHARED/LOGIN_ISSUE/ACCESS_CONFIRMED/ATTENDED), nextAction
(SEND_MESSAGE/SEND_REMINDER/CALL/CLOSE). `FollowUpStatus` is a
frontend-derived display label (`computeFollowUpStatus`), never write to it.

Test flags: `isTest` on User, FollowUpContact, Participant. Test rows work
normally but are excluded from assignment, counts, exports, and cohort
health. Only admins flip them (`set_user_test`).

## 3. Journeys

**Prospect to class seat:** Google Form (or a support adding them by hand) ->
`receive-form-registration` matches by phone to a contact or creates an
unowned one -> auto-assignment (same-gender support with room) -> support
calls/messages through reply/call stages -> REGISTERED needs a form on file
(section 4, rule 1) -> support shares the login (LOGIN_SHARED) -> participant
sets a password (ACCESS_CONFIRMED, closes the loop, archives the contact).

**Retakers and misfiles:** a returning person gets a fresh record on the
current cohort, never revives the old one. The single current-cohort rule is
DB-owned; frontend, assignment, and reminders all consume it.

**Support loop:** Mobilisation (prospects plus form sign-ups), My Schedule,
group meetings with recaps, onboarding checklist, hub, attendance. Login-share
reminder nudges them about codes they made but never marked sent.

**Admin loop:** dashboard cohort health, Follow-ups (assign, approve, message
bank, issues), Participants, Groups engine, Supports, Hubs, Announcements
(with popups), Rota, Planner, Settings (programme rules).

## 4. Rules that bite

Numbered so reviews and commits can cite them. Each has a source of truth;
duplicating the logic anywhere else is a bug waiting to happen.

1. **No form, no progress.** Moving a contact into REGISTERED, LOGIN_SHARED,
   or ACCESS_CONFIRMED requires a linked SheetRegistration (or an unlinked
   one from the last 15 minutes on the same number). Otherwise the database
   raises `NO_FORM_REGISTRATION`. Admin override only, with a written reason
   (`approve_manual_registration`). Grandfathering is structural: the trigger
   fires on the change, never on existing rows.
   Source: `supabase/migrations/20261004190000_form_registration_gate.sql`.
   Frontend: `NO_FORM_MESSAGE`/`isNoFormRegistrationError` in
   `frontend/src/utils/followUps.ts`.
2. **Single current cohort.** One DB-owned definition of the current cohort;
   consumed by frontend scope, assignment, and reminders. Do not re-derive it.
3. **One phone per cohort, two exceptions.** `uniq_participant_phone_per_cohort`
   exempts two named rows (Funmilayo Ewayenikan / Jeremiah Williams, who
   share a number and an email) and every participant aged "18 and below":
   teens may share a number, usually a parent's
   (`20261006170000_teens_share_phone_and_abimbola.sql`). Sign-in tries the password across every
   same-number row, newest cohort first. Never add email login: duplicate
   emails exist. Source: `20261004180000_shared_phone_signin.sql`.
4. **Same-gender assignment with a load cap.** Unassigned contacts go to a
   same-gender support with room, introducer first, then fewest open. Cap
   comes from programme rules (`maxFollowUpsPerSupport`). Quiet supports
   (nothing seen in 7 days) and unknown-gender contacts stay waiting.
   Frontend mirrors are read-only (`openLoadByOwner`, `genderCapacityOutlook`).
5. **Closed means closed.** ACCESS_CONFIRMED archives on first password set
   (trigger notifies). LOGIN_SHARED no longer closes. ATTENDED closes
   prior-cohort filers. NEXT_COHORT moves fresh. Never hand-edit these
   transitions; use `buildStatusPatch`.
6. **Open issues freeze moves.** Contacts with an OPEN issue are skipped by
   sweeps and cannot be moved to the next cohort.
   Source: `20261002300000_followup_related_contacts.sql`,
   `20261002310000_followup_no_move_with_open_issue.sql`.
7. **Phone normalisation.** Nigerian mobiles normalise to 11-digit 080 form
   on write (`trg_*_local_phone`). Invalid numbers are held back from
   assignment, never dropped. Search normalises 234 to 0
   (`contactMatchesSearch`).
8. **Form wording maps to app buckets.** "Below 18" becomes "18 and below";
   only blank profile fields are ever filled, never overwrites. The same
   allow-list lives in `fill_profile_from_form` and the contact backfill;
   change both. Source: `20261005120000_form_age_below_18.sql`.
   Exception: a believable date of birth (age 5 to 100) sets the age range
   itself, for participants always and for supports once a birth year is
   added; the date wins over a typed range. Placeholder years like 1904 are
   ignored. Source: `20261006150000_age_from_birth_and_participant_theme.sql`
   (`trg_participant_age_from_dob`, `trg_user_age_from_birth_year`).
9. **Passwords.** Participants: minimum 5, client and RPC
   (`set_participant_password`, `change_participant_password`). Staff:
   minimum 8. New codes sign the holder out; send the code immediately.
10. **Notifications fan out two ways.** Most edge functions write an in-app
    row (`insertNotifications`) and push via `sendToSubscriptions`. Keep both
    or the bell and the phone disagree.
11. **Database closed by default.** Staff tables sit behind RLS with no open
    policies; every write path is a `SECURITY DEFINER` RPC that resolves
    staff from `p_token` (`app_staff`) and raises `SESSION_EXPIRED` or
    `NOT_ALLOWED` otherwise. New tables are born locked, service-role RPCs
    only, test-flag aware from day one.
12. **Attendance windows shut themselves.** The per-minute cron closes Sunday
    and meeting windows; late counts as missed unless an admin excuses it,
    and records lock after close (`attendance_record_lock`). Never
    back-date attendance around a closed window.
13. **Deleting a support hands over first.** Group support links clear and
    follow-ups hand over before a user row can go
    (`user_clear_group_support_before_delete`, support-delete handover
    order). Handover notes are written by triggers on group membership
    changes, not by hand.
14. **Practice never mixes with live.** Practice cohorts and the ZZ Demo
    rows are flagged and excluded from assignment, counts, and reminders
    exactly like test rows. Resetting practice must not touch live data.
15. **Writes fan out inside the database too.** Post, reply, and report
    alerts, hub role assignments, retake notes, and the access-confirmed
    close are triggers, not UI code. Before editing any of these flows,
    read the trigger first; the edge function is only half the story.
16. **A support is `role = SUPPORT` or `roles` contains SUPPORT.** Admins who
    carry the Support tag lead groups and own follow-ups, so every list,
    count and job that means "supports" must include them. Frontend:
    `hasSupportRole` in `frontend/src/utils/people.ts`. Database and
    `push-reminders` use the same test. Source:
    `20261006120000_admin_support_tag_in_jobs.sql`.
17. **Support tags are strict in the group builder.** A group made only of
    people a tag rule is for (age range and/or gender) takes only supports on
    that tag, and is left without a support (and says so) when they run out.
    Untagged supports never take such a group; a tagged support is a last
    resort for a regular group. Tags and rules: `SupportTag`/`SupportTagMember`
    (written only by `support_tag_*` RPCs), `tagRules` in the cohort's grouping
    rules, `supportCost`/`groupTagRule` in `frontend/src/utils/groupingEngine.ts`.
    A tag may carry its own smallest/aim/largest group size (`rulesForTag`);
    without one its groups use the cohort's sizes.
    Source: `20261006130000_support_tags.sql`.
18. **A support's kind follows the hub roles.** The lead of a hub is HUB_LEAD
    and an IT support is OPERATIONAL in that hub's cohort (triggers on
    `SupportHub.leadUserId` and `HubItSupport`); only a PARTICIPANT_SUPPORT
    is ever moved, so a kind chosen by hand stays. The builder and the Supports
    page read `UserCohort.supportKind`; never keep a second list of hub leads.
    Source: `20261006140000_support_kind_follows_hub_roles.sql`.
19. **Teens are looked after by Teen Supports, off the app.** A registered
    contact whose age is "18 and below" becomes TEENAGER (then TEEN_ONBOARDED)
    inside `fill_profile_from_form`, only while `AppSetting.teen_flow_enabled`
    is true (off until teen assignment and groups exist). Adult assignment,
    reassignment, stale sweeps and load counts skip both teen statuses, and the
    form gate (rule 1) treats them like REGISTERED. The Teen Support tag is built
    in (`SupportTag.systemKey = 'TEEN_SUPPORT'`): it cannot be renamed or
    deleted, and it replaced the old "Teen" tag in place so group rules keep
    their id. Source: `20261006160000_teen_status_values.sql`,
    `20261006161000_teen_support_tag.sql`.

## 5. Edge functions and schedules

All functions authenticate with the session token (`x-session-token`) or the
form secret, never bare anon access.

| Function | Job |
|---|---|
| `receive-form-registration` | Form/Apps Script intake; match-or-create contact; fill profile; admin alert |
| `run-followup-assignment` | 2h auto-assign plus 24h quiet-support reassignment sweep |
| `push-reminders` | 10-minute meeting, participant, and follow-up nudges (Africa/Lagos) |
| `daily-checks` | Daily nudges (reports, attendance, escalations); runs via cron-job.org with `CRON_SECRET`, not pg_cron |
| `send-announcement` | Admin broadcast with audience, scope, hub, and group filters; popup acks |
| `notify-users` | Generic sender (userIds, role plus cohort, participantIds) |
| `notify-followup-*` (4) | Assignment, issues, terminal states (LOGIN_ISSUE also pages hub IT), completions |
| `notify-hub`, `notify-onboarding-event`, `notify-faith-project-*` (2) | Hub mentions/threads, onboarding events, faith project reviews |
| `sync-lead-to-sheet` | Push a contact back to the Google Sheet; records sync state |
| `refresh-public-holidays` | Nigerian holidays feed into the Planner |
| `ai-assist` | Participant summaries, recap drafts, feedback and survey themes |

pg_cron: `push_reminders_every_10min`, `followup_assignment_every_10min`,
`close_attendance_windows_every_minute`, fortnightly holidays, nightly log
cleanup, noon Sunday finalise.

## 6. Auth and sessions

`sign_in` tries staff `login_user` first, then participant rows. Sessions are
opaque tokens hashed in `AppSession` (~12h). The frontend sends the token as
`p_token` to every RPC and as `x-session-token` to functions
(`getSessionToken` in `services/supabase-api.ts`). `participant_login_details`
gates who may view or issue codes (admin, own support, cover, hub IT). First
codes and new codes both funnel through it; the login card's
`fetchLoginDetails` retries then self-repairs a missing participant record.

## 7. Safe-change checklist

- New rule? Register it in section 4 with its source file.
- Touching follow-up status? Go through `buildStatusPatch`; check rules 1,
  5, 6 first.
- Touching assignment, cohorts, phones, or ages? Re-read rules 2, 3, 4, 7, 8.
  The frontend mirrors are read-only; the database decides.
- New table? Born locked (no open RLS), service-role RPCs only, test-flag
  aware from day one.
- New notification? Both channels (rule 10), dedupe keys, role-scoped
  recipients.
- Verify per AGENTS.md: frontend `npm run build`, browser pass as the role
  that uses the feature, `git diff --check`, no stray artifacts.
