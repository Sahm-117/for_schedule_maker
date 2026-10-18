# Hub meeting opens on the next meeting; admin tab strip scroll

## Summary
My Hub > Meeting now opens on the next meeting to hold, not on a week that is already submitted. A submitted week no longer shows the live "Waiting for … to pick someone" card. The admin section tab strip scrolls the current tab into view on phones.

## Shipped
- `SupportMyHubPage.tsx`: the default week skips weeks already submitted (next week by number that is not submitted; if none, stays where it was). Waits for the hub to load first.
- `HubMeetingPanel.tsx`: for a submitted week with no prayer started, follow-along viewers see "This meeting has been held and submitted." instead of the waiting card.
- `SectionTabs.tsx`: the strip scrolls so the current tab is centred (only the strip scrolls).

## Live changes
None. Frontend only.

## Decisions and why
- An earlier push (13a6764) showed the waiting card for the next week; that was a misreading and is removed. The next meeting shows no live prayer card until the meeting starts (FLOW_MAP rule 63 logic unchanged).

## How it was tested
`npm run build`. Not yet seen on a phone.

## Open items
- Check on a phone as a non-lead: opens on Week 2, Week 1 says held and submitted.
