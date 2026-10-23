# "Not ready ›" shows what a participant still has to do

Date: 2026-10-23. Frontend only.

## Summary

- My Group › People: on a collapsed adult card the orange **Not ready** chip now has a chevron. Tapping it opens a sheet, "What <first name> still needs to do", listing the five Get ready steps in the participant's own wording (Introduce yourself, Check the venue map, Read the Intro Class guide, Finish your profile, Ready for class). Done steps are ticked; each step still to do says what they do in their app (and, for the profile, how many things are missing). If the person has not signed in yet, a first line says to send their login from ⋮.
- Uses the existing `participantStepDone` rule, so after their first class the map, guide and ready tick count as done, as before. Teen cards are unchanged.
- FLOW_MAP rule 57 updated.

## Live changes

None.

## Checked

- `npm run build` passes; eslint shows only an older `any` on a line not touched.
- Checked in a browser: local frontend with mocked backend data (made-up group of three in different states), as a support: chip shows "Not ready ›", the sheet lists 2 done and 3 to do with the right help text. Not checked against the deployed backend (no support login here).

## Also made (not in the repo)

- A visual Support App Guide PDF built from the same local screens (sample data): Home, Profile, Schedule, Sunday register, My Hub, Community, Resources, Mobilisation, reading a participant card and its tags, the Not ready sheet, and the participant's Get ready view.
