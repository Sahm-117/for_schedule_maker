# Participant Home: compact class row, auto-moving inspiration carousel, manual opens directly

## Summary
- **Next class** is now a compact row (Option C from the preview): a square picture (the class graphic, or a steady gradient by class number when none is uploaded), the class name, a frosted-glass teacher chip, and an arrow. The picture, the name and the arrow open the full graphic in a bottom sheet; the graphic is shown whole, never cropped.
- **Teacher**: the chip opens the teacher details (name, role, bio, photo). The photo can be enlarged (full-screen viewer; Escape closes only the viewer). Long names wrap to two lines then cut off in the chip; the full name shows in the details. This also applies to the Journey and the support Classes lists, which use the same sheet.
- **Open manual** sits in the graphic sheet and the teacher details and goes to `/me/week/N?manual=1`; the week page opens the manual itself (reader, or the PDF when there is no comic version) once, with no second tap. Without a manual yet, it says when it arrives.
- **Inspirational scripture** is a new `InspirationCarousel` (participant Home only): today and the last 4 days, moving every 5 seconds, paused while touched, while "See all" is open, while the tab is hidden, and with reduced motion. Dots underneath (tap to jump), swipe, "See all" top right opening every post so far, each tile labelled with its day (up to 84 posts). The separate old scripture row is gone from the participant Home. The support Home still uses the old `ScriptureCarousel`.
- Guide and tour updated (participant Home entries, tour step for Next class).

## Live changes
None. Frontend, guide text and tour only.

## How it was tested
Browser (local app, mocked backend, participant): five dots, moved on by itself after 5 s, dot tap jumps, See all lists every post with day labels, class sheet with a gradient and with a graphic, teacher details, photo enlarge and Escape, Open manual links to `?manual=1`, and `/me/week/3?manual=1` opens the manual viewer while `/me/week/3` does not. No console errors, no sideways scroll at 390 px. Build and type check pass (no new errors).
NOT tested against the deployed backend or a real participant login, with real class graphics, or with real scripture images.

## Open items
- Scripture images keep the 4:5 shape they were made in (cropping them square would cut their text). The class picture is the square one.
- Colours repeat after 6 classes (gradient palette size).
- The support Home still shows the old scripture card.
