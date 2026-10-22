# Teen groups have their own call limits

## Summary
The 17 Oct Teen Supports meeting asked for a weekend recap call around 6 or 7 PM; teen groups shared the adult limits (Thursday to Saturday), so Sunday was refused. Settings > Group call limits now has **Adult groups / Teen groups** tabs with the same controls (days, then earliest start and end for each day). Until an admin saves teen limits, teen groups follow the adult ones (the tab says so). The Teen Support's meeting picker on My Group offers only the teen days and times. FLOW_MAP rule 92.

## Live changes
- Migration `20261022120000_teen_call_limits.sql` applied live 2026-10-22: new `teen_group_meeting_limits()` (falls back to the adult limits), `group_meeting_limits_guard` replaced (teen groups judged against the teen limits). No teen limits are saved yet, so nothing changes until an admin saves them. No edge function.

## How it was tested
- Rolled-back live transaction, then again against the live functions (rolled back), as a non-admin Teen Support and a non-admin adult support: before teen limits, Sunday refused for a teen group; with teen limits Sat/Sun 4–9 PM: Sunday 7 PM allowed, 8:30 PM refused (last start 8 PM), Thursday refused for the teen group; adult group: Sunday still refused, Thursday 7 PM allowed.
- `npm run build` passes; type errors unchanged (7); no new lint errors.
- Not tested in a browser.

## Open items
- An admin needs to set the teen days and times (the owner suggested weekends, 6 or 7 PM).
- `MeetingTimeFixPrompt` (rule 85) still only looks at adult groups.
