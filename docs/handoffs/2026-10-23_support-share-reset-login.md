# Supports share or reset a participant's login from the card menu

Date: 2026-10-23. Frontend only.

## Summary

- My Group > People: each participant card's ⋮ menu has **Share login details** (no password chosen yet) or **Reset password** (password chosen). The label comes from the signed-in list the page already loads.
- Both open a sheet with the existing login card. Share creates the first-time code if needed and gives Copy / WhatsApp / email. Reset goes straight to the "Create new code" confirmation (it signs them out and resets everyone on the same number), then shows the new message to send.
- The sheet loads the real status, so if the label was out of date it still does the right thing. Teens: the login is the guardian's (guardian wording).
- After a reset the menu goes back to "Share login details" (the sheet reports the new status), and a teen's inline guardian login card reloads, so nobody issues a second code by mistake. "Login details" shows while the signed-in list is unknown; archived participants have no login item.
- FLOW_MAP rule 97. A code review found the stale label, the teen double card, archived people and the first-name helper; all fixed before pushing.

## Live changes

None. No migrations or function deploys. `participant_login_details` already lets a group's support (and cover support, follow-up owner, IT Support, admins) read, issue and reset; a non-admin still cannot issue a first login without a sign-up form.

## Checked

- `npm run build` passes; eslint on the two files shows only an older `any` on a line not touched.
- Live Cohort 10 groups: every support is `SUPPORT` (25) or `ADMIN` (2), so the database check lets them all in.
- Not checked in a browser (no support login in this environment). Owner: open My Group > People as a support, tap ⋮ on someone not signed in and on someone signed in.

## Gotchas

- Reset replaces the password at once and signs the person out; the new code must be sent straight after.
- A support still cannot issue a first login for someone with no sign-up form (admin-added); the sheet says so and an admin issues it.
