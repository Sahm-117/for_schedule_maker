# Dashboard counts people in groups; gender column and group filter

Date: 2026-10-22. Frontend only.

## Summary

- **Dashboard:** the Class attendance and Faith projects cards count only active participants who are in a group, and say so ("In groups only", "of N participants in groups"). Before, both used every active participant, including people not placed yet. FLOW_MAP rule 96.
- **Participants page (admin):** the Profile % column is now a Gender column. The Profile filter (Incomplete / Complete) is unchanged.
- **Groups page (admin):** new Gender filter (Women / Men / Mixed) in the Filters sheet, kept in the link (`?gender=`). It filters the Teen groups section too. A group's gender is its members' gender (people with none on file skipped), Mixed when they differ, and the support's gender when no member has one. Mixed only shows when a group is mixed.

## Live changes

None. No migrations, no function deploys. `cohort_health()` is unchanged: the dashboard filters with `cohort_people` (`groupId`) and a new read, `faithProjectsApi.getSavedParticipantIds` (participant ids with a SAVED project).

## Checked

- `npm run build` passes; eslint shows only older `any` errors on lines not touched.
- Live Cohort 10 (not archived, not test): 82 active, 76 in a group (60 adult groups, 16 teen groups), 6 not in a group. Expected cards: Class attendance Week 1 76/76 marked; Faith projects 12 written of 76 participants in groups.
- Not checked in a browser (no admin login in this environment). Owner to check the Dashboard, Participants table and Groups Gender filter once deployed.

## Decisions

- Teen-group members count as "in a group", matching `inGroups` on the Participants card.
- "In a group" is today's placement, for past weeks too (there is no placement history). Someone taken out of a group drops out of earlier weeks' counts; `cohort_health` already groups attendance the same way.
- A group whose members have no gender on file takes its support's gender; a group with neither matches no Gender choice.
- Without the per-person lists (`cohort_people` or the saved-project read failing), the cards fall back to `inGroups` and the cohort-wide saved count, capped at that total.

## Open items

- 6 active Cohort 10 participants are not in a group: 3 No response, 1 Next cohort (teen), 1 Teenager with a wrong number, 1 with login shared and replied, who looks ready to place.
- 26 of the 76 people in a group have a profile picture (24 of 60 adults, 2 of 16 teens), as asked by the owner on 22 Oct.
