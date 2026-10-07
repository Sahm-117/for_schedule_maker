# Session: Update bar, hub recaps, Class Manual, and week editor

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 03e66a01-0300-4c8b-b6b5-cb79a4e59faa

## What Was Done
Update bar now hidden only on public landing page; still shows on login page and inside app,Hub meeting recaps now always visible to supports regardless of release time,Recaps page weeks start folded; current week labeled with blue 'This week' indicator,Class Manual feature built: admin uploads PDF in week editor, goes out Thursday 6 PM before Sunday class,Participants see Class Manual on Home; can ask questions marked 'To be answered in class' or receive replies,Admin and support both see participants' questions on lists (Feedback page for admin, Recaps page for support),Week editor redesigned with four numbered steps; bug fixed where manual send time was after class instead of before,Comic-style visual HTML manual being built from PDF by Claude Design,Database migrations applied and live; push-reminders function deployed,Delegated cheaper models to handle week editor, Class Manual screens, and comic manual to improve token efficiency

## Files Changed
supabase/migrations/20260927130000_support_recaps_always_content.sql (live),supabase/migrations/20260927140000_class_manual.sql (live),supabase/functions/push-reminders/index.ts (deployed),frontend week editor and Class Manual screens (built but testing in progress),frontend comic manual HTML reader (being built)

## Key Decisions & Patterns
Update bar: location-based visibility (homepage vs app), not browser-based,Class Manual: visual comic-style format, not simple PDF viewer; no text rewording allowed,Questions: binary action (mark answered OR reply), not both; pushed to both support and admin,Token efficiency: delegated building and testing to cheaper models; main session reviews and coordinates,Clarity analytics already in place; will track manual taps via named events

## Backend / Handoff Notes
None

## Pending Tasks
Comic manual HTML from Claude Design needs to be integrated and adapted into app,Cheaper model currently testing Class Manual flow as admin, support, and participant; will clean up test data,Update Test Checklist with new Class Manual and week editor checks once testing completes,App-wide wordiness review scheduled after Class Manual completes (using Prayer Lead clarity principle)

## Errors Hit & Fixes
Class Manual send time was set to Thursday after class instead of before; corrected to Thursday 6 PM
