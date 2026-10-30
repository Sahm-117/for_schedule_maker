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
| Support | `components/StaffApp.tsx` + `AppShell.tsx` | `/support`, `/support/schedule`, `/support/mobilisation`, `/support/participants`, `/support/my-hub`, `/support/attendance`, `/support/community`, `/support/practice`, `/support/resources`, `/support/profile`, `/support/recap` |
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
3. **One phone per cohort per name, two exceptions.** `uniq_participant_phone_per_cohort`
   keys on the number, the cohort and the name (`fof_name_key`, words in any order) since
   `20261022110000_shared_number.sql`: the same person cannot be added twice on a number, but
   two different people (a couple) can share one (rule 91). It exempts two named rows
   (Funmilayo Ewayenikan / Jeremiah Williams, who
   share a number and an email) and every participant aged "10 - 17":
   teens may share a number, usually a parent's
   (`20261006170000_teens_share_phone_and_abimbola.sql`). Sign-in tries the password across every
   same-number row, newest cohort first (a teen's own number too: rule 67). Never add email login: duplicate
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
8. **Form wording maps to app buckets.** The teen bracket is "10 - 17"; an adult is 18 or over, and the
   first adult bracket is "18 - 24". The form still says "18 and below" (and the older "Below 18",
   "17 and below", "18 & below"): all of those become "10 - 17". The form's "19 - 24" and the older
   "18 - 24" both become "18 - 24". The form owner may reword the form; until then an 18-year-old who
   ticks "18 and below" lands as a teen and an admin moves them by changing the age range;
   only blank profile fields are ever filled, never overwrites. The same
   allow-list lives in `fill_profile_from_form` and the contact backfill;
   change both, and `isBelow18` in `receive-form-registration`. Source:
   `20261005120000_form_age_below_18.sql`, `20261007220000_form_age_new_wording.sql`,
   `20261007240000_age_bucket_19_24.sql`, `20261009140000_teen_bracket_10_17.sql` (the brackets were
   "18 and below" / "19 - 24" before).
   `fill_profile_from_form` fills the follow-up contact (gender, age, occupation,
   email, who registered them) as well as the participant; the same-gender rule
   (4) needs the contact's gender, so a rewrite must keep both. Source:
   `20261008000000_restore_contact_profile_fill.sql`.
   Exception: a believable date of birth (age 5 to 100) sets the age range
   itself (under 18 is "10 - 17", 18 to 24 is "18 - 24"), for participants always and for supports once a birth year is
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
    and meeting windows; only Absent is a missed class: Late and Left early
    count as attended and Excused is neither (since 30 Oct 2026; the
    `lateExcused` appeal no longer changes any count,
    `20261030160000_late_counts_as_attended.sql`, `utils/programmeRules.ts`
    `sundayMarkAttended` / `sundayMarkMissed`), and records lock after close (`attendance_record_lock`). Never
    back-date attendance around a closed window. An admin Reopen of a timed
    week starts a fresh window (`reopen_shared_attendance`), otherwise the job
    would finalise it again within a minute.
    After the class only admins change marks: a support's change is refused
    once the register is finalised, its window has closed, or its class day
    has passed (Lagos), unless an admin reopen's fresh window is running
    (`attendance_week_locked`, used by `mark_shared_attendance`,
    `start_attendance_window` and the `attendance_record_lock` trigger; the
    old Absent to Late or Left early exception is gone). An admin reopen of a
    week that never had a timed window opens it until it is finalised again.
    The support screen locks too, hides Start on a past class, and says to
    message an admin to dispute a mark. Source:
    `20261030100000_attendance_locked_after_sunday.sql`,
    `20261030130000_attendance_lock_and_review_fixes.sql`, `pages/SupportAttendancePage.tsx`.
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
    and New/Edit group pickers on the Groups page leave out Teen Supports,
    inactive or out-of-cohort users and anyone already leading another
    group (`supportsFor` in `AdminGroupsPage.tsx`). Operational supports and hub
    leads are offered (tagged), and missing pre-cohort training is
    shown as a notice (not for those two kinds), never a block (no override note needed).
    A registered
    contact whose age is "10 - 17" becomes TEENAGER (then TEEN_ONBOARDED)
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
    who has a support is never moved automatically. A teen form on a phone
    that already has a contact with a different name (words compared in any
    order, `fof_name_key`) is a new person, not a correction. Source:
    `20261006180000_teen_assignment.sql`.
21. **Admin tasks on a support's checklist are the admin's.** A
    `SupportChecklistItem` with `taskGroupId` set was put there by an admin
    (`admin_add_checklist_task` / `admin_add_support_task`, from Schedule `⋮`,
    `createdById` = that admin) or by the app itself (check-ups, rule 121,
    `createdById` empty); the app's "From admin" tag reads `taskGroupId`. Through
    the app a support may only tick it and write a note (`done`, `completionNote`,
    `completedAt`); renaming, moving, changing the due day and deleting are blocked
    by `support_checklist_admin_task_guard` (it checks `current_user`, so it is
    SECURITY INVOKER; the admin RPCs run as owner and pass). Supports are resolved
    when the task is added: people who join later do not get it. Source:
    `20261006210000_support_admin_checklist_tasks.sql`; dates and rest weeks: rule 104.
22. **A teen's group follows who holds them.** `Group.isTeenGroup` marks a Teen
    Support's group ("Teens - <name>"). `teen_group_sync` (triggers on
    `FollowUpContact` owner/status/archive/cohort and on `Participant.followUpContactId`)
    keeps the linked participant in exactly one group, the owner's teen group (leaving any adult group), while the
    contact is TEENAGER / TEEN_ONBOARDED, owned and not archived; out of all of them
    otherwise. Teen groups never have meetings, recaps, prayer or onboarding:
    `groupsApi.getAll` (unless `includeTeenGroups`) and `getForSupport` leave them out.
    A Teen Support still sees their teens on My Group and Home: `resolveSupportScopedGroups`
    (the support's own groups, which feeds `participantsApi.getAll({ supportId })`) includes their
    teen group, and My Group loads groups with `includeTeenGroups`; it shows Discussion and People
    but no Group meetings tab or group onboarding (the support's own steps and progress bar). Each teen's
    card still gets that teen's own Get ready progress, so it can say "Ready for class" and the next step
    (`SupportParticipantsPage` passes `onboardingByPerson` for teen groups too). Its "only one group" guess still never picks a teen group. A Teen Support's Attendance page
    lists only their teens by default, with "All teens" (any Teen Support may mark any
    teen; `mark_shared_attendance` only needs a staff session) and "Everyone" beside it. Source:
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
    `teen_move_done`): every current-cohort participant aged 10 - 17 becomes a TEENAGER
    contact (created if they had none) with no adult owner, and the adult who held them is told.
    They then wait for the normal teen assignment (sweep or admin "Assign now"), which gives them
    a same-gender Teen Support and a teen group. For the first 48 hours after that switch-on, teen assignment does not skip
    "quiet" Teen Supports (`teen_quiet_bypass_until`, read by `teen_quiet_bypass()`); then the
    normal quiet check returns by itself. Source: `20261007140000_teen_enable_move.sql`,
    `20261007150000_teen_assignment_ignore_quiet.sql`, `20261007160000_teen_quiet_bypass_once.sql`.
25. **(Replaced by rule 67: teens use the app again.) A teen with an app login only sees the Teen Welcome page.** While teen handling is on,
    `participant_teen_info` returns `isTeen` for a participant whose follow-up contact is
    TEENAGER / TEEN_ONBOARDED; `ParticipantShell` then renders `TeenWelcomePage` (their Teen
    Support's name and a WhatsApp link, what happens next, Log out) instead of the app, on every
    sign-in and every `/me` route. Admin "not a teen" releases them. If the check fails the normal
    app opens. Source: `20261007170000_participant_teen_info.sql`.
26. **Age brackets refresh every night.** `refresh_age_brackets()` (pg_cron
    `refresh_age_brackets_daily`, 01:30 Lagos) moves participants with a believable date of
    birth, and supports with a birth year, to the bracket their age now gives. A participant whose
    bracket is "10 - 17" stays there until their cohort is COMPLETED or past its end date, so
    a teen keeps their Teen Support and teen group for the programme. People without a date of
    birth or birth year are never touched. Source: `20261007180000_age_bracket_daily_refresh.sql`.
27. **Teens have their own messages, to the parent or guardian only.** (Since 2026-10-20 the picker shows a teen only `TEEN_PARENT` templates without `{{group_link}}`: no messages to the teen, no WhatsApp groups.) `MessageTemplate.category` `TEEN` (to the teen) and
    `TEEN_PARENT` (to the parent or guardian) show only on a teen's card, and never on anyone
    else's; the parent ones come first when the card has a parent number
    (`contactReachPhone`). `{{parent_name}}` reads `FollowUpContact.guardianName` ("Sir/Ma" when
    empty). The WhatsApp group link card on a Teen Support's My Group is hidden (teens are managed in the app; the component and
    `User.whatsappGroupUrl` remain); a template carrying
    `{{group_link}}` cannot be sent until it is saved. The form handler reads parent or guardian
    name/number answers by wording (`guardianFromAnswers`). A teen's own number is not a new column:
    `FollowUpContact.phone` is the teen's own only when it differs from `guardianPhone`; otherwise it
    is the guardian's copy, and a teen with no `guardianPhone` (earlier teens) is "unknown" until the
    support says whose it is in Edit contact (`teenNumberOwner`); a teen's own number is only saved together with the guardian's, so
    the guardian is always reached first. `TEEN` templates appear only when
    the teen's own number exists and go to it; `TEEN_PARENT` always go to the guardian
    (`teenMessagePhone`, `contactReachPhone`). Source: `20261007190000_teen_guardian_name.sql`.
28. **No response parks someone instead of closing them.** `FollowUpContact.noResponseAt` is set
    by `followUpContactsApi.update`. An adult is released (`ownerId` cleared), left open and
    unarchived, so they can still be put in a group; the NO_RESPONSE status keeps them out of
    assignment and reassignment. A teen keeps their Teen Support and TEENAGER status (a teen always
    needs a same-gender Teen Support) and is only flagged; `push-reminders` skips anyone flagged.
    Choosing another status clears the flag. A support can also park a registered adult (Registered
    or Login shared only) as No response when they cannot reach them (`CAN_PARK_AFTER_SIGN_UP`; not
    Login issue, which has an open issue with IT, and not Access confirmed, which the API refuses for
    a non-admin): the same release applies, and they wait under No response on the admin Follow-ups
    table. Such an adult can be grouped by the builder whether or not they have signed in (rule 29). If they
    then choose a password they become ACCESS_CONFIRMED and the flag clears
    (`confirm_followup_access_on_password_set`). Undo puts them back through the form gate (rule 1),
    so a contact with no form on file cannot be restored by the support and the screen says so.
    On the Follow-ups cards No response is read as next cohort: it sits in the Next cohort numbers
    (`FOLLOW_UP_STAGE`, the per-support breakdown), never in Stopped or Dropped, and is not a
    stopped reason. A parked person is not "waiting for assignment", so the bad-number banner does
    not list them (a teen is judged by the number we reach them on). The WhatsApp export shows each
    person's status and leaves No response out unless "Include No response" is switched on, except
    when the list is already narrowed to No response. The single-person Copy stays a clean line.
    The next-cohort carry-over (`getNextCohortContacts`, `getWaitingForCohort`, the dashboard's
    `nextCohortPeople`) offers every adult marked Will join next cohort or No response, whether or
    not they had signed up. `carryContactsToCohort` does not move the contact: it adds a fresh
    contact in the new cohort (To contact, no support, same name, number, email, gender, age,
    source and notes) and closes the original in the cohort they leave (archived, next action
    Close, status kept). The original stays linked to any participant record in the old cohort,
    because a later sign-up finds the participant through the contact and would otherwise pull that
    participant (attendance, group) into the new cohort. It only carries people still parked and
    open at that moment, so someone who signed in while the list was open is left alone. Teens
    parked as No response stay with their Teen Support and are not carried.
    Source: `20261007200000_followup_no_response_flag.sql`, `20261008110000_no_response_next_cohort_count.sql`,
    `20261008120000_no_response_next_cohort_all.sql`,
    `20261008020000_password_set_confirms_parked_contacts.sql`.
29. **Everyone not in a group can be grouped (signed in or not), and running groups are topped up first.** The group
    builder takes the participants it is given (the Groups page loads only the cohort's Active ones, and
    leaves teens to their Teen Supports) who are not in a group. There is no sign-in requirement and no
    "Planning only" mode (both were removed): someone who has not chosen a password or finished onboarding is grouped like
    anyone else, and every draft can be saved and created. (`participants_signed_in` is no longer read by the builder.)
    On the Draft step, new groups still without a support are counted by the gender of their people (male, female,
    mixed) and can be filtered by that; the filter falls back to all groups once none is left. Before making new groups, the
    builder tops up running groups that have people and space (a switch, on by default): each person goes
    to the group with the closest ages, never past the group's largest size and never against a gender,
    age-range or tag rule; the group's support and existing members are never changed. Whoever does not
    fit goes into new groups with free supports; if no group has space it says so. Teen Supports are never
    offered as supports. Creating a group the builder half-made before (empty, live, same support) finishes
    it instead of failing on the name. Source: `20261007260000_participants_signed_in.sql`
    (`participants_signed_in`), `GroupEngineWizard`, `groupingEngine.topUpGroups`.
30. **Teens have their own recap, for Teen Supports only.** `Week.teenRecapSummary`,
    `teenDiscussionPrompt`, `teenRecapDocumentUrl/Name` and `teenRecapReleaseAt` are written or uploaded
    by an admin in the Cohorts week editor (Recap, Adults / Teens). Empty `teenRecapReleaseAt` means it
    shows as soon as it exists; a time holds it back. `support_recaps` returns the content only once
    released (admins always see it) plus `hasTeenRecap` / `teenRecapReleaseAt` so the Recap page can say
    "Arrives <time>" or "Not uploaded yet" (with "Use the adult recap"). Only Teen Supports (the TEEN_SUPPORT tag) and
    admins get the Teen keys from `support_recaps`; every other support gets none of them and no week
    that only has Teen content. (Staff can still read the `Week` table directly, as with the adult
    recap.) Participants never see it, and `participant_home` is untouched. A week
    with only a held Teen recap still opens for a Teen Support and says when it arrives. The class manual is shared with
    adults. Teen documents are not copied by the cohort clone (the adult ones are not either); they are
    reused through "Choose earlier file" (`list_earlier_class_documents`, kind `TEEN_RECAP`), and a
    release time is never reused. The picker keeps one row per file and kind. Source:
    `20261008050000_teen_recap.sql`, `20261008060000_earlier_documents_keep_kind.sql`,
    `20261008070000_teen_recap_teen_supports_only.sql`,
    `20261008080000_earlier_documents_teen_supports_only.sql` (the earlier-files picker lists Teen recap
    files only to admins and Teen Supports too).
31. **A Teen Support records their Saturday meeting on My Group, and it stays out of the dashboards.** The card also sets the teen group's meeting link (`Group.callLink` / `callPlatform` through `groupsApi.setMeetingSlot`), which guardians and teens see on their Home as Join call; the WhatsApp group card is no longer shown.
    `TeenMeetingCard` saves one `MeetingAttendance` row per teen (Joined, Excused, Missed) and the teen
    group's `GroupPrayerStatus` row (`done`, `metOn` = the day they actually met, `notes` = the Teen
    Support's own notes) through `teenMeetingsApi.save`. The first time it is marked done the admins get
    `notify-group-meeting-completed` with `teen: true` (their alert opens the dashboard), and the admin
    dashboard's Teens card shows who has met this week (`teenMeetingsApi.getForCohort`). Teen groups are
    kept out of everything that judges groups: `cohort_health` does not list them (so they never owe a
    meeting report), `cohort_people` sends no teen meeting attendance and no teen onboarding rows (no
    red flags), and `daily-checks` skips groups with `isTeenGroup` (no "report still open" nudge, no
    digest line, no missed-meeting escalation). The Saturday-morning reminder is not built yet; it waits
    until Teen Supports are using the card. The red-flag exclusion also skips anyone currently in a teen
    group, so a meeting row whose group was later deleted still never counts. A meeting cannot be dated
    before that week's class. Source: `20261008090000_teen_meetings.sql`,
    `20261008100000_teen_meeting_flags_robust.sql`,
    `daily-checks` (v18), `notify-group-meeting-completed` (v6).
32. **The builder fills the groups first, then adds supports from every hub.** Groups are formed from
    the people first; supports are chosen afterwards, and never change how the groups form. Supports are
    picked across the cohort's hubs (hubs with members, supports found through `HubMembership`) so that at
    least two thirds of the hubs (`hubTarget`, rounded up) have a group with participants, and past that
    the hub with the smaller share of its supports leading goes first (`groupingEngine.assignSupports`).
    Hub spread outranks the support's age fit, never the tag or gender fit, and never a Must rule: when a
    Must rule or too few groups stop it, the builder still builds and the draft says so
    ("Hubs with participants: X of Y", with the reason and the hubs without; it updates as supports are
    changed by hand). Topping up follows the same aim: running groups already led from fewer than two
    thirds of the hubs make the top-up keep people back for new groups led from the other hubs (enough for
    one group of the smallest size per hub still needed; those who fit no running group already count,
    and nobody is held back who could not make such a group), and among equal fits the hub with fewer people per support is filled first. Supports in no hub are
    not offered: supports are always in hubs, so a support in none is listed under "Supports the engine won't
    use" as "Not in a hub", and the People step says how many. With no hub that has anyone in it (or if the
    hubs cannot be loaded) the builder will not go past the People step or continue a saved draft; it asks for
    the hubs to be created (link to Hubs) or to try again. A support marked Participant support for the cohort (Supports page → Kind) and in a hub is eligible; missing pre-cohort
    training is shown (a Trainings tag and "Missed training" on the draft group) and never leaves anyone out. Operational
    supports can lead groups too, but only when "Also use operational supports" is switched on in the builder (off each
    time it opens, remembered with a saved draft); they show an Operational tag. Hub leads can lead groups too, if need be, with
    "Also use hub leads" (same behaviour, Hub lead tag). Neither kind is flagged for missed training. A hub lead or
    operational support who has a group sees My Group and the group Home like any support (AppShell,
    SupportHomePage). The Hubs and Supports pages label Teen Supports. Wherever the builder lists supports (the People step,
    each group's support menu, supports without a group) they are shown under their hub (Hub 1, Hub 2, ...),
    and each group shows its support's hub. Source: `groupingEngine` (`hubTarget`,
    `hubCoverage`, `hubGroupsNeeded`, `assignSupports`, `topUpGroups`), `GroupEngineWizard`. No database change.

