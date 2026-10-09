# Next class card: class graphic and teacher

## Summary
Staff can give each class a graphic and a teacher (name, role, short bio, photo) in the week editor on the Cohorts
page. The participant home shows a "Next class" card for the next class: the graphic with the class name over a soft
dark fade, the teacher as a chip (tap for a short sheet), and one button. The date, countdown and week count are not
repeated. The button is "Open manual" once the manual is released, a disabled "Manual arrives Thu 22 Oct" while an uploaded manual waits for its release time, and absent if no manual was uploaded.
With no graphic and no teacher the old plain manual row stays.

## Live changes
- Migrations `20261009110000_class_card.sql` and `20261009120000_class_card_manual_only_if_uploaded.sql` applied: five new columns on `Week` (`classGraphicUrl`, `teacherName`,
  `teacherRole`, `teacherBio`, `teacherPhotoUrl`) and `participant_home` rewritten from the live definition to add
  `teacher`, `classGraphicUrl` and `manualReleasesAt` to each week. Grants unchanged. No edge function.
- Checked live with a rolled-back test (temporary teacher on week 2, a temporary participant session): the new keys came
  back and nothing was left behind.

## Files
`NextClassCard.tsx` (card and teacher sheet), `ParticipantHomePage.tsx` (placement), `CohortsPage.tsx` (editor section),
`supabase-api.ts` (`uploadClassImage`, week mapping), `types/index.ts`.

## Decisions
- Teacher details live on the class (week), not in a separate teachers list, as asked. A teacher who teaches twice is entered
  twice.
- The card is about the next class (the "Next class" tile's week), not the current week.
- Pictures are shrunk in the browser (graphic 1000px, photo 640px) and stored in the same public bucket as avatars.

## How it was tested
Browser with a mocked backend: participant home in five states (graphic + teacher, manual released, no teacher, no
graphic, neither falls back to the old row), the teacher sheet opens and closes; admin week editor uploads two
pictures and saves the teacher fields. Not run against a real login or real storage.

## Open items
- Nothing yet adds a teacher to the Schedule or Classes pages for supports; participants only.
- Teens do not use the participant app, so they do not see the card.

## Gotchas
- `manualReleasesAt` is the configured release time (default Thursday 18:00, Lagos), given only while a manual document exists.
- `participant_home` is copied whole into the two migrations. A later change must start from the live definition, or it will drop `teacher`, `classGraphicUrl` and `manualReleasesAt`.
- Replaced or removed class pictures are deleted from storage on Save (best effort); a picture uploaded for a different week than the one being edited is dropped.
- Image resizing now fills a white background first, so a transparent PNG no longer turns black (this also applies to avatar uploads).
