# Announcements: send to several supports at once

## Summary
- The composer's "Send to specific people" now lets the admin pick **several supports** (searchable multi-select; each shows the group they lead, or "No group yet") when the audience is Supports. A **Supports with a group (N)** shortcut picks every support who leads a group in this cohort, and **Clear** empties the pick. One pick is sent exactly as before (a single person); two or more are sent as a list.
- Picking people overrides the tag, hub and role filters, as the single-person pick did. Participants and Both keep the one-person picker.
- History shows "To: N supports" (hover for the names). Supports see a list-targeted announcement only if they are on the list; admins see all.

## Live changes
- Migration `20261013090000_announcement_target_user_ids.sql` (applied live): `Announcement."targetUserIds" uuid[]`, nullable, additive. Rollback is in the file.
- Edge function `send-announcement` deployed as **v23** (v22 first, then a review fix; v21 matched the repo before): accepts `targetUserIds` for the Supports audience only (ignored for any other), stores it with the tag and hub columns cleared, and uses it as the whole recipient set (no participants, no tag/hub filtering), like a single `targetUserId`. Popups are created per resolved recipient, so only people on the list get one.
- Frontend files: `AnnouncementsModal.tsx`, `supabase-api.ts` (send, history mapping, visibility), `api.ts`, `types/index.ts`.

## How it was tested
- Browser (local app, mocked backend, admin): the shortcut picked the 3 supports who have a group (the 4th has none), the confirmation line read "Only these 3 supports will get this.", the request carried `targetUserIds` of those three with no hub, tag or single-person id, and the history showed "To: 2 supports" for a stored list.
- Live: the deployed function was called once with two non-existent user ids. It returned 0 recipients (nobody notified) and the announcement row held the list; that test row was then deleted by its id.
- NOT tested: a real send to real supports, and the push/bell delivery of a list-targeted announcement.

## Open items
- A phone still running an older cached copy of the app would show a list-targeted announcement in its in-app feed to every support (push and popups still go only to the list); it clears when the app updates.
- `targetUserIds` has no foreign key or index (a removed user's id stays in the array and shows as "a support"); fine at this size.
- Admins whose main role is Admin but who hold the Support tag appear in the list, as they do in the single-person picker.
- A list-targeted announcement shows "To: N supports" in History; the names are only in the hover title.