33. **Registered and logged-in numbers count people, adults and teens apart; teens have no login.** The Dashboard
    (before a cohort starts) and Follow-ups → Overview show the same `RegistrationOverviewCards`, worked out by
    `computeRegistrationOverview` from the cohort's participants, not from follow-up statuses.
    Registered = an active, non-test participant in the cohort. ADULTS: Logged in = they chose their own
    password and the login is on (`participants_signed_in`); Still to log
    in = registered minus logged in, listed by reason (login sent, login not sent yet, not reachable / stopped /
    joining next cohort, marked as logged in by hand but never signed in). TEENS get no login details, so their
    sign-in is never counted: a teen is Onboarded (by their Teen Support, status Teen onboarded), No response
    (No response, or parked / stopped), or Not onboarded yet (the rest; "waiting for a Teen Support" when they
    have none), and Registered = Onboarded + No response + Not onboarded yet. Teen = age range "10 - 17",
    or on the teen path (Teenager / Teen onboarded). A follow-up status only explains where someone is; it never
    adds or removes anyone from Registered, so parking someone (No response, next cohort) or moving a teen to a
    Teen Support cannot change the total. The one exception is Wrong Number: a registered person marked Wrong
    Number (and, for an adult, not signed in) is left out of Registered and counted in a "wrong number" note on
    the cards; they count again as soon as a correct number is added (a changed phone on the contact clears Wrong
    Number in `followUpContactsApi.update`) or the status is changed. A teen marked Wrong Number keeps the Teenager
    label (`update` keeps it; `computeFollowUpStatus` still reads them as Wrong Number), so they stay a teen
    everywhere. "Not registered yet" is open, current follow-up contacts with no
    participant; a contact marked registered with no participant record is not counted but is named in a note
    on the cards. The cards read the people again whenever the page's contacts refresh, and the mobilisation
    target shows no progress (not 0) until the total is known. If who has signed in cannot be loaded the cards
    say so instead of showing numbers. The status list further down still shows follow-up statuses (a hand-set
    Access confirmed is counted there). No database change. Source: `utils/registrationOverview.ts`,
    `RegistrationOverviewCards`.
34. **List pages filter with one shared control, several choices at once, and say how many are shown.**
    `components/filters/FilterBar` (the Follow-ups pattern): a Filters button with a badge, a sheet of chip groups where
    a row matches if it fits ANY chosen choice in a group and EVERY group that has a choice, each choice carrying how
    many rows it matches, removable chips, and a line "Showing N of M <things>" (just "M <things>" when nothing is
    filtered). Used by Participants, Supports, Groups, Hubs, Attendance, Faith projects, Onboarding, Birthdays, Meetings,
    Activity overview, Schedule and Community people; Follow-ups (admin and support) keep their own sheet and show the
    same count. Supports and Groups keep the choices in the address (`useUrlFilters`, comma separated, so `?hub=` and
    `?group=` links still work); the others keep them in the page. The Participants page splits adults and teens, and
    its App login filter means logged in = chose a password (`participants_signed_in`), adults only (rule 33); the
    sign-up status there is the follow-up status, so a hand-set Access confirmed is not the same as logged in. Its sheet
    also has the switch "Hide no response and next cohort" (sign-up status No Response or Will Join Next Cohort): it
    leaves them out of the list, the choice counts, "Showing N of M" and the export label; it is not kept in the address. Pages
    whose selector picks the data to load (Feedback by week or group, Birthdays' cohort) keep a single selector.
    The Groups page also shows its hub choices as chips beside the Filters button (`FilterBar` `extra`, `?hub=`, same
    any-of matching and counts; a group's hub is its support's `HubMembership`), so a hub is one tap away. The chips also
    filter the Teen groups section (a teen group's hub is its Teen Support's); the chip counts include teen groups; "Showing N of M" is adult groups.
    Source: `FilterBar`, `useUrlFilters`, each page. No database change.

35. **The Get ready list needs the venue map, and goes away at first attendance.** A participant opens the
    venue map and ticks that they understand it (`ParticipantOnboarding.venueMapAckAt`, set by
    `participant_ack_venue_map`); `participant_confirm_ready` refuses until that is done. The list stays on the
    participant home until an `AttendanceRecord` for them is PRESENT, LATE or LEFT_EARLY
    (`participant_onboarding_state.hasAttended`), so absent people keep it after the cohort starts. People already
    ready or completed are not asked again. The card sits above the progress card and tiles on Home; once they have
    attended, only an unposted intro and an unfinished profile are left (rule 75).
    Source: `20261008130000_venue_map_ready_step.sql`.

36. **The Mobilisation cards use the Dashboard's count, and a teen's number is never shown there.** Target counts
    everyone registered (`computeRegistrationOverview`) and shows "x adults, y teens" under its status line, a Teens
    card beside it counts registered teens with the wrong number left out and says how many came from the form or
    were added by hand, Onboarded is adults logged in out of adults (teens have no login), and Prospects stays the
    follow-up contacts still to register, with a "See who" list
    of this cohort's prospects, whoever follows them up (name, status, support, date added; no numbers). On "Registered on the form", a teen (age range "10 - 17", or on the
    teen path) shows a Teen chip and "Number hidden"; the number and email are dropped when the rows load, so they are not shown
    or searchable on that list (the database, and the contacts and people lists a support can open elsewhere,
    still carry them). A Wrong Number contact shows
    a Wrong number chip. Source: `SupportMobilisationPage`, `formRegistrationsApi`.
37. **Teen groups count in the admin "Discussions this week" line again.** (They were left out while teens used WhatsApp,
    `20261009100000`.) Teens are back in the app and their group discussion works like any other (the discussion functions are
    generic over groups), so `admin_discussion_summary` counts every active group of the cohort, teen groups included, and the
    admin Groups page's teen cards have an icon that opens the group and its discussion (`/group-view/:supportId`).
    Source: `20261017110000_discussion_summary_with_teen_groups.sql`.

38. **A class can carry a graphic and a teacher, and the participant home shows them as the "Next class" card.** Staff
    add them in the week editor on the Cohorts page (`Week.classGraphicUrl`, `teacherName`, `teacherRole`, `teacherBio`,
    `teacherPhotoUrl`; pictures go to the public `resources` bucket under `classes/`). `participant_home` hands them to the
    app per week, with `manualReleasesAt` (the manual's release time while it is not released yet). The card is for the
    next class (not the current week) and shows only the graphic with the class name, the teacher chip and one button; it
    never repeats the date, countdown or week count. The button is "Open manual" once the manual is released, a disabled
    "Manual arrives <day date>" while an uploaded manual is waiting for its release time, and absent when no manual has
    been uploaded. The plain manual row for the current week stays whenever the card is for a different week. With no graphic and no teacher the card is not shown and the plain "This
    week's manual" row stays. The teacher's bio and photo only show once a name is set. Source:
    `20261009110000_class_card.sql`, `20261009120000_class_card_manual_only_if_uploaded.sql`.
39. **Practice enrols every support, including an admin who also carries the Support tag.** `practice_pulse` enrols a
    user whose `role = SUPPORT` or whose `roles` contains SUPPORT (the same test as rule 16). Before this an admin given
    the Support tag was never put on the practice roster. Source: `20261009130000_practice_enrol_dual_role.sql`.
40. **Changing a participant's age range across the teen line moves the person.** Setting a current-cohort, ACTIVE,
    non-test participant to a teen range ("10 - 17") runs `teen_convert_participant`: adult-group memberships go
    (group supports are told first), the follow-up contact becomes a TEENAGER, the previous adult owner is told, and
    the normal teen assignment gives a same-gender Teen Support. Setting a teen to an adult range runs
    `teen_revert_participant`: the contact goes back to REGISTERED, the owner is cleared when it was a Teen Support, and
    that support is told. Both run from the trigger `participant_age_teen_boundary` (`AFTER UPDATE OF "ageRange", "dateOfBirth"`), so
    any edit path behaves the same, including a date of birth that changes the range. `fill_profile_from_form` sets the
    transaction flag `fof.skip_teen_boundary` around its own profile fill, because it does the teen handling itself
    straight after; keep that flag if you rewrite it. A date of birth still wins over a typed range, so the Participants form locks the
    age range when a date of birth exists. A participant with no date of birth can only be corrected this way. Source:
    `20261009150000_teen_age_change_follows.sql`, `20261009170000_teen_review_fixes.sql`. The conversion marks a contact
    as registered by hand (`manualRegistrationAt`, the mark the form gate in rule 1 looks for) only when no form
    registration is linked to it; a person who signed up on the form is left unmarked
    (`20261009180000_teen_convert_form_signups_not_manual.sql`).
41. **Group size can be set per gender; a Teen Support's teen limit is its own setting.** The group builder rules carry
    `genderSizes` (min/aim/max per Female and Male; a mixed group uses the general size) and only shape the builder's
    groups. The most teens one Teen Support holds is `teen_cap_for(cohort, gender)`: Settings > Programme rules
    `maxTeensPerFemaleTeenSupport` / `maxTeensPerMaleTeenSupport` (0 = same as `maxTeensPerTeenSupport`, default 4). It is
    not read from the group builder, so saving builder rules never changes it (it did for a few hours before
    `20261009190000_teen_limit_own_setting.sql`). An admin can move a teen to another same-gender Teen Support from
    Groups (`admin_teen_move_targets`, `admin_move_teen`): a full support needs an explicit "Move anyway", the move is
    logged in `FollowUpReassignmentLog` as moved by that admin, and both supports are told. `admin_move_teen` takes the same
    advisory lock as `assign_teen_contacts` and never targets a test account. Source:
    `20261009160000_teen_group_sizes_and_admin_move.sql`, `20261009170000_teen_review_fixes.sql`.
42. **The Draft step can be exported as WhatsApp text.** `buildWhatsAppText` (`utils/groupingExport.ts`) lists supports by
    gender, `Name (N participants)`, then each participant with their age range, and groups still without a support.
    Each support's name (and the "Female group 1" header of a group with no support) is bold (`*name*`, WhatsApp's bold) and the participants under it are numbered (names on). Participant names are
    optional (switch on the Draft step); with names off only counts per age range are shown. It
    carries no phone numbers. Supports can be moved by hand on the Draft step; a support already used by another group
    must be cleared there first. Frontend only.
