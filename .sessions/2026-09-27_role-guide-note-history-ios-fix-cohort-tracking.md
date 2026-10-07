# Session: Role guide, note history, iOS fix, cohort tracking

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 9f51fc2e-e585-4600-9919-33af73bb7295

## What Was Done
Fixed iOS 15 sign-in issue (AbortSignal.timeout fallback) — verified on live site,Deployed 7 Supabase notification services (notify-*) to production,Implemented and deployed follow-up note history with writer name and timestamp,Built visual role guide with FOF logo in header, shows once per role at login,Added hub role welcome popup (one-time, shows once per role) — temporarily showing full visual guide,Implemented automatic cohort tagging when contacts are assigned,Added 'Prior cohort' label and filtering on Follow-ups dashboard,Added search functionality to Supports page,Built WhatsApp export for users without alerts installed, with video guides (iOS/Android),Added contact date/time details in popup, clarified form-submitted vs follow-up-added on dashboard,Cleared role welcome 'seen' marks so all hub members see guide on next login

## Files Changed
frontend/src/components/followups/FollowUpDashboard.tsx — cohort labels, prior cohort tracking, note history UI,frontend/src/components/hub/* — role guide, welcome popup, visual guide component,supabase/migrations/20260927170000_follow_up_note_history.sql — note history table,supabase/functions/notify-* (7 services) — deployed to production,frontend components: Supports search, WhatsApp export message builder

## Key Decisions & Patterns
Contacts belong to the cohort running/starting at follow-up time (stored as standing rule),Hub role welcome shows once per role, then never again (popup dismissed = seen),Visual guide displays once at login, then switches back to short popup (feature flagged for easy toggle),Note history records automatic metadata (writer name, timestamp) on every save,Hub members see guide immediately on app open, not only in My Hub

## Backend / Handoff Notes
7 notification services deployed and verified. Note history migration applied. All changes verified on live site (fof.tcnikorodu.org and for-schedule-maker.vercel.app). No backend changes pending.

## Pending Tasks
Preview dashboard clarification (form-filled count vs follow-up-added count) before final push

## Errors Hit & Fixes
iOS 15 AbortSignal.timeout not supported — fixed with fallback for older iPhones,Note history not showing until DB migration live — applied migration and verified,FOF logo background clipping out of circle — fixed with CSS clip-path
