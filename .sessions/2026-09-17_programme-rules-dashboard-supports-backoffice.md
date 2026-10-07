# 2026-09-17 — Sign-in redesign, cohort-health dashboard, programme rules, profile, Supports, back office sections, escalations

Session: 5f837bf3 (continued after the 2026-09-16 entry). Branch: `main`. Everything
below is pushed, deployed (Vercel GitHub app) and verified live unless marked otherwise.

## What Was Done

**Feedback fixes + sign-in (baa0066)** — modern sign-in page (eye icon always on top),
toast after one-tap Sunday attendance, follow-ups Open/Closed stranding bug fixed + Undo,
"Register a lead" → "Registration".

**Admin dashboard rebuilt (bc472c1)** — `cohort_health(p_cohort_id)` SQL function;
modes: running (vital tiles, What needs you, trend chart, group heat grid, operations row),
completed (final summary), upcoming (registration funnel + readiness checklist).
Cohort status `COMPLETED` added; **Cohort 9 marked COMPLETED** in the DB.
Next-cohort prompt: move "Will join next cohort" people into the new cohort (back to
To contact) and split them evenly across chosen supports (`NextCohortAssignModal`).

**Programme rules (Phase A, 25dfa67)** — agreed with Olamide, editable in Settings
(AppSetting `programme_rules`), logic in `frontend/src/utils/programmeRules.ts`:
- Participant: misses add up; any miss = Keep an eye on; 2+ Sunday AND 2+ meeting misses =
  Needs attention; Late = attended; Excused meeting ≠ miss; unrecorded week = support's miss.
- Completion: attend all Sunday classes (adjustable %); score 100% with every meeting, else
  90%; below = "To retake FOF"; "Missing records" when gaps decide it.
- Cohort success: 75% of participants completed.
- Support: 1 unrecorded week = Keep an eye on, 2 = Needs attention; onboarding within 7 days.
- Too few records (<50% Sunday marks) → nobody judged (Cohort 9 shows "Not enough records").
- `cohort_people(p_cohort_id)` SQL function supplies per-person records.
- Meeting report can't be submitted until every member is marked (3c81729).

**Participant profile (Phase B, faa8bc5)** — `/participants/:id`: journey (records + manual
moves in `ParticipantStageChange`), attendance strips, faith project, check-ins (`CHECK_IN`
note type), concerns, completion, department handoff (`DepartmentReferral`: logged → joined,
confirmed by the support or an admin; 39 registration choices backfilled). A department
choice only counts as "Referred" after completion.

**Supports page (Phase C, e79d151)** — `/supports`: week strip per support (Sunday
attendance / meeting report / meeting attendance), status filter, onboarding days,
WhatsApp, groups without a support; cover requests moved here from Approvals.

**Back office sections (Phase D, 8d9b734)** — sidebar 18 → 12 items; tab strips
(`SectionTabs.tsx`): Participants (Attendance, Faith projects, Onboarding), Groups
(Allocation, Group meetings), Schedule (Approvals, Rota, Activity overview). URLs unchanged.
Support participant notes shown as an accordion.

**Also:** church departments list managed in Settings (AppSetting `church_departments`,
defaults = registration form names + PDF descriptions) used by every department dropdown
(cbe1191); "attendance" wording (6ea8186); participant status pills + Status filter on the
Participants list, "Concerns" rename (8052133, eb7786a).

**Escalation alerts (8681b84)** — `daily-checks` edge function (deployed) now alerts once
per event (tracked in `EscalationNotice`): participant miss → support; needs attention →
support + admin digest; last week not fully recorded → support; support 2+ weeks behind →
admin digest; onboarding due soon → support, late → support + admin digest. Dry runs accept
`asOf` + `cohortId` for replay and no longer retry the sheet sync.

**Faith project unread dot (4997964)** — red dot on the support's faith project pill when
the back office or participant wrote since last read (`FaithThreadRead`, trails coach/office);
admin Faith projects page shows the support conversation with reply + row dots.

## Key Decisions
- Rules and thresholds above are leadership-agreed (see memory `fof-programme-rules`).
- Onboarding page stays as is (not split). Faith project text stays visible to admins.
- Participant app must get the same faith project dot (Phase 2).

## Open / Next
- Olamide: tidy Settings → Church departments (Pearls, Men Fellowship, Announcement,
  Foundation of Faith Support vs Teachers).
- Phase 2: participant app (accounts/set password, recap + private reflection journal,
  journey view, anonymous feedback, faith project dot).
- After Phase 2 reminders: sheet sync → [redacted-email]; Supabase → MySQL discussion;
  storage management; follow-up simplification.
- 96 dependency vulnerabilities flagged by GitHub (pre-existing).
- Leadership decisions still open: faith project/welfare/reflection visibility, teen
  experience, integration target %.
- "Participant needs attention" escalation path not exercised by real data (Cohort 9 has
  almost no meeting attendance).

## Testing notes
Playwright scripts live in the session scratchpad (lost on restart; reinstall `pg` +
`playwright` together). Always intercept `/functions/v1/**` and non-GET REST writes.
Support test login: [redacted-email] (password in the transcript, never commit).