43. **The Draft step filters its groups by gender and by missing support.** The chips are All groups, Female, Male and Mixed or
    unknown (every group, topped-up ones included, is counted once by the gender of everyone in it, so the three add up to
    All groups), and No support / Male, no support / Female, no support / Mixed, no support (new groups only). The row shows
    when the draft has more than one gender or any group without a support. A gender view is live (a group follows its people);
    a no-support view is a snapshot so cards do not jump as supports are given. Groups outside the view are hidden, so moving
    someone into one needs "All groups". An Ages row (All ages, then each age range with how many draft groups have someone
    in it, several at once) narrows the same list to groups with someone in a chosen range; empty groups always show, as they
    take moves. It is not saved and resets when the builder opens. Several people can be tapped at once (a bar shows how
    many, with Clear); "Move N here" on a group or on "Not in a group" moves them all, in the order tapped.
    The builder opens on the Draft step: once it has loaded and the hubs are ready it continues the saved draft, or builds one
    with the cohort's saved rules (empty groups not filled), and says so in a note. A continued saved draft can be discarded
    there ("Discard it and start again"). People and
    Rules are one Back away; Rebuild applies changes. Frontend only (`GroupEngineWizard.tsx`).
44. **A support left without a group can be given an empty group on the Draft step.** "Make a group for each" in Supports
    without a group adds one empty draft group per unused support (named after the next free "Group n"), and each support in that
    list also has its own "Make a group" button for just that one; people are then moved in by hand. A group made this way and still empty at the end is created empty too (to be filled later; the Draft step says "N empty groups will be created"); an empty group that already exists is left alone, and an empty draft group has a Remove button. Empty groups are their own bucket in the gender chips ("Empty
    groups"; Female + Male + Mixed + Empty = All groups) and stay on screen in every gender view, because they are where
    people get moved to. A support with only an empty group still counts as spare for hub coverage. Frontend only
    (`GroupEngineWizard.tsx`).
45. **Supports see the Inspirational Scriptures on their Home, exactly as participants do.** One shared card
    (`components/ScriptureCarousel.tsx`) serves the participant Home and the support Home (`SupportScriptures.tsx`).
    Supports read the images straight from the `Scripture` table and the two settings (`scriptures_enabled`,
    `scripture_start_day`), which any staff session may read, and follow the same switch: with scriptures off in Settings,
    neither participants nor supports see the card. The day follows the active cohort's start date (day N opens at 2:00 PM
    Lagos time). Frontend only.
46. **A class's teacher can be tapped on the participant Journey, the support Classes page and the support Home next-class card.** A week with a teacher
    name set shows a small chip (`TeacherChip`) under its title; tapping it opens the same `TeacherSheet` as the home
    "Next class" card (photo or initials, name and role, bio, the class they teach), and does not open or close the week.
    Participants read the teacher from `participant_home` (`week.teacher`); supports from the Week rows (`teacherName`,
    `teacherRole`, `teacherBio`, `teacherPhotoUrl`). No teacher name, no chip. Frontend only.
47. **The Planner's "Class dates" sheet shows when each class's manual and recaps will drop, for supports and participants.** The
    times come from Settings > Timings and are worked out from the class's date (`Week.classDate`, or start + weeks when none is
    set), so moving a class moves them: the manual (one time for both; it goes out BEFORE class, the chosen weekday on or
    before the class Sunday, Thursday = 3 days before), the supports' recap and the participants' recap. The same date also
    drives the feedback form, the current programme week, attendance finalising, reminders and daily checks (read in
    `participant_home`, `support_recaps`, `auto_finalize_sunday_attendance`, `daily-checks`, `push-reminders` and `weekFocus.ts`).
    `manualReleaseAt` and `recapReleaseFromClassDate` (`utils/recapReleaseTimes.ts`) mirror `recap_release_at()`; the recap
    one counts days forward from the class Sunday and must not be used for the manual. The sheet reads the setting with `getRecapReleaseTimesChecked` (a failed read throws; the
    plain `getRecapReleaseTimes` quietly gives the usual times) and shows no drop times until it has loaded, or if it cannot be read. The times
    are the scheduled ones: a manual or recap already sent early (`manualReleasedEarlyAt`, `participantReleasedEarlyAt`) has gone out, which the
    sheet says in a note. The week editor's manual label says "ahead of the Week N class". Frontend only.

48. **A hub lead can WhatsApp an adult participant from the group overview; a teen's number is never sent.** `hub_group_overview`
    (the hub lead's, assistant's with "See groups", the support's and the admin's read-only look at a group) returns each participant's
    `phone` and `isTeen`. `isTeen` is true when the group is a teen group, the age range is "10 - 17", or the contact is on the teen
    path (TEENAGER / TEEN_ONBOARDED); for a teen `phone` is NULL, so the number never reaches the browser. The overview shows "Send
    message" (`buildWhatsAppLink`) only when there is a number, and a one-line note for a teen. The same item is on the My Group
    participant menu (`ParticipantCard`). Source: `20261009200000_hub_group_overview_numbers.sql`.

