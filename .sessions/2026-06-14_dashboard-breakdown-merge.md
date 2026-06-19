# Session: Merge Contacts + What happened into single Breakdown table

**Date:** 2026-06-14

## What was done

- Merged the old "Contacts" table (Owner, Assigned, Still Open) and "What happened" table (Owner, Registered, Wrong Number, Not Interested, Not a Good Time, Not a TCN Member, No Response) into a single **Breakdown** table.
- Columns: `Owner | Assigned | Still Open | Registered | Wrong Number | Not Interested | Not a Good Time | Not a TCN Member | No Response`
- Removed the separate "Contacts" card and the `AccordionSection` wrapper around "What happened".
- Updated subtitle to "Every contact accounted for — still open or why they stopped."
- Made `Assigned` semi-bold, `Still Open` bold amber-700, `Registered` semi-bold emerald-700.

## Motivation

The user's mental model didn't include Still Open when looking at the What happened totals. Fakolujo's row showed Assigned=7, Still Open=1, and What happened columns summing to 6. Merging them into one table makes the full picture visible at a glance.

## Files changed

- `frontend/src/components/followups/FollowUpDashboard.tsx` — 17 insertions, 38 deletions

## Commit

`6ae80fb` — "Merge Still Open into single Breakdown table"

