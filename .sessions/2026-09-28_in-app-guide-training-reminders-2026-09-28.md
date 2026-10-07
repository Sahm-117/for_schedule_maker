# Session: In-app guide and training reminders

**Date:** 2026-09-28
**Branch:** main
**Session ID:** 9186bd8c-4a72-48f6-a22f-788bed237798

## What Was Done
Completed support guide: 16 topics, 59 answers with screenshots,Completed participant guide: 6 topics, 39 answers with screenshots,Added help (?) button to participant app to open the guide,Took real app screenshots with anonymized names/numbers for all three guides,Generated 193-page PDF guide (FOF-Ops-App-Guide.pdf) exported to Downloads,Pushed guide changes to main; verified live on both fof.tcnikorodu.org and for-schedule-maker.vercel.app,Investigated training codebase: found trainings only store date, no start time or reminders exist yet,Planned training feature: add optional start time field, send 15-min-after reminder, repeat until marked

## Files Changed
frontend/src/components/AppGuideModal.tsx (guide redesign: topic cards, numbered steps, phone frames),frontend/src/components/NeedSupportButton.tsx (added ? button to participant app),frontend/public/guides/* (support and participant guide content + optimized screenshots),.sessions/INDEX.md

## Key Decisions & Patterns
Guide redesigned with friendly topic cards and step-by-step format instead of searchable list,Screenshots use made-up names/numbers to protect real user privacy,Participant guide covers: sign-up, activities, follow-ups, meetings, help, feedback (6 topics),Training reminders will reuse existing follow-up alert pattern (repeats until done)

## Backend / Handoff Notes
None

## Pending Tasks
Add optional start-time field to training create/edit forms,Build attendance reminder: fires 15 min after start time, repeats until all supports mark attendance,Test training reminder end-to-end with real supports,Verify reminder stops once everyone is marked

## Errors Hit & Fixes
None
