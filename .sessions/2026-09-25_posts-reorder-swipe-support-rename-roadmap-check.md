# Session: Posts reordering, smooth swiping, Support rename, roadmap review

**Date:** 2026-09-25
**Branch:** main
**Session ID:** d66346f3-771d-4258-80ad-fbcd52f1d8e3

## What Was Done
Renamed 'Follow-up rep' column to 'Support' in Contacts table,Built post reordering on Scriptures admin page with visual 1st/2nd/3rd indicators,Added 'First post shows on day ___ of FOF' configurable start day selector,Implemented smooth swiping transitions for posts on participant home (no jump),Changed new uploads to go to end of list (removed Day input from upload form),Tested all changes locally against live backend data,Pushed changes to production; website rebuilt and live,Updated FOF Test Checklist artifact with 9 Phase 8 checks,Reviewed 40-item NOW/NEXT/LATER roadmap list against actual app state,Clarified mobilisation stage names and current status,Identified AI manual summary feature as needed for Class Manual step

## Files Changed
Admin scriptures/posts page (reorder UI, start day selector),Participant home posts view (smooth swipe implementation),Contacts table (Follow-up rep → Support rename),FOF Test Checklist artifact (Phase 8 section added),Session memory updated with roadmap decisions

## Key Decisions & Patterns
Posts configured with start day; default day 1; no looping after last post,New uploads append to end; user drags into desired order,Support rename applied consistently (was Follow-up rep),Roadmap half-built NOW list; many items already done with different naming,AI manual summary feature (read manual → suggest 3 titles/preambles) marked as next priority

## Backend / Handoff Notes
None

## Pending Tasks
Test Phase 8 checks: post order, start day, smooth swiping on live app,Test participant attendance countdown on Sunday (live day only),Test hub meeting reminder on live day,Test alert when support raises follow-up issue,Implement AI manual summary for Class Manual step,Run clutter audit across Support app, Participant app, Admin/back office,Tidy old rows in test checklist,Confirm dropdown behavior issues resolved (if user reports any)

## Errors Hit & Fixes
None
