# FOF Ops database schema

Generated 2026-11-05 19:21 UTC from the live database by `scripts/schema-snapshot.py`. Do not edit by hand: change the
database with a migration in `supabase/migrations/`, then run `python3 scripts/schema-snapshot.py`.
The exact SQL is in [`schema.sql`](schema.sql). Business rules are in [`FLOW_MAP.md`](../../FLOW_MAP.md) section 4.

## At a glance

| Item | Count |
| --- | --- |
| Tables | 160 (160 with row-level security on) |
| Views | 6 |
| Functions | 552 (377 the app may call, 174 internal) |
| Triggers | 66 |
| Row-level-security policies | 93 |
| Enum types | 10 |
| Scheduled jobs | 11 |

**How access works.** The app signs people in itself (an `AppSession` token sent as the `x-session-token`
header) and talks to the database as the `anon` role. Tables are locked by row-level security; the app reads
and writes through `SECURITY DEFINER` functions that check the session first. Other church apps never touch
tables: they go through the `public-api` edge function (FLOW_MAP rule 118).

**Extensions:** pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.
**Storage buckets:** `private-files` (private), `resources` (public).

## Scheduled jobs

| Job | Schedule (UTC) | Runs |
| --- | --- | --- |
| `absence_auto_move` | `*/15 * * * *` | `SELECT public.absence_auto_move_due();` |
| `absence_review_remind_saturday` | `0 15-18 * * 6` | `SELECT public.absence_review_remind();` |
| `auto_finalize_sunday_attendance_noon` | `0 11 * * 0` | `SELECT public.auto_finalize_sunday_attendance();` |
| `close_attendance_windows_every_minute` | `* * * * *` | `SELECT public.close_attendance_windows();` |
| `corporate_prayer_slots_every_minute` | `* * * * *` | `SELECT public.notify_prayer_slots();` |
| `followup_assignment_every_10min` | `*/10 * * * *` | `select public.invoke_followup_assignment();` |
| `post_cohort_checkups_daily` | `17 7 * * *` | `SELECT public.post_cohort_checkups_run();` |
| `push_reminder_log_cleanup` | `30 2 * * *` | `delete from "PushReminderLog" where "createdAt" < now() - interval '30 days';` |
| `push_reminders_every_10min` | `*/10 * * * *` | `select public.invoke_push_reminders();` |
| `refresh_age_brackets_daily` | `30 0 * * *` | `select public.refresh_age_brackets();` |
| `refresh_public_holidays_fortnightly` | `0 3 1,15 * *` | `select public.invoke_refresh_public_holidays();` |

## Tables by area

