# Session: Add login-shared status, grandfathering, decks rebuild

**Date:** 2026-09-22
**Branch:** main
**Session ID:** 8c7c0748-7d01-4332-aae5-35811f4b44c2

## What Was Done
Created LOGIN_SHARED status in FollowUpRegistrationStatus enum to mark when app login is handed to newly registered contacts,Updated dashboard to show 'Login to share' (people awaiting login handoff) separate from other states,Fixed registration asymmetry: fresh form sign-ups now always created as Registered, not left at NOT_REGISTERED,Grandfathered 15 pre-app contacts so 'Login to share' count only reflects new signups from today onwards,Redeployed three edge functions (notify-followup-terminal-status, push-reminders) with new status logic,Meeting Mode: dropped meeting notes field on participant side; now shows 'Week N recap pending' only,Added 'Met by' support breakdown to admin dashboard showing who brought in how many prospects,Rebuilt Mobilisation guide deck (11 slides, portrait) with fresh screenshots and plain-English flow explanation,Started rebuilding App guide deck with fake-name masking for privacy

## Files Changed
supabase/migrations/*_follow_ups.sql — added LOGIN_SHARED enum value,frontend/src/utils/followUps.ts — status derivation & closed-status logic,frontend/src/pages/AdminFollowUpsPage.tsx — dashboard tiles, metrics, Met-by breakdown,frontend/src/pages/SupportMobilisationPage.tsx — form registration & duplicate matching,frontend/src/pages/ParticipantWeekCard.tsx — removed meeting notes, added recap-pending copy,supabase/functions/notify-followup-terminal-status/index.ts — LOGIN_SHARED notification,supabase/functions/push-reminders/index.ts — gate on shared + exists, not time,Multiple header/nav files — FOF Ops rename (from FOF IKD Ops),presentation scripts & decks — Mobilisation & App guide generators

## Key Decisions & Patterns
Grandfathering: old archived Registered contacts kept in DB but excluded from 'Login to share' metric via date filter, not schema change,Participant-side meeting notes dropped entirely — only admin sees the full text; participants see state (pending/released) only,Plain-English rule: all user-facing explanations must be short, name what the user sees on screen, not code/column names,Screenshots in shareable decks use fake names (no real participants) to protect privacy,Dashboard 'Met by' section shows who (support name) brought in how many (count), unifying visibility of ingestion sources

## Backend / Handoff Notes
Edge functions (notify-followup-terminal-status, push-reminders) are live in production and tested. Notify now fires for LOGIN_SHARED. Push-reminders gates on shared + exists (not time). No backend changes needed; all logic in frontend & Supabase functions.

## Pending Tasks
Mobilisation & App guide decks near complete but session hit usage limit — final PDF exports + save to ~/Documents/Community/FOF - TCN/,User preference saved: always explain in plain English, short, name what they see on screen

## Errors Hit & Fixes
JSON pretty-printing breaking role-rewrite match (whitespace) — used response-patch route instead,Page CSS rule overriding dropdown patch — re-checked selector logic,Sub-headline clipping in deck layout — made line-height width-aware,Mobile screenshots sizing wrong (desktop viewport) — applied viewport config,Migration referencing non-existent function — pulled real definition from Supabase DB instead,git checkout discarding .sessions/INDEX.md rows — manually restored 10 rows from session-start read
