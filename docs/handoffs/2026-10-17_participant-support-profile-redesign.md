# Participant and support profile redesign (2026-10-17)

Frontend only. No migrations, no edge functions.

- **Profile (participant and support):** the photo is the upload button (camera badge; "Tap your photo to add one" when empty), blank items show as "+ Photo" / "+ Date of birth" chips under the progress bar, and a blank row says "+ Add". One purple Edit button sits in the "Your details" header and opens the form; Cancel and Save at the bottom. The support profile no longer saves each field as it is picked: it saves with one Save, part by part, and says which part failed (earlier parts stay saved). A blank phone leaves the saved number alone.
- **Date of birth:** participants now use the same Day / Month / Year dropdowns as supports (`components/BirthDateSelect.tsx`) instead of the browser's date field. A stored year outside the list is kept as an option.
- **Tabs:** `SegmentedTabs` has an `accent` prop; My Journey, My group and Faith Project use it so the active tab takes the participant's own accent colour. Every other tab group keeps the dark pill.
- **This week card (`components/participantApp/ThisWeekCard.tsx`):** one card on Home and at the top of My Journey: class picture, class name, teacher chip, the four steps (Manual, Class, Recap, Reflect) and one button (manual, reflection or the week). It replaces on Home: the progress card with its four coloured tiles, the "next class" card, the "this week's manual" card and the "reflection is waiting" card. The goal card, "What's expected" card, announcements, surveys, quick tiles and the scripture card stay (scripture stays open). Group call and Faith Project are now two plain rows. The header "Profile 67%" pill is gone; "Finish your profile" is in the Get ready / Still to do lists, and a row covers the other times. Tour steps updated (`ph-hero`; `ph-next-class` removed).
- **My Journey:** progress is one compact card; every reached week is tappable with a chevron; chips read "Write reflection", "Open", "No reflection", "Goal kept", or "Class <date>" for later weeks.
- **A week:** leads with the manual ("Class manual ready", "Manual arrives <date>"); an "After class" card shows the recap and reflection as the next steps while a recap is coming.
- **My group:** subtitle with group and support, "Your group · N people" (the list already showed everyone).
- **Faith Project:** a labelled Edit button in the card header replaces the pencil; the help row reads "Need help? Tell us".
- `NextClassCard.tsx` was renamed `ClassGraphic.tsx` (the card itself is gone; the graphic sheet and manual button are kept for the new card).

Checked in a browser against a mocked backend (not the live database): participant Home, Profile (view and edit), Journey, a week, My group, Faith Project, and the support profile (edit and save sent only the changed phone). Not tried with a real participant account.

Open items: People, Resources and Feedback pages were not redesigned. The manual-first week page does not change when the reflection opens (still with the recap).
