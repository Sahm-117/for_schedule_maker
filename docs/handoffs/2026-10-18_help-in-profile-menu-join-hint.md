# Help moved into the profile menu; Join hint; scripture tap

## Summary
The round floating "?" (Need support) is gone from every screen. Help is now an item in the photo menu, above Log out, for staff and participants; it opens the same "How can we help?" sheet (app guide, WhatsApp to the support contact). A waiting Join button now says when it opens ("Opens Friday at 7:50 PM") instead of "Opens 10 min before the meeting". Tapping an inspirational scripture to enlarge it accepts a slightly looser tap.

## Shipped
- `NeedSupportButton.tsx`: `hideTrigger`, `externalOpen`, `onExternalClose`; `ProfileMenu.tsx`: optional Help item; `AppShell.tsx` and `ParticipantShell.tsx` wire it and drop the floating and desktop header buttons.
- `DiscussionFeedView.tsx`: removed the code that lifted the "?" above the message box (nothing to lift now).
- `joinWindow.ts` `joinOpensLabel`, `JoinCallButton.tsx`.
- `ScriptureCarousel.tsx`: tap counts up to 12 px of movement and 0.9 s (was 6 px, 0.5 s).

## Live changes
None. Frontend only.

## Open items
- Not seen on a phone. The scripture tap fix is a guess from the code (a finger tap often moves more than 6 px); confirm it enlarges.
- Hamburger drawer redesign proposed, not built.
- The group chat message box still sits above the bottom bar (sticky); not changed beyond removing the "?" lift.

## Addendum: teen card
- `ParticipantCard.tsx`: the name, WhatsApp and ⋮ stay on one row on a narrow phone (the name shrinks; the group name truncates). The ⋮ menu for a teen no longer offers "Mark as retaking" (View, Send message, Flag concern remain).
