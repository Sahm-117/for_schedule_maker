# Session: Support onboarding steps checklist

**Date:** 2026-10-11
**Branch:** main

## What Was Done
- My Group > People now opens with a "Your onboarding steps" checklist for the support: Introduce yourself, Ensure your participants complete their onboarding steps, Set meeting time. All three done collapses to "Onboarding complete" with a View introductions link.
- Code-review fixes: the checklist shows "Loading…" instead of vanishing while progress loads; no duplicate "No participants" note; meeting button reads "Open Meetings".
- FLOW_MAP rule 57 updated.

## Key Decisions & Patterns
- Placed on My Group > People (replacing the old "x of y ready" box); the old Onboard page is a redirect, so it was left alone.
- No database change: ticks come from `supportIntroPosted`, the onboarding progress rows, and the group's `callLink` + `meetingDay` + `meetingTime` (Olamide chose link AND time).
- Teen groups still have no onboarding (rule 22).

## Verification
Playwright as the test support: swapped a real group in and mocked the onboarding progress response (reads only, zero writes). Checked none / partial / no-link / all-done states on a phone, the Open Meetings jump, and no console errors. Not seen with a support's real data.

## Pending Tasks
None.
