# 2 Oct: surveys, landing page restyle, 404 page, announcement heading

## Built (committed on `main`; pushed only where noted in git log)
- **Announcement Home heading**: `Announcement.homeLabel`, admin types the small heading ("Urgent", "Reminder"...), required when "Show on home screen" is ticked. Shown on support and participant Home (old rows keep "Urgent" / "From the FOF team"). `participant_home` patched live to return it.
- **404 page**: `NotFoundPage` for unknown addresses, redirects to `/` after 4 s.
- **Landing page** (fof.tcnikorodu.org) restyled to match tcnikorodu.org: full-width nav bar, centred mixed-case hero, white-on-orange buttons, two-tone headings, green footer with outlined word, mobile menu, "Member portal" naming. Crest at `public/logo-crest.webp` (copied from tcnikorodu.org).
- **Surveys** (migration `20261002200000_surveys.sql`, applied to prod): tables `Survey`, `SurveyQuestion`, `SurveySubmission`, `SurveyAnswerSet`, `SurveyNotified`; RPCs `survey_pending/get/submit` (participants and supports), `survey_admin_list/get/save/delete/results/save_summary`; helpers `survey_window`, `survey_people`, `survey_open_for_*`.
  - Question kinds: text, text area, number, rating (per-question scale 2-10 and end labels), image/file (5 MB, stored under `survey-files/` in the `resources` bucket), plus department and yes/no for the wrap-up.
  - Built-in **WRAPUP** survey replaces the hardcoded "Your cohort is wrapping up" card: editable heading, line, button, questions, timing (weeks before the cohort ends + days it keeps showing, or fixed dates), on/off. Its department and referral answers still go through `submit_wrap_up` (ParticipantWrapUp, DepartmentReferral, support notified).
  - Anonymous surveys store no respondent or time on the answers; answers show only once 5+ people answered.
  - Admin pages `/surveys` (list, builder overlay) and `/surveys/:id` (summary, all answers, who answered, CSV, PDF, AI summary). Participants and supports see open surveys as cards on Home (`/me/survey/:id`, `/support/survey/:id`).
  - Edge functions deployed: `ai-assist` v3 (`survey-summary`), `push-reminders` v33 (sends a "survey opened" announcement once per survey and cohort via `send-announcement`).
- In-app guide: Practice section for supports; Surveys section for admins; "How do I answer a survey?" for supports and participants.

## Not done / next
- Mid-cohort and end-of-cohort feedback are NOT yet converted to built-in surveys (still the old `FeedbackResponse` flow); the old Feedback page is unchanged.
- Narrowing a support survey to a hub or tag (only "one group" for participants is built).
- Biodun Bello (contact 454f15b8, phone "00") and Oreoluwa Adegboyega (08066783672) share an owner; a "Hi Biodun" WhatsApp went to Ore's number. Neither is marked messaged, so it was a manual paste, not the app's link (which uses each contact's own number).

## Rule (from the user): a contact with an open issue is never auto-reassigned
Logging an issue on a contact means it is being looked into. `followup_stale_contacts()` (the list the auto-reassign sweep draws from) now skips any contact with an OPEN issue, whatever its date (migration `20261002310000_*`, applied). Before, only an issue logged after the last assignment counted, which missed Biodun Bello (moved from Kenneth Alonge to Adetunji Adediran on 1 Oct 08:10 with reason NOT_NOW while Kenneth's issue was open; a trigger resets `ownerAssignedAt` whenever the owner changes, which is how the old test missed it). Biodun is still with Adetunji; moving him back is left to the user.
