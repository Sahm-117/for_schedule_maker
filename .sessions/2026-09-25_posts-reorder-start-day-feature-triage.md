# Session: Ship posts reorder + start day; triage feature backlog

**Date:** 2026-09-25
**Branch:** main
**Session ID:** d66346f3-771d-4258-80ad-fbcd52f1d8e3

## What Was Done
Built and shipped Phase 8: admin can now drag posts into order and set first post's day (default day 1); participants see smooth swipe animation between posts,Renamed 'Follow-up rep' column to 'Support' across all apps,Updated test checklist artifact with Phase 8 checks and marked Phase 7 as live,Audited the 40-item NOW/NEXT/LATER backlog against the live app to identify what's built, half-built, and not started,Discussed and clarified feature requirements: mobilisation stage names, notification permission job cadence (daily/bi-daily), AI manual summary generation

## Files Changed
Test checklist artifact (Phase 8 section added, Phase 7 marked live),Scriptures admin page (post reorder UI, start day picker, drag ordering),Participant home (smooth swipe animation on posts),Contacts table (Follow-up rep → Support rename)

## Key Decisions & Patterns
Posts show on configurable start day; default is day 1; new uploads go to end of list,Participants see last post instead of loop if they've passed it,Notification permission reminder job should run daily or bi-daily to re-prompt users who disabled it,AI manual summary: when manual uploaded, auto-generate 3 suggested titles + preamble text so admin doesn't read the full manual

## Backend / Handoff Notes
None

## Pending Tasks
User testing Phase 8 on live app (post reorder, start day, smooth swiping),Three checks that need live Sunday testing: attendance countdown, hub meeting reminder, follow-up alert,Build notification permission reminder job (check daily or bi-daily, prompt if disabled),Build AI manual summary feature (auto-generate 3 title/content suggestions when manual added),Clean up old/unused rows in test checklist,Build remaining items from NEXT/LATER lists (clutter audit items, other refinements)

## Errors Hit & Fixes
None
