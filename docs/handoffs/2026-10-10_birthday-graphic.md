# Birthdays: make a birthday graphic

## Summary
- Admin **Birthdays** page: a "Next up" card suggests whoever celebrates soonest (within 14 days) on the tab being viewed, with a **Make graphic** button; every row also has a balloon button.
- The sheet draws a fixed template on a canvas (1080 x 1350), a blend of two reference posters: a tone-on-tone wall of "HAPPY BIRTHDAY" on an orange gradient, a tilted cream card with a pill-shaped **photo** (initials if none or it will not load), a **date badge** (month and day), side lettering and balloons, a role pill ("FOF Support" / "FOF Participant") over a **name** banner, and a scripture quote at the **bottom left** with the crest and "Foundation of Faith · The Covenant Nation · Ikorodu" bottom right. "Try another quote" cycles six scriptures; the grain is seeded by name.
- **Download** saves a PNG; **Share** opens the phone's share sheet with the picture (falls back to download where files cannot be shared).

## Live changes
- Migration `20261013100000_birthdays_list_avatar.sql` (applied live): `birthdays_list` now also returns `avatarUrl` per person. Same function, one extra field, nothing else changed. Checked live with a temporary session (since deleted): 33 supports, 26 with a photo.
- No edge function changes.
- Frontend: `AdminBirthdaysPage.tsx`, new `components/BirthdayGraphicSheet.tsx`, new `utils/birthdayGraphic.ts`, `types/index.ts`.

## How it was tested
- Browser (local app, mocked backend, admin): suggestion card, sheet with a photo, with no photo, with a photo that 404s (initials plus a note), a long double-barrelled name (shrinks to fit), another quote, Download gave `birthday-<name>.png`, no console errors.
- Photos come from the public storage bucket, which allows cross-origin reads, so the canvas can export.
- NOT tested: the Share sheet on a real phone; real photos from the live bucket in the browser.

## Open items
- Participants' birthdays use the same sheet; their photo comes from the participant profile.
- The headline uses a serif italic (Georgia where present); on Android it falls back to the system serif.
- Review fixes: Share runs inside the tap (the picture is made right after drawing); a replaced draw can no longer paint over the visible one; a photo the browser cached without CORS gets one retry; a quote longer than 3 lines ends with an ellipsis; a very long name is shortened with an ellipsis instead of overflowing. The migration file is named 20261013100000 (it was applied live on 10 Oct).
- The "Next up" card follows the active tab and hides while searching or filtering, by design.
