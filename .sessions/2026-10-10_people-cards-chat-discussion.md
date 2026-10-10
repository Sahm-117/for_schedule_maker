# Session: Support My Group — People cards, chat-style Discussion, Onboard removed

**Date:** 2026-10-10
**Branch:** main
**Session ID:** b7ffea3e-6ddd-4f31-b7d3-a7ea20c501be

## What Was Done
Pushed `6546b45` to main (frontend only, no migrations, no edge functions).
- **People tab (support My Group):** each card shows the onboarding steps (Intro / Map / Guide / Profile / Ready) or a single green Ready once `completed`; green Active chip removed (Archived stays); last seen + device line always shown ("Not seen in the app yet" only after app details have loaded); quiet "· No category" on the Faith project chip when Written with no category; WhatsApp icon beside the ⋮ menu; the "x of y ready" bar and Start/View introductions button moved to the top of People.
- **Onboard removed for supports:** menu item gone, `/support/onboarding` redirects to `/support/participants?tab=faith`; the tab now lives in the address (`?tab=`), which the Practice visit steps read; Practice task "Check how your participants are getting on" repointed to People.
- **Discussion as a chat (all screens that use it):** bubbles (own right, others left), day dividers, replies as a quote of the post, composer pinned at the bottom (above the Practice button when Practice is on), swipe-to-reply kept, older messages load on scroll up with scroll position held, jump-to-latest button, search + filters (person, Unreplied, Mine, Today / 3 days / 7 days / custom range). Filters auto-load up to 10 older pages.
- `/code-review` run; 9 of 10 findings fixed (intro button no-op, stale older posts after refresh, pinned duplicate, load-more overwrite, group-switch flash, "not seen" before load, filter allowance, scroll snap, practice visit). Teen groups show no onboarding UI (FLOW_MAP rule 22). FLOW_MAP rule 57 added.

## Files Changed
`frontend/src/pages/SupportParticipantsPage.tsx`, `components/groups/ParticipantCard.tsx`, `components/discussion/DiscussionFeedView.tsx` (rewritten), `DiscussionFilters.tsx` (new), `StaffDiscussionPanel.tsx`, `components/participantApp/ParticipantDiscussionTab.tsx`, `utils/discussionFeed.ts` (new), `components/AppOverflowMenu.tsx` (`compact` prop), `components/AppShell.tsx`, `App.tsx`, `constants/practiceScenarios.ts`, `FLOW_MAP.md` (rule 57).

## Key Decisions & Patterns
- "Ready" = existing `completed` (intro + guide + profile + ready; Map is not required), so numbers match the old Onboard page.
- Filters are client-side (no database change); "Mine" = my own messages (the feed does not say who the viewer is, so "tagged me" was not possible).
- Refresh re-reads back as far as the reader has scrolled (`fetchLoadedDiscussionFeed`) instead of replacing with page 1.

## Backend / Handoff Notes
None. Nothing deployed besides the frontend push.

## Pending Tasks
- Decide whether to remove the now-unused `pages/SupportOnboardingPage.tsx` and the Onboard menu icon (list what each does first; per-file confirmation).
- Not browser-tested: participant, hub lead and admin views of the new Discussion (saved admin test login does not sign in). Teen-group hiding untested.
- In-app guides/tours that mention the Onboard page still need a decision.
- Practice: separate pre-existing error "Cannot read properties of null (reading 'sequence')" in PracticeDock; one transient pair of 500s when entering Practice.

## Errors Hit & Fixes
- **Incident:** 34 real test posts in Practice Group 1 pushed to the group (Ada Practice 1 has 2 devices, probably Olamide's) → "43 at a go" notification spam. Posts deleted by exact ID; pushes cannot be recalled. Lesson saved: mock discussion writes with `page.route()`, never post for real in tests.
- Page-level "start every page at the top" scroll and late layout fought the chat's open-at-bottom; fixed with repeated landing until the reader interacts.
