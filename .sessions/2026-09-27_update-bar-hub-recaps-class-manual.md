# Session: Update bar, hub recaps, and Class Manual planning

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 03e66a01-0300-4c8b-b6b5-cb79a4e59faa

## What Was Done
Fixed update bar to hide on public landing page only (shows on login and inside app),Removed release-time restriction on hub meeting recaps for supports (always visible),Updated Support Recaps page to show all weeks folded with current week labeled,Planned Class Manual feature: admin uploads PDF in week editor, goes out Thu evening before class, participants see on Home,Defined Class Manual questions flow: supports and admin see questions on dedicated views, can mark 'To be answered in class' or reply,Delegated week editor redesign and Class Manual database/screens to cheaper model,Applied Class Manual database migration,Deployed push-reminders function with manual question notifications,Updated test checklist with new checks for recaps and update bar,Cheaper model now building comic-style visual manual reader preserving all original PDF text

## Files Changed
supabase/migrations/20260927130000_support_recaps_always_content.sql (applied),supabase/migrations/20260927140000_class_manual.sql (applied),supabase/functions/push-reminders/index.ts (deployed),frontend/src/pages/AdminSettingsPage.tsx,frontend/src/pages/ParticipantHomePage.tsx,frontend/src/pages/SupportRecapPage.tsx,Test checklist artifact (updated)

## Key Decisions & Patterns
Class Manual goes out Thursday 6:00 PM (before Sunday class), triggered by admin during week setup,Class Manual questions marked 'To be answered in class' with optional support reply visible to participant,Supports see manual questions under Questions section on Recaps page by cohort,Admin sees manual questions on new 'Manual questions' section on Feedback page,Visual manual built as comic-style reader with all original PDF text preserved exactly,Using Clarity (already in app) to track manual interactions via named events ('Original PDF opened', etc.),Delegating screen work to cheaper models (Sonnet), reviewing and testing results before push,App-wide wordiness review queued for after Class Manual complete

## Backend / Handoff Notes
Push-reminders function deployed and live. Class Manual questions will send push notifications to supports and admin when participant asks question. No other backend dependencies.

## Pending Tasks
Comic-style manual reader still being built by cheaper model,Full Class Manual flow testing (admin, support, participant views) by cheaper model,Review comic manual HTML against original PDF for accuracy,Connect comic manual reader to Class Manual screen,Test manual questions feature end-to-end,Olamide approval and testing on live data,Push manual questions feature to live once approved,App-wide wordiness review after Class Manual done

## Errors Hit & Fixes
Class Manual send time set to Thursday after class instead of before; corrected to Thursday 6:00 PM during trial

## Effort Routing Suggestions

One clear miscalibration:

- "i just submitted week six meeting. i'm yet. i'm still seeing that green pulsing thing. why?" — marked **medium** but contains the debugging keyword "why?" and describes a stuck state. Per the rules, reasoning words (why, how, debug, trace, fix) warrant **high** effort. Should match a pattern like `"why\?"` or similar to route debugging questions to high effort.

Everything else tracks correctly: the three **high** entries properly caught "why is", "not supposed to", and "still showing" patterns (all debugging/troubleshooting); simple acknowledgments ("yes", "push it", "1") at medium are harmless; feature/design prompts at medium are appropriate.

**Suggestion:** Add a pattern to effort-rules.json to catch standalone "why?" questions as high effort — they're often debugging requests that need investigation.

## Addendum (written by hand at save time)
- LIVE: migration 20260927140000_class_manual.sql applied; push-reminders deployed (v21, 02:30). Frontend work (week editor redesign, manual screens, questions, Timings row) is UNCOMMITTED/UNPUSHED.
- Fixed before applying: manual release date was the Thursday AFTER class; now recap_release_at('manual') and push-reminders manualReleaseTarget = chosen weekday on/before the class Sunday (Week 5 manual = Thu 24 Sep 6 PM).
- Trial (rolled back) before apply: participant_home ok for 114/114 participants; support_recaps ok 3/3.
- In flight: Sonnet Playwright test agent (ZZ Demo Week 5, uploads Class 1 PDF, "TEST – please ignore" question; must clean up — check for leftover question/note/manualReleasedEarlyAt). Sonnet comic-reader port agent → components/classManual/ (ClassManualReader, manuals/class1.ts, fonts in public/fonts/class-manual) + word check vs PDF.
- Still to do: add Class Manual + week editor + comic reader to the Test Checklist artifact (Phase 20); commit + push (show actor/author/destination first).
- Clarity: already in app (main.tsx); Olamide will set masking to Strict himself.
