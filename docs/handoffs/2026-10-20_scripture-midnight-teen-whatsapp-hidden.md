# Scripture drops at midnight; teen WhatsApp card hidden

## Summary
The daily Inspirational Scripture now opens at 12:00 AM Lagos on its own date (was 2:00 PM), so participants can plan early mornings around it. The scripture push uses the same moment. The WhatsApp group card is hidden on a Teen Support's My Group.

## Shipped (repo only, not pushed or deployed)
- `utils/participantApp.ts` `scriptureDayIndex`: FOF day N is open from midnight on its date, no 2 PM cut-off. Every scripture view reads it.
- `push-reminders/index.ts`: `SCRIPTURE_OPEN_MINUTES = 0`; the 10-minute cron sends from 12:00 AM and a late run catches up within 3 hours. FLOW_MAP rule 83 reworded; rule 27 notes the hidden card.
- Wording: admin Scriptures page, admin and participant tours, carousel comments.
- `SupportParticipantsPage.tsx`: `TeenWhatsAppGroupCard` no longer rendered. The component and `User.whatsappGroupUrl` are kept (nothing deleted).

## Live changes
`push-reminders` deployed as v55 on 2026-10-21, with the push moved to 5:00 AM (see the teen-password handoff of the same day).

## Decisions and why
- Midnight reading: day N's post shows from 00:00 on its own date. The push goes out at that moment too, so participants get a notification around midnight. Say if the push should be later than the drop; it is one constant (`SCRIPTURE_OPEN_MINUTES`).

## How it was tested
`npm run build`. Not run in a browser, and no Deno here.

## Open items
- Deploy `push-reminders` and dry-run it with `{"dryRun":true,"asOf":"<a 12:05 AM Lagos moment>"}`.
- The rota duty "Inspirational post" in `config/rotaDuties.ts` still says 2:00 PM; whoever posts the design should know it is now due before midnight.
- Templates that carry `{{group_link}}` still need a saved WhatsApp link, and the card to save it is hidden. Check no teen template uses it.
