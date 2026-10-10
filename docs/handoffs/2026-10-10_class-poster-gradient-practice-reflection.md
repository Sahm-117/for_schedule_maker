# Class poster always shows; Practice holds back the reflection until ready

## Summary
- Why a Practice participant saw "Your Week 1 reflection is waiting" next to Get ready: the Practice cohort is dated today and `participant_home` treats a Practice cohort's recap as always released
  (`COALESCE(cohort."isPractice", FALSE)`), so week 1 reads as started and released. Real cohorts only release the recap after the class (`recap_release_at`), so a real first-time participant does not get it. No database change.
- Home (`ParticipantHomePage.tsx`): in Practice the reflection card now waits until the participant has confirmed they are ready for class (or finished onboarding). The reflection itself stays reachable from the week page.
- Next class card (`NextClassCard.tsx`): every class now gets the poster. With no graphic uploaded it is a gradient (`gradientFor`, steady for the same class) with the class name, the teacher chip when there is one, and the manual button. The plain manual row only shows after the last class.

## Live changes
None. Frontend only.

## How it was tested
Built CSS plus the real component rendered server-side and screenshotted at phone width: no graphic and no teacher, teacher with manual open, manual not released yet. Build, type check pass; lint shows the same single pre-existing "fast refresh" warning on the exported `hasClassCard`.
NOT tested in the full Practice flow against the live backend.

## Open items
- Two different classes can land on the same gradient colours (a hash of the class number and title).
- The earlier class-card handoff says "no graphic and no teacher keeps the plain manual row"; that is no longer true.
