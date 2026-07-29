# Session: Fix page reloads on Participants and Groups pages

**Date:** 2026-06-24
**Branch:** main
**Session ID:** 39dd91b9-3b15-4b99-8815-79dec38f3636

## What Was Done
Root-caused full-page 'Loading…' remounts to two sources: (1) cohort object reference churn in AppDataContext.applyActiveCohort during 15s background poll, (2) user object recreation in useAuth.verifyCurrentUser on tab focus/visibility events,Fixed cohort churn by comparing fresh-fetched cohort against current state and only calling setState when changed (AppDataContext.tsx line 96-108),Fixed user churn by comparing fresh-fetched user against current state and only calling setUser when changed (useAuth.tsx line 175),Enhanced AdminGroupsPage to use reconcileById for silent realtime refresh instead of wholesale array replacement (AdminGroupsPage.tsx line 385-387),Verified both fixes live: Groups/Participants pages now preserve filter state, scroll position, and open modals through focus cycles and background refreshes with zero loading flashes,Confirmed probe DOM node survival across multiple refresh cycles and tab-return events

## Files Changed
src/context/AppDataContext.tsx — stabilized activeCohort reference in applyActiveCohort,src/hooks/useAuth.tsx — stabilized user object reference in verifyCurrentUser,src/pages/admin/AdminGroupsPage.tsx — added reconcileById for silent group refresh

## Key Decisions & Patterns
Root cause was object reference churn triggering React dependency re-runs, not data changes,Fix pattern: compare fetched object against current state and only setState on actual change,Realtime publication only includes Notification table; other subscriptions never fire in production; 15s fallback poll is the real refresh trigger for Groups/Participants,PWA and polling are healthy; auth focus/visibility churn was secondary trigger

## Backend / Handoff Notes
None

## Pending Tasks
Add phone-number search to participant picker (user to specify which page: Admin Participants, Admin Groups, or Support Participants)

## Errors Hit & Fixes
None — investigation identified root causes but no runtime errors encountered. PWA realtime and polling all functioning correctly.
