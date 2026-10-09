# Draft step empty groups, supports see the scriptures, tap a teacher

Frontend only. No migration, no edge function, nothing live to apply. FLOW_MAP rules 44, 45 and 46.

## Summary
- **Draft step, "Make a group for each"** (in Supports without a group): adds one empty draft group per unused support so people can
  be moved in by hand. Review fixes: empty groups are their own "Empty groups" bucket in the gender chips (the chips add up) and
  stay visible in gender views; an empty group has a Remove button; the Draft says how many empty groups will not be created; a
  support with only an empty group still counts as spare for hub coverage.
- **Supports see the Inspirational Scriptures** on their Home, the same swipeable card as participants. The carousel moved out of
  `ParticipantHomePage.tsx` into `components/ScriptureCarousel.tsx` (behaviour unchanged); `components/supports/SupportScriptures.tsx`
  loads the images and settings for supports and respects the `scriptures_enabled` switch.
- **Tap a teacher:** a chip under a week's title on the participant Journey and on the support Classes page (list rows and the
  big next-class card) opens the teacher sheet. The sheet moved out of `NextClassCard.tsx` into `components/TeacherSheet.tsx`.

## Decisions (mine, not asked)
- Supports follow the same scriptures switch as participants. It is **off in Settings right now**, so neither group sees the card
  until an admin turns it on.
- The teacher chip shows for every week that has a teacher name, including weeks not reached yet.
- The teacher sheet on these pages has no manual button (the pages already have one).
- Empty groups made by the button are not created unless someone is moved in; there is no "create empty groups" option.

## How it was tested
Browser with a mocked backend (not a real login): participant Home scripture still swipes back a day; support Home shows the card
with the switch on and none with it off; Journey and Classes chips open and close the sheet without navigating; Draft step button,
chips, Remove and the "not created" note. Build passes.

## Open items
- Real-login check of all three on the deployed site once pushed.
- Supports in a practice cohort get the scripture card too (it reads the practice cohort's start date).