[Accounts, roles and sessions](#accounts-roles-and-sessions) (11) · [Public API (other church apps)](#public-api-other-church-apps) (2) · [Practice mode](#practice-mode) (3) · [Corporate prayers](#corporate-prayers) (10) · [Faith projects and testimonies](#faith-projects-and-testimonies) (7) · [Sign-ups and follow-ups](#sign-ups-and-follow-ups) (12) · [Attendance](#attendance) (7) · [Groups and group meetings](#groups-and-group-meetings) (15) · [Supports and hubs](#supports-and-hubs) (25) · [Participants](#participants) (26) · [Programme: cohorts, weeks, planner](#programme-cohorts-weeks-planner) (7) · [Schedule, tasks and approvals](#schedule-tasks-and-approvals) (6) · [Notifications and announcements](#notifications-and-announcements) (12) · [Surveys and feedback](#surveys-and-feedback) (7) · [Content: scriptures, resources, website, birthdays](#content-scriptures-resources-website-birthdays) (7) · [Settings](#settings) (1) · [App onboarding and tours](#app-onboarding-and-tours) (2)

### Accounts, roles and sessions

#### `AppSession`

about 1,089 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `tokenHash` | text |  |  |  |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `lastSeenAt` | timestamp with time zone |  | now() |  |
| `expiresAt` | timestamp with time zone |  | (now() + '90 days') |  |
| `activeRole` | "Role" | yes |  |  |
| `viaTeenNumber` | boolean |  | false |  |

#### `Label`

about 53 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `color` | text |  |  |  |
| `createdAt` | timestamp without time zone | yes | now() |  |
| `updatedAt` | timestamp without time zone | yes | now() |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `groupId` | uuid | yes |  | `Group.id` |

Referenced by: `ActivityLabel`, `Announcement`, `Survey`, `UserLabel`

#### `PermissionRole`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `description` | text | yes |  |  |
| `isSystem` | boolean |  | false |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `PermissionRoleModule`, `UserPermissionRole`

#### `PermissionRoleModule`

about 29 rows · row-level security on · 0 policies · key: `roleId, module`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `roleId` | uuid |  |  | `PermissionRole.id` |
| `module` | text |  |  |  |
| `canView` | boolean |  | false |  |
| `canAdd` | boolean |  | false |  |
| `canEdit` | boolean |  | false |  |
| `canDelete` | boolean |  | false |  |

#### `SignInThrottle`

not analysed yet · row-level security on · 0 policies · key: `key`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `key` | text |  |  |  |
| `failures` | integer |  | 0 |  |
| `firstFailAt` | timestamp with time zone |  | now() |  |
| `lockedUntil` | timestamp with time zone | yes |  |  |

#### `User`

about 55 rows · row-level security on · 1 policy · triggers: `sign_in_throttle_clear`, `trg_user_age_from_birth_year`, `trg_user_local_phone`, `user_clear_group_support_before_delete` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `email` | text | yes |  |  |
| `name` | text |  |  |  |
| `password_hash` | text |  |  |  |
| `role` | "Role" | yes | 'SUPPORT' |  |
| `createdAt` | timestamp without time zone | yes | now() |  |
| `updatedAt` | timestamp without time zone | yes | now() |  |
| `onboardingCompleted` | boolean |  | false |  |
| `onboardingReplayCount` | integer |  | 0 |  |
| `onboardingLastReplayAt` | timestamp(3) without time zone | yes |  |  |
| `phone` | text | yes |  |  |
| `isCoordinator` | boolean |  | false |  |
| `isActive` | boolean |  | true |  |
| `deactivatedAt` | timestamp with time zone | yes |  |  |
| `avatarUrl` | text | yes |  |  |
| `themeColor` | text | yes |  |  |
| `hubLastSeenAt` | timestamp with time zone | yes |  |  |
| `whatsappGroupUrl` | text | yes |  |  |
| `mustChangePassword` | boolean |  | false |  |
| `gender` | text | yes |  |  |
| `ageRange` | text | yes |  |  |
| `birthday` | text | yes |  |  |
| `isTest` | boolean |  | false |  |
| `roles` | "Role"[] |  | '{}' |  |
| `birthYear` | smallint | yes |  |  |

Referenced by: `AbsenceReviewDone`, `AbsenceReviewMove`, `Activity`, `Announcement`, `AnnouncementPopup`, `ApiClient`, `AppNudgeLog`, `AppNudgeSend`, `AppSession`, `AttendanceExcusal`, `AttendanceFollowUpTask`, `AttendanceRecord`, `AttendanceSession`, `ChurchEvent`, `CoverRequest`, `DepartmentReferral`, `FaithHelpRequest`, `FaithProject`, `FaithProjectVersion`, `FaithThreadRead`, `FollowUpContact`, `FollowUpIssue`, `FollowUpLoginIssue`, `FollowUpNoteHistory`, `FollowUpOwnerCheck`, `FollowUpOwnerReminderLog`, `FollowUpReassignmentLog`, `Group`, `GroupDiscussionSeen`, `GroupOnboardingStatus`, `GroupPost`, `GroupPostLike`, `GroupPostReply`, `GroupPostReport`, `GroupPrayer`, `GroupPrayerFocus`, `GroupPrayerStatus`, `HubComment`, `HubItSupport`, `HubLeadsMeeting`, `HubMembership`, `HubMessage`, `HubMessageAck`, `HubPersonOfInterest`, `HubReaction`, `HubReply`, `HubRoleIntroSeen`, `HubTopic`, `ManualQuestion`, `MeetingAttendance`, `MeetingRecordingOpening`, `Notification`, `OnboardingEvent`, `Participant`, `ParticipantAccount`, `ParticipantAppSetupCompletion`, `ParticipantCheckIn`, `ParticipantFlag`, `ParticipantHandover`, `ParticipantLoginPhone`, `ParticipantNote`, `ParticipantOnboardingStatus`, `ParticipantStageChange`, `PendingChange`, `PlannerChange`, `PracticeMember`, `PracticePeer`, `PracticeProgress`, `ProfileField`, `PushReminderLog`, `PushSubscription`, `RecapRelease`, `RejectedChange`, `Resource`, `ResourceVersion`, `Scripture`, `SupportActivityCompletion`, `SupportChecklistItem`, `SupportClassFeedback`, `SupportHub`, `SupportNote`, `SupportOnboardingOverride`, `SupportSession`, `SupportSessionAttendance`, `SupportTag`, `SupportTagMember`, `TelegramLink`, `Testimony`, `TourProgress`, `UserAppState`, `UserCohort`, `UserLabel`, `UserNotificationSetting`, `UserPermissionRole`, `WebsiteSectionChange`

#### `UserAppState`

about 50 rows · row-level security on · 0 policies · key: `userId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `installedAt` | timestamp with time zone | yes |  |  |
| `lastOpenedInstalledAt` | timestamp with time zone | yes |  |  |
| `device` | text | yes |  |  |
| `notificationState` | text | yes |  |  |
| `sheetShown` | integer |  | 0 |  |
| `sheetDismissed` | integer |  | 0 |  |
| `lastSheetAt` | timestamp with time zone | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `UserCohort`

about 84 rows · row-level security on · 1 policy · key: `userId, cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `supportKind` | text |  | 'PARTICIPANT_SUPPORT' |  |

#### `UserLabel`

about 51 rows · row-level security on · 1 policy · key: `userId, labelId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `labelId` | uuid |  |  | `Label.id` |

#### `UserNotificationSetting`

not analysed yet · row-level security on · 1 policy · key: `userId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `remindBeforeMinutes` | jsonb |  | '[60]' |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `UserPermissionRole`

not analysed yet · row-level security on · 0 policies · key: `userId, roleId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `roleId` | uuid |  |  | `PermissionRole.id` |


### Public API (other church apps)

#### `ApiClient`

about 2 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `keyPrefix` | text |  |  |  |
| `keyHash` | text |  |  |  |
| `scopes` | text[] |  | '{}' |  |
| `isActive` | boolean |  | true |  |
| `notes` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `lastUsedAt` | timestamp with time zone | yes |  |  |
| `revokedAt` | timestamp with time zone | yes |  |  |
| `createdById` | uuid | yes |  | `User.id` |

Referenced by: `ApiRequestLog`

#### `ApiRequestLog`

about 0 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | bigint |  | nextval('"ApiRequestLog_id_seq"') |  |
| `clientId` | uuid | yes |  | `ApiClient.id` |
| `method` | text |  |  |  |
| `path` | text |  |  |  |
| `status` | integer |  |  |  |
| `durationMs` | integer | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `teenRecords` | integer |  | 0 |  |


### Practice mode

#### `PracticeMember`

about 47 rows · row-level security on · 0 policies · key: `userId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `role` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `lastSeenAt` | timestamp with time zone | yes |  |  |
| `inParticipantView` | boolean |  | false |  |
| `resetAt` | timestamp with time zone | yes |  |  |

#### `PracticePeer`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `fromUserId` | uuid |  |  | `User.id` |
| `toUserId` | uuid |  |  | `User.id` |
| `fromRole` | text |  |  |  |
| `toRole` | text |  |  |  |
| `status` | text |  | 'PENDING' |  |
| `hubId` | uuid | yes |  |  |
| `participantId` | uuid | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `respondedAt` | timestamp with time zone | yes |  |  |
| `endedAt` | timestamp with time zone | yes |  |  |

#### `PracticeProgress`

about 85 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `scenarioKey` | text |  |  |  |
| `doneAt` | timestamp with time zone | yes |  |  |
| `stuckAt` | timestamp with time zone | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `autoDisabled` | boolean |  | false |  |


### Corporate prayers

#### `CorporatePrayerCheckin`

about 5 rows · row-level security on · 0 policies · key: `sessionId, personKind, personId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `sessionId` | uuid |  |  | `CorporatePrayerSession.id` |
| `personKind` | text |  |  |  |
| `personId` | uuid |  |  |  |
| `checkedInAt` | timestamp with time zone |  | now() |  |
| `amenAt` | timestamp with time zone | yes |  |  |
| `linkTappedAt` | timestamp with time zone | yes |  |  |
| `withoutLink` | boolean |  | false |  |
| `cantJoinAt` | timestamp with time zone | yes |  |  |

#### `CorporatePrayerCycle`

not analysed yet · row-level security on · 0 policies · key: `cohortId, pool`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `pool` | text |  |  |  |
| `cycleNo` | integer |  | 1 |  |
| `startedAt` | timestamp with time zone |  | now() |  |
| `restartedById` | uuid | yes |  |  |

#### `CorporatePrayerSession`

about 5 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `slotId` | uuid |  |  | `CorporatePrayerSlot.id` |
| `cohortId` | uuid |  |  |  |
| `prayerDate` | date |  |  |  |
| `slotType` | text |  |  |  |
| `opensAt` | timestamp with time zone |  |  |  |
| `closesAt` | timestamp with time zone |  |  |  |
| `timerMinutes` | integer |  |  |  |
| `verseId` | uuid | yes |  | `CorporatePrayerVerse.id` |
| `notifiedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `blocks` | jsonb |  | '[]' |  |
| `audienceAll` | boolean |  | true |  |
| `hubIds` | uuid[] |  | '{}' |  |

Referenced by: `CorporatePrayerCheckin`, `CorporatePrayerTarget`, `CorporatePrayerWallPost`

#### `CorporatePrayerSetting`

not analysed yet · row-level security on · 0 policies · key: `cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `telegramLink` | text | yes |  |  |
| `liveWaitMinutes` | integer |  | 5 |  |
| `liveMessage` | text | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `CorporatePrayerSkip`

not analysed yet · row-level security on · 0 policies · key: `cohortId, participantId, cycleNo`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `cycleNo` | integer |  |  |  |

#### `CorporatePrayerSlot`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `name` | text | yes |  |  |
| `timeOfDay` | time without time zone |  |  |  |
| `slotType` | text |  |  |  |
| `timerMinutes` | integer |  | 15 |  |
| `joinWindowMinutes` | integer |  | 15 |  |
| `targetMode` | text | yes |  |  |
| `notify` | boolean |  | true |  |
| `active` | boolean |  | true |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `blocks` | jsonb |  | '[]' |  |
| `audienceAll` | boolean |  | true |  |
| `hubIds` | uuid[] |  | '{}' |  |
| `telegramLink` | text | yes |  |  |
| `liveWaitMinutes` | integer |  | 5 |  |
| `liveMessage` | text | yes |  |  |
| `isTest` | boolean |  | false |  |

Referenced by: `CorporatePrayerSession`

#### `CorporatePrayerTarget`

about 0 rows · row-level security on · 0 policies · key: `sessionId, hubKey`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `sessionId` | uuid |  |  | `CorporatePrayerSession.id` |
| `hubKey` | text |  |  |  |
| `cohortId` | uuid |  |  |  |
| `pool` | text |  |  |  |
| `prayerDate` | date |  |  |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `cycleNo` | integer |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `summarySentAt` | timestamp with time zone | yes |  |  |

#### `CorporatePrayerVerse`

about 2 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `prayer` | text |  |  |  |
| `reference` | text |  |  |  |
| `sortOrder` | integer |  | 0 |  |
| `active` | boolean |  | true |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `title` | text |  |  |  |

Referenced by: `CorporatePrayerSession`

#### `CorporatePrayerWallPost`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `sessionId` | uuid |  |  | `CorporatePrayerSession.id` |
| `targetId` | uuid | yes |  |  |
| `authorKind` | text |  |  |  |
| `authorId` | uuid |  |  |  |
| `authorHub` | text | yes |  |  |
| `body` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `hiddenAt` | timestamp with time zone | yes |  |  |
| `hiddenById` | uuid | yes |  |  |

#### `PrayerMilestone`

not analysed yet · row-level security on · 0 policies · key: `personKind, personId, cohortId, milestone`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `personKind` | text |  |  |  |
| `personId` | uuid |  |  |  |
| `cohortId` | uuid |  |  |  |
| `milestone` | integer |  |  |  |
| `earnedOn` | date |  |  |  |
| `seenAt` | timestamp with time zone | yes |  |  |
| `toldGroupAt` | timestamp with time zone | yes |  |  |
| `supportNotifiedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |


### Faith projects and testimonies

#### `FaithHelpRequest`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_resolvedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `faithProjectId` | uuid | yes |  | `FaithProject.id` |
| `reason` | text |  |  |  |
| `note` | text | yes |  |  |
| `wantsContact` | boolean |  | false |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `resolvedAt` | timestamp with time zone | yes |  |  |
| `resolvedById` | uuid | yes |  | `User.id` |
| `resolvedByActedAs` | text | yes |  |  |

#### `FaithProject`

about 98 rows · row-level security on · 1 policy · triggers: `acted_as_updatedById`, `faith_project_keep_version_ins`, `faith_project_keep_version_upd` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `title` | text | yes |  |  |
| `body` | text | yes |  |  |
| `status` | text |  | 'NOT_DRAFTED' |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `reviewHistory` | jsonb |  | '[]' |  |
| `categoryId` | uuid | yes |  | `FaithProjectCategory.id` |
| `sharedForPrayer` | boolean |  | false |  |
| `updatedByActedAs` | text | yes |  |  |

Referenced by: `FaithHelpRequest`, `FaithProjectVersion`, `SupportSession`

#### `FaithProjectCategory`

about 6 rows · row-level security on · 2 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `name` | text |  |  |  |
| `archivedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `FaithProject`

#### `FaithProjectSetting`

not analysed yet · row-level security on · 2 policies · key: `cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `deadlineAt` | timestamp with time zone | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `prayersStartWeekNumber` | integer | yes |  |  |
| `prayerPopupDaysBefore` | integer |  | 3 |  |

#### `FaithProjectVersion`

about 110 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `projectId` | uuid |  |  | `FaithProject.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `body` | text |  |  |  |
| `savedAt` | timestamp with time zone |  | now() |  |
| `savedById` | uuid | yes |  | `User.id` |
| `savedByName` | text | yes |  |  |

#### `FaithThreadRead`

not analysed yet · row-level security on · 1 policy · key: `userId, participantId, trail`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `userId` | uuid |  |  | `User.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `trail` | text |  |  |  |
| `lastReadAt` | timestamp with time zone |  | now() |  |

#### `Testimony`

about 3 rows · row-level security on · 1 policy · triggers: `acted_as_reviewedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `title` | text | yes |  |  |
| `body` | text |  |  |  |
| `visibility` | text |  | 'SUPPORT' |  |
| `status` | text |  | 'PENDING' |  |
| `reviewedById` | uuid | yes |  | `User.id` |
| `reviewedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `viewedAt` | timestamp with time zone | yes |  |  |
| `viewedById` | uuid | yes |  | `User.id` |
| `reviewedByActedAs` | text | yes |  |  |


### Sign-ups and follow-ups

#### `FollowUpAdminAlertLog`

about 15 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `windowStart` | timestamp with time zone |  |  |  |
| `waitingCount` | integer |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `FollowUpContact`

about 136 rows · row-level security on · 1 policy · triggers: `acted_as_registeredById`, `followup_contact_registration_guard`, `followupcontact_track_activity`, `teen_group_sync_contact`, `teen_owner_guard`, `trg_followup_contact_local_phone`, `trg_record_follow_up_note` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `fullName` | text |  |  |  |
| `phone` | text | yes |  |  |
| `source` | text | yes |  |  |
| `ownerId` | uuid | yes |  | `User.id` |
| `messageStatus` | "FollowUpMessageStatus" |  | 'NOT_SENT' |  |
| `replyStatus` | "FollowUpReplyStatus" |  | 'NO_REPLY' |  |
| `callStatus` | "FollowUpCallStatus" |  | 'NOT_CALLED' |  |
| `registrationStatus` | "FollowUpRegistrationStatus" |  | 'NOT_REGISTERED' |  |
| `nextAction` | "FollowUpNextAction" |  | 'SEND_MESSAGE' |  |
| `lastContactDate` | date | yes |  |  |
| `followUpCount` | integer |  | 0 |  |
| `notes` | text | yes |  |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `dueDate` | date | yes |  |  |
| `dueReminderSentAt` | timestamp with time zone | yes |  |  |
| `archivedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `email` | text | yes |  |  |
| `gender` | text | yes |  |  |
| `ageRange` | text | yes |  |  |
| `occupation` | text | yes |  |  |
| `registeredById` | uuid | yes |  | `User.id` |
| `sheetSyncedAt` | timestamp with time zone | yes |  |  |
| `sheetSyncError` | text | yes |  |  |
| `sheetSyncWarning` | text | yes |  |  |
| `isTest` | boolean |  | false |  |
| `formQuestion` | text | yes |  |  |
| `formQuestionAnsweredAt` | timestamp with time zone | yes |  |  |
| `formQuestionAnsweredById` | uuid | yes |  | `User.id` |
| `ownerAssignedAt` | timestamp with time zone | yes |  |  |
| `statusChangedAt` | timestamp with time zone | yes |  |  |
| `registeredByActedAs` | text | yes |  |  |
| `manualRegistrationAt` | timestamp with time zone | yes |  |  |
| `manualRegistrationBy` | uuid | yes |  | `User.id` |
| `manualRegistrationReason` | text | yes |  |  |
| `guardianPhone` | text | yes |  |  |
| `teenOnboardedHow` | text | yes |  |  |
| `teenGenderFallback` | boolean |  | false |  |
| `guardianName` | text | yes |  |  |
| `noResponseAt` | timestamp with time zone | yes |  |  |
| `guardianConsentAt` | timestamp with time zone | yes |  |  |
| `guardianConsentById` | uuid | yes |  | `User.id` |
| `notInterestedAt` | timestamp with time zone | yes |  |  |
| `notInterestedNote` | text | yes |  |  |

Referenced by: `AbsenceReviewMove`, `FollowUpIssue`, `FollowUpIssueContact`, `FollowUpLoginIssue`, `FollowUpNoteHistory`, `FollowUpReassignmentLog`, `Participant`, `SheetRegistration`

#### `FollowUpContactStatusBackup_20260928`

not analysed yet · row-level security on · 0 policies

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes |  |  |
| `registrationStatus` | "FollowUpRegistrationStatus" | yes |  |  |
| `archivedAt` | timestamp with time zone | yes |  |  |
| `nextAction` | "FollowUpNextAction" | yes |  |  |
| `updatedAt` | timestamp with time zone | yes |  |  |

#### `FollowUpIssue`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `contactId` | uuid | yes |  | `FollowUpContact.id` |
| `openedAt` | date |  | CURRENT_DATE |  |
| `person` | text | yes |  |  |
| `issue` | text |  |  |  |
| `ownerId` | uuid | yes |  | `User.id` |
| `neededFrom` | text | yes |  |  |
| `status` | "IssueStatus" |  | 'OPEN' |  |
| `resolution` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `reportedById` | uuid | yes |  | `User.id` |

Referenced by: `FollowUpIssueContact`

#### `FollowUpIssueContact`

not analysed yet · row-level security on · 1 policy · key: `issueId, contactId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `issueId` | uuid |  |  | `FollowUpIssue.id` |
| `contactId` | uuid |  |  | `FollowUpContact.id` |

#### `FollowUpLoginIssue`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_resolvedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `contactId` | uuid |  |  | `FollowUpContact.id` |
| `reportedById` | uuid | yes |  | `User.id` |
| `description` | text |  |  |  |
| `status` | text |  | 'OPEN' |  |
| `resolvedById` | uuid | yes |  | `User.id` |
| `resolvedAt` | timestamp with time zone | yes |  |  |
| `resolution` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `resolvedByActedAs` | text | yes |  |  |

#### `FollowUpNoteHistory`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `contactId` | uuid |  |  | `FollowUpContact.id` |
| `body` | text |  |  |  |
| `authorId` | uuid | yes |  | `User.id` |
| `authorLabel` | text | yes |  |  |
| `imported` | boolean |  | false |  |
| `notedAt` | timestamp with time zone |  | now() |  |

#### `FollowUpOwnerCheck`

about 71 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `ownerId` | uuid |  |  | `User.id` |
| `promptedAt` | timestamp with time zone |  | now() |  |
| `deadlineAt` | timestamp with time zone |  |  |  |
| `answer` | text | yes |  |  |
| `answeredAt` | timestamp with time zone | yes |  |  |
| `extended` | boolean |  | false |  |
| `closedAt` | timestamp with time zone | yes |  |  |
| `closedReason` | text | yes |  |  |

#### `FollowUpOwnerReminderLog`

about 629 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `reminderDate` | date |  |  |  |
| `kind` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `FollowUpReassignmentLog`

about 52 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `contactId` | uuid |  |  | `FollowUpContact.id` |
| `fromUserId` | uuid | yes |  | `User.id` |
| `toUserId` | uuid | yes |  | `User.id` |
| `reason` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantHandover`

about 387 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `eventType` | text |  |  |  |
| `fromGroupId` | uuid | yes |  | `Group.id` |
| `fromGroupName` | text | yes |  |  |
| `fromSupportId` | uuid | yes |  | `User.id` |
| `fromSupportName` | text | yes |  |  |
| `toGroupId` | uuid | yes |  | `Group.id` |
| `toGroupName` | text | yes |  |  |
| `toSupportId` | uuid | yes |  | `User.id` |
| `toSupportName` | text | yes |  |  |
| `faithProjectStatus` | text | yes |  |  |
| `faithProjectUpdatedById` | uuid | yes |  | `User.id` |
| `faithProjectUpdatedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `SheetRegistration`

about 87 rows · row-level security on · 1 policy · triggers: `sheet_registration_question` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `fullName` | text |  |  |  |
| `phone` | text |  |  |  |
| `phoneNormalised` | text | yes |  |  |
| `email` | text | yes |  |  |
| `signedUpAt` | timestamp with time zone |  | now() |  |
| `answers` | jsonb |  | '{}' |  |
| `contactId` | uuid | yes |  | `FollowUpContact.id` |
| `outcome` | text |  | 'PENDING' |  |
| `outcomeDetail` | text | yes |  |  |
| `sheetRowKey` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |


### Attendance

#### `AbsenceReviewDone`

not analysed yet · row-level security on · 0 policies · key: `cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `doneAt` | timestamp with time zone |  | now() |  |
| `doneById` | uuid | yes |  | `User.id` |
| `movedCount` | integer |  | 0 |  |
| `keptCount` | integer |  | 0 |  |

#### `AbsenceReviewMove`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `groupIds` | uuid[] |  | '{}' |  |
| `groupName` | text | yes |  |  |
| `supportId` | uuid | yes |  | `User.id` |
| `contactId` | uuid | yes |  | `FollowUpContact.id` |
| `prevContactStatus` | text | yes |  |  |
| `prevContactArchivedAt` | timestamp with time zone | yes |  |  |
| `prevParticipantStatus` | text |  |  |  |
| `movedAt` | timestamp with time zone |  | now() |  |
| `movedById` | uuid | yes |  | `User.id` |
| `undoneAt` | timestamp with time zone | yes |  |  |
| `undoneById` | uuid | yes |  | `User.id` |
| `prevContact` | jsonb | yes |  |  |

#### `AttendanceExcusal`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `attendanceRecordId` | uuid |  |  | `AttendanceRecord.id` |
| `note` | text |  |  |  |
| `excusedById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `AttendanceFollowUpTask`

about 198 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `attendanceRecordId` | uuid |  |  | `AttendanceRecord.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |
| `supportId` | uuid |  |  | `User.id` |
| `dueAt` | timestamp with time zone |  |  |  |
| `status` | text |  | 'OPEN' |  |
| `completedAt` | timestamp with time zone | yes |  |  |
| `completedById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `completionNote` | text | yes |  |  |

#### `AttendanceRecord`

about 585 rows · row-level security on · 1 policy · triggers: `attendance_record_lock` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |
| `status` | text |  |  |  |
| `markedById` | uuid | yes |  | `User.id` |
| `markedAt` | timestamp with time zone |  | now() |  |
| `lateExcused` | boolean |  | false |  |
| `lateExcusedAt` | timestamp with time zone | yes |  |  |
| `lateExcusedById` | uuid | yes |  | `User.id` |

Referenced by: `AttendanceExcusal`, `AttendanceFollowUpTask`

#### `AttendanceSession`

about 5 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `weekId` | integer |  |  | `Week.id` |
| `autoFinalizeAtNoon` | boolean |  | true |  |
| `finalizedAt` | timestamp with time zone | yes |  |  |
| `finalizedById` | uuid | yes |  | `User.id` |
| `finalizationMethod` | text | yes |  |  |
| `reopenedAt` | timestamp with time zone | yes |  |  |
| `reopenedById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `reportNotifiedAt` | timestamp with time zone | yes |  |  |
| `startedAt` | timestamp with time zone | yes |  |  |
| `startedById` | uuid | yes |  | `User.id` |
| `closesAt` | timestamp with time zone | yes |  |  |
| `reopenReason` | text | yes |  |  |

#### `ClassSignal`

not analysed yet · row-level security on · 0 policies · key: `weekId, participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `weekId` | integer |  |  |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `status` | text |  |  |  |
| `reason` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |


### Groups and group meetings

#### `Group`

about 103 rows · row-level security on · 1 policy · triggers: `ensure_group_support_cohort_membership`, `group_meeting_limits_guard`, `participant_handover_on_group_support` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `name` | text |  |  |  |
| `supportId` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `meetingDay` | text | yes |  |  |
| `meetingTime` | text | yes |  |  |
| `callPlatform` | text | yes |  |  |
| `callLink` | text | yes |  |  |
| `archivedAt` | timestamp with time zone | yes |  |  |
| `archivedById` | uuid | yes |  | `User.id` |
| `isTeenGroup` | boolean |  | false |  |

Referenced by: `Announcement`, `GroupDiscussionSeen`, `GroupMeetingReopen`, `GroupOnboardingStatus`, `GroupParticipant`, `GroupPost`, `GroupPrayerFocus`, `GroupPrayerStatus`, `Label`, `ManualQuestion`, `MeetingAttendance`, `MeetingRecordingOpening`, `OnboardingEvent`, `ParticipantFlag`, `ParticipantHandover`, `ParticipantNote`, `RecapRelease`, `SupportOnboardingOverride`, `Survey`, `Testimony`

#### `GroupDiscussionSeen`

about 102 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `groupId` | uuid |  |  | `Group.id` |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `seenAt` | timestamp with time zone |  | clock_timestamp() |  |

#### `GroupMeetingReopen`

not analysed yet · row-level security on · 0 policies · key: `groupId, weekId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `groupId` | uuid |  |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `requestedAt` | timestamp with time zone | yes |  |  |
| `requestedById` | uuid | yes |  |  |
| `requestReason` | text | yes |  |  |
| `reopenedAt` | timestamp with time zone | yes |  |  |
| `reopenedById` | uuid | yes |  |  |
| `reopenReason` | text | yes |  |  |
| `resubmittedAt` | timestamp with time zone | yes |  |  |

#### `GroupOnboardingStatus`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_updatedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `groupId` | uuid |  |  | `Group.id` |
| `groupCreated` | boolean |  | false |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `completedAt` | timestamp with time zone | yes |  |  |
| `updatedByActedAs` | text | yes |  |  |

#### `GroupParticipant`

about 312 rows · row-level security on · 1 policy · triggers: `participant_handover_on_group_member` · key: `groupId, participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `groupId` | uuid |  |  | `Group.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `GroupPost`

about 112 rows · row-level security on · 0 policies · triggers: `discussion_post_alerts` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `groupId` | uuid |  |  | `Group.id` |
| `authorUserId` | uuid | yes |  | `User.id` |
| `authorParticipantId` | uuid | yes |  | `Participant.id` |
| `body` | text |  |  |  |
| `pinnedAt` | timestamp with time zone | yes |  |  |
| `pinnedById` | uuid | yes |  | `User.id` |
| `removedAt` | timestamp with time zone | yes |  |  |
| `removedById` | uuid | yes |  | `User.id` |
| `deletedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | clock_timestamp() |  |
| `mentions` | jsonb |  | '[]' |  |
| `kind` | text |  | 'POST' |  |

Referenced by: `GroupPostLike`, `GroupPostReply`, `GroupPostReport`

#### `GroupPostLike`

about 36 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `postId` | uuid |  |  | `GroupPost.id` |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `GroupPostReply`

about 2 rows · row-level security on · 0 policies · triggers: `discussion_reply_alerts` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `postId` | uuid |  |  | `GroupPost.id` |
| `authorUserId` | uuid | yes |  | `User.id` |
| `authorParticipantId` | uuid | yes |  | `Participant.id` |
| `body` | text |  |  |  |
| `removedAt` | timestamp with time zone | yes |  |  |
| `removedById` | uuid | yes |  | `User.id` |
| `deletedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | clock_timestamp() |  |
| `mentions` | jsonb |  | '[]' |  |

#### `GroupPostReport`

not analysed yet · row-level security on · 0 policies · triggers: `discussion_report_alerts` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `postId` | uuid |  |  | `GroupPost.id` |
| `reporterParticipantId` | uuid |  |  | `Participant.id` |
| `reason` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `resolvedAt` | timestamp with time zone | yes |  |  |
| `resolvedById` | uuid | yes |  | `User.id` |
| `resolution` | text | yes |  |  |

#### `GroupPrayer`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_createdById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `weekId` | integer |  |  | `Week.id` |
| `body` | text |  |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `createdByActedAs` | text | yes |  |  |

#### `GroupPrayerFocus`

about 30 rows · row-level security on · 1 policy · triggers: `acted_as_setById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `groupId` | uuid |  |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `setById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `setByActedAs` | text | yes |  |  |

#### `GroupPrayerStatus`

about 46 rows · row-level security on · 1 policy · triggers: `group_meeting_reopen_close`, `meeting_window_guard` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `groupId` | uuid |  |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `done` | boolean |  | false |  |
| `markedById` | uuid | yes |  | `User.id` |
| `markedAt` | timestamp with time zone |  | now() |  |
| `prayerFinishedAt` | timestamp with time zone | yes |  |  |
| `recapFinishedAt` | timestamp with time zone | yes |  |  |
| `metOn` | date | yes |  |  |
| `notes` | text | yes |  |  |

#### `MeetingAttendance`

about 69 rows · row-level security on · 1 policy · triggers: `meeting_window_guard` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `status` | text |  |  |  |
| `markedById` | uuid | yes |  | `User.id` |
| `markedAt` | timestamp with time zone |  | now() |  |

#### `MeetingRecordingOpening`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `hubId` | uuid | yes |  | `SupportHub.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `openUntil` | timestamp with time zone |  |  |  |
| `openedById` | uuid | yes |  | `User.id` |
| `openedAt` | timestamp with time zone |  | now() |  |

#### `Team`

not analysed yet · row-level security on · 1 policy · triggers: `update_team_updated_at` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | integer |  | nextval('"Team_id_seq"') |  |
| `name` | text |  |  |  |
| `color` | text |  |  |  |
| `createdAt` | timestamp(3) without time zone |  | CURRENT_TIMESTAMP |  |
| `updatedAt` | timestamp(3) without time zone |  | CURRENT_TIMESTAMP |  |

Referenced by: `ActivityTeam`


### Supports and hubs

#### `CoverRequest`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_reviewedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `supportId` | uuid |  |  | `User.id` |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `reason` | text |  |  |  |
| `startsAt` | timestamp with time zone |  |  |  |
| `endsAt` | timestamp with time zone |  |  |  |
| `note` | text | yes |  |  |
| `status` | text |  | 'PENDING' |  |
| `reviewedById` | uuid | yes |  | `User.id` |
| `reviewedAt` | timestamp with time zone | yes |  |  |
| `reviewNote` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `coverSupportId` | uuid | yes |  | `User.id` |
| `assignedById` | uuid | yes |  | `User.id` |
| `assignedAt` | timestamp with time zone | yes |  |  |
| `reviewedByActedAs` | text | yes |  |  |

#### `DepartmentReferral`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_loggedById`, `acted_as_updatedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `department` | text |  |  |  |
| `status` | text |  | 'LOGGED' |  |
| `loggedAt` | timestamp with time zone |  | now() |  |
| `loggedById` | uuid | yes |  | `User.id` |
| `joinedAt` | timestamp with time zone | yes |  |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `note` | text | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `loggedByActedAs` | text | yes |  |  |
| `updatedByActedAs` | text | yes |  |  |

#### `HubComment`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `topicId` | uuid |  |  | `HubTopic.id` |
| `authorId` | uuid |  |  | `User.id` |
| `body` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `HubReply`

#### `HubItSupport`

not analysed yet · row-level security on · 2 policies · triggers: `trg_hub_it_support_added`, `trg_hub_it_support_kind` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `hubId` | uuid |  |  | `SupportHub.id` |
| `userId` | uuid |  |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `HubLeadsMeeting`

not analysed yet · row-level security on · 0 policies · triggers: `acted_as_updatedById` · key: `cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `meetingDay` | text | yes |  |  |
| `meetingTime` | text | yes |  |  |
| `callPlatform` | text | yes |  |  |
| `callLink` | text | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `updatedByActedAs` | text | yes |  |  |

#### `HubMembership`

about 95 rows · row-level security on · 2 policies · triggers: `trg_hub_membership_added` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `hubId` | uuid |  |  | `SupportHub.id` |
| `userId` | uuid |  |  | `User.id` |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `HubMessage`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `hubId` | uuid |  |  | `SupportHub.id` |
| `authorId` | uuid | yes |  | `User.id` |
| `subject` | text |  |  |  |
| `body` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `editedAt` | timestamp with time zone | yes |  |  |

Referenced by: `HubMessageAck`

#### `HubMessageAck`

about 35 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `messageId` | uuid |  |  | `HubMessage.id` |
| `userId` | uuid |  |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `HubPersonOfInterest`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `hubId` | uuid |  |  | `SupportHub.id` |
| `userId` | uuid |  |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `HubReaction`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `topicId` | uuid |  |  | `HubTopic.id` |
| `userId` | uuid |  |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `HubReply`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `commentId` | uuid |  |  | `HubComment.id` |
| `authorId` | uuid |  |  | `User.id` |
| `body` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `HubRoleIntroSeen`

about 31 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `hubId` | uuid |  |  | `SupportHub.id` |
| `job` | text |  |  |  |
| `seenAt` | timestamp with time zone |  | now() |  |

#### `HubTopic`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `authorId` | uuid |  |  | `User.id` |
| `title` | text |  |  |  |
| `body` | text |  |  |  |
| `status` | text |  | 'OPEN' |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `HubComment`, `HubReaction`

#### `ManualNote`

about 8 rows · row-level security on · 0 policies · key: `participantId, weekId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |
| `body` | text |  | '' |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `ManualQuestion`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_repliedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `body` | text |  |  |  |
| `status` | text |  | 'NEW' |  |
| `reply` | text | yes |  |  |
| `repliedById` | uuid | yes |  | `User.id` |
| `repliedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `repliedByActedAs` | text | yes |  |  |
| `askedById` | uuid | yes |  | `User.id` |
| `hideName` | boolean |  | false |  |

#### `SupportActivityCompletion`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `activityId` | integer |  |  | `Activity.id` |
| `userId` | uuid |  |  | `User.id` |
| `completedAt` | timestamp with time zone |  | now() |  |
| `note` | text | yes |  |  |

#### `SupportChecklistItem`

about 193 rows · row-level security on · 1 policy · triggers: `support_checklist_admin_task_guard` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `weekId` | integer | yes |  | `Week.id` |
| `label` | text |  |  |  |
| `done` | boolean |  | false |  |
| `position` | integer |  | 0 |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `createdById` | uuid | yes |  | `User.id` |
| `taskGroupId` | uuid | yes |  |  |
| `dueDay` | text | yes |  |  |
| `completionNote` | text | yes |  |  |
| `completedAt` | timestamp with time zone | yes |  |  |
| `dueDate` | date | yes |  |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |

#### `SupportClassFeedback`

about 80 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `supportId` | uuid |  |  | `User.id` |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `weekId` | integer |  |  | `Week.id` |
| `note` | text | yes |  |  |
| `isNone` | boolean |  | false |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `SupportHub`

about 16 rows · row-level security on · 2 policies · triggers: `trg_hub_lead_support_kind`, `trg_hub_role_assigned` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `name` | text |  |  |  |
| `leadUserId` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `meetingDay` | text | yes |  |  |
| `meetingTime` | text | yes |  |  |
| `callPlatform` | text | yes |  |  |
| `callLink` | text | yes |  |  |
| `assistantLeadUserId` | uuid | yes |  | `User.id` |
| `recapLeadUserId` | uuid | yes |  | `User.id` |
| `prayerLeadUserId` | uuid | yes |  | `User.id` |
| `assistantPermissions` | text[] |  | ARRAY['MEETING'] |  |
| `recapLeadUserIds` | uuid[] |  | ARRAY[] |  |
| `prayerLeadUserIds` | uuid[] |  | ARRAY[] |  |

Referenced by: `Announcement`, `HubItSupport`, `HubMembership`, `HubMessage`, `HubPersonOfInterest`, `HubRoleIntroSeen`, `MeetingRecordingOpening`, `SupportNote`, `SupportSession`, `Survey`

#### `SupportNote`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `supportId` | uuid |  |  | `User.id` |
| `authorId` | uuid | yes |  | `User.id` |
| `hubId` | uuid | yes |  | `SupportHub.id` |
| `noteType` | text |  | 'NOTE' |  |
| `body` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `SupportOnboardingOverride`

not analysed yet · row-level security on · 0 policies · key: `groupId, step`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `groupId` | uuid |  |  | `Group.id` |
| `step` | text |  |  |  |
| `setById` | uuid | yes |  | `User.id` |
| `setAt` | timestamp with time zone |  | now() |  |

#### `SupportSession`

about 27 rows · row-level security on · 2 policies · triggers: `meeting_window_guard` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `type` | text |  |  |  |
| `title` | text |  |  |  |
| `sessionDate` | date |  | CURRENT_DATE |  |
| `weekId` | integer | yes |  | `Week.id` |
| `hubId` | uuid | yes |  | `SupportHub.id` |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `notes` | text | yes |  |  |
| `submittedAt` | timestamp with time zone | yes |  |  |
| `submittedById` | uuid | yes |  | `User.id` |
| `prayerFocusFaithProjectId` | uuid | yes |  | `FaithProject.id` |
| `prayerFocusSetAt` | timestamp with time zone | yes |  |  |
| `prayedForFaithProjectIds` | uuid[] |  | '{}' |  |
| `hubPrayerDoneAt` | timestamp with time zone | yes |  |  |
| `prayerFinishedAt` | timestamp with time zone | yes |  |  |
| `startedAt` | timestamp with time zone | yes |  |  |

Referenced by: `SupportSessionAttendance`

#### `SupportSessionAttendance`

about 207 rows · row-level security on · 1 policy · triggers: `meeting_window_guard` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `sessionId` | uuid |  |  | `SupportSession.id` |
| `userId` | uuid |  |  | `User.id` |
| `status` | text |  |  |  |
| `markedById` | uuid | yes |  | `User.id` |
| `markedAt` | timestamp with time zone |  | now() |  |
| `learned` | text | yes |  |  |
| `learnedAt` | timestamp with time zone | yes |  |  |
| `willApply` | text | yes |  |  |

#### `SupportTag`

about 1 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `systemKey` | text | yes |  |  |

Referenced by: `SupportTagMember`

#### `SupportTagMember`

not analysed yet · row-level security on · 1 policy · key: `tagId, userId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `tagId` | uuid |  |  | `SupportTag.id` |
| `userId` | uuid |  |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |


### Participants

#### `EscalationNotice`

about 338 rows · row-level security on · 0 policies · key: `key`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `key` | text |  |  |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `Participant`

about 323 rows · row-level security on · 1 policy · triggers: `participant_age_teen_boundary`, `participant_retake_note`, `teen_group_sync_participant`, `trg_participant_age_from_dob`, `trg_participant_local_phone` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `fullName` | text |  |  |  |
| `phone` | text | yes |  |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `source` | text |  | 'MANUAL' |  |
| `followUpContactId` | uuid | yes |  | `FollowUpContact.id` |
| `status` | text |  | 'ACTIVE' |  |
| `notes` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `email` | text | yes |  |  |
| `gender` | text | yes |  |  |
| `ageRange` | text | yes |  |  |
| `departments` | text[] |  | '{}' |  |
| `registrationDate` | timestamp with time zone | yes |  |  |
| `smartRequest` | text | yes |  |  |
| `avatarUrl` | text | yes |  |  |
| `dateOfBirth` | date | yes |  |  |
| `occupation` | text | yes |  |  |
| `isTest` | boolean |  | false |  |
| `retakeStatus` | text | yes |  |  |
| `retakeNote` | text | yes |  |  |
| `retakeCheckedById` | uuid | yes |  | `User.id` |
| `retakeCheckedAt` | timestamp with time zone | yes |  |  |
| `themeColor` | text | yes |  |  |
| `guardianPhone` | text | yes |  |  |
| `prayerConsent` | text | yes |  |  |
| `prayerConsentAt` | timestamp with time zone | yes |  |  |

Referenced by: `AbsenceReviewMove`, `Announcement`, `AnnouncementPopup`, `AppNudgeSend`, `AppSession`, `AttendanceFollowUpTask`, `AttendanceRecord`, `ClassSignal`, `CorporatePrayerSkip`, `CorporatePrayerTarget`, `DepartmentReferral`, `FaithHelpRequest`, `FaithProject`, `FaithProjectVersion`, `FaithThreadRead`, `GroupDiscussionSeen`, `GroupParticipant`, `GroupPost`, `GroupPostLike`, `GroupPostReply`, `GroupPostReport`, `GroupPrayerFocus`, `ManualNote`, `ManualQuestion`, `MeetingAttendance`, `OnboardingEvent`, `ParticipantAccount`, `ParticipantAppSetupCompletion`, `ParticipantAppState`, `ParticipantCheckIn`, `ParticipantClassFeedback`, `ParticipantClassFeedbackDone`, `ParticipantFlag`, `ParticipantHandover`, `ParticipantLoginPhone`, `ParticipantNote`, `ParticipantNotification`, `ParticipantOnboarding`, `ParticipantOnboardingStatus`, `ParticipantPushSubscription`, `ParticipantReadyStep`, `ParticipantReminderLog`, `ParticipantReminderSetting`, `ParticipantStageChange`, `ParticipantTelegramLink`, `ParticipantThreadRead`, `ParticipantWrapUp`, `PracticeProgress`, `ProfileFieldAnswer`, `Reflection`, `ReflectionSummary`, `Testimony`, `TourProgress`

#### `ParticipantAccount`

about 223 rows · row-level security on · 0 policies · triggers: `sign_in_throttle_clear`, `trg_followup_access_confirmed` · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `password_hash` | text |  |  |  |
| `setupCode` | text | yes |  |  |
| `mustChangePassword` | boolean |  | true |  |
| `isActive` | boolean |  | true |  |
| `issuedById` | uuid | yes |  | `User.id` |
| `issuedAt` | timestamp with time zone |  | now() |  |
| `passwordSetAt` | timestamp with time zone | yes |  |  |
| `lastSignInAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `aiOptInAt` | timestamp with time zone | yes |  |  |

#### `ParticipantAppSetupCompletion`

not analysed yet · row-level security on · 0 policies · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `ownerId` | uuid | yes |  | `User.id` |
| `completedAt` | timestamp with time zone |  | now() |  |

#### `ParticipantAppState`

about 76 rows · row-level security on · 0 policies · triggers: `app_setup_after_install` · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `installedAt` | timestamp with time zone | yes |  |  |
| `lastOpenedInstalledAt` | timestamp with time zone | yes |  |  |
| `device` | text | yes |  |  |
| `notificationState` | text | yes |  |  |
| `sheetShown` | integer |  | 0 |  |
| `sheetDismissed` | integer |  | 0 |  |
| `lastSheetAt` | timestamp with time zone | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `lastSeenAt` | timestamp with time zone | yes |  |  |

#### `ParticipantCheckIn`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `response` | text |  |  |  |
| `sundayMisses` | integer |  | 0 |  |
| `meetingMisses` | integer |  | 0 |  |
| `handledAt` | timestamp with time zone | yes |  |  |
| `handledById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantClassFeedback`

about 46 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `weekId` | integer |  |  | `Week.id` |
| `rating` | integer |  |  |  |
| `comment` | text | yes |  |  |
| `participantId` | uuid | yes |  | `Participant.id` |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantClassFeedbackDone`

about 45 rows · row-level security on · 0 policies · key: `participantId, weekId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |

#### `ParticipantFlag`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_clearedById`, `acted_as_raisedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `weekId` | integer | yes |  | `Week.id` |
| `reason` | text |  |  |  |
| `note` | text | yes |  |  |
| `raisedById` | uuid | yes |  | `User.id` |
| `raisedAt` | timestamp with time zone |  | now() |  |
| `clearedById` | uuid | yes |  | `User.id` |
| `clearedAt` | timestamp with time zone | yes |  |  |
| `raisedByActedAs` | text | yes |  |  |
| `clearedByActedAs` | text | yes |  |  |

#### `ParticipantLoginPhone`

not analysed yet · row-level security on · 0 policies · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `phone` | text |  |  |  |
| `addedById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `ParticipantNote`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `body` | text |  |  |  |
| `authorId` | uuid | yes |  | `User.id` |
| `groupId` | uuid | yes |  | `Group.id` |
| `weekId` | integer | yes |  | `Week.id` |
| `noteType` | text |  | 'HANDOVER' |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `byParticipant` | boolean |  | false |  |

#### `ParticipantNotification`

about 4,323 rows · row-level security on · 0 policies · triggers: `telegram_after_participant_notification` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `title` | text |  |  |  |
| `body` | text |  |  |  |
| `path` | text | yes |  |  |
| `type` | text |  | 'GENERAL' |  |
| `readAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantOnboarding`

about 31 rows · row-level security on · 0 policies · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `introGuideReadAt` | timestamp with time zone | yes |  |  |
| `readyConfirmedAt` | timestamp with time zone | yes |  |  |
| `completedAt` | timestamp with time zone | yes |  |  |
| `venueMapAckAt` | timestamp with time zone | yes |  |  |
| `introTickedAt` | timestamp with time zone | yes |  |  |

#### `ParticipantOnboardingStatus`

about 64 rows · row-level security on · 1 policy · triggers: `acted_as_updatedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `contacted` | boolean |  | false |  |
| `addedToGroup` | boolean |  | false |  |
| `introductionDone` | boolean |  | false |  |
| `venueAcknowledged` | boolean |  | false |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `updatedByActedAs` | text | yes |  |  |

#### `ParticipantPushSubscription`

about 63 rows · row-level security on · 0 policies · triggers: `app_setup_after_push` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `endpoint` | text |  |  |  |
| `p256dh` | text |  |  |  |
| `auth` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantReadyStep`

about 35 rows · row-level security on · 0 policies · key: `participantId, step`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `step` | text |  |  |  |
| `doneAt` | timestamp with time zone |  | now() |  |

#### `ParticipantReminderLog`

about 3,310 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `kind` | text |  |  |  |
| `targetKey` | text |  |  |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `occurrence` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ParticipantReminderSetting`

not analysed yet · row-level security on · 0 policies · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `meetingRemindMinutes` | jsonb |  | '[60]' |  |
| `recapReleased` | boolean |  | true |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `ParticipantStageChange`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_changedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `stage` | text |  |  |  |
| `note` | text | yes |  |  |
| `changedById` | uuid | yes |  | `User.id` |
| `changedAt` | timestamp with time zone |  | now() |  |
| `changedByActedAs` | text | yes |  |  |

#### `ParticipantTelegramLink`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `chatId` | bigint |  |  |  |
| `enabled` | boolean |  | true |  |
| `blockedAt` | timestamp with time zone | yes |  |  |
| `linkedAt` | timestamp with time zone |  | now() |  |

#### `ParticipantThreadRead`

about 2 rows · row-level security on · 0 policies · key: `participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `coachLastReadAt` | timestamp with time zone |  | now() |  |

#### `ParticipantWrapUp`

not analysed yet · row-level security on · 1 policy · key: `participantId, cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `cohortId` | uuid |  |  |  |
| `department` | text | yes |  |  |
| `wantsReferral` | boolean |  | false |  |
| `note` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `ProfileField`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `label` | text |  |  |  |
| `helpText` | text | yes |  |  |
| `fieldType` | text |  |  |  |
| `options` | jsonb |  | '[]' |  |
| `required` | boolean |  | true |  |
| `cohortIds` | uuid[] |  | '{}' |  |
| `groupIds` | uuid[] | yes |  |  |
| `participantIds` | uuid[] | yes |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `archivedAt` | timestamp with time zone | yes |  |  |

Referenced by: `ProfileFieldAnswer`

#### `ProfileFieldAnswer`

not analysed yet · row-level security on · 1 policy · key: `fieldId, participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `fieldId` | uuid |  |  | `ProfileField.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `value` | text | yes |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `Reflection`

about 14 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `participantId` | uuid |  |  | `Participant.id` |
| `weekId` | integer |  |  | `Week.id` |
| `stoodOut` | text | yes |  |  |
| `goal` | text | yes |  |  |
| `goalCheck` | text | yes |  |  |
| `goalDoneAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

#### `ReflectionSummary`

not analysed yet · row-level security on · 0 policies · key: `participantId, cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `participantId` | uuid |  |  | `Participant.id` |
| `cohortId` | uuid |  |  |  |
| `summary` | text |  |  |  |
| `model` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |


### Programme: cohorts, weeks, planner

#### `ChurchEvent`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `startDate` | date |  |  |  |
| `endDate` | date |  |  |  |
| `stopsFof` | boolean |  | false |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `PlannerChange`

#### `Cohort`

about 5 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `name` | text |  |  |  |
| `description` | text | yes |  |  |
| `startDate` | date | yes |  |  |
| `endDate` | date | yes |  |  |
| `status` | text |  | 'ACTIVE' |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `venue` | text | yes |  |  |
| `schedulePublished` | boolean |  | false |  |
| `isPractice` | boolean |  | false |  |
| `practiceOn` | boolean |  | false |  |
| `practiceCalendar` | text | yes |  |  |

Referenced by: `AbsenceReviewDone`, `AbsenceReviewMove`, `Announcement`, `Cohort10FollowUpRepairLedger`, `CohortCheckup`, `CorporatePrayerCycle`, `CorporatePrayerSetting`, `CorporatePrayerSlot`, `CoverRequest`, `EscalationNotice`, `FaithProjectCategory`, `FaithProjectSetting`, `FeedbackResponse`, `FeedbackThemes`, `FollowUpContact`, `Group`, `GroupPrayer`, `HubLeadsMeeting`, `HubMembership`, `Label`, `ManualQuestion`, `Participant`, `ParticipantClassFeedback`, `PlannerChange`, `SupportChecklistItem`, `SupportClassFeedback`, `SupportHub`, `SupportSession`, `Survey`, `Testimony`, `UserCohort`, `Week`

#### `Cohort10FollowUpRepairLedger`

not analysed yet · row-level security on · 0 policies · key: `repairKey`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `repairKey` | text |  |  |  |
| `sourceCohortId` | uuid |  |  | `Cohort.id` |
| `targetCohortId` | uuid |  |  | `Cohort.id` |
| `contactIds` | uuid[] |  |  |  |
| `participantIds` | uuid[] |  |  |  |
| `accountParticipantIds` | uuid[] |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `CohortCheckup`

not analysed yet · row-level security on · 0 policies · key: `cohortId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `taskGroupId` | uuid |  |  |  |
| `restWeek3Start` | date |  |  |  |
| `taskAddedAt` | timestamp with time zone |  | now() |  |
| `supports` | integer |  | 0 |  |
| `remindersSent` | integer |  | 0 |  |
| `lastReminderAt` | timestamp with time zone | yes |  |  |

#### `PlannerChange`

not analysed yet · row-level security on · 1 policy · triggers: `acted_as_createdById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `summary` | text |  |  |  |
| `eventId` | uuid | yes |  | `ChurchEvent.id` |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `before` | jsonb |  |  |  |
| `after` | jsonb |  |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `undoneAt` | timestamp with time zone | yes |  |  |
| `undoneById` | uuid | yes |  | `User.id` |
| `createdByActedAs` | text | yes |  |  |

#### `PublicHoliday`

about 159 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `date` | date |  |  |  |
| `name` | text |  |  |  |
| `isEstimate` | boolean |  | false |  |
| `source` | text |  | 'google-ng' |  |
| `fetchedAt` | timestamp with time zone |  | now() |  |

#### `Week`

about 34 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | integer |  | nextval('"Week_id_seq"') |  |
| `weekNumber` | integer |  |  |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `title` | text | yes |  |  |
| `recapSummary` | text | yes |  |  |
| `discussionPrompt` | text | yes |  |  |
| `recapDocumentUrl` | text | yes |  |  |
| `recapDocumentName` | text | yes |  |  |
| `shareWithParticipants` | boolean |  | true |  |
| `expectations` | text | yes |  |  |
| `participantReleasedEarlyAt` | timestamp with time zone | yes |  |  |
| `manualDocumentUrl` | text | yes |  |  |
| `manualDocumentName` | text | yes |  |  |
| `manualSummary` | text | yes |  |  |
| `manualDiscussionPrompt` | text | yes |  |  |
| `manualReleasedEarlyAt` | timestamp with time zone | yes |  |  |
| `classDate` | date | yes |  |  |
| `teenRecapSummary` | text | yes |  |  |
| `teenDiscussionPrompt` | text | yes |  |  |
| `teenRecapDocumentUrl` | text | yes |  |  |
| `teenRecapDocumentName` | text | yes |  |  |
| `teenRecapReleaseAt` | timestamp with time zone | yes |  |  |
| `teacherName` | text | yes |  |  |
| `teacherRole` | text | yes |  |  |
| `teacherBio` | text | yes |  |  |
| `teacherPhotoUrl` | text | yes |  |  |
| `classGraphicUrl` | text | yes |  |  |
| `teenTeacherName` | text | yes |  |  |
| `teenTeacherRole` | text | yes |  |  |
| `teenTeacherBio` | text | yes |  |  |
| `teenTeacherPhotoUrl` | text | yes |  |  |

Referenced by: `AttendanceFollowUpTask`, `AttendanceRecord`, `AttendanceSession`, `Day`, `GroupMeetingReopen`, `GroupPrayer`, `GroupPrayerFocus`, `GroupPrayerStatus`, `ManualNote`, `ManualQuestion`, `MeetingAttendance`, `MeetingRecordingOpening`, `ParticipantClassFeedback`, `ParticipantClassFeedbackDone`, `ParticipantFlag`, `ParticipantNote`, `PendingChange`, `RecapRelease`, `Reflection`, `RejectedChange`, `SupportChecklistItem`, `SupportClassFeedback`, `SupportSession`


### Schedule, tasks and approvals

#### `Activity`

about 816 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | integer |  | nextval('"Activity_id_seq"') |  |
| `dayId` | integer |  |  | `Day.id` |
| `time` | text |  |  |  |
| `description` | text |  |  |  |
| `period` | "Period" |  |  |  |
| `orderIndex` | integer |  |  |  |
| `userId` | uuid |  | 'a0000000-0000-4000-8000-000000000002' | `User.id` |

Referenced by: `ActivityLabel`, `ActivityTeam`, `SupportActivityCompletion`

#### `ActivityLabel`

about 130 rows · row-level security on · 1 policy · key: `activityId, labelId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `activityId` | integer |  |  | `Activity.id` |
| `labelId` | uuid |  |  | `Label.id` |

#### `ActivityTeam`

about 395 rows · row-level security on · 1 policy · key: `activityId, teamId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `activityId` | integer |  |  | `Activity.id` |
| `teamId` | integer |  |  | `Team.id` |
| `order` | integer |  | 0 |  |

#### `Day`

about 150 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | integer |  | nextval('"Day_id_seq"') |  |
| `weekId` | integer |  |  | `Week.id` |
| `dayName` | text |  |  |  |

Referenced by: `Activity`

#### `PendingChange`

about 0 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `weekId` | integer |  |  | `Week.id` |
| `changeType` | "ChangeType" |  |  |  |
| `changeData` | jsonb |  |  |  |
| `userId` | uuid |  | 'a0000000-0000-4000-8000-000000000002' | `User.id` |
| `createdAt` | timestamp without time zone | yes | now() |  |

#### `RejectedChange`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `weekId` | integer |  |  | `Week.id` |
| `changeType` | "ChangeType" |  |  |  |
| `changeData` | jsonb |  |  |  |
| `userId` | uuid |  | 'a0000000-0000-4000-8000-000000000002' | `User.id` |
| `submittedAt` | timestamp without time zone |  |  |  |
| `rejectedBy` | text |  |  |  |
| `rejectedAt` | timestamp without time zone | yes | now() |  |
| `rejectionReason` | text |  |  |  |
| `isRead` | boolean | yes | false |  |


### Notifications and announcements

#### `Announcement`

about 42 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `subject` | text |  |  |  |
| `body` | text |  |  |  |
| `sentAt` | timestamp with time zone |  | now() |  |
| `sentBy` | uuid | yes |  | `User.id` |
| `scope` | "AnnouncementScope" |  | 'ACTIVE_COHORT' |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `targetLabelId` | uuid | yes |  | `Label.id` |
| `showOnHome` | boolean |  | false |  |
| `homeUntil` | timestamp with time zone | yes |  |  |
| `linkUrl` | text | yes |  |  |
| `linkLabel` | text | yes |  |  |
| `audience` | text |  | 'SUPPORTS' |  |
| `targetGroupId` | uuid | yes |  | `Group.id` |
| `targetHubId` | uuid | yes |  | `SupportHub.id` |
| `targetUserId` | uuid | yes |  | `User.id` |
| `targetParticipantId` | uuid | yes |  | `Participant.id` |
| `homeLabel` | text | yes |  |  |
| `requirePopup` | boolean |  | false |  |
| `targetUserIds` | uuid[] | yes |  |  |
| `targetHubJobs` | text[] | yes |  |  |

Referenced by: `AnnouncementPopup`

#### `AnnouncementPopup`

about 717 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `announcementId` | uuid |  |  | `Announcement.id` |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `ackedAt` | timestamp with time zone | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `AppNudgeLog`

about 57 rows · row-level security on · 0 policies · key: `ownerId, nudgeDate`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `ownerId` | uuid |  |  | `User.id` |
| `nudgeDate` | date |  |  |  |

#### `AppNudgeSend`

not analysed yet · row-level security on · 0 policies · key: `ownerId, participantId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `ownerId` | uuid |  |  | `User.id` |
| `participantId` | uuid |  |  | `Participant.id` |
| `sentAt` | timestamp with time zone |  | now() |  |

#### `MessageTemplate`

about 22 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `useCase` | text |  |  |  |
| `body` | text |  |  |  |
| `whenToUse` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `imageUrl` | text | yes |  |  |
| `imageName` | text | yes |  |  |
| `category` | text |  | 'FOLLOW_UP' |  |

#### `Notification`

about 5,614 rows · row-level security on · 0 policies · triggers: `telegram_after_notification`, `trg_notification_stamp_read` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `title` | text |  |  |  |
| `body` | text |  |  |  |
| `path` | text | yes |  |  |
| `type` | text |  | 'GENERAL' |  |
| `isRead` | boolean |  | false |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `readAt` | timestamp with time zone | yes |  |  |

#### `PushReminderLog`

about 1,282 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `kind` | text |  |  |  |
| `targetId` | text |  |  |  |
| `userId` | uuid |  |  | `User.id` |
| `reminderDate` | date |  |  |  |
| `intervalMinutes` | integer |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `PushSubscription`

about 69 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `endpoint` | text |  |  |  |
| `p256dh` | text |  |  |  |
| `auth` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `TelegramLink`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid |  |  | `User.id` |
| `chatId` | bigint |  |  |  |
| `enabled` | boolean |  | true |  |
| `blockedAt` | timestamp with time zone | yes |  |  |
| `linkedAt` | timestamp with time zone |  | now() |  |

#### `TelegramLinkCode`

about 0 rows · row-level security on · 0 policies · key: `code`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `code` | text |  |  |  |
| `ownerKind` | text |  |  |  |
| `ownerId` | uuid |  |  |  |
| `expiresAt` | timestamp with time zone |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `notification_settings`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `remind_before_minutes` | integer[] |  | '{60}' |  |
| `updated_at` | timestamp with time zone | yes | now() |  |
| `updated_by` | uuid | yes |  | `users.id` |

#### `push_subscriptions`

not analysed yet · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `user_id` | uuid | yes |  | `users.id` |
| `endpoint` | text |  |  |  |
| `p256dh` | text |  |  |  |
| `auth` | text |  |  |  |
| `created_at` | timestamp with time zone | yes | now() |  |


### Surveys and feedback

#### `FeedbackResponse`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `round` | text |  | 'GENERAL' |  |
| `answers` | jsonb |  |  |  |
| `submittedOn` | date |  | CURRENT_DATE |  |

#### `FeedbackThemes`

not analysed yet · row-level security on · 0 policies · key: `cohortId, round`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `cohortId` | uuid |  |  | `Cohort.id` |
| `round` | text |  |  |  |
| `themes` | text |  |  |  |
| `model` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `Survey`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `builtinKey` | text | yes |  |  |
| `title` | text |  |  |  |
| `description` | text | yes |  |  |
| `audience` | text |  | 'PARTICIPANTS' |  |
| `scope` | text |  | 'COHORT' |  |
| `cohortId` | uuid | yes |  | `Cohort.id` |
| `targetGroupId` | uuid | yes |  | `Group.id` |
| `anonymous` | boolean |  | false |  |
| `enabled` | boolean |  | true |  |
| `status` | text |  | 'DRAFT' |  |
| `timingMode` | text |  | 'DATES' |  |
| `opensAt` | timestamp with time zone | yes |  |  |
| `closesAt` | timestamp with time zone | yes |  |  |
| `weeksBeforeEnd` | integer | yes |  |  |
| `closeDaysAfterEnd` | integer | yes |  |  |
| `notifyOnOpen` | boolean |  | false |  |
| `homeHeading` | text | yes |  |  |
| `homeLine` | text | yes |  |  |
| `homeButton` | text | yes |  |  |
| `aiSummary` | text | yes |  |  |
| `aiSummaryAt` | timestamp with time zone | yes |  |  |
| `createdBy` | uuid | yes |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |
| `targetHubId` | uuid | yes |  | `SupportHub.id` |
| `targetLabelId` | uuid | yes |  | `Label.id` |
| `weeksAfterStart` | integer | yes |  |  |
| `openForDays` | integer | yes |  |  |

Referenced by: `SurveyAnswerSet`, `SurveyNotified`, `SurveyQuestion`, `SurveySubmission`

#### `SurveyAnswerSet`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `surveyId` | uuid |  |  | `Survey.id` |
| `respondentKey` | text | yes |  |  |
| `cohortId` | uuid | yes |  |  |
| `answers` | jsonb |  |  |  |
| `submittedAt` | timestamp with time zone |  | now() |  |
| `submittedOn` | date |  | CURRENT_DATE |  |

#### `SurveyNotified`

not analysed yet · row-level security on · 0 policies · key: `surveyId, cohortKey`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `surveyId` | uuid |  |  | `Survey.id` |
| `cohortKey` | text |  |  |  |
| `notifiedAt` | timestamp with time zone |  | now() |  |

#### `SurveyQuestion`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `surveyId` | uuid |  |  | `Survey.id` |
| `position` | integer |  | 0 |  |
| `kind` | text |  |  |  |
| `prompt` | text |  |  |  |
| `required` | boolean |  | true |  |
| `config` | jsonb |  | '{}' |  |

#### `SurveySubmission`

not analysed yet · row-level security on · 0 policies · key: `surveyId, respondentKey`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `surveyId` | uuid |  |  | `Survey.id` |
| `respondentKey` | text |  |  |  |
| `submittedAt` | timestamp with time zone |  | now() |  |


### Content: scriptures, resources, website, birthdays

#### `BirthdayAlertLog`

not analysed yet · row-level security on · 0 policies · key: `subjectKey, birthdayDate, daysBefore`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `subjectKey` | text |  |  |  |
| `birthdayDate` | date |  |  |  |
| `daysBefore` | integer |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `RecapRelease`

not analysed yet · row-level security on · 1 policy · key: `groupId, weekId`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `groupId` | uuid |  |  | `Group.id` |
| `weekId` | integer |  |  | `Week.id` |
| `releasedById` | uuid | yes |  | `User.id` |
| `releasedAt` | timestamp with time zone |  | now() |  |

#### `Resource`

about 8 rows · row-level security on · 4 policies · triggers: `acted_as_updatedById` · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `title` | text |  |  |  |
| `description` | text | yes |  |  |
| `type` | text |  |  |  |
| `url` | text |  |  |  |
| `fileName` | text | yes |  |  |
| `fileSize` | bigint | yes |  |  |
| `addedBy` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `visibleToParticipants` | boolean |  | false |  |
| `cohortId` | uuid | yes |  |  |
| `visibleToSupports` | boolean |  | true |  |
| `hubIds` | uuid[] |  | '{}' |  |
| `updatedAt` | timestamp with time zone | yes |  |  |
| `updatedById` | uuid | yes |  | `User.id` |
| `updateNote` | text | yes |  |  |
| `versionCount` | integer |  | 0 |  |
| `updatedByActedAs` | text | yes |  |  |

Referenced by: `ResourceVersion`

#### `ResourceVersion`

not analysed yet · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `resourceId` | uuid |  |  | `Resource.id` |
| `versionNo` | integer |  |  |  |
| `title` | text |  |  |  |
| `description` | text | yes |  |  |
| `type` | text |  |  |  |
| `url` | text |  |  |  |
| `fileName` | text | yes |  |  |
| `fileSize` | bigint | yes |  |  |
| `note` | text | yes |  |  |
| `createdAt` | timestamp with time zone |  |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `replacedAt` | timestamp with time zone |  | now() |  |
| `replacedById` | uuid | yes |  | `User.id` |

#### `Scripture`

about 84 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `dayNumber` | integer |  |  |  |
| `imageUrl` | text |  |  |  |
| `storagePath` | text | yes |  |  |
| `createdById` | uuid | yes |  | `User.id` |
| `createdAt` | timestamp with time zone |  | now() |  |
| `updatedAt` | timestamp with time zone |  | now() |  |

Referenced by: `ScriptureEngagement`

#### `ScriptureEngagement`

about 51 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `scriptureId` | uuid |  |  | `Scripture.id` |
| `actorKind` | text |  |  |  |
| `actorId` | uuid |  |  |  |
| `action` | text |  |  |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `WebsiteSectionChange`

not analysed yet · row-level security on · 0 policies · key: `section`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `section` | text |  |  |  |
| `changedAt` | timestamp with time zone |  | now() |  |
| `changedById` | uuid | yes |  | `User.id` |


### Settings

#### `AppSetting`

about 26 rows · row-level security on · 1 policy · triggers: `teen_enable_move`, `website_section_changes_trg` · key: `settingKey`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `settingKey` | text |  |  |  |
| `value` | jsonb |  |  |  |
| `updatedAt` | timestamp with time zone |  | now() |  |


### App onboarding and tours

#### `OnboardingEvent`

about 493 rows · row-level security on · 1 policy · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `type` | text |  |  |  |
| `groupId` | uuid |  |  | `Group.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `actorId` | uuid | yes |  | `User.id` |
| `payload` | jsonb |  | '{}' |  |
| `createdAt` | timestamp with time zone |  | now() |  |

#### `TourProgress`

about 288 rows · row-level security on · 0 policies · key: `id`

| Column | Type | Null | Default | Links to |
| --- | --- | --- | --- | --- |
| `id` | uuid |  | gen_random_uuid() |  |
| `userId` | uuid | yes |  | `User.id` |
| `participantId` | uuid | yes |  | `Participant.id` |
| `tourKey` | text |  |  |  |
| `seenAt` | timestamp with time zone |  | now() |  |

## Views

| View | Kind |
| --- | --- |
| `analytics.class_attendance` | view |
| `analytics.cohorts` | view |
| `analytics.group_meeting_attendance` | view |
| `analytics.hub_meetings` | view |
| `analytics.participants` | view |
| `analytics.weeks` | view |

## Functions the app may call

Callable with the public (anon) key; each checks the caller itself (a session token, or an admin session).
Full definitions are in `schema.sql`.

| Function | Arguments | Returns |
| --- | --- | --- |
| `absence_review_move` | p_token text, p_participant_ids uuid[] | jsonb |
| `absence_review_state` | p_token text | jsonb |
| `absence_review_undo` | p_token text, p_move_id uuid | void |
| `acknowledge_hub_message` | p_message_id uuid | void |
| `add_on_number_state` | p_cohort_id uuid | jsonb |
| `add_prayer_verses` | p_token text, p_items jsonb | integer |
| `admin_add_checklist_task` | p_token text, p_label text, p_week_ids integer[], p_due_day text, p_target jsonb | jsonb |
| `admin_add_support_task` | p_token text, p_label text, p_week_ids integer[], p_cohort_id uuid, p_due_day text, p_due_dates date[], p_target jsonb | jsonb |
| `admin_checklist_tasks` | p_token text, p_week_id integer | jsonb |
| `admin_close_meeting_recording` | p_hub_id uuid, p_group_id uuid, p_week_id integer | void |
| `admin_delete_checklist_task` | p_token text, p_task_group_id uuid, p_week_id integer | integer |
| `admin_discussion_summary` | p_cohort_id uuid | json |
| `admin_move_teen` | p_participant_id uuid, p_to_support uuid, p_force boolean | jsonb |
| `admin_open_meeting_recording` | p_hub_id uuid, p_group_id uuid, p_week_id integer, p_hours integer | timestamp with time zone |
| `admin_reset_first_time` | p_user_id uuid, p_force_password boolean | void |
| `admin_reset_participant_first_time` | p_participant_id uuid | void |
| `admin_rest_tasks` | p_token text, p_cohort_id uuid | jsonb |
| `admin_set_support_onboarding_override` | p_group_id uuid, p_step text, p_done boolean | void |
| `admin_supports_overview` | p_cohort_id uuid | jsonb |
| `admin_teen_move_targets` | p_participant_id uuid | jsonb |
| `age_range_for_age` | p_age integer | text |
| `announcement_popup_ack` | p_token text, p_announcement uuid | void |
| `announcement_popup_live` | a "Announcement" | boolean |
| `announcement_popup_status` | p_token text, p_announcement uuid | json |
| `announcement_popups_pending` | p_token text | json |
| `answer_followup_check` | p_answer text | void |
| `api_admin_client_activity` | p_token text, p_id uuid, p_limit integer | jsonb |
| `api_admin_clients` | p_token text | jsonb |
| `api_admin_create_client` | p_token text, p_name text, p_scopes text[], p_notes text | jsonb |
| `api_admin_update_client` | p_token text, p_id uuid, p_active boolean, p_scopes text[], p_name text, p_notes text | void |
| `app_acted_as` |  | text |
| `app_current_token` |  | text |
| `app_current_user_id` |  | uuid |
| `app_effective_role` | u "User", p_active "Role" | "Role" |
| `app_hub_can` | p_hub_id uuid, p_perm text | boolean |
| `app_is_admin` |  | boolean |
| `app_is_staff` |  | boolean |
| `app_lowest_role` | u "User" | "Role" |
| `app_role_rank` | r "Role" | integer |
| `app_user_roles` | u "User" | "Role"[] |
| `approve_manual_registration` | p_token text, p_contact_id uuid, p_reason text | void |
| `ask_manual_question` | p_token text, p_week_id integer, p_body text | json |
| `assign_followups_now` | p_token text | jsonb |
| `attendance_session_actor_id` |  | uuid |
| `attendance_session_actor_is_admin` |  | boolean |
| `auto_finalize_sunday_attendance` |  | void |
| `birthdays_list` | p_token text, p_cohort_id uuid | json |
| `build_hub_view` | p_hub_id uuid, p_cohort_id uuid, p_actor_id uuid | json |
| `capture_participant_handover` | p_participant_id uuid, p_event_type text, p_from_group_id uuid, p_to_group_id uuid, p_from_support_id uuid, p_to_support_id uuid | void |
| `change_own_password` | target_user uuid, current_password text, new_password text | boolean |
| `change_participant_password` | p_token text, p_current text, p_new text | boolean |
| `class_feedback_release_at` | p_class_date date, p_audience text | timestamp with time zone |
| `class_feedback_results` | p_cohort_id uuid | json |
| `close_attendance_windows` |  | void |
| `cohort_health` | p_cohort_id uuid | json |
| `cohort_onboarding_progress` | p_cohort_id uuid | json |
| `cohort_people` | p_cohort_id uuid | json |
| `cohort_profile_completion` | p_cohort_id uuid | json |
| `complete_attendance_follow_up_task` | p_task_id uuid, p_done boolean, p_note text | jsonb |
| `confirm_followup_access_on_password_set` |  | trigger |
| `corporate_prayer_amen` | p_token text, p_session uuid, p_without_link boolean | json |
| `corporate_prayer_cant_join` | p_token text, p_session uuid | json |
| `corporate_prayer_counts` | p_token text, p_session uuid | json |
| `corporate_prayer_join` | p_token text, p_session uuid | json |
| `corporate_prayer_link_tap` | p_token text, p_session uuid | json |
| `corporate_prayer_now` | p_token text, p_session uuid | json |
| `corporate_prayer_overview` | p_token text, p_cohort_id uuid | json |
| `corporate_prayer_signal` | p_token text, p_cohort uuid | json |
| `corporate_prayer_wall` | p_token text, p_session uuid | json |
| `corporate_prayer_wall_hide` | p_token text, p_post uuid | json |
| `corporate_prayer_wall_post` | p_token text, p_session uuid, p_body text | json |
| `create_user` | p_token text, p_name text, p_password text, p_email text, p_phone text, p_role text | json |
| `current_programme_cohort_id` |  | uuid |
| `delete_hub_message` | p_message_id uuid | void |
| `delete_prayer_slot` | p_token text, p_id uuid | void |
| `delete_prayer_verse` | p_token text, p_id uuid | void |
| `delete_testimony` | p_token text, p_id uuid | void |
| `discussion_post_alerts` |  | trigger |
| `discussion_reply_alerts` |  | trigger |
| `discussion_report_alerts` |  | trigger |
| `enforce_attendance_record_lock` |  | trigger |
| `ensure_group_support_cohort_membership` |  | trigger |
| `excuse_lateness` | p_record_id uuid, p_note text | jsonb |
| `faith_prayers_prompt_due` | p_cohort_id uuid | boolean |
| `faith_prayers_start_date` | p_cohort_id uuid | date |
| `faith_prayers_started` | p_cohort_id uuid | boolean |
| `faith_project_keep_version` |  | trigger |
| `faith_project_prayable` | f "FaithProject" | boolean |
| `feedback_results` | p_token text, p_cohort_id uuid | json |
| `feedback_themes` | p_token text, p_cohort_id uuid | json |
| `finalize_shared_attendance` | p_week_id integer | jsonb |
| `fof_assert_meeting_open` | p_group_id uuid, p_hub_id uuid, p_week_id integer | void |
| `fof_is_teen_age` | p_age text | boolean |
| `fof_local_phone` | raw text | text |
| `fof_localize_phone_trigger` |  | trigger |
| `fof_meeting_window` | p_day text, p_time text, p_week_id integer | tstzrange |
| `fof_meeting_window_guard` |  | trigger |
| `fof_name_key` | n text | text |
| `fof_phone_key` | raw text | text |
| `followup_contact_registration_guard` |  | trigger |
| `followup_phone_is_valid` | p_phone text | boolean |
| `followup_reassignments` | p_days integer | json |
| `followup_related_contacts` | p_token text, p_contact_id uuid | json |
| `followupcontact_track_activity` |  | trigger |
| `form_question_text` | p_answers jsonb | text |
| `get_hub_leads_meeting` | p_cohort_id uuid | jsonb |
| `get_hub_prayer_focus` | p_hub_id uuid, p_week_id integer | json |
| `get_hub_view` | p_hub_id uuid | json |
| `get_my_hub` | p_cohort_id uuid | json |
| `get_my_hubs` | p_cohort_id uuid | json |
| `get_my_permissions` | p_token text | json |
| `get_session_user` | p_token text | json |
| `get_support_group_view` | p_support_id uuid, p_cohort_id uuid | json |
| `get_tour_progress` | p_token text | text[] |
| `group_discussion_activity` | p_group_id uuid | json |
| `group_discussion_delete` | p_kind text, p_id uuid | void |
| `group_discussion_feed` | p_group_id uuid, p_before timestamp with time zone, p_limit integer | json |
| `group_discussion_intro` | p_group_id uuid, p_body text | uuid |
| `group_discussion_like` | p_post_id uuid, p_like boolean | void |
| `group_discussion_mark_seen` | p_group_id uuid | void |
| `group_discussion_moderate` | p_kind text, p_id uuid, p_action text | void |
| `group_discussion_pin` | p_post_id uuid, p_pin boolean | void |
| `group_discussion_post` | p_group_id uuid, p_body text, p_mentions jsonb | uuid |
| `group_discussion_reply` | p_post_id uuid, p_body text, p_mentions jsonb | uuid |
| `group_discussion_unseen` | p_group_id uuid | integer |
| `group_meeting_limits` |  | jsonb |
| `group_meeting_limits_guard` |  | trigger |
| `group_meeting_reopen_requests` | p_token text, p_cohort_id uuid | jsonb |
| `group_meeting_reopen_state` | p_token text, p_group_id uuid | jsonb |
| `group_onboarding_progress` | p_group_id uuid | json |
| `hub_group_overview` | p_group_id uuid | json |
| `hub_it_support_kind` |  | trigger |
| `hub_lead_support_kind` |  | trigger |
| `hub_prayer_list` | p_hub_id uuid | json |
| `invoke_attendance_absence_push` | p_participant_ids uuid[] | void |
| `invoke_followup_assignment` |  | void |
| `invoke_hub_message_push` | p_user_ids uuid[], p_subject text, p_body text | void |
| `invoke_push_reminders` |  | void |
| `invoke_refresh_public_holidays` |  | void |
| `it_login_issues` | p_cohort_id uuid | json |
| `list_earlier_class_documents` | p_exclude_cohort_id uuid | json |
| `list_manual_questions` | p_cohort_id uuid, p_week_id integer, p_group_id uuid | json |
| `list_prayer_verses` | p_token text | json |
| `log_group_participant_handover` |  | trigger |
| `log_group_support_handover` |  | trigger |
| `mark_all_notifications_read` |  | integer |
| `mark_app_nudge_sent` | p_token text, p_participant_id uuid | timestamp with time zone |
| `mark_hub_role_intro_seen` | p_hub_id uuid, p_job text | void |
| `mark_manual_question_in_class` | p_id uuid | json |
| `mark_notification_read` | p_id uuid | void |
| `mark_notifications_read_by_content` | p_title text, p_body text | integer |
| `mark_participant_faith_read` | p_token text | void |
| `mark_participant_notifications_read` | p_token text, p_ids uuid[] | void |
| `mark_participant_notifications_read_by_content` | p_token text, p_title text, p_body text | integer |
| `mark_shared_attendance` | p_participant_id uuid, p_week_id integer, p_status text | jsonb |
| `mark_support_attendance` | p_status text, p_user_id uuid, p_hub_id uuid, p_week_id integer, p_session_id uuid | jsonb |
| `mark_tour_seen` | p_token text, p_key text | void |
| `meeting_recording_opening` | p_hub_id uuid, p_group_id uuid, p_week_id integer | timestamp with time zone |
| `merge_followup_batches` | a jsonb, b jsonb | jsonb |
| `my_app_nudge` | p_token text | json |
| `my_followup_check` |  | json |
| `my_followup_handovers` | p_token text | json |
| `my_help_contact` | p_token text, p_cohort_id uuid | json |
| `my_notifications` | p_limit integer | json |
| `my_notifications_signal` |  | json |
| `normalise_phone_digits` | p_raw text | text |
| `notification_send_recipients` | p_source text, p_type text, p_title text, p_body text, p_path text, p_from timestamp with time zone, p_to timestamp with time zone | json |
| `notification_sends` | p_days integer | json |
| `notification_stamp_read` |  | trigger |
| `notify_attendance_report` | p_week_id integer | void |
| `notify_hub_it_support_added` |  | trigger |
| `notify_hub_membership_added` |  | trigger |
| `notify_hub_role_assigned` |  | trigger |
| `participant_ack_venue_map` | p_token text | void |
| `participant_add_on_number` | p_token text, p_full_name text, p_gender text, p_is_teen boolean, p_age_range text, p_date_of_birth date, p_email text, p_departments text[], p_request text, p_consent boolean | jsonb |
| `participant_add_on_number_state` | p_token text | jsonb |
| `participant_age_from_dob` |  | trigger |
| `participant_class_signal` | p_token text, p_status text, p_reason text | json |
| `participant_class_signal_mine` | p_token text, p_week integer | json |
| `participant_confirm_ready` | p_token text | jsonb |
| `participant_discussion_delete` | p_token text, p_kind text, p_id uuid | void |
| `participant_discussion_feed` | p_token text, p_before timestamp with time zone, p_limit integer | json |
| `participant_discussion_intro` | p_token text, p_body text | uuid |
| `participant_discussion_like` | p_token text, p_post_id uuid, p_like boolean | void |
| `participant_discussion_mark_seen` | p_token text | void |
| `participant_discussion_post` | p_token text, p_body text, p_mentions jsonb | uuid |
| `participant_discussion_reply` | p_token text, p_post_id uuid, p_body text, p_mentions jsonb | uuid |
| `participant_discussion_report` | p_token text, p_post_id uuid, p_reason text | void |
| `participant_discussion_unseen` | p_token text | integer |
| `participant_faith` | p_token text | json |
| `participant_family` | p_token text | json |
| `participant_home` | p_token text | json |
| `participant_login_details` | p_token text, p_participant_id uuid, p_follow_up_contact_id uuid, p_issue boolean, p_new_code boolean | json |
| `participant_mark_intro_guide_read` | p_token text | void |
| `participant_mark_ready_step` | p_token text, p_step text | void |
| `participant_notifications` | p_token text | json |
| `participant_onboarding_state_self` | p_token text | jsonb |
| `participant_people` | p_token text | json |
| `participant_profile_overview` | p_participant_id uuid | json |
| `participant_ready_steps` | p_token text | json |
| `participant_retake_matches` | p_cohort_id uuid | TABLE("participantId" uuid, "otherName" text, "otherCohort" text, "otherCohortStart" date, "sameFirstName" boolean) |
| `participant_retake_note` |  | trigger |
| `participant_session_via_teen_number` | p_token text | boolean |
| `participant_summary` | p_token text | json |
| `participant_switch` | p_token text, p_participant_id uuid | json |
| `participant_teen_info` | p_token text | json |
| `participant_testimonies` | p_token text | json |
| `participant_theme` | p_token text | text |
| `participant_tick_intro` | p_token text | void |
| `participants_app_details` |  | json |
| `participants_signed_in` | p_cohort_id uuid | json |
| `participants_without_app` |  | json |
| `participants_without_push` |  | json |
| `perm_delete_role` | p_token text, p_role_id uuid | void |
| `perm_list_roles` | p_token text | json |
| `perm_module_keys` |  | text[] |
| `perm_save_role` | p_token text, p_role_id uuid, p_name text, p_description text, p_modules jsonb | json |
| `perm_set_user_roles` | p_token text, p_user_id uuid, p_role_ids uuid[] | void |
| `perm_user_assignments` | p_token text | json |
| `planner_delete_event` | p_token text, p_id uuid | void |
| `planner_pull_forward` | p_token text, p_cohort_id uuid, p_dates jsonb, p_apply boolean | json |
| `planner_push_back` | p_token text, p_week_id integer, p_event_id uuid, p_apply boolean | json |
| `planner_save_event` | p_token text, p_id uuid, p_name text, p_start date, p_end date, p_stops_fof boolean | "ChurchEvent" |
| `planner_set_class_dates` | p_token text, p_cohort_id uuid, p_dates jsonb, p_apply boolean | json |
| `planner_set_planned_dates` | p_token text, p_name text, p_dates jsonb | void |
| `planner_undo_change` | p_token text, p_change_id uuid | void |
| `post_hub_message` | p_hub_id uuid, p_subject text, p_body text | jsonb |
| `practice_active_peers` |  | jsonb |
| `practice_build` | p_calendar text | jsonb |
| `practice_end_all_peers` |  | integer |
| `practice_enter_participant` |  | jsonb |
| `practice_leave_participant` |  | void |
| `practice_my_progress` |  | jsonb |
| `practice_overview` |  | jsonb |
| `practice_participant_peer` | p_token text | jsonb |
| `practice_participant_peer_end` | p_token text | void |
| `practice_participant_progress` | p_token text | jsonb |
| `practice_participant_reset_me` | p_token text | void |
| `practice_participant_set_progress` | p_token text, p_key text, p_done boolean, p_stuck boolean | void |
| `practice_peer_end` | p_id uuid | void |
| `practice_peer_request` | p_to uuid, p_my_role text, p_their_role text | uuid |
| `practice_peer_respond` | p_id uuid, p_accept boolean | void |
| `practice_pulse` | p_active boolean | jsonb |
| `practice_reset_me` |  | void |
| `practice_reset_my_first_time` |  | void |
| `practice_reset_participant` | p_participant_id uuid | void |
| `practice_reset_person` | p_user_id uuid | void |
| `practice_send_test_prayer` | p_token text, p_kind text, p_link text | json |
| `practice_set_calendar` | p_mode text | void |
| `practice_set_my_role` | p_role text | void |
| `practice_set_on` | p_on boolean | void |
| `practice_set_progress` | p_key text, p_done boolean, p_stuck boolean | void |
| `practice_set_roster` | p_members jsonb | void |
| `practice_state` |  | jsonb |
| `practice_status` |  | jsonb |
| `practice_team` |  | jsonb |
| `prayer_coverage` | p_token text, p_cohort_id uuid | json |
| `prayer_milestone_seen` | p_token text, p_milestone integer, p_tell_group boolean | json |
| `prayer_preview` | p_token text, p_slot_id uuid, p_participant_id uuid | json |
| `prayer_streak` | p_token text | json |
| `private_file_paths` | p_kind text, p_ids uuid[] | TABLE(id uuid, path text) |
| `profile_completion_for` | p_participant_id uuid | json |
| `profile_field_summary` |  | json |
| `public_fof_landing` |  | json |
| `push_kind_label` | p_kind text | text |
| `recap_release_at` | p_class_date date, p_audience text | timestamp with time zone |
| `record_check_in` | p_token text, p_response text, p_sunday_misses integer, p_meeting_misses integer | json |
| `record_follow_up_note` |  | trigger |
| `record_participant_app_state` | p_token text, p_installed boolean, p_device text, p_notifications text | json |
| `record_participant_setup_sheet` | p_token text, p_action text | void |
| `record_user_app_state` | p_installed boolean, p_device text, p_notifications text | json |
| `record_user_setup_sheet` | p_action text | void |
| `reflection_activity` | p_token text, p_cohort_id uuid | json |
| `reopen_group_meeting` | p_token text, p_group_id uuid, p_week_id integer, p_reason text, p_hours integer | jsonb |
| `reopen_hub_meeting` | p_hub_id uuid, p_week_id integer | jsonb |
| `reopen_shared_attendance` | p_week_id integer | jsonb |
| `reopen_shared_attendance` | p_week_id integer, p_reason text | jsonb |
| `reorder_prayer_verses` | p_token text, p_ids uuid[] | void |
| `reorder_scriptures` | ids uuid[] | void |
| `reply_manual_question` | p_id uuid, p_reply text | json |
| `report_followup_login_issue` | p_contact_id uuid, p_description text | json |
| `request_group_meeting_reopen` | p_token text, p_group_id uuid, p_week_id integer, p_reason text | jsonb |
| `resolve_followup_login_issue` | p_issue_id uuid, p_note text | json |
| `resource_replace_document` | p_resource_id uuid, p_type text, p_url text, p_file_name text, p_file_size bigint, p_note text, p_visible_to_supports boolean, p_visible_to_participants boolean, p_cohort_id uuid, p_hub_ids uuid[] | jsonb |
| `resource_versions` | p_resource_id uuid | jsonb |
| `resource_visible_to_staff` | p_cohort_id uuid, p_supports boolean, p_hub_ids uuid[] | boolean |
| `restart_prayer_cycle` | p_token text, p_cohort_id uuid, p_pool text | integer |
| `review_testimony` | p_id uuid, p_status text | json |
| `safe_user_json` | u "User" | json |
| `save_faith_project` | p_token text, p_body text, p_submit boolean | json |
| `save_manual_note` | p_token text, p_week_id integer, p_body text | json |
| `save_participant_profile` | p_token text, p_email text, p_gender text, p_age_range text, p_occupation text, p_date_of_birth date, p_answers jsonb | json |
| `save_participant_push` | p_token text, p_endpoint text, p_p256dh text, p_auth text | void |
| `save_participant_reminders` | p_token text, p_meeting_minutes jsonb, p_recap_released boolean | void |
| `save_reflection` | p_token text, p_week_id integer, p_stood_out text, p_goal text, p_goal_check text | json |
| `scripture_engagement_summary` | p_token text, p_cohort_id uuid | json |
| `scripture_my_likes` | p_token text | json |
| `scripture_public_counts` | p_token text | json |
| `scripture_react` | p_token text, p_day_number integer, p_action text | json |
| `set_acted_as` |  | trigger |
| `set_ai_opt_in` | p_token text, p_opt_in boolean | void |
| `set_assistant_permissions` | p_hub_id uuid, p_perms text[] | jsonb |
| `set_attendance_auto_finalize` | p_week_id integer, p_enabled boolean | jsonb |
| `set_corporate_prayer_settings` | p_token text, p_cohort_id uuid, p_telegram text, p_wait integer, p_message text | json |
| `set_faith_project_prayer_share` | p_token text, p_shared boolean | json |
| `set_hub_leads_meeting` | p_cohort_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean | jsonb |
| `set_hub_prayer_focus` | p_hub_id uuid, p_week_id integer, p_faith_project_id uuid | jsonb |
| `set_hub_prayer_state` | p_hub_id uuid, p_week_id integer, p_hub_prayer_done boolean, p_prayer_finished boolean | jsonb |
| `set_participant_avatar` | p_token text, p_url text | void |
| `set_participant_password` | p_token text, p_new_password text | json |
| `set_participant_theme` | p_token text, p_color text | void |
| `set_prayer_consent` | p_token text, p_consent boolean | json |
| `set_reflection_goal_done` | p_token text, p_week_id integer, p_done boolean | json |
| `set_support_kind` | p_user_id uuid, p_cohort_id uuid, p_kind text | jsonb |
| `set_user_password` | p_token text, target_user uuid, new_password text, force_change boolean | boolean |
| `set_user_role` | p_token text, target_user uuid, p_role text | json |
| `set_user_roles` | p_token text, target_user uuid, p_roles text[] | json |
| `set_user_test` | p_token text, target_user uuid, p_is_test boolean | void |
| `sheet_registration_question` |  | trigger |
| `sign_in` | identifier text, password text | json |
| `sign_out` | p_token text | void |
| `skip_prayer_person` | p_token text, p_cohort_id uuid, p_participant_id uuid, p_skip boolean | void |
| `start_attendance_window` | p_week_id integer | jsonb |
| `storage_signed_in` |  | boolean |
| `storage_survey_upload_ok` | p_name text | boolean |
| `submit_class_feedback` | p_token text, p_week_id integer, p_rating integer, p_comment text, p_show_name boolean | void |
| `submit_faith_help_request` | p_token text, p_reason text, p_note text, p_wants_contact boolean | json |
| `submit_feedback` | p_token text, p_answers jsonb | void |
| `submit_hub_meeting` | p_hub_id uuid, p_week_id integer, p_notes text | jsonb |
| `submit_testimony` | p_token text, p_title text, p_body text, p_visibility text | json |
| `submit_training_learned` | p_session_id uuid, p_learned text, p_will_apply text | jsonb |
| `submit_wrap_up` | p_token text, p_department text, p_wants_referral boolean, p_note text | json |
| `support_add_sibling` | p_token text, p_sibling_id uuid, p_full_name text, p_gender text, p_date_of_birth date, p_consent boolean | jsonb |
| `support_age_range` | p_year integer, p_birthday text | text |
| `support_ask_manual_question` | p_participant_id uuid, p_week_id integer, p_body text, p_hide_name boolean | json |
| `support_checklist_admin_task_guard` |  | trigger |
| `support_recaps` | p_cohort_id uuid | json |
| `support_set_tags` | p_token text, p_user_id uuid, p_tag_ids uuid[] | void |
| `support_tag_delete` | p_token text, p_id uuid | void |
| `support_tag_save` | p_token text, p_id uuid, p_name text | "SupportTag" |
| `support_tag_set_members` | p_token text, p_tag_id uuid, p_user_ids uuid[] | void |
| `support_update_manual_question` | p_id uuid, p_body text, p_hide_name boolean, p_week_id integer | json |
| `survey_admin_delete` | p_token text, p_id uuid | void |
| `survey_admin_get` | p_token text, p_id uuid | json |
| `survey_admin_list` | p_token text, p_cohort_id uuid | json |
| `survey_admin_results` | p_token text, p_id uuid, p_cohort_id uuid | json |
| `survey_admin_save` | p_token text, p_survey jsonb, p_questions jsonb | uuid |
| `survey_admin_save_summary` | p_token text, p_id uuid, p_text text | void |
| `survey_get` | p_token text, p_id uuid | json |
| `survey_pending` | p_token text | json |
| `survey_respondent_id` | p_token text | uuid |
| `survey_submit` | p_token text, p_id uuid, p_answers jsonb | json |
| `switch_my_role` | p_token text, p_role text | json |
| `sync_attendance_follow_up_tasks` | p_week_id integer | void |
| `teen_add_prospect` | p_token text, p_full_name text, p_phone text, p_guardian_phone text, p_gender text, p_email text, p_cohort_id uuid, p_guardian_name text | jsonb |
| `teen_cap_for` | p_cohort uuid, p_gender text | integer |
| `teen_card_mark` | p_participant_id uuid, p_what text, p_on boolean, p_note text | json |
| `teen_group_meeting_limits` |  | jsonb |
| `teen_login_phone_set` | p_token text, p_participant_id uuid, p_phone text, p_remove boolean | json |
| `teen_login_state` | p_token text, p_participant_ids uuid[] | json |
| `telegram_connect_code` | p_token text | text |
| `telegram_disconnect` | p_token text | void |
| `telegram_set_enabled` | p_token text, p_enabled boolean | void |
| `telegram_status` | p_token text | json |
| `update_hub_meeting` | p_hub_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean | jsonb |
| `update_hub_message` | p_message_id uuid, p_subject text, p_body text | jsonb |
| `update_participant_profile` | p_token text, p_email text, p_occupation text, p_date_of_birth date | void |
| `update_testimony` | p_token text, p_id uuid, p_title text, p_body text, p_visibility text | json |
| `update_updated_at_column` |  | trigger |
| `upsert_prayer_slot` | p_token text, p_cohort_id uuid, p_id uuid, p_name text, p_time text, p_type text, p_timer integer, p_window integer, p_target_mode text, p_notify boolean, p_active boolean, p_blocks jsonb, p_audience_all boolean, p_hub_ids uuid[], p_telegram text, p_wait integer, p_message text | json |
| `upsert_prayer_verse` | p_token text, p_id uuid, p_title text, p_prayer text, p_reference text, p_active boolean | json |
| `user_age_from_birth_year` |  | trigger |
| `user_last_active` | p_user_id uuid | timestamp with time zone |
| `users_last_active` | p_user_ids uuid[] | jsonb |
| `users_without_app` |  | json |
| `website_section_changes` |  | jsonb |
| `week_class_date` | p_start_date date, p_week_number integer, p_class_date date | date |

## Internal functions (174)

Helpers, trigger functions and jobs the public key cannot call: `absence_auto_candidates`, `absence_auto_move`, `absence_auto_move_due`, `absence_notify_participants`, `absence_review_candidates`, `absence_review_notify`, `absence_review_remind`, `absence_review_saturday`, `api_admin_check`, `api_announcements`, `api_authenticate`, `api_birthday_person`, `api_birthdays`, `api_cohort_groups`, `api_cohort_hubs`, `api_cohort_id`, `api_cohort_participants`, `api_cohort_schedule`, `api_cohort_team`, `api_cohort_weeks`, `api_cohorts_current`, `api_create_client`, `api_finish_request`, `api_is_teen`, `api_participant_json`, `api_people_lookup`, `api_person`, `api_person_attendance`, `api_person_faith_project`, `api_person_programme`, `api_person_programme_for`, `api_planner_inputs`, `api_real_cohort`, `api_resources`, `api_scriptures`, `app_nudge_due`, `app_nudge_people`, `app_participant_id`, `app_session`, `app_staff`, `app_staff_real`, `assign_teen_contacts`, `attendance_week_locked`, `birthday_alerts_due`, `birthday_alerts_mark`, `birthday_next`, `build_discussion_feed`, `change_own_password_check`, `check_participant_app_setup`, `checkup_rest_week3`, `class_feedback_release_at`, `class_signal_open_week`, `clear_support_group_assignments_before_user_delete`, `complete_participant_app_setup`, `create_user`, `discussion_alert_name`, `discussion_clean_body`, `discussion_clean_mentions`, `discussion_live_post`, `discussion_mark_seen`, `discussion_mentions_json`, `discussion_participant_group`, `discussion_post_json`, `discussion_send_alerts`, `discussion_staff_access`, `discussion_unseen_count`, `discussion_upsert_intro`, `ensure_prayer_session`, `fill_profile_from_form`, `fof_notify`, `followup_active_supports`, `followup_contact_it_support_ids`, `followup_owner_handed_on_recently`, `followup_owner_is_quiet`, `followup_reassign_enabled`, `followup_reassign_since`, `followup_relax_on`, `followup_stale_contacts`, `followup_support_inactive`, `group_meeting_notify`, `group_meeting_reopen_close`, `household_add_person`, `invoke_discussion_notify`, `invoke_prayer_notify`, `invoke_telegram_send`, `login_user`, `module_viewers`, `notify_prayer_slots`, `onboarding_progress_json`, `onboarding_try_complete`, `participant_age_teen_boundary`, `participant_onboarding_state`, `participant_profile_fields`, `participant_user_json`, `password_family_clash`, `password_staff_clash`, `perm_require_admin`, `perm_role_json`, `post_cohort_checkups_run`, `practice_apply_calendar`, `practice_autotick_participant`, `practice_autotick_staff`, `practice_ensure_cohort`, `practice_load_manuals`, `practice_make_group`, `practice_place`, `practice_prepare`, `practice_push`, `practice_sync_members`, `prayer_amen_for_target`, `prayer_blocks_pool`, `prayer_caller`, `prayer_counted_participants`, `prayer_counted_supports`, `prayer_counts_json`, `prayer_in_audience`, `prayer_is_practice`, `prayer_is_target`, `prayer_is_teen`, `prayer_lagos_today`, `prayer_late_until`, `prayer_next_opening`, `prayer_notify_ready`, `prayer_open_session`, `prayer_participant_hub`, `prayer_pick`, `prayer_pool_members`, `prayer_require_admin`, `prayer_resolve_blocks`, `prayer_running`, `prayer_session_cohort`, `prayer_session_target`, `prayer_streak_calc`, `prayer_user_cohort`, `prayer_user_hub`, `profile_field_applies`, `recap_auto_release_at`, `recap_release_at`, `refresh_age_brackets`, `run_followup_assignment`, `run_followup_reassignment`, `set_user_password`, `shared_number_people`, `sign_in_check`, `sign_in_guard`, `sign_in_key`, `sign_in_record`, `sign_in_throttle_clear_participant`, `sign_in_throttle_clear_staff`, `start_app_session`, `survey_mark_notified`, `survey_notifications_due`, `survey_open_for_participant`, `survey_open_for_staff`, `survey_people`, `survey_questions_json`, `survey_reminders_due`, `survey_window`, `teen_convert_participant`, `teen_enable_move_trigger`, `teen_family_members`, `teen_group_sync`, `teen_group_sync_trigger`, `teen_login_staff_allowed`, `teen_move_existing`, `teen_owner_guard`, `teen_quiet_bypass`, `teen_revert_participant`, `telegram_after_notification`, `telegram_after_participant_notification`, `telegram_link_chat`, `telegram_owner`, `telegram_set_chat_enabled`, `website_section_changes_trg`.

## Enum types

| Type | Values |
| --- | --- |
| `AnnouncementScope` | ACTIVE_COHORT, ALL_USERS |
| `ChangeType` | ADD, EDIT, DELETE |
| `FollowUpCallStatus` | NOT_CALLED, CALLED, MISSED_CALL, CALL_BACK_LATER, NOT_APPLICABLE, INCORRECT_NUMBER |
| `FollowUpMessageStatus` | NOT_SENT, SENT |
| `FollowUpNextAction` | SEND_MESSAGE, SEND_REMINDER, CALL, CLOSE |
| `FollowUpRegistrationStatus` | NOT_REGISTERED, PENDING_CONFIRMATION, REGISTERED, STILL_THINKING, NOT_INTERESTED, NOT_A_TCN_MEMBER, NOT_A_GOOD_TIME, NO_RESPONSE, NEXT_COHORT, LOGIN_SHARED, ACCESS_CONFIRMED, LOGIN_ISSUE, ATTENDED, TEENAGER, TEEN_ONBOARDED |
| `FollowUpReplyStatus` | NO_REPLY, REPLIED, NEEDS_REMINDER, INCORRECT_NUMBER |
| `IssueStatus` | OPEN, RESOLVED |
| `Period` | MORNING, AFTERNOON, EVENING |
| `Role` | ADMIN, SUPPORT, SOP_PREPARER, STAFF |
