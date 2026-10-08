# Venue map in Get ready

## Summary
The participant home "Get ready" list has a new required step: open the FOF venue map (church entrance to the
New VIP Lounge after first service) and tick "I understand". "I have all I need" stays locked until it is done.
The whole list now stays until the participant's first attendance is marked present, late or left early, so
absent people keep it after the cohort starts. People already ready or completed are not asked again.

## Shipped
- `VenueMapModal` (portal overlay, tick + Done), `public/venue-map.webp`, home page wiring, `ackVenueMap` API.
- FLOW_MAP rule 35.

## Live changes
- Migrations `20261008130000_venue_map_ready_step.sql` and `20261008140000_venue_map_already_ready.sql` (already-ready people count as having done the map) applied: `ParticipantOnboarding.venueMapAckAt`,
  `participant_ack_venue_map`, `participant_onboarding_state` (adds `venueMapAcknowledged`, `hasAttended`),
  `participant_confirm_ready` (needs the map). No edge functions.

## Decisions and why
- Saved in the database, not the browser, so it survives a new phone.
- "Attended" = PRESENT, LATE or LEFT_EARLY. Excused or absent does not retire the list.
- Staff onboarding pills are unchanged: the map is part of the Ready step.

## How it was tested
Playwright with mocked backend: absent person after start still sees the list, Ready locked until the tick,
ack call made, 3 of 4 becomes 4 of 4, attended person sees no list. State function checked live (fields present;
65 of 294 participants currently have attendance). Not exercised against a real participant session.

## Open items
- `push-reminders` source now mentions the map and skips people who attended, but is NOT deployed yet; until it is, the 7pm reminder can say "confirm you're ready" while the map is the missing step.
- Mid-programme, anyone with no qualifying attendance (late joiners, excused) sees the list, by design.
- Staff Onboarding page does not show the map tick separately.
- Participants with the list hidden have no permanent link back to the map.

## Gotchas
- The onboarding state now loads for every non-completed cohort, not only before the first class.
