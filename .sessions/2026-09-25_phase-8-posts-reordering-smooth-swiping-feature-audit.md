# Session: Phase 8 shipped: posts reordering, smooth swiping, audit complete

**Date:** 2026-09-25
**Branch:** main
**Session ID:** d66346f3-771d-4258-80ad-fbcd52f1d8e3

## What Was Done
Renamed 'Follow-up rep' column to 'Support' in Contacts table,Built inspirational posts reordering (drag-and-drop) and 'First post shows on day X' configuration,Implemented smooth sliding animation for post swiping on Participant Home,Fixed posts looping after final post (now stops at the end),Tested posts feature against live data on local server,Pushed posts reordering and Support rename to production,Updated FOF Test Checklist artifact with Phase 8 (9 checks covering post order, start day, swiping),Audited 40-item NOW/NEXT/LATER backlog against actual app state; found ~50% already built,Clarified mobilisation flow naming and staging (is correct, no change needed),Confirmed dropdowns working correctly (no rebuild needed),Discussed and planned AI manual summary feature (3 title suggestions when manual added),Planned testimony sharing placement in build order

## Files Changed
Scriptures admin page (posts reordering UI and start day selector),Participant home (post swiping animation and layout),Contacts table schema (Support column renamed),FOF Test Checklist artifact (Phase 8 section added with 9 checks)

## Key Decisions & Patterns
Posts stop at the final one instead of looping; fixes issue for live cohorts already past the last post,Dropdowns already working (June build); no rebuild needed,Mobilisation stages naming is correct; flow already partially built,AI manual summary will suggest 3 titles/preambles when class manual added,Testimony sharing feature placed next to testimonies in build order,Notification permission check needs background job (daily or bi-daily frequency)

## Backend / Handoff Notes
None

## Pending Tasks
Implement AI manual summary feature (reads manual, suggests 3 titles when added),Adjust testimony sharing order in build sequence,Implement daily/bi-daily background job for notification permission checks,Complete clutter audit across Support app, Participant app, and Admin back office,Test Phase 8 on live app: post order, start day, swiping behavior,Live-day testing (Sundays): participant attendance countdown, hub meeting reminder, follow-up issue alert,Review and prioritize remaining NOW/NEXT/LATER items for next phase

## Errors Hit & Fixes
Posts were looping after final post on live cohorts; fixed by making posts stop at the end instead of cycling

## Agreed Roadmap & Build Order (authoritative — supersedes any conflicting line above)

Next session starts at step 1 (clutter review). Correction to the lines above: the notification check runs when the person opens the app (a phone with notifications off cannot be reached by push); the server side only lists unreachable people for their support/admin.

Agreed with Olamide 2026-09-25.

**Dropped:** attendance "Save for review" (attendance is automated); Hub Operational Support role (not for now).

**Wanted:**
- Notification check: re-ask people whose notifications are off (PWA reinstalls lose them). Only possible when they open the app; server can list unreachable people for their support.
- Faith Project "not going well / need help": short questions first, then option to reach their support.
- Post-class feedback for supports (incl. "None") and participants; admin sets the time each prompt goes out (default after 12:00 Sunday, when classes end) in settings.
- Participants choose their department; admin sets which week that prompt goes out.
- Testimonies: any testimony, not just Faith Project (proposed a Testimonies tab in My Journey).
- Class Manual → questions → class → Recap flow. **Waiting on Olamide** for when the manual and the recap drop (manual roughly the Monday before class). Participants ask questions; told some are answered in class, some directly. Note: recaps currently have no release step (push-reminders "Recap is out").
- AI manual intro: when admin uploads a Class Manual, AI reads it and suggests at least 3 options (title + short preamble) to send with it; admin picks/edits. Part of the Class Manual build.
- Testimony sharing (showing/sharing testimonies) goes with the Testimonies build.
- Requests & Questions area in back office: confirmed none exists (Approvals page is only schedule-change approvals).
- Survey builder: short text, long text, dropdown, multi-select, rating.
- Facilitator profiles: small card on participant + support Home (photo left, name + class right), tap to expand bio; admin edits per week's class and sets when it shows.
- Supports recommend a participant as future support from the participant profile → shows in back office.
- Participant nudges on their recap/weekly goal ("how is it going").
- Support Break mode: after a cohort, its supports are on break (~3 weeks, **Olamide to confirm**); on login "You're on break", everything suspended.
- Clutter review of all three apps, especially back office grouping.

**Agreed build order:**
1. Clutter review (report only, no changes until approved)
2. Notification check
3. Post-class feedback prompts (support + participant) + participant department choice
4. Faith Project "not going well" + Testimonies + testimony sharing
5. Support Break mode
6. Recommend as future support + Requests & Questions area
7. Survey builder
8. Facilitator card
9. Class Manual → questions → Recap, with AI intro suggestions (needs Olamide's timings)
10. Goal nudges

Still LATER: resource requests, Media Feed, cross-cohort reporting.

**Correction made:** mobilisation stages do exist (To contact → contacted → Registered → Login shared "All done", plus dropped/next cohort); earlier "no clear path" claim was wrong.

Also open: Phase 8 checks for Olamide on the FOF Test Checklist (https://claude.ai/artifact/8Bi73TwdRiqUSnNxf8SvoA); live-Sunday checks 2.3, 5.13, 5.17. Standing rule: add every new feature to that checklist before saying done.
