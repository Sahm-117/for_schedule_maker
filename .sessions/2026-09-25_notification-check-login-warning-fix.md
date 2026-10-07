# Session: Notification check + login warning fix

**Date:** 2026-09-25
**Branch:** main
**Session ID:** 429f4ef4-886e-44bd-a9bc-46349843463c

## What Was Done
- Built roadmap step 2, the notification check (commit 0fd7636, local only). Built by a Sonnet subagent and reviewed by Opus.
  - The "Turn on notifications" box shows on EVERY app open until the person enables alerts. "Maybe later" is stored in sessionStorage, so it lasts only for that session.
  - Participants now get the box in ParticipantShell. Before this they only had a switch in Profile.
  - The participant box waits until the weekly check-in is answered or put off ("Not now"), as Olamide asked. Verified with Playwright: while the check-in shows, the box is hidden, and after "Not now" it appears. Console was clean.
  - Blocked phones (permission denied) see NotificationBlockedModal with iPhone and Android steps instead.
  - "No alerts" neutral tag on the support's participant list and ParticipantCard. On admin Users and Participants the tag comes with a "No alerts" filter (AppSelect).
- Login warning fixed: PWAUpdateBanner is now mounted once in App.tsx instead of in Login, AppShell and ParticipantShell. Remounting it raced useRegisterSW. It reproduced 6/6 before the fix and 0/8 after.
- Migration 20260925070000_participants_without_push.sql APPLIED to live by Olamide via `!`. It is a SECURITY DEFINER function that checks app_is_staff(). Verified in pg_proc.
- Test Checklist artifact has Phase 11 (7 checks, a-1…a-7), now v101: https://claude.ai/artifact/8Bi73TwdRiqUSnNxf8SvoA

## Files Changed
- frontend/src/hooks/usePushNotifications.ts, useParticipantPush.ts
- frontend/src/components/NotificationBlockedModal.tsx (new), AppShell.tsx, participantApp/ParticipantShell.tsx (check-in state lifted into useCheckInState), groups/ParticipantCard.tsx, UserManagement.tsx
- frontend/src/pages/SupportParticipantsPage.tsx, AdminParticipantsPage.tsx, Login.tsx; App.tsx
- frontend/src/services/api.ts, supabase-api.ts (pushSubscriptionsApi.listSubscribedUserIds, participantPushApi.getUnreachableIds)
- supabase/migrations/20260925070000_participants_without_push.sql (applied)

## Key Decisions & Patterns
- Olamide chose "ask every time they open" (not a 3-day snooze), and tag + filter for admins (no Dashboard count).
- "Unreachable" means there is no row in PushSubscription / ParticipantPushSubscription. Dead endpoints (404/410) are auto-deleted by _shared/webpush.ts.
- Participant tag counts only people with an active ParticipantAccount.
- The weekly check-in always comes before the notification prompt.
- The shell `grep` alias misses matches in some files, so use `/usr/bin/grep`.
- Local testing of the prompt needs VITE_VAPID_PUBLIC_KEY. Pass a throwaway key as an env var on the `npx vite` command; never edit .env.local.

## Backend / Handoff Notes
- Live reach at build time: 31/43 supports, 1/4 admins, 0/11 participant logins.
- Nothing git-pushed. There are 4 local commits on main (7fd75b9, 77e0ac2, c58ef1b, 0fd7636), and they need the show-and-confirm push rule.
- Not verified: the full "Turn on" subscribe flow (there is no VAPID key locally, so check 11.3 on a phone), and an anon call to the new function (the sandbox couldn't reach the server).

## Pending Tasks
- Olamide reviews Phases 9–11 and approves the push.
- Notification Audit: fill in, then "audit done", then apply.
- Next build order:
  - Post-class feedback plus department choice.
  - Faith Project "not going well" plus Testimonies.
  - Support Break mode.
  - Hub roles.
  - The rest of the roadmap.

## Errors Hit & Fixes
- ContextSaver auto-saved this session at /clear as "no work" (2026-09-25_session-cleared-no-work.md), and `--manual` then skipped it. This file replaces it in INDEX.md.
