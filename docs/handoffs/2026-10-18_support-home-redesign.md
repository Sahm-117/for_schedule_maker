# Support Home redesign (first support page)

## Summary
First page of the approved supports redesign. Frontend only: no migrations, no functions deployed.

## Shipped
- Support Home: the "Programme progress" box and the four quick links are replaced by a Next class card (class title, week, teacher chip, Open classes) and a "Your group" list (next group meeting, faith projects, My Hub, join group call, Practice). Hub-only supports get "Your hub" (next hub meeting, My Hub).
- Mark attendance / Open hub meeting button, alerts, surveys, Today and the checklist are unchanged.
- Tour steps for Home reworded to match.

## Live changes
None.

## Decisions and why
- Rule 66 kept: a hub-only support's next hub meeting still comes from their own hub. The tile's own Join Call button is gone; the live banner and My Hub still join the call.
- The design canvas was approved by the user ("You can start implementing"); pages are built one at a time, Home first.

## How it was tested
Type check (no new errors beyond the 7 known) and vite build. Looked at in a browser with the backend mocked, so no real data was shown.

## Open items
- Remaining support pages from the canvas are not built yet: My Group, Schedule, Mobilisation, Follow-ups, My Hub (and its role views), hub meeting steps, Attendance, Classes, Community, Announcements, Resources.
- Not checked against real data with a class and teacher set.

## Gotchas
- `data-wt` targets `home-metrics` and `home-quick-links` now sit on the new cards; the tour depends on them.

## Addendum: tabs, My Hub, Schedule
- Every support tab bar now uses the person's accent (Attendance, Follow-ups, Mobilisation, My Group, Schedule, My Hub).
- My Hub: the Hub Leads tab is gone from the bar; Hub Leads see the meeting as a card at the top of My Hub (`?tab=leads` still opens the full page, so the Practice step keeps working; its hint was reworded).
- My Schedule: Today / Tomorrow / Full week are chips instead of a dropdown.
- Not rebuilt yet (the app already behaves as the canvas shows, only the look differs): Mobilisation, Follow-ups, Classes, Community, Announcements, Resources, and the hub role views beyond what exists today.

## Code-review fixes
- Hub Leads page tab removed entirely (card only); Practice step links to My Hub. `LeadsMeetingTab` is now unused but left in place.
- Home keeps My tasks and Resources rows, and a hub-only support still gets a "Join hub call" row inside the 10-minute window.
- Open classes hides when there is no next class; schedule day chips are plain pressed buttons.
- Known, left: the Leads card swallows a failed load silently.

## Addendum 2: My Group, Attendance, and what was checked
- My Group → People: each person is one row (name, group, ready for class, faith project, access, last seen); tap the name to open every detail. Help requests, faith-help requests, testimonies and flags stay visible while collapsed.
- Attendance: "N to go" next to the marked count.
- Compared with the canvas and left as they are because the structure already matches: Classes (next-class card with teacher, manual and recap buttons, past and coming-up lists), Resources (shared hub), Attendance rows.
- Not changed, not compared in detail: Mobilisation, Follow-ups, Community, Announcements, Notifications.

## Review fixes (round 2)
- People rows keep every status chip visible (archived, retaking, access, alerts, project with category hint); only the onboarding steps are folded.
- Leads card shows a message if it fails to load; Home shows a greyed "Join hub call · Opens 10 min before" row; group call row only for supports with no hub; Open classes stays after the last class.

## Addendum 3: Follow-ups and the rest
- Follow-ups (support view): each contact card shows "Next: send a message / send a reminder / call them / close this follow-up" from the contact's next action.
- Compared and left as they are because the live page already has the same sections and labels as the canvas: Mobilisation (save details, target, registered on the form, people you added), Classes, Resources, Attendance.
- Community, Announcements, Notifications and the hub role screens were not restyled; they behave as drawn.

