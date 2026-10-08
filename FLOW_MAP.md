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
   one from the last 15 minutes on the same number, by phone key or, for a
   mistyped number with no key, by the same raw text). Otherwise the database
   raises `NO_FORM_REGISTRATION`. Admin override only, with a written reason
   (`approve_manual_registration`). Grandfathering is structural: the trigger
   fires on the change, never on existing rows.
   Source: `supabase/migrations/20261004190000_form_registration_gate.sql`,
   `20261006161000_teen_support_tag.sql`, `20261008010000_form_gate_accepts_unkeyed_number.sql`.
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
8. **Form wording maps to app buckets.** "18 and below" (and the older
   "Below 18", or "18 & below") becomes "18 and below"; the older "18 - 24"
   (or "18-24") becomes "19 - 24";
   only blank profile fields are ever filled, never overwrites. The same
   allow-list lives in `fill_profile_from_form` and the contact backfill;
   change both, and `isBelow18` in `receive-form-registration`. Source:
   `20261005120000_form_age_below_18.sql`, `20261007220000_form_age_new_wording.sql`,
   `20261007240000_age_bucket_19_24.sql` (the bucket was "18 - 24" before).
   `fill_profile_from_form` fills the follow-up contact (gender, age, occupation,
   email, who registered them) as well as the participant; the same-gender rule
   (4) needs the contact's gender, so a rewrite must keep both. Source:
   `20261008000000_restore_contact_profile_fill.sql`.
   Exception: a believable date of birth (age 5 to 100) sets the age range
   itself (18 and under is "18 and below", 19 to 24 is "19 - 24"), for participants always and for supports once a birth year is
   added; the date wins over a typed range. Placeholder years like 1904 are
   ignored. Source: `20261006150000_age_from_birth_and_participant_theme.sql`,
   `20261007230000_age_18_is_teen.sql`
   (`trg_participant_age_from_dob`, `trg_user_age_from_birth_year`).
   The concerns answer shown on a card comes from "Any Other Questions or
   Concerns?" or, for teens, the parent section's "Any Other Questions or
   Concerns (Parent or Guardian)" (`form_question_text`,
   `20261007250000_form_question_parent_section.sql`).
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
19. **Teens are looked after by Teen Supports, off the app.** The Assign support
    and New/Edit group pickers on the Groups page leave out Teen Supports, hub
    leads and operational supports, inactive or out-of-cohort users and anyone
    already leading another group or below the minimum pre-cohort trainings
    (`supportsFor` in `AdminGroupsPage.tsx`).
    A registered
    contact whose age is "18 and below" becomes TEENAGER (then TEEN_ONBOARDED)
    inside `fill_profile_from_form`, only while `AppSetting.teen_flow_enabled`
    is true (off until teen assignment and groups exist). Adult assignment,
    reassignment, stale sweeps and load counts skip both teen statuses, and the
    form gate (rule 1) treats them like REGISTERED. The Teen Support tag is built
    in (`SupportTag.systemKey = 'TEEN_SUPPORT'`): it cannot be renamed or
    deleted, and it replaced the old "Teen" tag in place so group rules keep
    their id. A teen who fills the form while an adult support already holds them
    is released from that support (who is told on the bell) so a Teen Support can
    take them; adult forms never take over a teen's contact on a shared phone.
    Source: `20261006160000_teen_status_values.sql`,
    `20261006161000_teen_support_tag.sql`, `20261006200000_teen_form_owner_handover.sql`.
20. **Teens go only to a same-gender Teen Support, one each, up to a limit.**
    `assign_teen_contacts` (read by the 10-minute `run-followup-assignment`, the
    admin "Assign now", and `teen_add_prospect`) gives an unowned TEENAGER to a
    same-gender Teen Support with room, fewest teens first. This is a hard rule:
    there is no opposite-gender fallback. If none has room the teen waits and
    admins are told. The limit is `programme_rules.maxTeensPerTeenSupport`
    (default 4) and counts every teen a support holds, onboarded or not. A teen
    who has a support is never moved automatically. A "Below 18" form on a phone
    that already has a contact with a different name (words compared in any
    order, `fof_name_key`) is a new person, not a correction. Source:
    `20261006180000_teen_assignment.sql`.