49. **A faith project is saved straight away and edited any time; every version is kept.** The status wording lives in `FAITH_PROJECT_STATUS_LABEL` (`utils/participantApp.ts`): "Not started" and "Written" (the page's action stays "Save"). A project is `NOT_DRAFTED` (nothing saved;
    a seed from the registration form is still `NOT_DRAFTED` until the participant saves) or `SAVED`. The review chain
    (`NEEDS_REFINEMENT`, `UNDER_REFINEMENT`, `AWAITING_DRAFT`, `APPROVED`) is retired: the old comments and approvals are hidden, not
    deleted. `save_faith_project` never locks a project and says if the save was a first one (`created`) or a change (`changed`);
    the participant app then bells the support on a first save and on every change (not when nothing changed). The trigger
    `faith_project_keep_version` writes `FaithProjectVersion` (full text, when, who: a participant's own save has no name), so every
    save path keeps history. The participant, their support and the admin read the same "Edit history" accordion
    (`FaithProjectHistory`). Supports and admins cannot edit the text; they can set an optional category (`faithProjectsApi.setCategory`).
    A participant's own save marks itself (`fof.faith_by_participant`) so the history never credits a staff identity, and a first project
    carries an earlier "I'm fine with this". Never write the retired statuses again. Source: `20261010100000_faith_project_free_edit.sql`,
    `20261010110000_faith_project_review_fixes.sql`.

50. **Corporate prayer is opt-out, and the pop-up cannot be closed.** `Participant."prayerConsent"` is NULL (not answered, counts as
    included), `IN` or `OUT`; `set_prayer_consent` records it (and keeps the older `sharedForPrayer` flag in step). Admin sets, per
    cohort in Faith Project settings, `prayersStartWeekNumber` (corporate prayers start the day after that week's class, so the Monday after a
    Sunday class; read with `week_class_date`, so a moved class moves it; `faith_prayers_start_date`,
    `20261022170000_prayers_start_day_after_class.sql`) and `prayerPopupDaysBefore` (default 3). From that many days before, `participant_home`
    returns `prayerPrompt` until the participant answers, and the app shows `PrayerConsentModal` as a required popup (priority 30): no
    close button, no tap-outside or Escape, only "I'm fine with this" or "Opt out". A project is prayable when
    `faith_project_prayable` says so: SAVED, has text, the person has not opted out, and they said yes / were already shared
    (`sharedForPrayer`) or prayers have started. `hub_prayer_list`, `set_hub_prayer_focus` and the group prayer focus in `participant_home`
    use it; never go back to "APPROVED and shared". Once answered (or if they had already shared before the pop-up existed), the project tab of the Faith page shows a small "Prayer on / Prayer off" chip at the top right (`PrayerChoiceSheet`; choosing applies at once, no Save); there is no toggle row on the page. Teens
    have no login, so none of this reaches them. Source: `20261010100000_faith_project_free_edit.sql`.
51. **Background polling goes through `usePolling` / `startPolling` (`hooks/usePolling.ts`), never a bare `setInterval`.** The database is a
    small free-tier instance, so a poll runs only while the tab is visible, is jittered, never stacks on itself, and catches up once when the
    tab returns. In `ParticipantAppContext` a failed background poll keeps the last good `home` (only the first load may show the error
    card), the newest request wins, and a response that started before a local save is dropped so it cannot wipe it. Staff `AppDataContext`
    holds a Realtime-triggered workspace refresh while the tab is hidden and runs it on return. A clock that only ticks locally
    (`setInterval(() => setNow(...))`) is not a poll. The `supabase_realtime` publication carries ONLY `Notification` (which the public key cannot
    read), so a `postgres_changes` listener on any other table never fires: do not add one and expect live updates; poll instead. The staff app
    learns of changes elsewhere through the notification check (30 s) and its "Refresh" prompt. Per-person label lookups for a list go through
    `usersApi.withLabels(users)` (one query), never `getUserLabels` per person. Uploads to storage pass `cacheControl` (their paths are
    timestamped, so never overwritten), and `vercel.json` serves the hashed `/assets/*` as immutable. Frontend only; no migration.
52. **Row-level-security policies call the session helpers wrapped: `(SELECT app_is_staff())`, `(SELECT app_is_admin())`, `(SELECT app_current_user_id())`, never bare.**
    Bare, Postgres runs the lookup once per ROW (a staff read of 836 activities took ~41 ms; wrapped, ~0.4 ms), so a busy day on the free instance is
    spent re-checking the same session. The result cannot change inside one statement, so the wrapped form lets the same people see the same rows. Every
    policy was rewritten in `20261010140000_rls_wrap_helper_calls.sql` (93 policies, row counts proven identical for 84 tables across no-token, admin,
    support and participant viewers); write new policies the wrapped way. The background notification check asks `my_notifications_signal()` (about 100 bytes: unread
    count and newest id, `20261010120000_notification_signal.sql`) and downloads the list only when that changes.
53. **A group's card shows its onboarding status, and the hub of its support.** Adult groups with members show a chip (`summarizeGroupOnboarding`,
    `utils/groupOnboarding.ts`): Onboarded (every member has finished: `completed`, or all five steps Intro / Map / Guide / Profile / Ready), Overdue (not onboarded and more than
    `onboardingMaxDays`, 7 by default, EXACT days (fractions count, as in `evaluateSupports`) since the group's support was last assigned, i.e. its latest `GROUP_ASSIGNED` `OnboardingEvent`; a group with no support has no clock and is never Overdue), Not started (nobody has done any step),
    otherwise In progress. A member with no onboarding row counts as having done nothing. The five segments fill by the share of members past each step and "Waiting on" names the
    step with the most people still to do (earliest on a tie). Teen groups and empty groups show no strip (rule 22). The Onboarding filter (in the Filters sheet; the separate summary row above
    the filters was removed on 2026-10-21) uses the same chip (`?onboarding=`). If the onboarding data cannot be loaded the strip and filter are simply hidden (and a stale `?onboarding=` in the address is ignored); if only the assigned dates fail, the Onboarding filter's hint and a line under the filter bar say day counts are unavailable. A failed background refresh keeps the data already on the page. The support's hub name (from `HubMembership`) follows the support's name.
    Frontend only; it reads `cohort_onboarding_progress` and `OnboardingEvent`.
    The strip also shows the support's own steps as small dots: "Support introduced" (green) or "not introduced" (amber), from `cohort_onboarding_progress.groups[].supportIntroPosted`, and "Meeting time set" / "No meeting time yet"
    (the group has a `meetingDay`, `meetingTime` and call link, as on the support's own card; or an admin marked it, rule 76). The meeting time is the **support's extra onboarding step**: a group is not Onboarded, and the Supports page does not call the support onboarded and keeps counting days, until it is set
    (a group with no support has nothing to wait on). Participants' steps are unchanged. The Dashboard's counts still use the server health feed, which does not carry meeting times, so they do not include this step yet.
54. **Corporate prayers run from the admin module; one rotation decides who is prayed for.** Admin sets slots on `/corporate-prayers` in a wizard: a PRAYER slot is a template (stacked library verses, picked by title, plus an optional faith project; the verses are fixed, only the person changes),
    a LIVE slot carries its own Telegram link; each has a time, timer, join window and an audience (everyone, or chosen hubs: that hub's supports and their participants), and a prayer slot prays for the same person for all chosen hubs or a different person per hub; the start week and the opt-out pop-up timing still live in `FaithProjectSetting` (the page edits them; the Faith project settings
    sheet only links to it). From `faith_prayers_start_date` to the cohort end date, a slot's session for the day is made once (`ensure_prayer_session`, advisory-locked) the first time
    anyone needs it, or by the per-minute `notify_prayer_slots()` a minute before it opens (cron `corporate_prayer_slots_every_minute`, which does nothing unless a notifying slot in a live cohort is about to open; a Practice cohort's slots never send slot-time notifications, because real supports and admins are enrolled in Practice, so Practice only notifies through the test prayer below).
    Two pools, each with its own cycle number: FAITH (a saved faith project with text) for templates that include the faith project, NAME (every participant) for the rest; both skip teens, tests (except in the Practice cohort, where test accounts count so Practice can be tried) and
    `prayerConsent = 'OUT'`. `prayer_pick` chooses the person longest since last prayed for who has no turn this cycle, never the same person twice on one day, and starts the next cycle when
    everyone has had one; in per-hub mode each chosen hub (a participant's hub is their group's support's hub; none = NO_HUB, reached only by "everyone") gets a different person that day.
    A session copies the slot's template and audience when it is made, so editing a slot never rewrites a day that ran; a person only sees, joins and is notified about slots whose audience includes their hub,
    and a hub cannot be in two active slots at the same time (checked on save, same time only). A chosen person who opts out before
    anyone opens the slot is replaced. People counted and notified: participants with a working login (not teens, not tests) and anyone holding the Support role; plain admins are not.
    Opening the prayer screen checks you in, Amen checks you out (`corporate_prayer_join` / `_amen`), counts are numbers only, polled slowly (rule 51). The LIVE slot is a required pop-up
    (priority 28) that cannot be closed: "Prayed" unlocks N minutes after the Telegram link tap (the slot's `liveWaitMinutes`), with an exit after ten minutes if the link would not
    open; a LIVE slot cannot be saved without a link, and different hubs get different links by having one LIVE slot each. Notifications go through `notify-users` (both channels, rule 10). Tables are locked outright; every function takes `p_token`, admin
    functions need an ADMIN session. A verse that is part of a slot's template cannot be switched off (the admin is told which slot uses it and to update that slot first); only the exact-time hub clash is checked.
    Admin-only `practice_send_test_prayer` opens a 30-minute test prayer in the Practice cohort (hidden test slot, never run by the clock) and notifies only the admin's practice participants and the admin.
    Source: `20261011100000_corporate_prayers.sql`, `20261014100000_corporate_prayers_templates.sql`, `20261015200000_prayer_no_notify_in_practice.sql`, `docs/specs/corporate-prayers-admin.md`.
55. **A new table must not give two existing tables a second route between them.** The app reads related rows with embeds such as `cohort:Cohort(name)` on `Participant`.
    A table with foreign keys to BOTH tables counts as a many-to-many route, the embed turns ambiguous (`PGRST201`) and every page using it fails, while the SQL itself looks fine.
    `CorporatePrayerSkip` did this to `Participant` and `Cohort` for a day (Dashboard registration cards failed); its `cohortId` key was dropped
    (`20261012090000_prayer_skip_drop_cohort_fk.sql`). Before adding a table, check it has no two foreign keys to tables that are already embedded together; keep one as a plain column,
    then replay the real embed through the API with a test session.

56. **Roles and permissions: an Admin makes roles, ticks See / Add / Edit / Delete per module, and gives them to Team members. Phase 1 hides; it does not yet block.**
    The Roles page (`/roles`, real admins only) edits `PermissionRole` and `PermissionRoleModule` (21 module keys, `perm_module_keys()`, mirrored by `frontend/src/utils/permissions.ts`; keep the two in step).
    A person gets a custom role through `UserPermissionRole` (`perm_set_user_roles`). The built-in **Support** role row holds ticks too, but they only apply to a Support person who also holds Team member
    access, in their Team member view. **Team member = database role `STAFF`.** Behind the scenes it is an admin: `app_staff()` returns it as ADMIN and `app_is_admin()` /
    `attendance_session_actor_is_admin()` accept it, so every existing admin-only function and rule lets it through; the app limits what it sees (menu, `PermissionGate` for typed addresses, `can()` on buttons).
    Anything that changes who has access uses the true role (`app_staff_real`): `set_user_role(s)`, `create_user` above Support, `set_user_password` on an admin, and every `perm_*` function (admin only).
    The client maps STAFF to `role: 'ADMIN'` plus `teamMember: true` (`asClientUser`, `supabase-api.ts`), so legacy `role === 'ADMIN'` checks keep working; `isRealAdmin` is the strict one.
    `get_my_permissions` resolves what the signed-in person may do (admins: everything; Support view: nothing extra; Team member: union of custom roles plus Support's ticks if they also hold Support).
    A Support who needs more modules is given Team member access too and switches views from the profile menu (existing multi-role switch); they always sign in as Support (`app_lowest_role` ranks STAFF above Support).
    A Support in the Support view keeps a few admin routes their own screens link to (`SUPPORT_KEPT_PATHS`: group view, group prayers, faith projects, schedule, community, resources, team announcements) and `can()` answers yes for them.
    Admin notifications go to everyone who can See the module, not to a fixed role: `module_viewers(module)` (admins plus Team members with the See tick) is used by the edge functions (`moduleViewerIds` in `_shared/notifications.ts`),
    `notify-users` (`module` input) and the reported-post trigger. Source: `20261013085500_staff_role_value.sql`, `20261013090100_roles_and_permissions.sql`, `20261013100000_permissions_support_view.sql`,
    `20261013110000_lowest_role_staff_above_support.sql`, `20261013120000_module_viewers.sql`, `20261013130000_roles_review_fixes.sql`, `docs/specs/roles-and-permissions.md`.
    Frontend: `utils/permissions.ts`, `hooks/usePermissions.ts`, `hooks/useAuth.tsx`, `components/PermissionGate.tsx`, `pages/AdminRolesPage.tsx`, `pages/NoAccessPage.tsx`, `components/AppShell.tsx`, `components/UserManagement.tsx`.

57. **A support sees onboarding on My Group → People, not on a page of its own.** Each person's card shows the five
    steps (Intro / Map / Guide / Profile / Ready) from `groupDiscussionApi.onboardingProgress`, or just Ready once
    `completed`. The support's own three steps now sit at the top of My Group and of their Home (rule 76). The support Onboard
    menu item is gone and `/support/onboarding` redirects to `/support/participants?tab=faith`
    (the old `SupportOnboardingPage.tsx` was removed on 29 Oct 2026). Teen groups show none of it (rule 22). The tab is kept in the address
    (`?tab=`), which the Practice "visit" steps read. The card's "Not seen in the app yet" only shows once
    `participants_app_details` has loaded. The collapsed card's "Not ready ›" opens a sheet listing the five steps in the
    participant's own wording (done ticked, the rest with what to do in their app; "not signed in yet" first when access is
    not confirmed), using the same `participantStepDone` rule. Frontend only: `SupportParticipantsPage.tsx`, `ParticipantCard.tsx`.

58. **Likes, downloads and shares on the Inspirational Scripture posts are counted by database functions, one like per person, and the admin totals leave out practice and test accounts.**
    Participants and supports use `scripture_react` (like toggles; a double tap on download or share counts once), `scripture_my_likes` and, for admins only, `scripture_engagement_summary`.
    `ScriptureEngagement` has one foreign key (to `Scripture`); the person is a plain id and kind, so it adds no second route between User, Participant and Scripture (rule 55).
    A post is named by its day number, the row keeps the Scripture id, so re-ordering never moves a like. Source: `20261013140000_scripture_engagement.sql`; the cohort filter and the final `scripture_engagement_summary(token, cohort)` come from `20261013150000_scripture_engagement_by_cohort.sql`.
    Participants and supports also see the all-time totals (all cohorts; practice and test accounts left out; counts only) beside the three icons, from `scripture_public_counts(token)` (any valid participant or staff session; only posts with a count are returned). They never reset with a cohort; the admin page's cohort filter is separate. Source: `20261024130000_scripture_public_counts.sql`.

59. **Participants get a "view the venue map" reminder on the Saturday (5:00 pm, 8:00 pm) and Sunday (6:00 am) of the cohort's first two Sundays.** It is in `push-reminders` (block g, Africa/Lagos, each window one 10-minute cron run wide),
    goes to every active participant of the running cohort whether or not they have opened the map, is deduped per person by `VENUE_MAP:<service date>:<slot>`, and opens `/me?map=1`, which shows the venue map.
    The two Sundays are counted from the cohort's start date, not from the Planner's class days (week 2 can be moved).

60. **Ticking every Get ready step earns the "FOF N Readiness Badge": the participant's own "I'm fully ready" picture.** While steps are open the Get ready card shows a locked "waits at the end" row; once every step is ticked and readiness is confirmed, a "Your FOF N Readiness Badge is ready" card
    opens `ReadyGraphicSheet` (their photo or initials, name, "I'm fully ready for FOF N class", Download and Share). The card is separate from the Get ready card, so it stays after the Get ready card goes away at first attendance.
    Drawn in the browser (`utils/readyGraphic.ts`), nothing stored. Frontend only.

61. **Group call times are limited from Settings > Group call limits.** `AppSetting` `group_meeting_limits` = allowed days, plus an earliest start and an end time for each day (`dayTimes`; a day without its own times uses the top-level `earliestStart`/`latestStart`; default: Wednesday, Friday, Saturday, 5:00 PM to 9:00 PM). The second time (`latestStart`, key name kept) is when calls must **end**: every call is taken to last 1 hour (`CALL_MINUTES` = 60, internal; 30 minutes until 2026-10-21), so the latest start is an hour before it (Thursday 4:00 PM to 9:00 PM allows starts up to 8:00 PM). A row saved with the old `latestEnd` is read the same way. The meeting-time picker (`GroupMeetingSlotEditor`, `GroupCallCard`) offers only the start times that fit the picked day, and the database trigger `group_meeting_limits_guard` on `Group` refuses a change that does not,
    for everyone except admins (admins and hub meetings can use any slot). The check runs only when a group's day or time is changed, so a group already outside the limits keeps working and can still have its call link edited. Source: `20261014300000_group_meeting_limits.sql`, `20261015100000_group_meeting_limits_per_day.sql`, `20261021100000_group_call_window_end.sql`, `20261021110000_group_call_one_hour.sql`.

62. **Telegram is a backup copy of the bell, for people who connected it.** Staff, admins and participants connect from their profile (Connect Telegram -> one-time code, valid 15 minutes -> bot "Start"; `telegram_connect_code`, `telegram_link_chat`); nobody gets a message before pressing Start. Every row written to `Notification` or `ParticipantNotification`
    (edge functions, triggers and cron jobs alike) fires `telegram_after_notification` / `telegram_after_participant_notification`, which call the `telegram-send` edge function through `invoke_telegram_send` (vault secrets, same as prayers). The message is the same title and body plus "Open the FOF Ops app to respond." (no link: a link would open a browser, not the installed app).
    Participants flagged test or in a Practice cohort are skipped (rule 14). A person can pause (`telegram_set_enabled`), `/stop`, or disconnect; blocking the bot switches the link off (`telegram-webhook`, `telegram-send` on a 403). Tables `TelegramLink` (User) and `ParticipantTelegramLink` (Participant) have one foreign key each and `TelegramLinkCode` none, so no table joins User and Participant (rule 55).
    The bot token and webhook secret are Supabase secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`), never in code. `telegram-webhook` is deployed with `--no-verify-jwt` and checks the Telegram secret header; `telegram-send` accepts only a service-role token. Source: `20261016100000_telegram_notifications.sql`.

63. **The Prayer Lead's own prayer screen opens only once the meeting is on.** A Prayer Lead without full hub access (`HubMeetingPanel.tsx`) sees "Prayer opens here once the hub meeting starts" until attendance has been taken for the week or prayer has started (the clock alone no longer opens it; a week already submitted shows "held and submitted" instead of the waiting card): the same test follow-along viewers use (`showFollowAlongPrayer`). Hub Leads and assistants with attendance permission are not gated. Frontend only.
64. **Hub message alerts say who sent them.** `post_hub_message` prefixes the alert title (bell and push) with "Hub Lead · ", "Assistant Hub Lead · " or "Admin · ", decided from the sender and the hub's `leadUserId` / `assistantLeadUserId`. The stored `HubMessage.subject` is unchanged and earlier alerts are not rewritten (`20261016300000_hub_message_sender_label.sql`).
65. **A support's profile popup shows Call and WhatsApp for everyone except participants.** `HubAuthorProfileModal` shows them when the viewer is not a participant and the profile is a support with a phone number. Frontend only.
66. **An IT support's "Next hub meeting" on their Home is their own hub's.** `SupportHomePage.tsx` uses the hub they are a member of (`HubMembership`); hubs they cover only as IT support never replace it. Only a hub-only support with no hub of their own sees the soonest meeting across the hubs they cover. Frontend only.

67. **Teens use the app; the guardian signs in first; a teen can have a number of their own; one guardian number can carry several teens.** `ParticipantShell` no longer shows the Teen Welcome page (`participant_teen_info` and `TeenWelcomePage` remain but are unused). The guardian's number is `Participant.phone`. A teen's own number is an alias for the same account and password (`ParticipantLoginPhone`, one per teen, unique across the table and never equal to any `Participant.phone`); `sign_in` matches either number, and a session that came in through the own number carries `AppSession.viaTeenNumber`. A Teen Support (or admin, or the owner of the lead) adds it on the teen's card in My Group (`TeenLoginPhone`, `teen_login_state` / `teen_login_phone_set`), and only after someone on the guardian number, same cohort, has chosen a password (`GUARDIAN_FIRST`). Teens ("10 - 17") of the same cohort on one guardian number get a "Who is this?" choice after a guardian-number sign-in (`participant_family`, `participant_switch`, `FamilyPicker`); the guardian number counts as proved once any teen's password on it matches, and a session through a teen's own number is never offered the others. Guardians see everything the teen sees. A session that came in through the teen's own number cannot change or set the password (`TEEN_PASSWORD_FIXED` in `change_participant_password` / `set_participant_password`, read by the app through `participant_session_via_teen_number` to hide Change password; `20261020120000_teen_number_password_fixed.sql`, applied 2026-10-21). A Teen Support can issue the guardian's login and, once the guardian has chosen a password, create a new code ("Guardian forgot the password?", `LoginDetailsCard guardian`) from the teen's card Details at any time; this signs out the guardian and the teen's own number (`participant_login_details` already allows the support who holds the teen; frontend only). Admin lists and profiles label a teen's `Participant.phone` as the guardian's number and show the guardian's name. Source: `20261017100000_teen_login_phone.sql`.

68. **Group views show whether a participant has "Access confirmed".** `AccessChip` reads `participantPushApi.getSignedInIds(cohortId)` (`participants_signed_in`: who has chosen their own password) and shows "Access confirmed" or "Not signed in yet" on the admin Groups page's member rows (adult and teen groups) and on each My Group participant card. While the list has not loaded, or fails, no chip is shown (never a guess). Frontend only; no new database function.

69. **Tapping a Faith project chip opens that project in a popover, on the page it is tapped.** `FaithProjectPopover` takes a participant and loads the project and its edit history itself (read-only, via `faithProjectsApi.getByParticipant` / `getVersions`), so any page can use it. The group people overview (`GroupPeopleOverview`, used by admins and hub leads) uses it: the chip is its own button over the row, and the rest of the row still opens the details. My Group's participant card keeps its own sheet (with the category picker). Frontend only.

70. **Opening a page starts at the top; going back returns to where you were.** `ScrollToTop` remembers a page's scroll position just before you leave it (it wraps `history.pushState` / `replaceState` and listens to `popstate`) and, on a back navigation (`POP`, including steps that only change the query string), scrolls to it again, retrying for about five seconds while the page's list loads and stopping as soon as the person scrolls. Forward navigation and links still start at the top; query-string changes (tabs, filters) still keep the position. The browser's own scroll restoration is switched off. Frontend only.

71. **A support types "/" (or taps the "/" button beside the box) in their group message box for conversation starters, with today's scripture first.** Only the group's own support (`feed.access === 'SUPPORT'`, `StaffDiscussionPanel`) gets it. The list is `CONVERSATION_STARTERS` in `utils/conversationStarters.ts` (frontend constants, edited in code). "/" only counts at the start or after a space, so links and words like "and/or" never open it; typing after it filters by name. The button opens the whole list without typing and puts the starter in at the cursor (after a space if there is already text); tapping outside, typing or Escape closes it. "Today's scripture" is worked out like the Home card (`useTodaysScripture`: the scriptures switch, the first-day setting, the day opening at 3 pm Lagos) and puts the picture's link and a question in the message. Enter picks from the menu only after the arrow keys were used, and Escape keeps it closed until the text changes. A post that carries an Inspirational Scripture picture link shows the picture itself, for everyone who reads the discussion (`MentionText` asks `linkifyText` for `images`; previews and summaries keep a plain link). No database change.

72. **Teens have their own teacher for a class.** `Week.teenTeacherName / teenTeacherRole / teenTeacherBio / teenTeacherPhotoUrl` sit beside the main teacher and are set in the Cohorts week editor (Class card > Teacher > Adults / Teens; the class graphic is shared). `participant_home` gives a teen (`fof_is_teen_age(ageRange)`: "10 - 17" and the same other spellings the app accepts, such as "Below 18") the teen teacher as the week's `teacher` (so the Next class card, the Journey page and the teacher sheet need no change); with no teen teacher set, or for everyone else, it is the main teacher. A Teen Support sees the teen teacher on the Recap page, with the same fallback. The photo and bio only show once a name is set, as for the main teacher. Source: `20261017120000_teen_class_teacher.sql`, `20261017130000_teen_age_variants.sql`.

73. **Follow-up reminders stop once the cohort has started.** In `push-reminders`, the 8 am "Follow-ups need attention" push and the 9 am / 12 pm / 4 pm / 9 pm "No activity on your follow-ups" nudges only run before the current programme cohort's start date (`cohortHasStarted`); from the start date on they are off. A support's own "Follow-up due" reminders (dates they set on a person) and the other follow-up alerts (new assignment, passed on, issues, "is in the app") are not affected. Deployed as v51, built from the repo as it was live (without the undeployed roles change in the birthday alert) plus this change.

74. **An announcement's phone alert uses the subject as its title and the message as its body, for staff as well as participants.** `send-announcement` used to send the title "TCN FOF Ops" with "subject: message" as the body, which repeated the app name (the phone already shows "from FOF Ops") and wasted the first line. The staff bell row and push are now `title: subject`, `body: message`, like the participant ones. The Telegram backup copy (it forwards the bell row) therefore shows the subject in bold with the message under it. Deployed as `send-announcement` v25 (repo copy was identical to v24).

75. **After a participant's first class, the map, the guide and "ready for class" are no longer asked of them.** A participant marked Present, Late or Left early (`hasAttended`) no longer sees Get ready. What is still missing shows as a short list above the tiles (`ph-still-to-do`): "Introduce yourself" if they have not posted their intro, and "Finish your profile" if it is incomplete. They can tick "Introduce yourself" themselves (e.g. they introduced themselves on the call), but only once their support has introduced themselves (`participant_tick_intro`, `ParticipantOnboarding.introTickedAt`, refused with SUPPORT_NOT_INTRODUCED; `participant_onboarding_state.introPosted` is true for a posted or ticked intro and returns `introTicked`). The same rule judges readiness for staff (`utils/supportOnboarding.ts`): ready when `completed`, or attended with intro and profile done; their Map / Guide / Ready steps count as done once they have attended. It drives the support's "x of y ready", the Groups page chip (`summarizeGroupOnboarding`), the Supports page bars and the dashboard's "groups aren't fully onboarded" warning (`evaluateSupports` with `buildOnboardingReadiness` from `cohort_onboarding_progress` and the groups' meeting details, loaded on its own; without it the old `cohort_people` flags are used). Source: `20261018120000_participant_intro_tick.sql`.
76. **A support's own onboarding steps are ticked by the app, and only an admin can tick one by hand.** "Get your group ready" (`SupportOnboardingSteps`) sits at the top of My Group (every tab) and of the support's Home (hidden there once all are done): Introduce yourself (`supportIntroPosted`), participants ready (rule 75), Set meeting time and call link (day, time and link on the group). Supports cannot tick anything. An admin can mark a step done, or undo that, from the Groups page card menu > Support steps (`SupportStepsOverrideModal`, `admin_set_support_onboarding_override`, table `SupportOnboardingOverride`); `onboarding_progress_json` returns each group's `overrides`, which every view above counts as done and labels "Marked done by an admin". Source: `20261018100000_support_onboarding_override.sql`.
77. **A meeting can only be recorded from 10 minutes before its set time until midnight that day; admins any time.** Covers Support-to-participant group meetings (`MeetingAttendance`, `GroupPrayerStatus`), Teen Support meetings (same tables; teen groups now set a day and time on the teen meeting card) and hub meetings (`SupportSession` of type SUNDAY_RECAP and its `SupportSessionAttendance`). The meeting for week N is the first meeting day on or after that week's class date (`fof_meeting_window`, mirrored by `utils/meetingWindow.ts`). The screens update by themselves every 30 seconds (`useMinuteClock`), and do not block while the week is still loading. A group or hub with no day and time cannot record at all. Enforced by the `meeting_window_guard` triggers (`fof_assert_meeting_open`, errors `MEETING_WINDOW_CLOSED: opens|closes` and `MEETING_TIME_NOT_SET`); not checked for admins, requests without an app session (cron, service key), practice cohorts, or deletes. The screens show "Opens …", "Recording has closed" or "Set your meeting day and time first" instead of the steps (`MeetingWindowNotice`). Source: `20261018110000_meeting_recording_window.sql`.
78. **Meetings have no length.** Durations are no longer shown or used anywhere: slot labels are day and time only, the Join button is live from 10 minutes before the start to an hour after it (`isCallJoinable`), the hub follow-along prayer shows from 15 minutes before to an hour after. The `meetingDurationMins` columns (Group, SupportHub, HubLeadsMeeting) were dropped by migration `20261019100000_drop_meeting_duration.sql`, applied live on 2026-10-17 after the app version that no longer writes them was deployed; the two hub RPCs keep an ignored `p_meeting_duration_mins` argument. An app tab left open from before still writes the Group column directly, so it must be reloaded.
79. **Admins see hub meeting reports, and this week's numbers as they come in.** The Hubs page "Hub meeting reports" card lists each hub for a week (the current one by default, earlier ones one tap away): Submitted / Started, not submitted / Not started, who and when, attendance, prayer and the notes, with "Read report" for the full notes and every member's mark (`supportSessionsApi.getHubReportsForWeek`). The Group meetings page has the same for groups ("Group meeting reports": Done / Not done, who joined, the prayer focus and the Support's written notes, which live as a MEETING note on the week's prayer-focus participant, so a week with no focus participant has no text). Both cards fold away and move to the newest week when one starts. The dashboard has a "Hub reports · Week N: x of y submitted" line, and its Class attendance and Group meetings tiles show the week in progress ("This week so far", no good/bad verdict) once anything is recorded for it; finished weeks are judged as before. Frontend only.
80. **Admin pages share one calm top.** A section's tabs (Participants, Groups, Schedule, Resources) show right under the page title, drawn by `PageHeader` through `SectionTabsContext`; a page with no `PageHeader` keeps the strip the shell draws above it, so no section loses its tabs. Groups has a Meetings tab (the Group meetings page, `/group-prayers`) beside Allocation, and its header keeps only "+ New Group" and the ⋮ menu (Allocation is the tab). The title line says where things stand ("16 overdue · 1 in progress"; "Week 2 · 0 of 18 done · 8 groups have no meeting time"). Group cards show one status word, one bar and setup only when something is missing; the people and the five steps open in a sheet (`GroupCard`), where each person has chips for their steps, sign-in, phone and last seen (existing `participants_app_details()`). When nothing is recorded for a week, Group meetings says so and why, with the groups that have no time one tap away. A page header keeps one or two primary actions; the rest (settings, export, add event) sit in the ⋮ menu. The Dashboard's "right now" lines share one card, and its subtitle says what needs the admin. Attendance shows its rate and counts in one card. On Hubs the Hub meeting reports card starts closed and the old recap strip is hidden; the Group meetings card starts open. Supports cards follow the same pattern: one status word, one onboarding bar, chips only for what is off (no meeting time, trainings behind), the five steps under Details. "Finished onboarding" is one rule, `participantFinished`, used by the Groups, Supports, Onboarding and group-overview counts. Frontend only.
81. **An admin can pause automatic reminders from Settings.** Settings > Programme > "Pause automatic reminders" has one switch per group: "Class and service reminders" (participants' Saturday/Sunday class nudges and the venue-map reminders) and "Support schedule reminders" (supports' per-activity reminders). The state is `AppSetting` key `reminder_pauses` = `{ class?: 'YYYY-MM-DD' | 'ALWAYS', activities?: ... }`; a date means paused through that Lagos day, `ALWAYS` stays until switched off. `push-reminders` (v54) reads it on every run and skips the paused group. Other reminders (group and hub meetings, recap and manual, follow-ups, birthdays) are not affected. Source: `supabase/functions/push-reminders/index.ts`, `ReminderPausesCard`.
82. **An announcement sent to hub roles says so.** `Announcement.targetHubJobs` (migration `20261019120000_announcement_target_hub_jobs.sql`, set by `send-announcement` v26) holds the hub roles it was sent to; the announcements feed and the support Home card show "For Hub Leads" (and the like). Announcements sent before this have no label.
83. **A new Inspirational Scripture opens at 12:00 AM Lagos (midnight, on its own date) and is announced at 5:00 AM to participants and supports, one line a day.** Since v56 the send lives in `sendScriptureDrop`: participants with an active login (claim `SCRIPTURE:<date>` in `ParticipantReminderLog`) and every non-test support in the current cohort (`UserCohort`, claim kind `SCRIPTURE` in `PushReminderLog`), bell row plus push. `{ "scriptureNow": true }` with the project's secret key sends today's at once and nothing else (403 without the key). `push-reminders` (block c2 in the participant section) sends a push and a bell row to every participant with an active login once the cohort has started, from 5:00 AM Lagos (`SCRIPTURE_PUSH_MINUTES`, deployed v55; a late run catches up within 3 hours); the post itself opens in the app at midnight (`scriptureDayIndex`), only when the day's post exists and scriptures are switched on. Open tracking is not possible, so everyone gets it; the line cycles through ten texts that tell them to read the post and do its exercise. Deduped by the `SCRIPTURE:<date>` claim in `ParticipantReminderLog`. Edge function only, no migration.
84. **An admin can open recording for one hub or group and week, outside its window.** Admins > Hubs or Groups > card menu > "Open meeting" opens that week's meeting for 24 hours (`MeetingRecordingOpening`, migration `20261019140000_meeting_recording_opening.sql`: `admin_open_meeting_recording`, `admin_close_meeting_recording`, `meeting_recording_opening`; `fof_assert_meeting_open` lets the write through while an opening is live). The app reads it with `useRecordingOpening`, so the "Opens …" notice gives way to the recording steps. Needed for meetings held in a week with no Week row (the break week) or missed. Rule 78's window is otherwise unchanged.
85. **A support whose group call starts too late for the limits is asked to change it.** `MeetingTimeFixPrompt` (AppShell, supports only, not in a Practice cohort) reads the support's own adult group (`groupsApi.getForSupport`) and the saved limits (not the defaults), and when the call is on an allowed day but starts after that day's last start (rule 61) shows a required popup (popup queue place `meetingTimeFix`) with an apology, that calls run for an hour and must finish by the day's end time, a Thursday note that church prayers start at 9:00 PM, "Change the time" (My Group) and "Later" (hidden until the next launch). A day that is no longer allowed is not asked about. Nothing is changed for them; it stops once the time fits. Frontend only.
86. **The Hubs page shows how many women and men are in each hub.** Under each hub's name and support count, and in the page title line for all hubs, the hub members' gender from `User.gender` (normalised with `normaliseGender`): "4 women · 2 men", plus "1 not set" when a gender is missing. Frontend only (`AdminHubsPage.tsx`).
87. **The Supports page adds up and says why.** The title line reads "N supports (x leading a group · y not)"; the tabs are Leading a group x · Needs attention · Keep an eye on · On track · No group y (the first tab is only supports leading a group; those leading none are under No group, rule 126), so they add up to the title (a support leading two groups is counted once, by the weaker group, and a health tab shows all of that support's group cards). A card's status label carries its reason ("Keep an eye on · onboarding 10 days (limit 7)", "missing weeks 1, 2"). The onboarding line is "x of y ready" by the same rule as the Groups page (`participantFinished` over all the group's members; an admin "ready" mark counts everyone, rule 76), amber only past the limit, "Onboarded" when the group is; the five step chips stay under Details. Before any week is judged the line above the tabs says how many groups are not fully onboarded. The group line also names the support's hub ("Group 13 · Hub 2"), and gender and age range show as two small outlined tags on that line (the hub line for supports without a group), notes as "★ Notes", and trainings as "Missed n of m trainings" (only trainings already held can be missed; otherwise "Trainings a/m"). Frontend only (`AdminSupportsPage.tsx`, `TrainingPill.tsx`).
88. **A new group's name never repeats one already used in the cohort, archived groups included.** The database keeps `Group` names unique per cohort (`Group_cohortId_name_key`), and an archived group keeps its name. "Empty groups" on New group and the group builder read every name in the cohort (archived and teen groups included) before choosing the next "Group N"; a restored saved draft whose new group's name now belongs to an archived group gets the next free name (a live group of that name is left alone, as it may be the draft's own from an earlier run). If the names cannot be read, Empty groups stops with a message and the builder warns. Frontend only (`AdminGroupsPage.tsx`, `GroupEngineWizard.tsx`, `nextGroupNames`).
89. **The group Members popup starts on the support's gender and shows who each person is.** Admins > Groups > a group > Members: each row shows gender and age range as small outlined tags and the sign-up status as a coloured chip (`REGISTRATION_STATUS_META`; a teen marked No Response shows No Response). Chips: Women / Men (the support's gender is chosen when it opens and says "like the support"; with no support it opens on Everyone) / Everyone, an Ages row (several at once), plus a switch that is on by default hiding No Response and Will Join Next Cohort. While teen handling is on, an adult group does not offer teens (age range 10 - 17); they go through a Teen Support. Gender and age are matched on their tidied values (`normaliseGender`, `normaliseAgeRange`), and each chip's count is what that chip would show. The list runs readiest first: Access Confirmed, then Login Shared, then Registered, then the rest, then those not joining. People already ticked always stay in the list so they can be unticked. The subtitle reads "N selected · x women, y men · Support: woman". Frontend only (`AdminGroupsPage.tsx`, `MembersModal`).
90. **Teen questions reach the joint Q&A first, and a Teen Support can ask for a teen.** A Teen Support adds a question for one of their own teens (the teen's group support, or an admin; teens only) any time, for any week of the cohort, the next class by default (`support_ask_manual_question`); they can change the text, week and name setting until it is marked for class or replied to, and only if they typed it and are still the teen's Teen Support (`support_update_manual_question`, `20261022140000`). `ManualQuestion.askedById` records who typed it (NULL when the participant asked); `hideName` makes the admin Q&A list read "A teen asked". A teen's name is hidden by default whoever asks (`ask_manual_question` sets it from the age range). `list_manual_questions` returns `isTeen` (`fof_is_teen_age` on the participant), `hideName` and `askedByName`; Admin > Feedback > Questions tags teen questions and puts them first while "Teens first" is on (default). A teen's Week page shows "Ask a question" even before the manual is out, and "Sent by X for you" on a question their support added (`participant_home` returns `askedByName`). Source: `supabase/migrations/20261022100000_teen_questions.sql`, `TeenQuestionsCard.tsx` (Teen Support Home and Classes), `AdminFeedbackPage.tsx`, `ParticipantWeekPage.tsx`.
91. **One number, several people, one login.** Everyone active in the same cohort on the same `Participant.phone` (`shared_number_people`: a couple, a parent and their teens, siblings) shares one login. After signing in they get "Who is using the app now?" with each person and an Adult/Teen tag (`participant_family`, `participant_switch`; never for a session that came in through a teen's own number, rule 67); the phone remembers the choice; to change, they tap their picture at the top (Switch account in `ProfileMenu`). Choosing or changing a password on one profile sets it for every login on the number (`set_participant_password`, `change_participant_password`); older households with different passwords keep working (sign-in tries each, rule 3) until the next change. Issuing a login to someone whose number already has one gives them that password or the same waiting code; a new code resets every login on the number and signs them all out, and the login card says who shares it and warns before a reset (`participant_login_details` returns `household`). Saving the phone for notifications saves it for everyone on the number (`save_participant_push`), so each person's alerts reach it; when one phone is saved for more than one active person in the same cohort, each alert starts with the person's first name, titles skipped ("Tolu: …"), has its own tag, keeps `data.readTitle` for marking the bell copy read on tap, and its link carries `?for=<participantId>` so opening it switches to that person (`sharedPhoneLabeller` in `_shared/webpush.ts`, used by push-reminders, send-announcement and notify-users; `ParticipantShell` reads `?for=`). Sign-up form: a different name on a number where someone else has already signed up is a new person, with an admin alert "New sign-up on a shared number"; a form still claims a prospect a support added on that number who has not signed up only when each word of the shorter name is in, or contains, a word of the longer one, titles and accents ignored ("Mrs Ade" for "Bola Ade", "Bimbo" for "Abimbola", not "Tunde Adeyemi" for "Tolu Adeyemi"), and not when the form's gender and the prospect's gender are both known and differ (`receive-form-registration` v20). Source: `supabase/migrations/20261022110000_shared_number.sql`, `FamilyPicker.tsx`, `LoginDetailsCard.tsx`.
92. **Teen groups have their own call limits.** Settings > Group call limits has Adult groups and Teen groups tabs. Teen limits are `AppSetting` `teen_group_meeting_limits` in the same shape as `group_meeting_limits` (rule 61; saved live on 22 Oct as Saturday and Sunday, start 5 PM, end 9 PM); until an admin saves them, teen groups follow the adult limits (`teen_group_meeting_limits()` falls back). `group_meeting_limits_guard` judges a teen group (`Group.isTeenGroup`) against the teen limits and every other group against the adult ones; the Teen Support's picker on My Group offers only the teen days and times (`useGroupMeetingLimits(teen)`). Source: `supabase/migrations/20261022120000_teen_call_limits.sql`, `GroupCallLimitsCard.tsx`, `TeenMeetingCard.tsx`.
93. **A Teen Support starts and ends their weekly teen meeting.** On My Group the teen meeting card shows the meeting time with a pencil (not "Change"). While recording is open (rule 77's window: 10 minutes before the call until midnight that day) the button is **Start meeting**: it opens "Meeting started · <time>", Who's here? (Joined / Excused / Missed for each teen) and notes; **End meeting** saves it (the same `teenMeetingsApi.save`, `metOn` = today) and the first save tells admins as before. A saved meeting reads "Meeting ended · <day>" with a pencil to edit while recording is open. A teen group's People tab reads "Teens", and the Teen Support's questions card (rule 90) sits under the meeting card. Frontend only (`TeenMeetingCard.tsx`, `SupportParticipantsPage.tsx`).
94. **A teen card records parent consent, can't reach and not interested.** On a teen's card a Teen Support ticks "Parent or guardian has agreed" (`FollowUpContact.guardianConsentAt`/`guardianConsentById`); until then the next step asks for consent (after the guardian's login). The ⋮ menu has Mark as **Can't reach** (the teen No response flag, rule 28: they keep their Teen Support and status, reminders skip them; "Reached them" clears it) and **Not interested** with an optional note (`notInterestedAt`/`notInterestedNote`): this only reports it, an admin decides and marks them Not Interested on Follow-ups. Setting one clears the other. Only an admin, the Teen Support leading the teen's group, or the owner of their follow-up may change these (`teen_card_mark`). The admin Dashboard Teens card shows "Parent consent: x in · y not yet" and "Teens to follow up" (can't reach and not interested, oldest first, with their Teen Support and the note). Source: `supabase/migrations/20261022130000_teen_consent_outcomes.sql`, `ParticipantCard.tsx`, `AdminDashboardPage.tsx`, `computeTeenOverview`.
95. **Someone on the same number can be added from the app.** A signed-in participant (not through a teen's own number) adds a husband, wife, child, brother or sister from Profile > People on this number only ("Add someone on this number", `/me/add-person`; not in the picture menu, which only switches account, three steps with the form's questions). A teen needs "I am their parent or guardian" ticked. `participant_add_on_number` -> `household_add_person` writes a form record ("Added in the app by …", so rule 1 holds), a contact, a participant on the same `Participant.phone` and that number's login (rule 91); adults are ACCESS_CONFIRMED, teens TEENAGER with parent consent and `assign_teen_contacts`; admins get "New person on a shared number". The same name twice on a number is refused. A Teen Support (or an admin) adds a brother or sister from a teen's card ⋮ > Add a brother or sister (`support_add_sibling`): same guardian number and login, consent when ticked, and a ready WhatsApp line for the parent. Admins control it in Settings > Add someone on this number (`AppSetting` `add_on_number` = enabled + until week n; open until the end of week n's class day; missing = on until week 2; `add_on_number_state`). Source: `supabase/migrations/20261022150000_add_on_this_number.sql`, `ParticipantAddPersonPage.tsx`, `ParticipantProfilePage.tsx`, `ParticipantCard.tsx`, `AddOnNumberCard.tsx`.

96. **The Dashboard's Class attendance and Faith projects cards count only people in a group, and say so.** Someone not placed yet has no support to mark or chase them, so they are left out of both: Class attendance expects active participants with a group (`cohort_people` `groupId`, teen groups included) and only counts their marks; Faith projects is saved projects among those same people "of N participants in groups" (`faithProjectsApi.getSavedParticipantIds`). Both cards carry "In groups only" / "in groups". The Participants card still shows how many are not in a group. Source: `components/dashboard/healthModel.ts` (`buildWeekStats`, `faithProjectCounts`), `AdminDashboardPage.tsx`.

97. **A group's support shares or resets a participant's login from the card's ⋮ menu.** On My Group > People the menu says "Share login details" until the person has chosen their own password, then "Reset password" ("Login details" while that is unknown; `participants_signed_in` decides the label, and what the login card last loaded overrides it, so a reset flips it back to Share). Archived participants get neither. Either opens a sheet with the login card (`LoginDetailsCard`): it creates the first-time code if there is none and builds the WhatsApp, copy or email message; once a password is set it goes straight to "Create new code", which replaces the password, signs them out and resets everyone on the same number (rule 91). A teen's login is the guardian's. Who may do it is unchanged: `participant_login_details` allows admins, the group's support, a support covering them, and their follow-up owner or IT Support; a non-admin cannot issue a first login without a sign-up form. Source: `components/groups/ParticipantCard.tsx`, `components/participants/LoginDetailsCard.tsx`.

98. **The prayer streak counts days with an Amen, never resets the total, and a milestone is celebrated once.** A day counts when the person says Amen to at least one corporate prayer that Lagos day (`CorporatePrayerCheckin.amenAt`); it is worked out on read by `prayer_streak_calc`, with no counter and no nightly job. Only days that had a prayer session count as prayer days (a day with none never breaks a streak, and today is never a miss while it is still going); sessions of test slots and slots outside the person's hub audience are ignored; each Monday-to-Sunday week covers one missed day while a streak is running, a second miss in that week ends it. Total prayers finished never resets. Badges at 5, 10, 21, 30 and 70 days (the whole 10 weeks) are written to `PrayerMilestone` the first time they are seen; `prayer_milestone_seen` marks the celebration shown, always tells the participant's support once, and posts to the group discussion in the person's own name only if they switched "Tell my group" on (off by default; participants only). Group total = Amens by the group's participants in the last 7 days; there is no personal ranking. Same people as `prayer_caller`: adult participants and supports, never teens, only while prayers are running. Source: `supabase/migrations/20261024100000_prayer_streak.sql`, `PrayerStreakParts.tsx`, `MilestoneCelebration.tsx`, `PrayPage.tsx`, `ParticipantFaithPage.tsx`.
99. **"I'm here" and "I can't come today" tell the support and never mark attendance.** While the Sunday attendance is open and the participant is not marked, the attendance card offers both; the answer (and the reason, for "can't come") is kept once per week in `ClassSignal` and sent to the participant's support as a bell and push (`participant_class_signal`, through `invoke_discussion_notify`), once per change of answer. It needs the open attendance window (rule 12) and is refused otherwise. Source: `supabase/migrations/20261024110000_class_signal.sql`, `AttendanceCountdownCard.tsx`.
100. **"Mark done" on a schedule activity asks "Any notes?" first, and the note is optional.** On the support Schedule (Up next and each activity card) and Home Today list, tapping **Mark done** opens the same `TaskNoteSheet` as checklist tasks an admin set; **Done** saves with or without a note, **Cancel** saves nothing, and un-ticking needs no popup. The note is kept in `SupportActivityCompletion.note` (empty becomes null) and shown to admins under the activity in the completion overview drawer. Source: `supabase/migrations/20261024120000_activity_completion_note.sql`, `supportActivityCompletionsApi.markDone`, `SupportSchedulePage.tsx`, `SupportHomePage.tsx`, `AdminCompletionOverviewDrawer.tsx`.
101. **A support can mark everyone not yet marked as Present in one go, after a confirmation, and only while the register is open.** On the support Attendance page the button shows only once attendance has been started, and covers just the people on screen (the search and group filter apply) who have no mark yet; each one is saved one at a time like a single tap (`mark_shared_attendance`) and it stops at the first failure, nobody already marked is touched, and it is hidden once the register is locked (rule 12 still decides who may write). The "Closes in" chip reads minutes or hours and minutes, never minutes:seconds. Frontend only: `SupportAttendancePage.tsx`.
102. **The Resources hub lists the most recently uploaded resource first, and anything that waits on the network shows a spinner.** The supports' and admin Resources list (`ResourceHubModal.tsx`) sorts by `Resource.createdAt`, newest first, also after an edit. The participants' Resources page still lists alphabetically: that order comes from the `participant_home` database function, so changing it needs a migration. "Open the manual" (support Classes and participant Week) disables itself and shows "Opening…" while the illustrated manual is fetched, and switching to another person on a shared number shows a full-screen "Switching profile…" until the app reloads. Frontend only.
103. **Repeated reads are shared, and a few short-lived answers are kept; a change the person makes throws them all away.** `lib/supabase.ts` gives identical overlapping GET reads and the read-only functions listed there one network request. Answers from the listed read-only functions are kept 3 seconds, and three small reference tables (AppSetting, Scripture, FaithProjectCategory) 20 seconds, per signed-in session; only a successful answer is kept. Who is in which cohort, group, tag or label is never kept, because those follow an admin's change at once. Any write that is not on the harmless list (`HARMLESS_POSTS`) clears everything kept and everything still on its way. A function may be added to the shared list only if its definition never writes (my_app_nudge and practice_pulse write, so they are never shared). The Attendance pages (support and admin) wake only when something is about to change: every second in the last minute before the register closes or the class day starts, otherwise at most every 15 seconds (`useDeadlineClock`); both pages show "Closes in 49 min" / "42 sec" instead of minutes:seconds. After sign-in the app starts the notification, resource and hub-activity reads at once instead of after the cohort and week lists, and an idle browser downloads the other bottom-bar screens one at a time (skipped on Data Saver and 2G).

104. **A support's activities and tasks are one list, and a task can have a date instead of a class week.** The support Schedule shows the programme's activities and the support's tasks on one page (filter All / Activities / Tasks; the old Checklist tab is gone, and `?tab=checklist` opens the Tasks filter). **Tasks never depend on the week picker:** the page loads every task the support has in the cohort (`getForCohort`: the cohort's class weeks plus date-only tasks) and lists them by when they are due, in one "Your tasks" block (Overdue, Today, Coming up, No deadline, each soonest first), whichever week, day view or day-strip day is selected; the week picker, Today / Tomorrow / Full week and the strip change only the activities. A task's due date is its own `dueDate`, or its weekday inside its class week (`effectiveDue`) for older admin tasks that only name a day. A `SupportChecklistItem` may now have `dueDate` (a Lagos calendar day) and `cohortId` and no `weekId` (check `SupportChecklistItem_week_or_date`): that is how the 3 rest weeks after a cohort carry tasks, since they have no `Week` row. A task a support adds is kept with the class week its date falls in (`weekIdForDate`, else the week on screen, else week-less), but where it shows does not depend on that. The rest weeks are `restWeeksAfter` (the day after the cohort's end date, or a spare week after its last class, then three Monday-to-Sunday weeks, as the Planner lays them out); their dates are fixed when the task is added and do not move if the Planner later moves. Admins add tasks with `admin_add_support_task` (class weeks and/or dates, target Everyone, a tag, chosen people or **Group leaders** = supports with an unarchived group in that cohort); recipients are resolved at that moment, so people who join or start leading later do not get it (rule 21). `admin_rest_tasks` lists the week-less ones; `admin_delete_checklist_task` with no week removes a task everywhere. A support can add and remove their own tasks (title and optional deadline); admin tasks show "From admin" and stay locked (rule 21; the guard now also locks `dueDate` and `cohortId`). Home shows them inside the one "Today" card (today's activities, then a Tasks block with the first 3 and a count of the rest) instead of a separate checklist card: this week's tasks and, once the last class week is over, the open or upcoming rest-week tasks. The bell alert for a task with dates opens `/support/schedule?tab=checklist&rest=1`, which lands on the Rest weeks view **Unfinished tasks carry on by themselves:** because the list is not tied to a week, an open task from an earlier class week simply stays in it (red "Was due ..." once its day has passed) and is tagged "Carried over from Week N" when its week is before the week the app treats as now (`getIdealWeekForCohort`, as Home does). Ticking it ticks the original row, so that week's admin report still counts it. Nothing is copied or moved in the database. Home's Today card lists the same tasks, soonest due first. Source: `20261024140000_support_tasks_deadlines.sql`, `SupportSchedulePage.tsx`, `AddTaskSheet.tsx`, `AdminSupportTaskModal.tsx`, `utils/checklist.ts`.

105. **A class picture can be reused, and a picture another class still uses is never deleted.** In the week editor (Cohorts > a week > Class card) the class graphic and each teacher photo (adults and teens) have "Use an earlier one", which lists only that kind of picture from earlier classes in any cohort except Practice (`earlierClassImagesApi`, read from `Week.classGraphicUrl / teacherPhotoUrl / teenTeacherPhotoUrl`; nothing is uploaded). Because two classes can now share one stored file, `removeClassImage` first checks that no `Week` still points at the URL in any of the three columns and leaves the file when it cannot check. Recap and manual documents already had "Use an earlier one" (`list_earlier_class_documents`). Frontend only. Source: `EarlierImagePicker.tsx`, `CohortsPage.tsx`, `supabase-api.ts`.

106. **Attendance opens on the class still to come.** The support Attendance page picks the week with `nextClassWeek` (today's class on a Sunday, otherwise the coming one; the last week once classes are over), not the last class already held; while it shows a class that has not opened, a button jumps to the last class held, and the week picker reaches every earlier week. The admin Attendance page keeps its old default (the class that has happened) because admins finalise and follow up the previous class from Monday to Saturday. Frontend only. Source: `SupportAttendancePage.tsx`.
107. **Email is optional and does not count towards profile completion; the completion roll-up sits on the Participants page.** `profile_completion_for` scores photo, gender, age range, date of birth, occupation (the lead's occupation counts) and every required requested field that applies; email is not in it, and the participant's own profile no longer lists Email as something to finish (it is labelled "Email (optional)"). The admin Participants page opens with a "Profile completion" accordion (closed by default) that counts active, non-test participants of the cohort, split In a group / Not in a group and All / Adults / Teens, from the same per-person scores the list's Profile filter uses (`cohort_profile_completion`); "Show who is incomplete" applies that filter. Source: `20261027100000_profile_email_optional_birthday_on_the_day.sql`, `components/dashboard/ProfileCompletionCard.tsx`, `utils/profileCompletionSummary.ts`.
108. **Birthday alerts go to admins 2 days before, 1 day before and on the day.** `birthday_alerts_due` returns 0, 1 and 2 days away; `push-reminders` (v59) sends from 8 am Lagos with "Birthday today / tomorrow / in 2 days" and `BirthdayAlertLog` stops a repeat per person, date and lead time. Only admins and Team members with the Birthdays module are told; the person is not messaged. The admin Dashboard shows a Birthdays card (today and the next 14 days, same `birthdays_list` feed as the Birthdays page, admins only). Source: same migration, `supabase/functions/push-reminders/index.ts`, `components/dashboard/BirthdaysCard.tsx`.
109. **The Keep an eye on / Needs attention chip on the Participants list opens a "why and next steps" pop-up.** The pop-up lists the weeks behind the status (Sunday classes that do not count as attended, with how; group meetings marked Missed; weeks with no class mark are shown but not counted), restates the rule (one miss = Keep an eye on; the programme rules' Sunday and meeting miss counts together = Needs attention) and gives next steps for that level, naming the group's support, or saying the person or group has none; a teen's steps go through their parent or guardian. The weeks come from `buildMissDetails`, which counts exactly as `evaluateParticipants` does, so the list always matches the numbers behind the chip. Frontend only. Source: `utils/participantHealthReason.ts`, `components/participants/HealthReasonModal.tsx`, `pages/AdminParticipantsPage.tsx`. The chip carries a › chevron so it reads as something to tap.
110. **On the day of a hub meeting, the support's Home says so.** From the start of the meeting's day until an hour after its start (Lagos time, the same window the call can be joined), Home shows a green "Hub 1 meeting today" banner (same look as the "on now" one) above the Next class card, for each hub the support belongs to (a hub-only support with no hub of their own sees the hubs they cover). Its Join button opens the call link directly once the call can be joined (10 minutes before); before that it says "Starts 8:00 PM" with an Open button to the meeting page. The "Your hub" row reads "Today" instead of the weekday. While a hub's meeting is live (attendance marked in the last hour and not yet submitted; the server counts 3 hours, Home shows the banner for one) a green "<Hub> meeting is on now" banner names that hub, one per live hub, and opens that hub's meeting (`?hub=<id>`); an IT support covering several hubs therefore sees which hub is on, not just their own. Group meetings have no such banner (their Home row already shows the meeting). Frontend only; day and time come from the hub record. Source: `utils/joinWindow.ts` (`meetingTodayState`), `pages/SupportHomePage.tsx`.
111. **PostHog records page views, a click on every button and link (by build-time name only), and session replays, and shows signed-in people by name.** Off unless `POSTHOG_KEY` (or `VITE_POSTHOG_KEY`) is set (the project's public `phc_` key; optional `POSTHOG_HOST`, default US; `vite.config.ts` passes through only those two names). It loads after the first screen like Clarity, in its own chunk. `vite-plugins/nameClickTargets.ts` adds a `data-attr` to every `<button>`, `<a>`, `NavLink` and `Link` at build time (an existing `data-attr` is kept), named `Component.what-it-says` from text written in the source only (static text, then a literal aria-label or title, then the link's `to`, then the click handler's name); the source files are untouched, so new buttons are named automatically. Autocapture is limited to clicks on elements with a `data-attr`, and `cleanEvent` in `lib/analytics.ts` runs on every event before it leaves the browser: it drops on-screen text and every attribute except the name, keeps a `button` and a `page` property, strips query strings and ids (UUIDs, long numbers) from every URL and path property. Never log a name, number, email or free text through `track(event, props)`. Session replay is on (`session_recording: { maskAllInputs: true }`, owner request 2026-10-29): typed input stays masked, but text on screen, names included, shows in recordings. Everyone signed in is identified with person properties `role` and `name` (owner request 2026-10-29, so people show by name, not id); never a phone number or email. Signed-in staff are identified by app id; a signed-in participant is identified by a pseudonym, SHA-256 of `<participant id>:fof-analytics-v1` (`participantPseudonym`), with role `PARTICIPANT`, never the record id. It equals the database's `analytics.pid()`, so a participant's devices merge into one person and PostHog's warehouse views (rule 112) line up. The suffix ships in the bundle, so the pseudonym is not a secret (anyone holding a record id can compute it); it keeps the record id itself out of PostHog. `setAnalyticsUser` does the hashing (callers pass the plain user) and, using PostHog's own stored identity so it holds across the reload a person switch does, resets PostHog whenever the identified id is not the person now signed in: on sign-out, on switching person on a shared number, before a participant's hash is ready if a staff or raw record id is still identified, and for browsers an older build identified by raw record id. Two people are never merged. Without the key nothing is loaded or sent. Source: `lib/analytics.ts`, `vite-plugins/nameClickTargets.ts`, `main.tsx`, `App.tsx`.
112. **PostHog's warehouse reads only the `analytics` schema, through `posthog_reader`.** The role can SELECT from `analytics` views and nothing in `public` (tested: `User`, `Participant`, `AppSession` are denied), is read-only, limited to 3 connections and a 60 s statement timeout, and has its password set live, never in a file. The views cover Cohort 10 onwards (start date on or after Cohort 10's, not Practice, not archived, no test accounts): `cohorts`, `weeks`, `participants` (pseudonym, status, in group, teen, gender, age range, added date, profile percent and which of photo, date of birth, occupation exist), `class_attendance`, `group_meeting_attendance`, `hub_meetings`. A person is `analytics.pid(id)`, a SHA-256 pseudonym with a fixed public suffix (not a secret: it keeps ids out, it does not stop someone who already holds an id from matching it), never the id; no name, phone, email, date of birth or guardian detail is exposed. A new view must follow the same rule and be granted to the role. Source: `20261028100000_posthog_reader_analytics_views.sql`.
113. **A participant is never left at a dead end while they wait: no group, a locked step or a missing manual says what it waits on.** Not in a group yet (`participant_home.group` null): My Group shows "You'll be placed in a group soon" with "Need help before then?"; Home's Group call card says "After you're placed in a group" and its Get ready / still-to-do intro step "Opens once you're in a group"; People says they are not in a group yet (not "first in your group"); Profile's Your support row says "Once you're in a group". Home's Message support tile becomes **Get help** whenever there is no support to message (no group, or no number for the support) and opens the same Help sheet as the profile menu's Help (`NeedSupportButton`), passed to pages as `openHelp` through the shell's `Outlet` context (`components/shellHelp.ts`, shared with the staff shell since rule 114). Under the locked "I have all I need" button Home says why (only the intro left and waiting on the support; a step that opens later; or tick the steps above). Rules 60 and 75 still decide what counts. Home says "Welcome" before the first class and "Welcome back" after. Resources › Class materials lists each week whose manual is out as "Week N manual", which opens the week page's own manual path (`/me/week/N?manual=1`), above that week's recap document. My Journey with no class weeks says "Your journey starts soon" instead of counting 0 of 0. The Welcome guide (`public/guides/welcome-to-fof.html`) opens at the app tour, not the install steps, when the participant arrives from the Get the app page (navigation state `fromAppSetup`); its screens match the manual-first week, Discussion/Meeting tabs and opt-out corporate prayer. The service worker serves `/guides/` files (this guide, the Help → App guide's page, `content.js` and screenshots, the role guide) stale-while-revalidate from their own `guides` cache (`sw.ts`): the saved copy shows at once and the latest is fetched in the background, so an edited guide shows on the next open with no version to bump, and the guides' screenshots never push the class manuals out of `runtime-assets`. Every participant page has a "?" tour, People included. Frontend only.
114. **A new support is told what comes next: not placed yet, an empty group, a plain profile ask and one short first run.** A support with no group of their own and no hub (`get_my_hub` answered with `hub: null`, `AppDataContext.myHubLoaded`) sees "You'll be given a group soon" on My Group (`supports/NoGroupCard`, with **Need help?** opening the profile menu's Help sheet through `useShellHelp`) and "You're not in a group yet…" in Home's Your group card; a hub-only support, or one whose hub has not loaded, still gets "Open My Hub". Home waits for the support's groups to load (`null` until then, and a failed refresh keeps what was loaded) before saying they have none. "Get your group ready" (rule 76) says "Once people are added to your group, you'll see who's ready here" while the group is empty. The Finish your profile card (`ProfileCompletionStrip`) says "Every support needs a complete profile. Please finish yours." (no mobilisation claim). Home says "Welcome" and "<cohort> starts soon" before the cohort's start date. The support Welcome is "Welcome to FOF" (not V2); the Home tour is five steps, starting at Get your group ready; My Group's tour starts with the not-placed card when there is no group. The Get the app sheet does not open in the same launch as the Welcome and its tour (`TourContext.welcomedThisLaunch`, reset when the person changes); Home's notifications banner still asks. Plain empty states: no activities "assigned to you yet" (not "your tags"), Resources "Guides and files from the FOF team will appear here" for non-admins, and My Hub explains that the FOF team adds you to a hub. Frontend only.
115. **Before a cohort starts, the admin Dashboard leads with what is left to set up, and empty numbers stay grey.** While the cohort is upcoming, "Get <cohort> ready" sits right under the cohort strip (`readinessItems` / `ReadinessChecklist` in `AdminDashboardPage`), checking weeks, schedule published, mobilisation target, participants, groups, every group has a support, everyone placed (from `cohort_health` and the target), plus hubs (`SupportHub` for the cohort), corporate prayer start week (`corporate_prayer_overview.startWeekNumber`) and daily scriptures (any `Scripture` row: designs are shared by every cohort); rule 116 groups these into five steps. An item whose data could not be read is left off. The header then says "N setup steps left before <cohort> starts" (counted once those extras have loaded) instead of "Nothing needs you right now", and Needs attention says "Nothing else needs you" while setup is open. `RegistrationOverviewCards` (rule 33) shows grey "Nothing yet" tiles, not green ticks, until someone is registered. The Planner's "Right now" reads "<cohort> · Getting ready" before the first class. The Welcome for other staff roles is "Welcome to FOF Ops" (not V2; full admins get none, rule 116) and the Dashboard tour opens on the cohort strip, then the checklist. Plain empty states: Faith projects and Start attendance treat an empty cohort as such only after participants have loaded; Supports explains how supports join; Feedback points to the Surveys page; Announcements go to supports, participants or everyone. Frontend only.
116. **A full admin's first run is the setup checklist, not a tour, and notifications are asked for when there is something to tell.** The checklist (rule 115) shows five verb-first steps: Set up the cohort and its weeks, Publish the schedule, Get people into groups (target, participants, groups, supports, everyone placed), Set up hubs, Prepare prayers and daily scriptures. A step of several checks says "Next: …" for the first one still open and Open goes to that page. It has a progress bar (`aria-valuenow`), and once every check has been read and all five are done it becomes one line, "<cohort> is ready to start". A full admin (`role` ADMIN, not a team member) gets no Welcome modal or auto-tour (`TourContext.skipsWelcome`): the checklist shows one "Start here" hint until "Got it" (saved per account as `hint:admin-setup` through the tour progress store; hidden if that store cannot load; see rule 117 for who counts as new). The "?" tours stay on every page. Schedule preparers and team members keep their Welcome; supports follow rule 117. For a full admin the notifications banner and the Get the app sheet (`AppShell.notificationsAskDue`) wait until the cohort they are on (not Practice) has started, or a change waits for approval; everyone else is asked straight away as before. Frontend only.
117. **A new support's or admin's first run is one "Start here" hint, not a Welcome and tour.** Supports, like full admins (rule 116), skip the Welcome modal and its auto-tour (`TourContext.skipsWelcome`). A Start here hint (`components/tour/StartHereHint`) is due while the person skips the Welcome, never had it (so people already using the app never see one) and has not tapped "Got it" on that hint (`TourContext.newcomerHint(key)`; keys `hint:support-start` on support Home, `hint:admin-setup` on the admin setup checklist, each on its own so one role's does not end another's). It stays across launches until "Got it". The launch where a hint first appears (recorded as `<key>:shown`) counts as a welcome launch (`welcomedThisLaunch`), so the Get the app sheet waits for the next launch; later launches with the hint still up do not hold it back. The support hint waits until the groups have answered, so the cards below do not push it around. Saved progress is held with its owner and a failed flag in one state; keys marked before it loads are folded in when it arrives; a person switch on a shared device never reads or writes the previous person's; a failed load hides the hint. The notifications banner still shows for supports from day one. Frontend only.
118. **Other church apps reach FOF only through the public API, with their own key; teenagers only with `teens:read`.** The `public-api` edge function (deployed with JWT checks off) is the one door: callers send `Authorization: Bearer fof_live_…` (or `X-API-Key`); only the SHA-256 hash of a key is stored, in the locked `ApiClient` table, with `scopes` (`people:lookup`, `people:read`, `teens:read`, `faith:read`, `team:read`, `groups:read`, `schedule:read`, `planner:read`, `content:read`, `birthdays:read`, `cohorts:read`), and a key is issued once, by a full admin on Administration → Church app access (`/church-apps`, guarded for full admins by `CHURCH_APPS_PATH` in `canOpenPath`; the old `/settings/api-access` redirects there; `api_admin_create_client`; Team members are refused by `api_admin_check`) or by `api_create_client` as the database owner, and switched off or back on there (`api_admin_update_client`), which also changes its name, notes and scopes; `api_admin_client_activity` shows its recent requests. 60 requests a minute per key, counted exactly: `api_authenticate` checks the key and books the request in one step under a per-key advisory lock, refused (429) requests not counted. Every request made with a valid key is recorded in the locked `ApiRequestLog` (client, method, path without the query string, status, duration, and `teenRecords`, how many teen records the answer showed in full; `api_finish_request` fills these in), never the answer; requests with no key or an unknown key are refused and not recorded. Answers come only from the `api_*` functions, which run for `service_role` alone: they cover every real cohort, finished and archived ones included (`api_real_cohort`: not Practice, not a "ZZ" test cohort), and skip test participants; phone numbers match through `fof_phone_key`, team roles through `app_user_roles`, and attendance is counted as FOF's own figures count it (late or left early counts as present, rule 12). A teen (`api_is_teen`: a teen age range by `fof_is_teen_age`, or a teen group) comes back as id, name, cohort and `restricted: true` unless the key has `teens:read`; with it, guardian name and number are included. Never returned by any scope: passwords and access codes, reflections and their summaries, personal notes, private or group chat messages, who gave anonymous feedback, group and hub call links, announcements aimed at a person, group, hub or label, resources limited to hubs, scripture posts not yet opened. The planner's phases are worked out in `public-api/planner.ts`, a port of `frontend/src/utils/planner.ts` (`buildPlannerCohorts`, `phasesFor`): change both together. Birthday pictures are drawn by `public-api/birthday.ts` (og_edge, Montserrat TTFs beside it under the OFL) on the same template as `frontend/src/utils/birthdayGraphic.ts`. A new endpoint follows the same rules, is added to `public-api/openapi.json` (which the `/api-docs.html` page draws from), and gets a scope. Source: `20261029120000_public_api_foundation.sql`, `20261029130000_public_api_participants_rename.sql`, `20261029140000_public_api_v1_1.sql`, `20261029150000_api_access_admin.sql`, `supabase/functions/public-api/`, `pages/AdminApiAccessPage.tsx`.
119. **Two absences before class 3 go to the admin, never move by themselves.** From the Saturday before week 3's class until the end of class 3's day (`absence_review_saturday`: week 3's class date minus one day, Lagos), the admin Dashboard and Participants page show everyone in a group in the current cohort (`current_programme_cohort_id`) who was marked Absent for both class 1 and class 2 (`absence_review_candidates`; Late, Left early, Excused and unmarked are not misses; test people and archived groups left out). An admin reviews, unticks anyone to keep and presses Move (`absence_review_move`): each person is taken out of their group(s), archived (`Participant.status` ARCHIVED, as the Archive participant action does), and an adult's sign-up contact gets exactly the fields `buildStatusPatch('NEXT_COHORT')` sets (rule 5: Will join next cohort, steps reset, next action Close, not archived) so the next-cohort carry-over offers them (rule 28), while a teen keeps their teen status for the Teen Support to decide; their support (the first of their groups that has one) is notified why (`absence_review_notify`, bell and push through `notify-users`, rule 10). A move is recorded in the locked `AbsenceReviewMove` (with a `prevContact` snapshot) and can be undone the same Lagos day (`absence_review_undo`), which restores group, status and every contact field; `AbsenceReviewDone` marks the review done (Keep everyone counts) only when every chosen move went through, and a done review cannot be run again. While it is not done, `absence_review_remind` (pg_cron `absence_review_remind_saturday`, 4 to 7 pm Lagos that Saturday) reminds admins and Team members who can see Participants (`module_viewers('participants')`), linking to Participants. Admins and Team members only (`app_staff` role ADMIN). Source: `20261030110000_absence_review.sql`, `20261030130000_attendance_lock_and_review_fixes.sql`, `components/participants/AbsenceReviewCard.tsx`, `services/absenceReview.ts`.
120. **"Discussions this week" says which groups.** `admin_discussion_summary` returns `byGroup` (posts and replies since Monday, Lagos, per group; same counting as the totals). The dashboard line links to `/groups?discussion=active`; the Groups page has a "Discussion this week" filter (Posted / Quiet) and each group card says "N posts & replies this week" or "Quiet this week". Source: `20261030120000_discussion_summary_by_group.sql`, `components/dashboard/DiscussionNowLine.tsx`, `pages/AdminGroupsPage.tsx`, `components/groups/GroupCard.tsx`.
121. **After a cohort, group leaders check in once in rest week 3, then monthly for three months.** A daily job (`post_cohort_checkups_run`, pg_cron `post_cohort_checkups_daily`, 8:17 am Lagos) gives every support who led an unarchived group in the cohort one admin rest-week task ("Check-up: check in with each person from your group…", `taskGroupId` set, so From admin and locked, rule 104) due on the last day of rest week 3, from the first day of rest week 3 until a week after it (a catch-up week; due then at least two days ahead), and a cohort with no group leader yet is tried again the next day (`checkup_rest_week3`: the cycle ends on the cohort's end date, or with none a spare week after the last class, never before the last class; rest weeks as `restWeeksAfter` in `utils/checklist.ts` and the Planner lay them out: change the three together). The support Schedule also loads open dated tasks from other cohorts due in the last three weeks or later (`supportChecklistApi.getForCohort`), so a rest-week task stays visible once the next cohort is current. The supports and the admins who can see Schedule are told (`fof_notify`, bell and push through `notify-users`, rule 10). Then reminders ("Check-up N of 3", linking to the support's tasks) go 1, 2 and 3 months after rest week 3 began; one more than a week late is skipped, not sent. One row per cohort in the locked `CohortCheckup`; older cohorts are never back-filled; real cohorts only (`api_real_cohort`), not archived; test and inactive supports left out. `fof_notify` is the one bell-and-push helper (the two-absence review's `absence_review_notify` calls it). Source: `20261030140000_post_cohort_checkups.sql`.
122. **Only an admin (or a server job) can send an announcement, and one that would reach nobody is refused before it is saved.** `send-announcement` (v30) passes the project's service key (push-reminders' survey announcements); any other caller needs `x-session-token` for a session whose `app_staff` role is ADMIN (Team members included), else 401 or 403. It works out the support and participant recipients before saving the `Announcement` row; an admin send that reaches no one returns 400 `NO_RECIPIENTS` and saves nothing (server sends still record, and so does a Home-pinned post, sent with `allowEmpty`, which people see when they next sign in). A failed participant read is an error, never a count of 0. Automatic resource notices skip an empty audience quietly and still send the rest. `{ dryRun: true }` returns `{ supports, participants }` and saves or sends nothing: the composer (`AnnouncementsModal`) shows "Goes to N supports and admins and M participants" from it and turns Send off when that is nobody; it only asks while the composer is open and the cohort is known, says "Could not count who gets this" when the count fails (Send stays on), and the count does not clear the app's kept reads (rule 103). Source: `supabase/functions/send-announcement/index.ts`, `announcementsApi.preview` in `services/supabase-api.ts`.
123. **Admin list pages load the list first and fetch the extras in one go.** The Supports page reads everyone's "last active" with one call (`users_last_active(ids)`: latest `AppSession.lastSeenAt` or `hubLastSeenAt`, staff only; `20261030170000_users_last_active.sql`) instead of one request per person, reads only unarchived follow-up contacts, and reloads on live changes at most every 30 seconds (at once on a cohort change). The Users list shows 25 rows with "Show next 25". The Scriptures page shows a small preview of each design (`scriptures/thumbs/<same file name>` in the `resources` bucket, about 30 KB, made in the browser on upload; falls back to the full design when missing) and opens the full design on tap; participants and supports still get the full design. Replacing or removing a design removes its preview too.
124. **On Sunday mornings the background checks nobody waits on wait twice as long.** From 7 am to 2 pm Lagos on a Sunday, a poll that asks for it (`sundaySlow` in `usePolling` / `startPolling`, `hooks/usePolling.ts`) waits double: the staff and participant bells, the Community unread dot, the prayer signal, the app-update check, the app nudge card, discussion feeds and their unread dots, and Practice's background beat (not its quick beat inside Practice or a walkthrough). Nothing else changes: participant Home (it notices an open register), the group-meeting live check, the Attendance pages, and clocks such as Today's prayers keep their pace. Never give `sundaySlow` to a clock or to a check that tells someone a register, meeting or prayer has opened. Covered by `src/utils/__tests__/rules.test.ts`.
125. **The build stops on a type error or a broken rule.** `npm run build` (Vercel's build) runs `tsc -b`, then the unit tests (`vitest run`, `vitest.config.ts`, files `src/**/*.test.ts`), then `vite build`. The tests cover the pure rules: Sunday marks (rule 12), participant health and completion, the Right now line, rest weeks (rule 121) and Sunday polling (rule 124). Change a rule, change its test in the same commit.
126. **Supports and Group meetings open with "This week": what to chase now, nothing sent by itself.** A card at the top (`components/supports/SupportsThisWeek.tsx`) lists, for the current class week: groups that haven't marked that week's meeting done (`GroupPrayerStatus.done`, what support judging counts as reported via `cohort_health.meetings`), groups with no meeting day and time, and (Supports) groups with no support. Each support's name opens WhatsApp with a ready message (`buildWhatsAppLink`); "Remind in the app" asks to confirm, then sends one announcement to just those supports (`targetUserId(s)`, bell and push, rule 122), and shows under Announcements. A group with no support shows by name only and is never messaged. Supports counts the groups it judges (a support and active members); Group meetings counts every group, as its trend and reports do. Long name lists show 8 and "+N more". The meeting-done chase shows only while the cohort runs, and Remind shows only when someone listed can get it. On Supports the first tab is group leaders, but a search there also finds supports leading no group. Group meetings' weekly tiles show each class date, and a week whose class hasn't happened says "Not yet" instead of 0/23. Frontend only.
127. **One count of supports and groups on every page.** A support in a cohort is a `UserCohort` member with the Support role (an admin who is also a Support counts), switched on, not a test account (`countsAsCohortSupport` in `utils/people.ts`); Cohorts, Supports and Hubs all use it (Supports also keeps anyone leading a group, so a group's card never disappears, even if its support was later switched off), and Hubs says "48 of 49 supports in a hub" when a cohort support is in no hub (compared person by person). `cohortsApi.getMembers` keeps each user's `roles` (it used to drop them, so Cohorts said 44 where Supports said 49). Groups are counted as the Groups page shows them, unarchived, teen groups said separately: "23 groups (+5 teen)" on Groups and Cohorts. Groups shows "N groups are overdue on onboarding" with Show them (the existing Onboarding: Overdue filter, other filters cleared), and shows its cards once groups, people and supports are in, with onboarding, hubs, trainings and tags filling in after (a newer load's answers always win, and switching cohort clears the last cohort's extras first). The admin Dashboard puts "What needs you" first once the cohort is running (before the start, setup leads, rule 115). Frontend only.
128. **Ten wrong passwords in 15 minutes pause that login for 15 minutes.** `sign_in` and `change_own_password` are thin wrappers (`20261030180000_sign_in_limits.sql`) around the unchanged checks (`sign_in_check`, `change_own_password_check`, closed to the app's roles, as is `login_user`): failures are counted per account (`sign_in_key`, `20261030200000_sign_in_limits_per_account.sql`): a staff account is `staff:<id>` whether they type their email or phone, and `change_own_password` uses the same budget; a login matching no staff account counts by its lower-case email or, with no '@', by the phone number's key (everyone sharing a number shares its count, rule 91). Failures are counted in the locked `SignInThrottle` (`sign_in_record`, old rows cleared through an index); the tenth within 15 minutes sets `lockedUntil`, and while it holds `sign_in_guard` raises `TOO_MANY_ATTEMPTS`, which the sign-in page shows as "Too many wrong passwords for this login. Wait 15 minutes…". A correct password clears the count, and any new password (a reset by an admin or support, or the person's own change) lifts the pause (triggers `sign_in_throttle_clear` on `User` and `ParticipantAccount`).
129. **Storage needs a session, and resource files are private.** The public `resources` bucket keeps its public links (designs, photos, guides), but uploading needs a signed-in session (`storage_signed_in`: staff or participant, from `x-session-token`), and replacing, deleting or listing needs staff (`app_is_staff`); its dashboard-named policies `resources_open …_0` to `_3` were tightened in place. Files added under Resources go to the private `private-files` bucket (`resourcesApi.uploadToBucket`, path `resources/…`), and their `Resource.url` / `ResourceVersion.url` is `fof-private:<path>`. Screens that show files pass them through `useSignedFileUrls` (staff Resources, participant Resources, version history), which asks `file-links` for links that work two hours; `private_file_paths` gives only files the caller may see (staff: `resource_visible_to_staff`; participants: `visibleToParticipants` and their cohort, as `participant_home` lists them). Admins may upload, read and delete in `private-files`; nobody else reads it. Until its link arrives a private file's url is empty and its button is disabled; screens left open renew links every 10 minutes as needed. The public API's `/v1/resources` answers with the same two-hour links, or a 500 if they can't be made (`public-api` v8, API 1.1.1). Source: `20261030190000_storage_locked_private_files.sql`, `supabase/functions/file-links`, `hooks/useSignedFileUrls.ts`.

## 5. Edge functions and schedules

All functions authenticate with the session token (`x-session-token`) or the
form secret, never bare anon access.

| Function | Job |
|---|---|
| `receive-form-registration` | Form/Apps Script intake; match-or-create contact; fill profile; admin alert |
| `run-followup-assignment` | 2h auto-assign plus 24h quiet-support reassignment sweep |
| `push-reminders` | 10-minute meeting, participant, and follow-up nudges (Africa/Lagos); only the service role may call it (keep `verify_jwt` ON: the code trusts the token's role; v62), which is what `invoke_push_reminders` sends |
| `file-links` | Signed two-hour links to private files the caller may open (`private_file_paths`, rule 129) |
| `daily-checks` | Daily nudges (reports, attendance, escalations); runs via cron-job.org with `CRON_SECRET`, not pg_cron |
| `send-announcement` | Admin broadcast with audience, scope, hub, and group filters; popup acks; admins or the service key only; `dryRun` counts recipients (rule 122) |
| `notify-users` | Generic sender (userIds, role plus cohort, participantIds) |
| `telegram-webhook`, `telegram-send` | Telegram bot inbox (Start/Stop/blocked) and the Telegram copy of each notification (rule 62) |
| `notify-followup-*` (4) | Assignment, issues, terminal states (LOGIN_ISSUE also pages hub IT), completions |
| `notify-hub`, `notify-onboarding-event` | Hub mentions/threads, onboarding events (the faith project review functions were removed with the review chain, rule 49) |
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
- Verify per AGENTS.md: frontend `npm run build` (type check and tests included, rule 125), browser pass as the role
  that uses the feature, `git diff --check`, no stray artifacts.