## Addendum 4: remaining pages
- Announcements feed: the source or pin label, "Today / Yesterday / date", line breaks kept, and the link button when an announcement has one.
- My Schedule: an "Up next" card with Mark done for the next not-done activity today.
- Community: accent tabs.
- Hub role screens (prayer lead, recap lead, assistant, member follow-along), Notifications and Mobilisation were left as they are: the live pages already have the same pieces as the canvas, only the finish differs. Not restyled.
- Review fixes: Up next uses Lagos time, ticks each minute, keeps an activity that started less than an hour ago, and only shows on a published schedule. The announcements feed shows time of day, the year for old ones, "All users" for all-user sends, and only opens http, mailto, tel or in-app links.
- Verified: type check and build. Not opened in a browser with real data; the feed, Up next and Community tabs were not run in Playwright.

## Final pass
- Notifications bell: tabs follow the person's accent. Its structure (Announcements and Activity tabs, Mark all read) already carries what the canvas shows, so it was not rebuilt as one All/Unread list.
- Mobilisation and the hub role screens: compared again, no change needed.
- The accent tabs on the notification bell and on Community apply to supports only; admins and preparers keep the dark tabs.
- Verified: type check and build only. The bell, Community and the other support pages in this handoff were not run in a browser against real data.

## Last items
- Follow-ups (support cards): "Next: …" is back, now worked out from the contact's real status (`nextStepFor` in `utils/followUps.ts`): send a message, wait for a reply, send a reminder, help them register, call them back, share their login, wait for them to sign in, help with login. Closed, parked, archived and teen contacts show nothing.
- Notifications bell: "Unread only" toggle on each tab. Seen in a browser against mocked data.
- Not done, by decision: the full person sheet on My Group (people are collapsed rows with details one tap away), and restyling the hub role screens and Mobilisation (no functional difference from the canvas). Participant People, Resources and Feedback never had a canvas board.

## Follow-up (teacher tap, waiting-to-be-assigned tag)
- Support Home: the teacher on the next-class card is tappable and opens the teacher sheet (a Teen Support sees the teen teacher when one is set, as on Classes). FLOW_MAP rule 46 updated.
- Follow-ups: the "Waiting to be assigned" / "Gender not known" tag no longer shows on closed contacts (no response, wrong number, not interested), parked next-cohort contacts or archived ones. It only describes people who could still be handed out. The summary counts were already right.
- Verified: type check and build only; not opened in a browser.

## Mobilisation > Follow-ups, as on the canvas
- A "To follow up" card on top (open people, and how many are closed).
- Each person is one card: initials, name, phone and when they were assigned, chips for where they stand, replied and called status and "Next: …", then Message (opens the templates, which still offer WhatsApp and email), Update, and a ⋯ menu (Call, Copy number, Open WhatsApp chat, Send email, Log an issue, Edit contact).
- Update opens a sheet with the existing status steps and the "Where do they stand?" choice, saved as it is chosen, plus the login details when they apply. The separate reply / call / next-action fields drawn on the canvas were not added: the real follow-up uses one status, and the canvas fields would not map to it.
- Seen in a browser against mocked data only (two contacts); the Message sheet and the ⋯ menu were not opened.
- Review fixes: the "To follow up" card counts people by real status (finished ones count as done, not as still open); the Update sheet closes itself before the Not interested, Login issue and Teen onboarded questions open; Home only asks who the Teen Supports are when the week has a teen teacher.

## Final completion pass
- Mobilisation > Follow-ups Update sheet now also has "Have you called?" (Not called / Called / No answer), "Follow up again on" (date) and Notes (saved on leaving the field), next to the status choice. The canvas's separate reply and registration fields stay out: the status choice already drives them.
- My Group: an expanded person has "All details" (the existing details sheet).
- Hub prayer lead / recap lead view: a line says which step is theirs and that the lead or assistant takes attendance and submits.
- Participant People, Resources and Feedback already use the same card style as the redesigned participant pages; nothing to change.
- `npm audit fix` (no breaking changes) took the dependency alerts from 14 to 7. The rest need a Tailwind major upgrade (`--force`) and were left.
- Checked in a browser against mocked data: Home with a class graphic and a tappable teacher, the announcements feed (hub-role label, line breaks, link button, time), Settings pause switches, the Follow-ups Update sheet (a "Called" tap sent the update). Not checked against real data (no real login available here). Classes, Up next and the My Group rows were checked by type check and build only.
