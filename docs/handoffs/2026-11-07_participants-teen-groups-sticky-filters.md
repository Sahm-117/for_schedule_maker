# Participants shows teen groups; filter buttons stay in view

Date: 2026-11-07.

## Summary

- **Participants now loads teen groups** (`groupsApi.getAll({ includeTeenGroups: true })`). The Group and Support
  filters list them, a teen's Support column shows their Teen Support, and someone in a teen group counts as a teen
  even when their age range is missing. "Assign to group" still offers adult groups only (`adultGroups`); a teen
  gets the Teen Support picker (rule 135).
- **Filters panel (shared `FilterBar`, every page that uses it):** the title and the Clear / Apply buttons are pinned;
  only the choices scroll, so Apply is always in view on a phone or a short laptop screen.

## Live changes

None (frontend only).

## How it was tested

`npm run build` (30 tests). Playwright as the test admin against the local app and live backend, writes blocked: at
1440×760 and 390×700, Apply sits in the viewport before and after scrolling the choices to the end; the Group filter
lists the 5 teen groups and choosing one shows its teens; no console errors. The temporary session was deleted.

## Gotchas

- The group-gender server rule (rule 135) does not check teen groups; the screens never offer a teen group to an adult.