21. **Admin tasks on a support's checklist are the admin's.** A
    `SupportChecklistItem` with `createdById` set and different from `userId` was
    put there by an admin (`admin_add_checklist_task`, from Schedule `⋮`). Through
    the app a support may only tick it and write a note (`done`, `completionNote`,
    `completedAt`); renaming, moving, changing the due day and deleting are blocked
    by `support_checklist_admin_task_guard` (it checks `current_user`, so it is
    SECURITY INVOKER; the admin RPCs run as owner and pass). Supports are resolved
    when the task is added: people who join later do not get it. Source:
    `20261006210000_support_admin_checklist_tasks.sql`.
22. **A teen's group follows who holds them.** `Group.isTeenGroup` marks a Teen
    Support's group ("Teens - <name>"). `teen_group_sync` (triggers on
    `FollowUpContact` owner/status/archive/cohort and on `Participant.followUpContactId`)
    keeps the linked participant in exactly one group, the owner's teen group (leaving any adult group), while the
    contact is TEENAGER / TEEN_ONBOARDED, owned and not archived; out of all of them
    otherwise. Teen groups never have meetings, recaps, prayer or onboarding:
    `groupsApi.getAll` (unless `includeTeenGroups`), `getForSupport` and
    `resolveSupportScopedGroups` leave them out. A Teen Support's Attendance page
    lists only their teens (switch for everyone). Source:
    `20261007100000_teen_groups.sql`, `20261007120000_teen_group_sync_fixes.sql`.
23. **A teen can only be handed to a same-gender Teen Support, by anyone.**
    `teen_owner_guard` rejects any owner change on a teen to someone who is not a
    Teen Support of the teen's gender (clearing the owner is allowed); editing a held teen's gender is checked the same way (`20261007130000_teen_owner_guard_gender.sql`). Admin "This
    person is not a teen" returns the contact to REGISTERED with no owner. Source:
    `20261007110000_teen_owner_guard.sql`. The Follow-ups pickers match it: a teen's
    row dropdown and "Assign a support" list (and bulk assign when every selected
    contact is a teen) offer only Unassigned, the current holder and same-gender Teen
    Supports (`canTakeTeen`, `useTeenSupportIds`; a mixed-gender teen batch offers
    nobody). Teens with no Teen Support count in the Capacity card's "Waiting to be
    assigned" and in the "Assign now" count (`isTeenWaitingForSupport`), because
    `assign_followups_now` also runs `assign_teen_contacts`.
24. **Switching teen handling on for the first time moves the existing teens.** The
    `teen_enable_move` trigger on `AppSetting` runs `teen_move_existing()` once (marker
    `teen_move_done`): every current-cohort participant aged 18 and below becomes a TEENAGER
    contact (created if they had none) with no adult owner, and the adult who held them is told.
    They then wait for the normal teen assignment (sweep or admin "Assign now"), which gives them
    a same-gender Teen Support and a teen group. For the first 48 hours after that switch-on, teen assignment does not skip
    "quiet" Teen Supports (`teen_quiet_bypass_until`, read by `teen_quiet_bypass()`); then the
    normal quiet check returns by itself. Source: `20261007140000_teen_enable_move.sql`,
    `20261007150000_teen_assignment_ignore_quiet.sql`, `20261007160000_teen_quiet_bypass_once.sql`.
