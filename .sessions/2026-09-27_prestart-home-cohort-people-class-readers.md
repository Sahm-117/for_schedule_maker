# Session f4fdc7ff — 2026-09-27: pre-start home, cohort People, all class readers

## What Was Done
- Pushed parked support-profile tweak (9d9217f): Tags/WhatsApp rows removed, real group name, no personal-link fallback.
- Session 4 (c86f905): participant home before cohort start — first-class countdown, "Your group" tile, "Your support will share the link", "Start your faith project" tile, Join call greyed out until a link exists; "Get ready" checklist (photo only if none, faith project, meet your cohort). People page gains "Your cohort" (everyone active in cohort, name + photo).
- Readers (4263427): Intro Class + Classes 2, 3, 5, 6, 7 and the Faith Project guide converted from ~/Downloads/Class illustrations/*.html into the comic reader, each with its own illustrations. "Prep for the Intro Class" added to Get ready (opens reader on Home).
- Wrote the Claude Design prompt for the Intro Class orientation doc (Olamide then made it).

## Files Changed
- supabase/migrations/20260927230000_people_whole_cohort.sql — participant_people adds `cohort` (APPLIED LIVE)
- frontend/src/pages/ParticipantHomePage.tsx, ParticipantPeoplePage.tsx, ParticipantWeekPage.tsx, SupportRecapPage.tsx
- frontend/src/utils/participantApp.ts — hasDoneReadyStep/markReadyStepDone (localStorage, per phone)
- frontend/src/types/index.ts — ParticipantPeople.cohort
- frontend/src/components/classManual/{types.ts, ClassManualReader.tsx, ClassManualReader.css, manuals/index.ts, manuals/intro|class2|class3|class5|class6|class7|faithGuide.ts}
- frontend/src/components/FaithProjectGuide.tsx — now entry button + ClassManualReader (FaithProjectGuide.css left in place; old reader styles unused)

## Key Decisions & Patterns
- Manuals keyed by week title (lower-case, curly apostrophes normalised) and lazy-loaded (`useManualContent`, `loadManualForWeek`). Class 1 keeps ClassManualArt.ts; later manuals carry `art` {defs, cover, endCard, scenes} because scene names collide across exports with different drawings.
- Generator: scratchpad extract.py/gen.py parse the bundler template (`__bundler/template`), DATA literal via node, scenes from `<sc-if value="{{ panel.sc.X }}"><svg>`, convert `sc-camel-*` attrs to camelCase. Validated: Class 1 extraction == existing repo art.
- classLabel follows class1 pattern "Week N · Class M".
- Week mapping: 1 Introductory, 2 New Creation (C1), 3 Integrity (C2), 4 Holy Spirit (C3), 5 What is Faith? (no reader), 6 Praise & Worship (C5), 7 Prayer (C6), 8 Love (C7).
- Verification used response-only Playwright route mocks of participant_home (no live data written).

## Backend / Handoff Notes
- Class readers only appear on a week once an admin uploads that week's manual PDF (button is gated on the PDF). Only ZZ Demo week 2 has one; Cohort 10 has none.
- No readers exist for Class 4 "What is Faith?", Service, Date w/Pastor Shola.

## Pending Tasks
- Decide: show the reader even when no PDF is uploaded? (currently needs a PDF)
- Support recap reader path not click-tested (test support had no weeks with a manual); typechecked only.
- Still unanswered: "Mark everyone left as absent" button in training results.
- Carried over: delete ZZ Demo Participant only when Olamide says so.

## Errors Hit & Fixes
- pg returns DATE as local-midnight timestamps; mock startDate must be 'YYYY-MM-DD'.
- Scene regex needed digits ([a-z0-9_]) — h_path4 was missed.
- Element screenshots of tall items inside the reader scroll container render garbled; scroll + viewport screenshot instead.
- context-saver hook says "No previous session found" for the current session; file written manually.

## Later in the session (pushed 5300ab6, 78bb9a0)
- Fixed live: submit_training_learned granted to anon (supports got "permission denied"); admin-created users now mustChangePassword (create_user p_token variant).
- Class 4 reader; MarkCounter (marked/not marked, tap filters) on both marking screens; Supports page Incomplete-profile + role (SupportKind) filters and ⋮ Export for WhatsApp (SupportsExportPopup, buildSupportsText).
- Add User: no password box, generated 8-char first-time password, InviteMessageCard (copy / WhatsApp). Reset password reuses it (kind 'reset', temporary password).
- Follow-up load ring now counts only the viewed cohort's open, unarchived contacts (openLoadByOwner(contacts, cohortId)).
- Intro Class PDF made: ~/Downloads/Class 0 Intro Class Orientation.pdf (objective line written by Claude — Olamide to check).
- ZZ Demo test setup: class PDFs on weeks 1–8; weeks 6–8 manualReleasedEarlyAt set (completed cohort, no notifications).
- Image manuals already supported end to end (upload accepts images, viewer shows them).
- Open: email-based "Forgot password" would need an email provider (e.g. Resend) + domain; not started.

## Final batch (pushed d80668e, confirmed live on fof.tcnikorodu.org)
- Add User: any pasted Nigerian number saved as 080… (toLocalNigerianPhone in utils/phone.ts; tidies on blur). Sign-in matches phone exactly (login_user), so format matters.
- "Mark all N not marked as absent…" (MarkRestAbsentButton): quiet red link, only when the not-marked filter is on, behind a ConfirmationModal. On admin Mark attendance modal and TrainingAttendancePanel.
- MarkCounter: › chevron on second chip; reused on training results as "shared what they learned / haven't shared ›" (Present/Late at pre-cohort trainings only).
- Deleted duplicate user Gbenga Shomotun [redacted-phone] (id 8bdb9648…, no references; Olamide said delete). Backup row: scratchpad gbenga_234_backup.json (session-temporary). Remaining account: [redacted-phone].
- Tests mocked all writes (mark_support_attendance, set_user_password, create_user); verified live attendance untouched.
