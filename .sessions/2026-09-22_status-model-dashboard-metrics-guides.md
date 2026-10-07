# Session: Status model, dashboard metrics, and participant guides refresh

**Date:** 2026-09-22
**Branch:** main
**Session ID:** 8c7c0748-7d01-4332-aae5-35811f4b44c2

## What Was Done
Added LOGIN_SHARED enum value to mark when prospect receives app login,Fixed registration asymmetry: form sign-ups now always land as REGISTERED; met-someone stays NOT_REGISTERED until verified,Dashboard: added "Login to share" metric, "Met by" breakdown, LOGIN_SHARED column; grandfathered old archived contacts (excluded from 0/Y count),Simplified recap waiting: changed from time-based gate to "shared + exists"; participant view shows recap or "Week X recap pending — Stay tuned",Made meeting notes readable on support cards (Week X recap + author + date),Removed Google Meet link from participant meeting line,Deployed three updated edge functions (notify-followup-terminal-status, push-reminders, send-recap),Verified all behavior in browser and production,Began rebuilding Mobilisation and App guide decks with fresh screenshots using fake-name map for privacy

## Files Changed
frontend/src/utils/followUps.ts (status model and derivation),supabase/migrations/*_follow_ups.sql (LOGIN_SHARED enum),frontend/src/pages/AdminFollowUpsPage.tsx (dashboard metrics, tiles, columns),supabase/functions/notify-followup-terminal-status/index.ts (edge function),supabase/functions/push-reminders/index.ts (edge function),supabase/functions/send-recap/index.ts (edge function),frontend/src/components/AppShell.tsx (renamed FOF IKD Ops → FOF Ops),frontend/index.html, vite.config.ts (branding rename),frontend/src/pages/Login.tsx (branding rename),supabase/functions/receive-form-registration/index.ts (duplicate detection, registration handling),SupportMobilisationPage.tsx (met-someone flow),Meeting reports and recap display components

## Key Decisions & Patterns
Distinguish two paths: form sign-up = REGISTERED; support met-someone = NOT_REGISTERED until confirmed,Exclude archived contacts (pre-app era) from login-to-share metric; only count new contacts,Recap gating: switch from time-based (`release_time`) to state-based (shared + exists),Plain English explanations preferred (saved in global CLAUDE.md and memory),Decks use fake-name map to ensure no real participant data in shareable documents

## Backend / Handoff Notes
Three edge functions deployed (notify-followup-terminal-status, push-reminders, send-recap). LOGIN_SHARED enum now live on FollowUpRegistrationStatus. Duplicate detection improved to cross-support and form matching (not yet deployed). Grandfathering applied: archived contacts ignored in dashboard login metric.

## Pending Tasks
App guide deck still being built (user hit weekly limit mid-render),Finalise and deliver both updated decks (Mobilisation Guide + App Guide)

## Errors Hit & Fixes
Pretty-printed JSON in role rewrite (role check had extra spaces, never matched) — fixed by checking actual request,Page-level CSS rule overriding status dropdown patch selector — removed conflicting rule,Migration referenced non-existent function — pulled real function definition from database,Route order wrong for admin screenshots (mask handler override) — reordered routes to capture support view correctly,Viewport not applied to phone screenshots — re-captured with proper device viewport,Sub-headline collision on narrow columns — made line estimate width-aware,Banner text overflow — switched from hand-tuned heights to auto-sizing