25. **A teen with an app login only sees the Teen Welcome page.** While teen handling is on,
    `participant_teen_info` returns `isTeen` for a participant whose follow-up contact is
    TEENAGER / TEEN_ONBOARDED; `ParticipantShell` then renders `TeenWelcomePage` (their Teen
    Support's name and a WhatsApp link, what happens next, Log out) instead of the app, on every
    sign-in and every `/me` route. Admin "not a teen" releases them. If the check fails the normal
    app opens. Source: `20261007170000_participant_teen_info.sql`.
26. **Age brackets refresh every night.** `refresh_age_brackets()` (pg_cron
    `refresh_age_brackets_daily`, 01:30 Lagos) moves participants with a believable date of
    birth, and supports with a birth year, to the bracket their age now gives. A participant whose
    bracket is "18 and below" stays there until their cohort is COMPLETED or past its end date, so
    a teen keeps their Teen Support and teen group for the programme. People without a date of
    birth or birth year are never touched. Source: `20261007180000_age_bracket_daily_refresh.sql`.
27. **Teens have their own messages.** `MessageTemplate.category` `TEEN` (to the teen) and
    `TEEN_PARENT` (to the parent or guardian) show only on a teen's card, and never on anyone
    else's; the parent ones come first when the card has a parent number
    (`contactReachPhone`). `{{parent_name}}` reads `FollowUpContact.guardianName` ("Sir/Ma" when
    empty). A Teen Support saves their teens' WhatsApp group link on My Group
    (`TeenWhatsAppGroupCard`, stored as `User.whatsappGroupUrl`); a template carrying
    `{{group_link}}` cannot be sent until it is saved. The form handler reads parent or guardian
    name/number answers by wording (`guardianFromAnswers`). Source: `20261007190000_teen_guardian_name.sql`.
28. **No response parks someone instead of closing them.** `FollowUpContact.noResponseAt` is set
    by `followUpContactsApi.update`. An adult is released (`ownerId` cleared), left open and
    unarchived, so they can still be put in a group; the NO_RESPONSE status keeps them out of
    assignment and reassignment. A teen keeps their Teen Support and TEENAGER status (a teen always
    needs a same-gender Teen Support) and is only flagged; `push-reminders` skips anyone flagged.
    Choosing another status clears the flag. A support can also park a registered adult (Registered
    or Login shared only) as No response when they cannot reach them (`CAN_PARK_AFTER_SIGN_UP`; not
    Login issue, which has an open issue with IT, and not Access confirmed, which the API refuses for
    a non-admin): the same release applies, and they wait under No response on the admin Follow-ups
    table. Such an adult is only grouped by the builder once they have signed in (rule 29). If they
    then choose a password they become ACCESS_CONFIRMED and the flag clears
    (`confirm_followup_access_on_password_set`). Undo puts them back through the form gate (rule 1),
    so a contact with no form on file cannot be restored by the support and the screen says so.
    Source: `20261007200000_followup_no_response_flag.sql`,
    `20261008020000_password_set_confirms_parked_contacts.sql`.
29. **Only people who have signed in are grouped, and running groups are topped up first.** The group
    builder takes the participants it is given (the Groups page loads only the cohort's Active ones, and
    leaves teens to their Teen Supports) who are not in a group, and of those only people whose login is
    confirmed: they chose their own password (`ParticipantAccount.passwordSetAt`, as on the support
    Get-them-on-the-app card) and the account is on. This is compulsory, with no switch. Everyone else
    stays Active and ungrouped and is picked up by a later build once they sign in. If the sign-in check
    cannot be loaded, building is blocked rather than grouping everyone. Before making new groups, the
    builder tops up running groups that have people and space (a switch, on by default): each person goes
    to the group with the closest ages, never past the group's largest size and never against a gender,
    age-range or tag rule; the group's support and existing members are never changed. Whoever does not
    fit goes into new groups with free supports; if no group has space it says so. Teen Supports are never
    offered as supports. Creating a group the builder half-made before (empty, live, same support) finishes
    it instead of failing on the name. Source: `20261007260000_participants_signed_in.sql`
    (`participants_signed_in`), `GroupEngineWizard`, `groupingEngine.topUpGroups`.

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
