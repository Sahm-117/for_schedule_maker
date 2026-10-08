# 2026-10-08 · Registered and logged-in numbers, adults and teens apart

Frontend only. No migration, no edge function. Read FLOW_MAP.md rule 33.

## Why

The admin was asked by leadership why "total registered" kept changing, and how many adults registered,
were onboarded and remain. The cards counted follow-up statuses, so the totals moved whenever a contact
changed status: teens moving to a Teen Support, someone marked No response or Next cohort (they dropped
out of Registered), and hand-set "Access confirmed" counted as logged in. Teens were mixed into the
adult numbers.

## What changed

- `frontend/src/utils/registrationOverview.ts`: `computeRegistrationOverview` counts participants:
  registered, logged in (real sign-in), still to log in with reasons, per adults and teens.
- `frontend/src/components/followups/RegistrationOverviewCards.tsx`: the shared cards; used by
  `AdminDashboardPage` (replaces `RegistrationFunnel`) and `FollowUpDashboard` (replaces the five tiles).
  The sign-up target on Follow-ups now measures against everyone registered (adults + teens).
- `computeFollowUpHeadline` is no longer used; left in place (not deleted on purpose).

## Numbers at the time (Cohort 10, test records left out, read from the live database)

Adults 63 registered, 37 logged in, 26 still to log in (16 login sent, 3 login not sent, 4 not reachable or
next cohort, 3 marked logged in by hand but never signed in). Teens 14 registered, 1 logged in, 13 still to
log in. Everyone 77 / 38 / 39. The old dashboard showed 70 registered because it left out 7 parked people
and counted statuses.

## Open items

- 3 adults are marked Access confirmed by hand but have never signed in and have no password. The status
  list still shows them as logged in. Decide whether to fix those contacts.
- Mobilisation (support page) numbers still count follow-up statuses for a support's own list.
- Not tried against the live site in a browser; checked with mocked data shaped like the live cohort.

## Gotchas

- "Logged in" here means chose a password, not "Teen onboarded" (that is a Teen Support's own step).
