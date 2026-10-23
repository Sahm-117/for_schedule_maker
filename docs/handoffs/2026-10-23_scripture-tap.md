# Inspirational Scripture opens on tap (support and participant Home)

Date: 2026-10-23. Frontend only.

## Summary

- **Participant Home** (`InspirationCarousel`): tapping the picture did nothing; only "See all" opened posts. A tap now opens the current post full size in the same sheet "See all" uses (Like, Download, Share included).
- **Support Home** (`ScriptureCarousel`): the tap was detected by hand on pointer-up, which iPhones often cancel (a tiny movement on a scrollable page sends `pointercancel`), so it rarely opened. The picture now opens on the browser's own click, which phones send for a real tap and never for a scroll or swipe.
- Both: a move of more than 8 px marks the gesture as a swipe, so the click after a swipe does not open anything. The picture area is a keyboard-usable button (Enter or Space opens it).

## Live changes

None.

## Checked

- `npm run build` and eslint on both files pass.
- Local frontend with mocked data in a touch phone browser (Playwright, `hasTouch`): a tap opens the picture on the support Home and the post sheet on the participant Home; a swipe opens neither. Not tried on a real iPhone or against the deployed backend.
