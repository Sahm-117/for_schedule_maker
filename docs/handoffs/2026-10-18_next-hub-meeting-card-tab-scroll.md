# Next hub meeting card, admin tab strip scroll

## Summary
After a hub meeting is submitted, the next week in the My Hub meeting picker shows "Waiting for … to pick someone…" straight away. The admin section tab strip scrolls the current tab into view on phones.

## Shipped
- `HubMeetingPanel.tsx`: the follow-along prayer card also shows for the first unsubmitted week after the latest submitted one, without waiting for the meeting window.
- `SectionTabs.tsx`: the strip scrolls so the current tab is centred (only the strip scrolls, not the page).

## Live changes
None. Frontend only; no migration, no function.

## Decisions and why
- A Prayer Lead's own screen is unchanged (rule 63).
- Only the week right after the latest submitted one counts; later weeks and old unsubmitted weeks keep the "once the meeting starts" message.

## How it was tested
`npm run build`; code review. Not yet seen on a phone.

## Open items
- Check the tab strip and the next-week card on a real phone.

## Gotchas
- The first meeting of a cohort still waits for the meeting window (nothing is submitted yet).
