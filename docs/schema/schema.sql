-- FOF Ops database schema: structure only, no data.
-- Generated 2026-11-05 19:21 UTC from the live database catalogue by scripts/schema-snapshot.py. Do not edit by hand;
-- change the database with a migration in supabase/migrations/, then run the script again.
-- Covers the public and analytics schemas. Supabase-managed schemas (auth, storage, realtime, vault, cron, net)
-- come with every Supabase project and are not repeated here.

-- Extensions: pg_cron 1.6.4, pg_net 0.19.5, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1
-- Storage buckets: private-files (private), resources (public)

CREATE SCHEMA IF NOT EXISTS analytics;

-- Types ----------------------------------------------------------------------------------------------------
CREATE TYPE public."AnnouncementScope" AS ENUM ('ACTIVE_COHORT', 'ALL_USERS');
CREATE TYPE public."ChangeType" AS ENUM ('ADD', 'EDIT', 'DELETE');
CREATE TYPE public."FollowUpCallStatus" AS ENUM ('NOT_CALLED', 'CALLED', 'MISSED_CALL', 'CALL_BACK_LATER', 'NOT_APPLICABLE', 'INCORRECT_NUMBER');
CREATE TYPE public."FollowUpMessageStatus" AS ENUM ('NOT_SENT', 'SENT');
CREATE TYPE public."FollowUpNextAction" AS ENUM ('SEND_MESSAGE', 'SEND_REMINDER', 'CALL', 'CLOSE');
CREATE TYPE public."FollowUpRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'PENDING_CONFIRMATION', 'REGISTERED', 'STILL_THINKING', 'NOT_INTERESTED', 'NOT_A_TCN_MEMBER', 'NOT_A_GOOD_TIME', 'NO_RESPONSE', 'NEXT_COHORT', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'LOGIN_ISSUE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED');
CREATE TYPE public."FollowUpReplyStatus" AS ENUM ('NO_REPLY', 'REPLIED', 'NEEDS_REMINDER', 'INCORRECT_NUMBER');
CREATE TYPE public."IssueStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE public."Period" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');
CREATE TYPE public."Role" AS ENUM ('ADMIN', 'SUPPORT', 'SOP_PREPARER', 'STAFF');

-- Sequences ------------------------------------------------------------------------------------------------

-- Tables ---------------------------------------------------------------------------------------------------
CREATE TABLE public."AbsenceReviewDone" (
  "cohortId" uuid NOT NULL,
  "doneAt" timestamp with time zone DEFAULT now() NOT NULL,
  "doneById" uuid,
  "movedCount" integer DEFAULT 0 NOT NULL,
  "keptCount" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "AbsenceReviewDone_pkey" PRIMARY KEY ("cohortId")
);
ALTER TABLE public."AbsenceReviewDone" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AbsenceReviewMove" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  "groupIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "groupName" text,
  "supportId" uuid,
  "contactId" uuid,
  "prevContactStatus" text,
  "prevContactArchivedAt" timestamp with time zone,
  "prevParticipantStatus" text NOT NULL,
  "movedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "movedById" uuid,
  "undoneAt" timestamp with time zone,
  "undoneById" uuid,
  "prevContact" jsonb,
  CONSTRAINT "AbsenceReviewMove_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."AbsenceReviewMove" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Activity" (
  id integer DEFAULT nextval('"Activity_id_seq"'::regclass) NOT NULL,
  "dayId" integer NOT NULL,
  time text NOT NULL,
  description text NOT NULL,
  period "Period" NOT NULL,
  "orderIndex" integer NOT NULL,
  "userId" uuid DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid NOT NULL,
  CONSTRAINT "Activity_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."Activity" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ActivityLabel" (
  "activityId" integer NOT NULL,
  "labelId" uuid NOT NULL,
  CONSTRAINT "ActivityLabel_pkey" PRIMARY KEY ("activityId", "labelId")
);
ALTER TABLE public."ActivityLabel" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ActivityTeam" (
  "activityId" integer NOT NULL,
  "teamId" integer NOT NULL,
  order integer DEFAULT 0 NOT NULL,
  CONSTRAINT "ActivityTeam_pkey" PRIMARY KEY ("activityId", "teamId")
);
ALTER TABLE public."ActivityTeam" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Announcement" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  "sentAt" timestamp with time zone DEFAULT now() NOT NULL,
  "sentBy" uuid,
  scope "AnnouncementScope" DEFAULT 'ACTIVE_COHORT'::"AnnouncementScope" NOT NULL,
  "cohortId" uuid,
  "targetLabelId" uuid,
  "showOnHome" boolean DEFAULT false NOT NULL,
  "homeUntil" timestamp with time zone,
  "linkUrl" text,
  "linkLabel" text,
  audience text DEFAULT 'SUPPORTS'::text NOT NULL,
  "targetGroupId" uuid,
  "targetHubId" uuid,
  "targetUserId" uuid,
  "targetParticipantId" uuid,
  "homeLabel" text,
  "requirePopup" boolean DEFAULT false NOT NULL,
  "targetUserIds" uuid[],
  "targetHubJobs" text[],
  CONSTRAINT "Announcement_pkey" PRIMARY KEY (id),
  CONSTRAINT "Announcement_audience_check" CHECK ((audience = ANY (ARRAY['SUPPORTS'::text, 'PARTICIPANTS'::text, 'EVERYONE'::text]))),
  CONSTRAINT "Announcement_targetHubJobs_check" CHECK ((("targetHubJobs" IS NULL) OR ("targetHubJobs" <@ ARRAY['HUB_LEAD'::text, 'ASSISTANT_HUB_LEAD'::text, 'RECAP_LEAD'::text, 'PRAYER_LEAD'::text, 'IT_SUPPORT'::text])))
);
ALTER TABLE public."Announcement" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AnnouncementPopup" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcementId" uuid NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "ackedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "AnnouncementPopup_pkey" PRIMARY KEY (id),
  CONSTRAINT "AnnouncementPopup_check" CHECK ((num_nonnulls("userId", "participantId") = 1))
);
ALTER TABLE public."AnnouncementPopup" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ApiClient" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  "keyPrefix" text NOT NULL,
  "keyHash" text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  notes text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastUsedAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "createdById" uuid,
  CONSTRAINT "ApiClient_pkey" PRIMARY KEY (id),
  CONSTRAINT "ApiClient_keyHash_key" UNIQUE ("keyHash")
);
ALTER TABLE public."ApiClient" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ApiRequestLog" (
  id bigint DEFAULT nextval('"ApiRequestLog_id_seq"'::regclass) NOT NULL,
  "clientId" uuid,
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  "durationMs" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "teenRecords" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."ApiRequestLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AppNudgeLog" (
  "ownerId" uuid NOT NULL,
  "nudgeDate" date NOT NULL,
  CONSTRAINT "AppNudgeLog_pkey" PRIMARY KEY ("ownerId", "nudgeDate")
);
ALTER TABLE public."AppNudgeLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AppNudgeSend" (
  "ownerId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  "sentAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "AppNudgeSend_pkey" PRIMARY KEY ("ownerId", "participantId")
);
ALTER TABLE public."AppNudgeSend" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AppSession" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "tokenHash" text NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
  "expiresAt" timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
  "activeRole" "Role",
  "viaTeenNumber" boolean DEFAULT false NOT NULL,
  CONSTRAINT "AppSession_pkey" PRIMARY KEY (id),
  CONSTRAINT "AppSession_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "AppSession_one_actor" CHECK ((("userId" IS NULL) <> ("participantId" IS NULL)))
);
ALTER TABLE public."AppSession" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AppSetting" (
  "settingKey" text NOT NULL,
  value jsonb NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("settingKey")
);
ALTER TABLE public."AppSetting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AttendanceExcusal" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "attendanceRecordId" uuid NOT NULL,
  note text NOT NULL,
  "excusedById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "AttendanceExcusal_pkey" PRIMARY KEY (id),
  CONSTRAINT "AttendanceExcusal_attendanceRecordId_key" UNIQUE ("attendanceRecordId")
);
ALTER TABLE public."AttendanceExcusal" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AttendanceFollowUpTask" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "attendanceRecordId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "supportId" uuid NOT NULL,
  "dueAt" timestamp with time zone NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
  "completedAt" timestamp with time zone,
  "completedById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completionNote" text,
  CONSTRAINT "AttendanceFollowUpTask_pkey" PRIMARY KEY (id),
  CONSTRAINT "AttendanceFollowUpTask_attendanceRecordId_key" UNIQUE ("attendanceRecordId"),
  CONSTRAINT "AttendanceFollowUpTask_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'DONE'::text, 'CANCELLED'::text])))
);
ALTER TABLE public."AttendanceFollowUpTask" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AttendanceRecord" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  status text NOT NULL,
  "markedById" uuid,
  "markedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lateExcused" boolean DEFAULT false NOT NULL,
  "lateExcusedAt" timestamp with time zone,
  "lateExcusedById" uuid,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY (id),
  CONSTRAINT "AttendanceRecord_participantId_weekId_key" UNIQUE ("participantId", "weekId"),
  CONSTRAINT attendance_record_status_check CHECK ((status = ANY (ARRAY['PRESENT'::text, 'ABSENT'::text, 'LATE'::text, 'LEFT_EARLY'::text, 'EXCUSED'::text])))
);
ALTER TABLE public."AttendanceRecord" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."AttendanceSession" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "weekId" integer NOT NULL,
  "autoFinalizeAtNoon" boolean DEFAULT true NOT NULL,
  "finalizedAt" timestamp with time zone,
  "finalizedById" uuid,
  "finalizationMethod" text,
  "reopenedAt" timestamp with time zone,
  "reopenedById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "reportNotifiedAt" timestamp with time zone,
  "startedAt" timestamp with time zone,
  "startedById" uuid,
  "closesAt" timestamp with time zone,
  "reopenReason" text,
  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY (id),
  CONSTRAINT "AttendanceSession_weekId_key" UNIQUE ("weekId"),
  CONSTRAINT "AttendanceSession_finalizationMethod_check" CHECK (("finalizationMethod" = ANY (ARRAY['MANUAL'::text, 'AUTO'::text])))
);
ALTER TABLE public."AttendanceSession" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."BirthdayAlertLog" (
  "subjectKey" text NOT NULL,
  "birthdayDate" date NOT NULL,
  "daysBefore" integer NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "BirthdayAlertLog_pkey" PRIMARY KEY ("subjectKey", "birthdayDate", "daysBefore")
);
ALTER TABLE public."BirthdayAlertLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ChurchEvent" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  "stopsFof" boolean DEFAULT false NOT NULL,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ChurchEvent_pkey" PRIMARY KEY (id),
  CONSTRAINT "ChurchEvent_check" CHECK (("endDate" >= "startDate"))
);
ALTER TABLE public."ChurchEvent" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ClassSignal" (
  "weekId" integer NOT NULL,
  "participantId" uuid NOT NULL,
  status text NOT NULL,
  reason text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ClassSignal_pkey" PRIMARY KEY ("weekId", "participantId"),
  CONSTRAINT "ClassSignal_status_check" CHECK ((status = ANY (ARRAY['HERE'::text, 'CANT'::text])))
);
ALTER TABLE public."ClassSignal" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Cohort" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  "startDate" date,
  "endDate" date,
  status text DEFAULT 'ACTIVE'::text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  venue text,
  "schedulePublished" boolean DEFAULT false NOT NULL,
  "isPractice" boolean DEFAULT false NOT NULL,
  "practiceOn" boolean DEFAULT false NOT NULL,
  "practiceCalendar" text,
  CONSTRAINT "Cohort_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."Cohort" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Cohort10FollowUpRepairLedger" (
  "repairKey" text NOT NULL,
  "sourceCohortId" uuid NOT NULL,
  "targetCohortId" uuid NOT NULL,
  "contactIds" uuid[] NOT NULL,
  "participantIds" uuid[] NOT NULL,
  "accountParticipantIds" uuid[] NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Cohort10FollowUpRepairLedger_pkey" PRIMARY KEY ("repairKey"),
  CONSTRAINT "Cohort10FollowUpRepairLedger_accountParticipantIds_check" CHECK ((cardinality("accountParticipantIds") = 4)),
  CONSTRAINT "Cohort10FollowUpRepairLedger_contactIds_check" CHECK ((cardinality("contactIds") = 29)),
  CONSTRAINT "Cohort10FollowUpRepairLedger_participantIds_check" CHECK ((cardinality("participantIds") = 29))
);
ALTER TABLE public."Cohort10FollowUpRepairLedger" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CohortCheckup" (
  "cohortId" uuid NOT NULL,
  "taskGroupId" uuid NOT NULL,
  "restWeek3Start" date NOT NULL,
  "taskAddedAt" timestamp with time zone DEFAULT now() NOT NULL,
  supports integer DEFAULT 0 NOT NULL,
  "remindersSent" integer DEFAULT 0 NOT NULL,
  "lastReminderAt" timestamp with time zone,
  CONSTRAINT "CohortCheckup_pkey" PRIMARY KEY ("cohortId")
);
ALTER TABLE public."CohortCheckup" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerCheckin" (
  "sessionId" uuid NOT NULL,
  "personKind" text NOT NULL,
  "personId" uuid NOT NULL,
  "checkedInAt" timestamp with time zone DEFAULT now() NOT NULL,
  "amenAt" timestamp with time zone,
  "linkTappedAt" timestamp with time zone,
  "withoutLink" boolean DEFAULT false NOT NULL,
  "cantJoinAt" timestamp with time zone,
  CONSTRAINT "CorporatePrayerCheckin_pkey" PRIMARY KEY ("sessionId", "personKind", "personId"),
  CONSTRAINT "CorporatePrayerCheckin_personKind_check" CHECK (("personKind" = ANY (ARRAY['PARTICIPANT'::text, 'SUPPORT'::text])))
);
ALTER TABLE public."CorporatePrayerCheckin" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerCycle" (
  "cohortId" uuid NOT NULL,
  pool text NOT NULL,
  "cycleNo" integer DEFAULT 1 NOT NULL,
  "startedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "restartedById" uuid,
  CONSTRAINT "CorporatePrayerCycle_pkey" PRIMARY KEY ("cohortId", pool),
  CONSTRAINT "CorporatePrayerCycle_pool_check" CHECK ((pool = ANY (ARRAY['FAITH'::text, 'NAME'::text])))
);
ALTER TABLE public."CorporatePrayerCycle" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerSession" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "slotId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  "prayerDate" date NOT NULL,
  "slotType" text NOT NULL,
  "opensAt" timestamp with time zone NOT NULL,
  "closesAt" timestamp with time zone NOT NULL,
  "timerMinutes" integer NOT NULL,
  "verseId" uuid,
  "notifiedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
  "audienceAll" boolean DEFAULT true NOT NULL,
  "hubIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  CONSTRAINT "CorporatePrayerSession_pkey" PRIMARY KEY (id),
  CONSTRAINT "CorporatePrayerSession_slotId_prayerDate_key" UNIQUE ("slotId", "prayerDate")
);
ALTER TABLE public."CorporatePrayerSession" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerSetting" (
  "cohortId" uuid NOT NULL,
  "telegramLink" text,
  "liveWaitMinutes" integer DEFAULT 5 NOT NULL,
  "liveMessage" text,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "CorporatePrayerSetting_pkey" PRIMARY KEY ("cohortId"),
  CONSTRAINT "CorporatePrayerSetting_liveWaitMinutes_check" CHECK ((("liveWaitMinutes" >= 0) AND ("liveWaitMinutes" <= 60)))
);
ALTER TABLE public."CorporatePrayerSetting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerSkip" (
  "cohortId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  "cycleNo" integer NOT NULL,
  CONSTRAINT "CorporatePrayerSkip_pkey" PRIMARY KEY ("cohortId", "participantId", "cycleNo")
);
ALTER TABLE public."CorporatePrayerSkip" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerSlot" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  name text,
  "timeOfDay" time without time zone NOT NULL,
  "slotType" text NOT NULL,
  "timerMinutes" integer DEFAULT 15 NOT NULL,
  "joinWindowMinutes" integer DEFAULT 15 NOT NULL,
  "targetMode" text,
  notify boolean DEFAULT true NOT NULL,
  active boolean DEFAULT true NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
  "audienceAll" boolean DEFAULT true NOT NULL,
  "hubIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "telegramLink" text,
  "liveWaitMinutes" integer DEFAULT 5 NOT NULL,
  "liveMessage" text,
  "isTest" boolean DEFAULT false NOT NULL,
  CONSTRAINT "CorporatePrayerSlot_pkey" PRIMARY KEY (id),
  CONSTRAINT "CorporatePrayerSlot_joinWindowMinutes_check" CHECK ((("joinWindowMinutes" >= 1) AND ("joinWindowMinutes" <= 240))),
  CONSTRAINT "CorporatePrayerSlot_liveWaitMinutes_check" CHECK ((("liveWaitMinutes" >= 0) AND ("liveWaitMinutes" <= 60))),
  CONSTRAINT "CorporatePrayerSlot_slotType_check" CHECK (("slotType" = ANY (ARRAY['PRAYER'::text, 'LIVE'::text]))),
  CONSTRAINT "CorporatePrayerSlot_targetMode_check" CHECK (("targetMode" = ANY (ARRAY['COHORT'::text, 'HUB'::text]))),
  CONSTRAINT "CorporatePrayerSlot_timerMinutes_check" CHECK ((("timerMinutes" >= 1) AND ("timerMinutes" <= 120)))
);
ALTER TABLE public."CorporatePrayerSlot" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerTarget" (
  "sessionId" uuid NOT NULL,
  "hubKey" text NOT NULL,
  "cohortId" uuid NOT NULL,
  pool text NOT NULL,
  "prayerDate" date NOT NULL,
  "participantId" uuid NOT NULL,
  "cycleNo" integer NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "summarySentAt" timestamp with time zone,
  CONSTRAINT "CorporatePrayerTarget_pkey" PRIMARY KEY ("sessionId", "hubKey"),
  CONSTRAINT "CorporatePrayerTarget_pool_check" CHECK ((pool = ANY (ARRAY['FAITH'::text, 'NAME'::text])))
);
ALTER TABLE public."CorporatePrayerTarget" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerVerse" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  prayer text NOT NULL,
  reference text NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  title text NOT NULL,
  CONSTRAINT "CorporatePrayerVerse_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."CorporatePrayerVerse" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CorporatePrayerWallPost" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "sessionId" uuid NOT NULL,
  "targetId" uuid,
  "authorKind" text NOT NULL,
  "authorId" uuid NOT NULL,
  "authorHub" text,
  body text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "hiddenAt" timestamp with time zone,
  "hiddenById" uuid,
  CONSTRAINT "CorporatePrayerWallPost_pkey" PRIMARY KEY (id),
  CONSTRAINT "CorporatePrayerWallPost_authorKind_check" CHECK (("authorKind" = ANY (ARRAY['PARTICIPANT'::text, 'SUPPORT'::text]))),
  CONSTRAINT "CorporatePrayerWallPost_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 140)))
);
ALTER TABLE public."CorporatePrayerWallPost" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."CoverRequest" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "supportId" uuid NOT NULL,
  "cohortId" uuid,
  reason text NOT NULL,
  "startsAt" timestamp with time zone NOT NULL,
  "endsAt" timestamp with time zone NOT NULL,
  note text,
  status text DEFAULT 'PENDING'::text NOT NULL,
  "reviewedById" uuid,
  "reviewedAt" timestamp with time zone,
  "reviewNote" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "coverSupportId" uuid,
  "assignedById" uuid,
  "assignedAt" timestamp with time zone,
  "reviewedByActedAs" text,
  CONSTRAINT "CoverRequest_pkey" PRIMARY KEY (id),
  CONSTRAINT "CoverRequest_check" CHECK (("endsAt" > "startsAt")),
  CONSTRAINT "CoverRequest_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) > 0)),
  CONSTRAINT "CoverRequest_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ASSIGNED'::text])))
);
ALTER TABLE public."CoverRequest" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Day" (
  id integer DEFAULT nextval('"Day_id_seq"'::regclass) NOT NULL,
  "weekId" integer NOT NULL,
  "dayName" text NOT NULL,
  CONSTRAINT "Day_pkey" PRIMARY KEY (id),
  CONSTRAINT "Day_weekId_dayName_key" UNIQUE ("weekId", "dayName")
);
ALTER TABLE public."Day" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."DepartmentReferral" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  department text NOT NULL,
  status text DEFAULT 'LOGGED'::text NOT NULL,
  "loggedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "loggedById" uuid,
  "joinedAt" timestamp with time zone,
  "updatedById" uuid,
  note text,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "loggedByActedAs" text,
  "updatedByActedAs" text,
  CONSTRAINT "DepartmentReferral_pkey" PRIMARY KEY (id),
  CONSTRAINT "DepartmentReferral_participantId_department_key" UNIQUE ("participantId", department),
  CONSTRAINT "DepartmentReferral_department_check" CHECK ((length(TRIM(BOTH FROM department)) > 0)),
  CONSTRAINT "DepartmentReferral_status_check" CHECK ((status = ANY (ARRAY['LOGGED'::text, 'JOINED'::text, 'NOT_JOINED'::text])))
);
ALTER TABLE public."DepartmentReferral" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."EscalationNotice" (
  key text NOT NULL,
  "cohortId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "EscalationNotice_pkey" PRIMARY KEY (key)
);
ALTER TABLE public."EscalationNotice" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithHelpRequest" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "faithProjectId" uuid,
  reason text NOT NULL,
  note text,
  "wantsContact" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvedAt" timestamp with time zone,
  "resolvedById" uuid,
  "resolvedByActedAs" text,
  CONSTRAINT "FaithHelpRequest_pkey" PRIMARY KEY (id),
  CONSTRAINT "FaithHelpRequest_reason_check" CHECK ((reason = ANY (ARRAY['LOST_MOTIVATION'::text, 'SITUATION_CHANGED'::text, 'UNSURE_NEXT'::text, 'NO_TIME'::text, 'OTHER'::text])))
);
ALTER TABLE public."FaithHelpRequest" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithProject" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  title text,
  body text,
  status text DEFAULT 'NOT_DRAFTED'::text NOT NULL,
  "updatedById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewHistory" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "categoryId" uuid,
  "sharedForPrayer" boolean DEFAULT false NOT NULL,
  "updatedByActedAs" text,
  CONSTRAINT "FaithProject_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."FaithProject" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithProjectCategory" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  name text NOT NULL,
  "archivedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FaithProjectCategory_pkey" PRIMARY KEY (id),
  CONSTRAINT faith_project_category_name_not_blank CHECK ((length(TRIM(BOTH FROM name)) > 0))
);
ALTER TABLE public."FaithProjectCategory" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithProjectSetting" (
  "cohortId" uuid NOT NULL,
  "deadlineAt" timestamp with time zone,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "prayersStartWeekNumber" integer,
  "prayerPopupDaysBefore" integer DEFAULT 3 NOT NULL,
  CONSTRAINT "FaithProjectSetting_pkey" PRIMARY KEY ("cohortId"),
  CONSTRAINT "FaithProjectSetting_prayerPopupDaysBefore_check" CHECK ((("prayerPopupDaysBefore" >= 0) AND ("prayerPopupDaysBefore" <= 30))),
  CONSTRAINT "FaithProjectSetting_prayersStartWeekNumber_check" CHECK ((("prayersStartWeekNumber" IS NULL) OR ("prayersStartWeekNumber" >= 1)))
);
ALTER TABLE public."FaithProjectSetting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithProjectVersion" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "projectId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  body text NOT NULL,
  "savedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "savedById" uuid,
  "savedByName" text,
  CONSTRAINT "FaithProjectVersion_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."FaithProjectVersion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FaithThreadRead" (
  "userId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  trail text NOT NULL,
  "lastReadAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FaithThreadRead_pkey" PRIMARY KEY ("userId", "participantId", trail),
  CONSTRAINT "FaithThreadRead_trail_check" CHECK ((trail = ANY (ARRAY['coach'::text, 'office'::text])))
);
ALTER TABLE public."FaithThreadRead" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FeedbackResponse" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  round text DEFAULT 'GENERAL'::text NOT NULL,
  answers jsonb NOT NULL,
  "submittedOn" date DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY (id),
  CONSTRAINT "FeedbackResponse_round_check" CHECK ((round = ANY (ARRAY['MID'::text, 'END'::text, 'GENERAL'::text])))
);
ALTER TABLE public."FeedbackResponse" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FeedbackThemes" (
  "cohortId" uuid NOT NULL,
  round text NOT NULL,
  themes text NOT NULL,
  model text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FeedbackThemes_pkey" PRIMARY KEY ("cohortId", round),
  CONSTRAINT "FeedbackThemes_round_check" CHECK ((round = ANY (ARRAY['MID'::text, 'END'::text, 'GENERAL'::text])))
);
ALTER TABLE public."FeedbackThemes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpAdminAlertLog" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "windowStart" timestamp with time zone NOT NULL,
  "waitingCount" integer NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FollowUpAdminAlertLog_pkey" PRIMARY KEY (id),
  CONSTRAINT "FollowUpAdminAlertLog_windowStart_key" UNIQUE ("windowStart")
);
ALTER TABLE public."FollowUpAdminAlertLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpContact" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "fullName" text NOT NULL,
  phone text,
  source text,
  "ownerId" uuid,
  "messageStatus" "FollowUpMessageStatus" DEFAULT 'NOT_SENT'::"FollowUpMessageStatus" NOT NULL,
  "replyStatus" "FollowUpReplyStatus" DEFAULT 'NO_REPLY'::"FollowUpReplyStatus" NOT NULL,
  "callStatus" "FollowUpCallStatus" DEFAULT 'NOT_CALLED'::"FollowUpCallStatus" NOT NULL,
  "registrationStatus" "FollowUpRegistrationStatus" DEFAULT 'NOT_REGISTERED'::"FollowUpRegistrationStatus" NOT NULL,
  "nextAction" "FollowUpNextAction" DEFAULT 'SEND_MESSAGE'::"FollowUpNextAction" NOT NULL,
  "lastContactDate" date,
  "followUpCount" integer DEFAULT 0 NOT NULL,
  notes text,
  "cohortId" uuid,
  "dueDate" date,
  "dueReminderSentAt" timestamp with time zone,
  "archivedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  email text,
  gender text,
  "ageRange" text,
  occupation text,
  "registeredById" uuid,
  "sheetSyncedAt" timestamp with time zone,
  "sheetSyncError" text,
  "sheetSyncWarning" text,
  "isTest" boolean DEFAULT false NOT NULL,
  "formQuestion" text,
  "formQuestionAnsweredAt" timestamp with time zone,
  "formQuestionAnsweredById" uuid,
  "ownerAssignedAt" timestamp with time zone,
  "statusChangedAt" timestamp with time zone,
  "registeredByActedAs" text,
  "manualRegistrationAt" timestamp with time zone,
  "manualRegistrationBy" uuid,
  "manualRegistrationReason" text,
  "guardianPhone" text,
  "teenOnboardedHow" text,
  "teenGenderFallback" boolean DEFAULT false NOT NULL,
  "guardianName" text,
  "noResponseAt" timestamp with time zone,
  "guardianConsentAt" timestamp with time zone,
  "guardianConsentById" uuid,
  "notInterestedAt" timestamp with time zone,
  "notInterestedNote" text,
  CONSTRAINT "FollowUpContact_pkey" PRIMARY KEY (id),
  CONSTRAINT "FollowUpContact_teenOnboardedHow_check" CHECK ((("teenOnboardedHow" IS NULL) OR ("teenOnboardedHow" = ANY (ARRAY['WHATSAPP_GROUP'::text, 'PARENT_REACHED'::text, 'PHONE_CALL'::text]))))
);
ALTER TABLE public."FollowUpContact" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpContactStatusBackup_20260928" (
  id uuid,
  "registrationStatus" "FollowUpRegistrationStatus",
  "archivedAt" timestamp with time zone,
  "nextAction" "FollowUpNextAction",
  "updatedAt" timestamp with time zone
);
ALTER TABLE public."FollowUpContactStatusBackup_20260928" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpIssue" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "contactId" uuid,
  "openedAt" date DEFAULT CURRENT_DATE NOT NULL,
  person text,
  issue text NOT NULL,
  "ownerId" uuid,
  "neededFrom" text,
  status "IssueStatus" DEFAULT 'OPEN'::"IssueStatus" NOT NULL,
  resolution text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "reportedById" uuid,
  CONSTRAINT "FollowUpIssue_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."FollowUpIssue" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpIssueContact" (
  "issueId" uuid NOT NULL,
  "contactId" uuid NOT NULL,
  CONSTRAINT "FollowUpIssueContact_pkey" PRIMARY KEY ("issueId", "contactId")
);
ALTER TABLE public."FollowUpIssueContact" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpLoginIssue" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "contactId" uuid NOT NULL,
  "reportedById" uuid,
  description text NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
  "resolvedById" uuid,
  "resolvedAt" timestamp with time zone,
  resolution text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvedByActedAs" text,
  CONSTRAINT "FollowUpLoginIssue_pkey" PRIMARY KEY (id),
  CONSTRAINT "FollowUpLoginIssue_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'RESOLVED'::text])))
);
ALTER TABLE public."FollowUpLoginIssue" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpNoteHistory" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "contactId" uuid NOT NULL,
  body text NOT NULL,
  "authorId" uuid,
  "authorLabel" text,
  imported boolean DEFAULT false NOT NULL,
  "notedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FollowUpNoteHistory_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."FollowUpNoteHistory" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpOwnerCheck" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "ownerId" uuid NOT NULL,
  "promptedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "deadlineAt" timestamp with time zone NOT NULL,
  answer text,
  "answeredAt" timestamp with time zone,
  extended boolean DEFAULT false NOT NULL,
  "closedAt" timestamp with time zone,
  "closedReason" text,
  CONSTRAINT "FollowUpOwnerCheck_pkey" PRIMARY KEY (id),
  CONSTRAINT "FollowUpOwnerCheck_answer_check" CHECK ((answer = ANY (ARRAY['YES'::text, 'NOT_NOW'::text])))
);
ALTER TABLE public."FollowUpOwnerCheck" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpOwnerReminderLog" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "reminderDate" date NOT NULL,
  kind text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FollowUpOwnerReminderLog_pkey" PRIMARY KEY (id),
  CONSTRAINT "FollowUpOwnerReminderLog_userId_reminderDate_kind_key" UNIQUE ("userId", "reminderDate", kind)
);
ALTER TABLE public."FollowUpOwnerReminderLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."FollowUpReassignmentLog" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "contactId" uuid NOT NULL,
  "fromUserId" uuid,
  "toUserId" uuid,
  reason text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "FollowUpReassignmentLog_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."FollowUpReassignmentLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Group" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  name text NOT NULL,
  "supportId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "meetingDay" text,
  "meetingTime" text,
  "callPlatform" text,
  "callLink" text,
  "archivedAt" timestamp with time zone,
  "archivedById" uuid,
  "isTeenGroup" boolean DEFAULT false NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY (id),
  CONSTRAINT "Group_cohortId_name_key" UNIQUE ("cohortId", name),
  CONSTRAINT "Group_callPlatform_check" CHECK ((("callPlatform" IS NULL) OR ("callPlatform" = ANY (ARRAY['WHATSAPP'::text, 'GOOGLE_MEET'::text]))))
);
ALTER TABLE public."Group" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupDiscussionSeen" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "groupId" uuid NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "seenAt" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "GroupDiscussionSeen_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupDiscussionSeen_check" CHECK ((num_nonnulls("userId", "participantId") = 1))
);
ALTER TABLE public."GroupDiscussionSeen" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupMeetingReopen" (
  "groupId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "requestedAt" timestamp with time zone,
  "requestedById" uuid,
  "requestReason" text,
  "reopenedAt" timestamp with time zone,
  "reopenedById" uuid,
  "reopenReason" text,
  "resubmittedAt" timestamp with time zone,
  CONSTRAINT "GroupMeetingReopen_pkey" PRIMARY KEY ("groupId", "weekId")
);
ALTER TABLE public."GroupMeetingReopen" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupOnboardingStatus" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "groupId" uuid NOT NULL,
  "groupCreated" boolean DEFAULT false NOT NULL,
  "updatedById" uuid,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completedAt" timestamp with time zone,
  "updatedByActedAs" text,
  CONSTRAINT "GroupOnboardingStatus_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupOnboardingStatus_groupId_key" UNIQUE ("groupId")
);
ALTER TABLE public."GroupOnboardingStatus" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupParticipant" (
  "groupId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "GroupParticipant_pkey" PRIMARY KEY ("groupId", "participantId"),
  CONSTRAINT group_participant_unique_participant UNIQUE ("participantId")
);
ALTER TABLE public."GroupParticipant" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPost" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "groupId" uuid NOT NULL,
  "authorUserId" uuid,
  "authorParticipantId" uuid,
  body text NOT NULL,
  "pinnedAt" timestamp with time zone,
  "pinnedById" uuid,
  "removedAt" timestamp with time zone,
  "removedById" uuid,
  "deletedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
  kind text DEFAULT 'POST'::text NOT NULL,
  CONSTRAINT "GroupPost_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPost_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))),
  CONSTRAINT "GroupPost_check" CHECK ((num_nonnulls("authorUserId", "authorParticipantId") = 1)),
  CONSTRAINT "GroupPost_kind_check" CHECK ((kind = ANY (ARRAY['POST'::text, 'INTRO'::text])))
);
ALTER TABLE public."GroupPost" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPostLike" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "postId" uuid NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "GroupPostLike_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPostLike_check" CHECK ((num_nonnulls("userId", "participantId") = 1))
);
ALTER TABLE public."GroupPostLike" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPostReply" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "postId" uuid NOT NULL,
  "authorUserId" uuid,
  "authorParticipantId" uuid,
  body text NOT NULL,
  "removedAt" timestamp with time zone,
  "removedById" uuid,
  "deletedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "GroupPostReply_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPostReply_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))),
  CONSTRAINT "GroupPostReply_check" CHECK ((num_nonnulls("authorUserId", "authorParticipantId") = 1))
);
ALTER TABLE public."GroupPostReply" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPostReport" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "postId" uuid NOT NULL,
  "reporterParticipantId" uuid NOT NULL,
  reason text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvedAt" timestamp with time zone,
  "resolvedById" uuid,
  resolution text,
  CONSTRAINT "GroupPostReport_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPostReport_postId_reporterParticipantId_key" UNIQUE ("postId", "reporterParticipantId"),
  CONSTRAINT "GroupPostReport_reason_check" CHECK ((reason = ANY (ARRAY['SPAM'::text, 'UNKIND'::text, 'OFF_TOPIC'::text, 'OTHER'::text]))),
  CONSTRAINT "GroupPostReport_resolution_check" CHECK ((resolution = ANY (ARRAY['KEPT'::text, 'REMOVED'::text])))
);
ALTER TABLE public."GroupPostReport" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPrayer" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  body text NOT NULL,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "createdByActedAs" text,
  CONSTRAINT "GroupPrayer_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPrayer_cohortId_weekId_key" UNIQUE ("cohortId", "weekId")
);
ALTER TABLE public."GroupPrayer" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPrayerFocus" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "groupId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "participantId" uuid NOT NULL,
  "setById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "setByActedAs" text,
  CONSTRAINT "GroupPrayerFocus_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPrayerFocus_groupId_weekId_key" UNIQUE ("groupId", "weekId")
);
ALTER TABLE public."GroupPrayerFocus" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."GroupPrayerStatus" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "groupId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  done boolean DEFAULT false NOT NULL,
  "markedById" uuid,
  "markedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "prayerFinishedAt" timestamp with time zone,
  "recapFinishedAt" timestamp with time zone,
  "metOn" date,
  notes text,
  CONSTRAINT "GroupPrayerStatus_pkey" PRIMARY KEY (id),
  CONSTRAINT "GroupPrayerStatus_groupId_weekId_key" UNIQUE ("groupId", "weekId")
);
ALTER TABLE public."GroupPrayerStatus" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubComment" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "topicId" uuid NOT NULL,
  "authorId" uuid NOT NULL,
  body text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubComment_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."HubComment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubItSupport" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "hubId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubItSupport_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubItSupport_hubId_userId_key" UNIQUE ("hubId", "userId")
);
ALTER TABLE public."HubItSupport" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubLeadsMeeting" (
  "cohortId" uuid NOT NULL,
  "meetingDay" text,
  "meetingTime" text,
  "callPlatform" text,
  "callLink" text,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedById" uuid,
  "updatedByActedAs" text,
  CONSTRAINT "HubLeadsMeeting_pkey" PRIMARY KEY ("cohortId"),
  CONSTRAINT "HubLeadsMeeting_callPlatform_check" CHECK ((("callPlatform" IS NULL) OR ("callPlatform" = ANY (ARRAY['WHATSAPP'::text, 'GOOGLE_MEET'::text]))))
);
ALTER TABLE public."HubLeadsMeeting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubMembership" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "hubId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubMembership_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubMembership_cohortId_userId_key" UNIQUE ("cohortId", "userId")
);
ALTER TABLE public."HubMembership" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubMessage" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "hubId" uuid NOT NULL,
  "authorId" uuid,
  subject text NOT NULL,
  body text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "editedAt" timestamp with time zone,
  CONSTRAINT "HubMessage_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."HubMessage" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubMessageAck" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "messageId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubMessageAck_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubMessageAck_messageId_userId_key" UNIQUE ("messageId", "userId")
);
ALTER TABLE public."HubMessageAck" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubPersonOfInterest" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "hubId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubPersonOfInterest_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubPersonOfInterest_hubId_userId_key" UNIQUE ("hubId", "userId")
);
ALTER TABLE public."HubPersonOfInterest" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubReaction" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "topicId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubReaction_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubReaction_topicId_userId_key" UNIQUE ("topicId", "userId")
);
ALTER TABLE public."HubReaction" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubReply" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "commentId" uuid NOT NULL,
  "authorId" uuid NOT NULL,
  body text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubReply_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."HubReply" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubRoleIntroSeen" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "hubId" uuid NOT NULL,
  job text NOT NULL,
  "seenAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubRoleIntroSeen_pkey" PRIMARY KEY (id),
  CONSTRAINT "HubRoleIntroSeen_userId_hubId_job_key" UNIQUE ("userId", "hubId", job),
  CONSTRAINT "HubRoleIntroSeen_job_check" CHECK ((job = ANY (ARRAY['HUB_LEAD'::text, 'ASSISTANT_HUB_LEAD'::text, 'RECAP_LEAD'::text, 'PRAYER_LEAD'::text, 'IT_SUPPORT'::text])))
);
ALTER TABLE public."HubRoleIntroSeen" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."HubTopic" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "authorId" uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "HubTopic_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."HubTopic" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Label" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  "createdAt" timestamp without time zone DEFAULT now(),
  "updatedAt" timestamp without time zone DEFAULT now(),
  "cohortId" uuid,
  "groupId" uuid,
  CONSTRAINT "Label_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."Label" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ManualNote" (
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ManualNote_pkey" PRIMARY KEY ("participantId", "weekId")
);
ALTER TABLE public."ManualNote" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ManualQuestion" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "cohortId" uuid NOT NULL,
  "groupId" uuid,
  body text NOT NULL,
  status text DEFAULT 'NEW'::text NOT NULL,
  reply text,
  "repliedById" uuid,
  "repliedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "repliedByActedAs" text,
  "askedById" uuid,
  "hideName" boolean DEFAULT false NOT NULL,
  CONSTRAINT "ManualQuestion_pkey" PRIMARY KEY (id),
  CONSTRAINT "ManualQuestion_status_check" CHECK ((status = ANY (ARRAY['NEW'::text, 'IN_CLASS'::text, 'REPLIED'::text])))
);
ALTER TABLE public."ManualQuestion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."MeetingAttendance" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "groupId" uuid,
  "weekId" integer NOT NULL,
  status text NOT NULL,
  "markedById" uuid,
  "markedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY (id),
  CONSTRAINT "MeetingAttendance_participantId_weekId_key" UNIQUE ("participantId", "weekId"),
  CONSTRAINT "MeetingAttendance_status_check" CHECK ((status = ANY (ARRAY['JOINED'::text, 'EXCUSED'::text, 'MISSED'::text])))
);
ALTER TABLE public."MeetingAttendance" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."MeetingRecordingOpening" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "hubId" uuid,
  "groupId" uuid,
  "weekId" integer NOT NULL,
  "openUntil" timestamp with time zone NOT NULL,
  "openedById" uuid,
  "openedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "MeetingRecordingOpening_pkey" PRIMARY KEY (id),
  CONSTRAINT "MeetingRecordingOpening_check" CHECK ((("hubId" IS NULL) <> ("groupId" IS NULL)))
);
ALTER TABLE public."MeetingRecordingOpening" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."MessageTemplate" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "useCase" text NOT NULL,
  body text NOT NULL,
  "whenToUse" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "imageUrl" text,
  "imageName" text,
  category text DEFAULT 'FOLLOW_UP'::text NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."MessageTemplate" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Notification" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  path text,
  type text DEFAULT 'GENERAL'::text NOT NULL,
  "isRead" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "readAt" timestamp with time zone,
  CONSTRAINT "Notification_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."OnboardingEvent" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text NOT NULL,
  "groupId" uuid NOT NULL,
  "participantId" uuid,
  "actorId" uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "OnboardingEvent_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."OnboardingEvent" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Participant" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "fullName" text NOT NULL,
  phone text,
  "cohortId" uuid,
  source text DEFAULT 'MANUAL'::text NOT NULL,
  "followUpContactId" uuid,
  status text DEFAULT 'ACTIVE'::text NOT NULL,
  notes text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  email text,
  gender text,
  "ageRange" text,
  departments text[] DEFAULT '{}'::text[] NOT NULL,
  "registrationDate" timestamp with time zone,
  "smartRequest" text,
  "avatarUrl" text,
  "dateOfBirth" date,
  occupation text,
  "isTest" boolean DEFAULT false NOT NULL,
  "retakeStatus" text,
  "retakeNote" text,
  "retakeCheckedById" uuid,
  "retakeCheckedAt" timestamp with time zone,
  "themeColor" text,
  "guardianPhone" text,
  "prayerConsent" text,
  "prayerConsentAt" timestamp with time zone,
  CONSTRAINT "Participant_pkey" PRIMARY KEY (id),
  CONSTRAINT "Participant_prayerConsent_check" CHECK (("prayerConsent" = ANY (ARRAY['IN'::text, 'OUT'::text]))),
  CONSTRAINT "Participant_retakeStatus_check" CHECK (("retakeStatus" = ANY (ARRAY['CONFIRMED'::text, 'NOT_SAME'::text]))),
  CONSTRAINT "Participant_themeColor_check" CHECK ((("themeColor" IS NULL) OR ("themeColor" ~* '^#[0-9a-f]{6}$'::text)))
);
ALTER TABLE public."Participant" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantAccount" (
  "participantId" uuid NOT NULL,
  password_hash text NOT NULL,
  "setupCode" text,
  "mustChangePassword" boolean DEFAULT true NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "issuedById" uuid,
  "issuedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "passwordSetAt" timestamp with time zone,
  "lastSignInAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "aiOptInAt" timestamp with time zone,
  CONSTRAINT "ParticipantAccount_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantAccount" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantAppSetupCompletion" (
  "participantId" uuid NOT NULL,
  "ownerId" uuid,
  "completedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantAppSetupCompletion_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantAppSetupCompletion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantAppState" (
  "participantId" uuid NOT NULL,
  "installedAt" timestamp with time zone,
  "lastOpenedInstalledAt" timestamp with time zone,
  device text,
  "notificationState" text,
  "sheetShown" integer DEFAULT 0 NOT NULL,
  "sheetDismissed" integer DEFAULT 0 NOT NULL,
  "lastSheetAt" timestamp with time zone,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp with time zone,
  CONSTRAINT "ParticipantAppState_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantAppState" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantCheckIn" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  response text NOT NULL,
  "sundayMisses" integer DEFAULT 0 NOT NULL,
  "meetingMisses" integer DEFAULT 0 NOT NULL,
  "handledAt" timestamp with time zone,
  "handledById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantCheckIn_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantCheckIn_response_check" CHECK ((response = ANY (ARRAY['OKAY'::text, 'NEED_HELP'::text])))
);
ALTER TABLE public."ParticipantCheckIn" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantClassFeedback" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  rating integer NOT NULL,
  comment text,
  "participantId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantClassFeedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantClassFeedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))
);
ALTER TABLE public."ParticipantClassFeedback" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantClassFeedbackDone" (
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  CONSTRAINT "ParticipantClassFeedbackDone_pkey" PRIMARY KEY ("participantId", "weekId")
);
ALTER TABLE public."ParticipantClassFeedbackDone" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantFlag" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "groupId" uuid,
  "weekId" integer,
  reason text NOT NULL,
  note text,
  "raisedById" uuid,
  "raisedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "clearedById" uuid,
  "clearedAt" timestamp with time zone,
  "raisedByActedAs" text,
  "clearedByActedAs" text,
  CONSTRAINT "ParticipantFlag_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantFlag_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) > 0))
);
ALTER TABLE public."ParticipantFlag" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantHandover" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "eventType" text NOT NULL,
  "fromGroupId" uuid,
  "fromGroupName" text,
  "fromSupportId" uuid,
  "fromSupportName" text,
  "toGroupId" uuid,
  "toGroupName" text,
  "toSupportId" uuid,
  "toSupportName" text,
  "faithProjectStatus" text,
  "faithProjectUpdatedById" uuid,
  "faithProjectUpdatedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantHandover_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantHandover_eventType_check" CHECK (("eventType" = ANY (ARRAY['GROUP_JOINED'::text, 'GROUP_LEFT'::text, 'SUPPORT_REASSIGNED'::text])))
);
ALTER TABLE public."ParticipantHandover" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantLoginPhone" (
  "participantId" uuid NOT NULL,
  phone text NOT NULL,
  "addedById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantLoginPhone_pkey" PRIMARY KEY ("participantId"),
  CONSTRAINT "ParticipantLoginPhone_valid" CHECK ((fof_phone_key(phone) IS NOT NULL))
);
ALTER TABLE public."ParticipantLoginPhone" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantNote" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  body text NOT NULL,
  "authorId" uuid,
  "groupId" uuid,
  "weekId" integer,
  "noteType" text DEFAULT 'HANDOVER'::text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "byParticipant" boolean DEFAULT false NOT NULL,
  CONSTRAINT "ParticipantNote_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantNote_body_check" CHECK ((length(TRIM(BOTH FROM body)) > 0)),
  CONSTRAINT "ParticipantNote_noteType_check" CHECK (("noteType" = ANY (ARRAY['HANDOVER'::text, 'MEETING'::text, 'FAITH_COACH'::text, 'FAITH_OFFICE'::text, 'CHECK_IN'::text])))
);
ALTER TABLE public."ParticipantNote" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantNotification" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  path text,
  type text DEFAULT 'GENERAL'::text NOT NULL,
  "readAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantNotification_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."ParticipantNotification" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantOnboarding" (
  "participantId" uuid NOT NULL,
  "introGuideReadAt" timestamp with time zone,
  "readyConfirmedAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "venueMapAckAt" timestamp with time zone,
  "introTickedAt" timestamp with time zone,
  CONSTRAINT "ParticipantOnboarding_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantOnboarding" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantOnboardingStatus" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  contacted boolean DEFAULT false NOT NULL,
  "addedToGroup" boolean DEFAULT false NOT NULL,
  "introductionDone" boolean DEFAULT false NOT NULL,
  "venueAcknowledged" boolean DEFAULT false NOT NULL,
  "updatedById" uuid,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedByActedAs" text,
  CONSTRAINT "ParticipantOnboardingStatus_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantOnboardingStatus_participantId_key" UNIQUE ("participantId")
);
ALTER TABLE public."ParticipantOnboardingStatus" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantPushSubscription" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantPushSubscription_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantPushSubscription_participantId_endpoint_key" UNIQUE ("participantId", endpoint)
);
ALTER TABLE public."ParticipantPushSubscription" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantReadyStep" (
  "participantId" uuid NOT NULL,
  step text NOT NULL,
  "doneAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantReadyStep_pkey" PRIMARY KEY ("participantId", step),
  CONSTRAINT "ParticipantReadyStep_step_check" CHECK ((step = ANY (ARRAY['intro'::text, 'people'::text])))
);
ALTER TABLE public."ParticipantReadyStep" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantReminderLog" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  "targetKey" text NOT NULL,
  "participantId" uuid NOT NULL,
  occurrence text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantReminderLog_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantReminderLog_kind_targetKey_participantId_occurre_key" UNIQUE (kind, "targetKey", "participantId", occurrence)
);
ALTER TABLE public."ParticipantReminderLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantReminderSetting" (
  "participantId" uuid NOT NULL,
  "meetingRemindMinutes" jsonb DEFAULT '[60]'::jsonb NOT NULL,
  "recapReleased" boolean DEFAULT true NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantReminderSetting_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantReminderSetting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantStageChange" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  stage text NOT NULL,
  note text,
  "changedById" uuid,
  "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "changedByActedAs" text,
  CONSTRAINT "ParticipantStageChange_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantStageChange_stage_check" CHECK ((stage = ANY (ARRAY['REGISTERED'::text, 'ONBOARDED'::text, 'ACTIVE'::text, 'COMPLETED'::text, 'REFERRED'::text, 'INTEGRATED'::text])))
);
ALTER TABLE public."ParticipantStageChange" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantTelegramLink" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "chatId" bigint NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  "blockedAt" timestamp with time zone,
  "linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantTelegramLink_pkey" PRIMARY KEY (id),
  CONSTRAINT "ParticipantTelegramLink_participantId_key" UNIQUE ("participantId")
);
ALTER TABLE public."ParticipantTelegramLink" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantThreadRead" (
  "participantId" uuid NOT NULL,
  "coachLastReadAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantThreadRead_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE public."ParticipantThreadRead" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ParticipantWrapUp" (
  "participantId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  department text,
  "wantsReferral" boolean DEFAULT false NOT NULL,
  note text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ParticipantWrapUp_pkey" PRIMARY KEY ("participantId", "cohortId")
);
ALTER TABLE public."ParticipantWrapUp" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PendingChange" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "weekId" integer NOT NULL,
  "changeType" "ChangeType" NOT NULL,
  "changeData" jsonb NOT NULL,
  "userId" uuid DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid NOT NULL,
  "createdAt" timestamp without time zone DEFAULT now(),
  CONSTRAINT "PendingChange_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."PendingChange" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PermissionRole" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  "isSystem" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PermissionRole_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."PermissionRole" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PermissionRoleModule" (
  "roleId" uuid NOT NULL,
  module text NOT NULL,
  "canView" boolean DEFAULT false NOT NULL,
  "canAdd" boolean DEFAULT false NOT NULL,
  "canEdit" boolean DEFAULT false NOT NULL,
  "canDelete" boolean DEFAULT false NOT NULL,
  CONSTRAINT "PermissionRoleModule_pkey" PRIMARY KEY ("roleId", module)
);
ALTER TABLE public."PermissionRoleModule" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PlannerChange" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  summary text NOT NULL,
  "eventId" uuid,
  "cohortId" uuid,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "undoneAt" timestamp with time zone,
  "undoneById" uuid,
  "createdByActedAs" text,
  CONSTRAINT "PlannerChange_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."PlannerChange" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PracticeMember" (
  "userId" uuid NOT NULL,
  role text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp with time zone,
  "inParticipantView" boolean DEFAULT false NOT NULL,
  "resetAt" timestamp with time zone,
  CONSTRAINT "PracticeMember_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "PracticeMember_role_check" CHECK ((role = ANY (ARRAY['SUPPORT'::text, 'HUB_LEAD'::text, 'ASSISTANT'::text, 'RECAP_LEAD'::text, 'PRAYER_LEAD'::text])))
);
ALTER TABLE public."PracticeMember" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PracticePeer" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "fromUserId" uuid NOT NULL,
  "toUserId" uuid NOT NULL,
  "fromRole" text NOT NULL,
  "toRole" text NOT NULL,
  status text DEFAULT 'PENDING'::text NOT NULL,
  "hubId" uuid,
  "participantId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "respondedAt" timestamp with time zone,
  "endedAt" timestamp with time zone,
  CONSTRAINT "PracticePeer_pkey" PRIMARY KEY (id),
  CONSTRAINT "PracticePeer_fromRole_check" CHECK (("fromRole" = ANY (ARRAY['SUPPORT'::text, 'HUB_LEAD'::text, 'ASSISTANT'::text, 'RECAP_LEAD'::text, 'PRAYER_LEAD'::text, 'PARTICIPANT'::text]))),
  CONSTRAINT "PracticePeer_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'ENDED'::text, 'DECLINED'::text, 'CANCELLED'::text]))),
  CONSTRAINT "PracticePeer_toRole_check" CHECK (("toRole" = ANY (ARRAY['SUPPORT'::text, 'HUB_LEAD'::text, 'ASSISTANT'::text, 'RECAP_LEAD'::text, 'PRAYER_LEAD'::text, 'PARTICIPANT'::text])))
);
ALTER TABLE public."PracticePeer" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PracticeProgress" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "scenarioKey" text NOT NULL,
  "doneAt" timestamp with time zone,
  "stuckAt" timestamp with time zone,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "autoDisabled" boolean DEFAULT false NOT NULL,
  CONSTRAINT "PracticeProgress_pkey" PRIMARY KEY (id),
  CONSTRAINT "PracticeProgress_check" CHECK ((num_nonnulls("userId", "participantId") = 1)),
  CONSTRAINT "PracticeProgress_scenarioKey_check" CHECK (((char_length("scenarioKey") >= 1) AND (char_length("scenarioKey") <= 60)))
);
ALTER TABLE public."PracticeProgress" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PrayerMilestone" (
  "personKind" text NOT NULL,
  "personId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  milestone integer NOT NULL,
  "earnedOn" date NOT NULL,
  "seenAt" timestamp with time zone,
  "toldGroupAt" timestamp with time zone,
  "supportNotifiedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PrayerMilestone_pkey" PRIMARY KEY ("personKind", "personId", "cohortId", milestone),
  CONSTRAINT "PrayerMilestone_milestone_check" CHECK ((milestone = ANY (ARRAY[5, 10, 21, 30, 70]))),
  CONSTRAINT "PrayerMilestone_personKind_check" CHECK (("personKind" = ANY (ARRAY['PARTICIPANT'::text, 'SUPPORT'::text])))
);
ALTER TABLE public."PrayerMilestone" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ProfileField" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  "helpText" text,
  "fieldType" text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb NOT NULL,
  required boolean DEFAULT true NOT NULL,
  "cohortIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "groupIds" uuid[],
  "participantIds" uuid[],
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "archivedAt" timestamp with time zone,
  CONSTRAINT "ProfileField_pkey" PRIMARY KEY (id),
  CONSTRAINT "ProfileField_fieldType_check" CHECK (("fieldType" = ANY (ARRAY['SHORT_TEXT'::text, 'LONG_TEXT'::text, 'DATE'::text, 'CHOICE'::text, 'YES_NO'::text])))
);
ALTER TABLE public."ProfileField" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ProfileFieldAnswer" (
  "fieldId" uuid NOT NULL,
  "participantId" uuid NOT NULL,
  value text,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ProfileFieldAnswer_pkey" PRIMARY KEY ("fieldId", "participantId")
);
ALTER TABLE public."ProfileFieldAnswer" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PublicHoliday" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  "isEstimate" boolean DEFAULT false NOT NULL,
  source text DEFAULT 'google-ng'::text NOT NULL,
  "fetchedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY (id),
  CONSTRAINT "PublicHoliday_date_name_key" UNIQUE (date, name)
);
ALTER TABLE public."PublicHoliday" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PushReminderLog" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  "targetId" text NOT NULL,
  "userId" uuid NOT NULL,
  "reminderDate" date NOT NULL,
  "intervalMinutes" integer NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PushReminderLog_pkey" PRIMARY KEY (id),
  CONSTRAINT "PushReminderLog_kind_targetId_userId_reminderDate_intervalM_key" UNIQUE (kind, "targetId", "userId", "reminderDate", "intervalMinutes")
);
ALTER TABLE public."PushReminderLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."PushSubscription" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY (id),
  CONSTRAINT "PushSubscription_userId_endpoint_key" UNIQUE ("userId", endpoint)
);
ALTER TABLE public."PushSubscription" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."RecapRelease" (
  "groupId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "releasedById" uuid,
  "releasedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "RecapRelease_pkey" PRIMARY KEY ("groupId", "weekId")
);
ALTER TABLE public."RecapRelease" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Reflection" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  "stoodOut" text,
  goal text,
  "goalCheck" text,
  "goalDoneAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Reflection_pkey" PRIMARY KEY (id),
  CONSTRAINT "Reflection_participantId_weekId_key" UNIQUE ("participantId", "weekId")
);
ALTER TABLE public."Reflection" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ReflectionSummary" (
  "participantId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  summary text NOT NULL,
  model text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ReflectionSummary_pkey" PRIMARY KEY ("participantId", "cohortId")
);
ALTER TABLE public."ReflectionSummary" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."RejectedChange" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "weekId" integer NOT NULL,
  "changeType" "ChangeType" NOT NULL,
  "changeData" jsonb NOT NULL,
  "userId" uuid DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid NOT NULL,
  "submittedAt" timestamp without time zone NOT NULL,
  "rejectedBy" text NOT NULL,
  "rejectedAt" timestamp without time zone DEFAULT now(),
  "rejectionReason" text NOT NULL,
  "isRead" boolean DEFAULT false,
  CONSTRAINT "RejectedChange_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."RejectedChange" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Resource" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL,
  url text NOT NULL,
  "fileName" text,
  "fileSize" bigint,
  "addedBy" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "visibleToParticipants" boolean DEFAULT false NOT NULL,
  "cohortId" uuid,
  "visibleToSupports" boolean DEFAULT true NOT NULL,
  "hubIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "updatedAt" timestamp with time zone,
  "updatedById" uuid,
  "updateNote" text,
  "versionCount" integer DEFAULT 0 NOT NULL,
  "updatedByActedAs" text,
  CONSTRAINT "Resource_pkey" PRIMARY KEY (id),
  CONSTRAINT "Resource_type_check" CHECK ((type = ANY (ARRAY['link'::text, 'pdf'::text, 'doc'::text, 'image'::text, 'file'::text])))
);
ALTER TABLE public."Resource" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ResourceVersion" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "resourceId" uuid NOT NULL,
  "versionNo" integer NOT NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL,
  url text NOT NULL,
  "fileName" text,
  "fileSize" bigint,
  note text,
  "createdAt" timestamp with time zone NOT NULL,
  "createdById" uuid,
  "replacedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "replacedById" uuid,
  CONSTRAINT "ResourceVersion_pkey" PRIMARY KEY (id),
  CONSTRAINT "ResourceVersion_resourceId_versionNo_key" UNIQUE ("resourceId", "versionNo")
);
ALTER TABLE public."ResourceVersion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Scripture" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "dayNumber" integer NOT NULL,
  "imageUrl" text NOT NULL,
  "storagePath" text,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "Scripture_pkey" PRIMARY KEY (id),
  CONSTRAINT "Scripture_dayNumber_key" UNIQUE ("dayNumber") DEFERRABLE,
  CONSTRAINT "Scripture_dayNumber_check" CHECK (("dayNumber" > 0))
);
ALTER TABLE public."Scripture" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."ScriptureEngagement" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "scriptureId" uuid NOT NULL,
  "actorKind" text NOT NULL,
  "actorId" uuid NOT NULL,
  action text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ScriptureEngagement_pkey" PRIMARY KEY (id),
  CONSTRAINT "ScriptureEngagement_action_check" CHECK ((action = ANY (ARRAY['LIKE'::text, 'DOWNLOAD'::text, 'SHARE'::text]))),
  CONSTRAINT "ScriptureEngagement_actorKind_check" CHECK (("actorKind" = ANY (ARRAY['USER'::text, 'PARTICIPANT'::text])))
);
ALTER TABLE public."ScriptureEngagement" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SheetRegistration" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "fullName" text NOT NULL,
  phone text NOT NULL,
  "phoneNormalised" text,
  email text,
  "signedUpAt" timestamp with time zone DEFAULT now() NOT NULL,
  answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  "contactId" uuid,
  outcome text DEFAULT 'PENDING'::text NOT NULL,
  "outcomeDetail" text,
  "sheetRowKey" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SheetRegistration_pkey" PRIMARY KEY (id),
  CONSTRAINT "SheetRegistration_sheetRowKey_key" UNIQUE ("sheetRowKey"),
  CONSTRAINT "SheetRegistration_outcome_check" CHECK ((outcome = ANY (ARRAY['PENDING'::text, 'MATCHED'::text, 'CREATED'::text, 'DUPLICATE'::text, 'FAILED'::text])))
);
ALTER TABLE public."SheetRegistration" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SignInThrottle" (
  key text NOT NULL,
  failures integer DEFAULT 0 NOT NULL,
  "firstFailAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lockedUntil" timestamp with time zone,
  CONSTRAINT "SignInThrottle_pkey" PRIMARY KEY (key)
);
ALTER TABLE public."SignInThrottle" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportActivityCompletion" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "activityId" integer NOT NULL,
  "userId" uuid NOT NULL,
  "completedAt" timestamp with time zone DEFAULT now() NOT NULL,
  note text,
  CONSTRAINT "SupportActivityCompletion_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportActivityCompletion_activityId_userId_key" UNIQUE ("activityId", "userId")
);
ALTER TABLE public."SupportActivityCompletion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportChecklistItem" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "weekId" integer,
  label text NOT NULL,
  done boolean DEFAULT false NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "createdById" uuid,
  "taskGroupId" uuid,
  "dueDay" text,
  "completionNote" text,
  "completedAt" timestamp with time zone,
  "dueDate" date,
  "cohortId" uuid,
  CONSTRAINT "SupportChecklistItem_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportChecklistItem_userId_weekId_label_key" UNIQUE ("userId", "weekId", label),
  CONSTRAINT "SupportChecklistItem_dueDay_check" CHECK ((("dueDay" IS NULL) OR ("dueDay" = ANY (ARRAY['Monday'::text, 'Tuesday'::text, 'Wednesday'::text, 'Thursday'::text, 'Friday'::text, 'Saturday'::text, 'Sunday'::text])))),
  CONSTRAINT "SupportChecklistItem_label_check" CHECK ((length(TRIM(BOTH FROM label)) > 0)),
  CONSTRAINT "SupportChecklistItem_note_check" CHECK ((("completionNote" IS NULL) OR (char_length("completionNote") <= 500))),
  CONSTRAINT "SupportChecklistItem_week_or_date" CHECK ((("weekId" IS NOT NULL) OR (("cohortId" IS NOT NULL) AND ("dueDate" IS NOT NULL))))
);
ALTER TABLE public."SupportChecklistItem" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportClassFeedback" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "supportId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  "weekId" integer NOT NULL,
  note text,
  "isNone" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SupportClassFeedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportClassFeedback_supportId_weekId_key" UNIQUE ("supportId", "weekId")
);
ALTER TABLE public."SupportClassFeedback" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportHub" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  name text NOT NULL,
  "leadUserId" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "meetingDay" text,
  "meetingTime" text,
  "callPlatform" text,
  "callLink" text,
  "assistantLeadUserId" uuid,
  "recapLeadUserId" uuid,
  "prayerLeadUserId" uuid,
  "assistantPermissions" text[] DEFAULT ARRAY['MEETING'::text] NOT NULL,
  "recapLeadUserIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "prayerLeadUserIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  CONSTRAINT "SupportHub_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportHub_cohortId_name_key" UNIQUE ("cohortId", name),
  CONSTRAINT "SupportHub_assistantPermissions_check" CHECK (("assistantPermissions" <@ ARRAY['MEETING'::text, 'ATTENDANCE'::text, 'MESSAGE'::text, 'GROUPS'::text])),
  CONSTRAINT "SupportHub_callPlatform_check" CHECK ((("callPlatform" IS NULL) OR ("callPlatform" = ANY (ARRAY['WHATSAPP'::text, 'GOOGLE_MEET'::text]))))
);
ALTER TABLE public."SupportHub" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportNote" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "supportId" uuid NOT NULL,
  "authorId" uuid,
  "hubId" uuid,
  "noteType" text DEFAULT 'NOTE'::text NOT NULL,
  body text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SupportNote_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportNote_noteType_check" CHECK (("noteType" = ANY (ARRAY['NOTE'::text, 'ELIGIBILITY_OVERRIDE'::text])))
);
ALTER TABLE public."SupportNote" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportOnboardingOverride" (
  "groupId" uuid NOT NULL,
  step text NOT NULL,
  "setById" uuid,
  "setAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SupportOnboardingOverride_pkey" PRIMARY KEY ("groupId", step),
  CONSTRAINT "SupportOnboardingOverride_step_check" CHECK ((step = ANY (ARRAY['INTRO'::text, 'READY'::text, 'MEETING'::text])))
);
ALTER TABLE public."SupportOnboardingOverride" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportSession" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohortId" uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  "sessionDate" date DEFAULT CURRENT_DATE NOT NULL,
  "weekId" integer,
  "hubId" uuid,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  notes text,
  "submittedAt" timestamp with time zone,
  "submittedById" uuid,
  "prayerFocusFaithProjectId" uuid,
  "prayerFocusSetAt" timestamp with time zone,
  "prayedForFaithProjectIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "hubPrayerDoneAt" timestamp with time zone,
  "prayerFinishedAt" timestamp with time zone,
  "startedAt" timestamp with time zone,
  CONSTRAINT "SupportSession_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportSession_hubId_weekId_key" UNIQUE ("hubId", "weekId"),
  CONSTRAINT "SupportSession_type_check" CHECK ((type = ANY (ARRAY['SUNDAY_RECAP'::text, 'PRE_COHORT_TRAINING'::text, 'GET_TOGETHER'::text])))
);
ALTER TABLE public."SupportSession" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportSessionAttendance" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "sessionId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  status text NOT NULL,
  "markedById" uuid,
  "markedAt" timestamp with time zone DEFAULT now() NOT NULL,
  learned text,
  "learnedAt" timestamp with time zone,
  "willApply" text,
  CONSTRAINT "SupportSessionAttendance_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportSessionAttendance_sessionId_userId_key" UNIQUE ("sessionId", "userId"),
  CONSTRAINT "SupportSessionAttendance_status_check" CHECK ((status = ANY (ARRAY['PRESENT'::text, 'LATE'::text, 'ABSENT'::text, 'EXCUSED'::text])))
);
ALTER TABLE public."SupportSessionAttendance" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportTag" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  "createdById" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "systemKey" text,
  CONSTRAINT "SupportTag_pkey" PRIMARY KEY (id),
  CONSTRAINT "SupportTag_name_check" CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 40)))
);
ALTER TABLE public."SupportTag" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SupportTagMember" (
  "tagId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SupportTagMember_pkey" PRIMARY KEY ("tagId", "userId")
);
ALTER TABLE public."SupportTagMember" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Survey" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "builtinKey" text,
  title text NOT NULL,
  description text,
  audience text DEFAULT 'PARTICIPANTS'::text NOT NULL,
  scope text DEFAULT 'COHORT'::text NOT NULL,
  "cohortId" uuid,
  "targetGroupId" uuid,
  anonymous boolean DEFAULT false NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  status text DEFAULT 'DRAFT'::text NOT NULL,
  "timingMode" text DEFAULT 'DATES'::text NOT NULL,
  "opensAt" timestamp with time zone,
  "closesAt" timestamp with time zone,
  "weeksBeforeEnd" integer,
  "closeDaysAfterEnd" integer,
  "notifyOnOpen" boolean DEFAULT false NOT NULL,
  "homeHeading" text,
  "homeLine" text,
  "homeButton" text,
  "aiSummary" text,
  "aiSummaryAt" timestamp with time zone,
  "createdBy" uuid,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "targetHubId" uuid,
  "targetLabelId" uuid,
  "weeksAfterStart" integer,
  "openForDays" integer,
  CONSTRAINT "Survey_pkey" PRIMARY KEY (id),
  CONSTRAINT "Survey_builtinKey_key" UNIQUE ("builtinKey"),
  CONSTRAINT "Survey_audience_check" CHECK ((audience = ANY (ARRAY['PARTICIPANTS'::text, 'SUPPORTS'::text, 'EVERYONE'::text]))),
  CONSTRAINT "Survey_check" CHECK (((scope = 'GENERAL'::text) OR ("cohortId" IS NOT NULL))),
  CONSTRAINT "Survey_scope_check" CHECK ((scope = ANY (ARRAY['COHORT'::text, 'GENERAL'::text]))),
  CONSTRAINT "Survey_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text]))),
  CONSTRAINT "Survey_timingMode_check" CHECK (("timingMode" = ANY (ARRAY['DATES'::text, 'WEEKS_BEFORE_END'::text, 'WEEKS_AFTER_START'::text])))
);
ALTER TABLE public."Survey" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SurveyAnswerSet" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "surveyId" uuid NOT NULL,
  "respondentKey" text,
  "cohortId" uuid,
  answers jsonb NOT NULL,
  "submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "submittedOn" date DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT "SurveyAnswerSet_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."SurveyAnswerSet" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SurveyNotified" (
  "surveyId" uuid NOT NULL,
  "cohortKey" text NOT NULL,
  "notifiedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SurveyNotified_pkey" PRIMARY KEY ("surveyId", "cohortKey")
);
ALTER TABLE public."SurveyNotified" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SurveyQuestion" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "surveyId" uuid NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  kind text NOT NULL,
  prompt text NOT NULL,
  required boolean DEFAULT true NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY (id),
  CONSTRAINT "SurveyQuestion_kind_check" CHECK ((kind = ANY (ARRAY['TEXT'::text, 'TEXTAREA'::text, 'NUMBER'::text, 'RATING'::text, 'FILE'::text, 'DEPARTMENT'::text, 'YESNO'::text])))
);
ALTER TABLE public."SurveyQuestion" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."SurveySubmission" (
  "surveyId" uuid NOT NULL,
  "respondentKey" text NOT NULL,
  "submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "SurveySubmission_pkey" PRIMARY KEY ("surveyId", "respondentKey")
);
ALTER TABLE public."SurveySubmission" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Team" (
  id integer DEFAULT nextval('"Team_id_seq"'::regclass) NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY (id),
  CONSTRAINT "Team_name_key" UNIQUE (name)
);
ALTER TABLE public."Team" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."TelegramLink" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "chatId" bigint NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  "blockedAt" timestamp with time zone,
  "linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "TelegramLink_pkey" PRIMARY KEY (id),
  CONSTRAINT "TelegramLink_userId_key" UNIQUE ("userId")
);
ALTER TABLE public."TelegramLink" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."TelegramLinkCode" (
  code text NOT NULL,
  "ownerKind" text NOT NULL,
  "ownerId" uuid NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "TelegramLinkCode_pkey" PRIMARY KEY (code),
  CONSTRAINT "TelegramLinkCode_ownerKind_check" CHECK (("ownerKind" = ANY (ARRAY['USER'::text, 'PARTICIPANT'::text])))
);
ALTER TABLE public."TelegramLinkCode" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Testimony" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "participantId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  "groupId" uuid,
  title text,
  body text NOT NULL,
  visibility text DEFAULT 'SUPPORT'::text NOT NULL,
  status text DEFAULT 'PENDING'::text NOT NULL,
  "reviewedById" uuid,
  "reviewedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "viewedAt" timestamp with time zone,
  "viewedById" uuid,
  "reviewedByActedAs" text,
  CONSTRAINT "Testimony_pkey" PRIMARY KEY (id),
  CONSTRAINT "Testimony_body_check" CHECK ((length(TRIM(BOTH FROM body)) > 0)),
  CONSTRAINT "Testimony_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'HIDDEN'::text]))),
  CONSTRAINT "Testimony_visibility_check" CHECK ((visibility = ANY (ARRAY['SUPPORT'::text, 'GROUP'::text, 'COHORT'::text])))
);
ALTER TABLE public."Testimony" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."TourProgress" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid,
  "participantId" uuid,
  "tourKey" text NOT NULL,
  "seenAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "TourProgress_pkey" PRIMARY KEY (id),
  CONSTRAINT "TourProgress_one_actor" CHECK ((("userId" IS NULL) <> ("participantId" IS NULL)))
);
ALTER TABLE public."TourProgress" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."User" (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text,
  name text NOT NULL,
  password_hash text NOT NULL,
  role "Role" DEFAULT 'SUPPORT'::"Role",
  "createdAt" timestamp without time zone DEFAULT now(),
  "updatedAt" timestamp without time zone DEFAULT now(),
  "onboardingCompleted" boolean DEFAULT false NOT NULL,
  "onboardingReplayCount" integer DEFAULT 0 NOT NULL,
  "onboardingLastReplayAt" timestamp(3) without time zone,
  phone text,
  "isCoordinator" boolean DEFAULT false NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "deactivatedAt" timestamp with time zone,
  "avatarUrl" text,
  "themeColor" text,
  "hubLastSeenAt" timestamp with time zone,
  "whatsappGroupUrl" text,
  "mustChangePassword" boolean DEFAULT false NOT NULL,
  gender text,
  "ageRange" text,
  birthday text,
  "isTest" boolean DEFAULT false NOT NULL,
  roles "Role"[] DEFAULT '{}'::"Role"[] NOT NULL,
  "birthYear" smallint,
  CONSTRAINT "User_pkey" PRIMARY KEY (id),
  CONSTRAINT "User_email_key" UNIQUE (email),
  CONSTRAINT "User_birthYear_check" CHECK ((("birthYear" IS NULL) OR (("birthYear" >= 1900) AND ("birthYear" <= 2100)))),
  CONSTRAINT user_birthday_format CHECK (((birthday IS NULL) OR (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)))
);
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."UserAppState" (
  "userId" uuid NOT NULL,
  "installedAt" timestamp with time zone,
  "lastOpenedInstalledAt" timestamp with time zone,
  device text,
  "notificationState" text,
  "sheetShown" integer DEFAULT 0 NOT NULL,
  "sheetDismissed" integer DEFAULT 0 NOT NULL,
  "lastSheetAt" timestamp with time zone,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "UserAppState_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE public."UserAppState" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."UserCohort" (
  "userId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "supportKind" text DEFAULT 'PARTICIPANT_SUPPORT'::text NOT NULL,
  CONSTRAINT "UserCohort_pkey" PRIMARY KEY ("userId", "cohortId"),
  CONSTRAINT "UserCohort_supportKind_check" CHECK (("supportKind" = ANY (ARRAY['PARTICIPANT_SUPPORT'::text, 'HUB_LEAD'::text, 'OPERATIONAL'::text])))
);
ALTER TABLE public."UserCohort" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."UserLabel" (
  "userId" uuid NOT NULL,
  "labelId" uuid NOT NULL,
  CONSTRAINT "UserLabel_pkey" PRIMARY KEY ("userId", "labelId")
);
ALTER TABLE public."UserLabel" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."UserNotificationSetting" (
  "userId" uuid NOT NULL,
  "remindBeforeMinutes" jsonb DEFAULT '[60]'::jsonb NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "UserNotificationSetting_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE public."UserNotificationSetting" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."UserPermissionRole" (
  "userId" uuid NOT NULL,
  "roleId" uuid NOT NULL,
  CONSTRAINT "UserPermissionRole_pkey" PRIMARY KEY ("userId", "roleId")
);
ALTER TABLE public."UserPermissionRole" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."WebsiteSectionChange" (
  section text NOT NULL,
  "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "changedById" uuid,
  CONSTRAINT "WebsiteSectionChange_pkey" PRIMARY KEY (section)
);
ALTER TABLE public."WebsiteSectionChange" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."Week" (
  id integer DEFAULT nextval('"Week_id_seq"'::regclass) NOT NULL,
  "weekNumber" integer NOT NULL,
  "cohortId" uuid NOT NULL,
  title text,
  "recapSummary" text,
  "discussionPrompt" text,
  "recapDocumentUrl" text,
  "recapDocumentName" text,
  "shareWithParticipants" boolean DEFAULT true NOT NULL,
  expectations text,
  "participantReleasedEarlyAt" timestamp with time zone,
  "manualDocumentUrl" text,
  "manualDocumentName" text,
  "manualSummary" text,
  "manualDiscussionPrompt" text,
  "manualReleasedEarlyAt" timestamp with time zone,
  "classDate" date,
  "teenRecapSummary" text,
  "teenDiscussionPrompt" text,
  "teenRecapDocumentUrl" text,
  "teenRecapDocumentName" text,
  "teenRecapReleaseAt" timestamp with time zone,
  "teacherName" text,
  "teacherRole" text,
  "teacherBio" text,
  "teacherPhotoUrl" text,
  "classGraphicUrl" text,
  "teenTeacherName" text,
  "teenTeacherRole" text,
  "teenTeacherBio" text,
  "teenTeacherPhotoUrl" text,
  CONSTRAINT "Week_pkey" PRIMARY KEY (id),
  CONSTRAINT "Week_cohortId_weekNumber_key" UNIQUE ("cohortId", "weekNumber")
);
ALTER TABLE public."Week" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remind_before_minutes integer[] DEFAULT '{60}'::integer[] NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  CONSTRAINT notification_settings_pkey PRIMARY KEY (id)
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Foreign keys ---------------------------------------------------------------------------------------------
ALTER TABLE public."AbsenceReviewDone" ADD CONSTRAINT "AbsenceReviewDone_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."AbsenceReviewDone" ADD CONSTRAINT "AbsenceReviewDone_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE SET NULL;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AbsenceReviewMove" ADD CONSTRAINT "AbsenceReviewMove_undoneById_fkey" FOREIGN KEY ("undoneById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Activity" ADD CONSTRAINT "Activity_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"(id) ON DELETE CASCADE;
ALTER TABLE public."Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET DEFAULT;
ALTER TABLE public."ActivityLabel" ADD CONSTRAINT "ActivityLabel_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"(id) ON DELETE CASCADE;
ALTER TABLE public."ActivityLabel" ADD CONSTRAINT "ActivityLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"(id) ON DELETE CASCADE;
ALTER TABLE public."ActivityTeam" ADD CONSTRAINT "ActivityTeam_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."ActivityTeam" ADD CONSTRAINT "ActivityTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_sentBy_fkey" FOREIGN KEY ("sentBy") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetHubId_fkey" FOREIGN KEY ("targetHubId") REFERENCES "SupportHub"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetLabelId_fkey" FOREIGN KEY ("targetLabelId") REFERENCES "Label"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetParticipantId_fkey" FOREIGN KEY ("targetParticipantId") REFERENCES "Participant"(id) ON DELETE SET NULL;
ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AnnouncementPopup" ADD CONSTRAINT "AnnouncementPopup_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"(id) ON DELETE CASCADE;
ALTER TABLE public."AnnouncementPopup" ADD CONSTRAINT "AnnouncementPopup_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AnnouncementPopup" ADD CONSTRAINT "AnnouncementPopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."ApiClient" ADD CONSTRAINT "ApiClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ApiClient"(id) ON DELETE SET NULL;
ALTER TABLE public."AppNudgeLog" ADD CONSTRAINT "AppNudgeLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."AppNudgeSend" ADD CONSTRAINT "AppNudgeSend_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."AppNudgeSend" ADD CONSTRAINT "AppNudgeSend_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AppSession" ADD CONSTRAINT "AppSession_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceExcusal" ADD CONSTRAINT "AttendanceExcusal_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceExcusal" ADD CONSTRAINT "AttendanceExcusal_excusedById_fkey" FOREIGN KEY ("excusedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceFollowUpTask" ADD CONSTRAINT "AttendanceFollowUpTask_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceFollowUpTask" ADD CONSTRAINT "AttendanceFollowUpTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceFollowUpTask" ADD CONSTRAINT "AttendanceFollowUpTask_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceFollowUpTask" ADD CONSTRAINT "AttendanceFollowUpTask_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceFollowUpTask" ADD CONSTRAINT "AttendanceFollowUpTask_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_lateExcusedById_fkey" FOREIGN KEY ("lateExcusedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."AttendanceSession" ADD CONSTRAINT "AttendanceSession_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceSession" ADD CONSTRAINT "AttendanceSession_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceSession" ADD CONSTRAINT "AttendanceSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."AttendanceSession" ADD CONSTRAINT "AttendanceSession_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."ChurchEvent" ADD CONSTRAINT "ChurchEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ClassSignal" ADD CONSTRAINT "ClassSignal_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."Cohort10FollowUpRepairLedger" ADD CONSTRAINT "Cohort10FollowUpRepairLedger_sourceCohortId_fkey" FOREIGN KEY ("sourceCohortId") REFERENCES "Cohort"(id);
ALTER TABLE public."Cohort10FollowUpRepairLedger" ADD CONSTRAINT "Cohort10FollowUpRepairLedger_targetCohortId_fkey" FOREIGN KEY ("targetCohortId") REFERENCES "Cohort"(id);
ALTER TABLE public."CohortCheckup" ADD CONSTRAINT "CohortCheckup_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerCheckin" ADD CONSTRAINT "CorporatePrayerCheckin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CorporatePrayerSession"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerCycle" ADD CONSTRAINT "CorporatePrayerCycle_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerSession" ADD CONSTRAINT "CorporatePrayerSession_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CorporatePrayerSlot"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerSession" ADD CONSTRAINT "CorporatePrayerSession_verseId_fkey" FOREIGN KEY ("verseId") REFERENCES "CorporatePrayerVerse"(id) ON DELETE SET NULL;
ALTER TABLE public."CorporatePrayerSetting" ADD CONSTRAINT "CorporatePrayerSetting_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerSkip" ADD CONSTRAINT "CorporatePrayerSkip_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerSlot" ADD CONSTRAINT "CorporatePrayerSlot_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerTarget" ADD CONSTRAINT "CorporatePrayerTarget_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerTarget" ADD CONSTRAINT "CorporatePrayerTarget_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CorporatePrayerSession"(id) ON DELETE CASCADE;
ALTER TABLE public."CorporatePrayerWallPost" ADD CONSTRAINT "CorporatePrayerWallPost_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CorporatePrayerSession"(id) ON DELETE CASCADE;
ALTER TABLE public."CoverRequest" ADD CONSTRAINT "CoverRequest_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."CoverRequest" ADD CONSTRAINT "CoverRequest_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE SET NULL;
ALTER TABLE public."CoverRequest" ADD CONSTRAINT "CoverRequest_coverSupportId_fkey" FOREIGN KEY ("coverSupportId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."CoverRequest" ADD CONSTRAINT "CoverRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."CoverRequest" ADD CONSTRAINT "CoverRequest_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."Day" ADD CONSTRAINT "Day_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."DepartmentReferral" ADD CONSTRAINT "DepartmentReferral_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."DepartmentReferral" ADD CONSTRAINT "DepartmentReferral_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."DepartmentReferral" ADD CONSTRAINT "DepartmentReferral_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."EscalationNotice" ADD CONSTRAINT "EscalationNotice_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithHelpRequest" ADD CONSTRAINT "FaithHelpRequest_faithProjectId_fkey" FOREIGN KEY ("faithProjectId") REFERENCES "FaithProject"(id) ON DELETE SET NULL;
ALTER TABLE public."FaithHelpRequest" ADD CONSTRAINT "FaithHelpRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithHelpRequest" ADD CONSTRAINT "FaithHelpRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FaithProject" ADD CONSTRAINT "FaithProject_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FaithProjectCategory"(id) ON DELETE RESTRICT;
ALTER TABLE public."FaithProject" ADD CONSTRAINT "FaithProject_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithProject" ADD CONSTRAINT "FaithProject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FaithProjectCategory" ADD CONSTRAINT "FaithProjectCategory_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithProjectSetting" ADD CONSTRAINT "FaithProjectSetting_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithProjectVersion" ADD CONSTRAINT "FaithProjectVersion_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithProjectVersion" ADD CONSTRAINT "FaithProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FaithProject"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithProjectVersion" ADD CONSTRAINT "FaithProjectVersion_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FaithThreadRead" ADD CONSTRAINT "FaithThreadRead_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."FaithThreadRead" ADD CONSTRAINT "FaithThreadRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."FeedbackThemes" ADD CONSTRAINT "FeedbackThemes_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_formQuestionAnsweredById_fkey" FOREIGN KEY ("formQuestionAnsweredById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_guardianConsentById_fkey" FOREIGN KEY ("guardianConsentById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_manualRegistrationBy_fkey" FOREIGN KEY ("manualRegistrationBy") REFERENCES "User"(id);
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpIssue" ADD CONSTRAINT "FollowUpIssue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpIssue" ADD CONSTRAINT "FollowUpIssue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpIssue" ADD CONSTRAINT "FollowUpIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpIssueContact" ADD CONSTRAINT "FollowUpIssueContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpIssueContact" ADD CONSTRAINT "FollowUpIssueContact_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "FollowUpIssue"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpLoginIssue" ADD CONSTRAINT "FollowUpLoginIssue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpLoginIssue" ADD CONSTRAINT "FollowUpLoginIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpLoginIssue" ADD CONSTRAINT "FollowUpLoginIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpNoteHistory" ADD CONSTRAINT "FollowUpNoteHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpNoteHistory" ADD CONSTRAINT "FollowUpNoteHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpOwnerCheck" ADD CONSTRAINT "FollowUpOwnerCheck_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpOwnerReminderLog" ADD CONSTRAINT "FollowUpOwnerReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpReassignmentLog" ADD CONSTRAINT "FollowUpReassignmentLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE CASCADE;
ALTER TABLE public."FollowUpReassignmentLog" ADD CONSTRAINT "FollowUpReassignmentLog_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."FollowUpReassignmentLog" ADD CONSTRAINT "FollowUpReassignmentLog_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Group" ADD CONSTRAINT "Group_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Group" ADD CONSTRAINT "Group_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."Group" ADD CONSTRAINT "Group_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupDiscussionSeen" ADD CONSTRAINT "GroupDiscussionSeen_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupDiscussionSeen" ADD CONSTRAINT "GroupDiscussionSeen_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupDiscussionSeen" ADD CONSTRAINT "GroupDiscussionSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupMeetingReopen" ADD CONSTRAINT "GroupMeetingReopen_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupMeetingReopen" ADD CONSTRAINT "GroupMeetingReopen_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupOnboardingStatus" ADD CONSTRAINT "GroupOnboardingStatus_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupOnboardingStatus" ADD CONSTRAINT "GroupOnboardingStatus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupParticipant" ADD CONSTRAINT "GroupParticipant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupParticipant" ADD CONSTRAINT "GroupParticipant_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPost" ADD CONSTRAINT "GroupPost_authorParticipantId_fkey" FOREIGN KEY ("authorParticipantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPost" ADD CONSTRAINT "GroupPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPost" ADD CONSTRAINT "GroupPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPost" ADD CONSTRAINT "GroupPost_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPost" ADD CONSTRAINT "GroupPost_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPostLike" ADD CONSTRAINT "GroupPostLike_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostLike" ADD CONSTRAINT "GroupPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostLike" ADD CONSTRAINT "GroupPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReply" ADD CONSTRAINT "GroupPostReply_authorParticipantId_fkey" FOREIGN KEY ("authorParticipantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReply" ADD CONSTRAINT "GroupPostReply_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReply" ADD CONSTRAINT "GroupPostReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReply" ADD CONSTRAINT "GroupPostReply_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPostReport" ADD CONSTRAINT "GroupPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupPost"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReport" ADD CONSTRAINT "GroupPostReport_reporterParticipantId_fkey" FOREIGN KEY ("reporterParticipantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPostReport" ADD CONSTRAINT "GroupPostReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPrayer" ADD CONSTRAINT "GroupPrayer_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayer" ADD CONSTRAINT "GroupPrayer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPrayer" ADD CONSTRAINT "GroupPrayer_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayerFocus" ADD CONSTRAINT "GroupPrayerFocus_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayerFocus" ADD CONSTRAINT "GroupPrayerFocus_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayerFocus" ADD CONSTRAINT "GroupPrayerFocus_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPrayerFocus" ADD CONSTRAINT "GroupPrayerFocus_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayerStatus" ADD CONSTRAINT "GroupPrayerStatus_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."GroupPrayerStatus" ADD CONSTRAINT "GroupPrayerStatus_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."GroupPrayerStatus" ADD CONSTRAINT "GroupPrayerStatus_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."HubComment" ADD CONSTRAINT "HubComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id);
ALTER TABLE public."HubComment" ADD CONSTRAINT "HubComment_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "HubTopic"(id) ON DELETE CASCADE;
ALTER TABLE public."HubItSupport" ADD CONSTRAINT "HubItSupport_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."HubItSupport" ADD CONSTRAINT "HubItSupport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubLeadsMeeting" ADD CONSTRAINT "HubLeadsMeeting_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."HubLeadsMeeting" ADD CONSTRAINT "HubLeadsMeeting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."HubMembership" ADD CONSTRAINT "HubMembership_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."HubMembership" ADD CONSTRAINT "HubMembership_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."HubMembership" ADD CONSTRAINT "HubMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubMessage" ADD CONSTRAINT "HubMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."HubMessage" ADD CONSTRAINT "HubMessage_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."HubMessageAck" ADD CONSTRAINT "HubMessageAck_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "HubMessage"(id) ON DELETE CASCADE;
ALTER TABLE public."HubMessageAck" ADD CONSTRAINT "HubMessageAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubPersonOfInterest" ADD CONSTRAINT "HubPersonOfInterest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."HubPersonOfInterest" ADD CONSTRAINT "HubPersonOfInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubReaction" ADD CONSTRAINT "HubReaction_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "HubTopic"(id) ON DELETE CASCADE;
ALTER TABLE public."HubReaction" ADD CONSTRAINT "HubReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubReply" ADD CONSTRAINT "HubReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id);
ALTER TABLE public."HubReply" ADD CONSTRAINT "HubReply_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "HubComment"(id) ON DELETE CASCADE;
ALTER TABLE public."HubRoleIntroSeen" ADD CONSTRAINT "HubRoleIntroSeen_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."HubRoleIntroSeen" ADD CONSTRAINT "HubRoleIntroSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."HubTopic" ADD CONSTRAINT "HubTopic_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id);
ALTER TABLE public."Label" ADD CONSTRAINT "Label_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."Label" ADD CONSTRAINT "Label_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."ManualNote" ADD CONSTRAINT "ManualNote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ManualNote" ADD CONSTRAINT "ManualNote_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"(id);
ALTER TABLE public."ManualQuestion" ADD CONSTRAINT "ManualQuestion_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."MeetingRecordingOpening" ADD CONSTRAINT "MeetingRecordingOpening_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."MeetingRecordingOpening" ADD CONSTRAINT "MeetingRecordingOpening_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."MeetingRecordingOpening" ADD CONSTRAINT "MeetingRecordingOpening_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."MeetingRecordingOpening" ADD CONSTRAINT "MeetingRecordingOpening_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE SET NULL;
ALTER TABLE public."Participant" ADD CONSTRAINT "Participant_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE SET NULL;
ALTER TABLE public."Participant" ADD CONSTRAINT "Participant_followUpContactId_fkey" FOREIGN KEY ("followUpContactId") REFERENCES "FollowUpContact"(id) ON DELETE SET NULL;
ALTER TABLE public."Participant" ADD CONSTRAINT "Participant_retakeCheckedById_fkey" FOREIGN KEY ("retakeCheckedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantAccount" ADD CONSTRAINT "ParticipantAccount_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantAccount" ADD CONSTRAINT "ParticipantAccount_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantAppSetupCompletion" ADD CONSTRAINT "ParticipantAppSetupCompletion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantAppSetupCompletion" ADD CONSTRAINT "ParticipantAppSetupCompletion_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantAppState" ADD CONSTRAINT "ParticipantAppState_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantCheckIn" ADD CONSTRAINT "ParticipantCheckIn_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantCheckIn" ADD CONSTRAINT "ParticipantCheckIn_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantClassFeedback" ADD CONSTRAINT "ParticipantClassFeedback_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantClassFeedback" ADD CONSTRAINT "ParticipantClassFeedback_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantClassFeedback" ADD CONSTRAINT "ParticipantClassFeedback_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantClassFeedbackDone" ADD CONSTRAINT "ParticipantClassFeedbackDone_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantClassFeedbackDone" ADD CONSTRAINT "ParticipantClassFeedbackDone_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantFlag" ADD CONSTRAINT "ParticipantFlag_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantFlag" ADD CONSTRAINT "ParticipantFlag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantFlag" ADD CONSTRAINT "ParticipantFlag_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantFlag" ADD CONSTRAINT "ParticipantFlag_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantFlag" ADD CONSTRAINT "ParticipantFlag_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_faithProjectUpdatedById_fkey" FOREIGN KEY ("faithProjectUpdatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_fromSupportId_fkey" FOREIGN KEY ("fromSupportId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantHandover" ADD CONSTRAINT "ParticipantHandover_toSupportId_fkey" FOREIGN KEY ("toSupportId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantLoginPhone" ADD CONSTRAINT "ParticipantLoginPhone_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantLoginPhone" ADD CONSTRAINT "ParticipantLoginPhone_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantNote" ADD CONSTRAINT "ParticipantNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantNote" ADD CONSTRAINT "ParticipantNote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantNote" ADD CONSTRAINT "ParticipantNote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantNote" ADD CONSTRAINT "ParticipantNote_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantNotification" ADD CONSTRAINT "ParticipantNotification_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantOnboarding" ADD CONSTRAINT "ParticipantOnboarding_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantOnboardingStatus" ADD CONSTRAINT "ParticipantOnboardingStatus_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantOnboardingStatus" ADD CONSTRAINT "ParticipantOnboardingStatus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantPushSubscription" ADD CONSTRAINT "ParticipantPushSubscription_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantReadyStep" ADD CONSTRAINT "ParticipantReadyStep_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantReminderLog" ADD CONSTRAINT "ParticipantReminderLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantReminderSetting" ADD CONSTRAINT "ParticipantReminderSetting_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantStageChange" ADD CONSTRAINT "ParticipantStageChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ParticipantStageChange" ADD CONSTRAINT "ParticipantStageChange_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantTelegramLink" ADD CONSTRAINT "ParticipantTelegramLink_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantThreadRead" ADD CONSTRAINT "ParticipantThreadRead_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."ParticipantWrapUp" ADD CONSTRAINT "ParticipantWrapUp_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."PendingChange" ADD CONSTRAINT "PendingChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."PendingChange" ADD CONSTRAINT "PendingChange_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."PermissionRoleModule" ADD CONSTRAINT "PermissionRoleModule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PermissionRole"(id) ON DELETE CASCADE;
ALTER TABLE public."PlannerChange" ADD CONSTRAINT "PlannerChange_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."PlannerChange" ADD CONSTRAINT "PlannerChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."PlannerChange" ADD CONSTRAINT "PlannerChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ChurchEvent"(id) ON DELETE SET NULL;
ALTER TABLE public."PlannerChange" ADD CONSTRAINT "PlannerChange_undoneById_fkey" FOREIGN KEY ("undoneById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."PracticeMember" ADD CONSTRAINT "PracticeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."PracticePeer" ADD CONSTRAINT "PracticePeer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."PracticePeer" ADD CONSTRAINT "PracticePeer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."PracticeProgress" ADD CONSTRAINT "PracticeProgress_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."PracticeProgress" ADD CONSTRAINT "PracticeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."ProfileField" ADD CONSTRAINT "ProfileField_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ProfileFieldAnswer" ADD CONSTRAINT "ProfileFieldAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProfileField"(id) ON DELETE CASCADE;
ALTER TABLE public."ProfileFieldAnswer" ADD CONSTRAINT "ProfileFieldAnswer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."PushReminderLog" ADD CONSTRAINT "PushReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."RecapRelease" ADD CONSTRAINT "RecapRelease_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."RecapRelease" ADD CONSTRAINT "RecapRelease_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."RecapRelease" ADD CONSTRAINT "RecapRelease_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."Reflection" ADD CONSTRAINT "Reflection_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."Reflection" ADD CONSTRAINT "Reflection_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."ReflectionSummary" ADD CONSTRAINT "ReflectionSummary_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."RejectedChange" ADD CONSTRAINT "RejectedChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."RejectedChange" ADD CONSTRAINT "RejectedChange_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."Resource" ADD CONSTRAINT "Resource_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Resource" ADD CONSTRAINT "Resource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ResourceVersion" ADD CONSTRAINT "ResourceVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ResourceVersion" ADD CONSTRAINT "ResourceVersion_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ResourceVersion" ADD CONSTRAINT "ResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"(id) ON DELETE CASCADE;
ALTER TABLE public."Scripture" ADD CONSTRAINT "Scripture_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."ScriptureEngagement" ADD CONSTRAINT "ScriptureEngagement_scriptureId_fkey" FOREIGN KEY ("scriptureId") REFERENCES "Scripture"(id) ON DELETE CASCADE;
ALTER TABLE public."SheetRegistration" ADD CONSTRAINT "SheetRegistration_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FollowUpContact"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportActivityCompletion" ADD CONSTRAINT "SupportActivityCompletion_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportActivityCompletion" ADD CONSTRAINT "SupportActivityCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportClassFeedback" ADD CONSTRAINT "SupportClassFeedback_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportClassFeedback" ADD CONSTRAINT "SupportClassFeedback_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportClassFeedback" ADD CONSTRAINT "SupportClassFeedback_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_assistantLeadUserId_fkey" FOREIGN KEY ("assistantLeadUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_prayerLeadUserId_fkey" FOREIGN KEY ("prayerLeadUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_recapLeadUserId_fkey" FOREIGN KEY ("recapLeadUserId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportNote" ADD CONSTRAINT "SupportNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportNote" ADD CONSTRAINT "SupportNote_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportNote" ADD CONSTRAINT "SupportNote_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportOnboardingOverride" ADD CONSTRAINT "SupportOnboardingOverride_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportOnboardingOverride" ADD CONSTRAINT "SupportOnboardingOverride_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SupportHub"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_prayerFocusFaithProjectId_fkey" FOREIGN KEY ("prayerFocusFaithProjectId") REFERENCES "FaithProject"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportSession" ADD CONSTRAINT "SupportSession_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportSessionAttendance" ADD CONSTRAINT "SupportSessionAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportSessionAttendance" ADD CONSTRAINT "SupportSessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SupportSession"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportSessionAttendance" ADD CONSTRAINT "SupportSessionAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportTag" ADD CONSTRAINT "SupportTag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."SupportTagMember" ADD CONSTRAINT "SupportTagMember_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SupportTag"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportTagMember" ADD CONSTRAINT "SupportTagMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."Survey" ADD CONSTRAINT "Survey_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."Survey" ADD CONSTRAINT "Survey_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."Survey" ADD CONSTRAINT "Survey_targetHubId_fkey" FOREIGN KEY ("targetHubId") REFERENCES "SupportHub"(id) ON DELETE SET NULL;
ALTER TABLE public."Survey" ADD CONSTRAINT "Survey_targetLabelId_fkey" FOREIGN KEY ("targetLabelId") REFERENCES "Label"(id) ON DELETE SET NULL;
ALTER TABLE public."SurveyAnswerSet" ADD CONSTRAINT "SurveyAnswerSet_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE public."SurveyNotified" ADD CONSTRAINT "SurveyNotified_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE public."SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE public."SurveySubmission" ADD CONSTRAINT "SurveySubmission_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE public."TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."Testimony" ADD CONSTRAINT "Testimony_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."Testimony" ADD CONSTRAINT "Testimony_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"(id) ON DELETE SET NULL;
ALTER TABLE public."Testimony" ADD CONSTRAINT "Testimony_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."Testimony" ADD CONSTRAINT "Testimony_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Testimony" ADD CONSTRAINT "Testimony_viewedById_fkey" FOREIGN KEY ("viewedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."TourProgress" ADD CONSTRAINT "TourProgress_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"(id) ON DELETE CASCADE;
ALTER TABLE public."TourProgress" ADD CONSTRAINT "TourProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."UserAppState" ADD CONSTRAINT "UserAppState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."UserCohort" ADD CONSTRAINT "UserCohort_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."UserCohort" ADD CONSTRAINT "UserCohort_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."UserLabel" ADD CONSTRAINT "UserLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"(id) ON DELETE CASCADE;
ALTER TABLE public."UserLabel" ADD CONSTRAINT "UserLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."UserNotificationSetting" ADD CONSTRAINT "UserNotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."UserPermissionRole" ADD CONSTRAINT "UserPermissionRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PermissionRole"(id) ON DELETE CASCADE;
ALTER TABLE public."UserPermissionRole" ADD CONSTRAINT "UserPermissionRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE public."WebsiteSectionChange" ADD CONSTRAINT "WebsiteSectionChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE public."Week" ADD CONSTRAINT "Week_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes --------------------------------------------------------------------------------------------------
CREATE INDEX absence_review_move_cohort_idx ON public."AbsenceReviewMove" USING btree ("cohortId");
CREATE INDEX idx_activity_day ON public."Activity" USING btree ("dayId");
CREATE INDEX idx_activity_day_order ON public."Activity" USING btree ("dayId", "orderIndex");
CREATE INDEX idx_activitylabel_activity ON public."ActivityLabel" USING btree ("activityId");
CREATE INDEX idx_activitylabel_label ON public."ActivityLabel" USING btree ("labelId");
CREATE INDEX "ActivityTeam_activityId_idx" ON public."ActivityTeam" USING btree ("activityId");
CREATE INDEX "ActivityTeam_teamId_idx" ON public."ActivityTeam" USING btree ("teamId");
CREATE INDEX idx_announcement_cohort ON public."Announcement" USING btree ("cohortId");
CREATE INDEX idx_announcement_home ON public."Announcement" USING btree ("showOnHome", "homeUntil");
CREATE INDEX idx_announcement_target_group ON public."Announcement" USING btree ("targetGroupId");
CREATE INDEX idx_announcement_target_label ON public."Announcement" USING btree ("targetLabelId");
CREATE INDEX idx_announcement_target_participant ON public."Announcement" USING btree ("targetParticipantId");
CREATE INDEX idx_announcement_target_user ON public."Announcement" USING btree ("targetUserId");
CREATE INDEX announcement_popup_open_participant ON public."AnnouncementPopup" USING btree ("participantId") WHERE ("ackedAt" IS NULL);
CREATE INDEX announcement_popup_open_user ON public."AnnouncementPopup" USING btree ("userId") WHERE ("ackedAt" IS NULL);
CREATE UNIQUE INDEX announcement_popup_participant ON public."AnnouncementPopup" USING btree ("announcementId", "participantId") WHERE ("participantId" IS NOT NULL);
CREATE UNIQUE INDEX announcement_popup_user ON public."AnnouncementPopup" USING btree ("announcementId", "userId") WHERE ("userId" IS NOT NULL);
CREATE INDEX "ApiRequestLog_client_time" ON public."ApiRequestLog" USING btree ("clientId", "createdAt" DESC);
CREATE INDEX idx_appsession_participant ON public."AppSession" USING btree ("participantId");
CREATE INDEX idx_appsession_user ON public."AppSession" USING btree ("userId");
CREATE INDEX idx_attendance_follow_up_support_week ON public."AttendanceFollowUpTask" USING btree ("supportId", "weekId", status);
CREATE INDEX idx_attendance_follow_up_week ON public."AttendanceFollowUpTask" USING btree ("weekId", status);
CREATE INDEX idx_attendance_participant ON public."AttendanceRecord" USING btree ("participantId");
CREATE INDEX idx_attendance_week ON public."AttendanceRecord" USING btree ("weekId");
CREATE INDEX idx_attendance_session_finalized ON public."AttendanceSession" USING btree ("finalizedAt");
CREATE INDEX "ChurchEvent_dates_idx" ON public."ChurchEvent" USING btree ("startDate", "endDate");
CREATE UNIQUE INDEX cohort_only_one_practice ON public."Cohort" USING btree ((true)) WHERE "isPractice";
CREATE INDEX idx_prayer_session_cohort_date ON public."CorporatePrayerSession" USING btree ("cohortId", "prayerDate");
CREATE INDEX idx_prayer_target_cycle ON public."CorporatePrayerTarget" USING btree ("cohortId", pool, "cycleNo", "participantId");
CREATE INDEX idx_prayer_target_day ON public."CorporatePrayerTarget" USING btree ("cohortId", pool, "prayerDate");
CREATE UNIQUE INDEX uniq_prayer_verse_title ON public."CorporatePrayerVerse" USING btree (lower(btrim(title)));
CREATE INDEX idx_prayerwall_session_target ON public."CorporatePrayerWallPost" USING btree ("sessionId", "targetId", "createdAt");
CREATE INDEX idx_coverrequest_cover_support ON public."CoverRequest" USING btree ("coverSupportId", "startsAt", "endsAt");
CREATE INDEX idx_coverrequest_status ON public."CoverRequest" USING btree (status, "createdAt" DESC);
CREATE INDEX idx_coverrequest_support ON public."CoverRequest" USING btree ("supportId", "createdAt" DESC);
CREATE INDEX idx_day_week ON public."Day" USING btree ("weekId");
CREATE INDEX idx_departmentreferral_open ON public."DepartmentReferral" USING btree ("loggedAt") WHERE (status = 'LOGGED'::text);
CREATE INDEX idx_departmentreferral_participant ON public."DepartmentReferral" USING btree ("participantId");
CREATE INDEX idx_escalationnotice_cohort ON public."EscalationNotice" USING btree ("cohortId");
CREATE INDEX idx_faithhelprequest_open ON public."FaithHelpRequest" USING btree ("createdAt" DESC) WHERE ("resolvedAt" IS NULL);
CREATE INDEX idx_faithhelprequest_participant ON public."FaithHelpRequest" USING btree ("participantId", "createdAt" DESC);
CREATE INDEX idx_faithproject_category ON public."FaithProject" USING btree ("categoryId");
CREATE INDEX idx_faithproject_participant ON public."FaithProject" USING btree ("participantId");
CREATE INDEX idx_faithproject_shared_for_prayer ON public."FaithProject" USING btree ("participantId") WHERE ((status = 'APPROVED'::text) AND ("sharedForPrayer" = true));
CREATE INDEX idx_faithproject_status ON public."FaithProject" USING btree (status);
CREATE UNIQUE INDEX faith_project_category_unique_active_name ON public."FaithProjectCategory" USING btree (lower(TRIM(BOTH FROM name))) WHERE ("archivedAt" IS NULL);
CREATE INDEX "FaithProjectVersion_participant_idx" ON public."FaithProjectVersion" USING btree ("participantId", "savedAt" DESC);
CREATE INDEX idx_followupcontact_archived ON public."FollowUpContact" USING btree ("archivedAt");
CREATE INDEX idx_followupcontact_cohort ON public."FollowUpContact" USING btree ("cohortId");
CREATE INDEX idx_followupcontact_due ON public."FollowUpContact" USING btree ("dueDate");
CREATE INDEX idx_followupcontact_owner ON public."FollowUpContact" USING btree ("ownerId");
CREATE INDEX idx_followupcontact_registeredby ON public."FollowUpContact" USING btree ("registeredById");
CREATE INDEX idx_followupcontact_sheet_pending ON public."FollowUpContact" USING btree ("createdAt") WHERE (("sheetSyncedAt" IS NULL) AND ("registeredById" IS NOT NULL));
CREATE INDEX idx_followupissue_contact ON public."FollowUpIssue" USING btree ("contactId");
CREATE INDEX idx_followupissue_reported_by ON public."FollowUpIssue" USING btree ("reportedById");
CREATE INDEX idx_followupissue_status ON public."FollowUpIssue" USING btree (status);
CREATE INDEX idx_followupissuecontact_contact ON public."FollowUpIssueContact" USING btree ("contactId");
CREATE INDEX idx_followuploginissue_contact ON public."FollowUpLoginIssue" USING btree ("contactId");
CREATE INDEX idx_followuploginissue_status ON public."FollowUpLoginIssue" USING btree (status);
CREATE UNIQUE INDEX uq_followuploginissue_open_contact ON public."FollowUpLoginIssue" USING btree ("contactId") WHERE (status = 'OPEN'::text);
CREATE INDEX idx_followupnotehistory_contact ON public."FollowUpNoteHistory" USING btree ("contactId", "notedAt" DESC);
CREATE UNIQUE INDEX uniq_followup_owner_check_open ON public."FollowUpOwnerCheck" USING btree ("ownerId") WHERE ("closedAt" IS NULL);
CREATE INDEX idx_followupownerreminderlog_user_date ON public."FollowUpOwnerReminderLog" USING btree ("userId", "reminderDate");
CREATE INDEX idx_followup_reassignment_created ON public."FollowUpReassignmentLog" USING btree ("createdAt" DESC);
CREATE INDEX idx_followup_reassignment_from ON public."FollowUpReassignmentLog" USING btree ("fromUserId", "createdAt" DESC);
CREATE INDEX idx_group_active_cohort ON public."Group" USING btree ("cohortId", name) WHERE ("archivedAt" IS NULL);
CREATE INDEX idx_group_cohort ON public."Group" USING btree ("cohortId");
CREATE INDEX idx_group_support ON public."Group" USING btree ("supportId");
CREATE INDEX idx_group_teen ON public."Group" USING btree ("cohortId", "supportId") WHERE ("isTeenGroup" AND ("archivedAt" IS NULL));
CREATE UNIQUE INDEX uq_group_teen_per_support ON public."Group" USING btree ("cohortId", "supportId") WHERE ("isTeenGroup" AND ("archivedAt" IS NULL));
CREATE UNIQUE INDEX "GroupDiscussionSeen_participant_uq" ON public."GroupDiscussionSeen" USING btree ("groupId", "participantId") WHERE ("participantId" IS NOT NULL);
CREATE UNIQUE INDEX "GroupDiscussionSeen_user_uq" ON public."GroupDiscussionSeen" USING btree ("groupId", "userId") WHERE ("userId" IS NOT NULL);
CREATE INDEX idx_grouponboardingstatus_group ON public."GroupOnboardingStatus" USING btree ("groupId");
CREATE INDEX idx_groupparticipant_group ON public."GroupParticipant" USING btree ("groupId");
CREATE INDEX idx_groupparticipant_participant ON public."GroupParticipant" USING btree ("participantId");
CREATE INDEX "GroupPost_group_created_idx" ON public."GroupPost" USING btree ("groupId", "createdAt" DESC);
CREATE UNIQUE INDEX "GroupPost_live_intro_uq" ON public."GroupPost" USING btree ("groupId", COALESCE("authorUserId", "authorParticipantId")) WHERE ((kind = 'INTRO'::text) AND ("deletedAt" IS NULL) AND ("removedAt" IS NULL));
CREATE UNIQUE INDEX "GroupPostLike_participant_uq" ON public."GroupPostLike" USING btree ("postId", "participantId") WHERE ("participantId" IS NOT NULL);
CREATE UNIQUE INDEX "GroupPostLike_user_uq" ON public."GroupPostLike" USING btree ("postId", "userId") WHERE ("userId" IS NOT NULL);
CREATE INDEX "GroupPostReply_post_idx" ON public."GroupPostReply" USING btree ("postId", "createdAt");
CREATE INDEX idx_groupprayer_cohort ON public."GroupPrayer" USING btree ("cohortId");
CREATE INDEX idx_groupprayer_week ON public."GroupPrayer" USING btree ("weekId");
CREATE INDEX idx_groupprayerfocus_group ON public."GroupPrayerFocus" USING btree ("groupId");
CREATE INDEX idx_groupprayerfocus_participant ON public."GroupPrayerFocus" USING btree ("participantId");
CREATE INDEX idx_groupprayerfocus_week ON public."GroupPrayerFocus" USING btree ("weekId");
CREATE INDEX idx_groupprayerstatus_group ON public."GroupPrayerStatus" USING btree ("groupId");
CREATE INDEX idx_groupprayerstatus_week ON public."GroupPrayerStatus" USING btree ("weekId");
CREATE INDEX idx_hubitsupport_hub ON public."HubItSupport" USING btree ("hubId");
CREATE INDEX idx_hubitsupport_user ON public."HubItSupport" USING btree ("userId");
CREATE INDEX idx_hubmembership_hub ON public."HubMembership" USING btree ("hubId");
CREATE INDEX idx_hubmembership_user ON public."HubMembership" USING btree ("userId");
CREATE INDEX idx_hubmessage_hub ON public."HubMessage" USING btree ("hubId", "createdAt" DESC);
CREATE INDEX idx_hubmessageack_message ON public."HubMessageAck" USING btree ("messageId");
CREATE INDEX idx_hubmessageack_user ON public."HubMessageAck" USING btree ("userId");
CREATE INDEX idx_hubpersonofinterest_hub ON public."HubPersonOfInterest" USING btree ("hubId");
CREATE INDEX "HubReaction_topicId_idx" ON public."HubReaction" USING btree ("topicId");
CREATE INDEX idx_hubroleintroseen_user ON public."HubRoleIntroSeen" USING btree ("userId");
CREATE INDEX idx_label_cohort ON public."Label" USING btree ("cohortId");
CREATE UNIQUE INDEX idx_label_color_lower_unique ON public."Label" USING btree (lower(color));
CREATE INDEX idx_label_group ON public."Label" USING btree ("groupId");
CREATE UNIQUE INDEX idx_label_name_lower_cohort_unique ON public."Label" USING btree (lower(name), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_manualquestion_group_new ON public."ManualQuestion" USING btree ("groupId", status) WHERE (status = 'NEW'::text);
CREATE INDEX idx_manualquestion_participant ON public."ManualQuestion" USING btree ("participantId", "weekId");
CREATE INDEX idx_manualquestion_week ON public."ManualQuestion" USING btree ("weekId", "createdAt" DESC);
CREATE INDEX idx_meetingattendance_group_week ON public."MeetingAttendance" USING btree ("groupId", "weekId");
CREATE INDEX idx_meetingattendance_week ON public."MeetingAttendance" USING btree ("weekId");
CREATE UNIQUE INDEX "MeetingRecordingOpening_group_week" ON public."MeetingRecordingOpening" USING btree ("groupId", "weekId") WHERE ("groupId" IS NOT NULL);
CREATE UNIQUE INDEX "MeetingRecordingOpening_hub_week" ON public."MeetingRecordingOpening" USING btree ("hubId", "weekId") WHERE ("hubId" IS NOT NULL);
CREATE INDEX idx_notification_user_created ON public."Notification" USING btree ("userId", "createdAt" DESC);
CREATE INDEX idx_notification_user_unread_created ON public."Notification" USING btree ("userId", "isRead", "createdAt" DESC);
CREATE INDEX idx_onboardingevent_actor ON public."OnboardingEvent" USING btree ("actorId");
CREATE INDEX idx_onboardingevent_createdat ON public."OnboardingEvent" USING btree ("createdAt");
CREATE INDEX idx_onboardingevent_group ON public."OnboardingEvent" USING btree ("groupId");
CREATE INDEX idx_participant_cohort ON public."Participant" USING btree ("cohortId");
CREATE INDEX idx_participant_followupcontact ON public."Participant" USING btree ("followUpContactId");
CREATE INDEX idx_participant_status ON public."Participant" USING btree (status);
CREATE UNIQUE INDEX uniq_participant_phone_per_cohort ON public."Participant" USING btree (fof_phone_key(phone), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid), fof_name_key("fullName")) WHERE ((fof_phone_key(phone) IS NOT NULL) AND (id <> ALL (ARRAY['0476b50f-de92-4b0a-baa9-0c8c05052b0f'::uuid, '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'::uuid])) AND (replace(lower(COALESCE("ageRange", ''::text)), ' '::text, ''::text) <> ALL (ARRAY['18andbelow'::text, '10-17'::text])));
CREATE INDEX idx_checkin_participant ON public."ParticipantCheckIn" USING btree ("participantId", "createdAt" DESC);
CREATE INDEX idx_participantflag_open ON public."ParticipantFlag" USING btree ("raisedAt" DESC) WHERE ("clearedAt" IS NULL);
CREATE INDEX idx_participantflag_participant ON public."ParticipantFlag" USING btree ("participantId", "raisedAt" DESC);
CREATE INDEX idx_participanthandover_participant_created ON public."ParticipantHandover" USING btree ("participantId", "createdAt" DESC);
CREATE UNIQUE INDEX uniq_participant_login_phone ON public."ParticipantLoginPhone" USING btree (fof_phone_key(phone));
CREATE INDEX idx_participantnote_participant_created ON public."ParticipantNote" USING btree ("participantId", "createdAt" DESC);
CREATE INDEX "ParticipantNotification_participant_created_idx" ON public."ParticipantNotification" USING btree ("participantId", "createdAt" DESC);
CREATE INDEX idx_participantonboardingstatus_participant ON public."ParticipantOnboardingStatus" USING btree ("participantId");
CREATE INDEX idx_participantstagechange_participant ON public."ParticipantStageChange" USING btree ("participantId", "changedAt" DESC);
CREATE INDEX "ParticipantTelegramLink_chat_idx" ON public."ParticipantTelegramLink" USING btree ("chatId");
CREATE INDEX "PendingChange_changeType_idx" ON public."PendingChange" USING btree ("changeType");
CREATE INDEX "PendingChange_userId_idx" ON public."PendingChange" USING btree ("userId");
CREATE INDEX "PendingChange_weekId_idx" ON public."PendingChange" USING btree ("weekId");
CREATE UNIQUE INDEX "PermissionRole_name_lower_key" ON public."PermissionRole" USING btree (lower(name));
CREATE INDEX practicepeer_from ON public."PracticePeer" USING btree ("fromUserId", status);
CREATE INDEX practicepeer_to ON public."PracticePeer" USING btree ("toUserId", status);
CREATE UNIQUE INDEX practice_progress_participant_key ON public."PracticeProgress" USING btree ("participantId", "scenarioKey") WHERE ("participantId" IS NOT NULL);
CREATE UNIQUE INDEX practice_progress_user_key ON public."PracticeProgress" USING btree ("userId", "scenarioKey") WHERE ("userId" IS NOT NULL);
CREATE INDEX "PublicHoliday_date_idx" ON public."PublicHoliday" USING btree (date);
CREATE INDEX idx_pushreminderlog_date ON public."PushReminderLog" USING btree ("reminderDate");
CREATE INDEX idx_pushsub_user ON public."PushSubscription" USING btree ("userId");
CREATE INDEX "RejectedChange_userId_idx" ON public."RejectedChange" USING btree ("userId");
CREATE INDEX "RejectedChange_weekId_idx" ON public."RejectedChange" USING btree ("weekId");
CREATE UNIQUE INDEX "ScriptureEngagement_one_like" ON public."ScriptureEngagement" USING btree ("scriptureId", "actorKind", "actorId") WHERE (action = 'LIKE'::text);
CREATE INDEX "ScriptureEngagement_scripture_action" ON public."ScriptureEngagement" USING btree ("scriptureId", action);
CREATE INDEX idx_sheetregistration_phone ON public."SheetRegistration" USING btree ("phoneNormalised");
CREATE INDEX idx_sheetregistration_signedup ON public."SheetRegistration" USING btree ("signedUpAt" DESC);
CREATE INDEX "SignInThrottle_firstFailAt_idx" ON public."SignInThrottle" USING btree ("firstFailAt");
CREATE INDEX idx_supportactivitycompletion_activity ON public."SupportActivityCompletion" USING btree ("activityId");
CREATE INDEX idx_supportactivitycompletion_user ON public."SupportActivityCompletion" USING btree ("userId");
CREATE UNIQUE INDEX "SupportChecklistItem_dated_unique" ON public."SupportChecklistItem" USING btree ("userId", "cohortId", label, "dueDate") WHERE ("weekId" IS NULL);
CREATE INDEX "SupportChecklistItem_taskGroup_idx" ON public."SupportChecklistItem" USING btree ("taskGroupId") WHERE ("taskGroupId" IS NOT NULL);
CREATE INDEX "SupportChecklistItem_user_cohort_date" ON public."SupportChecklistItem" USING btree ("userId", "cohortId", "dueDate") WHERE ("weekId" IS NULL);
CREATE INDEX idx_supportchecklist_user_week ON public."SupportChecklistItem" USING btree ("userId", "weekId");
CREATE INDEX idx_supporthub_assistant ON public."SupportHub" USING btree ("assistantLeadUserId");
CREATE INDEX idx_supporthub_cohort ON public."SupportHub" USING btree ("cohortId");
CREATE INDEX idx_supporthub_lead ON public."SupportHub" USING btree ("leadUserId");
CREATE INDEX idx_supportnote_hub ON public."SupportNote" USING btree ("hubId");
CREATE INDEX idx_supportnote_support ON public."SupportNote" USING btree ("supportId");
CREATE INDEX idx_supportsession_cohort ON public."SupportSession" USING btree ("cohortId");
CREATE INDEX idx_supportsession_hub ON public."SupportSession" USING btree ("hubId");
CREATE INDEX idx_supportsession_week ON public."SupportSession" USING btree ("weekId");
CREATE INDEX idx_supportsessionattendance_session ON public."SupportSessionAttendance" USING btree ("sessionId");
CREATE INDEX idx_supportsessionattendance_user ON public."SupportSessionAttendance" USING btree ("userId");
CREATE UNIQUE INDEX "SupportTag_name_lower_idx" ON public."SupportTag" USING btree (lower(btrim(name)));
CREATE UNIQUE INDEX "SupportTag_systemKey_idx" ON public."SupportTag" USING btree ("systemKey") WHERE ("systemKey" IS NOT NULL);
CREATE INDEX "SupportTagMember_user_idx" ON public."SupportTagMember" USING btree ("userId");
CREATE INDEX "SurveyAnswerSet_survey_idx" ON public."SurveyAnswerSet" USING btree ("surveyId");
CREATE INDEX "SurveyQuestion_survey_idx" ON public."SurveyQuestion" USING btree ("surveyId", "position");
CREATE INDEX "TelegramLink_chat_idx" ON public."TelegramLink" USING btree ("chatId");
CREATE INDEX "TelegramLinkCode_owner_idx" ON public."TelegramLinkCode" USING btree ("ownerKind", "ownerId");
CREATE INDEX idx_testimony_cohort_feed ON public."Testimony" USING btree ("cohortId", status) WHERE (visibility = 'COHORT'::text);
CREATE INDEX idx_testimony_group_feed ON public."Testimony" USING btree ("groupId", status) WHERE (visibility = 'GROUP'::text);
CREATE INDEX idx_testimony_participant ON public."Testimony" USING btree ("participantId", "createdAt" DESC);
CREATE INDEX idx_testimony_pending ON public."Testimony" USING btree (status, "createdAt" DESC) WHERE (status = 'PENDING'::text);
CREATE UNIQUE INDEX uq_tourprogress_participant_key ON public."TourProgress" USING btree ("participantId", "tourKey") WHERE ("participantId" IS NOT NULL);
CREATE UNIQUE INDEX uq_tourprogress_user_key ON public."TourProgress" USING btree ("userId", "tourKey") WHERE ("userId" IS NOT NULL);
CREATE UNIQUE INDEX uniq_user_phone ON public."User" USING btree (phone) WHERE (phone IS NOT NULL);
CREATE INDEX idx_usercohort_cohort ON public."UserCohort" USING btree ("cohortId");
CREATE INDEX idx_userlabel_label ON public."UserLabel" USING btree ("labelId");
CREATE INDEX idx_userlabel_user ON public."UserLabel" USING btree ("userId");
CREATE INDEX "UserPermissionRole_roleId_idx" ON public."UserPermissionRole" USING btree ("roleId");
CREATE INDEX idx_week_cohort ON public."Week" USING btree ("cohortId");

-- Views ----------------------------------------------------------------------------------------------------
CREATE VIEW analytics.class_attendance AS
 SELECT analytics.pid(a."participantId") AS participant,
    w.cohort,
    w.week_number,
    a.status,
    COALESCE(a."lateExcused", false) AS late_excused
   FROM "AttendanceRecord" a
     JOIN analytics.weeks w ON w.week_id = a."weekId"
     JOIN "Participant" p ON p.id = a."participantId" AND COALESCE(p."isTest", false) = false;

CREATE VIEW analytics.cohorts AS
 SELECT id AS cohort_id,
    name AS cohort,
    "startDate" AS start_date,
    "endDate" AS end_date,
    status
   FROM "Cohort" c
  WHERE COALESCE("isPractice", false) = false AND status <> 'ARCHIVED'::text AND "startDate" >= (( SELECT x."startDate"
           FROM "Cohort" x
          WHERE x.name = 'Cohort 10'::text
         LIMIT 1));

CREATE VIEW analytics.group_meeting_attendance AS
 SELECT analytics.pid(m."participantId") AS participant,
    w.cohort,
    w.week_number,
    m.status
   FROM "MeetingAttendance" m
     JOIN analytics.weeks w ON w.week_id = m."weekId"
     JOIN "Participant" p ON p.id = m."participantId" AND COALESCE(p."isTest", false) = false;

CREATE VIEW analytics.hub_meetings AS
 SELECT h.name AS hub,
    w.cohort,
    w.week_number,
    s."startedAt" AS started_at,
    s."submittedAt" AS submitted_at,
    ( SELECT count(*) AS count
           FROM "SupportSessionAttendance" a
          WHERE a."sessionId" = s.id) AS attendance_marks
   FROM "SupportSession" s
     JOIN "SupportHub" h ON h.id = s."hubId"
     JOIN analytics.weeks w ON w.week_id = s."weekId"
  WHERE s.type = 'SUNDAY_RECAP'::text;

CREATE VIEW analytics.participants AS
 SELECT analytics.pid(p.id) AS participant,
    c.cohort,
    p.status,
    p.source,
    (EXISTS ( SELECT 1
           FROM "GroupParticipant" gp
             JOIN "Group" g ON g.id = gp."groupId"
          WHERE gp."participantId" = p.id AND g."cohortId" = p."cohortId" AND g."archivedAt" IS NULL)) AS in_group,
    COALESCE(p."ageRange", ''::text) ~ '^\s*10\s*-\s*17'::text OR (EXISTS ( SELECT 1
           FROM "GroupParticipant" gp
             JOIN "Group" g ON g.id = gp."groupId"
          WHERE gp."participantId" = p.id AND g."isTeenGroup")) AS is_teen,
    p.gender,
    p."ageRange" AS age_range,
    p."createdAt"::date AS added_on,
    (profile_completion_for(p.id) ->> 'percent'::text)::integer AS profile_percent,
    NULLIF(TRIM(BOTH FROM COALESCE(p."avatarUrl", ''::text)), ''::text) IS NOT NULL AS has_photo,
    p."dateOfBirth" IS NOT NULL AS has_date_of_birth,
    NULLIF(TRIM(BOTH FROM COALESCE(p.occupation, ''::text)), ''::text) IS NOT NULL AS has_occupation
   FROM "Participant" p
     JOIN analytics.cohorts c ON c.cohort_id = p."cohortId"
  WHERE COALESCE(p."isTest", false) = false;

CREATE VIEW analytics.weeks AS
 SELECT w.id AS week_id,
    c.cohort,
    w."weekNumber" AS week_number,
    w."classDate" AS class_date
   FROM "Week" w
     JOIN analytics.cohorts c ON c.cohort_id = w."cohortId";

-- Functions ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.pid(p_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT encode(sha256(convert_to(p_id::text || ':fof-analytics-v1', 'UTF8')), 'hex') $function$;

CREATE OR REPLACE FUNCTION public.absence_auto_candidates(p_cohort_id uuid)
 RETURNS TABLE("participantId" uuid, "fullName" text, "ageRange" text, "groupIds" uuid[], "groupName" text, "supportId" uuid, "supportName" text, "isTeenGroup" boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2, 3)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 3
  )
  SELECT p.id, p."fullName", p."ageRange",
         COALESCE(array_agg(DISTINCT g.id) FILTER (WHERE g.id IS NOT NULL), '{}'::uuid[]),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         COALESCE(bool_or(g."isTeenGroup"), FALSE)
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  -- People in no group are included too (owner's decision, 1 Nov 2026): their group columns come back empty.
  LEFT JOIN (public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL)
    ON gp."participantId" = p.id AND g."cohortId" = p_cohort_id
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND (SELECT COUNT(*) FROM early) = 3
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;

CREATE OR REPLACE FUNCTION public.absence_auto_move(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c RECORD;
  s RECORD;
  v_contact public."FollowUpContact";
  v_moved TEXT[] := '{}';
  v_told JSONB := '[]'::jsonb;
  v_skipped JSONB := '[]'::jsonb;
BEGIN
  -- One run per cohort, even if two scheduled runs overlap.
  PERFORM 1 FROM public."Cohort" WHERE id = p_cohort_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = p_cohort_id) THEN
    RETURN jsonb_build_object('alreadyDone', TRUE);
  END IF;

  FOR c IN SELECT * FROM public.absence_auto_candidates(p_cohort_id) LOOP
    BEGIN
      v_contact := NULL;
      SELECT fc.* INTO v_contact FROM public."FollowUpContact" fc
      JOIN public."Participant" p ON p."followUpContactId" = fc.id WHERE p.id = c."participantId";

      INSERT INTO public."AbsenceReviewMove" ("cohortId", "participantId", "groupIds", "groupName", "supportId", "contactId",
        "prevContactStatus", "prevContactArchivedAt", "prevParticipantStatus", "movedById", "prevContact")
      VALUES (p_cohort_id, c."participantId", c."groupIds", c."groupName", c."supportId", v_contact.id,
        v_contact."registrationStatus", v_contact."archivedAt", 'ACTIVE', NULL,
        CASE WHEN v_contact.id IS NULL THEN NULL ELSE jsonb_build_object(
          'registrationStatus', v_contact."registrationStatus", 'archivedAt', v_contact."archivedAt",
          'messageStatus', v_contact."messageStatus", 'replyStatus', v_contact."replyStatus", 'callStatus', v_contact."callStatus",
          'nextAction', v_contact."nextAction", 'teenOnboardedHow', v_contact."teenOnboardedHow") END);

      DELETE FROM public."GroupParticipant" WHERE "participantId" = c."participantId" AND "groupId" = ANY (c."groupIds");
      UPDATE public."Participant" SET status = 'ARCHIVED', "updatedAt" = NOW() WHERE id = c."participantId";
      -- Teens keep their teen sign-up status; their Teen Support decides about the next cohort (rule 28).
      IF v_contact.id IS NOT NULL AND NOT (c."isTeenGroup" OR c."ageRange" = '10 - 17') THEN
        UPDATE public."FollowUpContact"
        -- The same fields as buildStatusPatch('NEXT_COHORT') in the app (rule 5).
        SET "registrationStatus" = 'NEXT_COHORT', "archivedAt" = NULL, "messageStatus" = 'NOT_SENT', "replyStatus" = 'NO_REPLY',
            "callStatus" = 'NOT_CALLED', "nextAction" = 'CLOSE', "teenOnboardedHow" = NULL, "statusChangedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = v_contact.id;
      END IF;

      v_moved := v_moved || c."fullName";
      v_told := v_told || jsonb_build_object('supportId', c."supportId", 'who', c."fullName" || ' (' || COALESCE(c."groupName", 'no group') || ')');
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object('name', c."fullName", 'reason', regexp_replace(SQLERRM, '^[A-Z_]+: ', ''));
    END;
  END LOOP;

  INSERT INTO public."AbsenceReviewDone" ("cohortId", "doneById", "movedCount", "keptCount")
  VALUES (p_cohort_id, NULL, COALESCE(array_length(v_moved, 1), 0), 0);

  -- Each support hears once, about all of theirs.
  FOR s IN SELECT t."supportId", string_agg(t.who, ', ' ORDER BY t.who) AS who
           FROM jsonb_to_recordset(v_told) AS t("supportId" UUID, who TEXT) WHERE t."supportId" IS NOT NULL GROUP BY t."supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"], 'Moved to next cohort',
      format('%s missed class 1, class 2 and class 3, so they have moved to the next cohort automatically. If the register was wrong, an admin can undo it for three days.', s.who),
      '/support/participants');
  END LOOP;

  IF COALESCE(array_length(v_moved, 1), 0) > 0 OR jsonb_array_length(v_skipped) > 0 THEN
    PERFORM public.absence_review_notify(
      (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
      format('%s moved to next cohort', COALESCE(array_length(v_moved, 1), 0)),
      format('%s missed class 1, class 2 and class 3 and moved automatically.%s You can undo a move from Participants for three days.',
        CASE WHEN COALESCE(array_length(v_moved, 1), 0) = 1 THEN '1 person' ELSE COALESCE(array_length(v_moved, 1), 0) || ' people' END,
        CASE WHEN jsonb_array_length(v_skipped) > 0 THEN format(' Not moved, please archive by hand: %s.',
          (SELECT string_agg(x->>'name', ', ') FROM jsonb_array_elements(v_skipped) AS x)) ELSE '' END),
      '/participants');
  END IF;

  RETURN jsonb_build_object('moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_auto_move_due()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_now TIMESTAMP := NOW() AT TIME ZONE 'Africa/Lagos';
  v_class3 DATE;
  v_week3 INTEGER;
BEGIN
  IF v_cohort IS NULL THEN RETURN NULL; END IF;
  SELECT public.week_class_date(c."startDate", w."weekNumber", w."classDate"), w.id INTO v_class3, v_week3
  FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = v_cohort AND w."weekNumber" = 3 LIMIT 1;
  IF v_class3 IS NULL OR v_now < v_class3 + TIME '16:00' OR v_now::date > v_class3 + 2 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."AttendanceSession" WHERE "weekId" = v_week3 AND "finalizedAt" IS NOT NULL) THEN RETURN NULL; END IF;
  RETURN public.absence_auto_move(v_cohort);
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_notify_participants(p_participant_ids uuid[], p_title text, p_body text, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', 'ABSENCE_WARNING'),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_candidates(p_cohort_id uuid)
 RETURNS TABLE("participantId" uuid, "fullName" text, "ageRange" text, "groupIds" uuid[], "groupName" text, "supportId" uuid, "supportName" text, "isTeenGroup" boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 2
  )
  SELECT p.id, p."fullName", p."ageRange",
         COALESCE(array_agg(DISTINCT g.id) FILTER (WHERE g.id IS NOT NULL), '{}'::uuid[]),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         COALESCE(bool_or(g."isTeenGroup"), FALSE)
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  -- People in no group are included too (owner's decision, 1 Nov 2026): their group columns come back empty.
  LEFT JOIN (public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL)
    ON gp."participantId" = p.id AND g."cohortId" = p_cohort_id
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND (SELECT COUNT(*) FROM early) = 2
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_move(p_token text, p_participant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_saturday DATE;
  v_total INTEGER;
  c RECORD;
  v_contact public."FollowUpContact";
  v_moved TEXT[] := '{}';
  v_skipped JSONB := '[]'::jsonb;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  v_saturday := public.absence_review_saturday(v_cohort);
  IF v_cohort IS NULL OR v_saturday IS NULL OR v_today NOT BETWEEN v_saturday AND v_saturday + 1 THEN
    RAISE EXCEPTION 'The two-absence review is open from the Saturday before class 3 until the end of class 3''s day';
  END IF;
  -- One review per cohort: a second admin on an old page cannot move the people the first one kept.
  PERFORM 1 FROM public."Cohort" WHERE id = v_cohort FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN
    RAISE EXCEPTION 'This review was already done. Reload the page to see who was moved.';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.absence_review_candidates(v_cohort);

  FOR c IN SELECT * FROM public.absence_review_candidates(v_cohort) WHERE "participantId" = ANY (COALESCE(p_participant_ids, '{}')) LOOP
    BEGIN
      SELECT fc.* INTO v_contact FROM public."FollowUpContact" fc
      JOIN public."Participant" p ON p."followUpContactId" = fc.id WHERE p.id = c."participantId";

      INSERT INTO public."AbsenceReviewMove" ("cohortId", "participantId", "groupIds", "groupName", "supportId", "contactId",
        "prevContactStatus", "prevContactArchivedAt", "prevParticipantStatus", "movedById", "prevContact")
      VALUES (v_cohort, c."participantId", c."groupIds", c."groupName", c."supportId", v_contact.id,
        v_contact."registrationStatus", v_contact."archivedAt", 'ACTIVE', v_admin.id,
        CASE WHEN v_contact.id IS NULL THEN NULL ELSE jsonb_build_object(
          'registrationStatus', v_contact."registrationStatus", 'archivedAt', v_contact."archivedAt",
          'messageStatus', v_contact."messageStatus", 'replyStatus', v_contact."replyStatus", 'callStatus', v_contact."callStatus",
          'nextAction', v_contact."nextAction", 'teenOnboardedHow', v_contact."teenOnboardedHow") END);

      DELETE FROM public."GroupParticipant" WHERE "participantId" = c."participantId" AND "groupId" = ANY (c."groupIds");
      UPDATE public."Participant" SET status = 'ARCHIVED', "updatedAt" = NOW() WHERE id = c."participantId";
      -- Teens keep their teen sign-up status; their Teen Support decides about the next cohort (rule 28).
      IF v_contact.id IS NOT NULL AND NOT (c."isTeenGroup" OR c."ageRange" = '10 - 17') THEN
        UPDATE public."FollowUpContact"
        -- The same fields as buildStatusPatch('NEXT_COHORT') in the app (rule 5).
        SET "registrationStatus" = 'NEXT_COHORT', "archivedAt" = NULL, "messageStatus" = 'NOT_SENT', "replyStatus" = 'NO_REPLY',
            "callStatus" = 'NOT_CALLED', "nextAction" = 'CLOSE', "teenOnboardedHow" = NULL, "statusChangedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = v_contact.id;
      END IF;

      v_moved := v_moved || c."fullName";
      IF c."supportId" IS NOT NULL THEN
        PERFORM public.absence_review_notify(ARRAY[c."supportId"],
          'Moved to next cohort',
          format('%s missed class 1 and class 2, so an admin has moved them out of %s and onto the next cohort.', c."fullName", c."groupName"),
          '/support/participants');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object('name', c."fullName", 'reason', regexp_replace(SQLERRM, '^[A-Z_]+: ', ''));
    END;
  END LOOP;

  -- Done only when every chosen move went through; otherwise the list stays open so the rest can be tried again.
  IF jsonb_array_length(v_skipped) = 0 THEN
    INSERT INTO public."AbsenceReviewDone" ("cohortId", "doneById", "movedCount", "keptCount")
    VALUES (v_cohort, v_admin.id, COALESCE(array_length(v_moved, 1), 0),
            GREATEST(v_total - COALESCE(array_length(v_moved, 1), 0), 0));
  END IF;

  RETURN jsonb_build_object('moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_notify(p_user_ids uuid[], p_title text, p_body text, p_path text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.fof_notify(p_user_ids, p_title, p_body, p_path, 'ABSENCE_REVIEW');
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_remind()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_hour INTEGER := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Africa/Lagos'))::int;
  v_count INTEGER;
  s RECORD;
BEGIN
  IF v_cohort IS NULL OR v_hour <> 16 THEN RETURN; END IF;
  IF public.absence_review_saturday(v_cohort) IS DISTINCT FROM v_today THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN RETURN; END IF;
  SELECT COUNT(*) INTO v_count FROM public.absence_review_candidates(v_cohort);
  IF v_count = 0 THEN RETURN; END IF;

  FOR s IN SELECT "supportId", string_agg("fullName", ', ' ORDER BY "fullName") AS who, COUNT(*) AS n
           FROM public.absence_review_candidates(v_cohort) WHERE "supportId" IS NOT NULL GROUP BY "supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"],
      'Missed class 1 and class 2',
      format('%s missed class 1 and class 2. %s Please reach out today.', s.who,
        CASE WHEN s.n = 1 THEN 'If they also miss class 3 tomorrow, they move to the next cohort automatically at 4 pm.'
             ELSE 'Anyone who also misses class 3 tomorrow moves to the next cohort automatically at 4 pm.' END),
      '/support/participants');
  END LOOP;

  PERFORM public.absence_notify_participants(
    (SELECT array_agg("participantId") FROM public.absence_review_candidates(v_cohort)),
    'Please come to class tomorrow',
    'You have missed class 1 and class 2. If you miss class 3 tomorrow too, you will move to the next cohort and can start again there.',
    '/me');

  PERFORM public.absence_review_notify(
    (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
    'Missed class 1 and class 2',
    format('%s %s missed class 1 and class 2. Anyone also absent from class 3 tomorrow moves to the next cohort automatically at 4 pm. They and their supports have been told.',
      v_count, CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END),
    '/participants');
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_saturday(p_cohort_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.week_class_date(c."startDate", w."weekNumber", w."classDate") - 1
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = p_cohort_id AND w."weekNumber" = 3
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_saturday DATE;
  v_done public."AbsenceReviewDone";
  v_warning BOOLEAN;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_cohort IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;

  v_saturday := public.absence_review_saturday(v_cohort);
  SELECT * INTO v_done FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort;
  -- From the Saturday before class 3 until the automatic move has run.
  v_warning := v_saturday IS NOT NULL AND v_today BETWEEN v_saturday AND v_saturday + 3 AND v_done."cohortId" IS NULL;

  RETURN jsonb_build_object(
    'cohortId', v_cohort,
    'cohortName', (SELECT name FROM public."Cohort" WHERE id = v_cohort),
    'saturday', v_saturday,
    'moveAt', CASE WHEN v_saturday IS NULL THEN NULL ELSE to_char(v_saturday + 1, 'YYYY-MM-DD') || 'T16:00:00+01:00' END,
    'open', v_warning,
    'done', CASE WHEN v_done."cohortId" IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_done."doneAt", 'by', (SELECT name FROM public."User" WHERE id = v_done."doneById"),
      'automatic', v_done."doneById" IS NULL,
      'moved', v_done."movedCount", 'kept', v_done."keptCount") END,
    'people', CASE WHEN NOT v_warning THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('participantId', c."participantId", 'fullName', c."fullName",
        'ageRange', c."ageRange", 'groupName', c."groupName", 'supportName', c."supportName",
        'isTeen', c."isTeenGroup" OR c."ageRange" = '10 - 17') ORDER BY c."groupName", c."fullName")
      FROM public.absence_review_candidates(v_cohort) c), '[]'::jsonb) END,
    'undoable', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'participantId', m."participantId",
        'fullName', (SELECT "fullName" FROM public."Participant" WHERE id = m."participantId"),
        'groupName', m."groupName", 'movedAt', m."movedAt",
        'undoUntil', to_char((m."movedAt" AT TIME ZONE 'Africa/Lagos')::date + 2, 'YYYY-MM-DD')) ORDER BY m."movedAt" DESC)
      FROM public."AbsenceReviewMove" m
      WHERE m."cohortId" = v_cohort AND m."undoneAt" IS NULL
        AND (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date >= v_today - 2), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_undo(p_token text, p_move_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  m public."AbsenceReviewMove";
  v_name TEXT;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO m FROM public."AbsenceReviewMove" WHERE id = p_move_id FOR UPDATE;
  IF m.id IS NULL OR m."undoneAt" IS NOT NULL THEN RAISE EXCEPTION 'That move was already undone'; END IF;
  IF (NOW() AT TIME ZONE 'Africa/Lagos')::date > (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date + 2 THEN
    RAISE EXCEPTION 'A move can only be undone within three days';
  END IF;

  UPDATE public."Participant" SET status = m."prevParticipantStatus", "updatedAt" = NOW() WHERE id = m."participantId"
  RETURNING "fullName" INTO v_name;
  INSERT INTO public."GroupParticipant" ("groupId", "participantId")
  SELECT g.id, m."participantId" FROM public."Group" g WHERE g.id = ANY (m."groupIds") AND g."archivedAt" IS NULL
  ON CONFLICT DO NOTHING;
  -- Put back every field the move changed (older moves without a snapshot restore status and archive date only).
  IF m."contactId" IS NOT NULL AND m."prevContact" IS NOT NULL THEN
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = (m."prevContact"->>'registrationStatus')::public."FollowUpRegistrationStatus",
        "archivedAt" = (m."prevContact"->>'archivedAt')::timestamptz,
        "messageStatus" = (m."prevContact"->>'messageStatus')::public."FollowUpMessageStatus",
        "replyStatus" = (m."prevContact"->>'replyStatus')::public."FollowUpReplyStatus",
        "callStatus" = (m."prevContact"->>'callStatus')::public."FollowUpCallStatus",
        "nextAction" = (m."prevContact"->>'nextAction')::public."FollowUpNextAction",
        "teenOnboardedHow" = m."prevContact"->>'teenOnboardedHow',
        "statusChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = m."contactId";
  ELSIF m."contactId" IS NOT NULL THEN
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = m."prevContactStatus"::public."FollowUpRegistrationStatus", "archivedAt" = m."prevContactArchivedAt", "statusChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = m."contactId";
  END IF;
  UPDATE public."AbsenceReviewMove" SET "undoneAt" = NOW(), "undoneById" = v_admin.id WHERE id = m.id;
  UPDATE public."AbsenceReviewDone" SET "movedCount" = GREATEST("movedCount" - 1, 0), "keptCount" = "keptCount" + 1 WHERE "cohortId" = m."cohortId";

  IF m."supportId" IS NOT NULL THEN
    PERFORM public.absence_review_notify(ARRAY[m."supportId"], 'Back in your group',
      format('%s has been put back in %s. The move to next cohort was undone.', v_name, m."groupName"), '/support/participants');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_hub_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
  v_subject TEXT;
  v_actor_name TEXT;
  v_inserted INTEGER;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId", subject INTO v_hub_id, v_author_id, v_subject
  FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."HubMembership" WHERE "hubId" = v_hub_id AND "userId" = v_actor_id) THEN
    RAISE EXCEPTION 'You must be a member of this hub to acknowledge its messages';
  END IF;

  INSERT INTO public."HubMessageAck" ("messageId", "userId")
  VALUES (p_message_id, v_actor_id)
  ON CONFLICT ("messageId", "userId") DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND v_author_id IS NOT NULL AND v_author_id <> v_actor_id THEN
    SELECT name INTO v_actor_name FROM public."User" WHERE id = v_actor_id;
    PERFORM public.invoke_hub_message_push(
      ARRAY[v_author_id],
      COALESCE(v_actor_name, 'A member') || ' acknowledged your Hub message',
      v_subject
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_on_number_state(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_setting JSONB := COALESCE((SELECT value::jsonb FROM "AppSetting" WHERE "settingKey" = 'add_on_number'), '{"enabled": true, "untilWeek": 2}'::jsonb);
  v_enabled BOOLEAN := COALESCE((v_setting ->> 'enabled')::boolean, TRUE);
  v_until INT := COALESCE((v_setting ->> 'untilWeek')::int, 2);
  v_cohort "Cohort";
  v_last DATE;
BEGIN
  SELECT * INTO v_cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF v_cohort.id IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;
  SELECT public.week_class_date(v_cohort."startDate", w."weekNumber", w."classDate") INTO v_last
  FROM "Week" w WHERE w."cohortId" = v_cohort.id AND w."weekNumber" = v_until;
  RETURN jsonb_build_object(
    'open', v_enabled AND (v_last IS NULL OR (now() AT TIME ZONE 'Africa/Lagos')::date <= v_last),
    'enabled', v_enabled,
    'untilWeek', v_until,
    'untilDate', v_last
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_prayer_verses(p_token text, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  item jsonb;
  v_next integer;
  v_count integer := 0;
  v_title text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  SELECT COALESCE(max("sortOrder") + 1, 0) INTO v_next FROM public."CorporatePrayerVerse";
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(btrim(COALESCE(item->>'prayer', '')), '') IS NULL OR NULLIF(btrim(COALESCE(item->>'reference', '')), '') IS NULL THEN
      RAISE EXCEPTION 'PRAYER_AND_REFERENCE_REQUIRED';
    END IF;
    v_title := COALESCE(NULLIF(btrim(COALESCE(item->>'title', '')), ''), btrim(item->>'reference'));
    IF EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE lower(btrim(x.title)) = lower(v_title)) THEN RAISE EXCEPTION 'TITLE_TAKEN'; END IF;
    INSERT INTO public."CorporatePrayerVerse" (title, prayer, reference, "sortOrder") VALUES (v_title, btrim(item->>'prayer'), btrim(item->>'reference'), v_next);
    v_next := v_next + 1;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_checklist_task(p_token text, p_label text, p_week_ids integer[], p_due_day text, p_target jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_label TEXT := regexp_replace(btrim(COALESCE(p_label, '')), '\s+', ' ', 'g');
  v_due TEXT := NULLIF(btrim(COALESCE(p_due_day, '')), '');
  v_kind TEXT := COALESCE(p_target->>'kind', 'ALL');
  v_group UUID := gen_random_uuid();
  v_rows INT := 0;
  v_skipped INT := 0;
  v_added INT;
  v_pos INT;
  w RECORD;
  u RECORD;
  v_title TEXT;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF char_length(v_label) < 2 THEN RAISE EXCEPTION 'Write the task first'; END IF;
  IF char_length(v_label) > 140 THEN RAISE EXCEPTION 'Keep the task under 140 characters'; END IF;
  IF v_due IS NOT NULL AND v_due NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') THEN
    RAISE EXCEPTION 'Choose a weekday for the due day';
  END IF;
  IF p_week_ids IS NULL OR array_length(p_week_ids, 1) IS NULL THEN RAISE EXCEPTION 'Choose at least one week'; END IF;
  IF v_kind NOT IN ('ALL', 'TAG', 'USERS') THEN RAISE EXCEPTION 'Choose who the task is for'; END IF;
  IF v_kind = 'TAG' AND NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = NULLIF(p_target->>'tagId', '')::uuid) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF v_kind = 'USERS' AND jsonb_array_length(COALESCE(p_target->'userIds', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Choose at least one person';
  END IF;

  FOR w IN SELECT id, "cohortId", "weekNumber" FROM "Week" WHERE id = ANY(p_week_ids) ORDER BY "weekNumber" LOOP
    FOR u IN
      SELECT x.id FROM "User" x
      WHERE x."isActive" IS NOT FALSE AND x."isTest" IS NOT TRUE
        AND (x.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(x.roles))
        AND (
          (v_kind = 'USERS' AND x.id IN (SELECT jsonb_array_elements_text(p_target->'userIds')::uuid))
          OR (
            v_kind IN ('ALL', 'TAG')
            AND (v_kind = 'ALL' OR EXISTS (
                  SELECT 1 FROM "SupportTagMember" m
                  WHERE m."userId" = x.id AND m."tagId" = NULLIF(p_target->>'tagId', '')::uuid))
            -- Enabled for that week's cohort. A cohort with nobody enabled yet counts everyone.
            AND (NOT EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w."cohortId")
                 OR EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w."cohortId" AND c."userId" = x.id))
          )
        )
    LOOP
      SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos FROM "SupportChecklistItem" WHERE "userId" = u.id AND "weekId" = w.id;
      INSERT INTO "SupportChecklistItem" ("userId", "weekId", label, done, position, "createdById", "taskGroupId", "dueDay")
      VALUES (u.id, w.id, v_label, FALSE, v_pos, actor.id, v_group, v_due)
      ON CONFLICT ("userId", "weekId", label) DO NOTHING;
      GET DIAGNOSTICS v_added = ROW_COUNT;
      v_rows := v_rows + v_added;
      IF v_added = 0 THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  END LOOP;

  v_title := 'New task from the admin';
  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT DISTINCT i."userId", v_title,
         v_label || CASE WHEN v_due IS NOT NULL THEN ' (due ' || v_due || ')' ELSE '' END,
         '/support/schedule?tab=checklist', 'GENERAL'
  FROM "SupportChecklistItem" i WHERE i."taskGroupId" = v_group;

  RETURN jsonb_build_object(
    'taskGroupId', v_group,
    'rows', v_rows,
    'skipped', v_skipped,
    'supports', (SELECT COUNT(DISTINCT "userId") FROM "SupportChecklistItem" WHERE "taskGroupId" = v_group)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_support_task(p_token text, p_label text, p_week_ids integer[], p_cohort_id uuid, p_due_day text, p_due_dates date[], p_target jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_label TEXT := regexp_replace(btrim(COALESCE(p_label, '')), '\s+', ' ', 'g');
  v_due TEXT := NULLIF(btrim(COALESCE(p_due_day, '')), '');
  v_kind TEXT := COALESCE(p_target->>'kind', 'ALL');
  v_group UUID := gen_random_uuid();
  v_weeks INT[] := COALESCE(p_week_ids, ARRAY[]::INT[]);
  v_dates DATE[] := COALESCE(p_due_dates, ARRAY[]::DATE[]);
  v_rows INT := 0;
  v_skipped INT := 0;
  v_added INT;
  v_pos INT;
  w RECORD;
  d DATE;
  u RECORD;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF char_length(v_label) < 2 THEN RAISE EXCEPTION 'Write the task first'; END IF;
  IF char_length(v_label) > 140 THEN RAISE EXCEPTION 'Keep the task under 140 characters'; END IF;
  IF v_due IS NOT NULL AND v_due NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') THEN
    RAISE EXCEPTION 'Choose a weekday for the due day';
  END IF;
  IF array_length(v_weeks, 1) IS NULL AND array_length(v_dates, 1) IS NULL THEN RAISE EXCEPTION 'Choose at least one week or date'; END IF;
  IF array_length(v_dates, 1) IS NOT NULL AND p_cohort_id IS NULL THEN RAISE EXCEPTION 'Choose a cohort for the dates'; END IF;
  IF v_kind NOT IN ('ALL', 'TAG', 'USERS', 'LEADERS') THEN RAISE EXCEPTION 'Choose who the task is for'; END IF;
  IF v_kind = 'TAG' AND NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = NULLIF(p_target->>'tagId', '')::uuid) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF v_kind = 'USERS' AND jsonb_array_length(COALESCE(p_target->'userIds', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Choose at least one person';
  END IF;

  -- One loop over (cohort, week or date) slots; a class-week slot has a week id, a dated slot has a date.
  FOR w IN
    SELECT wk.id AS week_id, wk."cohortId" AS cohort_id, NULL::date AS due_date, wk."weekNumber" AS ord
    FROM "Week" wk WHERE wk.id = ANY(v_weeks)
    UNION ALL
    SELECT NULL::int, p_cohort_id, x, 1000 + row_number() OVER (ORDER BY x)::int
    FROM unnest(v_dates) AS x
    ORDER BY ord
  LOOP
    FOR u IN
      SELECT x.id FROM "User" x
      WHERE x."isActive" IS NOT FALSE AND x."isTest" IS NOT TRUE
        AND (x.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(x.roles))
        AND (
          (v_kind = 'USERS' AND x.id IN (SELECT jsonb_array_elements_text(p_target->'userIds')::uuid))
          OR (v_kind = 'LEADERS' AND EXISTS (
                SELECT 1 FROM "Group" g WHERE g."cohortId" = w.cohort_id AND g."supportId" = x.id AND g."archivedAt" IS NULL))
          OR (
            v_kind IN ('ALL', 'TAG')
            AND (v_kind = 'ALL' OR EXISTS (
                  SELECT 1 FROM "SupportTagMember" m
                  WHERE m."userId" = x.id AND m."tagId" = NULLIF(p_target->>'tagId', '')::uuid))
            -- Enabled for that cohort. A cohort with nobody enabled yet counts everyone.
            AND (NOT EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w.cohort_id)
                 OR EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w.cohort_id AND c."userId" = x.id))
          )
        )
    LOOP
      SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos FROM "SupportChecklistItem"
      WHERE "userId" = u.id AND (("weekId" = w.week_id) OR (w.week_id IS NULL AND "weekId" IS NULL AND "cohortId" = w.cohort_id));
      IF w.week_id IS NOT NULL THEN
        INSERT INTO "SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDay")
        VALUES (u.id, w.week_id, w.cohort_id, v_label, FALSE, v_pos, actor.id, v_group, v_due)
        ON CONFLICT ("userId", "weekId", label) DO NOTHING;
      ELSE
        INSERT INTO "SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDate")
        VALUES (u.id, NULL, w.cohort_id, v_label, FALSE, v_pos, actor.id, v_group, w.due_date)
        ON CONFLICT ("userId", "cohortId", label, "dueDate") WHERE "weekId" IS NULL DO NOTHING;
      END IF;
      GET DIAGNOSTICS v_added = ROW_COUNT;
      v_rows := v_rows + v_added;
      IF v_added = 0 THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  END LOOP;

  -- A task with dates (the rest weeks) opens the Schedule on its Rest weeks view; one with several dates says so.
  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT i."userId", 'New task from the admin',
         v_label || CASE
           WHEN COUNT(DISTINCT i."dueDate") > 1 THEN ' (' || COUNT(DISTINCT i."dueDate") || ' dates, first due ' || to_char(MIN(i."dueDate"), 'FMDay FMDD Mon') || ')'
           WHEN MIN(i."dueDate") IS NOT NULL THEN ' (due ' || to_char(MIN(i."dueDate"), 'FMDay FMDD Mon') || ')'
           WHEN v_due IS NOT NULL THEN ' (due ' || v_due || ')'
           ELSE '' END,
         CASE WHEN BOOL_OR(i."weekId" IS NULL) THEN '/support/schedule?tab=checklist&rest=1' ELSE '/support/schedule?tab=checklist' END,
         'GENERAL'
  FROM "SupportChecklistItem" i WHERE i."taskGroupId" = v_group
  GROUP BY i."userId";

  RETURN jsonb_build_object(
    'taskGroupId', v_group,
    'rows', v_rows,
    'skipped', v_skipped,
    'supports', (SELECT COUNT(DISTINCT "userId") FROM "SupportChecklistItem" WHERE "taskGroupId" = v_group)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_checklist_tasks(p_token text, p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(t ORDER BY t."createdAt")
    FROM (
      SELECT i."taskGroupId" AS "taskGroupId",
             MIN(i.label) AS label,
             MIN(i."dueDay") AS "dueDay",
             MIN(i."createdAt") AS "createdAt",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.done)::int AS done,
             jsonb_agg(jsonb_build_object(
               'userId', i."userId", 'name', u.name, 'done', COALESCE(i.done, FALSE),
               'note', i."completionNote", 'at', i."completedAt") ORDER BY u.name) AS people
      FROM "SupportChecklistItem" i
      JOIN "User" u ON u.id = i."userId"
      WHERE i."taskGroupId" IS NOT NULL
        AND i."weekId" = p_week_id
      GROUP BY i."taskGroupId"
    ) t
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_close_meeting_recording(p_hub_id uuid, p_group_id uuid, p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can close recording';
  END IF;
  DELETE FROM public."MeetingRecordingOpening"
  WHERE "weekId" = p_week_id
    AND (("hubId" IS NOT NULL AND "hubId" = p_hub_id) OR ("groupId" IS NOT NULL AND "groupId" = p_group_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_checklist_task(p_token text, p_task_group_id uuid, p_week_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  n INT;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  DELETE FROM "SupportChecklistItem"
  WHERE "taskGroupId" = p_task_group_id AND (p_week_id IS NULL OR "weekId" = p_week_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_discussion_summary(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;

  RETURN (
    WITH grp AS (
      SELECT id FROM public."Group" WHERE "cohortId" = p_cohort_id AND "archivedAt" IS NULL
    ), msgs AS (
      SELECT gp."groupId", gp."createdAt"
      FROM public."GroupPost" gp JOIN grp ON grp.id = gp."groupId"
      WHERE gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      UNION ALL
      SELECT gp."groupId", r."createdAt"
      FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId" JOIN grp ON grp.id = gp."groupId"
      WHERE r."removedAt" IS NULL AND r."deletedAt" IS NULL AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
    )
    SELECT json_build_object(
      'groups', (SELECT count(*) FROM grp),
      'postsAndReplies', (SELECT count(*) FROM msgs WHERE "createdAt" >= v_week_start),
      'activeGroups', (SELECT count(DISTINCT "groupId") FROM msgs WHERE "createdAt" >= v_week_start),
      -- Posts and replies this week per group, so the Groups page can say which groups are talking.
      'byGroup', COALESCE((SELECT json_object_agg("groupId", n) FROM (SELECT "groupId", count(*) AS n FROM msgs WHERE "createdAt" >= v_week_start GROUP BY "groupId") t), '{}'::json),
      'openReports', (
        SELECT count(DISTINCT rp."postId")
        FROM public."GroupPostReport" rp JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN grp ON grp.id = gp."groupId"
        WHERE rp."resolvedAt" IS NULL AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_move_teen(p_participant_id uuid, p_to_support uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  rec "Participant";
  c "FollowUpContact";
  v_gender TEXT;
  v_cap INT;
  v_count INT;
  v_from UUID;
  v_me_name TEXT;
  v_to_name TEXT;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can move a teen'; END IF;
  -- Same lock as assign_teen_contacts, so the count below is not read while a sweep gives that support another teen.
  PERFORM pg_advisory_xact_lock(hashtext('assign_teen_contacts'));
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN RAISE EXCEPTION 'That person has no teen record to move'; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  IF c.id IS NULL OR c."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN RAISE EXCEPTION 'Only teens can be moved here'; END IF;
  v_gender := COALESCE(NULLIF(c.gender, ''), rec.gender);
  IF v_gender NOT IN ('Male', 'Female') THEN RAISE EXCEPTION 'This teen has no gender on file'; END IF;
  IF c."ownerId" IS NOT DISTINCT FROM p_to_support THEN RAISE EXCEPTION 'They are already with that Teen Support'; END IF;

  SELECT u.name INTO v_to_name
  FROM "User" u
  JOIN "SupportTagMember" m ON m."userId" = u.id
  JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
  WHERE u.id = p_to_support AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE AND u.gender = v_gender;
  IF v_to_name IS NULL THEN RAISE EXCEPTION 'A teen can only go to a Teen Support of the same gender'; END IF;

  v_cap := public.teen_cap_for(c."cohortId", v_gender);
  SELECT count(*) INTO v_count FROM "FollowUpContact" x
   WHERE x."ownerId" = p_to_support AND x."isTest" IS NOT TRUE AND x."archivedAt" IS NULL
     AND x."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') AND x."cohortId" IS NOT DISTINCT FROM c."cohortId";
  IF v_count >= v_cap AND NOT COALESCE(p_force, FALSE) THEN
    RAISE EXCEPTION 'FULL: % already has % teens (limit %)', v_to_name, v_count, v_cap;
  END IF;

  v_from := c."ownerId";
  SELECT name INTO v_me_name FROM "User" WHERE id = v_me;

  UPDATE "FollowUpContact" SET "ownerId" = p_to_support, "ownerAssignedAt" = now(), "updatedAt" = now() WHERE id = c.id;

  INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
  VALUES (c.id, v_from, p_to_support, 'Moved by admin ' || COALESCE(v_me_name, 'unknown') || CASE WHEN v_count >= v_cap THEN ' (over the limit)' ELSE '' END);

  IF v_from IS NOT NULL THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_from, 'A teen moved to another Teen Support', rec."fullName" || ' now goes to ' || v_to_name || ' and is off your list.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;
  INSERT INTO "Notification" ("userId", title, body, path, type)
  VALUES (p_to_support, 'A teen was added to your list', rec."fullName" || ' now goes to you as their Teen Support.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');

  RETURN jsonb_build_object('moved', TRUE, 'toName', v_to_name, 'count', v_count + 1, 'cap', v_cap);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_open_meeting_recording(p_hub_id uuid, p_group_id uuid, p_week_id integer, p_hours integer DEFAULT 24)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can open recording';
  END IF;
  IF (p_hub_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'Give either a hub or a group';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'Hours must be between 1 and 168';
  END IF;
  v_until := now() + make_interval(hours => p_hours);
  IF p_hub_id IS NOT NULL THEN
    INSERT INTO public."MeetingRecordingOpening" ("hubId", "weekId", "openUntil", "openedById")
    VALUES (p_hub_id, p_week_id, v_until, public.app_current_user_id())
    ON CONFLICT ("hubId", "weekId") WHERE "hubId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  ELSE
    INSERT INTO public."MeetingRecordingOpening" ("groupId", "weekId", "openUntil", "openedById")
    VALUES (p_group_id, p_week_id, v_until, public.app_current_user_id())
    ON CONFLICT ("groupId", "weekId") WHERE "groupId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  END IF;
  RETURN v_until;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_first_time(p_user_id uuid, p_force_password boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset the first-time experience';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  DELETE FROM public."TourProgress" WHERE "userId" = p_user_id;
  DELETE FROM public."HubRoleIntroSeen" WHERE "userId" = p_user_id;
  UPDATE public."UserAppState"
     SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW()
   WHERE "userId" = p_user_id;
  IF COALESCE(p_force_password, FALSE) THEN
    UPDATE public."User" SET "mustChangePassword" = TRUE WHERE id = p_user_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_participant_first_time(p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset the first-time experience';
  END IF;
  DELETE FROM public."TourProgress" WHERE "participantId" = p_participant_id;
  UPDATE public."ParticipantAppState"
     SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW()
   WHERE "participantId" = p_participant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_rest_tasks(p_token text, p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(t ORDER BY t."dueDate", t."createdAt")
    FROM (
      SELECT i."taskGroupId" AS "taskGroupId",
             MIN(i.label) AS label,
             MIN(i."dueDate") AS "dueDate",
             MIN(i."createdAt") AS "createdAt",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.done)::int AS done,
             jsonb_agg(jsonb_build_object(
               'userId', i."userId", 'name', u.name, 'done', COALESCE(i.done, FALSE),
               'note', i."completionNote", 'at', i."completedAt") ORDER BY u.name) AS people
      FROM "SupportChecklistItem" i
      JOIN "User" u ON u.id = i."userId"
      WHERE i."taskGroupId" IS NOT NULL AND i."weekId" IS NULL AND i."cohortId" = p_cohort_id
      GROUP BY i."taskGroupId", i."dueDate"
    ) t
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_support_onboarding_override(p_group_id uuid, p_step text, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can mark a support''s step done';
  END IF;
  IF p_step NOT IN ('INTRO', 'READY', 'MEETING') THEN
    RAISE EXCEPTION 'Unknown step %', p_step;
  END IF;
  IF p_done THEN
    INSERT INTO public."SupportOnboardingOverride" ("groupId", step, "setById")
    VALUES (p_group_id, p_step, public.app_current_user_id())
    ON CONFLICT ("groupId", step) DO UPDATE SET "setById" = EXCLUDED."setById", "setAt" = now();
  ELSE
    DELETE FROM public."SupportOnboardingOverride" WHERE "groupId" = p_group_id AND step = p_step;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_supports_overview(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.app_is_admin()) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'phone', u.phone, 'name', u.name, 'role', u.role, 'roles', u.roles,
        'isActive', u."isActive", 'isTest', u."isTest", 'deactivatedAt', u."deactivatedAt",
        'isCoordinator', u."isCoordinator", 'avatarUrl', u."avatarUrl", 'themeColor', u."themeColor",
        'birthYear', u."birthYear", 'hubLastSeenAt', u."hubLastSeenAt", 'whatsappGroupUrl', u."whatsappGroupUrl",
        'gender', u.gender, 'ageRange', u."ageRange", 'birthday', u.birthday,
        'onboardingCompleted', u."onboardingCompleted", 'onboardingReplayCount', u."onboardingReplayCount",
        'onboardingLastReplayAt', u."onboardingLastReplayAt", 'mustChangePassword', u."mustChangePassword",
        'createdAt', u."createdAt", 'updatedAt', u."updatedAt") ORDER BY u."createdAt" DESC)
      FROM public."User" u WHERE u."isActive" IS TRUE), '[]'::jsonb),

    'memberIds', COALESCE((
      SELECT jsonb_agg(uc."userId") FROM public."UserCohort" uc WHERE uc."cohortId" = p_cohort_id), '[]'::jsonb),

    'hubs', COALESCE((
      SELECT jsonb_agg(to_jsonb(h)
        || jsonb_build_object(
          'lead', (SELECT jsonb_build_object('id', l.id, 'name', l.name) FROM public."User" l WHERE l.id = h."leadUserId"),
          'assistantLead', (SELECT jsonb_build_object('id', a.id, 'name', a.name) FROM public."User" a WHERE a.id = h."assistantLeadUserId")
        ) ORDER BY h.name)
      FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id), '[]'::jsonb),

    'memberships', COALESCE((
      SELECT jsonb_agg(to_jsonb(m)) FROM public."HubMembership" m WHERE m."cohortId" = p_cohort_id), '[]'::jsonb),

    'kinds', COALESCE((
      SELECT jsonb_object_agg(uc."userId", COALESCE(uc."supportKind", 'PARTICIPANT_SUPPORT'))
      FROM public."UserCohort" uc WHERE uc."cohortId" = p_cohort_id), '{}'::jsonb),

    'notedIds', COALESCE((
      SELECT jsonb_agg(DISTINCT n."supportId")
      FROM public."SupportNote" n
      WHERE n."noteType" = 'NOTE'
        AND (n."hubId" IS NULL OR n."hubId" IN (SELECT h2.id FROM public."SupportHub" h2 WHERE h2."cohortId" = p_cohort_id))
    ), '[]'::jsonb),

    'followUpLoad', COALESCE((
      SELECT jsonb_object_agg(t."ownerId", t.open_count)
      FROM (
        SELECT c."ownerId", COUNT(*) AS open_count
        FROM public."FollowUpContact" c
        WHERE c."ownerId" IS NOT NULL
          AND c."archivedAt" IS NULL
          AND COALESCE(c."isTest", FALSE) = FALSE
          AND (c."cohortId" = p_cohort_id OR c."cohortId" IS NULL)
          -- Not a teen, and not closed: closed is Access confirmed, Attended, Not interested (and its two variants), No
          -- response, or a wrong number (a wrong-number reply or call only counts when the status itself is not one of
          -- the stages that win over it).
          AND COALESCE(c."registrationStatus"::text, '') NOT IN ('ACCESS_CONFIRMED', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED',
                                                           'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
          AND NOT (COALESCE(c."registrationStatus"::text, '') NOT IN ('LOGIN_ISSUE', 'LOGIN_SHARED', 'REGISTERED', 'NEXT_COHORT')
                   AND (c."replyStatus" = 'INCORRECT_NUMBER' OR c."callStatus" = 'INCORRECT_NUMBER'))
        GROUP BY c."ownerId"
      ) t), '{}'::jsonb),

    'lastActive', COALESCE((
      SELECT jsonb_object_agg(x.id, x.seen)
      FROM (
        SELECT u.id, GREATEST((SELECT MAX(s."lastSeenAt") FROM public."AppSession" s WHERE s."userId" = u.id), u."hubLastSeenAt") AS seen
        FROM public."User" u
        WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
          AND (EXISTS (SELECT 1 FROM public."Group" g WHERE g."cohortId" = p_cohort_id AND g."supportId" = u.id)
               OR (u."isActive" IS NOT FALSE
                   AND EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id)))
      ) x), '{}'::jsonb),

    'reports', COALESCE((
      SELECT jsonb_agg(to_jsonb(pn)
        || jsonb_build_object('author', (SELECT jsonb_build_object('id', au.id, 'name', au.name) FROM public."User" au WHERE au.id = pn."authorId"))
        ORDER BY pn."createdAt" DESC)
      FROM public."ParticipantNote" pn
      WHERE pn."noteType" = 'MEETING'
        AND pn."groupId" IN (SELECT g2.id FROM public."Group" g2 WHERE g2."cohortId" = p_cohort_id)
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_teen_move_targets(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec "Participant";
  c "FollowUpContact";
  v_gender TEXT;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can move a teen'; END IF;
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  v_gender := COALESCE(NULLIF(c.gender, ''), rec.gender);
  IF c.id IS NULL OR v_gender NOT IN ('Male', 'Female') THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'userId', u.id, 'name', u.name,
      'count', (SELECT count(*) FROM "FollowUpContact" x
                 WHERE x."ownerId" = u.id AND x."isTest" IS NOT TRUE AND x."archivedAt" IS NULL
                   AND x."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') AND x."cohortId" IS NOT DISTINCT FROM c."cohortId"),
      'cap', public.teen_cap_for(c."cohortId", v_gender),
      'current', u.id = c."ownerId"
    ) ORDER BY u.name)
    FROM "User" u
    JOIN "SupportTagMember" m ON m."userId" = u.id
    JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE AND u.gender = v_gender
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.age_range_for_age(p_age integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_age IS NULL OR p_age < 5 OR p_age > 100 THEN NULL
    WHEN p_age < 18 THEN '10 - 17'
    WHEN p_age <= 24 THEN '18 - 24'
    WHEN p_age <= 34 THEN '25 - 34'
    WHEN p_age <= 44 THEN '35 - 44'
    WHEN p_age <= 59 THEN '45 - 59'
    ELSE '60 and above'
  END
$function$;

CREATE OR REPLACE FUNCTION public.announcement_popup_ack(p_token text, p_announcement uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  pid UUID := public.app_participant_id(p_token);
BEGIN
  IF staff.id IS NULL AND pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE public."AnnouncementPopup"
  SET "ackedAt" = COALESCE("ackedAt", NOW())
  WHERE "announcementId" = p_announcement
    AND ((staff.id IS NOT NULL AND "userId" = staff.id) OR (staff.id IS NULL AND "participantId" = pid));
END;
$function$;

CREATE OR REPLACE FUNCTION public.announcement_popup_live(a "Announcement")
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a."requirePopup"
    AND a."sentAt" > NOW() - INTERVAL '14 days'
    AND (NOT COALESCE(a."showOnHome", FALSE) OR a."homeUntil" IS NULL OR a."homeUntil" > NOW());
$function$;

CREATE OR REPLACE FUNCTION public.announcement_popup_status(p_token text, p_announcement uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL OR staff.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN (
    SELECT json_build_object(
      'total', count(*),
      'acknowledged', count(*) FILTER (WHERE p."ackedAt" IS NOT NULL),
      'waiting', COALESCE(json_agg(COALESCE(u.name, pt."fullName") ORDER BY COALESCE(u.name, pt."fullName")) FILTER (WHERE p."ackedAt" IS NULL), '[]'::JSON)
    )
    FROM public."AnnouncementPopup" p
    LEFT JOIN public."User" u ON u.id = p."userId"
    LEFT JOIN public."Participant" pt ON pt.id = p."participantId"
    WHERE p."announcementId" = p_announcement
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.announcement_popups_pending(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  pid UUID := public.app_participant_id(p_token);
  out JSON;
BEGIN
  IF staff.id IS NULL AND pid IS NULL THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', a.id, 'subject', a.subject, 'body', a.body,
    'heading', a."homeLabel", 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'sentAt', a."sentAt"
  ) ORDER BY a."sentAt"), '[]'::JSON)
  INTO out
  FROM public."AnnouncementPopup" p
  JOIN public."Announcement" a ON a.id = p."announcementId"
  WHERE p."ackedAt" IS NULL
    AND public.announcement_popup_live(a)
    AND ((staff.id IS NOT NULL AND p."userId" = staff.id AND COALESCE(staff."isTest", FALSE) = FALSE)
      OR (staff.id IS NULL AND p."participantId" = pid
          AND NOT EXISTS (SELECT 1 FROM public."Participant" pt WHERE pt.id = pid AND COALESCE(pt."isTest", FALSE))));
  RETURN out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.answer_followup_check(p_answer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_answer NOT IN ('YES', 'NOT_NOW') THEN RAISE EXCEPTION 'INVALID_ANSWER'; END IF;
  UPDATE "FollowUpOwnerCheck"
  SET answer = p_answer, "answeredAt" = now(),
      extended = (p_answer = 'YES'),
      "deadlineAt" = CASE WHEN p_answer = 'YES' THEN now() + interval '24 hours' ELSE now() END
  WHERE "ownerId" = me AND "closedAt" IS NULL AND answer IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_admin_check(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF u.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_admin_client_activity(p_token text, p_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.api_admin_check(p_token);
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'at') DESC) FROM (
      SELECT jsonb_build_object('path', l.path, 'status', l.status, 'teenRecords', l."teenRecords",
        'durationMs', l."durationMs", 'at', l."createdAt") AS x
      FROM "ApiRequestLog" l WHERE l."clientId" = p_id
      ORDER BY l."createdAt" DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) s), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_admin_clients(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.api_admin_check(p_token);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'keyPrefix', c."keyPrefix", 'scopes', to_jsonb(c.scopes), 'notes', c.notes,
        'isActive', c."isActive" AND c."revokedAt" IS NULL, 'createdAt', c."createdAt", 'lastUsedAt', c."lastUsedAt",
        'createdBy', (SELECT u.name FROM "User" u WHERE u.id = c."createdById"),
        'requests7d', (SELECT count(*) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '7 days'),
        'refused7d', (SELECT count(*) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '7 days' AND l.status >= 400),
        'teenRecords30d', (SELECT COALESCE(sum(l."teenRecords"), 0) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '30 days')
      ) ORDER BY c."createdAt" DESC)
    FROM "ApiClient" c), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_admin_create_client(p_token text, p_name text, p_scopes text[], p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  admin "User" := public.api_admin_check(p_token);
  created JSONB;
BEGIN
  IF length(trim(COALESCE(p_name, ''))) > 80 THEN
    RAISE EXCEPTION 'Keep the name under 80 characters';
  END IF;
  created := public.api_create_client(p_name, p_scopes, NULLIF(left(trim(COALESCE(p_notes, '')), 500), ''));
  UPDATE "ApiClient" SET "createdById" = admin.id WHERE id = (created->>'id')::UUID;
  RETURN created;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_admin_update_client(p_token text, p_id uuid, p_active boolean DEFAULT NULL::boolean, p_scopes text[] DEFAULT NULL::text[], p_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['people:lookup', 'people:read', 'teens:read', 'faith:read', 'team:read',
    'groups:read', 'schedule:read', 'planner:read', 'content:read', 'birthdays:read', 'cohorts:read'];
BEGIN
  PERFORM public.api_admin_check(p_token);
  IF NOT EXISTS (SELECT 1 FROM "ApiClient" WHERE id = p_id) THEN
    RAISE EXCEPTION 'That app no longer exists';
  END IF;
  IF p_scopes IS NOT NULL AND (cardinality(p_scopes) = 0 OR NOT (p_scopes <@ allowed)) THEN
    RAISE EXCEPTION 'Choose at least one thing the app may read';
  END IF;
  IF p_name IS NOT NULL AND (trim(p_name) = '' OR length(trim(p_name)) > 80) THEN
    RAISE EXCEPTION 'Give the app a name under 80 characters';
  END IF;
  UPDATE "ApiClient" SET
    "isActive" = COALESCE(p_active, "isActive"),
    "revokedAt" = CASE WHEN p_active IS NULL THEN "revokedAt" WHEN p_active THEN NULL ELSE COALESCE("revokedAt", NOW()) END,
    scopes = COALESCE(p_scopes, scopes),
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    notes = CASE WHEN p_notes IS NULL THEN notes ELSE NULLIF(left(trim(p_notes), 500), '') END
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_announcements(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('announcements', COALESCE(jsonb_agg(x ORDER BY (x->>'sentAt') DESC), '[]'::JSONB))
  FROM (
    SELECT jsonb_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'sentAt', a."sentAt",
      'audience', a.audience, 'scope', a.scope, 'cohort', (SELECT c.name FROM public."Cohort" c WHERE c.id = a."cohortId"),
      'link', CASE WHEN a."linkUrl" IS NULL THEN NULL ELSE jsonb_build_object('url', a."linkUrl", 'label', a."linkLabel") END) AS x
    FROM public."Announcement" a
    WHERE a."sentAt" IS NOT NULL
      AND a."targetUserId" IS NULL AND a."targetParticipantId" IS NULL AND a."targetGroupId" IS NULL
      AND a."targetHubId" IS NULL AND a."targetLabelId" IS NULL
      AND COALESCE(cardinality(a."targetUserIds"), 0) = 0 AND COALESCE(cardinality(a."targetHubJobs"), 0) = 0
      AND (a."cohortId" IS NULL OR public.api_real_cohort(a."cohortId"))
    ORDER BY a."sentAt" DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.api_authenticate(p_key_hash text, p_method text, p_path text, p_limit integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  client public."ApiClient";
  used INTEGER;
  limited BOOLEAN;
  request_id BIGINT;
BEGIN
  SELECT * INTO client FROM public."ApiClient"
  WHERE "keyHash" = p_key_hash AND "isActive" AND "revokedAt" IS NULL;
  IF client.id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('api-client:' || client.id::TEXT));
  SELECT count(*) INTO used FROM public."ApiRequestLog" l
  WHERE l."clientId" = client.id AND l."createdAt" > NOW() - INTERVAL '1 minute' AND l.status <> 429;
  limited := used >= p_limit;
  INSERT INTO public."ApiRequestLog" ("clientId", method, path, status)
  VALUES (client.id, left(p_method, 10), left(p_path, 300), CASE WHEN limited THEN 429 ELSE 0 END)
  RETURNING id INTO request_id;
  UPDATE public."ApiClient" SET "lastUsedAt" = NOW() WHERE id = client.id;
  RETURN jsonb_build_object('id', client.id, 'name', client.name, 'scopes', to_jsonb(client.scopes),
    'requestId', request_id, 'limited', limited);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_birthday_person(p_kind text, p_id uuid, p_teens boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  u public."User";
BEGIN
  IF p_kind = 'participant' THEN
    SELECT * INTO p FROM public."Participant" WHERE id = p_id AND COALESCE("isTest", FALSE) = FALSE AND "dateOfBirth" IS NOT NULL;
    IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") OR (public.api_is_teen(p.id) AND NOT p_teens) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('name', p."fullName", 'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), ''),
      'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT, 'roleLabel', 'Participant',
      'isTeen', public.api_is_teen(p.id));
  ELSIF p_kind = 'team' THEN
    SELECT * INTO u FROM public."User" WHERE id = p_id AND COALESCE("isTest", FALSE) = FALSE AND "isActive" IS NOT FALSE
      AND birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';
    IF u.id IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('name', u.name, 'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''),
      'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
      'roleLabel', CASE WHEN 'ADMIN' = ANY(public.app_user_roles(u)::TEXT[]) THEN 'FOF Team' ELSE 'Support' END, 'isTeen', FALSE);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_birthdays(p_days integer, p_teens boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  today DATE := (timezone('Africa/Lagos', now()))::date;
  span INTEGER := LEAST(GREATEST(COALESCE(p_days, 0), 0), 366);
BEGIN
  RETURN jsonb_build_object('today', today, 'birthdays', COALESCE((
    SELECT jsonb_agg(b ORDER BY (b->>'daysUntil')::INT, b->>'name') FROM (
      SELECT jsonb_build_object(
          'kind', 'participant', 'id', p.id, 'name', p."fullName",
          'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT,
          'daysUntil', public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today,
          'cohort', c.name, 'isTeen', public.api_is_teen(p.id),
          'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), '')) AS b
      FROM public."Participant" p JOIN public."Cohort" c ON c.id = p."cohortId"
      WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND p."dateOfBirth" IS NOT NULL AND public.api_real_cohort(c.id)
        AND public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today <= span
        AND (p_teens OR NOT public.api_is_teen(p.id))
      UNION ALL
      SELECT jsonb_build_object(
          'kind', 'team', 'id', u.id, 'name', u.name,
          'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
          'daysUntil', public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today,
          'roles', to_jsonb(public.app_user_roles(u)::TEXT[]), 'isTeen', FALSE,
          'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''))
      FROM public."User" u
      WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
        AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        AND public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today <= span
    ) s), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_groups(p_cohort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'groups', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'isTeenGroup', COALESCE(g."isTeenGroup", FALSE),
        'meetingDay', g."meetingDay", 'meetingTime', g."meetingTime", 'callPlatform', g."callPlatform",
        'support', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) END,
        'participants', (SELECT count(*) FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
                         WHERE gp."groupId" = g.id AND COALESCE(p."isTest", FALSE) = FALSE)
      ) ORDER BY g.name)
    FROM public."Group" g LEFT JOIN public."User" s ON s.id = g."supportId"
    WHERE g."cohortId" = cid AND g."archivedAt" IS NULL), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_hubs(p_cohort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'hubs', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'meetingDay', h."meetingDay", 'meetingTime', h."meetingTime", 'callPlatform', h."callPlatform",
        'lead', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone) FROM public."User" u WHERE u.id = h."leadUserId"),
        'assistantLead', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone) FROM public."User" u WHERE u.id = h."assistantLeadUserId"),
        'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name)
                             FROM public."HubMembership" hm JOIN public."User" u ON u.id = hm."userId"
                             WHERE hm."hubId" = h.id AND COALESCE(u."isTest", FALSE) = FALSE), '[]'::JSONB)
      ) ORDER BY h.name)
    FROM public."SupportHub" h WHERE h."cohortId" = cid), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_id(p_cohort text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID;
BEGIN
  IF lower(COALESCE(p_cohort, '')) = 'current' THEN
    cid := public.current_programme_cohort_id();
  ELSIF p_cohort ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    cid := p_cohort::UUID;
  END IF;
  IF cid IS NULL OR NOT public.api_real_cohort(cid) THEN
    RETURN NULL;
  END IF;
  RETURN cid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_participants(p_cohort text, p_teens boolean, p_group_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'cohortId', cid,
    'total', (SELECT count(*) FROM public."Participant" p WHERE p."cohortId" = cid AND COALESCE(p."isTest", FALSE) = FALSE
              AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public."GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = p_group_id))),
    'limit', lim,
    'offset', off,
    'participants', COALESCE((
      SELECT jsonb_agg(public.api_participant_json(x.id, p_teens) ORDER BY x."fullName", x.id)
      FROM (
        SELECT p.id, p."fullName" FROM public."Participant" p
        WHERE p."cohortId" = cid AND COALESCE(p."isTest", FALSE) = FALSE
          AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public."GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = p_group_id))
        ORDER BY p."fullName", p.id LIMIT lim OFFSET off
      ) x), '[]'::JSONB)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_schedule(p_cohort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('weekNumber', w."weekNumber", 'days', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day', d."dayName", 'activities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'time', a.time, 'period', a.period, 'description', a.description,
                'teams', COALESCE((SELECT jsonb_agg(t.name ORDER BY at."order") FROM public."ActivityTeam" at JOIN public."Team" t ON t.id = at."teamId" WHERE at."activityId" = a.id), '[]'::JSONB)
              ) ORDER BY a."orderIndex", a.id)
            FROM public."Activity" a WHERE a."dayId" = d.id), '[]'::JSONB))
          ORDER BY array_position(ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], lower(d."dayName")) NULLS LAST, d.id)
        FROM public."Day" d WHERE d."weekId" = w.id), '[]'::JSONB)) ORDER BY w."weekNumber")
    FROM public."Week" w WHERE w."cohortId" = cid), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_team(p_cohort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'team', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email,
        'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''),
        'roles', to_jsonb(public.app_user_roles(u)::TEXT[]),
        'supportKind', uc."supportKind",
        'hubs', COALESCE((SELECT jsonb_agg(h.name ORDER BY h.name) FROM public."HubMembership" hm JOIN public."SupportHub" h ON h.id = hm."hubId"
                          WHERE hm."userId" = u.id AND hm."cohortId" = cid), '[]'::JSONB),
        'groups', COALESCE((SELECT jsonb_agg(g.name ORDER BY g.name) FROM public."Group" g
                            WHERE g."supportId" = u.id AND g."cohortId" = cid AND g."archivedAt" IS NULL), '[]'::JSONB)
      ) ORDER BY u.name)
    FROM public."UserCohort" uc JOIN public."User" u ON u.id = uc."userId"
    WHERE uc."cohortId" = cid AND COALESCE(u."isTest", FALSE) = FALSE AND u."isActive" IS NOT FALSE), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_weeks(p_cohort text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
  c public."Cohort";
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = cid;
  RETURN jsonb_build_object('cohortId', cid, 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'weekNumber', w."weekNumber", 'title', w.title,
        'classDate', COALESCE(w."classDate", c."startDate" + (w."weekNumber" - 1) * 7),
        'teacher', CASE WHEN w."teacherName" IS NULL THEN NULL ELSE jsonb_build_object('name', w."teacherName", 'role', w."teacherRole", 'photoUrl', w."teacherPhotoUrl") END,
        'classGraphicUrl', w."classGraphicUrl",
        'hasManual', w."manualDocumentUrl" IS NOT NULL,
        'hasRecap', w."recapDocumentUrl" IS NOT NULL OR NULLIF(trim(COALESCE(w."recapSummary", '')), '') IS NOT NULL
      ) ORDER BY w."weekNumber")
    FROM public."Week" w WHERE w."cohortId" = cid), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohorts_current()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_id UUID := public.current_programme_cohort_id();
  today DATE := (timezone('Africa/Lagos', now()))::date;
  cur public."Cohort";
  nxt public."Cohort";
BEGIN
  SELECT * INTO cur FROM public."Cohort" WHERE id = current_id AND public.api_real_cohort(id);
  SELECT * INTO nxt FROM public."Cohort" c
  WHERE public.api_real_cohort(c.id) AND c."startDate" > COALESCE(cur."startDate", today) AND c.id IS DISTINCT FROM cur.id
  ORDER BY c."startDate" ASC LIMIT 1;
  RETURN jsonb_build_object(
    'current', CASE WHEN cur.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', cur.id, 'name', cur.name, 'startDate', cur."startDate", 'endDate', cur."endDate",
      'running', cur."startDate" <= today AND (cur."endDate" IS NULL OR cur."endDate" >= today)) END,
    'next', CASE WHEN nxt.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', nxt.id, 'name', nxt.name, 'startDate', nxt."startDate", 'endDate', nxt."endDate") END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_create_client(p_name text, p_scopes text[], p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['people:lookup', 'people:read', 'teens:read', 'faith:read', 'team:read',
    'groups:read', 'schedule:read', 'planner:read', 'content:read', 'birthdays:read', 'cohorts:read'];
  raw_key TEXT;
  new_id UUID;
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_scopes IS NULL OR cardinality(p_scopes) = 0 OR NOT (p_scopes <@ allowed) THEN
    RAISE EXCEPTION 'Scopes must be some of %', allowed;
  END IF;
  raw_key := 'fof_live_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO public."ApiClient" (name, "keyPrefix", "keyHash", scopes, notes)
  VALUES (trim(p_name), left(raw_key, 15), encode(sha256(convert_to(raw_key, 'UTF8')), 'hex'), p_scopes, p_notes)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'name', trim(p_name), 'scopes', to_jsonb(p_scopes), 'key', raw_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_finish_request(p_request_id bigint, p_status integer, p_duration_ms integer, p_teen_records integer DEFAULT 0)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public."ApiRequestLog"
  SET status = p_status, "durationMs" = p_duration_ms, "teenRecords" = GREATEST(COALESCE(p_teen_records, 0), 0)
  WHERE id = p_request_id;
$function$;

CREATE OR REPLACE FUNCTION public.api_is_teen(p_participant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.fof_is_teen_age(p."ageRange") OR EXISTS (
    SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND COALESCE(g."isTeenGroup", FALSE) AND g."archivedAt" IS NULL)
  FROM public."Participant" p WHERE p.id = p_participant_id;
$function$;

CREATE OR REPLACE FUNCTION public.api_participant_json(p_participant_id uuid, p_teens boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  c public."Cohort";
  teen BOOLEAN;
  grp JSONB;
  contact public."FollowUpContact";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = p."cohortId";
  teen := public.api_is_teen(p.id);
  IF teen AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'name', p."fullName", 'isTeen', TRUE, 'restricted', TRUE,
      'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"));
  END IF;

  SELECT jsonb_build_object(
      'id', g.id, 'name', g.name, 'isTeenGroup', COALESCE(g."isTeenGroup", FALSE),
      'meetingDay', g."meetingDay", 'meetingTime', g."meetingTime",
      'support', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) END)
  INTO grp
  FROM public."GroupParticipant" gp
  JOIN public."Group" g ON g.id = gp."groupId"
  LEFT JOIN public."User" s ON s.id = g."supportId"
  WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL
  LIMIT 1;

  SELECT * INTO contact FROM public."FollowUpContact" WHERE id = p."followUpContactId";

  RETURN jsonb_build_object(
    'id', p.id,
    'name', p."fullName",
    'phone', p.phone,
    'email', p.email,
    'gender', p.gender,
    'ageRange', p."ageRange",
    'dateOfBirth', p."dateOfBirth",
    'occupation', p.occupation,
    'departments', to_jsonb(COALESCE(p.departments, ARRAY[]::TEXT[])),
    'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), ''),
    'status', p.status,
    'registeredOn', p."registrationDate",
    'isTeen', teen,
    'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
    'cohortFinished', c."endDate" IS NOT NULL AND c."endDate" < (timezone('Africa/Lagos', now()))::date,
    'group', grp
  ) || CASE WHEN teen THEN jsonb_build_object('guardian', jsonb_build_object(
          'name', NULLIF(trim(COALESCE(contact."guardianName", '')), ''),
          'phone', COALESCE(NULLIF(trim(COALESCE(p."guardianPhone", '')), ''), NULLIF(trim(COALESCE(contact."guardianPhone", '')), ''))))
       ELSE '{}'::JSONB END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_people_lookup(p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  phone_key TEXT := public.fof_phone_key(p_phone);
  email_key TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  today DATE := (timezone('Africa/Lagos', now()))::date;
  people JSONB;
  team JSONB;
BEGIN
  IF phone_key IS NULL AND email_key IS NULL THEN
    IF NULLIF(trim(COALESCE(p_phone, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'That phone number is not one FOF can read';
    END IF;
    RAISE EXCEPTION 'Give a phone number or an email';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p."fullName",
      'status', p.status,
      'isTeen', public.api_is_teen(p.id),
      'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
      'cohortFinished', c."endDate" IS NOT NULL AND c."endDate" < today,
      'inGroup', EXISTS (
        SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL),
      'registeredOn', p."registrationDate"
    ) ORDER BY c."startDate" DESC NULLS LAST), '[]'::jsonb)
  INTO people
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  WHERE COALESCE(p."isTest", FALSE) = FALSE
    AND public.api_real_cohort(c.id)
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(p.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(p.email)) = email_key));

  SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb)
  INTO team
  FROM public."User" u
  CROSS JOIN LATERAL unnest(public.app_user_roles(u)::TEXT[]) AS r
  WHERE COALESCE(u."isTest", FALSE) = FALSE
    AND COALESCE(u."isActive", TRUE)
    AND r <> 'PARTICIPANT'
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(u.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(u.email)) = email_key));

  RETURN jsonb_build_object(
    'found', jsonb_array_length(people) > 0 OR jsonb_array_length(team) > 0,
    'participants', people,
    'teamRoles', team
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_person(p_participant_id uuid, p_teens boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.api_participant_json(p_participant_id, p_teens);
$function$;

CREATE OR REPLACE FUNCTION public.api_person_attendance(p_participant_id uuid, p_teens boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  c public."Cohort";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  IF public.api_is_teen(p.id) AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = p."cohortId";
  RETURN jsonb_build_object('id', p.id, 'isTeen', public.api_is_teen(p.id), 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'weekNumber', w."weekNumber",
        'classDate', COALESCE(w."classDate", c."startDate" + (w."weekNumber" - 1) * 7),
        'sundayClass', a.status,
        'lateExcused', CASE WHEN a.status IN ('LATE', 'LEFT_EARLY') THEN COALESCE(a."lateExcused", FALSE) END,
        'groupMeeting', m.status
      ) ORDER BY w."weekNumber")
    FROM public."Week" w
    LEFT JOIN public."AttendanceRecord" a ON a."weekId" = w.id AND a."participantId" = p.id
    LEFT JOIN public."MeetingAttendance" m ON m."weekId" = w.id AND m."participantId" = p.id
    WHERE w."cohortId" = c.id), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_person_faith_project(p_participant_id uuid, p_teens boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  IF public.api_is_teen(p.id) AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  RETURN jsonb_build_object('id', p.id, 'isTeen', public.api_is_teen(p.id), 'faithProject', (
    SELECT jsonb_build_object('title', f.title, 'text', f.body, 'status', f.status, 'category', fc.name,
      'sharedForPrayer', COALESCE(f."sharedForPrayer", FALSE), 'createdAt', f."createdAt", 'updatedAt', f."updatedAt")
    FROM public."FaithProject" f LEFT JOIN public."FaithProjectCategory" fc ON fc.id = f."categoryId"
    WHERE f."participantId" = p.id
    ORDER BY f."updatedAt" DESC NULLS LAST LIMIT 1));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_person_programme(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  person public."Participant";
  cohort public."Cohort";
  today DATE := (timezone('Africa/Lagos', now()))::date;
BEGIN
  SELECT * INTO person FROM public."Participant"
  WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF person.id IS NULL OR NOT public.api_real_cohort(person."cohortId") THEN
    RETURN NULL;
  END IF;
  SELECT * INTO cohort FROM public."Cohort" WHERE id = person."cohortId";

  RETURN jsonb_build_object(
    'id', person.id,
    'cohort', jsonb_build_object('id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate"),
    'cohortFinished', cohort."endDate" IS NOT NULL AND cohort."endDate" < today,
    'weeksInProgramme', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id),
    -- A finished cohort held every week. Otherwise a week without a class date (older cohorts, and week 1) is taken
    -- as falling weekly from the cohort's start date.
    'weeksHeld', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id
                  AND (cohort."endDate" < today
                    OR COALESCE(w."classDate", cohort."startDate" + (w."weekNumber" - 1) * 7) <= today)),
    -- Same counting as FOF's own attendance figures: late or leaving early counts as present (lateOrLeftEarly says how many).
    'sundayClass', jsonb_build_object(
      'present', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND (a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY'))),
      'lateOrLeftEarly', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND a.status IN ('LATE', 'LEFT_EARLY')),
      'excused', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'EXCUSED'),
      'absent', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                 WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'ABSENT')),
    'groupMeetings', jsonb_build_object(
      'joined', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'JOINED'),
      'excused', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                  WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'EXCUSED'),
      'missed', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'MISSED'))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_person_programme_for(p_participant_id uuid, p_teens boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.api_is_teen(p_participant_id) AND NOT p_teens THEN
    IF public.api_person(p_participant_id, FALSE) IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('id', p_participant_id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  RETURN public.api_person_programme(p_participant_id) || jsonb_build_object('isTeen', public.api_is_teen(p_participant_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_planner_inputs()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
        'startDate', c."startDate", 'endDate', c."endDate",
        'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('weekNumber', w."weekNumber", 'classDate', w."classDate") ORDER BY w."weekNumber")
                           FROM public."Week" w WHERE w."cohortId" = c.id), '[]'::JSONB)) ORDER BY c."startDate")
      FROM public."Cohort" c WHERE c."startDate" IS NOT NULL AND public.api_real_cohort(c.id)), '[]'::JSONB),
    'plannedDates', COALESCE((SELECT s.value::JSONB FROM public."AppSetting" s WHERE s."settingKey" = 'planner_planned_dates'), '{}'::JSONB),
    'churchEvents', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', e.name, 'startDate', e."startDate", 'endDate', e."endDate", 'stopsFof', e."stopsFof") ORDER BY e."startDate")
      FROM public."ChurchEvent" e), '[]'::JSONB),
    'publicHolidays', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', h.name, 'date', h.date, 'isEstimate', h."isEstimate") ORDER BY h.date)
      FROM public."PublicHoliday" h WHERE h.date >= (timezone('Africa/Lagos', now()))::date - 366), '[]'::JSONB)
  );
$function$;

CREATE OR REPLACE FUNCTION public.api_real_cohort(p_cohort_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."Cohort" c
    WHERE c.id = p_cohort_id
      AND COALESCE(c."isPractice", FALSE) = FALSE
      AND c.name NOT ILIKE 'ZZ%'
  );
$function$;

CREATE OR REPLACE FUNCTION public.api_resources()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('resources', COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName",
      'forParticipants', COALESCE(r."visibleToParticipants", FALSE), 'forSupports', COALESCE(r."visibleToSupports", FALSE),
      'cohort', (SELECT c.name FROM public."Cohort" c WHERE c.id = r."cohortId"), 'updatedAt', COALESCE(r."updatedAt", r."createdAt")
    ) ORDER BY COALESCE(r."updatedAt", r."createdAt") DESC), '[]'::JSONB))
  FROM public."Resource" r
  WHERE (COALESCE(r."visibleToParticipants", FALSE) OR COALESCE(r."visibleToSupports", FALSE))
    AND COALESCE(cardinality(r."hubIds"), 0) = 0
    AND (r."cohortId" IS NULL OR public.api_real_cohort(r."cohortId"));
$function$;

CREATE OR REPLACE FUNCTION public.api_scriptures()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.current_programme_cohort_id();
  start_date DATE;
  start_day INTEGER;
  today DATE := (timezone('Africa/Lagos', now()))::date;
BEGIN
  SELECT c."startDate" INTO start_date FROM public."Cohort" c WHERE c.id = cid;
  SELECT CASE WHEN s.value::TEXT ~ '^"?[0-9]+"?$' THEN trim(both '"' from s.value::TEXT)::INTEGER ELSE 1 END
  INTO start_day FROM public."AppSetting" s WHERE s."settingKey" = 'scripture_start_day';
  start_day := COALESCE(start_day, 1);
  IF start_date IS NULL THEN
    RETURN jsonb_build_object('scriptures', '[]'::JSONB);
  END IF;
  RETURN jsonb_build_object('scriptures', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'day', s."dayNumber",
        'opensOn', start_date + (start_day - 1) + (s."dayNumber" - 1),
        'imageUrl', s."imageUrl",
        'likes', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'LIKE'),
        'downloads', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'DOWNLOAD'),
        'shares', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'SHARE')
      ) ORDER BY s."dayNumber" DESC)
    FROM public."Scripture" s
    WHERE start_date + (start_day - 1) + (s."dayNumber" - 1) <= today), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_acted_as()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN cardinality(public.app_user_roles(u)) > 1
               AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::"Role", 'STAFF'::"Role")
              THEN public.app_effective_role(u, s."activeRole")::text END
  FROM "AppSession" s
  JOIN "User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.app_current_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT NULLIF(
    current_setting('request.headers', true)::json ->> 'x-session-token',
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s."userId"
  FROM "AppSession" s
  JOIN "User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.app_effective_role(u "User", p_active "Role")
 RETURNS "Role"
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT CASE WHEN p_active IS NOT NULL AND p_active = ANY (public.app_user_roles(u)) THEN p_active ELSE u.role END $function$;

CREATE OR REPLACE FUNCTION public.app_hub_can(p_hub_id uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN h."leadUserId" = public.app_current_user_id() THEN TRUE
      WHEN h."assistantLeadUserId" = public.app_current_user_id()
        THEN p_perm = ANY(COALESCE(h."assistantPermissions", ARRAY[]::TEXT[]))
      ELSE FALSE
    END
    FROM public."SupportHub" h
    WHERE h.id = p_hub_id
  ), FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "AppSession" s
    JOIN "User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND s."userId" IS NOT NULL
      AND u."isActive" IS NOT FALSE
      AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::"Role", 'STAFF'::"Role")
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "AppSession" s
    JOIN "User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND s."userId" IS NOT NULL
      AND u."isActive" IS NOT FALSE
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_lowest_role(u "User")
 RETURNS "Role"
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT r FROM unnest(public.app_user_roles(u)) r
      ORDER BY CASE r WHEN 'SUPPORT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SOP_PREPARER' THEN 3 WHEN 'ADMIN' THEN 4 ELSE 0 END ASC
      LIMIT 1 $function$;

CREATE OR REPLACE FUNCTION public.app_nudge_due()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  out JSON;
BEGIN
  WITH todo AS (
    SELECT n.owner_id,
           count(*) FILTER (WHERE n.reason = 'NOT_INSTALLED') AS not_installed,
           count(*) FILTER (WHERE n.reason = 'NO_ALERTS') AS no_alerts,
           array_agg(n.full_name ORDER BY n.full_name) AS names
    FROM public.app_nudge_people() n
    WHERE NOT EXISTS (SELECT 1 FROM "AppNudgeLog" l WHERE l."ownerId" = n.owner_id AND l."nudgeDate" = today)
    GROUP BY n.owner_id
  ), claimed AS (
    INSERT INTO "AppNudgeLog" ("ownerId", "nudgeDate")
    SELECT owner_id, today FROM todo
    ON CONFLICT DO NOTHING
    RETURNING "ownerId"
  )
  SELECT COALESCE(json_agg(json_build_object('ownerId', t.owner_id, 'notInstalled', t.not_installed, 'noAlerts', t.no_alerts, 'names', t.names)), '[]'::JSON)
  INTO out
  FROM todo t JOIN claimed c ON c."ownerId" = t.owner_id;
  RETURN out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_nudge_people()
 RETURNS TABLE(owner_id uuid, participant_id uuid, full_name text, phone text, reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  -- The owner is the support who followed them up (and shared the login); before they
  -- are in a group that is the only owner there is, and after, the group's support is the fallback.
  SELECT COALESCE(f."ownerId", gs."supportId") AS owner_id, p.id, p."fullName", p.phone,
    CASE WHEN s."installedAt" IS NULL THEN 'NOT_INSTALLED' ELSE 'NO_ALERTS' END
  FROM "Participant" p
  JOIN "Cohort" c ON c.id = p."cohortId"
  JOIN "ParticipantAccount" a ON a."participantId" = p.id
  LEFT JOIN "FollowUpContact" f ON f.id = p."followUpContactId"
  LEFT JOIN LATERAL (
    SELECT g."supportId" FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL AND g."supportId" IS NOT NULL
    ORDER BY g."createdAt" DESC LIMIT 1
  ) gs ON TRUE
  JOIN "User" u ON u.id = COALESCE(f."ownerId", gs."supportId") AND u."isActive" AND COALESCE(u."isTest", FALSE) = FALSE
  LEFT JOIN "ParticipantAppState" s ON s."participantId" = p.id
  WHERE p.status = 'ACTIVE'
    AND COALESCE(p."isTest", FALSE) = FALSE
    AND COALESCE(c."isPractice", FALSE) = FALSE
    AND c."startDate" IS NOT NULL
    AND c."startDate" > (NOW() AT TIME ZONE 'Africa/Lagos')::date
    AND a."isActive"
    AND a."passwordSetAt" IS NOT NULL
    AND (
      s."installedAt" IS NULL
      OR NOT EXISTS (SELECT 1 FROM "ParticipantPushSubscription" ps WHERE ps."participantId" = p.id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.app_participant_id(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL OR s."participantId" IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT p.id
    FROM "Participant" p
    JOIN "ParticipantAccount" a ON a."participantId" = p.id
    WHERE p.id = s."participantId" AND a."isActive" AND p.status = 'ACTIVE'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_role_rank(r "Role")
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT CASE r WHEN 'SUPPORT' THEN 1 WHEN 'SOP_PREPARER' THEN 2 WHEN 'ADMIN' THEN 3 ELSE 0 END $function$;

CREATE OR REPLACE FUNCTION public.app_session(p_token text)
 RETURNS "AppSession"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession";
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO s
  FROM "AppSession"
  WHERE "tokenHash" = encode(digest(p_token, 'sha256'), 'hex')
    AND "expiresAt" > NOW();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF s."lastSeenAt" < NOW() - INTERVAL '1 hour' THEN
    UPDATE "AppSession"
    SET "lastSeenAt" = NOW(), "expiresAt" = NOW() + INTERVAL '90 days'
    WHERE id = s.id;
  END IF;

  RETURN s;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_staff(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;
  -- A Team member passes every existing admin check. The app limits what they see; the database does not (yet).
  IF u.role = 'STAFF'::"Role" THEN
    u.role := 'ADMIN'::"Role";
  END IF;
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_staff_real(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  u "User";
BEGIN
  IF s.id IS NULL OR s."userId" IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO u FROM "User" WHERE id = s."userId" AND "isActive" IS NOT FALSE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- The role this login is acting as, exactly as it is.
  u.role := public.app_effective_role(u, s."activeRole");
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_user_roles(u "User")
 RETURNS "Role"[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT CASE WHEN cardinality(u.roles) = 0 THEN ARRAY[u.role] ELSE u.roles END $function$;

CREATE OR REPLACE FUNCTION public.approve_manual_registration(p_token text, p_contact_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  UPDATE public."FollowUpContact"
  SET "manualRegistrationAt" = now(),
      "manualRegistrationBy" = staff.id,
      "manualRegistrationReason" = trim(p_reason),
      "updatedAt" = now()
  WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_NOT_FOUND'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ask_manual_question(p_token text, p_week_id integer, p_body text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort_id UUID;
  v_is_teen BOOLEAN;
  v_group_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_row "ManualQuestion";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;

  SELECT "cohortId", public.fof_is_teen_age("ageRange") INTO v_cohort_id, v_is_teen FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (SELECT 1 FROM "Week" WHERE id = p_week_id AND "cohortId" = v_cohort_id) THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  SELECT g.id, g."supportId" INTO v_group_id, v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  INSERT INTO "ManualQuestion" ("participantId", "weekId", "cohortId", "groupId", body, "hideName")
  VALUES (person_id, p_week_id, v_cohort_id, v_group_id, v_body, COALESCE(v_is_teen, FALSE))
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'weekId', v_row."weekId", 'body', v_row.body, 'status', v_row.status,
    'reply', v_row.reply, 'createdAt', v_row."createdAt", 'supportId', v_support_id,
    'isPractice', COALESCE((SELECT "isPractice" FROM "Cohort" WHERE id = v_cohort_id), FALSE)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_followups_now(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  r jsonb;
  t jsonb;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  r := public.run_followup_assignment(TRUE);
  t := public.assign_teen_contacts(NULL);
  RETURN r || jsonb_build_object(
    'batches', public.merge_followup_batches(r->'batches', t->'batches'),
    'assigned', COALESCE((r->>'assigned')::int, 0) + COALESCE((t->>'assigned')::int, 0),
    'teen', t);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_teen_contacts(p_only_contact uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_tag UUID;
  v_load JSONB := '{}'::jsonb;      -- "<cohortId|''>|<ownerId>" -> teens held
  v_batches JSONB := '{}'::jsonb;   -- ownerId -> {"count": n, "names": [...]}
  v_stuck JSONB := '[]'::jsonb;
  v_assigned INT := 0;
  rec RECORD;
  v_target UUID;
  v_key TEXT;
  v_batch JSONB;
  v_names JSONB;
BEGIN
  SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';
  IF v_enabled IS DISTINCT FROM to_jsonb(true) THEN
    RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'batches', '{}'::jsonb, 'stuck', '[]'::jsonb);
  END IF;

  -- One run at a time: the cron, "Assign now" and teen_add_prospect must not each
  -- read the same loads and then all give a support their 4th teen.
  PERFORM pg_advisory_xact_lock(hashtext('assign_teen_contacts'));

  SELECT id INTO v_tag FROM "SupportTag" WHERE "systemKey" = 'TEEN_SUPPORT';

  -- Every teen a support already holds counts, onboarded or not.
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL AND c."isTest" IS NOT TRUE AND c."archivedAt" IS NULL
      AND c."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED')
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL AND c."archivedAt" IS NULL AND c."isTest" IS NOT TRUE
      AND c."registrationStatus" = 'TEENAGER'
      AND (p_only_contact IS NULL OR c.id = p_only_contact)
      -- The sweep only looks at the current cohort (or contacts with none yet), so an
      -- old cohort's leftover teen never takes a slot.
      AND (p_only_contact IS NOT NULL OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())
    ORDER BY c."createdAt" ASC
  LOOP
    IF NOT (public.followup_phone_is_valid(rec.phone) OR public.followup_phone_is_valid(rec."guardianPhone")) THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_NUMBER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;
    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_GENDER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Whoever added them, if they are a same-gender Teen Support with room.
    IF rec."registeredById" IS NOT NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender);
    END IF;

    -- Same gender, fewest teens first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender)
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_SAME_GENDER_ROOM', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact"
    SET "ownerId" = v_target, "updatedAt" = now()
    WHERE id = rec.id;

    v_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(rec."fullName"); END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'assigned', v_assigned, 'batches', v_batches, 'stuck', v_stuck);
END;
$function$;

CREATE OR REPLACE FUNCTION public.attendance_session_actor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT s."userId"
  FROM public."AppSession" s
  JOIN public."User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(extensions.digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.attendance_session_actor_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."AppSession" s
    JOIN public."User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(extensions.digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND u."isActive" IS NOT FALSE
      AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::public."Role", 'STAFF'::public."Role")
  );
$function$;

CREATE OR REPLACE FUNCTION public.attendance_week_locked(p_week_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    -- A running window (first start or an admin reopen) is open to supports.
    WHEN s."startedAt" IS NOT NULL AND s."finalizedAt" IS NULL AND s."closesAt" > NOW() THEN FALSE
    WHEN s."finalizedAt" IS NOT NULL THEN TRUE
    WHEN s."closesAt" IS NOT NULL AND s."closesAt" <= NOW() THEN TRUE
    -- An admin reopened a week that never had a timed window: open until it is finalised again.
    WHEN s."reopenedAt" IS NOT NULL THEN FALSE
    ELSE public.week_class_date(c."startDate", w."weekNumber", w."classDate") < (NOW() AT TIME ZONE 'Africa/Lagos')::date
  END
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id;
$function$;

CREATE OR REPLACE FUNCTION public.auto_finalize_sunday_attendance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_week_id INTEGER;
BEGIN
  FOR v_week_id IN
    SELECT w.id
    FROM public."Week" w
    JOIN public."Cohort" c ON c.id = w."cohortId"
    LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
    WHERE COALESCE(s."autoFinalizeAtNoon", TRUE) AND s."finalizedAt" IS NULL
      AND (timezone('Africa/Lagos', NOW()))::date = public.week_class_date(c."startDate", w."weekNumber", w."classDate")
      AND (timezone('Africa/Lagos', NOW()))::time >= TIME '12:00'
      AND EXISTS (SELECT 1 FROM public."Participant" p WHERE p."cohortId" = c.id AND p.status = 'ACTIVE')
      AND NOT EXISTS (
        SELECT 1 FROM public."Participant" p
        WHERE p."cohortId" = c.id AND p.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM public."AttendanceRecord" a WHERE a."weekId" = w.id AND a."participantId" = p.id)
      )
  LOOP
    INSERT INTO public."AttendanceSession" ("weekId") VALUES (v_week_id) ON CONFLICT ("weekId") DO NOTHING;
    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(), "finalizationMethod" = 'AUTO', "updatedAt" = NOW()
    WHERE "weekId" = v_week_id AND "finalizedAt" IS NULL;
    IF FOUND THEN
      PERFORM public.sync_attendance_follow_up_tasks(v_week_id);
      PERFORM public.notify_attendance_report(v_week_id);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.birthday_alerts_due()
 RETURNS TABLE(subject_key text, person_name text, kind text, birthday_date date, days_before integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH t AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::DATE AS today),
  people AS (
    SELECT 'u:' || u.id::TEXT AS k, u.name AS n, 'SUPPORT'::TEXT AS kind,
           substr(u.birthday, 1, 2)::INT AS m, substr(u.birthday, 4, 2)::INT AS d
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
      AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
      AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    UNION ALL
    SELECT 'p:' || p.id::TEXT, p."fullName", 'PARTICIPANT',
           EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT
    FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE
      AND COALESCE(c."isPractice", FALSE) = FALSE AND c.status = 'ACTIVE' AND p."dateOfBirth" IS NOT NULL
  )
  SELECT pe.k, pe.n, pe.kind, public.birthday_next(pe.m, pe.d, t.today), (public.birthday_next(pe.m, pe.d, t.today) - t.today)
  FROM people pe CROSS JOIN t
  WHERE (public.birthday_next(pe.m, pe.d, t.today) - t.today) IN (0, 1, 2)
    AND NOT EXISTS (
      SELECT 1 FROM "BirthdayAlertLog" l
      WHERE l."subjectKey" = pe.k AND l."birthdayDate" = public.birthday_next(pe.m, pe.d, t.today)
        AND l."daysBefore" = (public.birthday_next(pe.m, pe.d, t.today) - t.today)
    )
  ORDER BY 5 DESC, 2;
$function$;

CREATE OR REPLACE FUNCTION public.birthday_alerts_mark(p_alerts jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  INSERT INTO "BirthdayAlertLog" ("subjectKey", "birthdayDate", "daysBefore")
  SELECT a ->> 'subjectKey', (a ->> 'birthdayDate')::DATE, (a ->> 'daysBefore')::INT
  FROM jsonb_array_elements(p_alerts) a
  ON CONFLICT DO NOTHING;
$function$;

CREATE OR REPLACE FUNCTION public.birthday_next(p_month integer, p_day integer, p_today date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  y INT := EXTRACT(YEAR FROM p_today)::INT;
  d DATE;
BEGIN
  FOR i IN 0..1 LOOP
    BEGIN
      d := make_date(y + i, p_month, p_day);
    EXCEPTION WHEN OTHERS THEN
      d := make_date(y + i, p_month, p_day - 1);
    END;
    IF d >= p_today THEN RETURN d; END IF;
  END LOOP;
  RETURN make_date(y + 1, p_month, LEAST(p_day, 28));
END;
$function$;

CREATE OR REPLACE FUNCTION public.birthdays_list(p_token text, p_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  today DATE := (now() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  RETURN json_build_object(
    'today', today,
    'supports', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl",
          'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
          'daysUntil', public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today,
          'cohorts', COALESCE((SELECT json_agg(c.name ORDER BY c."startDate" DESC) FROM "UserCohort" uc JOIN "Cohort" c ON c.id = uc."cohortId" WHERE uc."userId" = u.id AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'), '[]'::JSON)
        ) AS r
        FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ) s
    ), '[]'::JSON),
    'participants', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', p.id, 'name', p."fullName", 'avatarUrl', p."avatarUrl",
          'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT,
          'daysUntil', public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today,
          'cohorts', json_build_array(c.name)
        ) AS r
        FROM "Participant" p
        JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'
          AND p."dateOfBirth" IS NOT NULL
          AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      ) s
    ), '[]'::JSON),
    'missing', json_build_object(
      'supports', (
        SELECT count(*) FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND (u.birthday IS NULL OR u.birthday !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ),
      'participants', (
        SELECT count(*) FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'
          AND p."dateOfBirth" IS NULL AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_discussion_feed(p_group_id uuid, p_access text, p_user_id uuid, p_participant_id uuid, p_before timestamp with time zone, p_limit integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_mod BOOLEAN := p_access IN ('SUPPORT', 'ADMIN');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_group public."Group";
  v_support public."User";
  v_posts JSON;
  v_pinned JSON;
  v_more BOOLEAN;
BEGIN
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  SELECT * INTO v_support FROM public."User" WHERE id = v_group."supportId";

  WITH cand AS (
    SELECT gp.id
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id
      AND gp."deletedAt" IS NULL
      AND (gp."pinnedAt" IS NULL OR gp."removedAt" IS NOT NULL)
      AND (p_before IS NULL OR gp."createdAt" < p_before)
    ORDER BY gp."createdAt" DESC
    LIMIT v_limit + 1
  )
  SELECT count(*) > v_limit INTO v_more FROM cand;

  WITH page AS (
    SELECT gp.id, gp."createdAt"
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id
      AND gp."deletedAt" IS NULL
      AND (gp."pinnedAt" IS NULL OR gp."removedAt" IS NOT NULL)
      AND (p_before IS NULL OR gp."createdAt" < p_before)
    ORDER BY gp."createdAt" DESC
    LIMIT v_limit
  ), shaped AS (
    SELECT page."createdAt", public.discussion_post_json(page.id, v_mod, p_user_id, p_participant_id) AS j
    FROM page
  )
  SELECT COALESCE(json_agg(j ORDER BY "createdAt" DESC), '[]'::json) INTO v_posts FROM shaped;

  IF p_before IS NULL THEN
    SELECT public.discussion_post_json(gp.id, v_mod, p_user_id, p_participant_id) INTO v_pinned
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id AND gp."pinnedAt" IS NOT NULL
      AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
    ORDER BY gp."pinnedAt" DESC
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'groupId', v_group.id,
    'groupName', v_group.name,
    'supportId', v_support.id,
    'supportName', v_support.name,
    'supportAvatarUrl', v_support."avatarUrl",
    'access', p_access,
    'canPost', p_access IN ('PARTICIPANT', 'SUPPORT'),
    'canModerate', v_mod,
    'members', COALESCE((
      SELECT json_agg(m ORDER BY m->>'kind' DESC, m->>'name') FROM (
        SELECT json_build_object('kind', 'SUPPORT', 'id', v_support.id, 'name', v_support.name, 'avatarUrl', v_support."avatarUrl") AS m
        WHERE v_support.id IS NOT NULL
        UNION ALL
        SELECT json_build_object('kind', 'PARTICIPANT', 'id', p.id, 'name', p."fullName", 'avatarUrl', p."avatarUrl")
        FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = p_group_id
      ) x
    ), '[]'::json),
    'pinned', v_pinned,
    'posts', v_posts,
    'hasMore', v_more,
    'openReports', CASE WHEN v_mod THEN COALESCE((
      SELECT json_agg(json_build_object('postId', r."postId", 'count', r.n, 'reasons', r.reasons) ORDER BY r.latest DESC)
      FROM (
        SELECT rp."postId", count(*) AS n, array_agg(DISTINCT rp.reason) AS reasons, max(rp."createdAt") AS latest
        FROM public."GroupPostReport" rp
        JOIN public."GroupPost" gp ON gp.id = rp."postId"
        WHERE gp."groupId" = p_group_id AND rp."resolvedAt" IS NULL
          AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
        GROUP BY rp."postId"
      ) r
    ), '[]'::json) ELSE '[]'::json END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_hub_view(p_hub_id uuid, p_cohort_id uuid, p_actor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub public."SupportHub";
  v_is_lead BOOLEAN;
  v_is_assistant BOOLEAN;
  v_is_it_support BOOLEAN;
  v_can_meeting BOOLEAN;
  v_can_attendance BOOLEAN;
  v_can_message BOOLEAN;
  v_show_acks BOOLEAN;
  v_show_poi BOOLEAN;
  v_my_jobs TEXT[];
  v_result JSON;
BEGIN
  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_lead := (v_hub."leadUserId" = p_actor_id);
  v_is_assistant := (v_hub."assistantLeadUserId" = p_actor_id);
  v_is_it_support := EXISTS (SELECT 1 FROM public."HubItSupport" WHERE "hubId" = p_hub_id AND "userId" = p_actor_id);

  v_can_meeting := v_is_lead OR (v_is_assistant AND 'MEETING' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_attendance := v_is_lead OR (v_is_assistant AND 'ATTENDANCE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_message := v_is_lead OR (v_is_assistant AND 'MESSAGE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_show_acks := v_is_lead OR v_is_assistant OR public.app_is_admin();
  -- ★ on a member = there's a note about them in this hub. Admins and this hub's lead only (not assistant).
  v_show_poi := v_is_lead OR public.app_is_admin();

  v_my_jobs := array_remove(ARRAY[
    CASE WHEN v_is_lead THEN 'HUB_LEAD' END,
    CASE WHEN v_is_assistant THEN 'ASSISTANT_HUB_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END,
    CASE WHEN v_is_it_support THEN 'IT_SUPPORT' END
  ], NULL);

  SELECT json_build_object(
    'hub', json_build_object(
      'id', v_hub.id, 'name', v_hub.name, 'cohortId', v_hub."cohortId",
      'leadUserId', v_hub."leadUserId", 'leadName', (SELECT name FROM public."User" WHERE id = v_hub."leadUserId"),
      'assistantLeadUserId', v_hub."assistantLeadUserId", 'assistantLeadName', (SELECT name FROM public."User" WHERE id = v_hub."assistantLeadUserId"),
      'assistantPermissions', to_json(v_hub."assistantPermissions"),
      'recapLeadUserIds', to_json(v_hub."recapLeadUserIds"),
      'recapLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")), '[]'::json),
      'prayerLeadUserIds', to_json(v_hub."prayerLeadUserIds"),
      'prayerLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")), '[]'::json),
      -- Joined names kept under the old keys so an older cached app build still
      -- shows who leads each part.
      'recapLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")),
      'prayerLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")),
      'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime", 
      'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink",
      'itSupports', COALESCE((
        SELECT json_agg(json_build_object('userId', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") ORDER BY u.name)
        FROM public."HubItSupport" hi JOIN public."User" u ON u.id = hi."userId"
        WHERE hi."hubId" = v_hub.id
      ), '[]'::json)
    ),
    'isLead', v_is_lead,
    'isAssistant', v_is_assistant,
    'isItSupport', v_is_it_support,
    'canMeeting', v_can_meeting,
    'canAttendance', v_can_attendance,
    'canMessage', v_can_message,
    'myJobs', to_json(v_my_jobs),
    'unseenIntroJobs', to_json(COALESCE((
      SELECT array_agg(j) FROM unnest(v_my_jobs) j
      WHERE j NOT IN (SELECT job FROM public."HubRoleIntroSeen" WHERE "userId" = p_actor_id AND "hubId" = v_hub.id)
    ), ARRAY[]::TEXT[])),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'avatarUrl', u."avatarUrl",
        'isLead', (u.id = v_hub."leadUserId"),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1),
        'jobs', to_json(array_remove(ARRAY[
          CASE WHEN u.id = v_hub."leadUserId" THEN 'HUB_LEAD' END,
          CASE WHEN u.id = v_hub."assistantLeadUserId" THEN 'ASSISTANT_HUB_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END
        ], NULL)),
        'isPersonOfInterest', CASE WHEN v_show_poi AND u.id <> p_actor_id THEN EXISTS (
          SELECT 1 FROM public."SupportNote" sn
          WHERE sn."hubId" = v_hub.id AND sn."supportId" = u.id AND sn."noteType" = 'NOTE'
        ) WHEN v_show_poi THEN FALSE ELSE NULL END
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub.id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorId', msg."authorId", 'authorName', author.name,
        'createdAt', msg."createdAt", 'editedAt', msg."editedAt",
        'ackedByMe', EXISTS (SELECT 1 FROM public."HubMessageAck" a WHERE a."messageId" = msg.id AND a."userId" = p_actor_id),
        'ackCount', (SELECT COUNT(*) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id),
        'memberCount', (SELECT COUNT(*) FROM public."HubMembership" m WHERE m."hubId" = v_hub.id AND m."userId" <> p_actor_id),
        'ackedUserIds', CASE WHEN v_show_acks THEN (
          SELECT COALESCE(json_agg(a."userId"), '[]'::json) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id
        ) ELSE NULL END
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub.id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status, 'notes', s.notes, 'submittedAt', s."submittedAt"
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = p_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json),
    'meetingLive', (
      SELECT CASE
        WHEN s."startedAt" IS NOT NULL AND s."submittedAt" IS NULL AND s."startedAt" > NOW() - INTERVAL '3 hours'
          THEN json_build_object('weekId', s."weekId", 'startedAt', s."startedAt")
        ELSE NULL
      END
      FROM public."SupportSession" s
      WHERE s."hubId" = v_hub.id AND s.type = 'SUNDAY_RECAP' AND s."startedAt" IS NOT NULL
      ORDER BY s."startedAt" DESC
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.capture_participant_handover(p_participant_id uuid, p_event_type text, p_from_group_id uuid DEFAULT NULL::uuid, p_to_group_id uuid DEFAULT NULL::uuid, p_from_support_id uuid DEFAULT NULL::uuid, p_to_support_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from_group_name TEXT;
  v_to_group_name TEXT;
  v_from_support_name TEXT;
  v_to_support_name TEXT;
  v_project RECORD;
BEGIN
  SELECT name INTO v_from_group_name FROM "Group" WHERE id = p_from_group_id;
  SELECT name INTO v_to_group_name FROM "Group" WHERE id = p_to_group_id;
  SELECT name INTO v_from_support_name FROM "User" WHERE id = p_from_support_id;
  SELECT name INTO v_to_support_name FROM "User" WHERE id = p_to_support_id;
  SELECT status, "updatedById", "updatedAt" INTO v_project
    FROM "FaithProject" WHERE "participantId" = p_participant_id ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1;

  INSERT INTO "ParticipantHandover" (
    "participantId", "eventType", "fromGroupId", "fromGroupName", "fromSupportId", "fromSupportName",
    "toGroupId", "toGroupName", "toSupportId", "toSupportName", "faithProjectStatus", "faithProjectUpdatedById", "faithProjectUpdatedAt"
  ) VALUES (
    p_participant_id, p_event_type, p_from_group_id, v_from_group_name, p_from_support_id, v_from_support_name,
    p_to_group_id, v_to_group_name, p_to_support_id, v_to_support_name,
    v_project.status, v_project."updatedById", v_project."updatedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_own_password(target_user uuid, current_password text, new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- The same budget as signing in to this account.
  v_key TEXT := 'staff:' || COALESCE(target_user::TEXT, '');
  v_ok BOOLEAN;
BEGIN
  PERFORM public.sign_in_guard(v_key);
  v_ok := public.change_own_password_check(target_user, current_password, new_password);
  PERFORM public.sign_in_record(v_key, COALESCE(v_ok, FALSE));
  RETURN v_ok;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_own_password_check(target_user uuid, current_password text, new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  candidate "User";
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT * INTO candidate FROM "User" WHERE id = target_user;
  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN FALSE;
  END IF;

  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) <> current_password THEN
      RETURN FALSE;
    END IF;
  ELSIF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(current_password, candidate.password_hash) THEN
    RETURN FALSE;
  END IF;

  -- The guard (rule 133): not a password a participant login on this number already uses, or sign-in would open the
  -- staff account for both and that login could no longer be reached.
  IF public.password_family_clash(target_user, new_password) THEN
    RAISE EXCEPTION 'FAMILY_PASSWORD_CLASH';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = FALSE,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_participant_password(p_token text, p_current text, p_new text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  current_hash TEXT;
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new IS NULL OR length(p_new) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  SELECT password_hash INTO current_hash FROM "ParticipantAccount" WHERE "participantId" = person_id;
  IF current_hash IS NULL OR current_hash <> crypt(COALESCE(p_current, ''), current_hash) THEN
    RETURN FALSE;
  END IF;
  -- The guard (rule 133).
  IF public.password_staff_clash(person_id, p_new) THEN
    RAISE EXCEPTION 'STAFF_PASSWORD_CLASH';
  END IF;
  v_hash := crypt(p_new, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash, "setupCode" = NULL, "mustChangePassword" = FALSE, "passwordSetAt" = NOW(), "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_participant_app_setup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.complete_participant_app_setup(NEW."participantId");
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkup_rest_week3(p_cohort_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH last_class AS (
    SELECT MAX(public.week_class_date(c."startDate", w."weekNumber", w."classDate")) AS d, c."endDate"::date AS end_date
    FROM public."Cohort" c JOIN public."Week" w ON w."cohortId" = c.id
    WHERE c.id = p_cohort_id AND c."startDate" IS NOT NULL
    GROUP BY c."endDate"
  )
  SELECT GREATEST(COALESCE(end_date, d + 7), d) + 1 + 14 FROM last_class WHERE d IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.class_feedback_release_at(p_class_date date, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings JSONB;
  v_day TEXT;
  v_time TEXT;
  v_offset INTEGER;
BEGIN
  IF p_class_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_settings FROM "AppSetting" WHERE "settingKey" = 'class_feedback_times';

  IF p_audience = 'support' THEN
    v_day := COALESCE(v_settings->>'supportDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'supportTime', '12:00');
  ELSE
    v_day := COALESCE(v_settings->>'participantDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'participantTime', '12:00');
  END IF;

  v_offset := GREATEST(0, array_position(
    ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],
    upper(v_day)
  ) - 1);

  IF v_time !~ '^[0-9]{1,2}:[0-9]{2}$' THEN
    v_time := '00:00';
  END IF;

  RETURN (
    (p_class_date + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

CREATE OR REPLACE FUNCTION public.class_feedback_release_at(p_start_date date, p_week_number integer, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.class_feedback_release_at(p_start_date + (p_week_number - 1) * 7, p_audience);
$function$;

CREATE OR REPLACE FUNCTION public.class_feedback_results(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'title', w.title,
      'supports', COALESCE((
        SELECT json_agg(json_build_object(
          'supportId', u.id,
          'supportName', u.name,
          'note', scf.note,
          'isNone', scf."isNone",
          'answeredAt', scf."createdAt"
        ) ORDER BY u.name)
        FROM "SupportClassFeedback" scf
        JOIN "User" u ON u.id = scf."supportId"
        WHERE scf."weekId" = w.id AND scf."cohortId" = p_cohort_id
      ), '[]'::json),
      'supportsMissing', COALESCE((
        SELECT json_agg(u.name ORDER BY u.name)
        FROM (SELECT DISTINCT g."supportId" FROM "Group" g WHERE g."cohortId" = p_cohort_id AND g."supportId" IS NOT NULL) gs
        JOIN "User" u ON u.id = gs."supportId"
        WHERE NOT EXISTS (
          SELECT 1 FROM "SupportClassFeedback" scf WHERE scf."weekId" = w.id AND scf."supportId" = gs."supportId"
        )
      ), '[]'::json),
      'participants', (
        SELECT json_build_object(
          'count', count(*),
          'visible', count(*) >= 5,
          'average', CASE WHEN count(*) >= 5 THEN round(avg(pcf.rating)::numeric, 1) END,
          'answers', CASE WHEN count(*) >= 5 THEN (
            SELECT json_agg(json_build_object('rating', pcf2.rating, 'comment', pcf2.comment, 'name', p2."fullName") ORDER BY md5(pcf2.id::text))
            FROM "ParticipantClassFeedback" pcf2
            LEFT JOIN "Participant" p2 ON p2.id = pcf2."participantId"
            WHERE pcf2."weekId" = w.id AND pcf2."cohortId" = p_cohort_id
          ) END
        )
        FROM "ParticipantClassFeedback" pcf WHERE pcf."weekId" = w.id AND pcf."cohortId" = p_cohort_id
      )
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w WHERE w."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.class_signal_open_week(p_participant uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s."weekId"
  FROM public."Participant" p
  JOIN public."Week" w ON w."cohortId" = p."cohortId"
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE p.id = p_participant
    AND s."startedAt" IS NOT NULL AND s."closesAt" > now() AND s."finalizedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM public."AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = p_participant)
  ORDER BY s."startedAt" DESC LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.clear_support_group_assignments_before_user_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  UPDATE public."Group" SET "supportId" = NULL WHERE "supportId" = OLD.id;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_attendance_windows()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_week RECORD;
  v_absent_ids UUID[];
BEGIN
  FOR v_week IN
    SELECT s."weekId", w."cohortId"
    FROM public."AttendanceSession" s
    JOIN public."Week" w ON w.id = s."weekId"
    WHERE s."startedAt" IS NOT NULL
      AND s."closesAt" IS NOT NULL
      AND s."closesAt" <= NOW()
      AND s."finalizedAt" IS NULL
  LOOP
    WITH inserted AS (
      INSERT INTO public."AttendanceRecord" ("participantId", "weekId", status, "markedAt")
      SELECT p.id, v_week."weekId", 'ABSENT', NOW()
      FROM public."Participant" p
      WHERE p."cohortId" = v_week."cohortId"
        AND p.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM public."AttendanceRecord" a
          WHERE a."weekId" = v_week."weekId" AND a."participantId" = p.id
        )
      RETURNING "participantId"
    )
    SELECT array_agg("participantId") INTO v_absent_ids FROM inserted;

    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(),
        "finalizationMethod" = 'AUTO',
        "updatedAt" = NOW()
    WHERE "weekId" = v_week."weekId"
      AND "finalizedAt" IS NULL;

    PERFORM public.sync_attendance_follow_up_tasks(v_week."weekId");
    PERFORM public.notify_attendance_report(v_week."weekId");

    IF v_absent_ids IS NOT NULL AND array_length(v_absent_ids, 1) > 0 THEN
      PERFORM public.invoke_attendance_absence_push(v_absent_ids);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cohort_health(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  cohort AS (
    SELECT id, name, "startDate", "endDate", status, "schedulePublished"
    FROM "Cohort" WHERE id = p_cohort_id
  ),
  weeks AS (
    SELECT id, "weekNumber", "classDate", ("recapDocumentUrl" IS NOT NULL) AS "recapUploaded"
    FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  people AS (
    SELECT id, status FROM "Participant" WHERE "cohortId" = p_cohort_id AND NOT "isTest"
  ),
  membership AS (
    SELECT gp."groupId", gp."participantId"
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
    JOIN people p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
  ),
  groups AS (
    SELECT g.id, g.name, g."supportId", u.name AS "supportName",
           (SELECT count(*) FROM membership m WHERE m."groupId" = g.id) AS members
    FROM "Group" g
    LEFT JOIN "User" u ON u.id = g."supportId"
    WHERE g."cohortId" = p_cohort_id
      AND NOT g."isTeenGroup"
  ),
  attendance AS (
    SELECT a."weekId", m."groupId",
           count(*) AS marked,
           count(*) FILTER (WHERE a.status = 'PRESENT') AS present,
           count(*) FILTER (WHERE a.status = 'LATE') AS late,
           count(*) FILTER (WHERE a.status = 'LEFT_EARLY') AS "leftEarly",
           count(*) FILTER (WHERE a.status = 'ABSENT') AS absent,
           count(*) FILTER (
             WHERE a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY')
           ) AS attended
    FROM "AttendanceRecord" a
    JOIN membership m ON m."participantId" = a."participantId"
    JOIN weeks w ON w.id = a."weekId"
    GROUP BY a."weekId", m."groupId"
  ),
  meetings AS (
    SELECT s."weekId", s."groupId"
    FROM "GroupPrayerStatus" s
    JOIN weeks w ON w.id = s."weekId"
    WHERE s.done
  ),
  contacts AS (
    SELECT * FROM "FollowUpContact" WHERE "cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'cohort', (SELECT row_to_json(c) FROM cohort c),
    'weeks', COALESCE((SELECT json_agg(w ORDER BY w."weekNumber") FROM weeks w), '[]'::json),
    'participants', json_build_object(
      'active', (SELECT count(*) FROM people WHERE status = 'ACTIVE'),
      'archived', (SELECT count(*) FROM people WHERE status <> 'ACTIVE'),
      'inGroups', (SELECT count(DISTINCT "participantId") FROM membership)
    ),
    'groups', COALESCE((SELECT json_agg(g ORDER BY g.name) FROM groups g), '[]'::json),
    'attendance', COALESCE((SELECT json_agg(a) FROM attendance a), '[]'::json),
    'meetings', COALESCE((SELECT json_agg(m) FROM meetings m), '[]'::json),
    'faithProjects', COALESCE((
      SELECT json_object_agg(status, n) FROM (
        SELECT f.status, count(*) AS n
        FROM "FaithProject" f JOIN people p ON p.id = f."participantId" AND p.status = 'ACTIVE'
        GROUP BY f.status
      ) x
    ), '{}'::json),
    'followUps', json_build_object(
      'total', (SELECT count(*) FROM contacts),
      'contacted', (SELECT count(*) FROM contacts
                    WHERE "messageStatus" = 'SENT'
                       OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL')
                       OR ("replyStatus" <> 'NO_REPLY' AND source IS DISTINCT FROM 'Google Form')),
      'replied', (SELECT count(*) FROM contacts
                  WHERE "replyStatus" = 'REPLIED'
                    AND (source IS DISTINCT FROM 'Google Form'
                         OR "messageStatus" = 'SENT'
                         OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL'))),
      'registered', (SELECT count(*) FROM contacts WHERE "registrationStatus" IN ('REGISTERED', 'TEENAGER', 'TEEN_ONBOARDED')),
      'open', (SELECT count(*) FROM contacts WHERE "archivedAt" IS NULL)
    ),
    'nextCohortPeople', (SELECT count(*) FROM "FollowUpContact" f
                         -- Someone who could not be reached (No response) is offered for the next cohort too,
                         -- whether or not they had signed up for this one.
                         WHERE f."registrationStatus" IN ('NEXT_COHORT', 'NO_RESPONSE')
                           AND f."archivedAt" IS NULL
                           AND f."cohortId" IS DISTINCT FROM p_cohort_id),
    'openFlags', (SELECT count(*) FROM "ParticipantFlag" f JOIN people p ON p.id = f."participantId" WHERE f."clearedAt" IS NULL),
    'pendingCover', (SELECT count(*) FROM "CoverRequest" WHERE status = 'PENDING' AND "endsAt" >= now()),
    'sheetSyncProblems', (SELECT count(*) FROM "FollowUpContact"
                          WHERE "createdAt" >= now() - interval '7 days'
                            AND (("sheetSyncError" IS NOT NULL AND "sheetSyncedAt" IS NULL) OR "sheetSyncWarning" IS NOT NULL))
  );
$function$;

CREATE OR REPLACE FUNCTION public.cohort_onboarding_progress(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see the whole cohort''s onboarding';
  END IF;
  RETURN public.onboarding_progress_json(p_cohort_id, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cohort_people(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  people AS (
    SELECT p.id, p."fullName", p.status, p.departments, p."createdAt",
           (SELECT gp."groupId" FROM "GroupParticipant" gp
              JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
             WHERE gp."participantId" = p.id LIMIT 1) AS "groupId",
           COALESCE(o.contacted AND o."addedToGroup" AND o."introductionDone" AND o."venueAcknowledged", false) AS onboarded
    FROM "Participant" p
    LEFT JOIN "ParticipantOnboardingStatus" o ON o."participantId" = p.id
    WHERE p."cohortId" = p_cohort_id AND NOT p."isTest"
  ),
  weeks AS (
    SELECT id FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  onboarding AS (
    SELECT g.id AS "groupId", g."supportId",
           s."groupCreated", s."completedAt",
           (SELECT max(e."createdAt") FROM "OnboardingEvent" e
             WHERE e."groupId" = g.id AND e.type = 'GROUP_ASSIGNED'
               AND e."createdAt" <= COALESCE(s."completedAt", now())) AS "assignedAt"
    FROM "Group" g
    LEFT JOIN "GroupOnboardingStatus" s ON s."groupId" = g.id
    WHERE g."cohortId" = p_cohort_id
      AND NOT g."isTeenGroup"
  )
  SELECT json_build_object(
    'participants', COALESCE((SELECT json_agg(p ORDER BY p."fullName") FROM people p), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object(
        'participantId', a."participantId", 'weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"
      ))
      FROM "AttendanceRecord" a
      JOIN people p ON p.id = a."participantId"
      JOIN weeks w ON w.id = a."weekId"
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('participantId', m."participantId", 'weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m
      JOIN people p ON p.id = m."participantId"
      JOIN weeks w ON w.id = m."weekId"
      WHERE NOT EXISTS (SELECT 1 FROM "Group" tg WHERE tg.id = m."groupId" AND tg."isTeenGroup")
        AND NOT EXISTS (
          SELECT 1 FROM "GroupParticipant" tgp JOIN "Group" tg2 ON tg2.id = tgp."groupId"
          WHERE tgp."participantId" = m."participantId" AND tg2."isTeenGroup"
        )
    ), '[]'::json),
    'onboarding', COALESCE((SELECT json_agg(o) FROM onboarding o), '[]'::json),
    'supportRecap', COALESCE((
      SELECT json_agg(json_build_object('userId', a."userId", 'weekId', s."weekId", 'status', a.status))
      FROM "SupportSessionAttendance" a
      JOIN "SupportSession" s ON s.id = a."sessionId"
      WHERE s."cohortId" = p_cohort_id AND s.type = 'SUNDAY_RECAP' AND s."weekId" IS NOT NULL
    ), '[]'::json)
  );
$function$;

CREATE OR REPLACE FUNCTION public.cohort_profile_completion(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(json_agg(json_build_object('participantId', p.id, 'completion', public.profile_completion_for(p.id))), '[]'::json)
  FROM "Participant" p WHERE p."cohortId" = p_cohort_id;
$function$;

CREATE OR REPLACE FUNCTION public.complete_attendance_follow_up_task(p_task_id uuid, p_done boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_task public."AttendanceFollowUpTask";
  v_note TEXT;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to update this task';
  END IF;

  v_actor_id := public.attendance_session_actor_id();
  SELECT * INTO v_task FROM public."AttendanceFollowUpTask" WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'Attendance follow-up task was not found'; END IF;
  IF v_task.status = 'CANCELLED' THEN RAISE EXCEPTION 'This attendance follow-up task was cancelled'; END IF;
  IF v_task."supportId" <> v_actor_id AND NOT public.attendance_session_actor_is_admin() THEN
    RAISE EXCEPTION 'This follow-up is assigned to another support';
  END IF;

  v_note := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  IF p_done AND v_note IS NULL THEN
    RAISE EXCEPTION 'Add a note explaining the absence before marking this follow-up done';
  END IF;

  UPDATE public."AttendanceFollowUpTask"
  SET status = CASE WHEN p_done THEN 'DONE' ELSE 'OPEN' END,
      "completionNote" = CASE WHEN p_done THEN v_note ELSE NULL END,
      "completedAt" = CASE WHEN p_done THEN NOW() ELSE NULL END,
      "completedById" = CASE WHEN p_done THEN v_actor_id ELSE NULL END,
      "updatedAt" = NOW()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN jsonb_build_object(
    'id', v_task.id,
    'attendanceRecordId', v_task."attendanceRecordId",
    'participantId', v_task."participantId",
    'weekId', v_task."weekId",
    'supportId', v_task."supportId",
    'dueAt', v_task."dueAt",
    'status', v_task.status,
    'completedAt', v_task."completedAt",
    'completionNote', v_task."completionNote"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_participant_app_setup(p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  person RECORD;
  claimed UUID;
BEGIN
  -- Installation and subscription can arrive in either order, including from
  -- separate concurrent transactions. Serialize the check per participant.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('app-setup:' || p_participant_id::TEXT, 0));
  IF EXISTS (SELECT 1 FROM public."ParticipantAppSetupCompletion" WHERE "participantId" = p_participant_id) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."ParticipantAppState" WHERE "participantId" = p_participant_id AND "installedAt" IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" WHERE "participantId" = p_participant_id) THEN RETURN; END IF;

  SELECT p."fullName", COALESCE(f."ownerId", gs."supportId") AS owner_id INTO person
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive" AND a."passwordSetAt" IS NOT NULL
  LEFT JOIN public."FollowUpContact" f ON f.id = p."followUpContactId"
  LEFT JOIN LATERAL (
    SELECT g."supportId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL AND g."supportId" IS NOT NULL
    ORDER BY g."createdAt" DESC LIMIT 1
  ) gs ON TRUE
  JOIN public."User" u ON u.id = COALESCE(f."ownerId", gs."supportId") AND u."isActive" AND NOT COALESCE(u."isTest", FALSE)
  WHERE p.id = p_participant_id AND p.status = 'ACTIVE' AND NOT COALESCE(p."isTest", FALSE)
    AND c.status = 'ACTIVE' AND NOT COALESCE(c."isPractice", FALSE);
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public."ParticipantAppSetupCompletion" ("participantId", "ownerId")
  VALUES (p_participant_id, person.owner_id)
  ON CONFLICT DO NOTHING RETURNING "participantId" INTO claimed;
  IF claimed IS NULL THEN RETURN; END IF;

  -- Write the bell row in the same transaction as the one-time stamp. This
  -- requested bell alert works even when the support has no push subscription.
  INSERT INTO public."Notification" ("userId", title, body, path, type)
  VALUES (person.owner_id, person."fullName" || ' is on the app now',
    person."fullName" || ' has installed FOF Ops and turned on alerts.', '/support', 'APP_SETUP_COMPLETE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_followup_access_on_password_set()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_contact RECORD;
  v_first_name TEXT;
  v_url text;
  v_key text;
  v_issues_closed INT := 0;
  v_it_ids UUID[];
BEGIN
  BEGIN
    SELECT c.id, c."fullName", c."ownerId" INTO v_contact
    FROM public."Participant" p
    JOIN public."FollowUpContact" c ON c.id = p."followUpContactId"
    WHERE p.id = NEW."participantId"
      AND c."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NO_RESPONSE')
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "noResponseAt" = NULL,
        "replyStatus" = 'REPLIED',
        "nextAction" = 'CLOSE',
        "archivedAt" = COALESCE("archivedAt", now()),
        "updatedAt" = now()
    WHERE id = v_contact.id;

    -- They got in, so any open login issue for them is sorted too.
    UPDATE public."FollowUpLoginIssue"
    SET status = 'RESOLVED',
        "resolvedAt" = now(),
        resolution = 'They signed in by themselves.',
        "updatedAt" = now()
    WHERE "contactId" = v_contact.id AND status = 'OPEN';
    GET DIAGNOSTICS v_issues_closed = ROW_COUNT;

    -- Nobody to tell: no owner, and no login issue was closed.
    IF v_contact."ownerId" IS NULL AND v_issues_closed = 0 THEN
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

    IF v_url IS NULL OR v_key IS NULL THEN
      RAISE NOTICE 'confirm_followup_access_on_password_set: vault secrets missing; skipping push';
      RETURN NEW;
    END IF;

    v_first_name := COALESCE(NULLIF(split_part(trim(v_contact."fullName"), ' ', 1), ''), 'Your contact');

    -- They got in before IT Support marked it sorted: tell that IT Support.
    IF v_issues_closed > 0 THEN
      v_it_ids := public.followup_contact_it_support_ids(v_contact.id, NULL);
      IF COALESCE(array_length(v_it_ids, 1), 0) > 0 THEN
        BEGIN  -- a failed alert must not undo the status change above
          PERFORM net.http_post(
            url := v_url || '/functions/v1/notify-users',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'apikey', v_key,
              'Authorization', 'Bearer ' || v_key
            ),
            body := jsonb_build_object(
              'userIds', to_jsonb(v_it_ids),
              'title', format('%s got in', v_first_name),
              'body', format('%s signed in to the app by themselves, so their login issue is closed. No action needed.', trim(v_contact."fullName")),
              'path', '/support/mobilisation?tab=it',
              'type', 'FOLLOWUP_TERMINAL'
            ),
            timeout_milliseconds := 25000
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'confirm_followup_access_on_password_set: alert failed: %', SQLERRM;
        END;
      END IF;
    END IF;

    IF v_contact."ownerId" IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN  -- a failed alert must not undo the status change above
      PERFORM net.http_post(
        url := v_url || '/functions/v1/notify-users',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_key,
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object(
          'userIds', jsonb_build_array(v_contact."ownerId"),
          'title', format('%s is in the app', v_first_name),
          'body', format('%s signed in to the FOF app. Their follow-up is done.', trim(v_contact."fullName")),
          'path', '/support/mobilisation?tab=follow',
          'type', 'FOLLOWUP_TERMINAL'
        ),
        timeout_milliseconds := 25000
      );

    EXCEPTION WHEN OTHERS THEN

      RAISE NOTICE 'confirm_followup_access_on_password_set: alert failed: %', SQLERRM;

    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'confirm_followup_access_on_password_set failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_amen(p_token text, p_session uuid, p_without_link boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
  v_wait integer;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  IF ci."sessionId" IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  IF ci."amenAt" IS NULL THEN
    IF se."slotType" = 'LIVE' THEN
      SELECT COALESCE((SELECT x."liveWaitMinutes" FROM public."CorporatePrayerSlot" x WHERE x.id = se."slotId"), 5) INTO v_wait;
      IF ci."linkTappedAt" IS NOT NULL THEN
        IF now() < ci."linkTappedAt" + make_interval(mins => v_wait) THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
      ELSIF COALESCE(p_without_link, FALSE) THEN
        IF now() < ci."checkedInAt" + interval '10 minutes' THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
      ELSE
        RAISE EXCEPTION 'OPEN_THE_LINK_FIRST';
      END IF;
    ELSIF now() < ci."checkedInAt" + make_interval(mins => LEAST(3, se."timerMinutes")) THEN
      RAISE EXCEPTION 'AMEN_TOO_SOON';
    END IF;
  END IF;
  UPDATE public."CorporatePrayerCheckin" SET "amenAt" = COALESCE("amenAt", now()), "withoutLink" = ("linkTappedAt" IS NULL)
  WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_cant_join(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" <> 'LIVE' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  IF ci."sessionId" IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  IF ci."linkTappedAt" IS NULL THEN
    IF now() < ci."checkedInAt" + interval '10 minutes' THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
    UPDATE public."CorporatePrayerCheckin" SET "cantJoinAt" = COALESCE("cantJoinAt", now())
    WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  END IF;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_counts(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now(),
                           'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_join(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_in boolean;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_OPEN_YET'; END IF;
  v_in := EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id);
  -- Someone already in may come back. A new person may join a daily prayer until midnight (a missed prayer still counts), a live one only while it is on.
  IF NOT v_in AND now() >= public.prayer_late_until(se.id) THEN RAISE EXCEPTION 'ENDED'; END IF;
  IF NOT v_in AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  -- The person being prayed for is not one of the people praying.
  IF NOT v_in AND c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND public.prayer_is_target(se.id, c.person_id) THEN
    RAISE EXCEPTION 'IS_YOU';
  END IF;
  INSERT INTO public."CorporatePrayerCheckin" ("sessionId", "personKind", "personId")
  VALUES (se.id, c.kind, c.person_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_link_tap(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  v_at timestamptz;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public."CorporatePrayerCheckin" k
  SET "linkTappedAt" = COALESCE(k."linkTappedAt", now()),
      "amenAt" = CASE WHEN s."slotType" = 'LIVE' THEN COALESCE(k."amenAt", now()) ELSE k."amenAt" END,
      "withoutLink" = CASE WHEN s."slotType" = 'LIVE' AND k."amenAt" IS NULL THEN FALSE ELSE k."withoutLink" END,
      "cantJoinAt" = NULL
  FROM public."CorporatePrayerSession" s
  WHERE s.id = k."sessionId" AND k."sessionId" = p_session AND k."personKind" = c.kind AND k."personId" = c.person_id
  RETURNING k."linkTappedAt" INTO v_at;
  IF v_at IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  RETURN json_build_object('linkTappedAt', v_at, 'counts', public.prayer_counts_json(p_session), 'serverNow', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_now(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  slot public."CorporatePrayerSlot";
  ci public."CorporatePrayerCheckin";
  v_key text;
  v_target uuid;
  v_pool text;
  v_pick record;
  v_project text;
  v_blocks jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession"
  WHERE id = COALESCE(p_session, public.prayer_open_session(c.cohort_id, c.hub_key)) AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN
    RETURN json_build_object('state', 'none', 'serverNow', now(), 'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
  END IF;
  SELECT * INTO slot FROM public."CorporatePrayerSlot" WHERE id = se."slotId";
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  -- A prayer for other hubs is no prayer for this person (unless they already joined it).
  IF ci."sessionId" IS NULL AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key) THEN
    RETURN json_build_object('state', 'none', 'serverNow', now(), 'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
  END IF;

  -- Who is being prayed for is not shown before the slot opens.
  IF se."slotType" <> 'LIVE' AND now() >= se."opensAt" THEN
    v_pool := public.prayer_blocks_pool(se.blocks);
    v_key := 'COHORT';
    SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
    IF v_target IS NULL THEN
      v_key := c.hub_key;
      SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
    END IF;
    IF v_target IS NULL THEN
      SELECT t."participantId", t."hubKey" INTO v_target, v_key FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id
      ORDER BY (t."hubKey" = 'NO_HUB') DESC, t."hubKey" LIMIT 1;
    END IF;
    -- A person who opted out (or whose project is gone) since the session was made is replaced, never shown.
    -- Only while the slot is open, and under the same lock the rotation uses, so ten phones do not each pick a different replacement.
    IF v_target IS NOT NULL AND now() < se."closesAt" AND NOT EXISTS (SELECT 1 FROM public.prayer_pool_members(c.cohort_id, v_pool) m WHERE m.participant_id = v_target) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('prayer-pick:' || c.cohort_id::text || ':' || v_pool, 0));
      SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
      IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.prayer_pool_members(c.cohort_id, v_pool) m WHERE m.participant_id = v_target) THEN
        SELECT * INTO v_pick FROM public.prayer_pick(
          c.cohort_id, v_pool,
          COALESCE((SELECT array_agg(t."participantId") FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" <> v_key), '{}'::uuid[]),
          se."prayerDate", TRUE);
        v_target := v_pick.participant_id;
        IF v_target IS NOT NULL THEN
          UPDATE public."CorporatePrayerTarget" SET "participantId" = v_target, "cycleNo" = v_pick.cycle_no WHERE "sessionId" = se.id AND "hubKey" = v_key;
        ELSE
          DELETE FROM public."CorporatePrayerTarget" WHERE "sessionId" = se.id AND "hubKey" = v_key;
        END IF;
      END IF;
    END IF;
    IF v_pool = 'FAITH' THEN
      SELECT f.body INTO v_project FROM public."FaithProject" f WHERE f."participantId" = v_target AND f.status = 'SAVED' LIMIT 1;
    END IF;
    v_blocks := public.prayer_resolve_blocks(se.blocks, v_project);
  END IF;

  RETURN json_build_object(
    'role', c.kind,
    'serverNow', now(),
    'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END,
    'session', json_build_object('id', se.id, 'name', slot.name, 'slotType', se."slotType", 'timerMinutes', se."timerMinutes",
                                 'opensAt', se."opensAt", 'closesAt', se."closesAt", 'lateUntil', public.prayer_late_until(se.id),
                                 'amenAfterMinutes', LEAST(3, se."timerMinutes")),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_target),
    'isMe', (c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND now() >= se."opensAt" AND public.prayer_is_target(se.id, c.person_id)),
    'blocks', v_blocks,
    'me', CASE WHEN ci."sessionId" IS NOT NULL THEN json_build_object('checkedInAt', ci."checkedInAt", 'amenAt', ci."amenAt", 'linkTappedAt', ci."linkTappedAt", 'cantJoinAt', ci."cantJoinAt") END,
    'counts', public.prayer_counts_json(se.id),
    'live', CASE WHEN se."slotType" = 'LIVE' THEN json_build_object('telegramLink', slot."telegramLink", 'waitMinutes', slot."liveWaitMinutes", 'message', slot."liveMessage") END,
    'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_overview(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today date := public.prayer_lagos_today();
  v_start date := public.faith_prayers_start_date(p_cohort_id);
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  RETURN json_build_object(
    'startWeekNumber', (SELECT s."prayersStartWeekNumber" FROM public."FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id),
    'popupDaysBefore', COALESCE((SELECT s."prayerPopupDaysBefore" FROM public."FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id), 3),
    'startDate', v_start,
    'endDate', (SELECT c."endDate" FROM public."Cohort" c WHERE c.id = p_cohort_id),
    'today', v_today,
    'running', public.prayer_running(p_cohort_id),
    'isPractice', public.prayer_is_practice(p_cohort_id),
    'hubs', COALESCE((SELECT json_agg(json_build_object('id', h.id, 'name', h.name) ORDER BY h.name) FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id), '[]'::json),
    'slots', COALESCE((SELECT json_agg(json_build_object(
        'id', sl.id, 'name', sl.name, 'time', to_char(sl."timeOfDay", 'HH24:MI'), 'slotType', sl."slotType",
        'timerMinutes', sl."timerMinutes", 'joinWindowMinutes', sl."joinWindowMinutes", 'targetMode', sl."targetMode",
        'notify', sl.notify, 'active', sl.active, 'blocks', sl.blocks, 'audienceAll', sl."audienceAll", 'hubIds', sl."hubIds",
        'telegramLink', sl."telegramLink", 'liveWaitMinutes', sl."liveWaitMinutes", 'liveMessage', sl."liveMessage",
        'hasHistory', EXISTS (SELECT 1 FROM public."CorporatePrayerSession" h WHERE h."slotId" = sl.id),
        'today', (SELECT json_build_object('sessionId', se.id, 'opensAt', se."opensAt", 'closesAt', se."closesAt", 'counts', public.prayer_counts_json(se.id))
                  FROM public."CorporatePrayerSession" se WHERE se."slotId" = sl.id AND se."prayerDate" = v_today)
      ) ORDER BY sl."timeOfDay", sl."createdAt") FROM public."CorporatePrayerSlot" sl WHERE sl."cohortId" = p_cohort_id AND NOT sl."isTest"), '[]'::json),
    'verses', json_build_object(
      'total', (SELECT count(*) FROM public."CorporatePrayerVerse"),
      'active', (SELECT count(*) FROM public."CorporatePrayerVerse" WHERE active)),
    'pools', json_build_object(
      'FAITH', (SELECT count(*) FROM public.prayer_pool_members(p_cohort_id, 'FAITH')),
      'NAME', (SELECT count(*) FROM public.prayer_pool_members(p_cohort_id, 'NAME'))),
    'counted', json_build_object(
      'participants', (SELECT count(*) FROM public.prayer_counted_participants(p_cohort_id)),
      'supports', (SELECT count(*) FROM public.prayer_counted_supports(p_cohort_id)))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_signal(p_token text, p_cohort uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  v_session uuid;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
  v_open json;
  v_unfinished json;
  v_missed json;
  v_for_me json;
  v_today date := public.prayer_lagos_today();
  v_running boolean;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, p_cohort);
  IF c.person_id IS NULL THEN RETURN json_build_object('open', NULL); END IF;
  v_running := public.prayer_running(c.cohort_id);
  v_session := public.prayer_open_session(c.cohort_id, c.hub_key);
  IF v_session IS NOT NULL THEN
    SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = v_session;
    SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = v_session AND "personKind" = c.kind AND "personId" = c.person_id;
    v_open := json_build_object('sessionId', se.id, 'slotType', se."slotType", 'opensAt', se."opensAt", 'closesAt', se."closesAt",
                                'lateUntil', public.prayer_late_until(se.id),
                                'checkedIn', ci."sessionId" IS NOT NULL,
                                -- Old apps hide the live pop-up on "amen"; "I can't join tonight" closes it too.
                                'amen', (ci."amenAt" IS NOT NULL OR ci."cantJoinAt" IS NOT NULL),
                                'tapped', ci."linkTappedAt" IS NOT NULL, 'cantJoin', ci."cantJoinAt" IS NOT NULL,
                                'isMe', (c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND public.prayer_is_target(se.id, c.person_id)),
                                'serverNow', now());
  END IF;

  SELECT json_build_object('sessionId', s.id, 'slotType', s."slotType", 'opensAt', s."opensAt", 'closesAt', s."closesAt",
                           'lateUntil', public.prayer_late_until(s.id), 'checkedIn', TRUE, 'amen', FALSE, 'serverNow', now())
    INTO v_unfinished
  FROM public."CorporatePrayerSession" s
  JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id AND k."amenAt" IS NULL
  WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
    AND s."closesAt" <= now() AND now() < public.prayer_late_until(s.id) AND s.id IS DISTINCT FROM v_session
  ORDER BY s."opensAt" DESC LIMIT 1;

  SELECT json_build_object('sessionId', s.id, 'slotType', s."slotType", 'name', sl.name, 'opensAt', s."opensAt", 'closesAt', s."closesAt",
                           'lateUntil', public.prayer_late_until(s.id), 'serverNow', now())
    INTO v_missed
  FROM public."CorporatePrayerSession" s
  JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND sl.active
  WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
    AND (v_running OR sl."isTest")
    AND s."closesAt" <= now() AND now() < public.prayer_late_until(s.id)
    AND public.prayer_in_audience(s."audienceAll", s."hubIds", c.hub_key)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id)
    AND NOT (c.kind = 'PARTICIPANT' AND public.prayer_is_target(s.id, c.person_id))
  ORDER BY s."opensAt" DESC LIMIT 1;

  IF c.kind = 'PARTICIPANT' THEN
    SELECT json_build_object('sessionId', s.id, 'opensAt', s."opensAt", 'closesAt', s."closesAt", 'serverNow', now())
      INTO v_for_me
    FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerTarget" t ON t."sessionId" = s.id AND t."participantId" = c.person_id
    WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
      AND s."closesAt" <= now() AND s."closesAt" > now() - interval '18 hours'
    ORDER BY s."closesAt" DESC LIMIT 1;
  END IF;

  RETURN json_build_object('open', v_open, 'unfinished', v_unfinished, 'missed', v_missed, 'forMe', v_for_me,
                           'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_wall(p_token text, p_session uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_target uuid;
  v_is_target boolean;
  v_admin boolean := FALSE;
  v_posts json;
  v_key text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" = 'LIVE' OR now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_is_target := c.kind = 'PARTICIPANT' AND public.prayer_is_target(se.id, c.person_id);
  -- The person prayed for reads the words left for them; everyone else the Wall of the person their hub prays for.
  v_target := CASE WHEN v_is_target THEN c.person_id ELSE public.prayer_session_target(se.id, c.hub_key) END;
  IF NOT v_is_target AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key)
     AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_is_target AND now() < se."closesAt" THEN
    RETURN json_build_object('forMe', TRUE, 'ended', FALSE, 'posts', '[]'::json, 'counts', public.prayer_counts_json(se.id), 'serverNow', now());
  END IF;
  IF c.kind = 'SUPPORT' THEN
    SELECT 'ADMIN'::"Role" = ANY (public.app_user_roles(u)) INTO v_admin FROM public."User" u WHERE u.id = c.person_id;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x."at"), '[]'::json) INTO v_posts FROM (
    SELECT w.id, w.body, w."createdAt" AS "at",
           (w."authorKind" = c.kind AND w."authorId" = c.person_id) AS mine,
           split_part(btrim(COALESCE(p."fullName", u.name, '')), ' ', 1) AS "firstName",
           COALESCE(p."fullName", u.name, '') AS "fullName",
           COALESCE(p."avatarUrl", u."avatarUrl") AS "avatarUrl",
           (NOT v_is_target AND (COALESCE(v_admin, FALSE)
             OR (c.kind = 'SUPPORT' AND EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id::text = w."authorHub" AND h."leadUserId" = c.person_id)))) AS "canHide"
    FROM public."CorporatePrayerWallPost" w
    LEFT JOIN public."Participant" p ON w."authorKind" = 'PARTICIPANT' AND p.id = w."authorId"
    LEFT JOIN public."User" u ON w."authorKind" = 'SUPPORT' AND u.id = w."authorId"
    WHERE w."sessionId" = se.id AND w."targetId" IS NOT DISTINCT FROM v_target AND w."hiddenAt" IS NULL
    ORDER BY w."createdAt" DESC LIMIT 60
  ) x;

  IF v_is_target THEN
    SELECT t."hubKey" INTO v_key FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."participantId" = c.person_id LIMIT 1;
    RETURN json_build_object('forMe', TRUE, 'ended', TRUE, 'posts', v_posts, 'prayedForYou', public.prayer_amen_for_target(se.id, COALESCE(v_key, 'COHORT')),
                             'opensAt', se."opensAt", 'hasProject', public.prayer_blocks_pool(se.blocks) = 'FAITH', 'serverNow', now());
  END IF;
  RETURN json_build_object('forMe', FALSE, 'posts', v_posts, 'counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_wall_hide(p_token text, p_post uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  w public."CorporatePrayerWallPost";
  c record;
  v_user "User" := public.app_staff(p_token);
  v_ok boolean := FALSE;
BEGIN
  SELECT * INTO w FROM public."CorporatePrayerWallPost" WHERE id = p_post;
  IF w.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_user.id IS NOT NULL THEN
    v_ok := 'ADMIN'::"Role" = ANY (public.app_user_roles(v_user))
            OR EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id::text = w."authorHub" AND h."leadUserId" = v_user.id);
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public."CorporatePrayerWallPost" SET "hiddenAt" = COALESCE("hiddenAt", now()), "hiddenById" = COALESCE("hiddenById", v_user.id) WHERE id = w.id;
  RETURN json_build_object('ok', TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_wall_post(p_token text, p_session uuid, p_body text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_body text := btrim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g'));
  v_target uuid;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" = 'LIVE' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Only someone praying it (checked in) can write, while it can still be prayed.
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'NOT_CHECKED_IN';
  END IF;
  IF now() >= public.prayer_late_until(se.id) THEN RAISE EXCEPTION 'ENDED'; END IF;
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'EMPTY_MESSAGE'; END IF;
  IF char_length(v_body) > 140 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  IF (SELECT count(*) FROM public."CorporatePrayerWallPost" w WHERE w."sessionId" = se.id AND w."authorKind" = c.kind AND w."authorId" = c.person_id) >= 5 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES';
  END IF;
  IF c.kind = 'PARTICIPANT' AND public.prayer_is_target(se.id, c.person_id) THEN RAISE EXCEPTION 'IS_YOU'; END IF;
  v_target := public.prayer_session_target(se.id, c.hub_key);
  INSERT INTO public."CorporatePrayerWallPost" ("sessionId", "targetId", "authorKind", "authorId", "authorHub", body)
  VALUES (se.id, v_target, c.kind, c.person_id, c.hub_key, v_body);
  RETURN public.corporate_prayer_wall(p_token, p_session);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user(p_name text, p_password text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'SUPPORT'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  created "User";
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF normalized_email IS NULL AND normalized_phone IS NULL THEN
    RAISE EXCEPTION 'An email address or phone number is required';
  END IF;
  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  INSERT INTO "User" (email, phone, name, role, password_hash)
  VALUES (
    normalized_email,
    normalized_phone,
    trim(p_name),
    p_role::"Role",
    crypt(p_password, gen_salt('bf', 10))
  )
  RETURNING * INTO created;

  RETURN public.safe_user_json(created);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user(p_token text, p_name text, p_password text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'SUPPORT'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  real_actor "User" := public.app_staff_real(p_token);
  created "User";
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF normalized_email IS NULL AND normalized_phone IS NULL THEN
    RAISE EXCEPTION 'An email address or phone number is required';
  END IF;
  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  -- Only a real admin can hand out anything above Support.
  IF p_role <> 'SUPPORT' AND real_actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  INSERT INTO "User" (email, phone, name, role, password_hash, "mustChangePassword")
  VALUES (
    normalized_email,
    normalized_phone,
    trim(p_name),
    p_role::"Role",
    crypt(p_password, gen_salt('bf', 10)),
    TRUE
  )
  RETURNING * INTO created;

  RETURN public.safe_user_json(created);
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_programme_cohort_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH candidates AS (
    SELECT
      c.id,
      c."startDate",
      c."endDate",
      (timezone('Africa/Lagos', now()))::date AS today
    FROM public."Cohort" c
    WHERE c.status = 'ACTIVE'
      AND COALESCE(c."isPractice", FALSE) IS FALSE
  ), ranked AS (
    SELECT *,
      CASE
        WHEN "startDate" IS NOT NULL
          AND "startDate" <= today
          AND ("endDate" IS NULL OR "endDate" >= today) THEN 0
        WHEN "startDate" IS NOT NULL AND "startDate" > today THEN 1
        ELSE 2
      END AS cohort_rank
    FROM candidates
  )
  SELECT id
  FROM ranked
  ORDER BY
    cohort_rank ASC,
    -- If dates overlap, the cohort that started most recently is current.
    CASE WHEN cohort_rank = 0 THEN "startDate" END DESC NULLS LAST,
    -- Before a cohort starts, choose the next scheduled one.
    CASE WHEN cohort_rank = 1 THEN "startDate" END ASC NULLS LAST,
    -- With no running or upcoming cohort, retain the most recently finished
    -- programme. A missing start date is never allowed to outrank a dated one.
    CASE WHEN cohort_rank = 2 AND "startDate" IS NULL THEN 1 ELSE 0 END ASC,
    CASE WHEN cohort_rank = 2 THEN COALESCE("endDate", "startDate") END DESC NULLS LAST,
    CASE WHEN cohort_rank = 2 THEN "startDate" END DESC NULLS LAST,
    id ASC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.delete_hub_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId" INTO v_hub_id, v_author_id FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_author_id IS DISTINCT FROM v_actor_id
      AND NOT public.app_hub_can(v_hub_id, 'MESSAGE')
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead, its assistant lead, or an admin can delete this message';
    END IF;
  END IF;

  DELETE FROM public."HubMessage" WHERE id = p_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_prayer_slot(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSession" WHERE "slotId" = p_id) THEN RAISE EXCEPTION 'SLOT_HAS_HISTORY'; END IF;
  DELETE FROM public."CorporatePrayerSlot" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_prayer_verse(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ref jsonb := jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', p_id));
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSession" WHERE "verseId" = p_id OR blocks @> v_ref)
     OR EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" WHERE blocks @> v_ref) THEN
    RAISE EXCEPTION 'VERSE_IN_USE';
  END IF;
  DELETE FROM public."CorporatePrayerVerse" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_testimony(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  DELETE FROM "Testimony" WHERE id = p_id AND "participantId" = person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_alert_name(p_user_id uuid, p_participant_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT name FROM public."User" WHERE id = p_user_id),
    (SELECT CASE WHEN array_length(parts, 1) > 1 THEN parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.' ELSE parts[1] END
     FROM (SELECT regexp_split_to_array(btrim("fullName"), '\s+') AS parts FROM public."Participant" WHERE id = p_participant_id) x),
    'Someone'
  );
$function$;

CREATE OR REPLACE FUNCTION public.discussion_clean_body(p_body text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  IF v = '' THEN
    RAISE EXCEPTION 'Write something first';
  END IF;
  IF char_length(v) > 2000 THEN
    RAISE EXCEPTION 'Keep it under 2000 characters';
  END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_clean_mentions(p_group_id uuid, p_mentions jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'id', id)), '[]'::jsonb)
  FROM (
    SELECT DISTINCT m->>'kind' AS kind, (m->>'id')::uuid AS id
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_mentions) = 'array' THEN p_mentions ELSE '[]'::jsonb END) m
    WHERE m->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (
        (m->>'kind' = 'SUPPORT' AND EXISTS (
          SELECT 1 FROM public."Group" g WHERE g.id = p_group_id AND g."supportId" = (m->>'id')::uuid))
        OR (m->>'kind' = 'PARTICIPANT' AND EXISTS (
          SELECT 1 FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
          WHERE gp."groupId" = p_group_id AND gp."participantId" = (m->>'id')::uuid))
      )
    LIMIT 20
  ) v;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_live_post(p_post_id uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."GroupPost"
    WHERE id = p_post_id AND "groupId" = p_group_id AND "removedAt" IS NULL AND "deletedAt" IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.discussion_mark_seen(p_group_id uuid, p_user_id uuid, p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public."GroupDiscussionSeen" ("groupId", "userId", "seenAt")
    VALUES (p_group_id, p_user_id, clock_timestamp())
    ON CONFLICT ("groupId", "userId") WHERE "userId" IS NOT NULL
    DO UPDATE SET "seenAt" = EXCLUDED."seenAt";
  ELSIF p_participant_id IS NOT NULL THEN
    INSERT INTO public."GroupDiscussionSeen" ("groupId", "participantId", "seenAt")
    VALUES (p_group_id, p_participant_id, clock_timestamp())
    ON CONFLICT ("groupId", "participantId") WHERE "participantId" IS NOT NULL
    DO UPDATE SET "seenAt" = EXCLUDED."seenAt";
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_mentions_json(p_mentions jsonb)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(json_agg(json_build_object('kind', m->>'kind', 'id', m->>'id', 'name', COALESCE(u.name, p."fullName"))), '[]'::json)
  FROM jsonb_array_elements(COALESCE(p_mentions, '[]'::jsonb)) m
  LEFT JOIN public."User" u ON m->>'kind' = 'SUPPORT' AND u.id = (m->>'id')::uuid
  LEFT JOIN public."Participant" p ON m->>'kind' = 'PARTICIPANT' AND p.id = (m->>'id')::uuid
  WHERE COALESCE(u.name, p."fullName") IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_participant_group(p_participant_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT g.id
  FROM public."GroupParticipant" gp
  JOIN public."Participant" p ON p.id = gp."participantId"
  JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = p."cohortId" AND g."archivedAt" IS NULL
  WHERE gp."participantId" = p_participant_id
  ORDER BY g.name
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_post_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.kind = 'INTRO' THEN
    RETURN NEW;
  END IF;
  IF NEW."authorParticipantId" IS NOT NULL THEN
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      ARRAY(SELECT "supportId" FROM public."Group" WHERE id = NEW."groupId"), '{}',
      '{name} posted in your group discussion');
  ELSE
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      '{}',
      ARRAY(
        SELECT gp."participantId"
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = NEW."groupId"
      ),
      '{name} posted in your group discussion');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_post_json(p_post_id uuid, p_mod boolean, p_user_id uuid, p_participant_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'id', gp.id,
    'kind', gp.kind,
    'author', json_build_object(
      'kind', CASE WHEN gp."authorUserId" IS NOT NULL THEN 'SUPPORT' ELSE 'PARTICIPANT' END,
      'id', COALESCE(gp."authorUserId", gp."authorParticipantId"),
      'name', COALESCE(u.name, p."fullName"),
      'avatarUrl', COALESCE(u."avatarUrl", p."avatarUrl"),
      'gender', p.gender,
      'isSupport', gp."authorUserId" IS NOT NULL
    ),
    'isMine', (gp."authorUserId" = p_user_id OR gp."authorParticipantId" = p_participant_id),
    'removed', gp."removedAt" IS NOT NULL,
    'body', CASE WHEN gp."removedAt" IS NULL OR p_mod THEN gp.body END,
    'pinned', gp."pinnedAt" IS NOT NULL AND gp."removedAt" IS NULL,
    'pinnedByName', (SELECT pu.name FROM public."User" pu WHERE pu.id = gp."pinnedById" AND gp."pinnedAt" IS NOT NULL),
    'createdAt', gp."createdAt",
    'mentions', public.discussion_mentions_json(gp.mentions),
    'likeCount', (SELECT count(*) FROM public."GroupPostLike" l WHERE l."postId" = gp.id),
    'likedByMe', EXISTS (
      SELECT 1 FROM public."GroupPostLike" l
      WHERE l."postId" = gp.id AND (l."userId" = p_user_id OR l."participantId" = p_participant_id)
    ),
    'reportCount', CASE WHEN p_mod THEN (
      SELECT count(*) FROM public."GroupPostReport" rp WHERE rp."postId" = gp.id AND rp."resolvedAt" IS NULL
    ) ELSE 0 END,
    'replies', COALESCE((
      SELECT json_agg(json_build_object(
        'id', r.id,
        'author', json_build_object(
          'kind', CASE WHEN r."authorUserId" IS NOT NULL THEN 'SUPPORT' ELSE 'PARTICIPANT' END,
          'id', COALESCE(r."authorUserId", r."authorParticipantId"),
          'name', COALESCE(ru.name, rpp."fullName"),
          'avatarUrl', COALESCE(ru."avatarUrl", rpp."avatarUrl")
        ),
        'isMine', (r."authorUserId" = p_user_id OR r."authorParticipantId" = p_participant_id),
        'removed', r."removedAt" IS NOT NULL,
        'body', CASE WHEN r."removedAt" IS NULL OR p_mod THEN r.body END,
        'createdAt', r."createdAt",
        'mentions', public.discussion_mentions_json(r.mentions)
      ) ORDER BY r."createdAt")
      FROM public."GroupPostReply" r
      LEFT JOIN public."User" ru ON ru.id = r."authorUserId"
      LEFT JOIN public."Participant" rpp ON rpp.id = r."authorParticipantId"
      WHERE r."postId" = gp.id AND r."deletedAt" IS NULL
        AND (gp."removedAt" IS NULL OR p_mod)
    ), '[]'::json)
  )
  FROM public."GroupPost" gp
  LEFT JOIN public."User" u ON u.id = gp."authorUserId"
  LEFT JOIN public."Participant" p ON p.id = gp."authorParticipantId"
  WHERE gp.id = p_post_id;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_reply_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_post public."GroupPost";
BEGIN
  SELECT * INTO v_post FROM public."GroupPost" WHERE id = NEW."postId";
  PERFORM public.discussion_send_alerts(
    v_post."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
    ARRAY[v_post."authorUserId"], ARRAY[v_post."authorParticipantId"],
    '{name} replied to your post');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_report_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
  v_reason TEXT := CASE NEW.reason
    WHEN 'SPAM' THEN 'Spam or selling' WHEN 'UNKIND' THEN 'Unkind or offensive'
    WHEN 'OFF_TOPIC' THEN 'Not about FOF' ELSE 'Something else' END;
BEGIN
  SELECT g.* INTO v_group FROM public."Group" g JOIN public."GroupPost" gp ON gp."groupId" = g.id WHERE gp.id = NEW."postId";
  -- The group's support opens their Discussion tab; admins open the group page.
  PERFORM public.invoke_discussion_notify(
    ARRAY[v_group."supportId"], '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/support/participants?tab=discussion', NULL);
  PERFORM public.invoke_discussion_notify(
    ARRAY(SELECT v FROM public.module_viewers('groups') v WHERE v IS DISTINCT FROM v_group."supportId"), '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/group-view/' || v_group."supportId" || '?cohort=' || v_group."cohortId", NULL);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_send_alerts(p_group_id uuid, p_author_user uuid, p_author_participant uuid, p_mentions jsonb, p_body text, p_other_users uuid[], p_other_participants uuid[], p_other_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name TEXT := public.discussion_alert_name(p_author_user, p_author_participant);
  v_snippet TEXT := left(regexp_replace(p_body, '\s+', ' ', 'g'), 120);
  v_tag_users UUID[];
  v_tag_participants UUID[];
  v_staff_path TEXT := '/support/participants?tab=discussion';
  v_participant_path TEXT := '/me/group?tab=discussion';
BEGIN
  SELECT
    COALESCE(array_agg(DISTINCT (m->>'id')::uuid) FILTER (WHERE m->>'kind' = 'SUPPORT'), '{}'),
    COALESCE(array_agg(DISTINCT (m->>'id')::uuid) FILTER (WHERE m->>'kind' = 'PARTICIPANT'), '{}')
  INTO v_tag_users, v_tag_participants
  FROM jsonb_array_elements(COALESCE(p_mentions, '[]'::jsonb)) m;

  v_tag_users := array_remove(v_tag_users, p_author_user);
  v_tag_participants := array_remove(v_tag_participants, p_author_participant);

  PERFORM public.invoke_discussion_notify(
    v_tag_users, v_tag_participants,
    v_name || ' tagged you in the group discussion', v_snippet, v_staff_path, v_participant_path);

  PERFORM public.invoke_discussion_notify(
    ARRAY(SELECT u FROM unnest(COALESCE(p_other_users, '{}')) u
          WHERE u IS NOT NULL AND u IS DISTINCT FROM p_author_user AND NOT (u = ANY(v_tag_users))),
    ARRAY(SELECT p FROM unnest(COALESCE(p_other_participants, '{}')) p
          WHERE p IS NOT NULL AND p IS DISTINCT FROM p_author_participant AND NOT (p = ANY(v_tag_participants))),
    replace(p_other_title, '{name}', v_name), v_snippet, v_staff_path, v_participant_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_staff_access(p_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
BEGIN
  IF NOT public.app_is_staff() THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_group.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_group."supportId" = public.app_current_user_id() AND v_group."archivedAt" IS NULL THEN
    RETURN 'SUPPORT';
  END IF;
  IF public.app_is_admin() THEN
    RETURN 'ADMIN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."HubMembership" m
    WHERE m."userId" = v_group."supportId"
      AND m."cohortId" = v_group."cohortId"
      AND public.app_hub_can(m."hubId", 'GROUPS')
  ) THEN
    RETURN 'HUB';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_unseen_count(p_group_id uuid, p_user_id uuid, p_participant_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH seen AS (
    SELECT COALESCE(max("seenAt"), '-infinity'::timestamptz) AS at
    FROM public."GroupDiscussionSeen"
    WHERE "groupId" = p_group_id AND ("userId" = p_user_id OR "participantId" = p_participant_id)
  )
  SELECT (
    (SELECT count(*) FROM public."GroupPost" gp, seen
      WHERE gp."groupId" = p_group_id AND gp."createdAt" > seen.at
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
        AND NOT (COALESCE(gp."authorUserId" = p_user_id, FALSE) OR COALESCE(gp."authorParticipantId" = p_participant_id, FALSE)))
    + (SELECT count(*) FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId", seen
      WHERE gp."groupId" = p_group_id AND r."createdAt" > seen.at
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL AND r."removedAt" IS NULL AND r."deletedAt" IS NULL
        AND NOT (COALESCE(r."authorUserId" = p_user_id, FALSE) OR COALESCE(r."authorParticipantId" = p_participant_id, FALSE)))
  )::int;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_upsert_intro(p_group_id uuid, p_user_id uuid, p_participant_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_body TEXT := public.discussion_clean_body(p_body);
  v_id UUID;
  v_name TEXT := public.discussion_alert_name(p_user_id, p_participant_id);
  v_snippet TEXT := left(regexp_replace(v_body, '\s+', ' ', 'g'), 120);
BEGIN
  SELECT id INTO v_id
  FROM public."GroupPost"
  WHERE "groupId" = p_group_id AND kind = 'INTRO'
    AND "authorUserId" IS NOT DISTINCT FROM p_user_id
    AND "authorParticipantId" IS NOT DISTINCT FROM p_participant_id
    AND "deletedAt" IS NULL AND "removedAt" IS NULL;

  IF v_id IS NOT NULL THEN
    UPDATE public."GroupPost" SET body = v_body WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public."GroupPost" ("groupId", "authorUserId", "authorParticipantId", body, kind)
  VALUES (p_group_id, p_user_id, p_participant_id, v_body, 'INTRO')
  RETURNING id INTO v_id;

  IF p_user_id IS NOT NULL THEN
    PERFORM public.invoke_discussion_notify(
      '{}',
      ARRAY(
        SELECT gp."participantId"
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = p_group_id
      ),
      'Your support has started introductions. Say hello!', v_snippet,
      '/support/participants?tab=discussion', '/me/group?tab=discussion');
  ELSE
    PERFORM public.invoke_discussion_notify(
      ARRAY(SELECT "supportId" FROM public."Group" WHERE id = p_group_id AND "supportId" IS NOT NULL),
      '{}',
      v_name || ' introduced themselves.', v_snippet,
      '/support/participants?tab=discussion', '/me/group?tab=discussion');
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_record_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(NEW."weekId"), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_group_support_cohort_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."supportId" IS NOT NULL THEN
    INSERT INTO public."UserCohort" ("userId", "cohortId")
    VALUES (NEW."supportId", NEW."cohortId")
    ON CONFLICT ("userId", "cohortId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_prayer_session(p_slot uuid, p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s public."CorporatePrayerSlot";
  v_session uuid;
  v_opens timestamptz;
  v_pool text;
  v_key text;
  v_pick record;
  v_chosen uuid[] := '{}'::uuid[];
BEGIN
  SELECT * INTO s FROM public."CorporatePrayerSlot" WHERE id = p_slot AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_slot::text || p_date::text, 0));
  SELECT id INTO v_session FROM public."CorporatePrayerSession" WHERE "slotId" = p_slot AND "prayerDate" = p_date;
  IF FOUND THEN RETURN v_session; END IF;

  v_opens := (p_date + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
  INSERT INTO public."CorporatePrayerSession" ("slotId", "cohortId", "prayerDate", "slotType", "opensAt", "closesAt", "timerMinutes", blocks, "audienceAll", "hubIds")
  VALUES (p_slot, s."cohortId", p_date, s."slotType", v_opens, v_opens + make_interval(mins => s."joinWindowMinutes"), s."timerMinutes", s.blocks, s."audienceAll", s."hubIds")
  RETURNING id INTO v_session;

  IF s."slotType" = 'LIVE' THEN RETURN v_session; END IF;

  v_pool := public.prayer_blocks_pool(s.blocks);
  IF COALESCE(s."targetMode", 'HUB') = 'COHORT' THEN
    -- One person for every chosen hub.
    SELECT * INTO v_pick FROM public.prayer_pick(s."cohortId", v_pool, v_chosen, p_date, TRUE);
    IF v_pick.participant_id IS NOT NULL THEN
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, 'COHORT', s."cohortId", v_pool, p_date, v_pick.participant_id, v_pick.cycle_no);
    END IF;
  ELSE
    -- One person per chosen hub that has anyone in it, hubs in a fixed order, so every hub prays for someone different.
    FOR v_key IN
      SELECT k.key FROM (
        SELECT public.prayer_participant_hub(s."cohortId", cp.participant_id) AS key FROM public.prayer_counted_participants(s."cohortId") cp
        UNION
        SELECT public.prayer_user_hub(s."cohortId", cs.user_id) FROM public.prayer_counted_supports(s."cohortId") cs
      ) k
      WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", k.key)
      ORDER BY (SELECT h.name FROM public."SupportHub" h WHERE h.id::text = k.key) NULLS LAST, k.key
    LOOP
      SELECT * INTO v_pick FROM public.prayer_pick(s."cohortId", v_pool, v_chosen, p_date, TRUE);
      EXIT WHEN v_pick.participant_id IS NULL;
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, v_key, s."cohortId", v_pool, p_date, v_pick.participant_id, v_pick.cycle_no);
      v_chosen := v_chosen || v_pick.participant_id;
    END LOOP;
  END IF;
  RETURN v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.excuse_lateness(p_record_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_note TEXT;
  v_record public."AttendanceRecord";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can excuse lateness';
  END IF;

  v_note := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Add a note before excusing this record';
  END IF;

  SELECT * INTO v_record FROM public."AttendanceRecord" WHERE id = p_record_id;
  IF v_record.id IS NULL THEN RAISE EXCEPTION 'Attendance record was not found'; END IF;
  IF v_record.status NOT IN ('LATE', 'LEFT_EARLY') THEN
    RAISE EXCEPTION 'Only a Late or Left early record can be excused';
  END IF;

  v_actor_id := public.attendance_session_actor_id();

  UPDATE public."AttendanceRecord"
  SET "lateExcused" = TRUE, "lateExcusedAt" = NOW(), "lateExcusedById" = v_actor_id
  WHERE id = p_record_id
  RETURNING * INTO v_record;

  INSERT INTO public."AttendanceExcusal" ("attendanceRecordId", note, "excusedById")
  VALUES (p_record_id, v_note, v_actor_id)
  ON CONFLICT ("attendanceRecordId") DO UPDATE
    SET note = EXCLUDED.note, "excusedById" = EXCLUDED."excusedById", "createdAt" = NOW();

  RETURN jsonb_build_object(
    'id', v_record.id,
    'participantId', v_record."participantId",
    'weekId', v_record."weekId",
    'status', v_record.status,
    'lateExcused', v_record."lateExcused",
    'lateExcusedAt', v_record."lateExcusedAt",
    'lateExcusedById', v_record."lateExcusedById"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.faith_prayers_prompt_due(p_cohort_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (now() AT TIME ZONE 'Africa/Lagos')::date >= public.faith_prayers_start_date(p_cohort_id)
      - COALESCE((SELECT s."prayerPopupDaysBefore" FROM "FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id), 3),
    FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.faith_prayers_start_date(p_cohort_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.week_class_date(c."startDate", s."prayersStartWeekNumber", w."classDate") + 1
  FROM "FaithProjectSetting" s
  JOIN "Cohort" c ON c.id = s."cohortId"
  LEFT JOIN "Week" w ON w."cohortId" = c.id AND w."weekNumber" = s."prayersStartWeekNumber"
  WHERE s."cohortId" = p_cohort_id AND s."prayersStartWeekNumber" IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.faith_prayers_started(p_cohort_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(public.faith_prayers_start_date(p_cohort_id) <= (now() AT TIME ZONE 'Africa/Lagos')::date, FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.faith_project_keep_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor UUID;
BEGIN
  -- A participant's own save (through save_faith_project) never carries a staff identity, even if a staff session is also present.
  IF COALESCE(current_setting('fof.faith_by_participant', TRUE), '') <> '1' THEN
    v_actor := public.app_current_user_id();
  END IF;
  INSERT INTO "FaithProjectVersion" ("projectId", "participantId", body, "savedById", "savedByName")
  VALUES (NEW.id, NEW."participantId", NEW.body, v_actor, (SELECT u.name FROM "User" u WHERE u.id = v_actor));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.faith_project_prayable(f "FaithProject")
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT f.status = 'SAVED'
    AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "Participant" p
      WHERE p.id = f."participantId"
        AND p."prayerConsent" IS DISTINCT FROM 'OUT'
        AND (f."sharedForPrayer" OR public.faith_prayers_started(p."cohortId")));
$function$;

CREATE OR REPLACE FUNCTION public.feedback_results(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  total INTEGER;
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF staff.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  SELECT count(*) INTO total FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = 'GENERAL';
  RETURN json_build_object(
    'count', total,
    'visible', total >= 5,
    'answers', CASE WHEN total >= 5 THEN (
      SELECT json_agg(r.answers ORDER BY md5(r.id::text))
      FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = 'GENERAL'
    ) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.feedback_themes(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF staff.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object('round', t.round, 'themes', t.themes, 'createdAt', t."createdAt"))
    FROM "FeedbackThemes" t WHERE t."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fill_profile_from_form(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  reg "SheetRegistration";
  person_id UUID;
  a JSONB;
  v_email TEXT;
  v_gender TEXT;
  v_age TEXT;
  v_occupation TEXT;
  v_dob_text TEXT;
  v_dob DATE;
  v_smart TEXT;
  v_final_age TEXT;
  v_prev_owner UUID;
  v_prev_name TEXT;
  v_registered_by_raw TEXT;
  v_registered_by_id UUID;
BEGIN
  SELECT * INTO reg FROM "SheetRegistration" WHERE id = p_registration_id;
  IF reg.id IS NULL OR reg."contactId" IS NULL THEN RETURN; END IF;

  SELECT id INTO person_id FROM "Participant" WHERE "followUpContactId" = reg."contactId";
  IF person_id IS NULL THEN RETURN; END IF;

  a := COALESCE(reg.answers, '{}'::jsonb);
  v_email := NULLIF(trim(COALESCE(reg.email, a->>'Email Address', '')), '');
  v_gender := NULLIF(initcap(trim(COALESCE(a->>'What''s your Gender?', ''))), '');
  IF v_gender NOT IN ('Male', 'Female') THEN v_gender := NULL; END IF;
  v_age := NULLIF(regexp_replace(trim(COALESCE(a->>'Age Range?', '')), '\s*-\s*', ' - '), '');
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under - 18', 'below - 18', 'under18', '<18', 'below18', '18 and below', '18 & below', '18 and under', '18 & under', '17 and below', '17 & below', '17 and under', '17 & under', '10 - 17', '10-17', '10 to 17') THEN v_age := '10 - 17'; END IF;
  -- The form's "19 - 24" and older "18 - 24" answers are the 18 - 24 bracket (18 is an adult now).
  IF v_age IN ('18 - 24', '19 - 24') THEN v_age := '18 - 24'; END IF;
  IF v_age NOT IN ('10 - 17', '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN v_age := NULL; END IF;
  v_occupation := NULLIF(trim(COALESCE(NULLIF(trim(a->>'What''s your occupation?'), ''), a->>'Occupation', '')), '');
  v_dob_text := trim(COALESCE(a->>'Date of birth', ''));
  BEGIN
    IF v_dob_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_dob := v_dob_text::date;
    ELSIF v_dob_text ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      v_dob := to_date(v_dob_text, 'MM/DD/YYYY');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;
  IF v_dob IS NOT NULL AND (v_dob > CURRENT_DATE OR v_dob < DATE '1900-01-01') THEN v_dob := NULL; END IF;
  v_smart := NULLIF(trim(COALESCE(a->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)', '')), '');

  -- "Who Registered You for FOF?" -- ignore blank / just a stray comma, then
  -- collapse any comma-joined name pieces to a single space before matching.
  -- Ambiguous (more than one active support/admin with this exact name)
  -- resolves to nobody rather than guessing.
  v_registered_by_raw := trim(COALESCE(a->>'Who Registered You for FOF?', ''));
  IF v_registered_by_raw IN ('', ',') THEN
    v_registered_by_raw := NULL;
  ELSE
    v_registered_by_raw := NULLIF(trim(regexp_replace(v_registered_by_raw, '\s*,\s*', ' ', 'g')), '');
  END IF;
  v_registered_by_id := NULL;
  IF v_registered_by_raw IS NOT NULL THEN
    SELECT (array_agg(u.id))[1] INTO v_registered_by_id
    FROM "User" u
    WHERE u.role IN ('SUPPORT', 'ADMIN')
      AND u."isActive" IS NOT FALSE
      AND lower(trim(u.name)) = lower(v_registered_by_raw)
    HAVING COUNT(*) = 1;
  END IF;

  -- Their follow-up card shows gender and age too.
  UPDATE "FollowUpContact" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "registeredById" = COALESCE("registeredById", v_registered_by_id)
  WHERE id = reg."contactId";

  -- The profile fill below sets the age range; the teen handling just after it does the teen work, so the
  -- age-change trigger (participant_age_teen_boundary) stands aside for this one statement.
  PERFORM set_config('fof.skip_teen_boundary', 'on', true);
  UPDATE "Participant" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "dateOfBirth" = COALESCE("dateOfBirth", v_dob),
    "smartRequest" = COALESCE(NULLIF(trim("smartRequest"), ''), v_smart),
    "updatedAt" = NOW()
  WHERE id = person_id;
  PERFORM set_config('fof.skip_teen_boundary', '', true);

  -- Teens (10 - 17, or the form's "18 and below") become TEENAGER, but only while the switch is on and
  -- only from plain REGISTERED, so a closed or later status is never overridden.
  -- Uses the age now on the profile, so a date of birth wins over the form's range.
  SELECT "ageRange" INTO v_final_age FROM "Participant" WHERE id = person_id;
  IF replace(lower(COALESCE(v_final_age, '')), ' ', '') IN ('10-17', '18andbelow')
     AND COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) THEN
    -- A support who already holds them (they were saved as a prospect first) loses
    -- them to a Teen Support: clear the owner so assign_teen_contacts can place them,
    -- and tell that support instead of letting the teen vanish from their list.
    SELECT c."ownerId", u.name INTO v_prev_owner, v_prev_name
    FROM "FollowUpContact" c LEFT JOIN "User" u ON u.id = c."ownerId"
    WHERE c.id = reg."contactId" AND c."registrationStatus" = 'REGISTERED' AND c."ownerId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
        WHERE m."userId" = c."ownerId");
    UPDATE "FollowUpContact"
    SET "registrationStatus" = 'TEENAGER'::"FollowUpRegistrationStatus",
        "ageRange" = '10 - 17',
        "ownerId" = CASE WHEN v_prev_owner IS NOT NULL THEN NULL ELSE "ownerId" END,
        "updatedAt" = NOW()
    WHERE id = reg."contactId" AND "registrationStatus" = 'REGISTERED';
    IF v_prev_owner IS NOT NULL THEN
      INSERT INTO "Notification" ("userId", title, body, path, type)
      VALUES (v_prev_owner, 'A teen moved to a Teen Support',
              reg."fullName" || ' signed up as a teen, so they now go to a Teen Support and are off your list.',
              '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
    END IF;
  END IF;

  -- People the form created (not ones a support added first) came from the form.
  UPDATE "Participant" p SET source = 'FORM'
  FROM "FollowUpContact" c
  WHERE p.id = person_id AND c.id = reg."contactId" AND c.source = 'Google Form' AND p.source = 'FOLLOW_UP';

  IF v_smart IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FaithProject" WHERE "participantId" = person_id) THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, v_smart, 'NOT_DRAFTED');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_shared_attendance(p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_cohort_id UUID;
  v_expected_count INTEGER;
  v_marked_count INTEGER;
  v_was_finalized BOOLEAN;
  v_session public."AttendanceSession";
BEGIN
  IF NOT public.app_is_staff() THEN RAISE EXCEPTION 'You must be signed in as a support or admin to finalise attendance'; END IF;
  SELECT "cohortId" INTO v_cohort_id FROM public."Week" WHERE id = p_week_id;
  IF v_cohort_id IS NULL THEN RAISE EXCEPTION 'Attendance week was not found'; END IF;
  SELECT COUNT(*) INTO v_expected_count FROM public."Participant" WHERE "cohortId" = v_cohort_id AND status = 'ACTIVE';
  SELECT COUNT(*) INTO v_marked_count
  FROM public."AttendanceRecord" a JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';
  IF v_expected_count = 0 OR v_marked_count <> v_expected_count THEN RAISE EXCEPTION 'Mark every participant before finalising attendance'; END IF;

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id) ON CONFLICT ("weekId") DO NOTHING;
  SELECT "finalizedAt" IS NOT NULL INTO v_was_finalized FROM public."AttendanceSession" WHERE "weekId" = p_week_id FOR UPDATE;
  v_actor_id := public.attendance_session_actor_id();
  UPDATE public."AttendanceSession"
  SET "finalizedAt" = COALESCE("finalizedAt", NOW()),
      "finalizedById" = COALESCE("finalizedById", v_actor_id),
      "finalizationMethod" = COALESCE("finalizationMethod", 'MANUAL'),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  PERFORM public.sync_attendance_follow_up_tasks(p_week_id);
  IF NOT v_was_finalized THEN PERFORM public.notify_attendance_report(p_week_id); END IF;
  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.fof_assert_meeting_open(p_group_id uuid, p_hub_id uuid, p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_day TEXT; v_time TEXT; v_practice BOOLEAN; v_window tstzrange;
BEGIN
  -- Cron jobs and the service key carry no app session; admins may record any time.
  IF public.app_current_token() IS NULL OR public.app_is_admin() OR p_week_id IS NULL THEN
    RETURN;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g."meetingDay", g."meetingTime", COALESCE(c."isPractice", false)
      INTO v_day, v_time, v_practice
    FROM public."Group" g JOIN public."Cohort" c ON c.id = g."cohortId" WHERE g.id = p_group_id;
  ELSIF p_hub_id IS NOT NULL THEN
    SELECT h."meetingDay", h."meetingTime", COALESCE(c."isPractice", false)
      INTO v_day, v_time, v_practice
    FROM public."SupportHub" h JOIN public."Cohort" c ON c.id = h."cohortId" WHERE h.id = p_hub_id;
  ELSE
    RETURN;
  END IF;
  IF NOT FOUND OR v_practice THEN RETURN; END IF;
  -- An admin opened this week's recording for this hub or group.
  IF public.meeting_recording_opening(p_hub_id, p_group_id, p_week_id) IS NOT NULL THEN
    RETURN;
  END IF;
  IF v_day IS NULL OR v_time IS NULL THEN
    RAISE EXCEPTION 'MEETING_TIME_NOT_SET: set a meeting day and time first';
  END IF;
  v_window := public.fof_meeting_window(v_day, v_time, p_week_id);
  IF v_window IS NULL OR NOT (now() <@ v_window) THEN
    RAISE EXCEPTION 'MEETING_WINDOW_CLOSED: %|%',
      to_char(lower(v_window) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD"T"HH24:MI'),
      to_char(upper(v_window) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD"T"HH24:MI');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fof_is_teen_age(p_age text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT k ~ '^(below|under)[0-9]+$' OR k IN ('10-17', '15-17', '18andbelow', '18orbelow', '17andbelow', '17orbelow')
  FROM (SELECT regexp_replace(lower(COALESCE(p_age, '')), '\s', '', 'g') AS k) s;
$function$;

CREATE OR REPLACE FUNCTION public.fof_local_phone(raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN d ~ '^0[7-9][01][0-9]{8}$' THEN d
    WHEN d ~ '^2340?[7-9][01][0-9]{8}$' THEN '0' || right(d, 10)
    WHEN d ~ '^[7-9][01][0-9]{8}$' THEN '0' || d
    ELSE NULLIF(trim(raw), '')
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) digits;
$function$;

CREATE OR REPLACE FUNCTION public.fof_localize_phone_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone := public.fof_local_phone(NEW.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fof_meeting_window(p_day text, p_time text, p_week_id integer)
 RETURNS tstzrange
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_day IS NULL OR p_time IS NULL OR p_time !~ '^\d{1,2}:\d{2}'
      OR array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_day)) IS NULL THEN NULL
    ELSE tstzrange(
      (x.meeting_date::timestamp + p_time::time) AT TIME ZONE 'Africa/Lagos' - interval '10 minutes',
      (x.meeting_date + 1)::timestamp AT TIME ZONE 'Africa/Lagos',
      '[)')
  END
  FROM (
    -- The first meeting day on or after the class date (a moved class need not be on a Sunday).
    SELECT d.class_date
           + ((array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_day)) - 1
               - extract(dow FROM d.class_date)::int + 7) % 7) AS meeting_date
    FROM (
      SELECT public.week_class_date(c."startDate"::date, w."weekNumber", w."classDate"::date) AS class_date
      FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
      WHERE w.id = p_week_id
    ) d
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.fof_meeting_window_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID; v_hub UUID; v_week INT; v_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'MeetingAttendance' THEN
    v_group := COALESCE(NEW."groupId", public.discussion_participant_group(NEW."participantId"));
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'GroupPrayerStatus' THEN
    v_group := NEW."groupId";
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'SupportSession' THEN
    IF NEW.type IS DISTINCT FROM 'SUNDAY_RECAP' THEN RETURN NEW; END IF;
    v_hub := NEW."hubId";
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'SupportSessionAttendance' THEN
    SELECT s.type, s."hubId", s."weekId" INTO v_type, v_hub, v_week
    FROM public."SupportSession" s WHERE s.id = NEW."sessionId";
    IF v_type IS DISTINCT FROM 'SUNDAY_RECAP' THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.fof_assert_meeting_open(v_group, v_hub, v_week);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fof_name_key(n text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_to_string(ARRAY(
    SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(btrim(COALESCE(n, ''))), '\s+')) AS w WHERE w <> '' ORDER BY w
  ), ' '), '');
$function$;

CREATE OR REPLACE FUNCTION public.fof_notify(p_user_ids uuid[], p_title text, p_body text, p_path text, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, p_title, p_body, p_path, p_type FROM unnest(p_user_ids) AS uid;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', p_type),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fof_phone_key(raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN d ~ '^0[7-9][01][0-9]{8}$' THEN '234' || substr(d, 2)
    WHEN d ~ '^234[7-9][01][0-9]{8}$' THEN d
    WHEN d ~ '^[0-9]{10,15}$' AND left(d, 1) <> '0' THEN d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) digits;
$function$;

CREATE OR REPLACE FUNCTION public.followup_active_supports()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT DISTINCT c."ownerId"
  FROM "FollowUpContact" c
  WHERE c."ownerId" IS NOT NULL AND c."isTest" IS NOT TRUE
    AND c."statusChangedAt" >= now() - interval '7 days'
    AND c."statusChangedAt" > c."ownerAssignedAt";
$function$;

CREATE OR REPLACE FUNCTION public.followup_contact_it_support_ids(p_contact_id uuid, p_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_contact public."FollowUpContact";
  v_cohort UUID;
  v_hub UUID;
  v_ids UUID[];
BEGIN
  SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  v_cohort := COALESCE(v_contact."cohortId", p_cohort_id);

  IF v_contact."ownerId" IS NOT NULL AND v_cohort IS NOT NULL THEN
    SELECT m."hubId" INTO v_hub
    FROM public."HubMembership" m
    WHERE m."userId" = v_contact."ownerId" AND m."cohortId" = v_cohort
    LIMIT 1;
  END IF;

  IF v_hub IS NOT NULL THEN
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."User" u ON u.id = hi."userId"
      WHERE hi."hubId" = v_hub AND u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  ELSIF v_cohort IS NOT NULL THEN
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."SupportHub" h ON h.id = hi."hubId"
      JOIN public."User" u ON u.id = hi."userId"
      WHERE h."cohortId" = v_cohort AND u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  ELSE
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."User" u ON u.id = hi."userId"
      WHERE u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  END IF;

  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_contact_registration_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED')
     AND (OLD."registrationStatus" IS NULL
          OR OLD."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED'))
     AND NEW."manualRegistrationAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM public."SheetRegistration"
       WHERE "contactId" IS NULL
         AND ("phoneNormalised" = public.fof_phone_key(NEW.phone) OR phone = NEW.phone)
         AND "createdAt" > now() - interval '15 minutes'
     ) THEN
    RAISE EXCEPTION 'NO_FORM_REGISTRATION';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_owner_handed_on_recently(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "FollowUpReassignmentLog" l
    WHERE l."fromUserId" = p_owner AND l."createdAt" > now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM "FollowUpContact" c WHERE c."ownerId" = p_owner AND c."statusChangedAt" > l."createdAt")
  );
$function$;

CREATE OR REPLACE FUNCTION public.followup_owner_is_quiet(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" k WHERE k."ownerId" = p_owner AND k."closedAt" IS NULL)
      OR public.followup_owner_handed_on_recently(p_owner)
      OR public.followup_support_inactive(p_owner);
$function$;

CREATE OR REPLACE FUNCTION public.followup_phone_is_valid(p_phone text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_phone IS NULL THEN FALSE
    ELSE (
      regexp_replace(p_phone, '\D', '', 'g') ~ '^0[7-9][01][0-9]{8}$'
      OR regexp_replace(p_phone, '\D', '', 'g') ~ '^234[7-9][01][0-9]{8}$'
      OR (regexp_replace(p_phone, '\D', '', 'g') ~ '^[0-9]{10,15}$'
          AND left(regexp_replace(p_phone, '\D', '', 'g'), 1) <> '0')
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_reassign_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((SELECT value <> to_jsonb(false) FROM "AppSetting" WHERE "settingKey" = 'followup_auto_reassign_enabled'), TRUE);
$function$;

CREATE OR REPLACE FUNCTION public.followup_reassign_since()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((SELECT (value #>> '{}')::timestamptz FROM "AppSetting" WHERE "settingKey" = 'followup_auto_reassign_since'), now());
$function$;

CREATE OR REPLACE FUNCTION public.followup_reassignments(p_days integer DEFAULT 7)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  RETURN json_build_object(
    'recent', COALESCE((
      SELECT json_agg(r ORDER BY r."createdAt" DESC) FROM (
        SELECT l.id, l."createdAt", l.reason, c."fullName" AS "contactName",
               fu.name AS "fromName", tu.name AS "toName"
        FROM "FollowUpReassignmentLog" l
        JOIN "FollowUpContact" c ON c.id = l."contactId"
        LEFT JOIN "User" fu ON fu.id = l."fromUserId"
        LEFT JOIN "User" tu ON tu.id = l."toUserId"
        WHERE l."createdAt" > now() - make_interval(days => GREATEST(p_days, 1))
        ORDER BY l."createdAt" DESC LIMIT 200
      ) r
    ), '[]'::json),
    'waiting', COALESCE((
      SELECT json_agg(w ORDER BY w."deadlineAt") FROM (
        SELECT u.name AS "ownerName", ck."promptedAt", ck."deadlineAt", ck.answer,
               (SELECT COUNT(*) FROM public.followup_stale_contacts() s WHERE s."ownerId" = ck."ownerId") AS people
        FROM "FollowUpOwnerCheck" ck JOIN "User" u ON u.id = ck."ownerId"
        WHERE ck."closedAt" IS NULL
      ) w
    ), '[]'::json),
    'activeSupports', (SELECT COUNT(*) FROM public.followup_active_supports())
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_related_contacts(p_token text, p_contact_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  c "FollowUpContact";
  mail TEXT;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = p_contact_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CONTACT_NOT_FOUND'; END IF;
  IF staff.role <> 'ADMIN' AND c."ownerId" IS DISTINCT FROM staff.id THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  mail := lower(trim(COALESCE(c.email, '')));
  IF mail = '' THEN RETURN '[]'::JSON; END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t."sameCohort" DESC, t."minutesApart" ASC)
    FROM (
      SELECT
        o.id,
        o."fullName",
        o.phone,
        o.email,
        'EMAIL'::TEXT AS "sharedBy",
        (abs(extract(epoch FROM (o."createdAt" - c."createdAt"))) / 60)::INTEGER AS "minutesApart",
        (SELECT name FROM "Cohort" WHERE id = o."cohortId") AS "cohortName",
        (o."cohortId" IS NOT DISTINCT FROM c."cohortId") AS "sameCohort",
        (SELECT name FROM "User" WHERE id = o."ownerId") AS "ownerName",
        (o."ownerId" IS NOT DISTINCT FROM staff.id) AS mine
      FROM "FollowUpContact" o
      WHERE o.id <> c.id
        AND COALESCE(o."isTest", FALSE) = FALSE
        AND lower(trim(COALESCE(o.email, ''))) = mail
        AND regexp_replace(COALESCE(o.phone, ''), '\D', '', 'g') ~ '^(234|0)?[7-9][01][0-9]{8}$'
      ORDER BY (o."cohortId" IS NOT DISTINCT FROM c."cohortId") DESC, abs(extract(epoch FROM (o."createdAt" - c."createdAt"))) ASC
      LIMIT 5
    ) t
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_relax_on(p_key text, p_default boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((SELECT (value = to_jsonb(true)) FROM "AppSetting" WHERE "settingKey" = p_key), p_default);
$function$;

CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
 RETURNS SETOF "FollowUpContact"
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND (c."cohortId" IS NULL
         OR c."cohortId" = public.current_programme_cohort_id())
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isTest" IS NOT TRUE AND u."isActive" IS NOT FALSE
    AND c."nextAction" IS DISTINCT FROM 'CLOSE'
    AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'NEXT_COHORT', 'TEENAGER', 'TEEN_ONBOARDED')
    AND c."replyStatus" <> 'INCORRECT_NUMBER' AND c."callStatus" <> 'INCORRECT_NUMBER'
    AND (c."statusChangedAt" IS NULL OR c."statusChangedAt" <= c."ownerAssignedAt")
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssueContact" ic JOIN "FollowUpIssue" i ON i.id = ic."issueId"
      WHERE ic."contactId" = c.id AND (i.status = 'OPEN' OR i."createdAt" >= c."ownerAssignedAt")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssue" i WHERE i."contactId" = c.id AND i.status = 'OPEN'
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$function$;

CREATE OR REPLACE FUNCTION public.followup_support_inactive(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = p_user),
      (SELECT u."hubLastSeenAt" FROM "User" u WHERE u.id = p_user)
    ) < now() - interval '7 days',
    TRUE
  );
$function$;

CREATE OR REPLACE FUNCTION public.followupcontact_track_activity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."ownerId" IS NOT NULL THEN
      NEW."ownerAssignedAt" := NOW();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."ownerId" IS NOT NULL AND NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    NEW."ownerAssignedAt" := NOW();
  END IF;

  IF NEW."messageStatus" IS DISTINCT FROM OLD."messageStatus"
     OR NEW."replyStatus" IS DISTINCT FROM OLD."replyStatus"
     OR NEW."callStatus" IS DISTINCT FROM OLD."callStatus"
     OR NEW."registrationStatus" IS DISTINCT FROM OLD."registrationStatus"
     OR NEW."nextAction" IS DISTINCT FROM OLD."nextAction" THEN
    NEW."statusChangedAt" := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.form_question_text(p_answers jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN q IS NULL OR q = '' THEN NULL
    WHEN lower(regexp_replace(q, '[^[:alpha:] /]', '', 'g')) IN (
      'no', 'non', 'none', 'nil', 'nill', 'nothing', 'nope', 'na', 'n/a', 'nan',
      'no question', 'no questions', 'no concern', 'no concerns', 'not really',
      'none for now', 'nothing for now', 'no for now', 'not yet', 'nil for now'
    ) THEN NULL
    ELSE q
  END
  FROM (SELECT COALESCE(
    NULLIF(btrim(p_answers->>'Any Other Questions or Concerns? '), ''),
    NULLIF(btrim(p_answers->>'Any Other Questions or Concerns?'), ''),
    (SELECT NULLIF(btrim(e.value), '') FROM jsonb_each_text(p_answers) e
      WHERE lower(btrim(e.key)) = 'any other questions or concerns (parent or guardian)'
        AND NULLIF(btrim(e.value), '') IS NOT NULL
      LIMIT 1)
  ) AS q) x;
$function$;

CREATE OR REPLACE FUNCTION public.get_hub_leads_meeting(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."SupportHub" h
    WHERE h."cohortId" = p_cohort_id AND h."leadUserId" = public.app_current_user_id()
  ) THEN
    RAISE EXCEPTION 'Only Hub Leads and admins can see the Hub Leads meeting';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_build_object(
      'cohortId', m."cohortId", 'meetingDay', m."meetingDay", 'meetingTime', m."meetingTime",
      'callPlatform', m."callPlatform", 'callLink', m."callLink")
    FROM public."HubLeadsMeeting" m WHERE m."cohortId" = p_cohort_id
  ), jsonb_build_object(
    'cohortId', p_cohort_id, 'meetingDay', NULL, 'meetingTime', NULL,
    'callPlatform', NULL, 'callLink', NULL));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_hub_prayer_focus(p_hub_id uuid, p_week_id integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer focus';
    END IF;
  END IF;

  SELECT * INTO v_session
  FROM public."SupportSession"
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP';

  IF v_session.id IS NULL OR v_session."prayerFocusFaithProjectId" IS NULL THEN
    RETURN json_build_object(
      'faithProjectId', NULL, 'participantName', NULL, 'groupName', NULL, 'projectText', NULL,
      'setAt', NULL,
      'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[])),
      'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
      'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL
    );
  END IF;

  SELECT json_build_object(
    'faithProjectId', f.id,
    'participantName', p."fullName",
    'groupName', g.name,
    'projectText', f.body,
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[])),
    'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
    'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL
  ) INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  LEFT JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  LEFT JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  WHERE f.id = v_session."prayerFocusFaithProjectId"
  ORDER BY g.name
  LIMIT 1;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_hub_view(p_hub_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin to view this hub';
    END IF;
  END IF;

  SELECT public.build_hub_view(p_hub_id, v_hub."cohortId", v_actor_id) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_hub(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  v_actor_id := public.app_current_user_id();

  SELECT "hubId" INTO v_hub_id
  FROM public."HubMembership"
  WHERE "userId" = v_actor_id AND "cohortId" = p_cohort_id;

  IF v_hub_id IS NULL THEN
    -- Operational support with no HubMembership: fall back to the first (by
    -- name) hub they IT-support in this cohort. A support covering 2+ hubs
    -- should use get_my_hubs/get_hub_view for the full list.
    SELECT h.id INTO v_hub_id
    FROM public."HubItSupport" hi
    JOIN public."SupportHub" h ON h.id = hi."hubId"
    WHERE hi."userId" = v_actor_id AND h."cohortId" = p_cohort_id
    ORDER BY h.name
    LIMIT 1;
  END IF;

  IF v_hub_id IS NULL THEN
    RETURN json_build_object(
      'hub', NULL, 'isLead', FALSE, 'isAssistant', FALSE, 'isItSupport', FALSE,
      'canMeeting', FALSE, 'canAttendance', FALSE, 'canMessage', FALSE,
      'myJobs', '[]'::json, 'unseenIntroJobs', '[]'::json,
      'members', '[]'::json, 'messages', '[]'::json, 'myAttendance', '[]'::json
    );
  END IF;

  SELECT public.build_hub_view(v_hub_id, p_cohort_id, v_actor_id) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_hubs(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT COALESCE(json_agg(public.build_hub_view(h.id, p_cohort_id, v_actor_id) ORDER BY h.name), '[]'::json)
  INTO v_result
  FROM public."SupportHub" h
  WHERE h."cohortId" = p_cohort_id
    AND (
      EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = h.id AND m."userId" = v_actor_id)
      OR EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = h.id AND hi."userId" = v_actor_id)
    );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_permissions(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF u.role = 'ADMIN'::"Role" THEN
    RETURN json_build_object('isAdmin', TRUE, 'modules', (
      SELECT json_object_agg(k, json_build_object('view', TRUE, 'add', TRUE, 'edit', TRUE, 'delete', TRUE))
      FROM unnest(public.perm_module_keys()) k
    ));
  END IF;
  IF u.role = 'SUPPORT'::"Role" THEN
    RETURN json_build_object('isAdmin', FALSE, 'modules', '{}'::json);
  END IF;
  RETURN json_build_object('isAdmin', FALSE, 'modules', COALESCE((
    SELECT json_object_agg(t.module, json_build_object('view', t.v, 'add', t.a, 'edit', t.e, 'delete', t.d))
    FROM (
      SELECT m.module, bool_or(m."canView") AS v, bool_or(m."canAdd") AS a, bool_or(m."canEdit") AS e, bool_or(m."canDelete") AS d
      FROM "PermissionRoleModule" m
      JOIN "PermissionRole" r ON r.id = m."roleId"
      WHERE r.id IN (SELECT up."roleId" FROM "UserPermissionRole" up WHERE up."userId" = u.id)
         OR ('SUPPORT'::"Role" = ANY (public.app_user_roles(u)) AND r."isSystem" AND lower(r.name) = 'support')
      GROUP BY m.module
    ) t
  ), '{}'::json));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_session_user(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff_real(p_token);
  person_id UUID;
BEGIN
  IF staff.id IS NOT NULL THEN
    RETURN public.safe_user_json(staff);
  END IF;
  person_id := public.app_participant_id(p_token);
  IF person_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.participant_user_json(person_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_support_group_view(p_support_id uuid, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub_name TEXT;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  -- The support's hub this cohort (one hub per support per cohort).
  SELECT h.name INTO v_hub_name
  FROM public."HubMembership" m
  JOIN public."SupportHub" h ON h.id = m."hubId"
  WHERE m."userId" = p_support_id AND m."cohortId" = p_cohort_id
  ORDER BY h.name
  LIMIT 1;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public."HubMembership" m
    WHERE m."userId" = p_support_id
      AND m."cohortId" = p_cohort_id
      AND public.app_hub_can(m."hubId", 'GROUPS')
  ) THEN
    RAISE EXCEPTION 'You can only see the groups of supports in a hub you lead';
  END IF;

  SELECT json_build_object(
    'groupId', g.id,
    'groupName', g.name,
    'supportId', u.id,
    'supportName', u.name,
    'supportAvatarUrl', u."avatarUrl",
    'hubName', v_hub_name,
    'meetingDay', g."meetingDay",
    'meetingTime', g."meetingTime",
    'callPlatform', g."callPlatform",
    'callLink', g."callLink",
    'participantCount', (
      SELECT count(*)
      FROM public."GroupParticipant" gp
      JOIN public."Participant" p ON p.id = gp."participantId"
      WHERE gp."groupId" = g.id AND p.status = 'ACTIVE'
    )
  )
  INTO v_result
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."supportId" = p_support_id
    AND g."cohortId" = p_cohort_id
    AND g."archivedAt" IS NULL
  ORDER BY g.name
  LIMIT 1;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tour_progress(p_token text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  RETURN COALESCE((
    SELECT array_agg(t."tourKey" ORDER BY t."seenAt")
    FROM "TourProgress" t
    WHERE (s."userId" IS NOT NULL AND t."userId" = s."userId")
       OR (s."participantId" IS NOT NULL AND t."participantId" = s."participantId")
  ), ARRAY[]::TEXT[]);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_activity(p_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_quiet_since TIMESTAMPTZ := NOW() - INTERVAL '14 days';
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s discussion';
  END IF;

  RETURN (
    WITH members AS (
      SELECT p.id, p."fullName"
      FROM public."GroupParticipant" gp
      JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
      WHERE gp."groupId" = p_group_id
    ), acts AS (
      -- Every post, reply and like by a participant in this group, with its time.
      SELECT gp."authorParticipantId" AS pid, gp."createdAt" AS at, TRUE AS wrote
      FROM public."GroupPost" gp
      WHERE gp."groupId" = p_group_id AND gp."authorParticipantId" IS NOT NULL
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      UNION ALL
      SELECT r."authorParticipantId", r."createdAt", TRUE
      FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId"
      WHERE gp."groupId" = p_group_id AND r."authorParticipantId" IS NOT NULL
        AND r."removedAt" IS NULL AND r."deletedAt" IS NULL
      UNION ALL
      SELECT l."participantId", l."createdAt", FALSE
      FROM public."GroupPostLike" l JOIN public."GroupPost" gp ON gp.id = l."postId"
      WHERE gp."groupId" = p_group_id AND l."participantId" IS NOT NULL
    ), per AS (
      SELECT m.id, m."fullName",
        count(*) FILTER (WHERE a.wrote AND a.at >= v_week_start) AS wrote_week,
        count(*) FILTER (WHERE a.at >= v_week_start) AS any_week,
        count(*) FILTER (WHERE a.at >= v_quiet_since) AS any_recent
      FROM members m LEFT JOIN acts a ON a.pid = m.id
      GROUP BY m.id, m."fullName"
    ), latest AS (
      SELECT gp.body, gp."createdAt"
      FROM public."GroupPost" gp
      WHERE gp."groupId" = p_group_id AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      ORDER BY gp."createdAt" DESC
      LIMIT 1
    )
    SELECT json_build_object(
      'weekStart', v_week_start,
      'postsAndReplies', (
        (SELECT count(*) FROM public."GroupPost" gp
          WHERE gp."groupId" = p_group_id AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL AND gp."createdAt" >= v_week_start)
        + (SELECT count(*) FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId"
          WHERE gp."groupId" = p_group_id AND r."removedAt" IS NULL AND r."deletedAt" IS NULL AND r."createdAt" >= v_week_start)
      ),
      'members', (SELECT count(*) FROM per),
      'active', (SELECT count(*) FROM per WHERE any_week > 0),
      'quiet', (SELECT count(*) FROM per WHERE any_recent = 0),
      'mostActive', COALESCE((
        SELECT json_agg(x."fullName" ORDER BY x.wrote_week DESC, x."fullName")
        FROM (SELECT "fullName", wrote_week FROM per WHERE wrote_week > 0 ORDER BY wrote_week DESC, "fullName" LIMIT 3) x
      ), '[]'::json),
      'goneQuiet', COALESCE((
        SELECT json_agg(x."fullName" ORDER BY x."fullName")
        FROM (SELECT "fullName" FROM per WHERE any_recent = 0 ORDER BY "fullName" LIMIT 8) x
      ), '[]'::json),
      'latest', (SELECT json_build_object('body', left(body, 80), 'createdAt', "createdAt") FROM latest)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_delete(p_kind text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'You must be signed in as a support or admin'; END IF;
  IF p_kind = 'POST' THEN
    UPDATE public."GroupPost" SET "deletedAt" = NOW(), "pinnedAt" = NULL
    WHERE id = p_id AND "authorUserId" = v_me AND "deletedAt" IS NULL;
  ELSIF p_kind = 'REPLY' THEN
    UPDATE public."GroupPostReply" SET "deletedAt" = NOW()
    WHERE id = p_id AND "authorUserId" = v_me AND "deletedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only delete your own posts'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_feed(p_group_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_access TEXT := public.discussion_staff_access(p_group_id);
BEGIN
  IF v_access IS NULL THEN RAISE EXCEPTION 'You can''t see this group''s discussion'; END IF;
  RETURN public.build_discussion_feed(p_group_id, v_access, public.app_current_user_id(), NULL, p_before, p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_intro(p_group_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can post here';
  END IF;
  RETURN public.discussion_upsert_intro(p_group_id, public.app_current_user_id(), NULL, p_body);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_like(p_post_id uuid, p_like boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_me UUID := public.app_current_user_id();
BEGIN
  IF public.discussion_staff_access(v_group) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can like posts here';
  END IF;
  IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
  IF p_like THEN
    INSERT INTO public."GroupPostLike" ("postId", "userId")
    SELECT p_post_id, v_me
    WHERE NOT EXISTS (SELECT 1 FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "userId" = v_me);
  ELSE
    DELETE FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "userId" = v_me;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_mark_seen(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN RETURN; END IF;
  PERFORM public.discussion_mark_seen(p_group_id, public.app_current_user_id(), NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_moderate(p_kind text, p_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_group UUID;
  v_access TEXT;
BEGIN
  IF p_kind = 'POST' THEN
    v_group := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_id);
  ELSIF p_kind = 'REPLY' THEN
    v_group := (SELECT gp."groupId" FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId" WHERE r.id = p_id);
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  v_access := public.discussion_staff_access(v_group);
  IF v_access IS NULL OR v_access NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'Only this group''s support or an admin can do this';
  END IF;

  IF p_kind = 'POST' AND p_action = 'KEEP' THEN
    UPDATE public."GroupPostReport" SET "resolvedAt" = NOW(), "resolvedById" = v_me, resolution = 'KEPT'
    WHERE "postId" = p_id AND "resolvedAt" IS NULL;
  ELSIF p_kind = 'POST' AND p_action = 'REMOVE' THEN
    UPDATE public."GroupPost" SET "removedAt" = NOW(), "removedById" = v_me, "pinnedAt" = NULL, "pinnedById" = NULL
    WHERE id = p_id AND "removedAt" IS NULL;
    UPDATE public."GroupPostReport" SET "resolvedAt" = NOW(), "resolvedById" = v_me, resolution = 'REMOVED'
    WHERE "postId" = p_id AND "resolvedAt" IS NULL;
  ELSIF p_kind = 'REPLY' AND p_action = 'REMOVE' THEN
    UPDATE public."GroupPostReply" SET "removedAt" = NOW(), "removedById" = v_me
    WHERE id = p_id AND "removedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_pin(p_post_id uuid, p_pin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_access TEXT := public.discussion_staff_access(v_group);
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'Only this group''s support or an admin can pin posts';
  END IF;
  IF p_pin THEN
    IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
    UPDATE public."GroupPost" SET "pinnedAt" = NULL, "pinnedById" = NULL
    WHERE "groupId" = v_group AND "pinnedAt" IS NOT NULL AND id <> p_post_id;
    UPDATE public."GroupPost" SET "pinnedAt" = NOW(), "pinnedById" = public.app_current_user_id() WHERE id = p_post_id;
  ELSE
    UPDATE public."GroupPost" SET "pinnedAt" = NULL, "pinnedById" = NULL WHERE id = p_post_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_post(p_group_id uuid, p_body text, p_mentions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can post here';
  END IF;
  INSERT INTO public."GroupPost" ("groupId", "authorUserId", body, mentions)
  VALUES (p_group_id, public.app_current_user_id(), public.discussion_clean_body(p_body), public.discussion_clean_mentions(p_group_id, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_reply(p_post_id uuid, p_body text, p_mentions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_id UUID;
BEGIN
  IF public.discussion_staff_access(v_group) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can reply here';
  END IF;
  IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
  INSERT INTO public."GroupPostReply" ("postId", "authorUserId", body, mentions)
  VALUES (p_post_id, public.app_current_user_id(), public.discussion_clean_body(p_body), public.discussion_clean_mentions(v_group, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_unseen(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN RETURN 0; END IF;
  RETURN public.discussion_unseen_count(p_group_id, public.app_current_user_id(), NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_limits()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (SELECT value::JSONB FROM "AppSetting" WHERE "settingKey" = 'group_meeting_limits'),
    '{"days":["WEDNESDAY","FRIDAY","SATURDAY"],"earliestStart":"17:00","latestStart":"21:00","dayTimes":{}}'::JSONB
  );
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_limits_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  lim JSONB := CASE WHEN COALESCE(NEW."isTeenGroup", FALSE) THEN public.teen_group_meeting_limits() ELSE public.group_meeting_limits() END;
  win JSONB;
  start_min INT;
  earliest TEXT;
  latest TEXT;
  earliest_min INT;
  latest_min INT;
  allowed_days TEXT[];
BEGIN
  -- Only when the slot is being set or changed, and only for people who are held to the limits.
  IF TG_OP = 'UPDATE'
     AND NEW."meetingDay" IS NOT DISTINCT FROM OLD."meetingDay"
     AND NEW."meetingTime" IS NOT DISTINCT FROM OLD."meetingTime" THEN
    RETURN NEW;
  END IF;
  IF public.app_current_token() IS NULL OR public.app_current_token() = '' OR public.app_is_admin() THEN RETURN NEW; END IF;
  -- Clearing a field is always fine; the limits judge a full slot.
  IF NEW."meetingDay" IS NULL AND NEW."meetingTime" IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(d) INTO allowed_days FROM jsonb_array_elements_text(lim -> 'days') d;

  IF NEW."meetingDay" IS NOT NULL AND NOT (NEW."meetingDay" = ANY (allowed_days)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only be on %', array_to_string(ARRAY(SELECT initcap(lower(d)) FROM unnest(allowed_days) d), ', ');
  END IF;
  IF NEW."meetingTime" IS NOT NULL THEN
    IF NEW."meetingTime" !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: that start time is not valid'; END IF;
    start_min := split_part(NEW."meetingTime", ':', 1)::INT * 60 + split_part(NEW."meetingTime", ':', 2)::INT;
    win := CASE WHEN NEW."meetingDay" IS NOT NULL THEN lim -> 'dayTimes' -> NEW."meetingDay" END;
    earliest := COALESCE(win ->> 'earliestStart', lim ->> 'earliestStart');
    latest := COALESCE(win ->> 'latestStart', lim ->> 'latestStart', lim ->> 'latestEnd');
    earliest_min := split_part(earliest, ':', 1)::INT * 60 + split_part(earliest, ':', 2)::INT;
    -- The stored time is the end of the window; a 1-hour call must start by 60 minutes before it.
    latest_min := split_part(latest, ':', 1)::INT * 60 + split_part(latest, ':', 2)::INT - 60;
    IF start_min < earliest_min OR start_min > latest_min THEN
      RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls must start between % and %', earliest,
        lpad((GREATEST(latest_min, 0) / 60)::TEXT, 2, '0') || ':' || lpad((GREATEST(latest_min, 0) % 60)::TEXT, 2, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_notify(p_user_ids uuid[], p_title text, p_body text, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, p_title, p_body, p_path, 'GROUP_MEETING' FROM unnest(p_user_ids) AS uid;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', 'GROUP_MEETING'),
    timeout_milliseconds := 25000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_reopen_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.done AND (TG_OP = 'INSERT' OR OLD.done IS DISTINCT FROM TRUE)
     AND EXISTS (SELECT 1 FROM public."GroupMeetingReopen" r WHERE r."groupId" = NEW."groupId" AND r."weekId" = NEW."weekId" AND r."reopenedAt" IS NOT NULL AND r."resubmittedAt" IS NULL) THEN
    UPDATE public."GroupMeetingReopen" SET "resubmittedAt" = now() WHERE "groupId" = NEW."groupId" AND "weekId" = NEW."weekId";
    DELETE FROM public."MeetingRecordingOpening" WHERE "groupId" = NEW."groupId" AND "weekId" = NEW."weekId";
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_reopen_requests(p_token text, p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
BEGIN
  IF v_actor.id IS NULL OR NOT ('ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'groupId', r."groupId", 'groupName', g.name, 'weekId', r."weekId", 'weekNumber', w."weekNumber",
      'requestedAt', r."requestedAt", 'requestReason', r."requestReason", 'supportName', u.name) ORDER BY r."requestedAt")
    FROM public."GroupMeetingReopen" r
    JOIN public."Group" g ON g.id = r."groupId" AND g."cohortId" = p_cohort_id
    JOIN public."Week" w ON w.id = r."weekId"
    LEFT JOIN public."User" u ON u.id = r."requestedById"
    WHERE r."requestedAt" IS NOT NULL AND (r."reopenedAt" IS NULL OR r."requestedAt" > r."reopenedAt")), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_meeting_reopen_state(p_token text, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_group public."Group";
BEGIN
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_actor.id IS NULL OR v_group.id IS NULL
     OR NOT (v_group."supportId" = v_actor.id OR 'ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'weekId', r."weekId", 'requestedAt', r."requestedAt", 'requestReason', r."requestReason",
      'reopenedAt', r."reopenedAt", 'reopenReason', r."reopenReason", 'resubmittedAt', r."resubmittedAt",
      'openUntil', public.meeting_recording_opening(NULL, r."groupId", r."weekId")))
    FROM public."GroupMeetingReopen" r WHERE r."groupId" = p_group_id), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_onboarding_progress(p_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID;
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s onboarding';
  END IF;
  SELECT "cohortId" INTO v_cohort FROM public."Group" WHERE id = p_group_id;
  RETURN public.onboarding_progress_json(v_cohort, p_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_add_person(p_adder_id uuid, p_actor_id uuid, p_full_name text, p_gender text, p_is_teen boolean, p_age_range text, p_date_of_birth date, p_email text, p_departments text[], p_request text, p_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_adder "Participant";
  v_adder_contact "FollowUpContact";
  v_adder_account "ParticipantAccount";
  v_actor "User";
  v_name TEXT := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_gender TEXT := CASE lower(btrim(COALESCE(p_gender, ''))) WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' ELSE NULL END;
  v_email TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_age TEXT;
  v_guard_phone TEXT;
  v_guard_name TEXT;
  v_by TEXT;
  v_reg_id UUID;
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_owner_name TEXT;
BEGIN
  SELECT * INTO v_adder FROM "Participant" WHERE id = p_adder_id;
  IF v_adder.id IS NULL OR public.fof_phone_key(v_adder.phone) IS NULL OR v_adder."cohortId" IS NULL THEN
    RAISE EXCEPTION 'This number cannot have people added';
  END IF;
  SELECT * INTO v_adder_contact FROM "FollowUpContact" WHERE id = v_adder."followUpContactId";
  -- The number's login: the adder's, or any other active login on the number (rule 91).
  SELECT a.* INTO v_adder_account
  FROM public.shared_number_people(v_adder.id) f
  JOIN "ParticipantAccount" a ON a."participantId" = f.id AND a."isActive"
  ORDER BY (f.id = v_adder.id) DESC, (a."passwordSetAt" IS NOT NULL) DESC, a."passwordSetAt" DESC NULLS LAST
  LIMIT 1;
  IF p_actor_id IS NOT NULL THEN SELECT * INTO v_actor FROM "User" WHERE id = p_actor_id; END IF;

  IF char_length(v_name) < 2 THEN RAISE EXCEPTION 'Enter their full name'; END IF;
  IF v_gender IS NULL THEN RAISE EXCEPTION 'Choose Male or Female'; END IF;
  v_age := CASE WHEN p_is_teen THEN '10 - 17' ELSE NULLIF(btrim(COALESCE(p_age_range, '')), '') END;
  IF NOT p_is_teen AND (v_age IS NULL OR public.fof_is_teen_age(v_age)) THEN RAISE EXCEPTION 'Choose their age range'; END IF;
  -- A date of birth must fit: 10 to 17 for a teen, 18 or older for an adult (the Participant trigger
  -- sets the age range from it).
  IF p_date_of_birth IS NOT NULL THEN
    IF p_is_teen AND (date_part('year', age(p_date_of_birth)) < 10 OR date_part('year', age(p_date_of_birth)) > 17) THEN
      RAISE EXCEPTION 'A teenager must be 10 to 17. Check the date of birth.';
    END IF;
    IF NOT p_is_teen AND date_part('year', age(p_date_of_birth)) < 18 THEN
      RAISE EXCEPTION 'An adult must be 18 or older. Check the date of birth.';
    END IF;
  END IF;
  IF p_is_teen AND NOT COALESCE(p_consent, FALSE) AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Only a parent or guardian can add a teenager. Tick the box to say you agree.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Participant" q
    WHERE q."cohortId" = v_adder."cohortId"
      AND public.fof_phone_key(q.phone) = public.fof_phone_key(v_adder.phone)
      AND public.fof_name_key(q."fullName") = public.fof_name_key(v_name)
  ) THEN
    RAISE EXCEPTION '% is already on this number', v_name;
  END IF;

  -- A teen's parent: the adder's own parent when the adder is a teen, otherwise the adder.
  IF p_is_teen THEN
    IF public.fof_is_teen_age(v_adder."ageRange") THEN
      v_guard_phone := COALESCE(v_adder_contact."guardianPhone", v_adder."guardianPhone", v_adder.phone);
      v_guard_name := v_adder_contact."guardianName";
    ELSE
      v_guard_phone := v_adder.phone;
      v_guard_name := v_adder."fullName";
    END IF;
  END IF;
  v_by := COALESCE(v_actor.name, v_adder."fullName");

  -- The form record first (rule 1 looks for it), then the contact, then link them.
  INSERT INTO "SheetRegistration" ("fullName", phone, "phoneNormalised", email, answers, outcome, "outcomeDetail")
  VALUES (v_name, v_adder.phone, public.fof_phone_key(v_adder.phone), v_email,
          jsonb_build_object('Added in the app by', v_by, 'Gender', v_gender, 'Age Range?', v_age,
                             'Date of birth', p_date_of_birth, 'Departments', to_jsonb(COALESCE(p_departments, '{}'::text[])),
                             'Request', NULLIF(btrim(COALESCE(p_request, '')), ''), 'Parent consent', p_is_teen AND COALESCE(p_consent, FALSE)),
          'CREATED', 'Added in the app by ' || v_by)
  RETURNING id INTO v_reg_id;

  INSERT INTO "FollowUpContact" (
    "fullName", phone, "guardianPhone", "guardianName", email, gender, "ageRange", "cohortId", source,
    "registeredById", "registrationStatus", "replyStatus", "nextAction", "isTest", "guardianConsentAt", "guardianConsentById"
  ) VALUES (
    v_name, v_adder.phone, v_guard_phone, v_guard_name, v_email, v_gender, v_age, v_adder."cohortId",
    'Added in the app by ' || v_by, p_actor_id,
    (CASE WHEN p_is_teen THEN 'TEENAGER' ELSE 'ACCESS_CONFIRMED' END)::"FollowUpRegistrationStatus",
    'REPLIED', (CASE WHEN p_is_teen THEN 'SEND_MESSAGE' ELSE 'CLOSE' END)::"FollowUpNextAction",
    v_adder."isTest", CASE WHEN p_is_teen AND COALESCE(p_consent, FALSE) THEN now() END,
    CASE WHEN p_is_teen AND COALESCE(p_consent, FALSE) THEN p_actor_id END
  ) RETURNING * INTO v_contact;
  UPDATE "SheetRegistration" SET "contactId" = v_contact.id WHERE id = v_reg_id;

  INSERT INTO "Participant" (
    "fullName", phone, "guardianPhone", "cohortId", source, status, email, gender, "ageRange", "dateOfBirth",
    departments, "smartRequest", "followUpContactId", "registrationDate", "isTest"
  ) VALUES (
    v_name, v_adder.phone, v_guard_phone, v_adder."cohortId", 'FOLLOW_UP', 'ACTIVE', v_email, v_gender, v_age, p_date_of_birth,
    COALESCE(p_departments, '{}'::text[]), NULLIF(btrim(COALESCE(p_request, '')), ''), v_contact.id, now(), v_adder."isTest"
  ) RETURNING id INTO v_part_id;

  -- The number's login (rule 91): same password, or the same waiting code.
  IF v_adder_account."participantId" IS NOT NULL THEN
    INSERT INTO "ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt")
    VALUES (v_part_id, v_adder_account.password_hash, v_adder_account."setupCode", v_adder_account."mustChangePassword",
            p_actor_id, now(), v_adder_account."passwordSetAt");
  END IF;

  IF p_is_teen THEN PERFORM public.assign_teen_contacts(v_contact.id); END IF;
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = v_contact.id;
  SELECT name INTO v_owner_name FROM "User" WHERE id = v_contact."ownerId";

  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT u.id, 'New person on a shared number',
         v_name || ' was added on ' || split_part(v_adder."fullName", ' ', 1) || '''s number by ' || v_by
           || CASE WHEN p_is_teen THEN ' (a teen).' ELSE '. They are Access Confirmed.' END,
         '/follow-ups', 'FOLLOWUP_ASSIGNMENT'
  FROM "User" u WHERE u.role = 'ADMIN' AND u."isActive" IS NOT FALSE AND u.id IS DISTINCT FROM p_actor_id;

  RETURN jsonb_build_object(
    'participantId', v_part_id, 'contactId', v_contact.id, 'name', v_name, 'isTeen', p_is_teen,
    'hasLogin', v_adder_account."participantId" IS NOT NULL,
    'teenSupportName', v_owner_name, 'teenWaiting', p_is_teen AND v_contact."ownerId" IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hub_group_overview(p_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s overview';
  END IF;

  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;

  RETURN (
    WITH j AS (
      SELECT w.id AS "weekId", w."weekNumber"
      FROM public."Week" w
      JOIN public."AttendanceSession" s ON s."weekId" = w.id AND s."finalizedAt" IS NOT NULL
      WHERE w."cohortId" = v_group."cohortId"
    )
    SELECT json_build_object(
      'groupId', v_group.id,
      'groupName', v_group.name,
      'support', (
        SELECT json_build_object(
          'id', u.id,
          'name', u.name,
          'hasPhoto', NULLIF(btrim(COALESCE(u."avatarUrl", '')), '') IS NOT NULL,
          'hasGender', NULLIF(btrim(COALESCE(u.gender, '')), '') IS NOT NULL,
          'hasAgeRange', NULLIF(btrim(COALESCE(u."ageRange", '')), '') IS NOT NULL,
          'hasPhone', NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL,
          'hasPush', EXISTS (SELECT 1 FROM public."PushSubscription" ps WHERE ps."userId" = u.id)
        )
        FROM public."User" u WHERE u.id = v_group."supportId"
      ),
      'classesRun', (SELECT count(*) FROM j),
      'participants', COALESCE((
        SELECT json_agg(json_build_object(
          'participantId', p.id,
          'name', p."fullName",
          'avatarUrl', p."avatarUrl",
          'isTeen', t.teen,
          'phone', CASE WHEN t.teen THEN NULL ELSE NULLIF(btrim(COALESCE(p.phone, '')), '') END,
          'onboarding', public.participant_onboarding_state(p.id),
          'faithProjectStatus', (
            SELECT fp.status FROM public."FaithProject" fp
            WHERE fp."participantId" = p.id ORDER BY fp."updatedAt" DESC LIMIT 1),
          'hasPush', EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" ps WHERE ps."participantId" = p.id),
          'classesAttended', (
            SELECT count(*) FROM public."AttendanceRecord" r JOIN j ON j."weekId" = r."weekId"
            WHERE r."participantId" = p.id
              AND (r.status = 'PRESENT' OR r.status IN ('LATE', 'LEFT_EARLY'))),
          'recent', COALESCE((
            SELECT json_agg(x ORDER BY x."weekNumber" DESC) FROM (
              SELECT j2."weekNumber", COALESCE(r.status, 'NONE') AS status,
                     (r.status = 'PRESENT' OR r.status IN ('LATE', 'LEFT_EARLY')) AS attended
              FROM j j2
              LEFT JOIN public."AttendanceRecord" r ON r."weekId" = j2."weekId" AND r."participantId" = p.id
              ORDER BY j2."weekNumber" DESC LIMIT 4
            ) x
          ), '[]'::json)
        ) ORDER BY p."fullName")
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId"
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            v_group."isTeenGroup"
            OR replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18')
            OR EXISTS (
              SELECT 1 FROM public."FollowUpContact" fc
              WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')),
            FALSE) AS teen
        ) t
        WHERE gp."groupId" = v_group.id AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
      ), '[]'::json)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hub_it_support_kind()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hub "SupportHub";
  v_user UUID;
BEGIN
  v_user := COALESCE(NEW."userId", OLD."userId");
  SELECT * INTO v_hub FROM "SupportHub" WHERE id = COALESCE(NEW."hubId", OLD."hubId");
  IF v_hub.id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE "UserCohort" SET "supportKind" = 'OPERATIONAL'
    WHERE "userId" = v_user AND "cohortId" = v_hub."cohortId" AND "supportKind" = 'PARTICIPANT_SUPPORT';
  ELSE
    UPDATE "UserCohort" SET "supportKind" = 'PARTICIPANT_SUPPORT'
    WHERE "userId" = v_user AND "cohortId" = v_hub."cohortId" AND "supportKind" = 'OPERATIONAL'
      AND NOT EXISTS (
        SELECT 1 FROM "HubItSupport" i JOIN "SupportHub" h ON h.id = i."hubId"
        WHERE i."userId" = v_user AND h."cohortId" = v_hub."cohortId" AND i.id <> OLD.id
      );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hub_lead_support_kind()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."leadUserId" IS NOT NULL THEN
    UPDATE "UserCohort" SET "supportKind" = 'HUB_LEAD'
    WHERE "userId" = NEW."leadUserId" AND "cohortId" = NEW."cohortId" AND "supportKind" = 'PARTICIPANT_SUPPORT';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."leadUserId" IS NOT NULL AND OLD."leadUserId" IS DISTINCT FROM NEW."leadUserId" THEN
    UPDATE "UserCohort" SET "supportKind" = 'PARTICIPANT_SUPPORT'
    WHERE "userId" = OLD."leadUserId" AND "cohortId" = OLD."cohortId" AND "supportKind" = 'HUB_LEAD'
      AND NOT EXISTS (SELECT 1 FROM "SupportHub" h WHERE h."cohortId" = OLD."cohortId" AND h."leadUserId" = OLD."leadUserId" AND h.id <> NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hub_prayer_list(p_hub_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer list';
    END IF;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'faithProjectId', f.id,
    'participantId', p.id,
    'fullName', p."fullName",
    'groupName', g.name,
    'supportName', support.name,
    'body', f.body,
    'categoryName', cat.name,
    'timesPrayedFor', (
      SELECT COUNT(*) FROM public."SupportSession" s2
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
    ),
    'lastPrayedWeek', (
      SELECT w2."weekNumber" FROM public."SupportSession" s2
      JOIN public."Week" w2 ON w2.id = s2."weekId"
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
      ORDER BY w2."weekNumber" DESC LIMIT 1
    )
  ) ORDER BY p."fullName"), '[]'::json)
  INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  JOIN public."SupportHub" hub ON hub.id = hm."hubId" AND hub."cohortId" = g."cohortId"
  LEFT JOIN public."User" support ON support.id = g."supportId"
  LEFT JOIN public."FaithProjectCategory" cat ON cat.id = f."categoryId"
  WHERE public.faith_project_prayable(f);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_attendance_absence_push(p_participant_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'attendance-absence-push: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'participantIds', to_jsonb(p_participant_ids),
      'title', 'Marked absent',
      'body', 'You were marked absent for Sunday class. Speak to your support if this needs a look.',
      'path', '/me/journey',
      'type', 'ATTENDANCE_ABSENT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_discussion_notify(p_user_ids uuid[], p_participant_ids uuid[], p_title text, p_body text, p_user_path text, p_participant_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_discussion_notify: vault secrets missing; skipping';
    RETURN;
  END IF;

  IF array_length(p_user_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_user_path, 'type', 'DISCUSSION'),
      timeout_milliseconds := 25000
    );
  END IF;
  IF array_length(p_participant_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', p_participant_path, 'type', 'DISCUSSION'),
      timeout_milliseconds := 25000
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_followup_assignment()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'run-followup-assignment: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/run-followup-assignment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.invoke_hub_message_push(p_user_ids uuid[], p_subject text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_hub_message_push: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(p_user_ids),
      'title', p_subject,
      'body', p_body,
      'path', '/support/my-hub',
      'type', 'HUB'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_prayer_notify(p_participant_ids uuid[], p_user_ids uuid[], p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'corporate-prayer notify: vault secrets missing; skipping';
    RETURN;
  END IF;
  IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', '/me/pray', 'type', 'CORPORATE_PRAYER'),
      timeout_milliseconds := 25000);
  END IF;
  IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', '/support/pray', 'type', 'CORPORATE_PRAYER'),
      timeout_milliseconds := 25000);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_push_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'push-reminders: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.invoke_refresh_public_holidays()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'refresh-public-holidays: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/refresh-public-holidays',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.invoke_telegram_send(p_kind text, p_owner uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/telegram-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('kind', p_kind, 'ownerId', p_owner, 'title', p_title, 'body', p_body),
    timeout_milliseconds := 15000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.it_login_issues(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_is_admin BOOLEAN;
  v_is_it BOOLEAN;
  v_issues JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();
  v_is_admin := public.app_is_admin();

  v_is_it := EXISTS (
    SELECT 1 FROM public."HubItSupport" hi
    JOIN public."SupportHub" h ON h.id = hi."hubId"
    WHERE hi."userId" = v_actor_id AND h."cohortId" = p_cohort_id
  );

  IF NOT v_is_it AND NOT v_is_admin THEN
    RETURN json_build_object('isItSupport', false, 'issues', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY (x.status = 'OPEN') DESC, x."createdAt" DESC), '[]'::json)
  INTO v_issues
  FROM (
    SELECT
      i.id,
      i."contactId",
      i.description,
      i.status,
      i.resolution,
      i."createdAt",
      i."updatedAt",
      i."resolvedAt",
      i."reportedById",
      rep.name AS "reportedByName",
      res.name AS "resolvedByName",
      c."fullName" AS "contactName",
      c.phone AS "contactPhone",
      c."registrationStatus",
      c."cohortId",
      co.name AS "cohortName",
      co."startDate" AS "cohortStartDate",
      c."ownerId",
      own.name AS "ownerName",
      own.phone AS "ownerPhone",
      EXISTS (
        SELECT 1 FROM public."Participant" p
        JOIN public."ParticipantAccount" a ON a."participantId" = p.id
        WHERE p."followUpContactId" = c.id
          AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
      ) AS "signedIn"
    FROM public."FollowUpLoginIssue" i
    JOIN public."FollowUpContact" c ON c.id = i."contactId"
    LEFT JOIN public."Cohort" co ON co.id = c."cohortId"
    LEFT JOIN public."User" own ON own.id = c."ownerId"
    LEFT JOIN public."User" rep ON rep.id = i."reportedById"
    LEFT JOIN public."User" res ON res.id = i."resolvedById"
    -- Same cohort scope as contactInCohortScope: this cohort, or no cohort.
    WHERE (c."cohortId" = p_cohort_id OR c."cohortId" IS NULL)
      AND (v_is_admin OR v_actor_id = ANY(public.followup_contact_it_support_ids(c.id, p_cohort_id)))
  ) x;

  RETURN json_build_object('isItSupport', v_is_it, 'issues', v_issues);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_earlier_class_documents(p_exclude_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'kind', d.kind, 'url', d.url, 'name', d.name, 'cohortName', d."cohortName", 'weekNumber', d."weekNumber"
    ) ORDER BY d."sortDate" DESC)
    FROM (
      SELECT DISTINCT ON (docs.url, docs.name, docs.kind)
        docs.url, docs.name, docs.kind, docs."cohortName", docs."weekNumber", docs."sortDate"
      FROM (
        SELECT w."recapDocumentUrl" AS url, w."recapDocumentName" AS name, 'RECAP' AS kind,
          c.name AS "cohortName", w."weekNumber" AS "weekNumber", c."startDate" AS "sortDate", c.id AS "cohortId"
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."recapDocumentUrl" IS NOT NULL
        UNION ALL
        SELECT w."teenRecapDocumentUrl", w."teenRecapDocumentName", 'TEEN_RECAP',
          c.name, w."weekNumber", c."startDate", c.id
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."teenRecapDocumentUrl" IS NOT NULL
          AND (public.app_is_admin() OR EXISTS (
            SELECT 1 FROM public."SupportTagMember" m JOIN public."SupportTag" t ON t.id = m."tagId"
            WHERE t."systemKey" = 'TEEN_SUPPORT' AND m."userId" = public.app_current_user_id()
          ))
        UNION ALL
        SELECT w."manualDocumentUrl", w."manualDocumentName", 'MANUAL',
          c.name, w."weekNumber", c."startDate", c.id
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."manualDocumentUrl" IS NOT NULL
      ) docs
      WHERE p_exclude_cohort_id IS NULL OR docs."cohortId" <> p_exclude_cohort_id
      ORDER BY docs.url, docs.name, docs.kind, docs."sortDate" DESC
    ) d
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_manual_questions(p_cohort_id uuid, p_week_id integer DEFAULT NULL::integer, p_group_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', q.id, 'weekId', q."weekId", 'weekNumber', w."weekNumber",
      'groupId', q."groupId", 'groupName', g.name,
      'participantId', q."participantId", 'participantName', p."fullName",
      'body', q.body, 'status', q.status, 'reply', q.reply, 'repliedAt', q."repliedAt", 'createdAt', q."createdAt",
      'isTeen', public.fof_is_teen_age(p."ageRange"), 'hideName', q."hideName",
      'askedById', q."askedById", 'askedByName', ab.name
    ) ORDER BY q."createdAt" DESC)
    FROM public."ManualQuestion" q
    JOIN public."Week" w ON w.id = q."weekId"
    JOIN public."Participant" p ON p.id = q."participantId"
    LEFT JOIN public."Group" g ON g.id = q."groupId"
    LEFT JOIN public."User" ab ON ab.id = q."askedById"
    WHERE q."cohortId" = p_cohort_id
      AND (p_week_id IS NULL OR q."weekId" = p_week_id)
      AND (p_group_id IS NULL OR q."groupId" = p_group_id)
      AND (
        public.app_is_admin()
        OR EXISTS (SELECT 1 FROM public."Group" sg WHERE sg.id = q."groupId" AND sg."supportId" = v_actor_id)
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_prayer_verses(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  RETURN COALESCE((SELECT json_agg(json_build_object(
      'id', v.id, 'title', v.title, 'prayer', v.prayer, 'reference', v.reference, 'sortOrder', v."sortOrder", 'active', v.active,
      'used', (SELECT count(*) FROM public."CorporatePrayerSession" s WHERE s.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', v.id))),
      'inSlots', (SELECT count(*) FROM public."CorporatePrayerSlot" sl WHERE NOT sl."isTest" AND sl.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', v.id))))
    ORDER BY v."sortOrder", v."createdAt", v.id) FROM public."CorporatePrayerVerse" v), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_group_participant_handover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group "Group"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_group FROM "Group" WHERE id = OLD."groupId";
    PERFORM public.capture_participant_handover(OLD."participantId", 'GROUP_LEFT', OLD."groupId", NULL, v_group."supportId", NULL);
    RETURN OLD;
  END IF;
  SELECT * INTO v_group FROM "Group" WHERE id = NEW."groupId";
  PERFORM public.capture_participant_handover(NEW."participantId", 'GROUP_JOINED', NULL, NEW."groupId", NULL, v_group."supportId");
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_group_support_handover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_participant RECORD;
BEGIN
  IF OLD."supportId" IS NOT DISTINCT FROM NEW."supportId" THEN RETURN NEW; END IF;
  FOR v_participant IN SELECT "participantId" FROM "GroupParticipant" WHERE "groupId" = NEW.id LOOP
    PERFORM public.capture_participant_handover(v_participant."participantId", 'SUPPORT_REASSIGNED', NEW.id, NEW.id, OLD."supportId", NEW."supportId");
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.login_user(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  normalized TEXT := lower(trim(identifier));
  candidate "User";
BEGIN
  IF normalized IS NULL OR normalized = '' OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  -- A login value is either an email or a phone number. Prefer an active account,
  -- then the oldest, which matches how duplicate legacy accounts were resolved.
  SELECT * INTO candidate
  FROM "User" u
  WHERE (position('@' IN normalized) > 0 AND lower(u.email) = normalized)
     OR (position('@' IN normalized) = 0 AND (
          u.phone = trim(identifier)
          -- Same number written another way (+234 803…, 2348…, 0803 123 4567).
          OR public.fof_phone_key(u.phone) = public.fof_phone_key(identifier)
        ))
  ORDER BY (u."isActive" IS NOT FALSE) DESC, u."createdAt" ASC
  LIMIT 1;

  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN NULL;
  END IF;

  -- Legacy rows written by an older client are accepted once, then upgraded.
  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) = password THEN
      UPDATE "User"
      SET password_hash = crypt(password, gen_salt('bf', 10)), "updatedAt" = NOW()
      WHERE id = candidate.id;
      RETURN public.safe_user_json(candidate);
    END IF;
    RETURN NULL;
  END IF;

  IF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(password, candidate.password_hash) THEN
    RETURN NULL;
  END IF;

  RETURN public.safe_user_json(candidate);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  changed INTEGER;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Notification" SET "isRead" = TRUE WHERE "userId" = me AND NOT "isRead";
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_app_nudge_sent(p_token text, p_participant_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  stamp TIMESTAMPTZ;
BEGIN
  IF staff.id IS NULL OR staff.role IS DISTINCT FROM 'SUPPORT' THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.app_nudge_people() n WHERE n.participant_id = p_participant_id AND n.owner_id = staff.id
  ) THEN RAISE EXCEPTION 'This participant no longer needs an app reminder from you.'; END IF;

  INSERT INTO public."AppNudgeSend" ("ownerId", "participantId", "sentAt")
  VALUES (staff.id, p_participant_id, clock_timestamp())
  ON CONFLICT ("ownerId", "participantId") DO UPDATE SET "sentAt" = EXCLUDED."sentAt"
  RETURNING "sentAt" INTO stamp;
  RETURN stamp;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_hub_role_intro_seen(p_hub_id uuid, p_job text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF p_job NOT IN ('HUB_LEAD', 'ASSISTANT_HUB_LEAD', 'RECAP_LEAD', 'PRAYER_LEAD', 'IT_SUPPORT') THEN
    RAISE EXCEPTION 'Invalid job';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id) THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  INSERT INTO public."HubRoleIntroSeen" ("userId", "hubId", job)
  VALUES (v_actor_id, p_hub_id, p_job)
  ON CONFLICT ("userId", "hubId", job) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_manual_question_in_class(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."Group" g WHERE g.id = v_row."groupId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this participant''s support or an admin can update this question';
  END IF;

  UPDATE public."ManualQuestion" SET status = 'IN_CLASS' WHERE id = p_id RETURNING * INTO v_row;
  RETURN json_build_object('id', v_row.id, 'status', v_row.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Notification" SET "isRead" = TRUE WHERE id = p_id AND "userId" = me AND NOT "isRead";
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read_by_content(p_title text, p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  changed INTEGER;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Notification" SET "isRead" = TRUE
  WHERE "userId" = me AND NOT "isRead" AND title = p_title AND body = COALESCE(p_body, '')
    AND "createdAt" > NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_participant_faith_read(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  INSERT INTO "ParticipantThreadRead" ("participantId", "coachLastReadAt") VALUES (person_id, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET "coachLastReadAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_participant_notifications_read(p_token text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  UPDATE "ParticipantNotification" n
  SET "readAt" = NOW()
  WHERE n."participantId" = person_id
    AND n."readAt" IS NULL
    AND (p_ids IS NULL OR n.id = ANY(p_ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_participant_notifications_read_by_content(p_token text, p_title text, p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  changed INTEGER;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "ParticipantNotification" SET "readAt" = NOW()
  WHERE "participantId" = person_id AND "readAt" IS NULL AND title = p_title AND body = COALESCE(p_body, '')
    AND "createdAt" > NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_shared_attendance(p_participant_id uuid, p_week_id integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_cohort_id UUID;
  v_record public."AttendanceRecord";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;

  IF p_status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;

  SELECT w."cohortId" INTO v_cohort_id
  FROM public."Week" w
  WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."Participant" p
    WHERE p.id = p_participant_id
      AND p."cohortId" = v_cohort_id
      AND p.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'This participant is not in the active attendance list';
  END IF;

  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(p_week_id), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
  END IF;

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id)
  ON CONFLICT ("weekId") DO NOTHING;

  v_actor_id := public.attendance_session_actor_id();
  INSERT INTO public."AttendanceRecord" ("participantId", "weekId", status, "markedById", "markedAt")
  VALUES (p_participant_id, p_week_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("participantId", "weekId") DO UPDATE
    SET status = EXCLUDED.status,
        "markedById" = EXCLUDED."markedById",
        "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_record;

  UPDATE public."AttendanceSession" SET "updatedAt" = NOW() WHERE "weekId" = p_week_id;

  RETURN jsonb_build_object(
    'id', v_record.id,
    'participantId', v_record."participantId",
    'weekId', v_record."weekId",
    'status', v_record.status,
    'markedById', v_record."markedById",
    'markedAt', v_record."markedAt",
    'lateExcused', v_record."lateExcused"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_attendance(p_status text, p_user_id uuid, p_hub_id uuid DEFAULT NULL::uuid, p_week_id integer DEFAULT NULL::integer, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_week public."Week";
  v_hub public."SupportHub";
  v_is_lead_of_any BOOLEAN;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;
  IF p_status NOT IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public."SupportSession" WHERE id = p_session_id;
    IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session was not found'; END IF;
  ELSE
    IF p_hub_id IS NULL OR p_week_id IS NULL THEN
      RAISE EXCEPTION 'Provide either a session, or a hub and week';
    END IF;

    SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
    IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;

    SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
    IF v_hub.id IS NULL THEN RAISE EXCEPTION 'Hub was not found'; END IF;
    IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
      RAISE EXCEPTION 'This hub and week are not in the same cohort';
    END IF;

    INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
    VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
    ON CONFLICT ("hubId", "weekId") DO NOTHING;

    SELECT * INTO v_session FROM public."SupportSession" WHERE "hubId" = p_hub_id AND "weekId" = p_week_id;
  END IF;

  -- First attendance mark for this hub week starts the "meeting is on" live
  -- window (build_hub_view's meetingLive reads this); never reset here —
  -- reopen_hub_meeting/submit_hub_meeting only ever touch submittedAt.
  IF v_session.type = 'SUNDAY_RECAP' AND v_session."hubId" IS NOT NULL THEN
    UPDATE public."SupportSession" SET "startedAt" = COALESCE("startedAt", NOW()) WHERE id = v_session.id;
  END IF;

  -- Permission: recap is the session's own hub's lead or (with ATTENDANCE
  -- permission) its assistant lead; trainings/get-togethers (no fixed hub)
  -- are marked only by the supports an admin picks on the Attendance page
  -- (AppSetting 'training_markers'). Admin can always mark.
  IF NOT public.app_is_admin() THEN
    IF v_session."hubId" IS NOT NULL THEN
      IF NOT public.app_hub_can(v_session."hubId", 'ATTENDANCE') THEN
        RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can mark this attendance';
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public."AppSetting" s
        WHERE s."settingKey" = 'training_markers'
          AND jsonb_typeof(s.value) = 'array'
          AND s.value ? v_actor_id::text
      ) INTO v_is_lead_of_any;
      IF NOT COALESCE(v_is_lead_of_any, FALSE) THEN
        RAISE EXCEPTION 'Only the supports picked to mark trainings, or an admin, can mark this attendance';
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = p_user_id AND u."isActive" IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'That support was not found';
  END IF;

  INSERT INTO public."SupportSessionAttendance" ("sessionId", "userId", status, "markedById", "markedAt")
  VALUES (v_session.id, p_user_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("sessionId", "userId") DO UPDATE
    SET status = EXCLUDED.status, "markedById" = EXCLUDED."markedById", "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'sessionId', v_result."sessionId",
    'userId', v_result."userId",
    'status', v_result.status,
    'markedById', v_result."markedById",
    'markedAt', v_result."markedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_token text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9:_-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid tour key';
  END IF;

  IF s."userId" IS NOT NULL THEN
    INSERT INTO "TourProgress" ("userId", "tourKey") VALUES (s."userId", p_key)
    ON CONFLICT ("userId", "tourKey") WHERE "userId" IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO "TourProgress" ("participantId", "tourKey") VALUES (s."participantId", p_key)
    ON CONFLICT ("participantId", "tourKey") WHERE "participantId" IS NOT NULL DO NOTHING;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.meeting_recording_opening(p_hub_id uuid, p_group_id uuid, p_week_id integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT o."openUntil" FROM public."MeetingRecordingOpening" o
  WHERE o."weekId" = p_week_id AND o."openUntil" > now()
    AND ((o."hubId" IS NOT NULL AND o."hubId" = p_hub_id) OR (o."groupId" IS NOT NULL AND o."groupId" = p_group_id))
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.merge_followup_batches(a jsonb, b jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  out jsonb := COALESCE(a, '{}'::jsonb);
  k text;
  cur jsonb;
  add jsonb;
  names jsonb;
BEGIN
  FOR k IN SELECT jsonb_object_keys(COALESCE(b, '{}'::jsonb)) LOOP
    add := b->k;
    cur := out->k;
    IF cur IS NULL THEN
      out := jsonb_set(out, ARRAY[k], add);
    ELSE
      names := COALESCE(cur->'names', '[]'::jsonb);
      IF jsonb_array_length(names) < 3 THEN
        names := names || COALESCE(add->'names', '[]'::jsonb);
      END IF;
      out := jsonb_set(out, ARRAY[k], jsonb_build_object(
        'count', COALESCE((cur->>'count')::int, 0) + COALESCE((add->>'count')::int, 0),
        'names', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(names) x LIMIT 3) s)));
    END IF;
  END LOOP;
  RETURN out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.module_viewers(p_module text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT u.id
  FROM "User" u
  WHERE u."isActive" IS NOT FALSE
    AND (
      'ADMIN'::"Role" = ANY (public.app_user_roles(u))
      OR (
        'STAFF'::"Role" = ANY (public.app_user_roles(u))
        AND EXISTS (
          SELECT 1
          FROM "PermissionRoleModule" m
          JOIN "PermissionRole" r ON r.id = m."roleId"
          WHERE m.module = p_module
            AND m."canView"
            AND (
              r.id IN (SELECT up."roleId" FROM "UserPermissionRole" up WHERE up."userId" = u.id)
              OR ('SUPPORT'::"Role" = ANY (public.app_user_roles(u)) AND r."isSystem" AND lower(r.name) = 'support')
            )
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.my_app_nudge(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RETURN '[]'::JSON; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', n.participant_id, 'name', n.full_name, 'phone', n.phone,
      'reason', n.reason, 'sentAt', s."sentAt"
    ) ORDER BY (s."sentAt" IS NOT NULL), n.full_name)
    FROM public.app_nudge_people() n
    LEFT JOIN public."AppNudgeSend" s ON s."participantId" = n.participant_id AND s."ownerId" = n.owner_id
    WHERE n.owner_id = staff.id
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_followup_check()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  ck "FollowUpOwnerCheck";
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ck FROM "FollowUpOwnerCheck" WHERE "ownerId" = me AND "closedAt" IS NULL AND answer IS NULL;
  IF ck.id IS NULL THEN RETURN NULL; END IF;
  RETURN json_build_object(
    'id', ck.id, 'promptedAt', ck."promptedAt", 'deadlineAt', ck."deadlineAt",
    'people', COALESCE((
      SELECT json_agg(json_build_object('id', s.id, 'name', s."fullName") ORDER BY s."ownerAssignedAt")
      FROM public.followup_stale_contacts() s WHERE s."ownerId" = me
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_followup_handovers(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(h) FROM (
      SELECT DISTINCT ON (l."contactId")
             l."contactId" AS "contactId", l."createdAt" AS "at", fu.name AS "fromName", l.reason
      FROM "FollowUpReassignmentLog" l
      JOIN "FollowUpContact" c ON c.id = l."contactId" AND c."ownerId" = actor.id
      LEFT JOIN "User" fu ON fu.id = l."fromUserId"
      WHERE l."toUserId" = actor.id
      ORDER BY l."contactId", l."createdAt" DESC
    ) h
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_help_contact(p_token text, p_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  person_id UUID;
  person "Participant";
  v_support_id UUID;
  v_cohort UUID;
  v_hub UUID;
  v_it "User";
BEGIN
  IF staff.id IS NOT NULL THEN
    IF staff.role = 'ADMIN' OR p_cohort_id IS NULL THEN
      RETURN NULL;
    END IF;
    v_support_id := staff.id;
    v_cohort := p_cohort_id;
  ELSE
    person_id := public.app_participant_id(p_token);
    IF person_id IS NULL THEN
      RAISE EXCEPTION 'SESSION_EXPIRED';
    END IF;
    SELECT * INTO person FROM "Participant" WHERE id = person_id;
    v_cohort := person."cohortId";

    -- During the programme: their group's support.
    SELECT g."supportId" INTO v_support_id
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
    WHERE gp."participantId" = person_id
    LIMIT 1;

    -- No group yet: whoever is following them up.
    IF v_support_id IS NULL AND person."followUpContactId" IS NOT NULL THEN
      SELECT f."ownerId", COALESCE(v_cohort, f."cohortId") INTO v_support_id, v_cohort
      FROM "FollowUpContact" f WHERE f.id = person."followUpContactId";
    END IF;
  END IF;

  IF v_support_id IS NULL OR v_cohort IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m."hubId" INTO v_hub
  FROM "HubMembership" m
  WHERE m."userId" = v_support_id AND m."cohortId" = v_cohort
  LIMIT 1;

  -- Next available IT person: the hub's own IT Support first (earliest
  -- added), then any other IT Support in this cohort's hubs (earliest added),
  -- skipping the caller and anyone without a usable number. None → NULL, and
  -- the app uses the support_contact setting.
  SELECT u.* INTO v_it
  FROM "HubItSupport" hi
  JOIN "SupportHub" h ON h.id = hi."hubId"
  JOIN "User" u ON u.id = hi."userId"
  WHERE h."cohortId" = v_cohort
    AND u."isActive" IS NOT FALSE
    AND NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL
    AND (staff.id IS NULL OR u.id <> staff.id)
  ORDER BY (v_hub IS NOT NULL AND hi."hubId" = v_hub) DESC, hi."createdAt" ASC, u.name ASC
  LIMIT 1;

  IF v_it.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object('name', v_it.name, 'phone', v_it.phone);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_notifications(p_limit integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  RETURN COALESCE((
    SELECT json_agg(n ORDER BY n."createdAt" DESC)
    FROM (
      SELECT id, "userId", title, body, path, type, "isRead", "createdAt"
      FROM "Notification"
      WHERE "userId" = me
      ORDER BY "createdAt" DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) n
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_notifications_signal()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN json_build_object('unread', 0, 'latestId', NULL, 'latestAt', NULL);
  END IF;
  RETURN json_build_object(
    'unread', (SELECT count(*) FROM "Notification" WHERE "userId" = me AND "isRead" = false),
    'latestId', (SELECT id FROM "Notification" WHERE "userId" = me ORDER BY "createdAt" DESC LIMIT 1),
    'latestAt', (SELECT "createdAt" FROM "Notification" WHERE "userId" = me ORDER BY "createdAt" DESC LIMIT 1)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalise_phone_digits(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Mirrors normalisePhone in supabase/functions/receive-form-registration/index.ts.
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^0[7-9][01]\d{8}$'
      THEN '234' || substring(regexp_replace(p_raw, '\D', '', 'g') from 2)
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^234[7-9][01]\d{8}$'
      THEN regexp_replace(p_raw, '\D', '', 'g')
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^\d{10,15}$'
      AND regexp_replace(p_raw, '\D', '', 'g') NOT LIKE '0%'
      THEN regexp_replace(p_raw, '\D', '', 'g')
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.notification_send_recipients(p_source text, p_type text, p_title text, p_body text, p_path text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_source = 'STAFF' THEN
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.read, x.name) FROM (
        SELECT n."userId" AS id, u.name, u.role::TEXT AS role, n."isRead" AS read, n."readAt" AS "readAt",
               n."createdAt" AS "sentAt",
               EXISTS (SELECT 1 FROM "PushSubscription" s WHERE s."userId" = n."userId") AS "hasPush"
        FROM "Notification" n JOIN "User" u ON u.id = n."userId"
        WHERE n.type = p_type AND n.title = p_title AND n.body = p_body
          AND COALESCE(n.path, '') = COALESCE(p_path, '')
          AND n."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  ELSIF p_source = 'PARTICIPANT' THEN
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.read, x.name) FROM (
        SELECT n."participantId" AS id, p."fullName" AS name, 'PARTICIPANT'::TEXT AS role,
               (n."readAt" IS NOT NULL) AS read, n."readAt" AS "readAt", n."createdAt" AS "sentAt",
               EXISTS (SELECT 1 FROM "ParticipantPushSubscription" s WHERE s."participantId" = n."participantId") AS "hasPush"
        FROM "ParticipantNotification" n JOIN "Participant" p ON p.id = n."participantId"
        WHERE n.type = p_type AND n.title = p_title AND n.body = p_body
          AND COALESCE(n.path, '') = COALESCE(p_path, '')
          AND n."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  ELSE
    -- Push only: who it was sent to. Read is not tracked.
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.name) FROM (
        SELECT DISTINCT l."userId" AS id, u.name, u.role::TEXT AS role, NULL::BOOLEAN AS read,
               NULL::TIMESTAMPTZ AS "readAt", l."createdAt" AS "sentAt", TRUE AS "hasPush"
        FROM (
          SELECT "userId", kind, "createdAt" FROM "FollowUpOwnerReminderLog"
          UNION ALL
          SELECT "userId", kind, "createdAt" FROM "PushReminderLog"
        ) l JOIN "User" u ON u.id = l."userId"
        WHERE l.kind = p_type AND l."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notification_sends(p_days integer DEFAULT 14)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(r ORDER BY r."sentAt" DESC) FROM (
      SELECT 'STAFF'::TEXT AS source, n.type, n.title, n.body, COALESCE(n.path, '') AS path,
             MIN(n."createdAt") AS "sentAt", MAX(n."createdAt") AS "lastAt",
             COUNT(*)::INT AS recipients, (COUNT(*) FILTER (WHERE n."isRead"))::INT AS "readCount",
             TRUE AS tracked
      FROM "Notification" n
      WHERE n."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY n.type, n.title, n.body, COALESCE(n.path, ''), FLOOR(EXTRACT(EPOCH FROM n."createdAt") / 600)
      UNION ALL
      SELECT 'PARTICIPANT', n.type, n.title, n.body, COALESCE(n.path, ''),
             MIN(n."createdAt"), MAX(n."createdAt"),
             COUNT(*)::INT, (COUNT(*) FILTER (WHERE n."readAt" IS NOT NULL))::INT, TRUE
      FROM "ParticipantNotification" n
      WHERE n."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY n.type, n.title, n.body, COALESCE(n.path, ''), FLOOR(EXTRACT(EPOCH FROM n."createdAt") / 600)
      UNION ALL
      SELECT 'PUSH', l.kind, public.push_kind_label(l.kind), '', '',
             MIN(l."createdAt"), MAX(l."createdAt"), COUNT(DISTINCT l."userId")::INT, 0, FALSE
      FROM "FollowUpOwnerReminderLog" l
      WHERE l."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY l.kind, l."reminderDate"
      UNION ALL
      SELECT 'PUSH', l.kind, public.push_kind_label(l.kind), '', '',
             MIN(l."createdAt"), MAX(l."createdAt"), COUNT(DISTINCT l."userId")::INT, 0, FALSE
      FROM "PushReminderLog" l
      WHERE l."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY l.kind, l."reminderDate"
    ) r
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.notification_stamp_read()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."isRead" THEN
    IF NOT COALESCE(OLD."isRead", FALSE) AND NEW."readAt" IS NULL THEN
      NEW."readAt" := NOW();
    END IF;
  ELSE
    NEW."readAt" := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_attendance_report(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_attended_count INTEGER;
  v_absent_count INTEGER;
  v_already_notified_at TIMESTAMPTZ;
  v_title TEXT;
  v_body TEXT;
  v_user_ids UUID[];
  v_url text;
  v_key text;
BEGIN
  SELECT w."cohortId", w."weekNumber", s."reportNotifiedAt"
  INTO v_cohort_id, v_week_number, v_already_notified_at
  FROM public."Week" w
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id
  FOR UPDATE OF s;

  IF v_cohort_id IS NULL OR v_already_notified_at IS NOT NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY')),
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')
  INTO v_attended_count, v_absent_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';

  UPDATE public."AttendanceSession"
  SET "reportNotifiedAt" = NOW(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN RETURN; END IF;

  v_title := format('Attendance report · Week %s', v_week_number);
  v_body := format('%s attended · %s absent. Open your schedule for any follow-up assigned to you.', v_attended_count, v_absent_count);

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    -- No push possible: still write the bell rows so nobody misses the report.
    RAISE NOTICE 'notify_attendance_report: vault secrets missing; bell only';
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(v_user_ids),
      'title', v_title,
      'body', v_body,
      'path', '/support/attendance',
      'type', 'ATTENDANCE_REPORT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_hub_it_support_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub_name TEXT;
BEGIN
  SELECT name INTO v_hub_name FROM public."SupportHub" WHERE id = NEW."hubId";
  PERFORM public.invoke_hub_message_push(
    ARRAY[NEW."userId"],
    format('You''re now the IT Support for %s', COALESCE(v_hub_name, 'a hub')),
    'Tap to open My Hub'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_hub_membership_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public."Cohort" WHERE id = NEW."cohortId" AND "isPractice") THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_hub_name FROM public."SupportHub" WHERE id = NEW."hubId";
  PERFORM public.invoke_hub_message_push(
    ARRAY[NEW."userId"],
    format('You''ve been added to %s', COALESCE(v_hub_name, 'a hub')),
    'Tap to open My Hub'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_hub_role_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_ids UUID[];
BEGIN
  IF EXISTS (SELECT 1 FROM public."Cohort" WHERE id = NEW."cohortId" AND "isPractice") THEN RETURN NEW; END IF;
  IF NEW."leadUserId" IS NOT NULL AND NEW."leadUserId" IS DISTINCT FROM OLD."leadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."leadUserId"],
      format('You''re now the Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  IF NEW."assistantLeadUserId" IS NOT NULL AND NEW."assistantLeadUserId" IS DISTINCT FROM OLD."assistantLeadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."assistantLeadUserId"],
      format('You''re now the Assistant Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  -- Recap/Prayer Lead are lists: notify only ids newly added to the list.
  v_new_ids := ARRAY(SELECT unnest(NEW."recapLeadUserIds") EXCEPT SELECT unnest(COALESCE(OLD."recapLeadUserIds", ARRAY[]::UUID[])));
  IF cardinality(v_new_ids) > 0 THEN
    PERFORM public.invoke_hub_message_push(
      v_new_ids,
      format('You''re now a Recap Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  v_new_ids := ARRAY(SELECT unnest(NEW."prayerLeadUserIds") EXCEPT SELECT unnest(COALESCE(OLD."prayerLeadUserIds", ARRAY[]::UUID[])));
  IF cardinality(v_new_ids) > 0 THEN
    PERFORM public.invoke_hub_message_push(
      v_new_ids,
      format('You''re now a Prayer Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_prayer_slots()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  t record;
  v_opens timestamptz;
  v_session uuid;
  v_claimed uuid;
  v_participants uuid[];
  v_users uuid[];
  v_sent integer := 0;
  v_body text;
  v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest"
                 AND NOT public.prayer_is_practice(sl."cohortId")) THEN RETURN 0; END IF;
  -- Without the secrets nothing can be sent, so leave every slot unclaimed and try again next minute.
  IF NOT public.prayer_notify_ready() THEN RETURN 0; END IF;

  -- "N people prayed for you": a daily prayer that closed in the last ten minutes, each person prayed for once.
  FOR t IN SELECT tg."sessionId", tg."hubKey", tg."participantId" FROM public."CorporatePrayerTarget" tg
           JOIN public."CorporatePrayerSession" x ON x.id = tg."sessionId"
           JOIN public."CorporatePrayerSlot" sl ON sl.id = x."slotId" AND sl.notify AND NOT sl."isTest"
           WHERE tg."summarySentAt" IS NULL AND x."slotType" <> 'LIVE'
             AND x."closesAt" <= now() AND x."closesAt" > now() - interval '10 minutes'
             AND NOT public.prayer_is_practice(x."cohortId") LOOP
    UPDATE public."CorporatePrayerTarget" SET "summarySentAt" = now()
    WHERE "sessionId" = t."sessionId" AND "hubKey" = t."hubKey" AND "summarySentAt" IS NULL RETURNING "sessionId" INTO v_claimed;
    CONTINUE WHEN v_claimed IS NULL;
    v_n := public.prayer_amen_for_target(t."sessionId", t."hubKey");
    CONTINUE WHEN v_n = 0;
    PERFORM public.invoke_prayer_notify(ARRAY[t."participantId"], NULL, 'People prayed for you',
      format('%s %s prayed for you today. Tap to read the words they left.', v_n, CASE WHEN v_n = 1 THEN 'person' ELSE 'people' END));
    v_sent := v_sent + 1;
  END LOOP;

  FOR s IN SELECT sl.* FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest"
                AND NOT public.prayer_is_practice(sl."cohortId") LOOP
    v_opens := (v_today + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
    CONTINUE WHEN NOT (v_opens <= now() + interval '60 seconds' AND v_opens > now() - interval '2 minutes');
    -- A slot made or changed after it opened is not announced late.
    CONTINUE WHEN s."updatedAt" > v_opens;
    CONTINUE WHEN NOT public.prayer_running(s."cohortId");
    v_session := public.ensure_prayer_session(s.id, v_today);
    CONTINUE WHEN v_session IS NULL;
    -- Nothing to announce for a window that has already closed.
    CONTINUE WHEN (SELECT x."closesAt" FROM public."CorporatePrayerSession" x WHERE x.id = v_session) <= now();
    UPDATE public."CorporatePrayerSession" SET "notifiedAt" = now() WHERE id = v_session AND "notifiedAt" IS NULL RETURNING id INTO v_claimed;
    CONTINUE WHEN v_claimed IS NULL;
    SELECT array_agg(cp.participant_id) INTO v_participants FROM public.prayer_counted_participants(s."cohortId") cp
    WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", public.prayer_participant_hub(s."cohortId", cp.participant_id));
    SELECT array_agg(cs.user_id) INTO v_users FROM public.prayer_counted_supports(s."cohortId") cs
    WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", public.prayer_user_hub(s."cohortId", cs.user_id));
    v_body := CASE WHEN s."slotType" = 'LIVE' THEN 'The live prayer is on Telegram. Tap to join.'
                   ELSE format('%s prayer has started. It is not a call: pray where you are, %s minutes if you can.', COALESCE(s.name, to_char(s."timeOfDay", 'HH24:MI')), s."timerMinutes") END;
    PERFORM public.invoke_prayer_notify(v_participants, v_users, 'Time to pray', v_body);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_progress_json(p_cohort_id uuid, p_group_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'groups', COALESCE((
      SELECT json_agg(json_build_object(
        'groupId', g.id, 'groupName', g.name, 'supportId', g."supportId", 'supportName', u.name,
        'supportIntroPosted', EXISTS (
          SELECT 1 FROM public."GroupPost" gp
          WHERE gp."groupId" = g.id AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
            AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL),
        'overrides', COALESCE((
          SELECT json_agg(o.step ORDER BY o.step)
          FROM public."SupportOnboardingOverride" o WHERE o."groupId" = g.id
        ), '[]'::json)
      ) ORDER BY g.name)
      FROM public."Group" g
      LEFT JOIN public."User" u ON u.id = g."supportId"
      WHERE g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL
        AND (p_group_id IS NULL OR g.id = p_group_id)
    ), '[]'::json),
    'participants', COALESCE((
      SELECT json_agg((
        jsonb_build_object(
          'participantId', x.id, 'name', x."fullName", 'avatarUrl', x."avatarUrl",
          'groupId', x."groupId", 'groupName', x."groupName")
        || public.participant_onboarding_state(x.id)
      ) ORDER BY x."groupName" NULLS LAST, x."fullName")
      FROM (
        SELECT p.id, p."fullName", p."avatarUrl", g.id AS "groupId", g.name AS "groupName"
        FROM public."Participant" p
        LEFT JOIN public."Group" g ON g.id = public.discussion_participant_group(p.id)
        WHERE p."cohortId" = p_cohort_id AND p.status = 'ACTIVE'
          AND (p_group_id IS NULL OR g.id = p_group_id)
      ) x
    ), '[]'::json)
  );
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_try_complete(p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_state JSONB := public.participant_onboarding_state(p_participant_id);
  v_group UUID;
BEGIN
  IF (v_state->>'introPosted')::boolean AND (v_state->>'introGuideRead')::boolean
     AND (v_state->>'profileComplete')::boolean AND (v_state->>'readyConfirmed')::boolean THEN
    UPDATE public."ParticipantOnboarding" SET "completedAt" = NOW()
    WHERE "participantId" = p_participant_id AND "completedAt" IS NULL;
    IF FOUND THEN
      v_group := public.discussion_participant_group(p_participant_id);
      PERFORM public.invoke_discussion_notify(
        ARRAY(SELECT "supportId" FROM public."Group" WHERE id = v_group AND "supportId" IS NOT NULL),
        '{}',
        public.discussion_alert_name(NULL, p_participant_id) || ' is ready for class.',
        'They have finished all their onboarding steps.',
        '/support/onboarding', NULL);
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_ack_venue_map(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "venueMapAckAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "venueMapAckAt" = COALESCE(public."ParticipantOnboarding"."venueMapAckAt", NOW());
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_add_on_number(p_token text, p_full_name text, p_gender text, p_is_teen boolean, p_age_range text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_departments text[] DEFAULT NULL::text[], p_request text DEFAULT NULL::text, p_consent boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_cohort UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'Sign in with your parent''s number to add someone';
  END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = v_me;
  IF NOT COALESCE((public.add_on_number_state(v_cohort) ->> 'open')::boolean, FALSE) THEN
    RAISE EXCEPTION 'Adding people is closed for this cohort. Ask your support.';
  END IF;
  RETURN public.household_add_person(v_me, NULL, p_full_name, p_gender, p_is_teen, p_age_range, p_date_of_birth,
                                     p_email, p_departments, p_request, p_consent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_add_on_number_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_cohort UUID;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN RETURN jsonb_build_object('open', FALSE, 'viaTeenNumber', TRUE); END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = v_me;
  RETURN public.add_on_number_state(v_cohort);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_age_from_dob()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_range TEXT;
BEGIN
  IF NEW."dateOfBirth" IS NOT NULL THEN
    v_range := public.age_range_for_age(date_part('year', age((NOW() AT TIME ZONE 'Africa/Lagos')::date, NEW."dateOfBirth"))::int);
    IF v_range IS NOT NULL THEN
      NEW."ageRange" := v_range;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_age_teen_boundary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_old BOOLEAN;
  v_new BOOLEAN;
BEGIN
  IF NEW."ageRange" IS NOT DISTINCT FROM OLD."ageRange" THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('fof.skip_teen_boundary', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.status <> 'ACTIVE' OR NEW."isTest" IS TRUE OR NEW."cohortId" IS DISTINCT FROM public.current_programme_cohort_id() THEN RETURN NEW; END IF;
  v_old := replace(lower(COALESCE(OLD."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
  v_new := replace(lower(COALESCE(NEW."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
  IF NOT v_old AND v_new THEN
    PERFORM public.teen_convert_participant(NEW.id);
  ELSIF v_old AND NOT v_new AND NULLIF(trim(COALESCE(NEW."ageRange", '')), '') IS NOT NULL THEN
    PERFORM public.teen_revert_participant(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_class_signal(p_token text, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  v_week integer;
  v_old text;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '');
  v_first text;
  v_support uuid;
  v_url text;
  v_key text;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_status NOT IN ('HERE', 'CANT') THEN RAISE EXCEPTION 'BAD_STATUS'; END IF;
  v_week := public.class_signal_open_week(v_pid);
  IF v_week IS NULL THEN RAISE EXCEPTION 'NOT_OPEN'; END IF;

  SELECT status INTO v_old FROM public."ClassSignal" WHERE "weekId" = v_week AND "participantId" = v_pid;
  INSERT INTO public."ClassSignal" ("weekId", "participantId", status, reason)
  VALUES (v_week, v_pid, p_status, CASE WHEN p_status = 'CANT' THEN v_reason END)
  ON CONFLICT ("weekId", "participantId") DO UPDATE
    SET status = EXCLUDED.status, reason = EXCLUDED.reason, "updatedAt" = now();

  -- Tell the support once per change of answer.
  IF v_old IS DISTINCT FROM p_status THEN
    SELECT COALESCE(NULLIF(split_part(btrim(p."fullName"), ' ', 1), ''), 'A participant') INTO v_first FROM public."Participant" p WHERE p.id = v_pid;
    SELECT g."supportId" INTO v_support
    FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    JOIN public."Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
    WHERE gp."participantId" = v_pid LIMIT 1;
    IF v_support IS NOT NULL THEN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
      IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
          body := jsonb_build_object('userIds', to_jsonb(ARRAY[v_support]),
            'title', CASE WHEN p_status = 'HERE' THEN v_first || ' is at church' ELSE v_first || ' cannot come today' END,
            'body', CASE WHEN p_status = 'HERE' THEN 'They tapped "I''m here" in the app.' ELSE COALESCE('Reason: ' || v_reason, 'They did not give a reason.') END,
            'path', '/support/attendance', 'type', 'ATTENDANCE'),
          timeout_milliseconds := 25000);
      END IF;
    END IF;
  END IF;
  RETURN json_build_object('status', p_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_class_signal_mine(p_token text, p_week integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  r public."ClassSignal";
BEGIN
  IF v_pid IS NULL THEN RETURN json_build_object('status', NULL); END IF;
  SELECT * INTO r FROM public."ClassSignal" WHERE "weekId" = p_week AND "participantId" = v_pid;
  RETURN json_build_object('status', r.status, 'reason', r.reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_confirm_ready(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_state JSONB;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_state := public.participant_onboarding_state(v_me);
  IF NOT (v_state->>'introPosted')::boolean THEN RAISE EXCEPTION 'Post your introduction first'; END IF;
  IF NOT (v_state->>'introGuideRead')::boolean THEN RAISE EXCEPTION 'Read the Intro Class guide first'; END IF;
  IF NOT (v_state->>'profileComplete')::boolean THEN RAISE EXCEPTION 'Finish your profile first'; END IF;

  IF NOT (v_state->>'venueMapAcknowledged')::boolean THEN RAISE EXCEPTION 'Check the venue map first'; END IF;

  INSERT INTO public."ParticipantOnboarding" ("participantId", "readyConfirmedAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "readyConfirmedAt" = COALESCE(public."ParticipantOnboarding"."readyConfirmedAt", NOW());

  PERFORM public.onboarding_try_complete(v_me);
  RETURN public.participant_onboarding_state(v_me);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_delete(p_token text, p_kind text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_kind = 'POST' THEN
    UPDATE public."GroupPost" SET "deletedAt" = NOW(), "pinnedAt" = NULL
    WHERE id = p_id AND "authorParticipantId" = v_me AND "deletedAt" IS NULL;
  ELSIF p_kind = 'REPLY' THEN
    UPDATE public."GroupPostReply" SET "deletedAt" = NOW()
    WHERE id = p_id AND "authorParticipantId" = v_me AND "deletedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only delete your own posts'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_feed(p_token text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RETURN NULL; END IF;
  RETURN public.build_discussion_feed(v_group, 'PARTICIPANT', NULL, v_me, p_before, p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_intro(p_token text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RAISE EXCEPTION 'You are not in a group yet'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO'
      AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Your support hasn''t started introductions yet';
  END IF;
  RETURN public.discussion_upsert_intro(v_group, NULL, v_me, p_body);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_like(p_token text, p_post_id uuid, p_like boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  IF p_like THEN
    INSERT INTO public."GroupPostLike" ("postId", "participantId")
    SELECT p_post_id, v_me
    WHERE NOT EXISTS (SELECT 1 FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "participantId" = v_me);
  ELSE
    DELETE FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "participantId" = v_me;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_mark_seen(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NOT NULL THEN PERFORM public.discussion_mark_seen(v_group, NULL, v_me); END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_post(p_token text, p_body text, p_mentions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RAISE EXCEPTION 'You are not in a group yet'; END IF;
  INSERT INTO public."GroupPost" ("groupId", "authorParticipantId", body, mentions)
  VALUES (v_group, v_me, public.discussion_clean_body(p_body), public.discussion_clean_mentions(v_group, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_reply(p_token text, p_post_id uuid, p_body text, p_mentions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  INSERT INTO public."GroupPostReply" ("postId", "authorParticipantId", body, mentions)
  VALUES (p_post_id, v_me, public.discussion_clean_body(p_body), public.discussion_clean_mentions(public.discussion_participant_group(v_me), p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_report(p_token text, p_post_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_reason NOT IN ('SPAM', 'UNKIND', 'OFF_TOPIC', 'OTHER') THEN RAISE EXCEPTION 'Pick a reason'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  IF EXISTS (SELECT 1 FROM public."GroupPost" WHERE id = p_post_id AND "authorParticipantId" = v_me) THEN
    RAISE EXCEPTION 'You can''t report your own post';
  END IF;
  INSERT INTO public."GroupPostReport" ("postId", "reporterParticipantId", reason)
  SELECT p_post_id, v_me, p_reason
  WHERE NOT EXISTS (
    SELECT 1 FROM public."GroupPostReport" WHERE "postId" = p_post_id AND "reporterParticipantId" = v_me
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_unseen(p_token text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RETURN 0; END IF;
  RETURN public.discussion_unseen_count(v_group, NULL, v_me);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_faith(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort UUID;
  result JSON;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = person_id;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt", 'sharedForPrayer', f."sharedForPrayer",
        'fromForm', f.status = 'NOT_DRAFTED' AND f.body IS NOT NULL AND EXISTS (
          SELECT 1 FROM "SheetRegistration" s
          JOIN "Participant" p ON p."followUpContactId" = s."contactId"
          WHERE p.id = person_id
            AND trim(s.answers->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)') = f.body
        ))
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'deadlineAt', (SELECT s."deadlineAt" FROM "FaithProjectSetting" s WHERE s."cohortId" = v_cohort),
    'history', COALESCE((
      SELECT json_agg(json_build_object('id', v.id, 'body', v.body, 'savedAt', v."savedAt", 'savedByName', v."savedByName") ORDER BY v."savedAt" DESC)
      FROM (SELECT * FROM "FaithProjectVersion" WHERE "participantId" = person_id ORDER BY "savedAt" DESC LIMIT 50) v
    ), '[]'::json),
    'prayerConsent', (SELECT "prayerConsent" FROM "Participant" WHERE id = person_id),
    'prayersStartsOn', public.faith_prayers_start_date(v_cohort),
    'trail', '[]'::json,
    'openHelpRequest', (
      SELECT json_build_object(
        'id', h.id, 'reason', h.reason, 'note', h.note, 'wantsContact', h."wantsContact", 'createdAt', h."createdAt"
      )
      FROM "FaithHelpRequest" h
      WHERE h."participantId" = person_id AND h."resolvedAt" IS NULL
      ORDER BY h."createdAt" DESC LIMIT 1
    )
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_family(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  v_me UUID := public.app_participant_id(p_token);
  v_count INTEGER;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF s."viaTeenNumber" THEN RETURN '[]'::json; END IF;
  SELECT count(*) INTO v_count FROM public.shared_number_people(v_me) f WHERE f.has_login;
  IF v_count < 2 THEN RETURN '[]'::json; END IF;
  RETURN (
    SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'current', f.id = v_me, 'isTeen', f.is_teen) ORDER BY f.name)
    FROM public.shared_number_people(v_me) f WHERE f.has_login
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_home(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone, 'supportAvatarUrl', support."avatarUrl"
    ) END,
    'groupMeetingLive', (
      SELECT json_build_object('weekId', gm."weekId", 'startedAt', gm.started, 'prayerFinished', gps."prayerFinishedAt" IS NOT NULL, 'recapFinished', gps."recapFinishedAt" IS NOT NULL,
        'recap', CASE WHEN gps."prayerFinishedAt" IS NOT NULL
          AND COALESCE(lw."shareWithParticipants", FALSE)
          AND (btrim(COALESCE(lw."recapSummary", '')) <> '' OR lw."recapDocumentUrl" IS NOT NULL)
          THEN json_build_object(
            'recapSummary', lw."recapSummary", 'discussionPrompt', lw."discussionPrompt",
            'recapDocumentUrl', lw."recapDocumentUrl", 'recapDocumentName', lw."recapDocumentName"
          ) END)
      FROM (
        SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
        FROM "MeetingAttendance" m
        WHERE m."groupId" = grp.id
        GROUP BY m."weekId"
      ) gm
      LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
      LEFT JOIN "Week" lw ON lw.id = gm."weekId"
      WHERE gm.started > NOW() - INTERVAL '3 hours'
        AND COALESCE(gps.done, FALSE) = FALSE
      ORDER BY gm.started DESC
      LIMIT 1
    ),
    'groupPrayerFocus', (
      SELECT json_build_object(
        'weekId', f."weekId",
        'participantName', fp_person."fullName",
        'projectText', (
          SELECT fp.body FROM "FaithProject" fp
          WHERE fp."participantId" = fp_person.id AND public.faith_project_prayable(fp)
          ORDER BY fp."updatedAt" DESC LIMIT 1
        )
      )
      FROM "GroupPrayerFocus" f
      JOIN "Participant" fp_person ON fp_person.id = f."participantId"
      WHERE f."groupId" = grp.id
        AND f."weekId" = (
          SELECT gm."weekId"
          FROM (
            SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
            FROM "MeetingAttendance" m
            WHERE m."groupId" = grp.id
            GROUP BY m."weekId"
          ) gm
          LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
          WHERE gm.started > NOW() - INTERVAL '3 hours'
            AND COALESCE(gps.done, FALSE) = FALSE
          ORDER BY gm.started DESC
          LIMIT 1
        )
    ),
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
        'title', w.title,
        'teacher', CASE
          WHEN public.fof_is_teen_age(person."ageRange") AND btrim(COALESCE(w."teenTeacherName", '')) <> '' THEN json_build_object(
            'name', btrim(w."teenTeacherName"), 'role', NULLIF(btrim(COALESCE(w."teenTeacherRole", '')), ''),
            'bio', NULLIF(btrim(COALESCE(w."teenTeacherBio", '')), ''), 'photoUrl', w."teenTeacherPhotoUrl"
          )
          WHEN btrim(COALESCE(w."teacherName", '')) <> '' THEN json_build_object(
            'name', btrim(w."teacherName"), 'role', NULLIF(btrim(COALESCE(w."teacherRole", '')), ''),
            'bio', NULLIF(btrim(COALESCE(w."teacherBio", '')), ''), 'photoUrl', w."teacherPhotoUrl"
          ) END,
        'classGraphicUrl', w."classGraphicUrl",
        'manualReleasesAt', CASE WHEN NOT manual_rel.released AND w."manualDocumentUrl" IS NOT NULL
          THEN public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual') END,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END,
        'manual', CASE WHEN manual_rel.released AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
          'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
          'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
        ) END,
        'manualQuestions', COALESCE((
          SELECT json_agg(json_build_object(
            'id', mq.id, 'body', mq.body, 'status', mq.status, 'reply', mq.reply, 'createdAt', mq."createdAt",
            'askedByName', (SELECT u.name FROM "User" u WHERE u.id = mq."askedById")
          ) ORDER BY mq."createdAt")
          FROM "ManualQuestion" mq WHERE mq."weekId" = w.id AND mq."participantId" = person_id
        ), '[]'::json),
        'manualNote', (SELECT n.body FROM "ManualNote" n WHERE n."weekId" = w.id AND n."participantId" = person_id)
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR COALESCE(cohort."isPractice", FALSE)
            OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          w."manualReleasedEarlyAt" IS NOT NULL
          OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'),
          FALSE
        ) AS released
      ) manual_rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'openWindow', (
      SELECT jsonb_build_object(
        'weekId', s."weekId",
        'closesAt', s."closesAt",
        'myStatus', (SELECT a.status FROM "AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = person_id)
      )
      FROM "AttendanceSession" s
      JOIN "Week" w2 ON w2.id = s."weekId" AND w2."cohortId" = person."cohortId"
      WHERE s."startedAt" IS NOT NULL AND s."closesAt" > NOW() AND s."finalizedAt" IS NULL
      ORDER BY s."startedAt" DESC LIMIT 1
    ),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'prayerConsent', person."prayerConsent",
    'prayerPrompt', CASE WHEN person."prayerConsent" IS NULL AND public.faith_prayers_prompt_due(person."cohortId")
      THEN json_build_object('startsOn', public.faith_prayers_start_date(person."cohortId")) ELSE NULL END,
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', CASE WHEN COALESCE((SELECT (value #>> '{}')::boolean FROM "AppSetting" WHERE "settingKey" = 'scriptures_enabled'), TRUE)
      THEN COALESCE((
        SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
        FROM "Scripture" sc
      ), '[]'::json)
      ELSE '[]'::json
    END,
    'scriptureStartDay', COALESCE((SELECT (value #>> '{}')::int FROM "AppSetting" WHERE "settingKey" = 'scripture_start_day'), 1),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants" AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'homeLabel', a."homeLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
        AND a."targetUserId" IS NULL
        AND (a."targetParticipantId" IS NULL OR a."targetParticipantId" = person_id)
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', (
      SELECT json_build_object('submitted', w."participantId" IS NOT NULL, 'department', w.department)
      FROM (SELECT 1) one
      LEFT JOIN "ParticipantWrapUp" w ON w."participantId" = person_id AND w."cohortId" = person."cohortId"
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    ),
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(public.week_class_date(cohort."startDate", w3."weekNumber", w3."classDate"), 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND (public.week_class_date(cohort."startDate", wk."weekNumber", wk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
        ORDER BY wk."weekNumber" DESC
        LIMIT 1
      ) w3
      WHERE NOT EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" d WHERE d."participantId" = person_id AND d."weekId" = w3.id)
    ),
    'departmentPromptDue', COALESCE((
      SELECT TRUE
      FROM "AppSetting" cft
      WHERE cft."settingKey" = 'class_feedback_times'
        AND (cft.value->>'departmentWeek') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ParticipantWrapUp" ww WHERE ww."participantId" = person_id AND ww."cohortId" = person."cohortId")
        AND EXISTS (
          SELECT 1 FROM "Week" dwk
          WHERE dwk."cohortId" = person."cohortId"
            AND dwk."weekNumber" >= (cft.value->>'departmentWeek')::int
            AND NOW() >= (public.week_class_date(cohort."startDate", dwk."weekNumber", dwk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_login_details(p_token text, p_participant_id uuid DEFAULT NULL::uuid, p_follow_up_contact_id uuid DEFAULT NULL::uuid, p_issue boolean DEFAULT false, p_new_code boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  account "ParticipantAccount";
  shared "ParticipantAccount";
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  random_bytes BYTEA;
  code TEXT;
  allowed BOOLEAN;
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  IF p_participant_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE id = p_participant_id;
  ELSIF p_follow_up_contact_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE "followUpContactId" = p_follow_up_contact_id;
  END IF;
  -- Older leads marked Registered may never have been added to Participants.
  IF person.id IS NULL THEN
    RETURN json_build_object('status', 'NO_PARTICIPANT');
  END IF;

  allowed := staff.role = 'ADMIN'
    OR (staff.role = 'SUPPORT' AND (
      EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = person.id AND g."supportId" = staff.id
      )
      OR EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        JOIN "CoverRequest" cr ON cr."supportId" = g."supportId"
        WHERE gp."participantId" = person.id
          AND cr."coverSupportId" = staff.id
          AND cr.status = 'ASSIGNED'
          AND NOW() BETWEEN cr."startsAt" AND cr."endsAt"
      )
      OR EXISTS (
        SELECT 1 FROM "FollowUpContact" f
        WHERE f.id = person."followUpContactId"
          AND (f."ownerId" = staff.id OR f."registeredById" = staff.id)
      )
      -- New: IT Support for this person's follow-up (their owner support's hub).
      OR (
        person."followUpContactId" IS NOT NULL
        AND staff.id = ANY(public.followup_contact_it_support_ids(person."followUpContactId", person."cohortId"))
      )
    ));
  IF NOT allowed THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO account FROM "ParticipantAccount" WHERE "participantId" = person.id;

  IF (p_issue AND account."participantId" IS NULL) AND staff.role <> 'ADMIN' THEN
    IF p_follow_up_contact_id IS NULL AND (person."followUpContactId" IS NULL) THEN
      RAISE EXCEPTION 'NO_FORM_REGISTRATION';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = COALESCE(p_follow_up_contact_id, person."followUpContactId")) THEN
      RAISE EXCEPTION 'NO_FORM_REGISTRATION';
    END IF;
  END IF;

  IF p_issue AND account."participantId" IS NULL THEN
    IF public.fof_phone_key(person.phone) IS NULL THEN
      RAISE EXCEPTION 'NO_PHONE';
    END IF;
    -- Someone on this number already has a login: join it (their password, or the same waiting code).
    SELECT a.* INTO shared
    FROM public.shared_number_people(person.id) f
    JOIN "ParticipantAccount" a ON a."participantId" = f.id AND a."isActive"
    WHERE f.id <> person.id
    ORDER BY (a."passwordSetAt" IS NOT NULL) DESC, a."passwordSetAt" DESC NULLS LAST, a."issuedAt" DESC
    LIMIT 1;
    IF shared."participantId" IS NOT NULL THEN
      INSERT INTO "ParticipantAccount" (
        "participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt"
      )
      VALUES (person.id, shared.password_hash, shared."setupCode", shared."mustChangePassword", staff.id, NOW(), shared."passwordSetAt")
      RETURNING * INTO account;
    END IF;
  END IF;

  IF (p_issue AND account."participantId" IS NULL) OR (p_new_code AND account."participantId" IS NOT NULL) THEN
    IF public.fof_phone_key(person.phone) IS NULL THEN
      RAISE EXCEPTION 'NO_PHONE';
    END IF;

    random_bytes := gen_random_bytes(6);
    code := 'FOF-';
    FOR i IN 0..5 LOOP
      code := code || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    INSERT INTO "ParticipantAccount" (
      "participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt"
    )
    VALUES (person.id, crypt(code, gen_salt('bf', 10)), code, TRUE, staff.id, NOW(), NULL)
    ON CONFLICT ("participantId") DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      "setupCode" = EXCLUDED."setupCode",
      "mustChangePassword" = TRUE,
      "issuedById" = EXCLUDED."issuedById",
      "issuedAt" = EXCLUDED."issuedAt",
      "passwordSetAt" = NULL,
      "updatedAt" = NOW()
    RETURNING * INTO account;

    IF p_new_code THEN
      -- One login per number: the new code resets everyone on it.
      UPDATE "ParticipantAccount" a SET
        password_hash = account.password_hash,
        "setupCode" = account."setupCode",
        "mustChangePassword" = TRUE,
        "issuedById" = staff.id,
        "issuedAt" = NOW(),
        "passwordSetAt" = NULL,
        "updatedAt" = NOW()
      WHERE a."participantId" IN (SELECT f.id FROM public.shared_number_people(person.id) f WHERE f.has_login AND f.id <> person.id);
      DELETE FROM "AppSession"
      WHERE "participantId" = person.id
         OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person.id) f WHERE f.has_login);
    END IF;
  END IF;

  RETURN json_build_object(
    'participantId', person.id,
    'name', person."fullName",
    'phone', person.phone,
    'status', CASE
      WHEN account."participantId" IS NULL THEN 'NONE'
      WHEN account."mustChangePassword" THEN 'CODE_READY'
      ELSE 'ACTIVE'
    END,
    'setupCode', CASE WHEN account."mustChangePassword" THEN account."setupCode" END,
    'issuedAt', account."issuedAt",
    'passwordSetAt', account."passwordSetAt",
    'lastSignInAt', account."lastSignInAt",
    -- The others on this number, so the card can say the login is shared and warn before a reset.
    'household', COALESCE((
      SELECT json_agg(json_build_object('name', f.name, 'hasLogin', f.has_login, 'isTeen', f.is_teen) ORDER BY f.name)
      FROM public.shared_number_people(person.id) f WHERE f.id <> person.id
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_mark_intro_guide_read(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "introGuideReadAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "introGuideReadAt" = COALESCE(public."ParticipantOnboarding"."introGuideReadAt", NOW());
  -- Keep the older Get ready tick in step.
  INSERT INTO public."ParticipantReadyStep" ("participantId", step)
  VALUES (v_me, 'intro')
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_mark_ready_step(p_token text, p_step text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_step NOT IN ('intro', 'people') THEN
    RAISE EXCEPTION 'INVALID_STEP';
  END IF;

  INSERT INTO "ParticipantReadyStep" ("participantId", step)
  VALUES (person_id, p_step)
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_notifications(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  RETURN json_build_object(
    'unread', (SELECT count(*) FROM "ParticipantNotification" n WHERE n."participantId" = person_id AND n."readAt" IS NULL),
    'items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', x.id, 'title', x.title, 'body', x.body, 'path', x.path, 'type', x.type,
        'readAt', x."readAt", 'createdAt', x."createdAt"
      ) ORDER BY x."createdAt" DESC)
      FROM (
        SELECT * FROM "ParticipantNotification" n
        WHERE n."participantId" = person_id
        ORDER BY n."createdAt" DESC
        LIMIT 50
      ) x
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_onboarding_state(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := public.discussion_participant_group(p_participant_id);
  v_ob public."ParticipantOnboarding";
  v_profile JSON := public.profile_completion_for(p_participant_id);
  v_intro BOOLEAN;
  v_support_intro BOOLEAN;
  v_guide BOOLEAN;
  v_profile_ok BOOLEAN := COALESCE((v_profile->>'percent')::int, 0) >= 100;
  v_ready BOOLEAN;
  v_first DATE;
  v_map BOOLEAN;
  v_attended BOOLEAN;
  v_intro_ticked BOOLEAN;
BEGIN
  SELECT * INTO v_ob FROM public."ParticipantOnboarding" WHERE "participantId" = p_participant_id;
  v_guide := v_ob."introGuideReadAt" IS NOT NULL;
  v_ready := v_ob."readyConfirmedAt" IS NOT NULL;
  v_map := v_ob."venueMapAckAt" IS NOT NULL OR v_ob."readyConfirmedAt" IS NOT NULL OR v_ob."completedAt" IS NOT NULL;
  v_intro_ticked := v_ob."introTickedAt" IS NOT NULL;
  -- Seen in class at least once (present, late or left early): the Get ready list retires.
  v_attended := EXISTS (SELECT 1 FROM public."AttendanceRecord" ar
    WHERE ar."participantId" = p_participant_id AND ar.status IN ('PRESENT','LATE','LEFT_EARLY'));

  -- Posted their intro in the group, or ticked it themselves.
  v_intro := v_intro_ticked OR (v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorParticipantId" = p_participant_id
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL));
  v_support_intro := v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL);

  SELECT public.week_class_date(c."startDate", 1, w."classDate") INTO v_first
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  LEFT JOIN public."Week" w ON w."cohortId" = c.id AND w."weekNumber" = 1
  WHERE p.id = p_participant_id;

  RETURN jsonb_build_object(
    'introPosted', v_intro,
    'introTicked', v_intro_ticked,
    'supportIntroPosted', v_support_intro,
    'introGuideRead', v_guide,
    'profileComplete', v_profile_ok,
    'profileMissing', COALESCE((v_profile->>'missing')::int, 0),
    'venueMapAcknowledged', v_map,
    'hasAttended', v_attended,
    'readyConfirmed', v_ready,
    'completed', v_ob."completedAt" IS NOT NULL OR (v_intro AND v_guide AND v_profile_ok AND v_ready),
    'firstClassDate', v_first
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_onboarding_state_self(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  PERFORM public.onboarding_try_complete(v_me);
  RETURN public.participant_onboarding_state(v_me);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_people(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  grp "Group";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'supports', COALESCE((
      SELECT json_agg(json_build_object(
        'id', u.id,
        'name', u.name,
        'avatarUrl', u."avatarUrl",
        'role', u.role,
        'isMySupport', u.id = grp."supportId"
      ) ORDER BY (u.id = grp."supportId") DESC, u.name)
      FROM "User" u
      WHERE u."isActive"
        AND u.role IN ('SUPPORT', 'ADMIN')
        AND EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = person."cohortId")
    ), '[]'::json),
    'groupName', grp.name,
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'cohort', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "Participant" m
      WHERE m."cohortId" = person."cohortId" AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_profile_fields(p_participant_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(json_agg(json_build_object(
    'id', f.id, 'label', f.label, 'helpText', f."helpText", 'fieldType', f."fieldType",
    'options', f.options, 'required', f.required, 'value', a.value
  ) ORDER BY f."createdAt"), '[]'::json)
  FROM "ProfileField" f
  LEFT JOIN "ProfileFieldAnswer" a ON a."fieldId" = f.id AND a."participantId" = p_participant_id
  WHERE public.profile_field_applies(f, p_participant_id);
$function$;

CREATE OR REPLACE FUNCTION public.participant_profile_overview(p_participant_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'completion', public.profile_completion_for(p_participant_id),
    'fields', public.participant_profile_fields(p_participant_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.participant_ready_steps(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(s.step ORDER BY s.step)
    FROM "ParticipantReadyStep" s
    WHERE s."participantId" = person_id
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_retake_matches(p_cohort_id uuid)
 RETURNS TABLE("participantId" uuid, "otherName" text, "otherCohort" text, "otherCohortStart" date, "sameFirstName" boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT p.id,
         o."fullName",
         c.name,
         c."startDate"::date,
         lower(split_part(btrim(p."fullName"), ' ', 1)) = lower(split_part(btrim(o."fullName"), ' ', 1))
  FROM "Participant" p
  JOIN "Participant" o
    ON public.fof_phone_key(o.phone) = public.fof_phone_key(p.phone)
   AND o.id <> p.id
   AND o."cohortId" IS DISTINCT FROM p."cohortId"
  JOIN "Cohort" c ON c.id = o."cohortId"
  WHERE p."cohortId" = p_cohort_id
    AND public.fof_phone_key(p.phone) IS NOT NULL
  ORDER BY p.id, c."startDate";
$function$;

CREATE OR REPLACE FUNCTION public.participant_retake_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  first_name TEXT := lower(split_part(btrim(COALESCE(NEW."fullName", '')), ' ', 1));
  retaken TEXT;
  shared TEXT;
  note TEXT;
BEGIN
  IF public.fof_phone_key(NEW.phone) IS NULL OR NEW."cohortId" IS NULL THEN
    RETURN NEW;
  END IF;

  WITH others AS (
    SELECT p."fullName", c.name AS cohort, c."startDate"
    FROM "Participant" p
    JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE public.fof_phone_key(p.phone) = public.fof_phone_key(NEW.phone)
      AND p."cohortId" <> NEW."cohortId"
      AND p.id <> NEW.id
  )
  SELECT
    string_agg(cohort, ', ' ORDER BY "startDate")
      FILTER (WHERE first_name <> '' AND lower(split_part(btrim("fullName"), ' ', 1)) = first_name),
    string_agg("fullName" || ' in ' || cohort, ', ' ORDER BY "startDate")
      FILTER (WHERE first_name = '' OR lower(split_part(btrim("fullName"), ' ', 1)) <> first_name)
  INTO retaken, shared
  FROM others;

  IF retaken IS NOT NULL THEN
    note := 'Retaking FOF. Was in ' || retaken || '.';
  ELSIF shared IS NOT NULL THEN
    note := 'Same phone number as ' || shared || '. Check whether they''re the same person.';
  ELSE
    RETURN NEW;
  END IF;

  NEW.notes := CASE
    WHEN NEW.notes IS NULL OR btrim(NEW.notes) = '' THEN note
    ELSE note || E'\n' || NEW.notes
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_session_via_teen_number(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((public.app_session(p_token))."viaTeenNumber", FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.participant_summary(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  RETURN json_build_object(
    'optedIn', (SELECT a."aiOptInAt" IS NOT NULL FROM "ParticipantAccount" a WHERE a."participantId" = person_id),
    'unlocked', COALESCE((
      SELECT NOW() >= (max(public.week_class_date(c."startDate", w."weekNumber", w."classDate"))::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
      FROM "Cohort" c JOIN "Week" w ON w."cohortId" = c.id
      WHERE c.id = person."cohortId" AND c."startDate" IS NOT NULL
      GROUP BY c."startDate"
    ), FALSE),
    'summary', (
      SELECT json_build_object('text', s.summary, 'createdAt', s."createdAt")
      FROM "ReflectionSummary" s WHERE s."participantId" = person_id AND s."cohortId" = person."cohortId"
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_switch(p_token text, p_participant_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  v_me UUID := public.app_participant_id(p_token);
  new_token TEXT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF s."viaTeenNumber" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_participant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_number_people(v_me) f WHERE f.id = p_participant_id AND f.has_login
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF p_participant_id = v_me THEN
    RETURN json_build_object('token', p_token, 'user', public.participant_user_json(v_me));
  END IF;
  new_token := public.start_app_session(NULL, p_participant_id);
  UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = p_participant_id;
  DELETE FROM "AppSession" WHERE id = s.id;
  RETURN json_build_object('token', new_token, 'user', public.participant_user_json(p_participant_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_teen_info(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id UUID := public.app_participant_id(p_token);
  v_status TEXT;
  v_owner UUID;
  v_name TEXT;
  v_phone TEXT;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) IS NOT TRUE THEN
    RETURN json_build_object('isTeen', false);
  END IF;

  SELECT c."registrationStatus"::text, c."ownerId" INTO v_status, v_owner
  FROM "Participant" p
  JOIN "FollowUpContact" c ON c.id = p."followUpContactId"
  WHERE p.id = v_id;
  IF v_status IS NULL OR v_status NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
    RETURN json_build_object('isTeen', false);
  END IF;

  IF v_owner IS NOT NULL THEN
    SELECT u.name, CASE WHEN public.followup_phone_is_valid(u.phone) THEN u.phone END INTO v_name, v_phone
    FROM "User" u WHERE u.id = v_owner;
  END IF;

  RETURN json_build_object('isTeen', true, 'supportName', v_name, 'supportPhone', v_phone);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_testimonies(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  my_cohort_id UUID;
  my_group_id UUID;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT gp."groupId" INTO my_group_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'mine', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'title', t.title, 'body', t.body, 'visibility', t.visibility, 'status', t.status,
        'createdAt', t."createdAt", 'updatedAt', t."updatedAt"
      ) ORDER BY t."createdAt" DESC)
      FROM "Testimony" t WHERE t."participantId" = person_id
    ), '[]'::json),
    'feed', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'title', t.title, 'body', t.body, 'visibility', t.visibility,
        'participantName', split_part(p2."fullName", ' ', 1), 'avatarUrl', p2."avatarUrl",
        'createdAt', t."createdAt"
      ) ORDER BY t."createdAt" DESC)
      FROM "Testimony" t
      JOIN "Participant" p2 ON p2.id = t."participantId"
      WHERE t.status = 'APPROVED' AND t."participantId" <> person_id
        AND (
          (t.visibility = 'GROUP' AND my_group_id IS NOT NULL AND t."groupId" = my_group_id)
          OR (t.visibility = 'COHORT' AND t."cohortId" = my_cohort_id)
        )
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_theme(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_color TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT "themeColor" INTO v_color FROM "Participant" WHERE id = person_id;
  RETURN v_color;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_tick_intro(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL OR NOT EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL) THEN
    RAISE EXCEPTION 'SUPPORT_NOT_INTRODUCED';
  END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "introTickedAt")
  VALUES (v_me, now())
  ON CONFLICT ("participantId") DO UPDATE
    SET "introTickedAt" = COALESCE(public."ParticipantOnboarding"."introTickedAt", now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_user_json(p_participant_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'id', p.id,
    'participantId', p.id,
    'name', p."fullName",
    'email', p.email,
    'phone', p.phone,
    'role', 'PARTICIPANT',
    'isActive', a."isActive" AND p.status = 'ACTIVE',
    'mustChangePassword', a."mustChangePassword",
    'cohortId', p."cohortId",
    'cohortName', c.name,
    'createdAt', p."createdAt",
    'updatedAt', p."updatedAt"
  )
  FROM "Participant" p
  JOIN "ParticipantAccount" a ON a."participantId" = p.id
  LEFT JOIN "Cohort" c ON c.id = p."cohortId"
  WHERE p.id = p_participant_id;
$function$;

CREATE OR REPLACE FUNCTION public.participants_app_details()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', s."participantId",
      'device', s.device,
      'installedAt', s."installedAt",
      'lastOpenedInstalledAt', s."lastOpenedInstalledAt",
      'lastSeenAt', s."lastSeenAt"
    ))
    FROM "ParticipantAppState" s
    JOIN "Participant" p ON p.id = s."participantId"
    JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE c.status = 'ACTIVE'
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participants_signed_in(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    JOIN "Participant" p ON p.id = a."participantId"
    WHERE p."cohortId" = p_cohort_id
      AND a."isActive"
      AND a."passwordSetAt" IS NOT NULL
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participants_without_app()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    WHERE a."isActive"
      AND a."passwordSetAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "ParticipantAppState" s
        WHERE s."participantId" = a."participantId" AND s."installedAt" IS NOT NULL
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participants_without_push()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    WHERE a."isActive"
      AND NOT EXISTS (
        SELECT 1 FROM "ParticipantPushSubscription" s WHERE s."participantId" = a."participantId"
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.password_family_clash(p_user uuid, p_password text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."User" u
    JOIN public."Participant" p ON p.status = 'ACTIVE'
    JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive" AND a.password_hash IS NOT NULL
    WHERE u.id = p_user AND public.fof_phone_key(u.phone) IS NOT NULL
      AND (public.fof_phone_key(p.phone) = public.fof_phone_key(u.phone)
           OR EXISTS (SELECT 1 FROM public."ParticipantLoginPhone" l WHERE l."participantId" = p.id AND public.fof_phone_key(l.phone) = public.fof_phone_key(u.phone)))
      AND a.password_hash = crypt(p_password, a.password_hash))
$function$;

CREATE OR REPLACE FUNCTION public.password_staff_clash(p_participant uuid, p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u record;
  v_hit boolean := FALSE;
  v_match boolean;
BEGIN
  IF p_participant IS NULL OR p_password IS NULL THEN RETURN FALSE; END IF;
  FOR u IN
    SELECT DISTINCT s.id, s.password_hash FROM public."User" s
    WHERE s."isActive" IS NOT FALSE AND s.password_hash IS NOT NULL
      AND public.fof_phone_key(s.phone) IN (
        SELECT public.fof_phone_key(p.phone) FROM public."Participant" p WHERE p.id = p_participant
        UNION
        SELECT public.fof_phone_key(l.phone) FROM public."ParticipantLoginPhone" l
        WHERE l."participantId" = p_participant
           OR l."participantId" IN (SELECT f.id FROM public.shared_number_people(p_participant) f))
  LOOP
    PERFORM public.sign_in_guard('staff:' || u.id::text);
    v_match := CASE WHEN u.password_hash LIKE 'hashed_%' THEN substring(u.password_hash FROM 8) = p_password
                    ELSE u.password_hash = crypt(p_password, u.password_hash) END;
    IF v_match THEN v_hit := TRUE; ELSE PERFORM public.sign_in_record('staff:' || u.id::text, FALSE); END IF;
  END LOOP;
  RETURN v_hit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_delete_role(p_token text, p_role_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_system boolean;
  v_count integer;
BEGIN
  SELECT "isSystem" INTO v_system FROM "PermissionRole" WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;
  IF v_system THEN
    RAISE EXCEPTION 'ROLE_IS_SYSTEM';
  END IF;
  SELECT count(*) INTO v_count FROM "UserPermissionRole" WHERE "roleId" = p_role_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'ROLE_IN_USE:%', v_count;
  END IF;
  DELETE FROM "PermissionRole" WHERE id = p_role_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_list_roles(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor "User" := public.perm_require_admin(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(public.perm_role_json(r.id) ORDER BY r."isSystem" DESC, lower(r.name))
    FROM "PermissionRole" r
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_module_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT ARRAY['dashboard','schedule','planner','participants','groups','supports','hubs','cohorts','follow_ups',
  'feedback','surveys','corporate_prayers','birthdays','community','users','announcements','notifications','practice',
  'resources','website','settings']::text[] $function$;

CREATE OR REPLACE FUNCTION public.perm_require_admin(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF u.role <> 'ADMIN'::"Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_role_json(p_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'isSystem', r."isSystem",
    'memberCount', CASE WHEN r."isSystem"
      THEN (SELECT count(*) FROM "User" u WHERE u."isActive" IS NOT FALSE AND 'SUPPORT'::"Role" = ANY (public.app_user_roles(u)))
      ELSE (SELECT count(*) FROM "UserPermissionRole" up WHERE up."roleId" = r.id) END,
    'modules', COALESCE((
      SELECT json_agg(json_build_object('module', m.module, 'view', m."canView", 'add', m."canAdd", 'edit', m."canEdit", 'delete', m."canDelete") ORDER BY m.module)
      FROM "PermissionRoleModule" m WHERE m."roleId" = r.id
    ), '[]'::json)
  )
  FROM "PermissionRole" r WHERE r.id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.perm_save_role(p_token text, p_role_id uuid, p_name text, p_description text, p_modules jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_name text := NULLIF(trim(COALESCE(p_name, '')), '');
  v_id uuid := p_role_id;
  v_system boolean;
  m jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_modules, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Modules must be a list';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) LOOP
    IF (m->>'module') IS NULL OR NOT (m->>'module') = ANY (public.perm_module_keys()) THEN
      RAISE EXCEPTION 'Unknown module';
    END IF;
  END LOOP;

  IF v_id IS NULL THEN
    IF v_name IS NULL OR length(v_name) > 60 THEN
      RAISE EXCEPTION 'A role name is required (60 characters at most)';
    END IF;
    BEGIN
      INSERT INTO "PermissionRole" (name, description) VALUES (v_name, NULLIF(trim(COALESCE(p_description, '')), ''))
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'ROLE_NAME_TAKEN';
    END;
  ELSE
    SELECT "isSystem" INTO v_system FROM "PermissionRole" WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLE_NOT_FOUND';
    END IF;
    IF v_system THEN
      UPDATE "PermissionRole" SET "updatedAt" = NOW() WHERE id = v_id;
    ELSE
      IF v_name IS NULL OR length(v_name) > 60 THEN
        RAISE EXCEPTION 'A role name is required (60 characters at most)';
      END IF;
      BEGIN
        UPDATE "PermissionRole"
        SET name = v_name, description = NULLIF(trim(COALESCE(p_description, '')), ''), "updatedAt" = NOW()
        WHERE id = v_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ROLE_NAME_TAKEN';
      END;
    END IF;
  END IF;

  DELETE FROM "PermissionRoleModule" WHERE "roleId" = v_id;
  INSERT INTO "PermissionRoleModule" ("roleId", module, "canView", "canAdd", "canEdit", "canDelete")
  SELECT v_id, x.module,
         (x.v OR x.a OR x.e OR x.d), x.a, x.e, x.d
  FROM (
    SELECT e->>'module' AS module,
           COALESCE((e->>'view')::boolean, FALSE) AS v,
           COALESCE((e->>'add')::boolean, FALSE) AS a,
           COALESCE((e->>'edit')::boolean, FALSE) AS e,
           COALESCE((e->>'delete')::boolean, FALSE) AS d
    FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) e
  ) x
  WHERE (x.v OR x.a OR x.e OR x.d)
  ON CONFLICT ("roleId", module) DO UPDATE
    SET "canView" = EXCLUDED."canView", "canAdd" = EXCLUDED."canAdd", "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete";

  RETURN public.perm_role_json(v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_set_user_roles(p_token text, p_user_id uuid, p_role_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_ids uuid[] := COALESCE(p_role_ids, '{}'::uuid[]);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) i
    WHERE NOT EXISTS (SELECT 1 FROM "PermissionRole" r WHERE r.id = i AND NOT r."isSystem")
  ) THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  DELETE FROM "UserPermissionRole" WHERE "userId" = p_user_id;
  INSERT INTO "UserPermissionRole" ("userId", "roleId") SELECT p_user_id, i FROM unnest(v_ids) i ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_user_assignments(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor "User" := public.perm_require_admin(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object('userId', t."userId", 'roleIds', t.ids))
    FROM (SELECT up."userId", json_agg(up."roleId") AS ids FROM "UserPermissionRole" up GROUP BY up."userId") t
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_delete_event(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  DELETE FROM "ChurchEvent" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_pull_forward(p_token text, p_cohort_id uuid, p_dates jsonb, p_apply boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  c "Cohort";
  w RECORD;
  item JSONB;
  v_new DATE;
  v_prev DATE;
  v_old_last DATE;
  v_new_last DATE;
  v_old_end DATE;
  v_new_end DATE;
  v_usual_end DATE;
  v_new_start DATE;
  v_first_week INTEGER;
  v_moves JSONB := '[]'::jsonb;
  v_week_ids INTEGER[] := '{}';
  v_week_final DATE[] := '{}';
  v_before JSONB;
  v_after JSONB;
  v_change_id UUID;
  v_summary TEXT;
  i INTEGER;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO c FROM "Cohort" WHERE id = p_cohort_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'That cohort was not found';
  END IF;
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;
  IF p_dates IS NULL OR jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) = 0 THEN
    RAISE EXCEPTION 'No class dates were given';
  END IF;

  SELECT min("weekNumber") INTO v_first_week FROM "Week" WHERE "cohortId" = c.id;
  IF v_first_week IS NULL THEN
    RAISE EXCEPTION 'This cohort has no classes';
  END IF;

  -- Every week's final date, in class order: the given date, or where it is now.
  v_prev := NULL;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id ORDER BY "weekNumber"
  LOOP
    v_new := w.dt;
    FOR item IN SELECT * FROM jsonb_array_elements(p_dates) LOOP
      IF (item->>'weekId')::int = w.id THEN
        v_new := (item->>'date')::date;
      END IF;
    END LOOP;

    IF v_new <> w.dt THEN
      IF EXTRACT(DOW FROM v_new) <> 0 THEN
        RAISE EXCEPTION 'Class % must be on a Sunday', w."weekNumber";
      END IF;
      IF w.dt < v_today THEN
        RAISE EXCEPTION 'Class % has already happened', w."weekNumber";
      END IF;
      IF v_new > w.dt THEN
        RAISE EXCEPTION 'Class % can only move earlier here', w."weekNumber";
      END IF;
      IF v_new < v_today THEN
        RAISE EXCEPTION 'Class % can''t be moved to a day that has passed', w."weekNumber";
      END IF;
      v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', v_new);
    END IF;
    IF v_prev IS NOT NULL AND v_new <= v_prev THEN
      RAISE EXCEPTION 'Class % must come after class %', w."weekNumber", w."weekNumber" - 1;
    END IF;
    v_prev := v_new;

    v_week_ids := v_week_ids || w.id;
    v_week_final := v_week_final || v_new;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_dates) e
    WHERE NOT ((e->>'weekId')::int = ANY(v_week_ids))
  ) THEN
    RAISE EXCEPTION 'One of those classes doesn''t belong to this cohort';
  END IF;

  SELECT max(public.week_class_date(c."startDate", "weekNumber", "classDate")) INTO v_old_last
  FROM "Week" WHERE "cohortId" = c.id;
  v_new_last := v_week_final[array_length(v_week_final, 1)];
  v_new_start := CASE
    WHEN EXISTS (SELECT 1 FROM "Week" WHERE id = v_week_ids[1] AND "weekNumber" = v_first_week)
      THEN v_week_final[1] ELSE c."startDate" END;

  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  -- Pulling forward gives back the weeks it recovers, but never shrinks the
  -- cycle below its usual finish: first class + (classes - 1 + 1 spare) weeks.
  v_usual_end := v_week_final[1] + 7 * array_length(v_week_final, 1);
  v_new_end := LEAST(v_old_end, GREATEST(v_new_last, v_usual_end, v_old_end - (v_old_last - v_new_last)));

  IF p_apply AND jsonb_array_length(v_moves) > 0 THEN
    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_before;

    UPDATE "Cohort" SET "startDate" = v_new_start, "endDate" = v_new_end WHERE id = c.id;
    FOR i IN 1 .. array_length(v_week_ids, 1) LOOP
      UPDATE "Week"
      SET "classDate" = CASE
        WHEN v_week_final[i] = v_new_start + ("weekNumber" - 1) * 7 THEN NULL
        ELSE v_week_final[i]
      END
      WHERE id = v_week_ids[i];
    END LOOP;

    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_after;

    v_summary := format('Pulled %s''s classes forward into freed Sundays', c.name);
    INSERT INTO "PlannerChange" (summary, "cohortId", "before", "after", "createdById")
    VALUES (v_summary, c.id, v_before, v_after, actor.id)
    RETURNING id INTO v_change_id;
  END IF;

  RETURN json_build_object(
    'cohortId', c.id,
    'cohortName', c.name,
    'moves', v_moves,
    'endBefore', v_old_end,
    'endAfter', v_new_end,
    'applied', p_apply AND jsonb_array_length(v_moves) > 0,
    'changeId', v_change_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_push_back(p_token text, p_week_id integer, p_event_id uuid, p_apply boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  wk "Week";
  c "Cohort";
  d "Cohort";
  w RECORD;
  v_from DATE;
  v_next DATE;
  v_old_last DATE;
  v_new_last DATE;
  v_old_end DATE;
  v_new_end DATE;
  v_first_week INTEGER;
  v_new_start DATE;
  v_prev_end DATE;
  v_d_first DATE;
  v_d_last DATE;
  v_shift INTEGER;
  v_moves JSONB := '[]'::jsonb;
  v_later JSONB := '[]'::jsonb;
  -- Rows to write: weeks (id → new classDate) and cohorts (id → new start/end).
  v_week_ids INTEGER[] := '{}';
  v_week_new DATE[] := '{}';
  v_cohort_ids UUID[] := '{}';
  v_cohort_start DATE[] := '{}';
  v_cohort_end DATE[] := '{}';
  v_before JSONB;
  v_after JSONB;
  v_change_id UUID;
  v_summary TEXT;
  i INTEGER;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO wk FROM "Week" WHERE id = p_week_id;
  IF wk.id IS NULL THEN
    RAISE EXCEPTION 'That class was not found';
  END IF;
  -- Serialize applies to the same cohort, then re-read dates after acquiring the lock.
  IF p_apply THEN
    SELECT * INTO c FROM "Cohort" WHERE id = wk."cohortId" FOR UPDATE;
    SELECT * INTO wk FROM "Week" WHERE id = p_week_id;
  ELSE
    SELECT * INTO c FROM "Cohort" WHERE id = wk."cohortId";
  END IF;
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;

  v_from := public.week_class_date(c."startDate", wk."weekNumber", wk."classDate");
  IF v_from < v_today THEN
    RAISE EXCEPTION 'That class has already happened';
  END IF;

  IF p_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ChurchEvent" e WHERE e.id = p_event_id AND e."stopsFof"
      AND v_from BETWEEN e."startDate" AND e."endDate"
  ) THEN
    RAISE EXCEPTION 'This class no longer clashes with that event. Refresh the planner.';
  END IF;

  SELECT min("weekNumber"), max(public.week_class_date(c."startDate", "weekNumber", "classDate"))
  INTO v_first_week, v_old_last
  FROM "Week" WHERE "cohortId" = c.id;

  -- Keep existing later dates when they still fit. Move only collisions, and
  -- skip every blocked Sunday by its calendar date; never shift an old gap.
  v_next := v_from + 7;
  v_new_last := v_old_last;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id AND "weekNumber" >= wk."weekNumber"
    ORDER BY "weekNumber"
  LOOP
    v_next := GREATEST(v_next, w.dt);
    WHILE EXISTS (
      SELECT 1 FROM "ChurchEvent" e WHERE e."stopsFof"
        AND v_next BETWEEN e."startDate" AND e."endDate"
    ) LOOP
      v_next := v_next + 7;
    END LOOP;
    IF v_next <> w.dt THEN
      v_week_ids := v_week_ids || w.id;
      v_week_new := v_week_new || v_next;
      v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', v_next);
    END IF;
    v_new_last := GREATEST(v_new_last, v_next);
    v_next := v_next + 7;
  END LOOP;

  -- 2. The spare week takes the first shift; after that the end date moves.
  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  v_new_end := GREATEST(v_old_end, v_new_last);
  v_new_start := CASE WHEN wk."weekNumber" <= v_first_week THEN c."startDate" + (v_week_new[1] - v_from) ELSE c."startDate" END;
  v_cohort_ids := v_cohort_ids || c.id;
  v_cohort_start := v_cohort_start || v_new_start;
  v_cohort_end := v_cohort_end || v_new_end;

  -- 3. Later cohorts whose rest would start on or before the new end move back
  --    in whole weeks, and so on down the line. Test cohorts ("ZZ…") are left alone.
  v_prev_end := v_new_end;
  FOR d IN
    SELECT * FROM "Cohort"
    WHERE "startDate" IS NOT NULL AND "startDate" > c."startDate" AND id <> c.id AND name !~* '^\s*zz'
    ORDER BY "startDate"
  LOOP
    SELECT min(public.week_class_date(d."startDate", "weekNumber", "classDate")),
           max(public.week_class_date(d."startDate", "weekNumber", "classDate"))
    INTO v_d_first, v_d_last
    FROM "Week" WHERE "cohortId" = d.id;
    v_d_first := COALESCE(v_d_first, d."startDate");
    v_d_last := COALESCE(v_d_last, d."startDate" + 63);
    -- Rest starts 3 + 3 weeks and 6 days before the first class Sunday.
    EXIT WHEN v_d_first - 48 > v_prev_end;
    v_shift := CEIL((v_prev_end - (v_d_first - 48) + 1) / 7.0)::int * 7;

    FOR w IN SELECT id, "weekNumber", "classDate" FROM "Week" WHERE "cohortId" = d.id AND "classDate" IS NOT NULL LOOP
      v_week_ids := v_week_ids || w.id;
      v_week_new := v_week_new || (w."classDate" + v_shift);
    END LOOP;
    v_cohort_ids := v_cohort_ids || d.id;
    v_cohort_start := v_cohort_start || (d."startDate" + v_shift);
    v_cohort_end := v_cohort_end || (GREATEST(COALESCE(d."endDate", v_d_last + 7), v_d_last) + v_shift);
    v_later := v_later || jsonb_build_object(
      'cohortId', d.id, 'name', d.name, 'shiftDays', v_shift,
      'firstClassBefore', v_d_first, 'firstClassAfter', v_d_first + v_shift
    );
    v_prev_end := GREATEST(COALESCE(d."endDate", v_d_last + 7), v_d_last) + v_shift;
  END LOOP;

  IF p_apply THEN
    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = ANY(v_cohort_ids)), '[]'::jsonb)
    ) INTO v_before;

    FOR i IN 1 .. COALESCE(array_length(v_week_ids, 1), 0) LOOP
      UPDATE "Week" SET "classDate" = v_week_new[i] WHERE id = v_week_ids[i];
    END LOOP;
    FOR i IN 1 .. array_length(v_cohort_ids, 1) LOOP
      UPDATE "Cohort" SET "startDate" = v_cohort_start[i], "endDate" = v_cohort_end[i] WHERE id = v_cohort_ids[i];
    END LOOP;

    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = ANY(v_cohort_ids)), '[]'::jsonb)
    ) INTO v_after;

    v_summary := format('Rescheduled %s from class %s around blocked Sundays%s',
      c.name, wk."weekNumber",
      CASE WHEN jsonb_array_length(v_later) > 0 THEN ' (later cohorts moved too)' ELSE '' END);
    INSERT INTO "PlannerChange" (summary, "eventId", "cohortId", "before", "after", "createdById")
    VALUES (v_summary, p_event_id, c.id, v_before, v_after, actor.id)
    RETURNING id INTO v_change_id;
  END IF;

  RETURN json_build_object(
    'cohortId', c.id,
    'cohortName', c.name,
    'weekNumber', wk."weekNumber",
    'classDate', v_from,
    'moves', v_moves,
    'endBefore', v_old_end,
    'endAfter', v_new_end,
    'spareWeeksBefore', GREATEST(0, (v_old_end - v_old_last) / 7),
    'spareWeeksAfter', GREATEST(0, (v_new_end - v_new_last) / 7),
    'laterCohorts', v_later,
    'applied', p_apply,
    'changeId', v_change_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_save_event(p_token text, p_id uuid, p_name text, p_start date, p_end date, p_stops_fof boolean)
 RETURNS "ChurchEvent"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  saved "ChurchEvent";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Give the event a name';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'The end date can''t be before the start date';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO "ChurchEvent" (name, "startDate", "endDate", "stopsFof", "createdById")
    VALUES (btrim(p_name), p_start, p_end, COALESCE(p_stops_fof, FALSE), actor.id)
    RETURNING * INTO saved;
  ELSE
    UPDATE "ChurchEvent"
    SET name = btrim(p_name), "startDate" = p_start, "endDate" = p_end,
        "stopsFof" = COALESCE(p_stops_fof, FALSE), "updatedAt" = NOW()
    WHERE id = p_id
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'That event no longer exists';
    END IF;
  END IF;
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_set_class_dates(p_token text, p_cohort_id uuid, p_dates jsonb, p_apply boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  c "Cohort";
  w RECORD;
  item JSONB;
  v_new DATE;
  v_prev DATE;
  v_old_last DATE;
  v_new_last DATE;
  v_old_end DATE;
  v_new_end DATE;
  v_new_start DATE;
  v_first_week INTEGER;
  v_moves JSONB := '[]'::jsonb;
  v_week_ids INTEGER[] := '{}';
  v_week_final DATE[] := '{}';
  v_before JSONB;
  v_after JSONB;
  v_change_id UUID;
  v_summary TEXT;
  i INTEGER;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO c FROM "Cohort" WHERE id = p_cohort_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'That cohort was not found';
  END IF;
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;
  IF p_dates IS NULL OR jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) = 0 THEN
    RAISE EXCEPTION 'No class dates were given';
  END IF;

  SELECT min("weekNumber") INTO v_first_week FROM "Week" WHERE "cohortId" = c.id;
  IF v_first_week IS NULL THEN
    RAISE EXCEPTION 'This cohort has no classes';
  END IF;

  -- Every week's final date, in class order: the given date, or where it is now.
  v_prev := NULL;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id ORDER BY "weekNumber"
  LOOP
    v_new := w.dt;
    FOR item IN SELECT * FROM jsonb_array_elements(p_dates) LOOP
      IF (item->>'weekId')::int = w.id THEN
        v_new := (item->>'date')::date;
      END IF;
    END LOOP;

    IF v_new <> w.dt THEN
      IF EXTRACT(DOW FROM v_new) <> 0 THEN
        RAISE EXCEPTION 'Class % must be on a Sunday', w."weekNumber";
      END IF;
      IF w.dt < v_today THEN
        RAISE EXCEPTION 'Class % has already happened', w."weekNumber";
      END IF;
      IF v_new < v_today THEN
        RAISE EXCEPTION 'Class % can''t be moved to a day that has passed', w."weekNumber";
      END IF;
      v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', v_new);
    END IF;
    IF v_prev IS NOT NULL AND v_new <= v_prev THEN
      RAISE EXCEPTION 'Class % must come after class %', w."weekNumber", w."weekNumber" - 1;
    END IF;
    v_prev := v_new;

    v_week_ids := v_week_ids || w.id;
    v_week_final := v_week_final || v_new;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_dates) e
    WHERE NOT ((e->>'weekId')::int = ANY(v_week_ids))
  ) THEN
    RAISE EXCEPTION 'One of those classes doesn''t belong to this cohort';
  END IF;

  SELECT max(public.week_class_date(c."startDate", "weekNumber", "classDate")) INTO v_old_last
  FROM "Week" WHERE "cohortId" = c.id;
  v_new_last := v_week_final[array_length(v_week_final, 1)];
  v_new_start := CASE
    WHEN EXISTS (SELECT 1 FROM "Week" WHERE id = v_week_ids[1] AND "weekNumber" = v_first_week)
      THEN v_week_final[1] ELSE c."startDate" END;

  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  v_new_end := CASE
    WHEN v_old_end <= v_old_last + 7 THEN v_new_last + 7
    ELSE v_old_end + (v_new_last - v_old_last)
  END;

  IF p_apply AND jsonb_array_length(v_moves) > 0 THEN
    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_before;

    UPDATE "Cohort" SET "startDate" = v_new_start, "endDate" = v_new_end WHERE id = c.id;
    FOR i IN 1 .. array_length(v_week_ids, 1) LOOP
      UPDATE "Week"
      SET "classDate" = CASE
        WHEN v_week_final[i] = v_new_start + ("weekNumber" - 1) * 7 THEN NULL
        ELSE v_week_final[i]
      END
      WHERE id = v_week_ids[i];
    END LOOP;

    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_after;

    v_summary := format('Class dates changed for %s', c.name);
    INSERT INTO "PlannerChange" (summary, "cohortId", "before", "after", "createdById")
    VALUES (v_summary, c.id, v_before, v_after, actor.id)
    RETURNING id INTO v_change_id;
  END IF;

  RETURN json_build_object(
    'cohortId', c.id,
    'cohortName', c.name,
    'moves', v_moves,
    'endBefore', v_old_end,
    'endAfter', v_new_end,
    'applied', p_apply AND jsonb_array_length(v_moves) > 0,
    'changeId', v_change_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_set_planned_dates(p_token text, p_name text, p_dates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_current JSONB;
  v_prev DATE;
  v_d DATE;
  e JSONB;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'That planned cohort has no name';
  END IF;

  SELECT value INTO v_current FROM "AppSetting" WHERE "settingKey" = 'planner_planned_dates';
  IF v_current IS NULL OR jsonb_typeof(v_current) <> 'object' THEN
    v_current := '{}'::jsonb;
  END IF;

  IF p_dates IS NULL OR jsonb_typeof(p_dates) = 'null' THEN
    v_current := v_current - btrim(p_name);
  ELSE
    IF jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) <> 10 THEN
      RAISE EXCEPTION 'A cohort needs 10 class dates';
    END IF;
    v_prev := NULL;
    FOR e IN SELECT * FROM jsonb_array_elements(p_dates) LOOP
      v_d := (e #>> '{}')::date;
      IF EXTRACT(DOW FROM v_d) <> 0 THEN
        RAISE EXCEPTION 'Every class must be on a Sunday';
      END IF;
      IF v_prev IS NOT NULL AND v_d <= v_prev THEN
        RAISE EXCEPTION 'Class dates must be in order';
      END IF;
      v_prev := v_d;
    END LOOP;
    v_current := jsonb_set(v_current, ARRAY[btrim(p_name)], p_dates, TRUE);
  END IF;

  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt")
  VALUES ('planner_planned_dates', v_current, NOW())
  ON CONFLICT ("settingKey") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.planner_undo_change(p_token text, p_change_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  ch "PlannerChange";
  item JSONB;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO ch FROM "PlannerChange" WHERE id = p_change_id FOR UPDATE;
  IF ch.id IS NULL OR ch."undoneAt" IS NOT NULL THEN
    RAISE EXCEPTION 'That change has already been undone';
  END IF;
  IF EXISTS (SELECT 1 FROM "PlannerChange" WHERE "undoneAt" IS NULL AND "createdAt" > ch."createdAt") THEN
    RAISE EXCEPTION 'Only the latest change can be undone';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ch."after"->'weeks') LOOP
    IF (SELECT "classDate" FROM "Week" WHERE id = (item->>'id')::int) IS DISTINCT FROM (item->>'classDate')::date THEN
      RAISE EXCEPTION 'Class dates have changed since, so this can''t be undone safely';
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(ch."after"->'cohorts') LOOP
    IF (SELECT ROW("startDate", "endDate") FROM "Cohort" WHERE id = (item->>'id')::uuid)
       IS DISTINCT FROM ROW((item->>'startDate')::date, (item->>'endDate')::date) THEN
      RAISE EXCEPTION 'Cohort dates have changed since, so this can''t be undone safely';
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(ch."before"->'weeks') LOOP
    UPDATE "Week" SET "classDate" = (item->>'classDate')::date WHERE id = (item->>'id')::int;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(ch."before"->'cohorts') LOOP
    UPDATE "Cohort" SET "startDate" = (item->>'startDate')::date, "endDate" = (item->>'endDate')::date
    WHERE id = (item->>'id')::uuid;
  END LOOP;

  UPDATE "PlannerChange" SET "undoneAt" = NOW(), "undoneById" = actor.id WHERE id = ch.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_cohort_checkups_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  c RECORD;
  k RECORD;
  v_start DATE;
  v_group UUID;
  v_label TEXT := 'Check-up: check in with each person from your group and note how they are doing';
  v_leaders UUID[];
  v_added INTEGER;
  v_done JSONB := '[]'::jsonb;
  v_next DATE;
BEGIN
  -- 1. The task, for a cohort whose rest week 3 is this week.
  FOR c IN
    SELECT co.id, co.name FROM public."Cohort" co
    WHERE co.status <> 'ARCHIVED' AND public.api_real_cohort(co.id)
      AND NOT EXISTS (SELECT 1 FROM public."CohortCheckup" x WHERE x."cohortId" = co.id)
  LOOP
    v_start := public.checkup_rest_week3(c.id);
    CONTINUE WHEN v_start IS NULL OR v_today NOT BETWEEN v_start AND v_start + 13;

    SELECT array_agg(DISTINCT u.id) INTO v_leaders
    FROM public."Group" g JOIN public."User" u ON u.id = g."supportId"
    WHERE g."cohortId" = c.id AND g."archivedAt" IS NULL
      AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
      AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles));
    -- No group leader yet (groups unassigned, or only test supports): try again tomorrow.
    CONTINUE WHEN v_leaders IS NULL;

    v_group := gen_random_uuid();
    INSERT INTO public."SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDate")
    SELECT uid, NULL, c.id, v_label, FALSE,
           COALESCE((SELECT MAX(i.position) + 1 FROM public."SupportChecklistItem" i
                     WHERE i."userId" = uid AND i."weekId" IS NULL AND i."cohortId" = c.id), 0),
           NULL, v_group, GREATEST(v_start + 6, v_today + 2)
    FROM unnest(COALESCE(v_leaders, '{}')) AS uid
    ON CONFLICT ("userId", "cohortId", label, "dueDate") WHERE "weekId" IS NULL DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;

    INSERT INTO public."CohortCheckup" ("cohortId", "taskGroupId", "restWeek3Start", "supports")
    VALUES (c.id, v_group, v_start, cardinality(v_leaders));

    PERFORM public.fof_notify(v_leaders, 'Check-up on your group',
      format('%s has finished. This week, check in with each person from your group and tick the task when done (due %s).',
             c.name, to_char(GREATEST(v_start + 6, v_today + 2), 'FMDay FMDD Mon')),
      '/support/schedule?tab=checklist&rest=1', 'CHECKUP');
    PERFORM public.fof_notify((SELECT array_agg(id) FROM public.module_viewers('schedule') AS id), 'Check-up tasks given',
      format('%s %s from %s %s a check-up task due %s. See who has done it in Schedule, Add task for supports.',
             cardinality(v_leaders), CASE WHEN cardinality(v_leaders) = 1 THEN 'support' ELSE 'supports' END, c.name,
             CASE WHEN cardinality(v_leaders) = 1 THEN 'has' ELSE 'have' END, to_char(GREATEST(v_start + 6, v_today + 2), 'FMDay FMDD Mon')),
      '/schedule', 'CHECKUP');
    v_done := v_done || jsonb_build_object('cohort', c.name, 'task', v_added);
  END LOOP;

  -- 2. Monthly reminders: 1, 2 and 3 months after rest week 3 began, each sent at most a week late.
  FOR k IN
    SELECT x.*, co.name FROM public."CohortCheckup" x JOIN public."Cohort" co ON co.id = x."cohortId"
    WHERE x."remindersSent" < 3 AND co.status <> 'ARCHIVED'
  LOOP
    v_next := (k."restWeek3Start" + make_interval(months => k."remindersSent" + 1))::date;
    CONTINUE WHEN v_today < v_next;
    IF v_today <= v_next + 6 THEN
      SELECT array_agg(DISTINCT u.id) INTO v_leaders
      FROM public."Group" g JOIN public."User" u ON u.id = g."supportId"
      WHERE g."cohortId" = k."cohortId" AND g."archivedAt" IS NULL
        AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles));
      IF v_leaders IS NOT NULL THEN
        PERFORM public.fof_notify(v_leaders, 'Monthly check-up',
          format('Check-up %s of 3 for your %s group: send each person a message or call this week to see how they are doing.',
                 k."remindersSent" + 1, k.name),
          '/support/schedule?tab=checklist', 'CHECKUP');
        v_done := v_done || jsonb_build_object('cohort', k.name, 'reminder', k."remindersSent" + 1, 'supports', cardinality(v_leaders));
      END IF;
    END IF;
    -- A reminder more than a week late is counted as passed, so the next one keeps its own date.
    UPDATE public."CohortCheckup" SET "remindersSent" = "remindersSent" + 1, "lastReminderAt" = NOW() WHERE "cohortId" = k."cohortId";
  END LOOP;

  RETURN v_done;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_hub_message(p_hub_id uuid, p_subject text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_subject TEXT;
  v_body TEXT;
  v_label TEXT;
  v_message public."HubMessage";
  v_member_ids UUID[];
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to message a hub';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT public.app_hub_can(p_hub_id, 'MESSAGE') THEN
      RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can message it';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id) THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  INSERT INTO public."HubMessage" ("hubId", "authorId", subject, body)
  VALUES (p_hub_id, v_actor_id, v_subject, v_body)
  RETURNING * INTO v_message;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id AND "leadUserId" = v_actor_id) THEN 'Hub Lead'
    WHEN EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id AND "assistantLeadUserId" = v_actor_id) THEN 'Assistant Hub Lead'
    ELSE 'Admin'
  END INTO v_label;

  SELECT array_agg("userId") INTO v_member_ids
  FROM public."HubMembership"
  WHERE "hubId" = p_hub_id AND "userId" <> v_actor_id;

  IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
    PERFORM public.invoke_hub_message_push(v_member_ids, v_label || ' · ' || v_subject, v_body);
  END IF;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body, 'createdAt', v_message."createdAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_active_peers()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'fromName', f.name, 'toName', t.name, 'fromRole', pp."fromRole", 'toRole', pp."toRole", 'status', pp.status) ORDER BY pp."createdAt")
    FROM public."PracticePeer" pp JOIN public."User" f ON f.id = pp."fromUserId" JOIN public."User" t ON t.id = pp."toUserId"
    WHERE pp.status IN ('ACTIVE', 'PENDING') AND pp."createdAt" > NOW() - INTERVAL '1 day'), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_apply_calendar(p_cohort uuid, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
  v_first DATE;
  v_mode TEXT := COALESCE(NULLIF(p_mode, ''), 'CLASS_DAY');
BEGIN
  IF v_mode NOT IN ('BEFORE', 'CLASS_DAY', 'MID_WEEK', 'WEEK_2') THEN
    RAISE EXCEPTION 'Unknown calendar choice';
  END IF;
  v_first := CASE v_mode
    WHEN 'BEFORE' THEN v_today + 3
    WHEN 'CLASS_DAY' THEN v_today
    WHEN 'MID_WEEK' THEN v_today - 3
    ELSE v_today - 7
  END;
  UPDATE public."Cohort" SET "startDate" = v_first, "endDate" = v_first + 28, "practiceCalendar" = v_mode, "updatedAt" = NOW() WHERE id = p_cohort;
  UPDATE public."Week" SET "classDate" = v_first + ("weekNumber" - 1) * 7, "shareWithParticipants" = TRUE WHERE "cohortId" = p_cohort;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_autotick_participant(p_pid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  SELECT "respondedAt" INTO v_since FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND "participantId" = p_pid ORDER BY "respondedAt" DESC LIMIT 1;
  WITH
  post AS (SELECT min("createdAt") AS ts FROM public."GroupPost" WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL),
  peer_post AS (
    SELECT min("createdAt") AS ts FROM public."GroupPost"
     WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL
       AND v_since IS NOT NULL AND "createdAt" >= v_since
  ),
  engage AS (
    SELECT min(ts) AS ts FROM (
      SELECT "createdAt" AS ts FROM public."GroupPostLike" WHERE "participantId" = p_pid
      UNION ALL SELECT "createdAt" FROM public."GroupPostReply" WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL
    ) x
  ),
  refl AS (SELECT min("createdAt") AS ts FROM public."Reflection" WHERE "participantId" = p_pid),
  pw AS (SELECT "passwordSetAt" AS ts FROM public."ParticipantAccount" WHERE "participantId" = p_pid AND NOT "mustChangePassword"),
  prof AS (SELECT "updatedAt" AS ts FROM public."Participant" WHERE id = p_pid AND ("occupation" IS NOT NULL OR "dateOfBirth" IS NOT NULL)),
  d(key, ts) AS (
    SELECT 'pt-signin', COALESCE((SELECT ts FROM pw), CASE WHEN EXISTS (SELECT 1 FROM pw) THEN NOW() END)
    UNION ALL SELECT 'pt-profile', ts FROM prof
    UNION ALL SELECT 'pt-intro', ts FROM post
    UNION ALL SELECT 'peer-PARTICIPANT-2', ts FROM peer_post
    UNION ALL SELECT 'pt-discuss', ts FROM engage
    UNION ALL SELECT 'pt-reflect', ts FROM refl
  )
  INSERT INTO public."PracticeProgress" ("participantId", "scenarioKey", "doneAt")
  SELECT p_pid, d.key, d.ts FROM d
   WHERE d.ts IS NOT NULL
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_autotick_staff(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := (SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1);
  v_since TIMESTAMPTZ;
  v_reset TIMESTAMPTZ;
BEGIN
  IF v_c IS NULL THEN
    RETURN;
  END IF;
  -- resetAt is also advanced by seat changes. Preserve that cutoff: already
  -- completed shared sup-* rows remain intact on conflict, while absent rows
  -- can only be filled by qualifying activity after the cutoff.
  SELECT "resetAt" INTO v_reset FROM public."PracticeMember" WHERE "userId" = p_user;
  SELECT "respondedAt" INTO v_since FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND p_user IN ("fromUserId", "toUserId")
   ORDER BY "respondedAt" DESC LIMIT 1;
  WITH
  posts AS (
    SELECT gp."createdAt" AS ts, row_number() OVER (ORDER BY gp."createdAt") AS n
    FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."authorUserId" = p_user AND gp."deletedAt" IS NULL
  ),
  att AS (
    SELECT min(r."markedAt") AS ts FROM public."AttendanceRecord" r JOIN public."Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = v_c AND r."markedById" = p_user
      AND (v_reset IS NULL OR r."markedAt" > v_reset)
  ),
  pin AS (
    SELECT min(gp."pinnedAt") AS ts FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."pinnedById" = p_user
      AND (v_reset IS NULL OR gp."pinnedAt" > v_reset)
  ),
  reply AS (
    SELECT min(rp."createdAt") AS ts FROM public."GroupPostReply" rp
    JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND rp."authorUserId" = p_user AND rp."deletedAt" IS NULL
      AND (v_reset IS NULL OR rp."createdAt" > v_reset)
      AND v_since IS NOT NULL AND rp."createdAt" >= v_since
  ),
  hubatt AS (
    SELECT min(a."markedAt") AS ts FROM public."SupportSessionAttendance" a JOIN public."SupportSession" s ON s.id = a."sessionId"
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND a."markedById" = p_user
      AND (v_reset IS NULL OR a."markedAt" > v_reset)
  ),
  hubdone AS (
    SELECT min(s."submittedAt") AS ts FROM public."SupportSession" s
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND s."submittedById" = p_user
      AND (v_reset IS NULL OR s."submittedAt" > v_reset)
  ),
  hubmsg AS (
    SELECT min(m."createdAt") AS ts FROM public."HubMessage" m JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND m."authorId" = p_user
      AND (v_reset IS NULL OR m."createdAt" > v_reset)
  ),
  hubread AS (
    SELECT min(a."createdAt") AS ts FROM public."HubMessageAck" a
    JOIN public."HubMessage" m ON m.id = a."messageId" JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND a."userId" = p_user
      AND (v_reset IS NULL OR a."createdAt" > v_reset)
  ),
  prayfocus AS (
    SELECT min(s."prayerFocusSetAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFocusSetAt" > v_reset)
  ),
  prayfin AS (
    SELECT min(s."prayerFinishedAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFinishedAt" > v_reset)
  ),
  -- Peer events are filtered individually before their minima are computed;
  -- an old reply/message cannot hide a later event from the active walkthrough.
  peer_pin AS (
    SELECT min(gp."pinnedAt") AS ts FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."pinnedById" = p_user
      AND (v_reset IS NULL OR gp."pinnedAt" > v_reset)
      AND v_since IS NOT NULL AND gp."pinnedAt" >= v_since
  ),
  peer_att AS (
    SELECT min(r."markedAt") AS ts FROM public."AttendanceRecord" r JOIN public."Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = v_c AND r."markedById" = p_user
      AND (v_reset IS NULL OR r."markedAt" > v_reset)
      AND v_since IS NOT NULL AND r."markedAt" >= v_since
  ),
  peer_hubatt AS (
    SELECT min(a."markedAt") AS ts FROM public."SupportSessionAttendance" a JOIN public."SupportSession" s ON s.id = a."sessionId"
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND a."markedById" = p_user
      AND (v_reset IS NULL OR a."markedAt" > v_reset)
      AND v_since IS NOT NULL AND a."markedAt" >= v_since
  ),
  peer_hubdone AS (
    SELECT min(s."submittedAt") AS ts FROM public."SupportSession" s
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND s."submittedById" = p_user
      AND (v_reset IS NULL OR s."submittedAt" > v_reset)
      AND v_since IS NOT NULL AND s."submittedAt" >= v_since
  ),
  peer_hubmsg AS (
    SELECT min(m."createdAt") AS ts FROM public."HubMessage" m JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND m."authorId" = p_user
      AND (v_reset IS NULL OR m."createdAt" > v_reset)
      AND v_since IS NOT NULL AND m."createdAt" >= v_since
  ),
  peer_hubread AS (
    SELECT min(a."createdAt") AS ts FROM public."HubMessageAck" a
    JOIN public."HubMessage" m ON m.id = a."messageId" JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND a."userId" = p_user
      AND (v_reset IS NULL OR a."createdAt" > v_reset)
      AND v_since IS NOT NULL AND a."createdAt" >= v_since
  ),
  peer_focus AS (
    SELECT min(s."prayerFocusSetAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFocusSetAt" > v_reset)
      AND v_since IS NOT NULL AND s."prayerFocusSetAt" >= v_since
  ),
  d(key, ts) AS (
    SELECT 'sup-intro', (SELECT ts FROM posts WHERE n = 1 AND (v_reset IS NULL OR ts > v_reset))
    UNION ALL SELECT 'sup-post', (SELECT min(ts) FROM posts WHERE n >= 2 AND (v_reset IS NULL OR ts > v_reset))
    UNION ALL SELECT 'sup-attendance', ts FROM att
    UNION ALL SELECT 'sup-pin', ts FROM pin
    UNION ALL SELECT 'peer-SUPPORT-1', ts FROM reply
    UNION ALL SELECT 'peer-SUPPORT-2', ts FROM peer_pin
    UNION ALL SELECT 'peer-SUPPORT-3', ts FROM peer_att
    UNION ALL SELECT 'hl-attendance', ts FROM hubatt
    UNION ALL SELECT 'as-attendance', ts FROM hubatt
    UNION ALL SELECT 'peer-ASSISTANT-2', ts FROM peer_hubatt
    UNION ALL SELECT 'hl-meeting', ts FROM hubdone
    UNION ALL SELECT 'peer-HUB_LEAD-3', ts FROM peer_hubdone
    UNION ALL SELECT 'hl-message', ts FROM hubmsg
    UNION ALL SELECT 'as-message', ts FROM hubmsg
    UNION ALL SELECT 'peer-HUB_LEAD-1', ts FROM peer_hubmsg
    UNION ALL SELECT 'peer-SUPPORT-hub', ts FROM peer_hubread
    UNION ALL SELECT 'pr-focus', ts FROM prayfocus
    UNION ALL SELECT 'peer-PRAYER_LEAD-2', ts FROM peer_focus
    UNION ALL SELECT 'pr-done', ts FROM prayfin
  )
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt")
  SELECT p_user, d.key, d.ts FROM d
   WHERE d.ts IS NOT NULL
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_build(p_calendar text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_cal TEXT;
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
  v_day TEXT;
  v_hubs INTEGER;
  v_i INTEGER;
  v_n INTEGER := 0;
  v_hub UUID;
  r RECORD;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set up Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  SELECT COALESCE(NULLIF(p_calendar, ''), "practiceCalendar", 'CLASS_DAY') INTO v_cal FROM public."Cohort" WHERE id = v_c;
  v_day := upper(trim(to_char(v_today, 'Day')));

  -- Wipe (children go with their parents).
  DELETE FROM public."PracticeProgress" WHERE TRUE;
  DELETE FROM public."PracticePeer" WHERE TRUE;
  UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE TRUE;
  DELETE FROM public."UserCohort" WHERE "cohortId" = v_c;
  DELETE FROM public."HubLeadsMeeting" WHERE "cohortId" = v_c;
  DELETE FROM public."SupportHub" WHERE "cohortId" = v_c;
  -- People leave their groups first so the handover log runs while both still exist.
  DELETE FROM public."GroupParticipant" WHERE "groupId" IN (SELECT id FROM public."Group" WHERE "cohortId" = v_c);
  DELETE FROM public."Participant" WHERE "cohortId" = v_c;
  DELETE FROM public."Group" WHERE "cohortId" = v_c;
  DELETE FROM public."Week" WHERE "cohortId" = v_c;

  -- Four practice weeks.
  INSERT INTO public."Week" ("weekNumber", "cohortId", title, "recapSummary", "discussionPrompt", "shareWithParticipants")
  SELECT n, v_c, format('Practice week %s', n),
         format('This is the practice recap for week %s: the main point of the class in a few clear lines.', n),
         'How would you put this into practice this week?', TRUE
  FROM generate_series(1, 4) AS n;
  PERFORM public.practice_apply_calendar(v_c, v_cal);
  PERFORM public.practice_load_manuals(v_c);

  -- Hubs: one per practice Hub Lead (at least one).
  SELECT GREATEST(1, count(*)) INTO v_hubs FROM public."PracticeMember" WHERE role = 'HUB_LEAD';
  DROP TABLE IF EXISTS _pm;
  DROP TABLE IF EXISTS _ph;
  CREATE TEMP TABLE _pm ON COMMIT DROP AS
    SELECT m."userId", m.role, u.name, (row_number() OVER (ORDER BY u.name))::int AS rn,
           (row_number() OVER (PARTITION BY m.role ORDER BY u.name))::int AS role_rn
    FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId";
  CREATE TEMP TABLE _ph (idx INT, hub UUID) ON COMMIT DROP;

  FOR v_i IN 1..v_hubs LOOP
    INSERT INTO public."SupportHub" ("cohortId", name, "leadUserId", "meetingDay", "meetingTime", "callPlatform", "callLink", "assistantPermissions")
    VALUES (
      v_c, format('Practice Hub %s', v_i),
      (SELECT "userId" FROM _pm WHERE role = 'HUB_LEAD' AND role_rn = v_i),
      v_day, '19:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-hub',
      ARRAY['ATTENDANCE', 'MESSAGE', 'GROUPS'])
    RETURNING id INTO v_hub;
    INSERT INTO _ph VALUES (v_i, v_hub);
  END LOOP;

  -- Everyone who is not a Hub Lead is dealt across the hubs in name order; the
  -- Hub Leads belong to their own hub.
  FOR r IN SELECT * FROM _pm WHERE role <> 'HUB_LEAD' ORDER BY name LOOP
    v_n := v_n + 1;
    SELECT hub INTO v_hub FROM _ph WHERE idx = ((v_n - 1) % v_hubs) + 1;
    INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, r."userId", v_c);
    IF r.role = 'ASSISTANT' THEN
      UPDATE public."SupportHub" SET "assistantLeadUserId" = r."userId" WHERE id = v_hub AND "assistantLeadUserId" IS NULL;
    ELSIF r.role = 'RECAP_LEAD' THEN
      UPDATE public."SupportHub" SET "recapLeadUserIds" = array_append("recapLeadUserIds", r."userId") WHERE id = v_hub;
    ELSIF r.role = 'PRAYER_LEAD' THEN
      UPDATE public."SupportHub" SET "prayerLeadUserIds" = array_append("prayerLeadUserIds", r."userId") WHERE id = v_hub;
    END IF;
    PERFORM public.practice_make_group(v_c, r."userId", r.rn);
  END LOOP;
  FOR r IN SELECT * FROM _pm WHERE role = 'HUB_LEAD' ORDER BY name LOOP
    SELECT hub INTO v_hub FROM _ph WHERE idx = r.role_rn;
    INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, r."userId", v_c);
  END LOOP;

  INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink")
  VALUES (v_c, v_day, '20:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');

  PERFORM public.practice_sync_members(v_c);
  RETURN jsonb_build_object('cohortId', v_c, 'hubs', v_hubs, 'people', (SELECT count(*) FROM _pm), 'calendar', v_cal);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_end_all_peers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_n INTEGER;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can end walkthroughs';
  END IF;
  UPDATE public."PracticePeer"
     SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
   WHERE status IN ('ACTIVE', 'PENDING');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_ensure_cohort()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
BEGIN
  SELECT id INTO v_id FROM public."Cohort" WHERE "isPractice";
  IF v_id IS NULL THEN
    INSERT INTO public."Cohort" (name, description, "startDate", "endDate", status, "schedulePublished", "isPractice")
    VALUES ('Practice', 'A safe place to try the app. Nothing here is real.', v_today, v_today + 28, 'COMPLETED', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_enter_participant()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_c UUID;
  v_pid UUID;
  v_token TEXT;
  v_role TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM "PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  IF NOT (SELECT COALESCE("practiceOn", FALSE) FROM "Cohort" WHERE id = v_c) THEN
    RAISE EXCEPTION 'Practice is switched off';
  END IF;
  SELECT "participantId" INTO v_pid FROM "PracticePeer"
   WHERE status = 'ACTIVE' AND "participantId" IS NOT NULL
     AND ((("fromUserId" = v_me) AND "fromRole" = 'PARTICIPANT') OR (("toUserId" = v_me) AND "toRole" = 'PARTICIPANT'))
   ORDER BY "respondedAt" DESC LIMIT 1;
  IF v_pid IS NULL THEN
    SELECT role INTO v_role FROM "PracticeMember" WHERE "userId" = v_me;
    PERFORM public.practice_place(v_me, v_role, NULL);
    SELECT gp."participantId" INTO v_pid
      FROM "Group" g JOIN "GroupParticipant" gp ON gp."groupId" = g.id JOIN "Participant" p ON p.id = gp."participantId"
     WHERE g."supportId" = v_me AND g."cohortId" = v_c ORDER BY p."fullName" LIMIT 1;
  END IF;
  IF v_pid IS NULL OR NOT EXISTS (SELECT 1 FROM "Participant" WHERE id = v_pid AND "cohortId" = v_c) THEN
    RAISE EXCEPTION 'No practice participant to step into';
  END IF;
  v_token := public.start_app_session(NULL, v_pid);
  UPDATE "AppSession" SET "expiresAt" = NOW() + INTERVAL '12 hours'
   WHERE "tokenHash" = encode(digest(v_token, 'sha256'), 'hex');
  UPDATE "PracticeMember" SET "inParticipantView" = TRUE WHERE "userId" = v_me;
  RETURN jsonb_build_object('token', v_token, 'user', public.participant_user_json(v_pid));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_leave_participant()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE "userId" = public.app_current_user_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_load_manuals(p_cohort uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_src UUID;
  v_titles TEXT[] := ARRAY['Introductory Class', 'New Creation Realities', 'Integrity of God''s word', 'The Holy Spirit'];
BEGIN
  SELECT c.id INTO v_src
    FROM public."Cohort" c
   WHERE NOT c."isPractice"
     AND EXISTS (SELECT 1 FROM public."Week" w WHERE w."cohortId" = c.id AND w."manualDocumentUrl" IS NOT NULL)
   ORDER BY (c.status = 'ACTIVE') DESC, c."startDate" DESC NULLS LAST
   LIMIT 1;

  UPDATE public."Week" pw
     SET title = v_titles[pw."weekNumber"],
         "manualDocumentUrl" = COALESCE((SELECT sw."manualDocumentUrl" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDocumentUrl"),
         "manualDocumentName" = COALESCE((SELECT sw."manualDocumentName" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDocumentName"),
         "manualSummary" = COALESCE((SELECT sw."manualSummary" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualSummary"),
         "manualDiscussionPrompt" = COALESCE((SELECT sw."manualDiscussionPrompt" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDiscussionPrompt"),
         "manualReleasedEarlyAt" = COALESCE(pw."manualReleasedEarlyAt", NOW())
   WHERE pw."cohortId" = p_cohort
     AND pw."weekNumber" BETWEEN 1 AND array_length(v_titles, 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_make_group(p_cohort uuid, p_user uuid, p_no integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID;
  v_pid UUID;
  k INTEGER;
  v_names TEXT[] := ARRAY['Ada', 'Bola', 'Chidi', 'Dayo', 'Efe', 'Femi', 'Gozie', 'Hauwa', 'Ifeanyi', 'Jide', 'Kemi', 'Lola'];
BEGIN
  INSERT INTO public."Group" ("cohortId", name, "supportId")
  VALUES (p_cohort, format('Practice Group %s', p_no), p_user)
  RETURNING id INTO v_group;

  FOR k IN 1..3 LOOP
    INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
    VALUES (
      format('%s Practice %s', v_names[((p_no - 1) * 3 + k - 1) % 12 + 1], p_no),
      '0800999' || lpad((p_no * 10 + k)::text, 4, '0'),
      p_cohort, 'ACTIVE', TRUE, CASE WHEN k % 2 = 0 THEN 'Male' ELSE 'Female' END)
    RETURNING id INTO v_pid;
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_pid);
    INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
    VALUES (v_pid, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
    IF k = 1 THEN
      INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
      VALUES (v_pid, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'SAVED', TRUE);
    END IF;
  END LOOP;
  RETURN v_group;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_my_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_role TEXT;
  v_c UUID;
  v_group UUID;
  v_group_name TEXT;
  v_hub_name TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'items', '[]'::jsonb);
  END IF;
  SELECT role INTO v_role FROM public."PracticeMember" WHERE "userId" = v_me;
  SELECT id INTO v_c FROM public."Cohort" WHERE "isPractice" LIMIT 1;
  SELECT g.id, g.name INTO v_group, v_group_name
    FROM public."Group" g WHERE g."cohortId" = v_c AND g."supportId" = v_me AND g."archivedAt" IS NULL
    ORDER BY g.name LIMIT 1;
  SELECT h.name INTO v_hub_name
    FROM public."HubMembership" hm JOIN public."SupportHub" h ON h.id = hm."hubId"
   WHERE hm."userId" = v_me AND hm."cohortId" = v_c LIMIT 1;
  RETURN jsonb_build_object(
    'role', v_role,
    'groupName', v_group_name,
    'hubName', v_hub_name,
    'groupParticipants', COALESCE((
      SELECT jsonb_agg(p."fullName" ORDER BY p."fullName")
      FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
      WHERE gp."groupId" = v_group), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
      FROM public."PracticeProgress" pp WHERE pp."userId" = v_me), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;
  RETURN jsonb_build_object(
    'on', COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m."userId",
        'name', u.name,
        'avatarUrl', u."avatarUrl",
        'role', m.role,
        'joinedAt', m."createdAt",
        'lastSeenAt', m."lastSeenAt",
        'online', COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE),
        'inParticipantView', m."inParticipantView",
        'progress', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key', p."scenarioKey", 'doneAt', p."doneAt", 'stuckAt', p."stuckAt") ORDER BY p."updatedAt")
          FROM public."PracticeProgress" p WHERE p."userId" = m."userId"
        ), '[]'::jsonb)
      ) ORDER BY (m."lastSeenAt" > NOW() - INTERVAL '30 seconds') DESC NULLS LAST, m."lastSeenAt" DESC NULLS LAST)
      FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"
    ), '[]'::jsonb),
    'walkthroughs', COALESCE((
      SELECT jsonb_agg(w) FROM (
        SELECT jsonb_build_object(
          'id', pp.id, 'fromName', fu.name, 'toName', tu.name,
          'fromRole', pp."fromRole", 'toRole', pp."toRole", 'status', pp.status,
          'createdAt', pp."createdAt", 'endedAt', pp."endedAt") AS w
        FROM public."PracticePeer" pp
        JOIN public."User" fu ON fu.id = pp."fromUserId"
        JOIN public."User" tu ON tu.id = pp."toUserId"
        ORDER BY pp."createdAt" DESC LIMIT 100
      ) x
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_peer(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
  r "PracticePeer";
  v_partner UUID;
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT * INTO r FROM "PracticePeer" WHERE status = 'ACTIVE' AND "participantId" = v_pid ORDER BY "respondedAt" DESC LIMIT 1;
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_partner := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toUserId" ELSE r."fromUserId" END;
  RETURN jsonb_build_object(
    'id', r.id,
    'partnerUserId', v_partner,
    'partnerName', (SELECT name FROM "User" WHERE id = v_partner),
    'myRole', 'PARTICIPANT',
    'partnerRole', CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toRole" ELSE r."fromRole" END,
    'iAmParticipant', TRUE,
    'partnerPresent', COALESCE((SELECT "lastSeenAt" > NOW() - INTERVAL '30 seconds' FROM "PracticeMember" WHERE "userId" = v_partner), FALSE),
    'partnerInParticipantView', FALSE,
    'myProgress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', "scenarioKey", 'doneAt', "doneAt", 'stuckAt', "stuckAt"))
        FROM "PracticeProgress" WHERE "scenarioKey" LIKE 'peer-%' AND "participantId" = v_pid), '[]'::jsonb),
    'partnerProgress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', "scenarioKey", 'doneAt', "doneAt", 'stuckAt', "stuckAt"))
        FROM "PracticeProgress" WHERE "scenarioKey" LIKE 'peer-%' AND "userId" = v_partner), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_peer_end(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "PracticePeer" SET status = 'ENDED', "endedAt" = NOW() WHERE status = 'ACTIVE' AND "participantId" = v_pid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_progress(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
  v_practice BOOLEAN;
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT COALESCE(c."isPractice", FALSE) INTO v_practice
  FROM "Participant" p LEFT JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid;
  IF NOT COALESCE(v_practice, FALSE) THEN
    RETURN jsonb_build_object('practice', FALSE, 'items', '[]'::jsonb);
  END IF;
  PERFORM public.practice_autotick_participant(v_pid);
  RETURN jsonb_build_object('practice', TRUE, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
    FROM "PracticeProgress" pp WHERE pp."participantId" = v_pid), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_reset_me(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid AND c."isPractice") THEN
    RAISE EXCEPTION 'This is only for Practice';
  END IF;
  DELETE FROM "TourProgress" WHERE "participantId" = v_pid;
  DELETE FROM "PracticeProgress" WHERE "participantId" = v_pid;
  UPDATE "ParticipantAppState" SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW() WHERE "participantId" = v_pid;
  UPDATE "ParticipantAccount"
     SET password_hash = extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)),
         "setupCode" = 'FOF-PRACTICE', "mustChangePassword" = TRUE, "passwordSetAt" = NULL, "updatedAt" = NOW()
   WHERE "participantId" = v_pid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_set_progress(p_token text, p_key text, p_done boolean, p_stuck boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid AND c."isPractice") THEN
    RAISE EXCEPTION 'This is only for Practice';
  END IF;
  INSERT INTO "PracticeProgress" ("participantId", "scenarioKey", "doneAt", "stuckAt", "autoDisabled")
  VALUES (v_pid, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END, NOT p_done AND NOT p_stuck)
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt",
        "autoDisabled" = CASE WHEN EXCLUDED."doneAt" IS NOT NULL THEN FALSE
                              WHEN EXCLUDED."stuckAt" IS NULL THEN TRUE ELSE "PracticeProgress"."autoDisabled" END,
        "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_end(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  UPDATE public."PracticePeer"
     SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
   WHERE id = p_id AND status IN ('PENDING', 'ACTIVE') AND (v_me IN ("fromUserId", "toUserId"));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_request(p_to uuid, p_my_role text, p_their_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_id UUID;
  v_name TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  IF p_to IS NULL OR p_to = v_me OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = p_to) THEN
    RAISE EXCEPTION 'Pick someone from the Practice team';
  END IF;
  IF p_my_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')
     OR p_their_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')
     OR (p_my_role = 'PARTICIPANT' AND p_their_role = 'PARTICIPANT') THEN
    RAISE EXCEPTION 'Choose two seats, at most one of them a participant';
  END IF;
  UPDATE public."PracticePeer" SET status = 'CANCELLED', "respondedAt" = NOW() WHERE "fromUserId" = v_me AND status = 'PENDING';
  INSERT INTO public."PracticePeer" ("fromUserId", "toUserId", "fromRole", "toRole")
  VALUES (v_me, p_to, p_my_role, p_their_role) RETURNING id INTO v_id;
  SELECT name INTO v_name FROM public."User" WHERE id = v_me;
  PERFORM public.practice_push(p_to,
    format('%s wants to practise with you', split_part(v_name, ' ', 1)),
    format('%s will be the %s and you will be the %s. Takes about 10 minutes.',
           split_part(v_name, ' ', 1), replace(initcap(replace(lower(p_my_role), '_', ' ')), 'Hub Lead', 'Hub Lead'),
           replace(initcap(replace(lower(p_their_role), '_', ' ')), 'Hub Lead', 'Hub Lead')));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_respond(p_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  r public."PracticePeer";
  v_staff UUID;
  v_staff_role TEXT;
  v_hub UUID;
  v_pid UUID;
  v_name TEXT;
BEGIN
  SELECT * INTO r FROM public."PracticePeer"
   WHERE id = p_id AND "toUserId" = v_me AND status = 'PENDING' AND "createdAt" > NOW() - INTERVAL '1 hour';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'That request is no longer open';
  END IF;
  IF p_accept AND (
       NOT COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE)
       OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = r."fromUserId")
       OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = r."toUserId")) THEN
    UPDATE public."PracticePeer" SET status = 'CANCELLED', "respondedAt" = NOW() WHERE id = r.id;
    RAISE EXCEPTION 'Practice is off, or that person has left the team';
  END IF;
  SELECT name INTO v_name FROM public."User" WHERE id = v_me;
  IF NOT p_accept THEN
    UPDATE public."PracticePeer" SET status = 'DECLINED', "respondedAt" = NOW() WHERE id = r.id;
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    VALUES (r."fromUserId", format('%s can''t practise right now', split_part(v_name, ' ', 1)), 'Try someone else, or ask again later.', '/support/my-schedule', 'HUB');
    RETURN;
  END IF;

  UPDATE public."PracticePeer" SET status = 'ENDED', "endedAt" = NOW()
   WHERE status = 'ACTIVE' AND ("fromUserId" IN (r."fromUserId", r."toUserId") OR "toUserId" IN (r."fromUserId", r."toUserId"));

  IF r."fromRole" = 'PARTICIPANT' OR r."toRole" = 'PARTICIPANT' THEN
    v_staff := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toUserId" ELSE r."fromUserId" END;
    v_staff_role := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toRole" ELSE r."fromRole" END;
    v_hub := public.practice_place(v_staff, v_staff_role, NULL);
    SELECT gp."participantId" INTO v_pid
      FROM public."Group" g
      JOIN public."GroupParticipant" gp ON gp."groupId" = g.id
      JOIN public."Participant" p ON p.id = gp."participantId"
     WHERE g."supportId" = v_staff AND g."cohortId" = public.practice_ensure_cohort()
     ORDER BY p."fullName" LIMIT 1;
  ELSIF r."fromRole" = 'HUB_LEAD' OR r."toRole" <> 'HUB_LEAD' THEN
    v_hub := public.practice_place(r."fromUserId", r."fromRole", NULL);
    PERFORM public.practice_place(r."toUserId", r."toRole", v_hub);
  ELSE
    v_hub := public.practice_place(r."toUserId", r."toRole", NULL);
    PERFORM public.practice_place(r."fromUserId", r."fromRole", v_hub);
  END IF;

  -- A fresh walkthrough starts with a clean shared checklist.
  DELETE FROM public."PracticeProgress"
   WHERE "scenarioKey" LIKE 'peer-%'
     AND ("userId" IN (r."fromUserId", r."toUserId") OR ("participantId" IS NOT NULL AND "participantId" = v_pid));
  UPDATE public."PracticePeer" SET status = 'ACTIVE', "respondedAt" = NOW(), "hubId" = v_hub, "participantId" = v_pid WHERE id = r.id;
  PERFORM public.practice_push(r."fromUserId", format('%s joined your walkthrough', split_part(v_name, ' ', 1)), 'Open Practice to start.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_place(p_user uuid, p_role text, p_hub uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := public.practice_ensure_cohort();
  v_old UUID;
  v_hub UUID;
  v_no INTEGER;
  v_n INTEGER;
BEGIN
  IF p_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD') THEN
    RAISE EXCEPTION 'Unknown seat';
  END IF;
  -- Many supports can be placed in the same moment: take turns.
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  SELECT "hubId" INTO v_old FROM public."HubMembership" WHERE "userId" = p_user AND "cohortId" = v_c LIMIT 1;

  UPDATE public."SupportHub" SET "leadUserId" = NULL WHERE "cohortId" = v_c AND "leadUserId" = p_user;
  UPDATE public."SupportHub" SET "assistantLeadUserId" = NULL WHERE "cohortId" = v_c AND "assistantLeadUserId" = p_user;
  UPDATE public."SupportHub"
     SET "recapLeadUserIds" = array_remove("recapLeadUserIds", p_user),
         "prayerLeadUserIds" = array_remove("prayerLeadUserIds", p_user)
   WHERE "cohortId" = v_c AND (p_user = ANY("recapLeadUserIds") OR p_user = ANY("prayerLeadUserIds"));
  DELETE FROM public."HubMembership" WHERE "userId" = p_user AND "cohortId" = v_c;

  v_hub := COALESCE(p_hub, v_old);
  IF v_hub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = v_hub AND "cohortId" = v_c) THEN
    v_hub := NULL;
  END IF;
  IF p_role = 'HUB_LEAD' AND v_hub IS NOT NULL
     AND (SELECT "leadUserId" FROM public."SupportHub" WHERE id = v_hub) IS NOT NULL THEN
    v_hub := NULL;
  END IF;
  IF v_hub IS NULL AND p_role = 'HUB_LEAD' THEN
    SELECT id INTO v_hub FROM public."SupportHub" WHERE "cohortId" = v_c AND "leadUserId" IS NULL ORDER BY name LIMIT 1;
  ELSIF v_hub IS NULL THEN
    -- The smallest hub with room (six people), otherwise a new one.
    SELECT h.id INTO v_hub
      FROM public."SupportHub" h
     WHERE h."cohortId" = v_c
       AND (SELECT count(*) FROM public."HubMembership" hm WHERE hm."hubId" = h.id) < 6
     ORDER BY (SELECT count(*) FROM public."HubMembership" hm WHERE hm."hubId" = h.id), h.name
     LIMIT 1;
  END IF;
  IF v_hub IS NULL THEN
    SELECT count(*) + 1 INTO v_n FROM public."SupportHub" WHERE "cohortId" = v_c;
    INSERT INTO public."SupportHub" ("cohortId", name, "meetingDay", "meetingTime", "callPlatform", "callLink", "assistantPermissions")
    VALUES (v_c, format('Practice Hub %s', v_n), upper(trim(to_char(timezone('Africa/Lagos', NOW()), 'Day'))), '19:00', 'GOOGLE_MEET',
            'https://meet.google.com/practice-hub', ARRAY['ATTENDANCE', 'MESSAGE', 'GROUPS'])
    RETURNING id INTO v_hub;
  END IF;

  INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, p_user, v_c);
  IF p_role = 'HUB_LEAD' THEN
    UPDATE public."SupportHub" SET "leadUserId" = p_user WHERE id = v_hub;
  ELSIF p_role = 'ASSISTANT' THEN
    UPDATE public."SupportHub" SET "assistantLeadUserId" = p_user WHERE id = v_hub;
  ELSIF p_role = 'RECAP_LEAD' THEN
    UPDATE public."SupportHub" SET "recapLeadUserIds" = array_append("recapLeadUserIds", p_user) WHERE id = v_hub;
  ELSIF p_role = 'PRAYER_LEAD' THEN
    UPDATE public."SupportHub" SET "prayerLeadUserIds" = array_append("prayerLeadUserIds", p_user) WHERE id = v_hub;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."Group" WHERE "supportId" = p_user AND "cohortId" = v_c) THEN
    SELECT COALESCE(max(substring(name FROM '[0-9]+$')::int), 0) + 1 INTO v_no FROM public."Group" WHERE "cohortId" = v_c;
    PERFORM public.practice_make_group(v_c, p_user, v_no);
  END IF;

  -- Moving to a different seat (by choice, or because a walkthrough needs it) starts that seat's
  -- steps fresh; the shared support steps stay.
  IF EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = p_user AND role IS DISTINCT FROM p_role) THEN
    DELETE FROM public."PracticeProgress" WHERE "userId" = p_user AND "scenarioKey" NOT LIKE 'sup-%';
    UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = p_user;
  END IF;
  UPDATE public."PracticeMember" SET role = p_role WHERE "userId" = p_user;
  UPDATE public."UserCohort"
     SET "supportKind" = CASE WHEN p_role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
   WHERE "userId" = p_user AND "cohortId" = v_c;
  RETURN v_hub;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_prepare()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := public.practice_ensure_cohort();
  v_day TEXT := upper(trim(to_char(timezone('Africa/Lagos', NOW()), 'Day')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE "cohortId" = v_c) THEN
    INSERT INTO public."Week" ("weekNumber", "cohortId", title, "recapSummary", "discussionPrompt", "shareWithParticipants")
    SELECT n, v_c, format('Practice week %s', n),
           format('This is the practice recap for week %s: the main point of the class in a few clear lines.', n),
           'How would you put this into practice this week?', TRUE
    FROM generate_series(1, 4) AS n;
  END IF;
  PERFORM public.practice_apply_calendar(v_c, 'CLASS_DAY');
  PERFORM public.practice_load_manuals(v_c);
  IF NOT EXISTS (SELECT 1 FROM public."HubLeadsMeeting" WHERE "cohortId" = v_c) THEN
    INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink")
    VALUES (v_c, v_day, '20:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');
  END IF;
  RETURN v_c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_pulse(p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_member public."PracticeMember";
  v_on BOOLEAN;
  v_key TEXT;
  v_active JSONB;
  r public."PracticePeer";
  v_partner UUID;
  v_iam_pt BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('member', FALSE, 'cohortKey', '');
  END IF;
  SELECT string_agg("cohortId"::text, ',' ORDER BY "cohortId"::text) INTO v_key FROM public."UserCohort" WHERE "userId" = v_me;
  SELECT * INTO v_member FROM public."PracticeMember" WHERE "userId" = v_me;
  SELECT COALESCE("practiceOn", FALSE) INTO v_on FROM public."Cohort" WHERE "isPractice" LIMIT 1;
  -- Practice is open to every support: while it is on, the first beat enrols them.
  IF v_member."userId" IS NULL AND COALESCE(v_on, FALSE)
     AND EXISTS (SELECT 1 FROM public."User" WHERE id = v_me AND (role = 'SUPPORT' OR 'SUPPORT' = ANY(roles)) AND "isActive") THEN
    INSERT INTO public."PracticeMember" ("userId", role) VALUES (v_me, 'SUPPORT') ON CONFLICT ("userId") DO NOTHING;
    SELECT * INTO v_member FROM public."PracticeMember" WHERE "userId" = v_me;
  END IF;
  IF v_member."userId" IS NULL THEN
    RETURN jsonb_build_object('member', FALSE, 'on', COALESCE(v_on, FALSE), 'cohortKey', COALESCE(v_key, ''));
  END IF;
  IF COALESCE(v_on, FALSE) THEN
    -- Practice's calendar always has today as class day, so attendance can be started any day
    -- (it used to stay on the day it was last set, e.g. "opens Sunday 4 October").
    IF EXISTS (SELECT 1 FROM public."Cohort" WHERE "isPractice" AND "startDate" IS DISTINCT FROM (timezone('Africa/Lagos', NOW()))::date) THEN
      PERFORM public.practice_apply_calendar((SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1), 'CLASS_DAY');
    END IF;
    -- Placed in Practice (group, hub, cohort menu) the first time, and kept there.
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" hm JOIN public."Cohort" c ON c.id = hm."cohortId" WHERE hm."userId" = v_me AND c."isPractice") THEN
      PERFORM public.practice_place(v_me, v_member.role, NULL);
    END IF;
    INSERT INTO public."UserCohort" ("userId", "cohortId", "supportKind")
    SELECT v_me, c.id, CASE WHEN v_member.role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
      FROM public."Cohort" c
     WHERE c."isPractice"
       AND NOT EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = v_me AND uc."cohortId" = c.id);
    SELECT string_agg("cohortId"::text, ',' ORDER BY "cohortId"::text) INTO v_key FROM public."UserCohort" WHERE "userId" = v_me;
  END IF;
  IF p_active AND NOT v_member."inParticipantView" THEN
    UPDATE public."PracticeMember" SET "lastSeenAt" = NOW() WHERE "userId" = v_me;
  END IF;
  IF p_active AND COALESCE(v_on, FALSE) THEN
    PERFORM public.practice_autotick_staff(v_me);
    PERFORM public.practice_autotick_participant(pp."participantId") FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pp."participantId" IS NOT NULL AND v_me IN (pp."fromUserId", pp."toUserId");
  END IF;

  SELECT * INTO r FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND v_me IN ("fromUserId", "toUserId") ORDER BY "respondedAt" DESC LIMIT 1;
  IF r.id IS NOT NULL THEN
    v_partner := CASE WHEN r."fromUserId" = v_me THEN r."toUserId" ELSE r."fromUserId" END;
    v_iam_pt := (CASE WHEN r."fromUserId" = v_me THEN r."fromRole" ELSE r."toRole" END) = 'PARTICIPANT';
    v_active := jsonb_build_object(
      'id', r.id,
      'partnerUserId', v_partner,
      'partnerName', (SELECT name FROM public."User" WHERE id = v_partner),
      'myRole', CASE WHEN r."fromUserId" = v_me THEN r."fromRole" ELSE r."toRole" END,
      'partnerRole', CASE WHEN r."fromUserId" = v_me THEN r."toRole" ELSE r."fromRole" END,
      'iAmParticipant', v_iam_pt,
      'partnerPresent', COALESCE((SELECT "lastSeenAt" > NOW() - INTERVAL '30 seconds' FROM public."PracticeMember" WHERE "userId" = v_partner), FALSE),
      'partnerInParticipantView', COALESCE((SELECT "inParticipantView" FROM public."PracticeMember" WHERE "userId" = v_partner), FALSE),
      'myProgress', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
        FROM public."PracticeProgress" pp
        WHERE pp."scenarioKey" LIKE 'peer-%' AND (pp."userId" = v_me OR (v_iam_pt AND pp."participantId" = r."participantId"))), '[]'::jsonb),
      'partnerProgress', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
        FROM public."PracticeProgress" pp
        WHERE pp."scenarioKey" LIKE 'peer-%' AND (pp."userId" = v_partner OR (NOT v_iam_pt AND (CASE WHEN r."fromUserId" = v_me THEN r."toRole" ELSE r."fromRole" END) = 'PARTICIPANT' AND pp."participantId" = r."participantId"))), '[]'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'member', TRUE,
    'on', COALESCE(v_on, FALSE),
    'role', v_member.role,
    'inParticipantView', v_member."inParticipantView",
    'cohortKey', COALESCE(v_key, ''),
    'incoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'fromName', u.name, 'fromRole', pp."fromRole", 'toRole', pp."toRole") ORDER BY pp."createdAt")
      FROM public."PracticePeer" pp JOIN public."User" u ON u.id = pp."fromUserId"
      WHERE pp."toUserId" = v_me AND pp.status = 'PENDING' AND pp."createdAt" > NOW() - INTERVAL '1 hour'), '[]'::jsonb),
    'outgoing', (
      SELECT jsonb_build_object('id', pp.id, 'toName', u.name, 'myRole', pp."fromRole", 'theirRole', pp."toRole")
      FROM public."PracticePeer" pp JOIN public."User" u ON u.id = pp."toUserId"
      WHERE pp."fromUserId" = v_me AND pp.status = 'PENDING' AND pp."createdAt" > NOW() - INTERVAL '1 hour'
      ORDER BY pp."createdAt" DESC LIMIT 1),
    'active', v_active
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_push(p_user uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  INSERT INTO public."Notification" ("userId", title, body, path, type)
  VALUES (p_user, p_title, p_body, '/support/my-schedule', 'HUB');
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', jsonb_build_array(p_user), 'title', p_title, 'body', p_body, 'path', '/support/my-schedule', 'type', 'HUB'),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_me()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = v_me AND "cohortId" = v_c LIMIT 1;

  UPDATE public."PracticeMember" pm SET "inParticipantView" = FALSE
   WHERE pm."userId" = v_me OR EXISTS (
     SELECT 1 FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pm."userId" IN (pp."fromUserId", pp."toUserId")
        AND (v_me IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
          SELECT gp."participantId" FROM public."GroupParticipant" gp
          WHERE gp."groupId" = v_group.id))
   );
  UPDATE public."PracticePeer" pp
     SET status = 'ENDED', "endedAt" = NOW()
   WHERE pp.status = 'ACTIVE'
     AND (v_me IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
       SELECT gp."participantId" FROM public."GroupParticipant" gp
       WHERE gp."groupId" = v_group.id));

  DELETE FROM public."PracticeProgress" WHERE "userId" = v_me
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = v_me AND g."cohortId" = v_c);
  UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = v_me;

  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, v_me, v_no);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_my_first_time()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  DELETE FROM public."TourProgress" WHERE "userId" = v_me;
  DELETE FROM public."HubRoleIntroSeen" WHERE "userId" = v_me;
  UPDATE public."UserAppState" SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW() WHERE "userId" = v_me;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_participant(p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_p public."Participant";
  v_group UUID;
  v_new UUID;
  v_first BOOLEAN;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_p FROM public."Participant" WHERE id = p_participant_id AND "cohortId" = v_c;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'That is not a practice participant';
  END IF;
  SELECT "groupId" INTO v_group FROM public."GroupParticipant" WHERE "participantId" = v_p.id LIMIT 1;
  v_first := EXISTS (SELECT 1 FROM public."FaithProject" WHERE "participantId" = v_p.id);
  DELETE FROM public."GroupParticipant" WHERE "participantId" = v_p.id;
  DELETE FROM public."Participant" WHERE id = v_p.id;
  INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
  VALUES (v_p."fullName", v_p.phone, v_c, 'ACTIVE', TRUE, v_p.gender) RETURNING id INTO v_new;
  IF v_group IS NOT NULL THEN
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_new);
  END IF;
  INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
  VALUES (v_new, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
  IF v_first THEN
    INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
    VALUES (v_new, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'SAVED', TRUE);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_person(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = p_user_id AND "cohortId" = v_c LIMIT 1;

  UPDATE public."PracticeMember" pm SET "inParticipantView" = FALSE
   WHERE pm."userId" = p_user_id OR EXISTS (
     SELECT 1 FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pm."userId" IN (pp."fromUserId", pp."toUserId")
        AND (p_user_id IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
          SELECT gp."participantId" FROM public."GroupParticipant" gp
          WHERE gp."groupId" = v_group.id))
   );
  UPDATE public."PracticePeer" pp
     SET status = 'ENDED', "endedAt" = NOW()
   WHERE pp.status = 'ACTIVE'
     AND (p_user_id IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
       SELECT gp."participantId" FROM public."GroupParticipant" gp
       WHERE gp."groupId" = v_group.id));

  DELETE FROM public."PracticeProgress" WHERE "userId" = p_user_id
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = p_user_id AND g."cohortId" = v_c);
  UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = p_user_id;
  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, p_user_id, v_no);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_send_test_prayer(p_token text, p_kind text, p_link text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.prayer_require_admin(p_token);
  v_c uuid;
  v_blocks jsonb := '[]'::jsonb;
  v_link text := COALESCE(NULLIF(btrim(COALESCE(p_link, '')), ''), 'https://telegram.org/');
  v_slot uuid;
  v_session uuid;
  v_pool text;
  v_pick record;
  v_participants uuid[];
  v_body text;
  v_pushed boolean;
BEGIN
  IF p_kind NOT IN ('PRAYER', 'LIVE') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
  SELECT c.id INTO v_c FROM public."Cohort" c WHERE c."isPractice";
  IF v_c IS NULL THEN RAISE EXCEPTION 'NO_PRACTICE_COHORT'; END IF;

  IF p_kind = 'PRAYER' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'VERSE', 'verseId', q.id) ORDER BY q.ord), '[]'::jsonb) INTO v_blocks
    FROM (SELECT v.id, row_number() OVER (ORDER BY v."sortOrder", v."createdAt", v.id) AS ord FROM public."CorporatePrayerVerse" v WHERE v.active ORDER BY v."sortOrder", v."createdAt", v.id LIMIT 2) q;
    IF jsonb_array_length(v_blocks) = 0 THEN RAISE EXCEPTION 'ADD_A_VERSE_FIRST'; END IF;
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'FAITH_PROJECT'));
  END IF;

  SELECT id INTO v_slot FROM public."CorporatePrayerSlot" WHERE "cohortId" = v_c AND "isTest" AND "slotType" = p_kind;
  IF v_slot IS NULL THEN
    INSERT INTO public."CorporatePrayerSlot" ("cohortId", name, "timeOfDay", "slotType", "timerMinutes", "joinWindowMinutes", "targetMode", notify, active,
                                              blocks, "audienceAll", "hubIds", "telegramLink", "liveWaitMinutes", "liveMessage", "isTest")
    VALUES (v_c, 'Test prayer', (now() AT TIME ZONE 'Africa/Lagos')::time(0), p_kind, 5, 30, CASE WHEN p_kind = 'PRAYER' THEN 'COHORT' END, FALSE, TRUE,
            v_blocks, TRUE, '{}'::uuid[], CASE WHEN p_kind = 'LIVE' THEN v_link END, 1, CASE WHEN p_kind = 'LIVE' THEN 'Test: join the live prayer on Telegram' END, TRUE)
    RETURNING id INTO v_slot;
  ELSE
    UPDATE public."CorporatePrayerSlot" SET blocks = v_blocks, "telegramLink" = CASE WHEN p_kind = 'LIVE' THEN v_link END, "updatedAt" = now() WHERE id = v_slot;
  END IF;

  -- Replace the previous test (its check-ins go with it) and open a fresh 30-minute one.
  DELETE FROM public."CorporatePrayerSession" WHERE "slotId" = v_slot;
  INSERT INTO public."CorporatePrayerSession" ("slotId", "cohortId", "prayerDate", "slotType", "opensAt", "closesAt", "timerMinutes", blocks, "audienceAll", "hubIds")
  VALUES (v_slot, v_c, public.prayer_lagos_today(), p_kind, now(), now() + interval '30 minutes', 5, v_blocks, TRUE, '{}'::uuid[])
  RETURNING id INTO v_session;

  IF p_kind = 'PRAYER' THEN
    v_pool := public.prayer_blocks_pool(v_blocks);
    SELECT * INTO v_pick FROM public.prayer_pick(v_c, v_pool, '{}'::uuid[], public.prayer_lagos_today(), TRUE);
    IF v_pick.participant_id IS NOT NULL THEN
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, 'COHORT', v_c, v_pool, public.prayer_lagos_today(), v_pick.participant_id, v_pick.cycle_no);
    END IF;
  END IF;

  -- The admin's own practice participants (the ones they can step into) and the admin as the practice support.
  SELECT array_agg(gp."participantId") INTO v_participants
  FROM public."Group" g JOIN public."GroupParticipant" gp ON gp."groupId" = g.id WHERE g."supportId" = u.id AND g."cohortId" = v_c;
  v_body := CASE WHEN p_kind = 'LIVE' THEN 'Test: the live prayer is on. Tap to join.' ELSE 'Test: a prayer is open. Join for 5 minutes.' END;
  v_pushed := public.prayer_notify_ready();
  IF v_pushed THEN
    PERFORM public.invoke_prayer_notify(v_participants, ARRAY[u.id], 'Time to pray (test)', v_body);
  END IF;
  RETURN json_build_object('sessionId', v_session, 'kind', p_kind, 'participants', COALESCE(array_length(v_participants, 1), 0), 'pushed', v_pushed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_calendar(p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change the Practice calendar';
  END IF;
  PERFORM public.practice_apply_calendar(public.practice_ensure_cohort(), p_mode);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_my_role(p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_old TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  SELECT role INTO v_old FROM public."PracticeMember" WHERE "userId" = v_me;
  IF v_old IS DISTINCT FROM p_role THEN
    DELETE FROM public."PracticeProgress" WHERE "userId" = v_me AND "scenarioKey" NOT LIKE 'sup-%';
    UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = v_me;
  END IF;
  PERFORM public.practice_place(v_me, p_role, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_on(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can switch Practice';
  END IF;
  v_c := public.practice_prepare();
  UPDATE public."Cohort" SET "practiceOn" = COALESCE(p_on, FALSE), "updatedAt" = NOW() WHERE id = v_c;
  IF NOT COALESCE(p_on, FALSE) THEN
    UPDATE public."PracticePeer"
       SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
     WHERE status IN ('ACTIVE', 'PENDING');
    UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE TRUE;
  END IF;
  PERFORM public.practice_sync_members(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_progress(p_key text, p_done boolean, p_stuck boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt", "stuckAt", "autoDisabled")
  VALUES (v_me, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END, NOT p_done AND NOT p_stuck)
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt",
        "autoDisabled" = CASE WHEN EXCLUDED."doneAt" IS NOT NULL THEN FALSE
                              WHEN EXCLUDED."stuckAt" IS NULL THEN TRUE ELSE public."PracticeProgress"."autoDisabled" END,
        "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_roster(p_members jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change the Practice roster';
  END IF;
  v_c := public.practice_ensure_cohort();
  DELETE FROM public."PracticeMember" WHERE TRUE;
  INSERT INTO public."PracticeMember" ("userId", role)
  SELECT (x->>'userId')::uuid, x->>'role'
  FROM jsonb_array_elements(COALESCE(p_members, '[]'::jsonb)) x
  JOIN public."User" u ON u.id = (x->>'userId')::uuid AND u.role = 'SUPPORT'
  ON CONFLICT ("userId") DO UPDATE SET role = EXCLUDED.role;
  PERFORM public.practice_sync_members(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c public."Cohort";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see Practice';
  END IF;
  SELECT * INTO v_c FROM public."Cohort" WHERE "isPractice";
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('cohortId', NULL, 'on', FALSE, 'built', FALSE, 'calendar', NULL,
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', m."userId", 'name', u.name, 'role', m.role, 'progress', '[]'::jsonb, 'group', NULL) ORDER BY u.name)
                           FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object(
    'cohortId', v_c.id,
    'on', v_c."practiceOn",
    'calendar', v_c."practiceCalendar",
    'built', EXISTS (SELECT 1 FROM public."Week" WHERE "cohortId" = v_c.id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m."userId", 'name', u.name, 'role', m.role, 'avatarUrl', u."avatarUrl",
        'progress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt")) FROM public."PracticeProgress" pp WHERE pp."userId" = m."userId"), '[]'::jsonb),
        'group', (
          SELECT jsonb_build_object('id', g.id, 'name', g.name, 'participants', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', p.id, 'name', p."fullName", 'phone', p.phone,
              'code', CASE WHEN a."mustChangePassword" THEN a."setupCode" END,
              'signedIn', COALESCE(NOT a."mustChangePassword", FALSE),
              'progress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt")) FROM public."PracticeProgress" pp WHERE pp."participantId" = p.id), '[]'::jsonb)
            ) ORDER BY p."fullName")
            FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
            LEFT JOIN public."ParticipantAccount" a ON a."participantId" = p.id
            WHERE gp."groupId" = g.id), '[]'::jsonb))
          FROM public."Group" g WHERE g."supportId" = m."userId" AND g."cohortId" = v_c.id AND g."archivedAt" IS NULL LIMIT 1)
      ) ORDER BY u.name)
      FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"), '[]'::jsonb),
    'hubs', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'leadName', (SELECT name FROM public."User" WHERE id = h."leadUserId"))) FROM public."SupportHub" h WHERE h."cohortId" = v_c.id), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;
  RETURN jsonb_build_object(
    'on', COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE),
    'people', (SELECT count(*) FROM public."PracticeMember"),
    'online', (SELECT count(*) FROM public."PracticeMember" WHERE "lastSeenAt" > NOW() - INTERVAL '30 seconds'),
    'walkthroughs', (SELECT count(*) FROM public."PracticePeer" WHERE status = 'ACTIVE')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_sync_members(p_cohort uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."UserCohort" WHERE "cohortId" = p_cohort;
  IF (SELECT "practiceOn" FROM public."Cohort" WHERE id = p_cohort) THEN
    INSERT INTO public."UserCohort" ("userId", "cohortId", "supportKind")
    SELECT m."userId", p_cohort, CASE WHEN m.role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
    FROM public."PracticeMember" m;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_team()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x.j ORDER BY x.online DESC, x.name)
    FROM (
      SELECT u.name,
             COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE) AS online,
             jsonb_build_object(
               'userId', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl", 'role', m.role,
               'online', COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE),
               'busy', EXISTS (SELECT 1 FROM public."PracticePeer" pp
                               WHERE pp.status = 'ACTIVE' AND (pp."fromUserId" = u.id OR pp."toUserId" = u.id))) AS j
        FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"
       WHERE m."userId" <> v_me AND u."isActive"
    ) x), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_amen_for_target(p_session uuid, p_hub_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT count(*)::integer FROM public."CorporatePrayerCheckin" k
  JOIN public."CorporatePrayerSession" s ON s.id = k."sessionId"
  WHERE k."sessionId" = p_session AND k."amenAt" IS NOT NULL
    AND (p_hub_key = 'COHORT'
         OR public.prayer_session_target(p_session, CASE WHEN k."personKind" = 'PARTICIPANT' THEN public.prayer_participant_hub(s."cohortId", k."personId")
                                                          ELSE public.prayer_user_hub(s."cohortId", k."personId") END)
            = (SELECT t."participantId" FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = p_session AND t."hubKey" = p_hub_key))
$function$;

CREATE OR REPLACE FUNCTION public.prayer_blocks_pool(p_blocks jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) b WHERE b->>'type' = 'FAITH_PROJECT') THEN 'FAITH' ELSE 'NAME' END $function$;

CREATE OR REPLACE FUNCTION public.prayer_caller(p_token text, p_cohort uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, person_id uuid, cohort_id uuid, hub_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  v_user "User";
  v_cohort uuid;
BEGIN
  IF v_pid IS NOT NULL THEN
    SELECT p."cohortId" INTO v_cohort FROM public."Participant" p
    WHERE p.id = v_pid AND NOT public.prayer_is_teen(p) AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p."cohortId"));
    IF v_cohort IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT 'PARTICIPANT'::text, v_pid, v_cohort, public.prayer_participant_hub(v_cohort, v_pid);
    RETURN;
  END IF;
  v_user := public.app_staff(p_token);
  IF v_user.id IS NULL THEN RETURN; END IF;
  IF NOT ('SUPPORT'::"Role" = ANY (public.app_user_roles(v_user))) OR v_user."isTest" IS TRUE THEN RETURN; END IF;
  IF p_cohort IS NOT NULL AND public.prayer_is_practice(p_cohort)
     AND EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = v_user.id AND uc."cohortId" = p_cohort) THEN
    v_cohort := p_cohort;
  ELSE
    v_cohort := public.prayer_user_cohort(v_user.id);
  END IF;
  IF v_cohort IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT 'SUPPORT'::text, v_user.id, v_cohort, public.prayer_user_hub(v_cohort, v_user.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_counted_participants(p_cohort uuid)
 RETURNS TABLE(participant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p.id
  FROM public."Participant" p
  JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive"
  WHERE p."cohortId" = p_cohort AND p.status = 'ACTIVE' AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p_cohort)) AND NOT public.prayer_is_teen(p)
$function$;

CREATE OR REPLACE FUNCTION public.prayer_counted_supports(p_cohort uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT u.id
  FROM public."User" u
  JOIN public."UserCohort" uc ON uc."userId" = u.id AND uc."cohortId" = p_cohort
  WHERE u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
    AND 'SUPPORT'::"Role" = ANY (public.app_user_roles(u))
$function$;

CREATE OR REPLACE FUNCTION public.prayer_counts_json(p_session uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'joined', count(c."sessionId"),
    'praying', count(c."sessionId") FILTER (WHERE c."amenAt" IS NULL AND c."cantJoinAt" IS NULL AND c."checkedInAt" > now() - make_interval(mins => GREATEST(s."timerMinutes", 15) + 5)),
    'amen', count(c."sessionId") FILTER (WHERE c."amenAt" IS NOT NULL),
    'tapped', count(c."sessionId") FILTER (WHERE c."linkTappedAt" IS NOT NULL))
  FROM public."CorporatePrayerSession" s
  LEFT JOIN public."CorporatePrayerCheckin" c ON c."sessionId" = s.id
  WHERE s.id = p_session
  GROUP BY s."timerMinutes"
$function$;

CREATE OR REPLACE FUNCTION public.prayer_coverage(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_result json;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  WITH cyc AS (
    SELECT pl.pool, COALESCE(c."cycleNo", 1) AS cycle_no
    FROM (VALUES ('FAITH'), ('NAME')) pl(pool)
    LEFT JOIN public."CorporatePrayerCycle" c ON c."cohortId" = p_cohort_id AND c.pool = pl.pool
  ), members AS (
    SELECT cyc.pool, cyc.cycle_no, m.participant_id,
           EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort_id AND t.pool = cyc.pool AND t."cycleNo" = cyc.cycle_no AND t."participantId" = m.participant_id) AS done,
           EXISTS (SELECT 1 FROM public."CorporatePrayerSkip" s WHERE s."cohortId" = p_cohort_id AND s."participantId" = m.participant_id AND s."cycleNo" = cyc.cycle_no) AS skipped,
           (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort_id AND t.pool = cyc.pool AND t."participantId" = m.participant_id) AS last_on
    FROM cyc CROSS JOIN LATERAL public.prayer_pool_members(p_cohort_id, cyc.pool) m
  )
  SELECT json_build_object(
    'cycles', (SELECT json_object_agg(cyc.pool, json_build_object(
        'cycleNo', cyc.cycle_no,
        'total', (SELECT count(*) FROM members m WHERE m.pool = cyc.pool AND (NOT m.skipped OR m.done)),
        'done', (SELECT count(*) FROM members m WHERE m.pool = cyc.pool AND m.done))) FROM cyc),
    'notYet', (SELECT json_object_agg(pool, people) FROM (
        SELECT m.pool, COALESCE(json_agg(json_build_object('id', p.id, 'name', p."fullName", 'skipped', m.skipped, 'lastOn', m.last_on) ORDER BY m.last_on NULLS FIRST, p."fullName"), '[]'::json) AS people
        FROM members m JOIN public."Participant" p ON p.id = m.participant_id WHERE NOT m.done GROUP BY m.pool) q),
    'doneList', (SELECT json_object_agg(pool, people) FROM (
        SELECT m.pool, COALESCE(json_agg(json_build_object('id', p.id, 'name', p."fullName", 'lastOn', m.last_on) ORDER BY m.last_on DESC, p."fullName"), '[]'::json) AS people
        FROM members m JOIN public."Participant" p ON p.id = m.participant_id WHERE m.done GROUP BY m.pool) q),
    'hubs', COALESCE((SELECT json_agg(json_build_object('hubKey', h.key, 'name', COALESCE(sh.name, 'No hub'),
          'participants', h.participants, 'supports', h.supports) ORDER BY sh.name NULLS LAST) FROM (
        SELECT k.key, sum(k.p) AS participants, sum(k.s) AS supports FROM (
          SELECT public.prayer_participant_hub(p_cohort_id, cp.participant_id) AS key, 1 AS p, 0 AS s FROM public.prayer_counted_participants(p_cohort_id) cp
          UNION ALL
          SELECT public.prayer_user_hub(p_cohort_id, cs.user_id), 0, 1 FROM public.prayer_counted_supports(p_cohort_id) cs) k
        GROUP BY k.key) h LEFT JOIN public."SupportHub" sh ON sh.id::text = h.key), '[]'::json)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_in_audience(p_all boolean, p_hubs uuid[], p_hub_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT COALESCE(p_all, FALSE) OR (p_hub_key IS NOT NULL AND p_hub_key <> 'NO_HUB' AND p_hub_key = ANY (COALESCE(p_hubs, '{}'::uuid[])::text[])) $function$;

CREATE OR REPLACE FUNCTION public.prayer_is_practice(p_cohort uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ SELECT COALESCE((SELECT c."isPractice" FROM public."Cohort" c WHERE c.id = p_cohort), FALSE) $function$;

CREATE OR REPLACE FUNCTION public.prayer_is_target(p_session uuid, p_participant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = p_session AND t."participantId" = p_participant)
$function$;

CREATE OR REPLACE FUNCTION public.prayer_is_teen(p "Participant")
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow')
    OR EXISTS (
      SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
      WHERE gp."participantId" = p.id AND g."isTeenGroup" IS TRUE)
    OR EXISTS (
      SELECT 1 FROM public."FollowUpContact" fc
      WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')),
    FALSE)
$function$;

CREATE OR REPLACE FUNCTION public.prayer_lagos_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT (now() AT TIME ZONE 'Africa/Lagos')::date $function$;

CREATE OR REPLACE FUNCTION public.prayer_late_until(p_session uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN s."slotType" = 'LIVE' THEN s."closesAt"
              ELSE GREATEST(s."closesAt", ((s."prayerDate" + 1)::timestamp AT TIME ZONE 'Africa/Lagos')) END
  FROM public."CorporatePrayerSession" s WHERE s.id = p_session
$function$;

CREATE OR REPLACE FUNCTION public.prayer_milestone_seen(p_token text, p_milestone integer, p_tell_group boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  m public."PrayerMilestone";
  v_group uuid;
  v_support uuid;
  v_first text;
  v_line text;
  v_url text;
  v_key text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO m FROM public."PrayerMilestone" WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone FOR UPDATE;
  IF m.milestone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- The celebration shows the highest badge; any lower one reached in the same stretch counts as seen with it.
  UPDATE public."PrayerMilestone" SET "seenAt" = COALESCE("seenAt", now())
  WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone <= p_milestone;

  IF c.kind = 'PARTICIPANT' THEN
    SELECT g.id, g."supportId" INTO v_group, v_support FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
    SELECT COALESCE(NULLIF(split_part(btrim(p."fullName"), ' ', 1), ''), 'A participant') INTO v_first FROM public."Participant" p WHERE p.id = c.person_id;
    v_line := CASE WHEN p_milestone = 70 THEN 'on every prayer day of the programme' ELSE p_milestone || ' days in a row' END;

    IF COALESCE(p_tell_group, FALSE) AND v_group IS NOT NULL AND m."toldGroupAt" IS NULL THEN
      INSERT INTO public."GroupPost" ("groupId", "authorParticipantId", body)
      VALUES (v_group, c.person_id, 'I have prayed ' || v_line || ' with the group. Thank you for praying with me.');
      UPDATE public."PrayerMilestone" SET "toldGroupAt" = now() WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone;
    END IF;

    IF v_support IS NOT NULL AND m."supportNotifiedAt" IS NULL THEN
      UPDATE public."PrayerMilestone" SET "supportNotifiedAt" = now() WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone;
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
      IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
          body := jsonb_build_object('userIds', to_jsonb(ARRAY[v_support]), 'title', v_first || ' has prayed ' || v_line,
                                     'body', 'A prayer milestone in your group.', 'path', '/support/participants', 'type', 'CORPORATE_PRAYER'),
          timeout_milliseconds := 25000);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_next_opening(p_cohort uuid, p_hub text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT row_to_json(n) FROM (
    SELECT sl.id AS "slotId", sl.name, sl."slotType",
           ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') AS "opensAt"
    FROM public."CorporatePrayerSlot" sl
    CROSS JOIN (VALUES (0), (1)) AS d(off)
    WHERE sl."cohortId" = p_cohort AND sl.active AND NOT sl."isTest" AND public.prayer_running(p_cohort)
      AND public.prayer_in_audience(sl."audienceAll", sl."hubIds", p_hub)
      AND ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') > now()
    ORDER BY ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') LIMIT 1
  ) n
$function$;

CREATE OR REPLACE FUNCTION public.prayer_notify_ready()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key')
$function$;

CREATE OR REPLACE FUNCTION public.prayer_open_session(p_cohort uuid, p_hub text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  v_opens timestamptz;
  v_day date;
  v_running boolean := public.prayer_running(p_cohort);
BEGIN
  IF v_running THEN
    -- Yesterday too: a slot late in the evening can stay joinable past midnight. Sessions are made for every open slot, whoever asks.
    FOR v_day IN SELECT d::date FROM generate_series(v_today - 1, v_today, interval '1 day') d LOOP
      FOR s IN SELECT sl.id, sl."timeOfDay", sl."joinWindowMinutes" FROM public."CorporatePrayerSlot" sl
               WHERE sl."cohortId" = p_cohort AND sl.active AND NOT sl."isTest" LOOP
        v_opens := (v_day + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
        IF now() >= v_opens AND now() < v_opens + make_interval(mins => s."joinWindowMinutes") THEN
          PERFORM public.ensure_prayer_session(s.id, v_day);
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  -- A test prayer (Practice) shows whether or not prayers have "started" there.
  RETURN (SELECT x.id FROM public."CorporatePrayerSession" x
          JOIN public."CorporatePrayerSlot" sl ON sl.id = x."slotId" AND sl.active
          WHERE x."cohortId" = p_cohort AND x."prayerDate" >= v_today - 1 AND now() >= x."opensAt" AND now() < x."closesAt"
            AND public.prayer_in_audience(x."audienceAll", x."hubIds", p_hub)
            AND (v_running OR sl."isTest")
          ORDER BY x."opensAt" DESC LIMIT 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_participant_hub(p_cohort uuid, p_participant uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((
    SELECT hm."hubId"::text
    FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL AND g."isTeenGroup" IS NOT TRUE
    JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."cohortId" = p_cohort
    WHERE gp."participantId" = p_participant
    ORDER BY hm."createdAt"
    LIMIT 1), 'NO_HUB')
$function$;

CREATE OR REPLACE FUNCTION public.prayer_pick(p_cohort uuid, p_pool text, p_exclude uuid[], p_date date, p_apply boolean)
 RETURNS TABLE(participant_id uuid, cycle_no integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cycle integer;
  v_pick uuid;
BEGIN
  IF p_apply THEN
    -- Everything a pick reads and writes (cycle number, today's targets) is per cohort and pool, so one lock covers all slots of a pool.
    PERFORM pg_advisory_xact_lock(hashtextextended('prayer-pick:' || p_cohort::text || ':' || p_pool, 0));
    INSERT INTO public."CorporatePrayerCycle" ("cohortId", pool) VALUES (p_cohort, p_pool) ON CONFLICT DO NOTHING;
  END IF;
  SELECT c."cycleNo" INTO v_cycle FROM public."CorporatePrayerCycle" c WHERE c."cohortId" = p_cohort AND c.pool = p_pool;
  v_cycle := COALESCE(v_cycle, 1);

  -- Step 2: someone with no turn in this cycle.
  SELECT m.participant_id INTO v_pick
  FROM public.prayer_pool_members(p_cohort, p_pool) m
  WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."prayerDate" = p_date AND t."participantId" = m.participant_id)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSkip" s WHERE s."cohortId" = p_cohort AND s."participantId" = m.participant_id AND s."cycleNo" = v_cycle)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."cycleNo" = v_cycle AND t."participantId" = m.participant_id)
  ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
           md5(m.participant_id::text || p_date::text)
  LIMIT 1;

  IF v_pick IS NULL THEN
    -- Everyone has had a turn this cycle: the next cycle begins, so anyone not chosen today is eligible again.
    SELECT m.participant_id INTO v_pick
    FROM public.prayer_pool_members(p_cohort, p_pool) m
    WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."prayerDate" = p_date AND t."participantId" = m.participant_id)
    ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
             md5(m.participant_id::text || p_date::text)
    LIMIT 1;
    IF v_pick IS NOT NULL AND p_apply THEN
      UPDATE public."CorporatePrayerCycle" SET "cycleNo" = "cycleNo" + 1, "startedAt" = now()
      WHERE "cohortId" = p_cohort AND pool = p_pool RETURNING "cycleNo" INTO v_cycle;
    END IF;
  END IF;

  IF v_pick IS NULL THEN
    -- Relax "not chosen today" so a very small pool still shows someone.
    SELECT m.participant_id INTO v_pick
    FROM public.prayer_pool_members(p_cohort, p_pool) m
    WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
    ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
             md5(m.participant_id::text || p_date::text)
    LIMIT 1;
  END IF;

  IF v_pick IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v_pick, v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_pool_members(p_cohort uuid, p_pool text)
 RETURNS TABLE(participant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p.id
  FROM public."Participant" p
  WHERE p."cohortId" = p_cohort
    AND p.status = 'ACTIVE'
    AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p_cohort))
    AND NOT public.prayer_is_teen(p)
    AND p."prayerConsent" IS DISTINCT FROM 'OUT'
    AND (p_pool = 'NAME' OR EXISTS (
      SELECT 1 FROM public."FaithProject" f
      WHERE f."participantId" = p.id AND f.status = 'SAVED' AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL))
$function$;

CREATE OR REPLACE FUNCTION public.prayer_preview(p_token text, p_slot_id uuid, p_participant_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s public."CorporatePrayerSlot";
  v_person uuid := p_participant_id;
  v_project text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  SELECT * INTO s FROM public."CorporatePrayerSlot" WHERE id = p_slot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF s."slotType" <> 'LIVE' AND v_person IS NULL THEN
    SELECT participant_id INTO v_person FROM public.prayer_pick(s."cohortId", public.prayer_blocks_pool(s.blocks), '{}'::uuid[], public.prayer_lagos_today(), FALSE);
  END IF;
  IF s."slotType" <> 'LIVE' AND public.prayer_blocks_pool(s.blocks) = 'FAITH' THEN
    SELECT f.body INTO v_project FROM public."FaithProject" f WHERE f."participantId" = v_person AND f.status = 'SAVED' LIMIT 1;
  END IF;
  RETURN json_build_object(
    'slot', json_build_object('id', s.id, 'name', s.name, 'time', to_char(s."timeOfDay", 'HH24:MI'), 'slotType', s."slotType", 'timerMinutes', s."timerMinutes"),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_person),
    'blocks', CASE WHEN s."slotType" = 'LIVE' THEN '[]'::jsonb ELSE public.prayer_resolve_blocks(s.blocks, v_project) END,
    'live', CASE WHEN s."slotType" = 'LIVE' THEN json_build_object('telegramLink', s."telegramLink", 'waitMinutes', s."liveWaitMinutes", 'message', s."liveMessage") END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_require_admin(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u "User" := public.app_staff(p_token);
BEGIN
  IF u.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF u.role::text <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_resolve_blocks(p_blocks jsonb, p_project text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(jsonb_agg(r.j ORDER BY r.ord), '[]'::jsonb) FROM (
    SELECT b.ord,
           CASE WHEN b.elem->>'type' = 'VERSE' THEN
                  (SELECT jsonb_build_object('type', 'VERSE', 'title', v.title, 'prayer', v.prayer, 'reference', v.reference)
                   FROM public."CorporatePrayerVerse" v WHERE v.id = (b.elem->>'verseId')::uuid)
                WHEN b.elem->>'type' = 'FAITH_PROJECT' THEN jsonb_build_object('type', 'FAITH_PROJECT', 'text', p_project)
           END AS j
    FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) WITH ORDINALITY AS b(elem, ord)) r
  WHERE r.j IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.prayer_running(p_cohort uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    public.faith_prayers_start_date(p_cohort) IS NOT NULL
    AND public.prayer_lagos_today() >= public.faith_prayers_start_date(p_cohort)
    AND (SELECT c."endDate" IS NULL OR public.prayer_lagos_today() <= c."endDate"::date FROM public."Cohort" c WHERE c.id = p_cohort),
    FALSE)
$function$;

CREATE OR REPLACE FUNCTION public.prayer_session_cohort(p_session uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ SELECT s."cohortId" FROM public."CorporatePrayerSession" s WHERE s.id = p_session $function$;

CREATE OR REPLACE FUNCTION public.prayer_session_target(p_session uuid, p_hub text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT t."participantId" FROM public."CorporatePrayerTarget" t
  WHERE t."sessionId" = p_session
  ORDER BY (t."hubKey" = 'COHORT') DESC, (t."hubKey" = p_hub) DESC, (t."hubKey" = 'NO_HUB') DESC, t."hubKey"
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.prayer_streak(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c record;
  v_today date := public.prayer_lagos_today();
  s record;
  v_group uuid;
  v_group_name text;
  v_group_total integer := 0;
  v_slots json;
  v_milestones json;
  v_pending json;
  v_key text;
  v_name text;
  v_avatar text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RETURN json_build_object('available', FALSE); END IF;
  IF NOT public.prayer_running(c.cohort_id) THEN
    RETURN json_build_object('available', FALSE, 'notStarted', TRUE);
  END IF;

  SELECT * INTO s FROM public.prayer_streak_calc(c.kind, c.person_id, c.cohort_id, c.hub_key);

  IF c.kind = 'PARTICIPANT' THEN
    SELECT p."fullName", p."avatarUrl" INTO v_name, v_avatar FROM public."Participant" p WHERE p.id = c.person_id;
  ELSE
    SELECT u.name, u."avatarUrl" INTO v_name, v_avatar FROM public."User" u WHERE u.id = c.person_id;
  END IF;

  -- Remember each milestone the first time it is seen.
  FOR v_key IN SELECT jsonb_object_keys(s.reached) LOOP
    INSERT INTO public."PrayerMilestone" ("personKind", "personId", "cohortId", milestone, "earnedOn")
    VALUES (c.kind, c.person_id, c.cohort_id, v_key::integer, (s.reached ->> v_key)::date)
    ON CONFLICT DO NOTHING;
  END LOOP;

  SELECT COALESCE(json_agg(json_build_object('milestone', m.milestone, 'earnedOn', m."earnedOn") ORDER BY m.milestone), '[]'::json)
    INTO v_milestones FROM public."PrayerMilestone" m WHERE m."personKind" = c.kind AND m."personId" = c.person_id AND m."cohortId" = c.cohort_id;
  SELECT json_build_object('milestone', m.milestone, 'earnedOn', m."earnedOn") INTO v_pending
    FROM public."PrayerMilestone" m WHERE m."personKind" = c.kind AND m."personId" = c.person_id AND m."cohortId" = c.cohort_id AND m."seenAt" IS NULL
    ORDER BY m.milestone DESC LIMIT 1;

  -- The group whose prayers add up: a participant's own group, a support's group.
  IF c.kind = 'PARTICIPANT' THEN
    SELECT g.id, g.name INTO v_group, v_group_name FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
  ELSE
    SELECT g.id, g.name INTO v_group, v_group_name FROM public."Group" g WHERE g."supportId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
  END IF;
  IF v_group IS NOT NULL THEN
    SELECT count(*)::integer INTO v_group_total
    FROM public."CorporatePrayerCheckin" k
    JOIN public."CorporatePrayerSession" x ON x.id = k."sessionId"
    JOIN public."CorporatePrayerSlot" xs ON xs.id = x."slotId" AND NOT xs."isTest"
    JOIN public."GroupParticipant" gp ON gp."participantId" = k."personId" AND gp."groupId" = v_group
    WHERE k."personKind" = 'PARTICIPANT' AND k."amenAt" IS NOT NULL AND x."cohortId" = c.cohort_id AND x."prayerDate" > v_today - 7;
  END IF;

  -- Today's slots, with whether this person has finished each one.
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."opensAt"), '[]'::json) INTO v_slots FROM (
    SELECT sl.id AS "slotId", sl.name, sl."slotType",
           ((v_today + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') AS "opensAt",
           ((v_today + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') + make_interval(mins => sl."joinWindowMinutes") AS "closesAt",
           x.id AS "sessionId",
           (k."amenAt" IS NOT NULL) AS amen,
           (k."sessionId" IS NOT NULL AND k."amenAt" IS NULL) AS joined
    FROM public."CorporatePrayerSlot" sl
    LEFT JOIN public."CorporatePrayerSession" x ON x."slotId" = sl.id AND x."prayerDate" = v_today
    LEFT JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = x.id AND k."personKind" = c.kind AND k."personId" = c.person_id
    WHERE sl."cohortId" = c.cohort_id AND sl.active AND NOT sl."isTest"
      AND public.prayer_in_audience(sl."audienceAll", sl."hubIds", c.hub_key)
  ) t;

  RETURN json_build_object(
    'available', TRUE,
    'role', c.kind,
    'name', v_name,
    'avatarUrl', v_avatar,
    'cohortName', (SELECT co.name FROM public."Cohort" co WHERE co.id = c.cohort_id),
    'serverNow', now(),
    'today', v_today,
    'current', s.cur,
    'best', s.best,
    'total', s.total,
    'restUsed', s.rest_used,
    'prayedToday', (s.last_day = v_today),
    'days', s.days,
    'milestones', v_milestones,
    'pending', v_pending,
    'groupName', v_group_name,
    'groupWeekTotal', v_group_total,
    'programmeDays', (SELECT GREATEST(0, (co."endDate"::date - public.faith_prayers_start_date(c.cohort_id) + 1)) FROM public."Cohort" co WHERE co.id = c.cohort_id),
    'slots', v_slots);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_streak_calc(p_kind text, p_person uuid, p_cohort uuid, p_hub text)
 RETURNS TABLE(cur integer, best integer, total integer, rest_used boolean, reached jsonb, last_day date, days jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_today date := public.prayer_lagos_today();
  v_run integer := 0;
  v_best integer := 0;
  v_rest_week date;
  v_week date;
  v_reached jsonb := '{}'::jsonb;
  v_last date;
  v_days jsonb := '[]'::jsonb;
  v_n integer;
  v_missed boolean := FALSE;
  v_end date;
BEGIN
  SELECT c."endDate"::date INTO v_end FROM public."Cohort" c WHERE c.id = p_cohort;
  FOR r IN
    SELECT s."prayerDate" AS d, COALESCE(bool_or(k."amenAt" IS NOT NULL), FALSE) AS prayed
    FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND NOT sl."isTest"
    LEFT JOIN public."CorporatePrayerCheckin" k
      ON k."sessionId" = s.id AND k."personKind" = p_kind AND k."personId" = p_person
    WHERE s."cohortId" = p_cohort AND s."prayerDate" <= v_today
      AND (public.prayer_in_audience(s."audienceAll", s."hubIds", p_hub) OR k."sessionId" IS NOT NULL)
    GROUP BY s."prayerDate"
    ORDER BY s."prayerDate"
  LOOP
    IF r.prayed THEN
      v_run := v_run + 1;
      v_last := r.d;
      v_best := GREATEST(v_best, v_run);
      FOREACH v_n IN ARRAY ARRAY[5, 10, 21, 30, 70] LOOP
        IF v_run = v_n AND NOT (v_reached ? v_n::text) THEN
          v_reached := v_reached || jsonb_build_object(v_n::text, r.d);
        END IF;
      END LOOP;
    ELSIF r.d < v_today THEN
      v_missed := TRUE;
      v_week := date_trunc('week', r.d)::date;
      IF v_run > 0 AND v_rest_week IS DISTINCT FROM v_week THEN
        v_rest_week := v_week;
      ELSE
        v_run := 0;
      END IF;
    END IF;
    IF r.d > v_today - 7 THEN
      v_days := v_days || jsonb_build_array(jsonb_build_object('date', r.d, 'prayed', r.prayed));
    END IF;
  END LOOP;

  -- Full cohort: every prayer day prayed, through the cohort's last day.
  IF NOT v_missed AND v_end IS NOT NULL AND v_last = v_end AND NOT (v_reached ? '70') THEN
    v_reached := v_reached || jsonb_build_object('70', v_end);
  END IF;

  RETURN QUERY SELECT
    v_run, v_best,
    (SELECT count(*)::integer FROM public."CorporatePrayerCheckin" k
       JOIN public."CorporatePrayerSession" s ON s.id = k."sessionId"
       JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND NOT sl."isTest"
       WHERE s."cohortId" = p_cohort AND k."personKind" = p_kind AND k."personId" = p_person AND k."amenAt" IS NOT NULL),
    v_rest_week IS NOT DISTINCT FROM date_trunc('week', v_today)::date,
    v_reached, v_last, v_days;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prayer_user_cohort(p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT uc."cohortId" FROM public."UserCohort" uc
  WHERE uc."userId" = p_user AND uc."cohortId" = public.current_programme_cohort_id()
$function$;

CREATE OR REPLACE FUNCTION public.prayer_user_hub(p_cohort uuid, p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((SELECT hm."hubId"::text FROM public."HubMembership" hm
                   WHERE hm."userId" = p_user AND hm."cohortId" = p_cohort ORDER BY hm."createdAt" LIMIT 1), 'NO_HUB')
$function$;

CREATE OR REPLACE FUNCTION public.private_file_paths(p_kind text, p_ids uuid[])
 RETURNS TABLE(id uuid, path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH me AS (
    SELECT public.app_is_staff() AS staff, public.app_participant_id(public.app_current_token()) AS pid
  ),
  wanted AS (
    SELECT r.* FROM public."Resource" r
    WHERE (p_kind = 'resource' AND r.id = ANY(p_ids))
       OR (p_kind = 'version' AND r.id IN (SELECT v."resourceId" FROM public."ResourceVersion" v WHERE v.id = ANY(p_ids)))
  ),
  allowed AS (
    SELECT w.id FROM wanted w, me
    WHERE (me.staff AND public.resource_visible_to_staff(w."cohortId", w."visibleToSupports", w."hubIds"))
       OR (me.pid IS NOT NULL AND COALESCE(w."visibleToParticipants", FALSE)
           AND (w."cohortId" IS NULL OR w."cohortId" = (SELECT p."cohortId" FROM public."Participant" p WHERE p.id = me.pid)))
  )
  SELECT r.id, substring(r.url FROM length('fof-private:') + 1) FROM public."Resource" r
  WHERE p_kind = 'resource' AND r.id IN (SELECT a.id FROM allowed a) AND r.url LIKE 'fof-private:%'
  UNION ALL
  SELECT v.id, substring(v.url FROM length('fof-private:') + 1) FROM public."ResourceVersion" v
  WHERE p_kind = 'version' AND v.id = ANY(p_ids) AND v."resourceId" IN (SELECT a.id FROM allowed a) AND v.url LIKE 'fof-private:%';
$function$;

CREATE OR REPLACE FUNCTION public.profile_completion_for(p_participant_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH p AS (
    SELECT pa.*, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = pa."followUpContactId") AS lead_occupation
    FROM "Participant" pa WHERE pa.id = p_participant_id
  ),
  checks AS (
    SELECT unnest(ARRAY[
      NULLIF(trim(COALESCE(p."avatarUrl", '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p.gender, '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p."ageRange", '')), '') IS NOT NULL,
      p."dateOfBirth" IS NOT NULL,
      NULLIF(trim(COALESCE(p.occupation, p.lead_occupation, '')), '') IS NOT NULL
    ]) AS done
    FROM p
    UNION ALL
    SELECT NULLIF(trim(COALESCE(a.value, '')), '') IS NOT NULL
    FROM "ProfileField" f
    LEFT JOIN "ProfileFieldAnswer" a ON a."fieldId" = f.id AND a."participantId" = p_participant_id
    WHERE f.required AND public.profile_field_applies(f, p_participant_id)
  )
  SELECT json_build_object(
    'percent', CASE WHEN count(*) = 0 THEN 100 ELSE round(100.0 * count(*) FILTER (WHERE done) / count(*))::int END,
    'missing', count(*) FILTER (WHERE NOT done)
  )
  FROM checks;
$function$;

CREATE OR REPLACE FUNCTION public.profile_field_applies(f "ProfileField", p_participant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT f."archivedAt" IS NULL AND (
    CASE
      WHEN COALESCE(array_length(f."participantIds", 1), 0) > 0 THEN p_participant_id = ANY (f."participantIds")
      ELSE EXISTS (
        SELECT 1 FROM "Participant" p
        WHERE p.id = p_participant_id
          AND p."cohortId" = ANY (f."cohortIds")
          AND (
            f."groupIds" IS NULL
            OR EXISTS (SELECT 1 FROM "GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = ANY (f."groupIds"))
          )
      )
    END
  );
$function$;

CREATE OR REPLACE FUNCTION public.profile_field_summary()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(json_agg(json_build_object(
    'fieldId', f.id,
    'applies', (SELECT count(*) FROM "Participant" p WHERE p.status = 'ACTIVE' AND public.profile_field_applies(f, p.id)),
    'answered', (
      SELECT count(*) FROM "ProfileFieldAnswer" a JOIN "Participant" p ON p.id = a."participantId"
      WHERE a."fieldId" = f.id AND NULLIF(trim(COALESCE(a.value, '')), '') IS NOT NULL AND p.status = 'ACTIVE'
    )
  )), '[]'::json)
  FROM "ProfileField" f;
$function$;

CREATE OR REPLACE FUNCTION public.public_fof_landing()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_registration_link TEXT;
  v_class_start_time TEXT;
  v_landing_images JSONB;
  v_landing_content JSONB;
  v_cohort RECORD;
BEGIN
  SELECT value #>> '{}' INTO v_registration_link
  FROM public."AppSetting"
  WHERE "settingKey" = 'registration_link';

  SELECT value #>> '{}' INTO v_class_start_time
  FROM public."AppSetting"
  WHERE "settingKey" = 'class_start_time';

  -- {hero, group, class} public storage URLs (Settings > Programme >
  -- Website photos); any/all may be absent, the landing page falls back to
  -- a gradient wherever a slot is missing.
  SELECT value INTO v_landing_images
  FROM public."AppSetting"
  WHERE "settingKey" = 'landing_images';

  -- Admin-editable landing page copy (Settings > Website). Absent/partial
  -- is fine — the frontend deep-merges this against its own defaults.
  SELECT value INTO v_landing_content
  FROM public."AppSetting"
  WHERE "settingKey" = 'landing_content';

  SELECT id, name, "startDate" INTO v_cohort
  FROM public."Cohort"
  WHERE "startDate" IS NOT NULL
    AND "startDate" > NOW()
    AND name NOT LIKE 'ZZ%'
  ORDER BY "startDate" ASC
  LIMIT 1;

  RETURN json_build_object(
    'registrationLink', COALESCE(v_registration_link, ''),
    'nextCohort', CASE WHEN v_cohort.id IS NULL THEN NULL
      ELSE json_build_object('name', v_cohort.name, 'startDate', v_cohort."startDate")
    END,
    'classStartTime', v_class_start_time,
    'landingImages', COALESCE(v_landing_images, '{}'::jsonb),
    'landingContent', COALESCE(v_landing_content, '{}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.push_kind_label(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_kind = 'OPEN_CONTACTS_8AM' THEN 'Follow-ups need attention (8am push)'
    WHEN p_kind LIKE 'NO_ACTIVITY_%' THEN 'No activity on your follow-ups'
    WHEN p_kind = 'GROUP_MEETING' THEN 'Group meeting reminder'
    WHEN p_kind = 'HUB_MEETING' THEN 'Hub meeting reminder'
    WHEN p_kind = 'HUB_LEADS_MEETING' THEN 'Hub Leads meeting reminder'
    WHEN p_kind = 'ACTIVITY' THEN 'Activity reminder'
    WHEN p_kind = 'RECAP_SUPPORT' THEN 'Class recap reminder'
    WHEN p_kind = 'MANUAL_SUPPORT' THEN 'Class manual reminder'
    ELSE p_kind
  END;
$function$;

CREATE OR REPLACE FUNCTION public.recap_auto_release_at(p_start_date date, p_week_number integer, p_meeting_day text, p_meeting_time text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN p_start_date IS NULL THEN NULL
    WHEN p_meeting_day IS NOT NULL AND p_meeting_time ~ '^[0-9]{1,2}:[0-9]{2}$' THEN
      ((p_start_date + (p_week_number - 1) * 7
          + (array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_meeting_day)) - 1)
       )::TIMESTAMP + p_meeting_time::TIME) AT TIME ZONE 'Africa/Lagos' + INTERVAL '1 hour'
    ELSE (p_start_date + p_week_number * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.recap_release_at(p_class_date date, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings JSONB;
  v_day TEXT;
  v_time TEXT;
  v_offset INTEGER;
BEGIN
  IF p_class_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_settings FROM "AppSetting" WHERE "settingKey" = 'recap_release_times';

  IF p_audience = 'support' THEN
    v_day := COALESCE(v_settings->>'supportDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'supportTime', '16:00');
  ELSIF p_audience = 'manual' THEN
    v_day := COALESCE(v_settings->>'manualDay', 'THURSDAY');
    v_time := COALESCE(v_settings->>'manualTime', '18:00');
  ELSE
    v_day := COALESCE(v_settings->>'participantDay', 'MONDAY');
    v_time := COALESCE(v_settings->>'participantTime', '18:00');
  END IF;

  v_offset := GREATEST(0, array_position(
    ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],
    upper(v_day)
  ) - 1);

  IF v_time !~ '^[0-9]{1,2}:[0-9]{2}$' THEN
    v_time := '00:00';
  END IF;

  -- The manual goes out before class: the chosen weekday on or before that
  -- week's class Sunday (Thursday = 3 days before). Recaps come after class.
  IF p_audience = 'manual' THEN
    RETURN (
      (p_class_date - ((7 - v_offset) % 7))::TIMESTAMP + v_time::TIME
    ) AT TIME ZONE 'Africa/Lagos';
  END IF;

  RETURN (
    (p_class_date + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

CREATE OR REPLACE FUNCTION public.recap_release_at(p_start_date date, p_week_number integer, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.recap_release_at(p_start_date + (p_week_number - 1) * 7, p_audience);
$function$;

CREATE OR REPLACE FUNCTION public.record_check_in(p_token text, p_response text, p_sunday_misses integer, p_meeting_misses integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  support_id UUID;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_response NOT IN ('OKAY', 'NEED_HELP') THEN
    RAISE EXCEPTION 'Unknown response';
  END IF;

  INSERT INTO "ParticipantCheckIn" ("participantId", response, "sundayMisses", "meetingMisses")
  VALUES (person_id, p_response, GREATEST(COALESCE(p_sunday_misses, 0), 0), GREATEST(COALESCE(p_meeting_misses, 0), 0));

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object('supportId', support_id, 'cohortId', (SELECT "cohortId" FROM "Participant" WHERE id = person_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_follow_up_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.notes, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
    RETURN NEW;
  END IF;
  INSERT INTO "FollowUpNoteHistory" ("contactId", body, "authorId")
  VALUES (NEW.id, NEW.notes, public.app_current_user_id());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_participant_app_state(p_token text, p_installed boolean, p_device text, p_notifications text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  state_row "ParticipantAppState"%ROWTYPE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  INSERT INTO "ParticipantAppState" ("participantId", "installedAt", "lastOpenedInstalledAt", "lastSeenAt", device, "notificationState")
  VALUES (
    person_id,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_installed THEN NOW() END,
    NOW(),
    CASE WHEN p_device IN ('ios', 'ios-inapp', 'android', 'desktop') THEN p_device END,
    CASE WHEN p_notifications IN ('granted', 'denied', 'default', 'unsupported') THEN p_notifications END
  )
  ON CONFLICT ("participantId") DO UPDATE SET
    "installedAt" = COALESCE("ParticipantAppState"."installedAt", EXCLUDED."installedAt"),
    "lastOpenedInstalledAt" = COALESCE(EXCLUDED."lastOpenedInstalledAt", "ParticipantAppState"."lastOpenedInstalledAt"),
    "lastSeenAt" = NOW(),
    device = COALESCE(EXCLUDED.device, "ParticipantAppState".device),
    "notificationState" = COALESCE(EXCLUDED."notificationState", "ParticipantAppState"."notificationState"),
    "updatedAt" = NOW()
  RETURNING * INTO state_row;

  RETURN json_build_object(
    'installedBefore', state_row."installedAt" IS NOT NULL,
    'sheetDismissed', state_row."sheetDismissed"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_participant_setup_sheet(p_token text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_action NOT IN ('shown', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO "ParticipantAppState" ("participantId", "sheetShown", "sheetDismissed", "lastSheetAt")
  VALUES (person_id, CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END, CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET
    "sheetShown" = "ParticipantAppState"."sheetShown" + CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END,
    "sheetDismissed" = "ParticipantAppState"."sheetDismissed" + CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END,
    "lastSheetAt" = NOW(),
    "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_user_app_state(p_installed boolean, p_device text, p_notifications text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
  state_row "UserAppState"%ROWTYPE;
BEGIN
  IF me IS NULL OR NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  INSERT INTO "UserAppState" ("userId", "installedAt", "lastOpenedInstalledAt", device, "notificationState")
  VALUES (
    me,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_device IN ('ios', 'ios-inapp', 'android', 'desktop') THEN p_device END,
    CASE WHEN p_notifications IN ('granted', 'denied', 'default', 'unsupported') THEN p_notifications END
  )
  ON CONFLICT ("userId") DO UPDATE SET
    "installedAt" = COALESCE("UserAppState"."installedAt", EXCLUDED."installedAt"),
    "lastOpenedInstalledAt" = COALESCE(EXCLUDED."lastOpenedInstalledAt", "UserAppState"."lastOpenedInstalledAt"),
    device = COALESCE(EXCLUDED.device, "UserAppState".device),
    "notificationState" = COALESCE(EXCLUDED."notificationState", "UserAppState"."notificationState"),
    "updatedAt" = NOW()
  RETURNING * INTO state_row;

  RETURN json_build_object(
    'installedBefore', state_row."installedAt" IS NOT NULL,
    'sheetDismissed', state_row."sheetDismissed"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_user_setup_sheet(p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF p_action NOT IN ('shown', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO "UserAppState" ("userId", "sheetShown", "sheetDismissed", "lastSheetAt")
  VALUES (me, CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END, CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END, NOW())
  ON CONFLICT ("userId") DO UPDATE SET
    "sheetShown" = "UserAppState"."sheetShown" + CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END,
    "sheetDismissed" = "UserAppState"."sheetDismissed" + CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END,
    "lastSheetAt" = NOW(),
    "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.reflection_activity(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', r."participantId", 'weekId', r."weekId", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
    ))
    FROM "Reflection" r
    JOIN "Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_age_brackets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_people INT;
  v_supports INT;
BEGIN
  WITH due AS (
    SELECT p.id,
           public.age_range_for_age(date_part('year', age(v_today, p."dateOfBirth"))::int) AS wanted
    FROM "Participant" p
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE p."dateOfBirth" IS NOT NULL
      -- A teen stays a teen until their cohort has ended.
      AND NOT (
        replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow')
        AND c.id IS NOT NULL AND c.status::text <> 'COMPLETED' AND (c."endDate" IS NULL OR c."endDate" >= v_today)
      )
  ), changed AS (
    UPDATE "Participant" p
    SET "ageRange" = due.wanted, "updatedAt" = now()
    FROM due
    WHERE p.id = due.id AND due.wanted IS NOT NULL
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') <> replace(lower(due.wanted), ' ', '')
    RETURNING p.id
  )
  SELECT count(*) INTO v_people FROM changed;

  WITH changed AS (
    UPDATE "User" u
    SET "ageRange" = public.support_age_range(u."birthYear", u.birthday)
    WHERE u."birthYear" IS NOT NULL
      AND public.support_age_range(u."birthYear", u.birthday) IS NOT NULL
      AND replace(lower(COALESCE(u."ageRange", '')), ' ', '') <> replace(lower(public.support_age_range(u."birthYear", u.birthday)), ' ', '')
    RETURNING u.id
  )
  SELECT count(*) INTO v_supports FROM changed;

  RETURN jsonb_build_object('participants', v_people, 'supports', v_supports);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_group_meeting(p_token text, p_group_id uuid, p_week_id integer, p_reason text, p_hours integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_group public."Group";
  v_week_number integer;
  v_until timestamptz;
BEGIN
  IF v_actor.id IS NULL OR NOT ('ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(v_reason) > 300 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN RAISE EXCEPTION 'INVALID_HOURS'; END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  SELECT w."weekNumber" INTO v_week_number FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = v_group."cohortId";
  IF v_group.id IS NULL OR v_week_number IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  v_until := now() + make_interval(hours => p_hours);
  -- Not submitted any more (admins are not held to the recording window, so this write is allowed).
  UPDATE public."GroupPrayerStatus" SET done = FALSE, "markedAt" = now() WHERE "groupId" = p_group_id AND "weekId" = p_week_id;
  INSERT INTO public."MeetingRecordingOpening" ("groupId", "weekId", "openUntil", "openedById")
  VALUES (p_group_id, p_week_id, v_until, v_actor.id)
  ON CONFLICT ("groupId", "weekId") WHERE "groupId" IS NOT NULL
  DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  INSERT INTO public."GroupMeetingReopen" ("groupId", "weekId", "reopenedAt", "reopenedById", "reopenReason", "resubmittedAt")
  VALUES (p_group_id, p_week_id, now(), v_actor.id, v_reason, NULL)
  ON CONFLICT ("groupId", "weekId") DO UPDATE SET "reopenedAt" = now(), "reopenedById" = v_actor.id, "reopenReason" = v_reason, "resubmittedAt" = NULL;

  IF v_group."supportId" IS NOT NULL THEN
    PERFORM public.group_meeting_notify(ARRAY[v_group."supportId"],
      format('Week %s meeting reopened', v_week_number),
      format('You can edit your Week %s group meeting report and submit it again until %s.', v_week_number,
             to_char(v_until AT TIME ZONE 'Africa/Lagos', 'Dy FMDD Mon, FMHH12:MI am')),
      '/support/participants?tab=prayers');
  END IF;
  RETURN jsonb_build_object('openUntil', v_until);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_hub_meeting(p_hub_id uuid, p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() AND NOT public.app_hub_can(p_hub_id, 'ATTENDANCE') THEN
    RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can reopen its meeting';
  END IF;

  UPDATE public."SupportSession"
  SET "submittedAt" = NULL
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'No meeting record was found for this week';
  END IF;

  RETURN jsonb_build_object('sessionId', v_session.id, 'hubId', v_session."hubId", 'weekId', v_session."weekId", 'submittedAt', v_session."submittedAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN public.reopen_shared_attendance(p_week_id, 'Reopened from an older version of the app (no reason given)');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session public."AttendanceSession";
  v_window_minutes INTEGER;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_user_ids UUID[];
  v_title TEXT;
  v_body TEXT;
  v_url text;
  v_key text;
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN RAISE EXCEPTION 'Only admins can reopen attendance'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for reopening attendance'; END IF;
  v_reason := left(v_reason, 500);

  SELECT COALESCE((value->>'attendanceWindowMinutes')::INTEGER, 15)
  INTO v_window_minutes
  FROM public."AppSetting" WHERE "settingKey" = 'programme_rules';
  v_window_minutes := GREATEST(1, COALESCE(v_window_minutes, 15));

  -- Only a finalised register can be reopened; checked on the locked row before anything is changed or sent.
  SELECT * INTO v_session FROM public."AttendanceSession" WHERE "weekId" = p_week_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;
  IF v_session."finalizedAt" IS NULL THEN RAISE EXCEPTION 'Attendance is already open'; END IF;

  UPDATE public."AttendanceSession"
  SET "finalizedAt" = NULL,
      "finalizedById" = NULL,
      "finalizationMethod" = NULL,
      "reportNotifiedAt" = NULL,
      "closesAt" = CASE WHEN "closesAt" IS NOT NULL THEN NOW() + make_interval(mins => v_window_minutes) END,
      "reopenedAt" = NOW(),
      "reopenedById" = public.attendance_session_actor_id(),
      "reopenReason" = v_reason,
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  -- Tell the cohort's supports the class is open again.
  SELECT w."cohortId", w."weekNumber" INTO v_cohort_id, v_week_number
  FROM public."Week" w WHERE w.id = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE
    AND COALESCE(u."isTest", FALSE) = FALSE;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) IS NOT NULL THEN
    v_title := format('Attendance reopened · Week %s', v_week_number);
    v_body := 'An admin reopened this class''s register. Open Attendance to check or update your group''s marks.';

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

    IF v_url IS NULL OR v_key IS NULL THEN
      -- No push possible: still write the bell rows.
      RAISE NOTICE 'reopen_shared_attendance: vault secrets missing; bell only';
      INSERT INTO public."Notification" ("userId", title, body, path, type)
      SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
    ELSE
      PERFORM net.http_post(
        url := v_url || '/functions/v1/notify-users',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_key,
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object(
          'userIds', to_jsonb(v_user_ids),
          'title', v_title,
          'body', v_body,
          'path', '/support/attendance',
          'type', 'ATTENDANCE_REPORT'
        ),
        timeout_milliseconds := 25000
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt", 'reopenReason', v_session."reopenReason", 'startedAt', v_session."startedAt", 'closesAt', v_session."closesAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_prayer_verses(p_token text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  UPDATE public."CorporatePrayerVerse" v SET "sortOrder" = o.ord - 1, "updatedAt" = now()
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE v.id = o.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_scriptures(ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  SET CONSTRAINTS "Scripture_dayNumber_key" DEFERRED;
  UPDATE "Scripture" s
  SET "dayNumber" = t.pos
  FROM (SELECT id, ordinality AS pos FROM unnest(ids) WITH ORDINALITY AS u(id, ordinality)) t
  WHERE s.id = t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reply_manual_question(p_id uuid, p_reply text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
  v_reply TEXT := NULLIF(btrim(COALESCE(p_reply, '')), '');
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF v_reply IS NULL THEN RAISE EXCEPTION 'REPLY_REQUIRED'; END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."Group" g WHERE g.id = v_row."groupId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this participant''s support or an admin can reply to this question';
  END IF;

  UPDATE public."ManualQuestion"
  SET status = 'REPLIED', reply = v_reply, "repliedById" = v_actor_id, "repliedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object('id', v_row.id, 'status', v_row.status, 'reply', v_row.reply, 'repliedAt', v_row."repliedAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_followup_login_issue(p_contact_id uuid, p_description text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."FollowUpLoginIssue";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Say what the problem is';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FollowUpContact" WHERE id = p_contact_id) THEN
    RAISE EXCEPTION 'Contact was not found';
  END IF;

  UPDATE public."FollowUpLoginIssue"
  SET description = btrim(p_description),
      "reportedById" = v_actor_id,
      "updatedAt" = NOW()
  WHERE "contactId" = p_contact_id AND status = 'OPEN'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public."FollowUpLoginIssue" ("contactId", "reportedById", description)
    VALUES (p_contact_id, v_actor_id, btrim(p_description))
    RETURNING * INTO v_row;
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'contactId', v_row."contactId",
    'description', v_row.description,
    'status', v_row.status,
    'createdAt', v_row."createdAt",
    'updatedAt', v_row."updatedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_group_meeting_reopen(p_token text, p_group_id uuid, p_week_id integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_group public."Group";
  v_week_number integer;
  v_admins uuid[];
  v_prev timestamptz;
BEGIN
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_group.id IS NULL OR v_group."supportId" IS DISTINCT FROM v_actor.id THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  SELECT w."weekNumber" INTO v_week_number FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = v_group."cohortId";
  IF v_week_number IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(v_reason) > 300 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."GroupPrayerStatus" s WHERE s."groupId" = p_group_id AND s."weekId" = p_week_id AND s.done) THEN
    RAISE EXCEPTION 'NOT_SUBMITTED';
  END IF;
  SELECT r."requestedAt" INTO v_prev FROM public."GroupMeetingReopen" r WHERE r."groupId" = p_group_id AND r."weekId" = p_week_id;
  INSERT INTO public."GroupMeetingReopen" ("groupId", "weekId", "requestedAt", "requestedById", "requestReason")
  VALUES (p_group_id, p_week_id, now(), v_actor.id, v_reason)
  ON CONFLICT ("groupId", "weekId") DO UPDATE SET "requestedAt" = now(), "requestedById" = v_actor.id, "requestReason" = v_reason;

  -- Admins are told once per hour at most for the same group and week (a double tap does not notify twice).
  IF v_prev IS NULL OR v_prev < now() - interval '1 hour' THEN
    SELECT array_agg(u.id) INTO v_admins FROM public."User" u
    WHERE 'ADMIN'::public."Role" = ANY (public.app_user_roles(u)) AND u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE;
    PERFORM public.group_meeting_notify(v_admins,
      format('%s asks to reopen Week %s', split_part(btrim(COALESCE(v_actor.name, 'A support')), ' ', 1), v_week_number),
      format('%s · %s', COALESCE(v_group.name, 'Group'), left(v_reason, 120)),
      '/group-prayers');
  END IF;
  RETURN jsonb_build_object('requestedAt', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_followup_login_issue(p_issue_id uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_issue public."FollowUpLoginIssue";
  v_contact public."FollowUpContact";
  v_signed_in BOOLEAN;
  v_outcome TEXT;
  v_first_name TEXT;
  v_url text;
  v_key text;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_issue FROM public."FollowUpLoginIssue" WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Login issue was not found';
  END IF;
  IF v_issue.status <> 'OPEN' THEN
    RAISE EXCEPTION 'This login issue is already resolved';
  END IF;

  IF NOT public.app_is_admin()
    AND NOT (v_actor_id = ANY(public.followup_contact_it_support_ids(v_issue."contactId", NULL)))
  THEN
    RAISE EXCEPTION 'Only an admin or IT Support can resolve a login issue';
  END IF;

  UPDATE public."FollowUpLoginIssue"
  SET status = 'RESOLVED',
      "resolvedById" = v_actor_id,
      "resolvedAt" = NOW(),
      resolution = NULLIF(btrim(COALESCE(p_note, '')), ''),
      "updatedAt" = NOW()
  WHERE id = p_issue_id
  RETURNING * INTO v_issue;

  v_signed_in := EXISTS (
    SELECT 1 FROM public."Participant" p
    JOIN public."ParticipantAccount" a ON a."participantId" = p.id
    WHERE p."followUpContactId" = v_issue."contactId"
      AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
  );

  IF v_signed_in THEN
    v_outcome := 'ACCESS_CONFIRMED';
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'CLOSE',
        "archivedAt" = COALESCE("archivedAt", NOW()),
        "updatedAt" = NOW()
    WHERE id = v_issue."contactId"
      AND "registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED')
    RETURNING * INTO v_contact;
  ELSE
    -- Same columns as buildStatusPatch('LOGIN_SHARED'): open, still owed a sign-in.
    v_outcome := 'LOGIN_SHARED';
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'LOGIN_SHARED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'SEND_MESSAGE',
        "archivedAt" = NULL,
        "updatedAt" = NOW()
    WHERE id = v_issue."contactId"
      AND "registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE')
    RETURNING * INTO v_contact;
  END IF;

  -- Someone already moved them on by hand (e.g. Not interested, or already
  -- confirmed): leave the contact as it is and just close the issue.
  IF v_contact.id IS NULL THEN
    SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = v_issue."contactId";
    v_outcome := v_contact."registrationStatus";
  END IF;

  -- Tell the owner support. Nothing here may stop the resolve saving.
  BEGIN
    IF v_contact."ownerId" IS NOT NULL AND v_contact."ownerId" <> v_actor_id
      AND v_outcome IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED') THEN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE NOTICE 'resolve_followup_login_issue: vault secrets missing; skipping push';
      ELSE
        v_first_name := COALESCE(NULLIF(split_part(btrim(v_contact."fullName"), ' ', 1), ''), 'Your contact');
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', v_key,
            'Authorization', 'Bearer ' || v_key
          ),
          body := jsonb_build_object(
            'userIds', jsonb_build_array(v_contact."ownerId"),
            'title', format('%s''s login issue is sorted', v_first_name),
            'body', CASE WHEN v_outcome = 'ACCESS_CONFIRMED'
              THEN format('%s is in the app. Their follow-up is done.', btrim(v_contact."fullName"))
              ELSE format('IT Support sorted %s''s login. They haven''t signed in yet, so check they can get in.', btrim(v_contact."fullName"))
            END,
            'path', '/support/mobilisation?tab=follow',
            'type', 'FOLLOWUP_TERMINAL'
          ),
          timeout_milliseconds := 25000
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'resolve_followup_login_issue push failed: %', SQLERRM;
  END;

  RETURN json_build_object(
    'id', v_issue.id,
    'status', v_issue.status,
    'resolvedAt', v_issue."resolvedAt",
    'resolution', v_issue.resolution,
    'contactId', v_issue."contactId",
    'registrationStatus', v_outcome
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resource_replace_document(p_resource_id uuid, p_type text, p_url text, p_file_name text, p_file_size bigint, p_note text, p_visible_to_supports boolean, p_visible_to_participants boolean, p_cohort_id uuid, p_hub_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."Resource";
  v_me UUID := public.app_current_user_id();
  v_new public."Resource";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can update a resource';
  END IF;
  IF NOT (p_visible_to_supports OR p_visible_to_participants) THEN
    RAISE EXCEPTION 'Choose who can see this resource';
  END IF;
  IF p_type IS NOT NULL AND p_type NOT IN ('link', 'pdf', 'doc', 'image', 'file') THEN
    RAISE EXCEPTION 'Invalid resource type';
  END IF;

  SELECT * INTO v_old FROM public."Resource" WHERE id = p_resource_id FOR UPDATE;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Resource was not found';
  END IF;

  IF p_url IS NOT NULL THEN
    INSERT INTO public."ResourceVersion"
      ("resourceId", "versionNo", title, description, type, url, "fileName", "fileSize", note, "createdAt", "createdById", "replacedAt", "replacedById")
    VALUES (
      v_old.id,
      COALESCE((SELECT max(rv."versionNo") FROM public."ResourceVersion" rv WHERE rv."resourceId" = v_old.id), 0) + 1,
      v_old.title, v_old.description, v_old.type, v_old.url, v_old."fileName", v_old."fileSize",
      v_old."updateNote", COALESCE(v_old."updatedAt", v_old."createdAt"), COALESCE(v_old."updatedById", v_old."addedBy"), NOW(), v_me);
  END IF;

  UPDATE public."Resource" r
  SET type = CASE WHEN p_url IS NOT NULL THEN COALESCE(p_type, r.type) ELSE r.type END,
      url = COALESCE(p_url, r.url),
      "fileName" = CASE WHEN p_url IS NOT NULL THEN p_file_name ELSE r."fileName" END,
      "fileSize" = CASE WHEN p_url IS NOT NULL THEN p_file_size ELSE r."fileSize" END,
      "updateNote" = CASE WHEN p_url IS NOT NULL THEN NULLIF(btrim(COALESCE(p_note, '')), '') ELSE r."updateNote" END,
      "updatedAt" = CASE WHEN p_url IS NOT NULL THEN NOW() ELSE r."updatedAt" END,
      "updatedById" = CASE WHEN p_url IS NOT NULL THEN v_me ELSE r."updatedById" END,
      "versionCount" = r."versionCount" + CASE WHEN p_url IS NOT NULL THEN 1 ELSE 0 END,
      "visibleToSupports" = p_visible_to_supports,
      "visibleToParticipants" = p_visible_to_participants,
      "cohortId" = p_cohort_id,
      "hubIds" = COALESCE(p_hub_ids, '{}')
  WHERE r.id = p_resource_id
  RETURNING * INTO v_new;

  RETURN to_jsonb(v_new);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resource_versions(p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cur public."Resource";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see the version history';
  END IF;
  SELECT * INTO v_cur FROM public."Resource" WHERE id = p_resource_id;
  IF v_cur.id IS NULL THEN
    RAISE EXCEPTION 'Resource was not found';
  END IF;

  RETURN jsonb_build_object(
    'current', jsonb_build_object(
      'id', v_cur.id, 'versionNo', v_cur."versionCount" + 1, 'type', v_cur.type, 'url', v_cur.url, 'fileName', v_cur."fileName",
      'fileSize', v_cur."fileSize", 'note', v_cur."updateNote",
      'at', COALESCE(v_cur."updatedAt", v_cur."createdAt"),
      'by', (SELECT u.name FROM public."User" u WHERE u.id = COALESCE(v_cur."updatedById", v_cur."addedBy"))),
    'earlier', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rv.id, 'versionNo', rv."versionNo", 'type', rv.type, 'url', rv.url, 'fileName', rv."fileName",
        'fileSize', rv."fileSize", 'note', rv.note, 'at', rv."createdAt",
        'by', (SELECT u.name FROM public."User" u WHERE u.id = rv."createdById")) ORDER BY rv."versionNo" DESC)
      FROM public."ResourceVersion" rv WHERE rv."resourceId" = p_resource_id), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resource_visible_to_staff(p_cohort_id uuid, p_supports boolean, p_hub_ids uuid[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.app_is_admin() OR (
    public.app_is_staff()
    AND p_supports
    AND (
      p_cohort_id IS NULL
      OR EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = public.app_current_user_id() AND uc."cohortId" = p_cohort_id)
      OR EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."userId" = public.app_current_user_id() AND m."cohortId" = p_cohort_id)
      OR EXISTS (SELECT 1 FROM public."Group" g WHERE g."supportId" = public.app_current_user_id() AND g."cohortId" = p_cohort_id)
    )
    AND (
      cardinality(p_hub_ids) = 0
      OR EXISTS (
        SELECT 1 FROM public."SupportHub" h
        WHERE h.id = ANY(p_hub_ids)
          AND (
            h."leadUserId" = public.app_current_user_id()
            OR h."assistantLeadUserId" = public.app_current_user_id()
            OR public.app_current_user_id() = ANY(h."recapLeadUserIds")
            OR public.app_current_user_id() = ANY(h."prayerLeadUserIds")
            OR EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = h.id AND m."userId" = public.app_current_user_id())
            OR EXISTS (SELECT 1 FROM public."HubItSupport" i WHERE i."hubId" = h.id AND i."userId" = public.app_current_user_id())
          )
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.restart_prayer_cycle(p_token text, p_cohort_id uuid, p_pool text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.prayer_require_admin(p_token);
  v_no integer;
BEGIN
  IF p_pool NOT IN ('FAITH', 'NAME') THEN RAISE EXCEPTION 'INVALID_POOL'; END IF;
  INSERT INTO public."CorporatePrayerCycle" ("cohortId", pool, "cycleNo", "restartedById") VALUES (p_cohort_id, p_pool, 2, u.id)
  ON CONFLICT ("cohortId", pool) DO UPDATE SET "cycleNo" = public."CorporatePrayerCycle"."cycleNo" + 1, "startedAt" = now(), "restartedById" = u.id
  RETURNING "cycleNo" INTO v_no;
  RETURN v_no;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_testimony(p_id uuid, p_status text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor_id UUID;
  v_row "Testimony";
BEGIN
  IF NOT public.app_is_staff() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_status NOT IN ('APPROVED', 'HIDDEN') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  v_actor_id := public.app_current_user_id();

  UPDATE "Testimony"
  SET status = p_status, "reviewedById" = v_actor_id, "reviewedAt" = NOW(), "updatedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_status = 'APPROVED' THEN
    INSERT INTO "ParticipantNotification" ("participantId", title, body, path, type)
    VALUES (
      v_row."participantId",
      'Your testimony has been shared',
      'It is now visible to the people you chose to share it with.',
      '/me/journey?tab=testimonies',
      'TESTIMONY_APPROVED'
    );
  END IF;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'participantId', v_row."participantId",
    'reviewedById', v_row."reviewedById", 'reviewedAt', v_row."reviewedAt",
    'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_followup_assignment(p_manual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_max INT;
  v_load JSONB := '{}'::jsonb;    -- "<cohortId|''>|<ownerId>" -> open count
  v_batches JSONB := '{}'::jsonb; -- "<ownerId>" -> {"count": n, "names": [...]}
  v_assigned INT := 0;
  v_stuck_no_gender INT := 0;
  v_stuck_unknown_gender INT := 0;
  v_stuck_invalid_phone INT := 0;
  rec RECORD;
  v_target UUID;
  v_candidate UUID;
  v_load_key TEXT;
  v_current_load INT;
  v_batch JSONB;
  v_names JSONB;
  v_relaxed_adder INT := 0;
  v_relaxed_any INT := 0;
  v_relaxed_over INT := 0;
BEGIN
  IF NOT p_manual THEN
    SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'followup_auto_assign_enabled';
    -- Missing row means on, same convention as scriptures_enabled.
    IF v_enabled IS NOT NULL AND v_enabled = to_jsonb(false) THEN
      RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'stuckNoGender', 0, 'stuckUnknownGender', 0, 'stuckInvalidPhone', 0, 'batches', '{}'::jsonb);
    END IF;
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- Seed each support's current open load per cohort. "Open" mirrors
  -- openLoadByOwner / isClosedContact in frontend/src/utils/followUps.ts:
  -- not archived and not closed (Access confirmed, not interested, no response, wrong number).
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL
      AND c."archivedAt" IS NULL
      AND c."isTest" IS NOT TRUE
      -- Same as isClosedContact: only Access confirmed closes a successful one, so
      -- Registered, Login shared and Issue with login (not in the app yet) count
      -- towards the limit.
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
      AND NOT (c."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
               AND (c."replyStatus" = 'INCORRECT_NUMBER' OR c."callStatus" = 'INCORRECT_NUMBER'))
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL
      AND c."archivedAt" IS NULL
      -- Closed outcomes are never handed out again (see fof follow-up cohort rule).
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NEXT_COHORT', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
      AND c."replyStatus" <> 'INCORRECT_NUMBER'
      AND c."callStatus" <> 'INCORRECT_NUMBER'
      -- Test contacts are never handed out; an admin assigns them by hand.
      AND c."isTest" IS NOT TRUE
      AND (p_manual OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())
      AND (p_manual OR c."createdAt" <= now() - interval '2 hours')
    ORDER BY c."createdAt" ASC
  LOOP
    -- Held back until an admin fixes the number: a support can't reach them.
    IF NOT public.followup_phone_is_valid(rec.phone) THEN
      v_stuck_invalid_phone := v_stuck_invalid_phone + 1;
      CONTINUE;
    END IF;

    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck_unknown_gender := v_stuck_unknown_gender + 1;
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Rule 2: whoever added them, if same gender and under the limit.
    IF rec."registeredById" IS NOT NULL THEN
      v_candidate := NULL;
      SELECT u.id INTO v_candidate
      FROM "User" u
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN')
        AND u."isTest" IS NOT TRUE
        AND u."isActive" IS NOT FALSE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id);
      IF v_candidate IS NOT NULL THEN
        v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_candidate::text;
        v_current_load := COALESCE((v_load->>v_load_key)::int, 0);
        IF v_current_load < v_max THEN
          v_target := v_candidate;
        END IF;
      END IF;
    END IF;

    -- Rule 3: same-gender support under the limit, fewest open first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN')
        AND u."isActive" IS NOT FALSE
        AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    -- Relaxed steps, only when the strict rules found nobody (see Settings, Follow-up auto-assignment).
    IF v_target IS NULL AND rec."registeredById" IS NOT NULL AND public.followup_relax_on('followup_relax_adder', TRUE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.id = rec."registeredById" AND u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
      IF v_target IS NOT NULL THEN v_relaxed_adder := v_relaxed_adder + 1; END IF;
    END IF;
    IF v_target IS NULL AND public.followup_relax_on('followup_relax_any_gender', TRUE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
      IF v_target IS NOT NULL THEN v_relaxed_any := v_relaxed_any + 1; END IF;
    END IF;
    IF v_target IS NULL AND public.followup_relax_on('followup_relax_over_limit', FALSE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
      ORDER BY (u.gender = rec.gender) DESC, COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
      IF v_target IS NOT NULL THEN v_relaxed_over := v_relaxed_over + 1; END IF;
    END IF;

    IF v_target IS NULL THEN
      v_stuck_no_gender := v_stuck_no_gender + 1;
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = rec.id;

    v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_load_key], to_jsonb(COALESCE((v_load->>v_load_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN
      v_names := v_names || to_jsonb(rec."fullName");
    END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true,
    'assigned', v_assigned,
    'stuckNoGender', v_stuck_no_gender,
    'stuckUnknownGender', v_stuck_unknown_gender,
    'stuckInvalidPhone', v_stuck_invalid_phone,
    'relaxedAdder', v_relaxed_adder,
    'relaxedAnyGender', v_relaxed_any,
    'relaxedOverLimit', v_relaxed_over,
    'batches', v_batches
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_followup_reassignment()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_max INT;
  v_load JSONB := '{}'::jsonb;
  v_active UUID[];
  v_prompted JSONB := '[]'::jsonb;
  v_to JSONB := '{}'::jsonb;
  v_from JSONB := '{}'::jsonb;
  v_stuck INT := 0;
  v_moved INT := 0;
  rec RECORD;
  k RECORD;
  c RECORD;
  v_target UUID;
  v_key TEXT;
  v_entry JSONB;
  v_names JSONB;
BEGIN
  IF NOT public.followup_reassign_enabled() THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- 1. A check whose person has been moved (or who has nobody left stale) is done.
  UPDATE "FollowUpOwnerCheck" ck SET "closedAt" = now(), "closedReason" = 'MOVED'
  WHERE ck."closedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = ck."ownerId");

  -- 2. New checks for supports holding people who have not moved in 24h.
  FOR rec IN
    SELECT s."ownerId" AS owner_id, COUNT(*) AS cnt,
           (array_agg(split_part(s."fullName", ' ', 1) ORDER BY s."ownerAssignedAt"))[1:3] AS names
    FROM public.followup_stale_contacts() s
    WHERE NOT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" ck WHERE ck."ownerId" = s."ownerId" AND ck."closedAt" IS NULL)
    GROUP BY s."ownerId"
  LOOP
    INSERT INTO "FollowUpOwnerCheck" ("ownerId", "deadlineAt") VALUES (rec.owner_id, now() + interval '24 hours');
    v_prompted := v_prompted || jsonb_build_array(jsonb_build_object('ownerId', rec.owner_id, 'count', rec.cnt, 'names', to_jsonb(rec.names)));
  END LOOP;

  -- 3. Checks that are due: hand the still-unmoved people to supports who are moving people.
  IF EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now()) THEN
    SELECT COALESCE(array_agg(a), ARRAY[]::UUID[]) INTO v_active FROM public.followup_active_supports() a;

    -- Each support's current open load per cohort, same definition as run_followup_assignment.
    FOR rec IN
      SELECT COALESCE(x."cohortId"::text, '') || '|' || x."ownerId"::text AS key, COUNT(*) AS cnt
      FROM "FollowUpContact" x
      WHERE x."ownerId" IS NOT NULL AND x."archivedAt" IS NULL AND x."isTest" IS NOT TRUE
        AND x."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
        AND NOT (x."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
                 AND (x."replyStatus" = 'INCORRECT_NUMBER' OR x."callStatus" = 'INCORRECT_NUMBER'))
      GROUP BY 1
    LOOP
      v_load := jsonb_set(v_load, ARRAY[rec.key], to_jsonb(rec.cnt));
    END LOOP;

    FOR k IN SELECT * FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now() ORDER BY "deadlineAt" LOOP
      FOR c IN SELECT * FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId" ORDER BY s."ownerAssignedAt" LOOP
        v_target := NULL;
        IF c.gender IN ('Male', 'Female') THEN
          SELECT u.id INTO v_target
          FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.gender = c.gender
            AND u.id <> k."ownerId"
            AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id)
            AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        -- Relaxed steps, only when no same-gender receiver was found.
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_adder', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE u.id = (SELECT x."registeredById" FROM "FollowUpContact" x WHERE x.id = c.id)
            AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_any_gender', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_over_limit', FALSE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
          ORDER BY (u.gender = c.gender) DESC, COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        IF v_target IS NULL THEN
          v_stuck := v_stuck + 1;
          CONTINUE;
        END IF;

        UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = c.id;
        INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
        VALUES (c.id, k."ownerId", v_target, CASE WHEN k.answer = 'NOT_NOW' THEN 'NOT_NOW' WHEN k.extended THEN 'NO_MOVEMENT_AFTER_YES' ELSE 'NO_RESPONSE' END);

        v_key := COALESCE(c."cohortId"::text, '') || '|' || v_target::text;
        v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

        v_entry := COALESCE(v_to->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(c."fullName"); END IF;
        v_to := jsonb_set(v_to, ARRAY[v_target::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_entry := COALESCE(v_from->k."ownerId"::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(split_part(c."fullName", ' ', 1)); END IF;
        v_from := jsonb_set(v_from, ARRAY[k."ownerId"::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_moved := v_moved + 1;
      END LOOP;

      -- Done only when nobody stale is left; otherwise keep it open and retry quietly next time.
      IF NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId") THEN
        UPDATE "FollowUpOwnerCheck" SET "closedAt" = now(), "closedReason" = 'REASSIGNED' WHERE id = k.id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('enabled', true, 'prompted', v_prompted, 'movedTo', v_to, 'movedFrom', v_from, 'moved', v_moved, 'stuckNoReceiver', v_stuck);
END;
$function$;

CREATE OR REPLACE FUNCTION public.safe_user_json(u "User")
 RETURNS json
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'phone', u.phone,
    'role', u.role,
    'roles', public.app_user_roles(u),
    'isActive', u."isActive",
    'isCoordinator', u."isCoordinator",
    'avatarUrl', u."avatarUrl",
    'themeColor', u."themeColor",
    'whatsappGroupUrl', u."whatsappGroupUrl",
    'hubLastSeenAt', u."hubLastSeenAt",
    'onboardingCompleted', u."onboardingCompleted",
    'onboardingReplayCount', u."onboardingReplayCount",
    'onboardingLastReplayAt', u."onboardingLastReplayAt",
    'mustChangePassword', u."mustChangePassword",
    'gender', u.gender,
    'ageRange', u."ageRange",
    'createdAt', u."createdAt",
    'updatedAt', u."updatedAt"
  );
$function$;

CREATE OR REPLACE FUNCTION public.save_faith_project(p_token text, p_body text, p_submit boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  project "FaithProject";
  support_id UUID;
  cleaned TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_created BOOLEAN := FALSE;
  v_changed BOOLEAN := FALSE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'PROJECT_REQUIRED';
  END IF;
  PERFORM set_config('fof.faith_by_participant', '1', TRUE);

  SELECT * INTO project FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;

  IF project.id IS NULL THEN
    INSERT INTO "FaithProject" ("participantId", body, status, "sharedForPrayer")
    VALUES (person_id, cleaned, 'SAVED', COALESCE((SELECT p."prayerConsent" = 'IN' FROM "Participant" p WHERE p.id = person_id), FALSE))
    RETURNING * INTO project;
    v_created := TRUE;
    v_changed := TRUE;
  ELSIF project.status IS DISTINCT FROM 'SAVED' OR project.body IS DISTINCT FROM cleaned THEN
    v_created := project.status IS DISTINCT FROM 'SAVED';
    v_changed := TRUE;
    UPDATE "FaithProject"
    SET body = cleaned, status = 'SAVED', "updatedById" = NULL, "updatedAt" = NOW()
    WHERE id = project.id
    RETURNING * INTO project;
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'project', json_build_object('id', project.id, 'body', project.body, 'status', project.status, 'updatedAt', project."updatedAt", 'sharedForPrayer', project."sharedForPrayer"),
    'supportId', support_id,
    'created', v_created,
    'changed', v_changed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_manual_note(p_token text, p_week_id integer, p_body text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort_id UUID;
  v_row "ManualNote";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT "cohortId" INTO v_cohort_id FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (SELECT 1 FROM "Week" WHERE id = p_week_id AND "cohortId" = v_cohort_id) THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  INSERT INTO "ManualNote" ("participantId", "weekId", body, "updatedAt")
  VALUES (person_id, p_week_id, COALESCE(p_body, ''), NOW())
  ON CONFLICT ("participantId", "weekId") DO UPDATE SET body = EXCLUDED.body, "updatedAt" = NOW()
  RETURNING * INTO v_row;

  RETURN json_build_object('weekId', v_row."weekId", 'body', v_row.body, 'updatedAt', v_row."updatedAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_participant_profile(p_token text, p_email text, p_gender text, p_age_range text, p_occupation text, p_date_of_birth date, p_answers jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cleaned_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  entry RECORD;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned_email IS NOT NULL AND cleaned_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  IF p_date_of_birth IS NOT NULL AND (p_date_of_birth > CURRENT_DATE OR p_date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'INVALID_DATE_OF_BIRTH';
  END IF;

  UPDATE "Participant"
  SET email = cleaned_email,
      gender = NULLIF(trim(COALESCE(p_gender, '')), ''),
      "ageRange" = NULLIF(trim(COALESCE(p_age_range, '')), ''),
      occupation = NULLIF(trim(COALESCE(p_occupation, '')), ''),
      "dateOfBirth" = p_date_of_birth,
      "updatedAt" = NOW()
  WHERE id = person_id;

  FOR entry IN SELECT key, value FROM jsonb_each_text(COALESCE(p_answers, '{}'::jsonb)) LOOP
    IF EXISTS (
      SELECT 1 FROM "ProfileField" f
      WHERE f.id::text = entry.key AND public.profile_field_applies(f, person_id)
    ) THEN
      INSERT INTO "ProfileFieldAnswer" ("fieldId", "participantId", value, "updatedAt")
      VALUES (entry.key::uuid, person_id, NULLIF(trim(COALESCE(entry.value, '')), ''), NOW())
      ON CONFLICT ("fieldId", "participantId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
    END IF;
  END LOOP;

  RETURN public.profile_completion_for(person_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_participant_push(p_token text, p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF COALESCE(p_endpoint, '') = '' OR COALESCE(p_p256dh, '') = '' OR COALESCE(p_auth, '') = '' THEN
    RAISE EXCEPTION 'Invalid push subscription';
  END IF;
  INSERT INTO "ParticipantPushSubscription" ("participantId", endpoint, p256dh, auth)
  SELECT x.pid, p_endpoint, p_p256dh, p_auth
  FROM (
    SELECT person_id AS pid
    UNION
    SELECT f.id FROM public.shared_number_people(person_id) f
    WHERE f.has_login AND NOT COALESCE((public.app_session(p_token))."viaTeenNumber", FALSE)
  ) x
  ON CONFLICT ("participantId", endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_participant_reminders(p_token text, p_meeting_minutes jsonb, p_recap_released boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF jsonb_typeof(COALESCE(p_meeting_minutes, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid reminder timings';
  END IF;
  INSERT INTO "ParticipantReminderSetting" ("participantId", "meetingRemindMinutes", "recapReleased", "updatedAt")
  VALUES (person_id, COALESCE(p_meeting_minutes, '[]'::jsonb), COALESCE(p_recap_released, TRUE), NOW())
  ON CONFLICT ("participantId") DO UPDATE SET
    "meetingRemindMinutes" = EXCLUDED."meetingRemindMinutes",
    "recapReleased" = EXCLUDED."recapReleased",
    "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_reflection(p_token text, p_week_id integer, p_stood_out text, p_goal text, p_goal_check text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  existing "Reflection";
  week_released BOOLEAN;
  saved "Reflection";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NULLIF(trim(COALESCE(p_goal, '')), '') IS NULL THEN
    RAISE EXCEPTION 'GOAL_REQUIRED';
  END IF;

  SELECT (w->>'released')::BOOLEAN INTO week_released
  FROM json_array_elements(public.participant_home(p_token)->'weeks') w
  WHERE (w->>'id')::INTEGER = p_week_id;
  IF week_released IS NOT TRUE THEN
    RAISE EXCEPTION 'RECAP_NOT_RELEASED';
  END IF;

  SELECT * INTO existing FROM "Reflection" WHERE "participantId" = person_id AND "weekId" = p_week_id;
  IF existing.id IS NOT NULL AND existing."createdAt" < NOW() - INTERVAL '7 days' THEN
    RAISE EXCEPTION 'REFLECTION_LOCKED';
  END IF;

  INSERT INTO "Reflection" ("participantId", "weekId", "stoodOut", goal, "goalCheck")
  VALUES (person_id, p_week_id, NULLIF(trim(COALESCE(p_stood_out, '')), ''), trim(p_goal), NULLIF(trim(COALESCE(p_goal_check, '')), ''))
  ON CONFLICT ("participantId", "weekId") DO UPDATE SET
    "stoodOut" = EXCLUDED."stoodOut",
    goal = EXCLUDED.goal,
    "goalCheck" = EXCLUDED."goalCheck",
    "updatedAt" = NOW()
  RETURNING * INTO saved;

  RETURN json_build_object(
    'weekId', saved."weekId", 'stoodOut', saved."stoodOut", 'goal', saved.goal, 'goalCheck', saved."goalCheck",
    'goalDoneAt', saved."goalDoneAt", 'createdAt', saved."createdAt", 'updatedAt', saved."updatedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.scripture_engagement_summary(p_token text, p_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'dayNumber', s."dayNumber",
      'likes', COALESCE(c.likes, 0), 'downloads', COALESCE(c.downloads, 0), 'shares', COALESCE(c.shares, 0)
    ) ORDER BY s."dayNumber")
    FROM "Scripture" s
    LEFT JOIN (
      SELECT e."scriptureId",
             COUNT(*) FILTER (WHERE e.action = 'LIKE') AS likes,
             COUNT(*) FILTER (WHERE e.action = 'DOWNLOAD') AS downloads,
             COUNT(*) FILTER (WHERE e.action = 'SHARE') AS shares
      FROM "ScriptureEngagement" e
      LEFT JOIN "Participant" p ON e."actorKind" = 'PARTICIPANT' AND p.id = e."actorId"
      LEFT JOIN "Cohort" pc ON pc.id = p."cohortId"
      LEFT JOIN "User" u ON e."actorKind" = 'USER' AND u.id = e."actorId"
      WHERE (
              (e."actorKind" = 'PARTICIPANT' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(pc."isPractice", FALSE) = FALSE
                AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id))
           OR (e."actorKind" = 'USER' AND COALESCE(u."isTest", FALSE) = FALSE
                AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id)))
            )
      GROUP BY e."scriptureId"
    ) c ON c."scriptureId" = s.id
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.scripture_my_likes(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  kind TEXT;
  who UUID;
BEGIN
  IF pid IS NOT NULL THEN kind := 'PARTICIPANT'; who := pid;
  ELSIF staff.id IS NOT NULL THEN kind := 'USER'; who := staff.id;
  ELSE RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(s."dayNumber" ORDER BY s."dayNumber")
    FROM "ScriptureEngagement" e JOIN "Scripture" s ON s.id = e."scriptureId"
    WHERE e."actorKind" = kind AND e."actorId" = who AND e.action = 'LIKE'
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.scripture_public_counts(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'dayNumber', s."dayNumber", 'likes', c.likes, 'downloads', c.downloads, 'shares', c.shares
    ) ORDER BY s."dayNumber")
    FROM (
      SELECT e."scriptureId",
             COUNT(*) FILTER (WHERE e.action = 'LIKE') AS likes,
             COUNT(*) FILTER (WHERE e.action = 'DOWNLOAD') AS downloads,
             COUNT(*) FILTER (WHERE e.action = 'SHARE') AS shares
      FROM "ScriptureEngagement" e
      LEFT JOIN "Participant" p ON e."actorKind" = 'PARTICIPANT' AND p.id = e."actorId"
      LEFT JOIN "Cohort" pc ON pc.id = p."cohortId"
      LEFT JOIN "User" u ON e."actorKind" = 'USER' AND u.id = e."actorId"
      WHERE (e."actorKind" = 'PARTICIPANT' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(pc."isPractice", FALSE) = FALSE)
         OR (e."actorKind" = 'USER' AND COALESCE(u."isTest", FALSE) = FALSE)
      GROUP BY e."scriptureId"
    ) c
    JOIN "Scripture" s ON s.id = c."scriptureId"
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.scripture_react(p_token text, p_day_number integer, p_action text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  kind TEXT;
  who UUID;
  sid UUID;
  existed INT;
BEGIN
  IF p_action NOT IN ('LIKE', 'DOWNLOAD', 'SHARE') THEN RAISE EXCEPTION 'BAD_ACTION'; END IF;
  IF pid IS NOT NULL THEN kind := 'PARTICIPANT'; who := pid;
  ELSIF staff.id IS NOT NULL THEN kind := 'USER'; who := staff.id;
  ELSE RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT id INTO sid FROM "Scripture" WHERE "dayNumber" = p_day_number;
  IF sid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_action = 'LIKE' THEN
    DELETE FROM "ScriptureEngagement" WHERE "scriptureId" = sid AND "actorKind" = kind AND "actorId" = who AND action = 'LIKE';
    GET DIAGNOSTICS existed = ROW_COUNT;
    IF existed = 0 THEN
      INSERT INTO "ScriptureEngagement" ("scriptureId", "actorKind", "actorId", action) VALUES (sid, kind, who, 'LIKE')
      ON CONFLICT DO NOTHING;
      RETURN json_build_object('liked', TRUE);
    END IF;
    RETURN json_build_object('liked', FALSE);
  END IF;

  -- A double tap should not count twice.
  IF NOT EXISTS (
    SELECT 1 FROM "ScriptureEngagement"
    WHERE "scriptureId" = sid AND "actorKind" = kind AND "actorId" = who AND action = p_action AND "createdAt" > NOW() - INTERVAL '10 seconds'
  ) THEN
    INSERT INTO "ScriptureEngagement" ("scriptureId", "actorKind", "actorId", action) VALUES (sid, kind, who, p_action);
  END IF;
  RETURN json_build_object('ok', TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_acted_as()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor_col TEXT := TG_ARGV[0];
  acted_col TEXT := regexp_replace(TG_ARGV[0], 'Id$', '') || 'ActedAs';
  new_j JSONB := to_jsonb(NEW);
  actor TEXT := to_jsonb(NEW) ->> TG_ARGV[0];
  me UUID := public.app_current_user_id();
  mine BOOLEAN;
  val TEXT := NULL;
BEGIN
  mine := actor IS NOT NULL AND me IS NOT NULL AND actor = me::text;
  IF TG_OP = 'INSERT' OR actor IS DISTINCT FROM (to_jsonb(OLD) ->> actor_col) OR mine THEN
    IF mine THEN val := public.app_acted_as(); END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(acted_col, val));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_ai_opt_in(p_token text, p_opt_in boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "ParticipantAccount"
  SET "aiOptInAt" = CASE WHEN p_opt_in THEN COALESCE("aiOptInAt", NOW()) END, "updatedAt" = NOW()
  WHERE "participantId" = person_id;
  -- Opting out also removes the summary that was written from their entries.
  IF NOT p_opt_in THEN
    DELETE FROM "ReflectionSummary" WHERE "participantId" = person_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_assistant_permissions(p_hub_id uuid, p_perms text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_perms TEXT[];
  v_perm TEXT;
  v_hub public."SupportHub";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = p_hub_id AND h."leadUserId" = v_actor_id) THEN
      RAISE EXCEPTION 'Only this hub''s lead or an admin can set its assistant''s permissions';
    END IF;
  END IF;

  v_perms := COALESCE(p_perms, ARRAY[]::TEXT[]);
  FOREACH v_perm IN ARRAY v_perms LOOP
    IF v_perm NOT IN ('MEETING', 'ATTENDANCE', 'MESSAGE', 'GROUPS') THEN
      RAISE EXCEPTION 'Invalid permission: %', v_perm;
    END IF;
  END LOOP;

  UPDATE public."SupportHub"
  SET "assistantPermissions" = v_perms
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  RETURN jsonb_build_object('id', v_hub.id, 'assistantPermissions', v_hub."assistantPermissions");
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_attendance_auto_finalize(p_week_id integer, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_session public."AttendanceSession";
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change automatic finalisation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id) THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  INSERT INTO public."AttendanceSession" ("weekId", "autoFinalizeAtNoon")
  VALUES (p_week_id, p_enabled)
  ON CONFLICT ("weekId") DO UPDATE
    SET "autoFinalizeAtNoon" = EXCLUDED."autoFinalizeAtNoon",
        "updatedAt" = NOW()
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_corporate_prayer_settings(p_token text, p_cohort_id uuid, p_telegram text, p_wait integer, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_link text := NULLIF(btrim(COALESCE(p_telegram, '')), '');
  v_msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF COALESCE(p_wait, 5) NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'INVALID_WAIT'; END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
  IF v_msg IS NOT NULL AND length(v_msg) > 120 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  INSERT INTO public."CorporatePrayerSetting" ("cohortId", "telegramLink", "liveWaitMinutes", "liveMessage")
  VALUES (p_cohort_id, v_link, COALESCE(p_wait, 5), v_msg)
  ON CONFLICT ("cohortId") DO UPDATE SET "telegramLink" = EXCLUDED."telegramLink", "liveWaitMinutes" = EXCLUDED."liveWaitMinutes",
                                         "liveMessage" = EXCLUDED."liveMessage", "updatedAt" = now();
  RETURN json_build_object('telegramLink', v_link, 'liveWaitMinutes', COALESCE(p_wait, 5), 'liveMessage', v_msg);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_faith_project_prayer_share(p_token text, p_shared boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row "FaithProject";
BEGIN
  PERFORM public.set_prayer_consent(p_token, p_shared);
  SELECT f.* INTO v_row FROM "FaithProject" f WHERE f."participantId" = public.app_participant_id(p_token) ORDER BY f."updatedAt" DESC LIMIT 1;
  RETURN json_build_object('id', v_row.id, 'sharedForPrayer', COALESCE(v_row."sharedForPrayer", FALSE));
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_hub_leads_meeting(p_cohort_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."HubLeadsMeeting";
  v_new public."HubLeadsMeeting";
  v_leads UUID[];
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set the Hub Leads meeting';
  END IF;
  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  SELECT * INTO v_old FROM public."HubLeadsMeeting" WHERE "cohortId" = p_cohort_id;

  INSERT INTO public."HubLeadsMeeting" AS m
    ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink", "updatedAt", "updatedById")
  VALUES (p_cohort_id, p_meeting_day, p_meeting_time, p_call_platform, p_call_link, NOW(), public.app_current_user_id())
  ON CONFLICT ("cohortId") DO UPDATE
    SET "meetingDay" = EXCLUDED."meetingDay", "meetingTime" = EXCLUDED."meetingTime",
        "callPlatform" = EXCLUDED."callPlatform",
        "callLink" = EXCLUDED."callLink", "updatedAt" = NOW(), "updatedById" = EXCLUDED."updatedById"
  RETURNING * INTO v_new;

  IF p_notify AND (
    v_old."cohortId" IS NULL
    OR v_old."meetingDay" IS DISTINCT FROM v_new."meetingDay"
    OR v_old."meetingTime" IS DISTINCT FROM v_new."meetingTime"
    OR v_old."callLink" IS DISTINCT FROM v_new."callLink"
  ) AND v_new."meetingDay" IS NOT NULL AND v_new."meetingTime" IS NOT NULL THEN
    SELECT array_agg(DISTINCT h."leadUserId") INTO v_leads
    FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id AND h."leadUserId" IS NOT NULL;
    PERFORM public.invoke_hub_message_push(
      v_leads,
      'Hub Leads meeting',
      format('Now %s at %s. Open My Hub, then Leads.',
        initcap(lower(v_new."meetingDay")), to_char(v_new."meetingTime"::time, 'FMHH12:MI AM')));
  END IF;

  RETURN jsonb_build_object(
    'cohortId', v_new."cohortId", 'meetingDay', v_new."meetingDay", 'meetingTime', v_new."meetingTime",
    'callPlatform', v_new."callPlatform", 'callLink', v_new."callLink");
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_hub_prayer_focus(p_hub_id uuid, p_week_id integer, p_faith_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_hub."leadUserId" IS DISTINCT FROM v_actor_id
      AND v_hub."assistantLeadUserId" IS DISTINCT FROM v_actor_id
      AND NOT COALESCE(v_actor_id = ANY(v_hub."prayerLeadUserIds"), FALSE)
    THEN
      RAISE EXCEPTION 'Only this hub''s lead, assistant lead, prayer lead, or an admin can set its prayer focus';
    END IF;
  END IF;

  IF p_faith_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."FaithProject" f
      JOIN public."Participant" p ON p.id = f."participantId"
      JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
      JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
      JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id AND hm."cohortId" = g."cohortId"
      WHERE f.id = p_faith_project_id
        AND public.faith_project_prayable(f)
    ) THEN
      RAISE EXCEPTION 'That Faith Project is not on this hub''s prayer list';
    END IF;
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  -- Find-or-create the week's SUNDAY_RECAP session, same as
  -- mark_support_attendance / submit_hub_meeting.
  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET "prayerFocusFaithProjectId" = p_faith_project_id,
      "prayerFocusSetAt" = CASE WHEN p_faith_project_id IS NOT NULL THEN NOW() ELSE NULL END,
      "prayedForFaithProjectIds" = CASE
        WHEN p_faith_project_id IS NOT NULL
          AND NOT (p_faith_project_id = ANY(COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[])))
          THEN array_append(COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[]), p_faith_project_id)
        ELSE COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[])
      END
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'hubId', v_session."hubId",
    'weekId', v_session."weekId",
    'faithProjectId', v_session."prayerFocusFaithProjectId",
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_jsonb(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_hub_prayer_state(p_hub_id uuid, p_week_id integer, p_hub_prayer_done boolean DEFAULT NULL::boolean, p_prayer_finished boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_hub."leadUserId" IS DISTINCT FROM v_actor_id
      AND v_hub."assistantLeadUserId" IS DISTINCT FROM v_actor_id
      AND NOT COALESCE(v_actor_id = ANY(v_hub."prayerLeadUserIds"), FALSE)
    THEN
      RAISE EXCEPTION 'Only this hub''s lead, assistant lead, prayer lead, or an admin can set its prayer state';
    END IF;
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  -- Find-or-create the week's SUNDAY_RECAP session, same as
  -- set_hub_prayer_focus / mark_support_attendance / submit_hub_meeting.
  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET "hubPrayerDoneAt" = CASE
        WHEN p_hub_prayer_done IS NULL THEN "hubPrayerDoneAt"
        WHEN p_hub_prayer_done THEN NOW()
        ELSE NULL
      END,
      "prayerFinishedAt" = CASE
        WHEN p_prayer_finished IS NULL THEN "prayerFinishedAt"
        WHEN p_prayer_finished THEN NOW()
        ELSE NULL
      END,
      -- Finishing prayer takes the live focus off everyone's screen too.
      "prayerFocusFaithProjectId" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusFaithProjectId" END,
      "prayerFocusSetAt" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusSetAt" END
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'hubId', v_session."hubId",
    'weekId', v_session."weekId",
    'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
    'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL,
    'faithProjectId', v_session."prayerFocusFaithProjectId",
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_jsonb(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_avatar(p_token text, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Participant" SET "avatarUrl" = NULLIF(trim(COALESCE(p_url, '')), ''), "updatedAt" = NOW() WHERE id = person_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_password(p_token text, p_new_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  -- The guard (rule 133): not the password of a staff account on this number, or sign-in would always open the staff account.
  IF public.password_staff_clash(person_id, p_new_password) THEN
    RAISE EXCEPTION 'STAFF_PASSWORD_CLASH';
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash,
      "setupCode" = NULL,
      "mustChangePassword" = FALSE,
      "passwordSetAt" = NOW(),
      "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);

  RETURN public.participant_user_json(person_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_theme(p_token text, p_color text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_color IS NOT NULL AND p_color !~* '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOUR';
  END IF;
  UPDATE "Participant" SET "themeColor" = lower(p_color), "updatedAt" = NOW() WHERE id = person_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_prayer_consent(p_token text, p_consent boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_consent TEXT := CASE WHEN COALESCE(p_consent, FALSE) THEN 'IN' ELSE 'OUT' END;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  UPDATE "Participant" SET "prayerConsent" = v_consent, "prayerConsentAt" = NOW() WHERE id = person_id;
  UPDATE "FaithProject" SET "sharedForPrayer" = (v_consent = 'IN') WHERE "participantId" = person_id;
  RETURN json_build_object('prayerConsent', v_consent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_reflection_goal_done(p_token text, p_week_id integer, p_done boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  saved "Reflection";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Reflection"
  SET "goalDoneAt" = CASE WHEN p_done THEN NOW() END
  WHERE "participantId" = person_id AND "weekId" = p_week_id
  RETURNING * INTO saved;
  IF saved.id IS NULL THEN
    RAISE EXCEPTION 'REFLECTION_NOT_FOUND';
  END IF;
  RETURN json_build_object(
    'weekId', saved."weekId", 'stoodOut', saved."stoodOut", 'goal', saved.goal, 'goalCheck', saved."goalCheck",
    'goalDoneAt', saved."goalDoneAt", 'createdAt', saved."createdAt", 'updatedAt', saved."updatedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_support_kind(p_user_id uuid, p_cohort_id uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public."UserCohort";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can set a support''s kind';
  END IF;
  IF p_kind NOT IN ('PARTICIPANT_SUPPORT', 'HUB_LEAD', 'OPERATIONAL') THEN
    RAISE EXCEPTION 'Invalid support kind';
  END IF;

  UPDATE public."UserCohort"
  SET "supportKind" = p_kind
  WHERE "userId" = p_user_id AND "cohortId" = p_cohort_id
  RETURNING * INTO v_row;

  IF v_row."userId" IS NULL THEN
    RAISE EXCEPTION 'That support is not a member of this cohort';
  END IF;

  RETURN jsonb_build_object('userId', v_row."userId", 'cohortId', v_row."cohortId", 'supportKind', v_row."supportKind");
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_password(p_token text, target_user uuid, new_password text, force_change boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  real_actor "User" := public.app_staff_real(p_token);
  target "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  
  SELECT * INTO target FROM "User" WHERE id = target_user;
  IF target.id IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(public.app_user_roles(target)) r WHERE r <> 'SUPPORT'::"Role")
     AND real_actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- The guard (rule 133), for an admin's reset too.
  IF public.password_family_clash(target_user, new_password) THEN
    RAISE EXCEPTION 'FAMILY_PASSWORD_CLASH';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_password(target_user uuid, new_password text, force_change boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_role(p_token text, target_user uuid, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff_real(p_token);
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  IF actor.id = target_user AND p_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  UPDATE "User"
  SET role = p_role::"Role",
      roles = '{}'::"Role"[],
      "updatedAt" = NOW()
  WHERE id = target_user
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN public.safe_user_json(updated);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_roles(p_token text, target_user uuid, p_roles text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff_real(p_token);
  v_roles "Role"[];
  v_home "Role";
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT array_agg(DISTINCT r::"Role") INTO v_roles
  FROM unnest(p_roles) r WHERE r IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF');
  IF v_roles IS NULL OR cardinality(v_roles) = 0 OR cardinality(v_roles) <> (SELECT count(DISTINCT x) FROM unnest(p_roles) x) THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  SELECT r INTO v_home FROM unnest(v_roles) r ORDER BY public.app_role_rank(r) DESC LIMIT 1;
  -- An admin removing their own admin rights could lock the last one out.
  IF actor.id = target_user AND NOT ('ADMIN'::"Role" = ANY (v_roles)) THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  UPDATE "User"
  SET role = v_home,
      roles = CASE WHEN cardinality(v_roles) > 1 THEN v_roles ELSE '{}'::"Role"[] END,
      "updatedAt" = NOW()
  WHERE id = target_user
  RETURNING * INTO updated;
  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  RETURN public.safe_user_json(updated);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_test(p_token text, target_user uuid, p_is_test boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  UPDATE "User"
  SET "isTest" = COALESCE(p_is_test, FALSE),
      "updatedAt" = NOW()
  WHERE id = target_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shared_number_people(p_participant_id uuid)
 RETURNS TABLE(id uuid, name text, is_teen boolean, has_login boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT q.id, q."fullName", public.fof_is_teen_age(q."ageRange"), COALESCE(a."isActive", FALSE)
  FROM "Participant" me
  JOIN "Participant" q
    ON public.fof_phone_key(q.phone) = public.fof_phone_key(me.phone)
   AND q."cohortId" IS NOT DISTINCT FROM me."cohortId"
  LEFT JOIN "ParticipantAccount" a ON a."participantId" = q.id
  WHERE me.id = p_participant_id
    AND public.fof_phone_key(me.phone) IS NOT NULL
    AND (q.status = 'ACTIVE' OR q.id = me.id)
  ORDER BY q."fullName";
$function$;

CREATE OR REPLACE FUNCTION public.sheet_registration_question()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  question TEXT := public.form_question_text(NEW.answers);
BEGIN
  IF NEW."contactId" IS NULL OR question IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."contactId" IS NOT DISTINCT FROM NEW."contactId" THEN
    RETURN NEW;
  END IF;

  UPDATE "FollowUpContact"
     SET "formQuestion" = CASE
           WHEN "formQuestion" IS NULL OR btrim("formQuestion") = '' THEN question
           ELSE "formQuestion" || E'\n\n' || question
         END,
         "formQuestionAnsweredAt" = NULL,
         "formQuestionAnsweredById" = NULL
   WHERE id = NEW."contactId"
     AND position(question IN COALESCE("formQuestion", '')) = 0;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key TEXT;
  v_result JSON;
BEGIN
  IF identifier IS NULL OR trim(identifier) = '' THEN
    RETURN NULL;
  END IF;
  v_key := public.sign_in_key(identifier);
  PERFORM public.sign_in_guard(v_key);
  v_result := public.sign_in_check(identifier, password);
  PERFORM public.sign_in_record(v_key, v_result IS NOT NULL);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_check(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff JSON;
  staff_row "User";
  phone_key TEXT;
  person_id UUID;
  person_hash TEXT;
  via_own BOOLEAN;
  new_token TEXT;
BEGIN
  staff := public.login_user(identifier, password);
  IF staff IS NOT NULL THEN
    SELECT * INTO staff_row FROM "User" WHERE id = (staff->>'id')::UUID;
    RETURN json_build_object(
      'token', public.start_app_session((staff->>'id')::UUID, NULL),
      'user', (staff::jsonb || jsonb_build_object('role', public.app_lowest_role(staff_row)))::json
    );
  END IF;

  IF identifier IS NULL OR position('@' IN identifier) > 0 OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  phone_key := public.fof_phone_key(identifier);
  IF phone_key IS NULL THEN
    RETURN NULL;
  END IF;

  FOR person_id, person_hash, via_own IN
    SELECT p.id, a.password_hash, public.fof_phone_key(p.phone) IS DISTINCT FROM phone_key
    FROM "Participant" p
    JOIN "ParticipantAccount" a ON a."participantId" = p.id
    LEFT JOIN "ParticipantLoginPhone" l ON l."participantId" = p.id
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE (public.fof_phone_key(p.phone) = phone_key OR public.fof_phone_key(l.phone) = phone_key)
      AND a."isActive"
      AND p.status = 'ACTIVE'
    ORDER BY c."startDate" DESC NULLS LAST, p."createdAt" DESC
  LOOP
    IF person_hash = crypt(password, person_hash) THEN
      UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = person_id;
      new_token := public.start_app_session(NULL, person_id);
      IF via_own THEN
        UPDATE "AppSession" SET "viaTeenNumber" = TRUE
        WHERE "tokenHash" = encode(digest(new_token, 'sha256'), 'hex');
      END IF;
      RETURN json_build_object('token', new_token, 'user', public.participant_user_json(person_id));
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_guard(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public."SignInThrottle" WHERE key = p_key AND "lockedUntil" > NOW()) THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_key(p_identifier text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_norm TEXT := lower(trim(COALESCE(p_identifier, '')));
  v_uid UUID;
BEGIN
  -- The same staff account login_user would check.
  SELECT u.id INTO v_uid FROM "User" u
  WHERE (position('@' IN v_norm) > 0 AND lower(u.email) = v_norm)
     OR (position('@' IN v_norm) = 0 AND (u.phone = trim(p_identifier) OR public.fof_phone_key(u.phone) = public.fof_phone_key(p_identifier)))
  ORDER BY (u."isActive" IS NOT FALSE) DESC, u."createdAt" ASC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN RETURN 'staff:' || v_uid; END IF;
  IF position('@' IN v_norm) > 0 THEN RETURN 'login:' || v_norm; END IF;
  RETURN 'login:' || COALESCE(public.fof_phone_key(p_identifier), v_norm);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_record(p_key text, p_ok boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  IF p_ok THEN
    DELETE FROM public."SignInThrottle" WHERE key = p_key;
    RETURN;
  END IF;
  INSERT INTO public."SignInThrottle" AS t (key, failures, "firstFailAt")
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    failures = CASE WHEN t."firstFailAt" < NOW() - INTERVAL '15 minutes' THEN 1 ELSE t.failures + 1 END,
    "firstFailAt" = CASE WHEN t."firstFailAt" < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE t."firstFailAt" END,
    "lockedUntil" = CASE
      WHEN t."firstFailAt" >= NOW() - INTERVAL '15 minutes' AND t.failures + 1 >= 10 THEN NOW() + INTERVAL '15 minutes'
      ELSE t."lockedUntil" END;
  -- Old rows are no use once their window and pause are over.
  DELETE FROM public."SignInThrottle"
  WHERE "firstFailAt" < NOW() - INTERVAL '1 day' AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW());
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_throttle_clear_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."SignInThrottle" t WHERE t.key IN (
    SELECT 'login:' || public.fof_phone_key(p.phone) FROM public."Participant" p WHERE p.id = NEW."participantId" AND public.fof_phone_key(p.phone) IS NOT NULL
    UNION
    SELECT 'login:' || public.fof_phone_key(l.phone) FROM public."ParticipantLoginPhone" l WHERE l."participantId" = NEW."participantId" AND public.fof_phone_key(l.phone) IS NOT NULL
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_throttle_clear_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."SignInThrottle" WHERE key = 'staff:' || NEW.id
     OR (NEW.email IS NOT NULL AND key = 'login:' || lower(NEW.email))
     OR (public.fof_phone_key(NEW.phone) IS NOT NULL AND key = 'login:' || public.fof_phone_key(NEW.phone));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_out(p_token text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  DELETE FROM "AppSession" WHERE "tokenHash" = encode(digest(COALESCE(p_token, ''), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.skip_prayer_person(p_token text, p_cohort_id uuid, p_participant_id uuid, p_skip boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cycle integer;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  FOR v_cycle IN SELECT COALESCE((SELECT c."cycleNo" FROM public."CorporatePrayerCycle" c WHERE c."cohortId" = p_cohort_id AND c.pool = pl.pool), 1) FROM (VALUES ('FAITH'), ('NAME')) pl(pool) LOOP
    IF COALESCE(p_skip, TRUE) THEN
      INSERT INTO public."CorporatePrayerSkip" ("cohortId", "participantId", "cycleNo") VALUES (p_cohort_id, p_participant_id, v_cycle) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public."CorporatePrayerSkip" WHERE "cohortId" = p_cohort_id AND "participantId" = p_participant_id AND "cycleNo" = v_cycle;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_app_session(p_user_id uuid, p_participant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  token TEXT := encode(gen_random_bytes(32), 'hex');
  u "User";
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO u FROM "User" WHERE id = p_user_id;
  END IF;
  INSERT INTO "AppSession" ("tokenHash", "userId", "participantId", "activeRole")
  VALUES (encode(digest(token, 'sha256'), 'hex'), p_user_id, p_participant_id,
          CASE WHEN u.id IS NOT NULL THEN public.app_lowest_role(u) END);
  RETURN token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_attendance_window(p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_window_minutes INTEGER;
  v_session public."AttendanceSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to start attendance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id) THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;
  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(p_week_id), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
  END IF;

  SELECT COALESCE((value->>'attendanceWindowMinutes')::INTEGER, 15)
  INTO v_window_minutes
  FROM public."AppSetting" WHERE "settingKey" = 'programme_rules';
  v_window_minutes := GREATEST(1, COALESCE(v_window_minutes, 15));

  v_actor_id := public.attendance_session_actor_id();

  INSERT INTO public."AttendanceSession" ("weekId", "startedAt", "startedById", "closesAt")
  VALUES (p_week_id, NOW(), v_actor_id, NOW() + make_interval(mins => v_window_minutes))
  ON CONFLICT ("weekId") DO NOTHING;

  -- First tap wins: only fill in start/close times if nobody has already.
  UPDATE public."AttendanceSession"
  SET "startedAt" = COALESCE("startedAt", NOW()),
      "startedById" = COALESCE("startedById", v_actor_id),
      "closesAt" = COALESCE("closesAt", NOW() + make_interval(mins => v_window_minutes)),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND "startedAt" IS NULL;

  SELECT * INTO v_session FROM public."AttendanceSession" WHERE "weekId" = p_week_id;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'startedAt', v_session."startedAt",
    'startedById', v_session."startedById",
    'closesAt', v_session."closesAt",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.storage_signed_in()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT public.app_is_staff() OR public.app_participant_id(public.app_current_token()) IS NOT NULL; $function$;

CREATE OR REPLACE FUNCTION public.storage_survey_upload_ok(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_name IS NOT NULL
    AND position('..' IN p_name) = 0
    AND split_part(p_name, '/', 1) = 'survey-files'
    AND split_part(p_name, '/', 4) <> ''
    AND EXISTS (SELECT 1 FROM public."Survey" s WHERE s.id::TEXT = split_part(p_name, '/', 2))
    AND split_part(p_name, '/', 3) = COALESCE(
      public.app_participant_id(public.app_current_token())::TEXT,
      public.app_current_user_id()::TEXT);
$function$;

CREATE OR REPLACE FUNCTION public.submit_class_feedback(p_token text, p_week_id integer, p_rating integer, p_comment text, p_show_name boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cohort_id UUID;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'RATING_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" WHERE "participantId" = person_id AND "weekId" = p_week_id) THEN
    RAISE EXCEPTION 'ALREADY_ANSWERED';
  END IF;

  SELECT "cohortId" INTO cohort_id FROM "Participant" WHERE id = person_id;
  IF cohort_id IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_NO_COHORT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Week" w WHERE w.id = p_week_id AND w."cohortId" = cohort_id) THEN
    RAISE EXCEPTION 'INVALID_WEEK';
  END IF;

  -- "Done" first and without ON CONFLICT: a double-tap's second call fails on
  -- the primary key and rolls back, so it can't leave a second answer.
  INSERT INTO "ParticipantClassFeedbackDone" ("participantId", "weekId")
  VALUES (person_id, p_week_id);

  INSERT INTO "ParticipantClassFeedback" ("cohortId", "weekId", rating, comment, "participantId")
  VALUES (cohort_id, p_week_id, p_rating, NULLIF(trim(COALESCE(p_comment, '')), ''), CASE WHEN p_show_name THEN person_id END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_faith_help_request(p_token text, p_reason text, p_note text, p_wants_contact boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_faith_project_id UUID;
  v_support_id UUID;
  v_id UUID;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_reason NOT IN ('LOST_MOTIVATION', 'SITUATION_CHANGED', 'UNSURE_NEXT', 'NO_TIME', 'OTHER') THEN
    RAISE EXCEPTION 'INVALID_REASON';
  END IF;

  SELECT id INTO v_faith_project_id FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;

  SELECT g."supportId" INTO v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  INSERT INTO "FaithHelpRequest" ("participantId", "faithProjectId", reason, note, "wantsContact")
  VALUES (person_id, v_faith_project_id, p_reason, NULLIF(trim(COALESCE(p_note, '')), ''), COALESCE(p_wants_contact, FALSE))
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'supportId', v_support_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_feedback(p_token text, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cohort_id UUID;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF jsonb_typeof(p_answers) <> 'object' OR COALESCE(p_answers->>'rating', '') NOT IN ('NOT_GREAT', 'OKAY', 'GREAT') THEN
    RAISE EXCEPTION 'FEEDBACK_RATING_REQUIRED';
  END IF;
  SELECT "cohortId" INTO cohort_id FROM "Participant" WHERE id = person_id;
  IF cohort_id IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_NO_COHORT';
  END IF;
  INSERT INTO "FeedbackResponse" ("cohortId", round, answers)
  VALUES (cohort_id, 'GENERAL', jsonb_build_object(
    'rating', p_answers->>'rating',
    'workingWell', NULLIF(trim(COALESCE(p_answers->>'workingWell', '')), ''),
    'needsAttention', NULLIF(trim(COALESCE(p_answers->>'needsAttention', '')), '')
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_hub_meeting(p_hub_id uuid, p_week_id integer, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() AND NOT public.app_hub_can(p_hub_id, 'ATTENDANCE') THEN
    RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can submit its meeting';
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN RAISE EXCEPTION 'Hub was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET notes = NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
      "submittedAt" = NOW(),
      "submittedById" = v_actor_id
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id, 'hubId', v_session."hubId", 'weekId', v_session."weekId",
    'notes', v_session.notes, 'submittedAt', v_session."submittedAt", 'submittedById', v_session."submittedById"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_testimony(p_token text, p_title text, p_body text, p_visibility text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  my_cohort_id UUID;
  my_group_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT gp."groupId", g."supportId" INTO my_group_id, v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  v_status := CASE WHEN p_visibility = 'SUPPORT' THEN 'APPROVED' ELSE 'PENDING' END;

  INSERT INTO "Testimony" ("participantId", "cohortId", "groupId", title, body, visibility, status, "reviewedAt")
  VALUES (
    person_id, my_cohort_id, my_group_id, NULLIF(trim(COALESCE(p_title, '')), ''), v_body, p_visibility, v_status,
    CASE WHEN v_status = 'APPROVED' THEN NOW() END
  )
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt",
    'supportId', v_support_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_training_learned(p_session_id uuid, p_learned text, p_will_apply text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_learned TEXT;
  v_apply TEXT;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support to do this';
  END IF;
  v_actor_id := public.app_current_user_id();
  v_learned := btrim(COALESCE(p_learned, ''));
  v_apply := btrim(COALESCE(p_will_apply, ''));
  -- One sentence minimum each: a few real words, not a single "ok".
  IF length(v_learned) < 15 OR array_length(regexp_split_to_array(v_learned, '\s+'), 1) < 4 THEN
    RAISE EXCEPTION 'Write at least one full sentence about what you learned';
  END IF;
  IF length(v_apply) < 15 OR array_length(regexp_split_to_array(v_apply, '\s+'), 1) < 4 THEN
    RAISE EXCEPTION 'Write at least one full sentence about what you will apply';
  END IF;

  UPDATE public."SupportSessionAttendance" a
     SET learned = v_learned, "willApply" = v_apply, "learnedAt" = NOW()
    FROM public."SupportSession" s
   WHERE a."sessionId" = p_session_id
     AND a."userId" = v_actor_id
     AND a.status IN ('PRESENT', 'LATE')
     AND s.id = a."sessionId"
     AND s.type = 'PRE_COHORT_TRAINING'
  RETURNING a.* INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'You can only share what you learned for a training you were marked present at';
  END IF;
  RETURN to_jsonb(v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_wrap_up(p_token text, p_department text, p_wants_referral boolean, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  support_id UUID;
  cleaned_department TEXT := NULLIF(trim(COALESCE(p_department, '')), '');
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned_department IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_REQUIRED';
  END IF;
  SELECT * INTO person FROM "Participant" WHERE id = person_id;

  INSERT INTO "ParticipantWrapUp" ("participantId", "cohortId", department, "wantsReferral", note)
  VALUES (person_id, person."cohortId", cleaned_department, COALESCE(p_wants_referral, FALSE), NULLIF(trim(COALESCE(p_note, '')), ''))
  ON CONFLICT ("participantId", "cohortId") DO UPDATE SET
    department = EXCLUDED.department, "wantsReferral" = EXCLUDED."wantsReferral", note = EXCLUDED.note, "createdAt" = NOW();

  IF p_wants_referral AND NOT EXISTS (
    SELECT 1 FROM "DepartmentReferral" r WHERE r."participantId" = person_id AND lower(r.department) = lower(cleaned_department)
  ) THEN
    INSERT INTO "DepartmentReferral" ("participantId", department, status, note)
    VALUES (person_id, cleaned_department, 'LOGGED', 'Asked for a referral in the participant app.');
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id LIMIT 1;

  RETURN json_build_object('supportId', support_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_add_sibling(p_token text, p_sibling_id uuid, p_full_name text, p_gender text, p_date_of_birth date DEFAULT NULL::date, p_consent boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_sibling "Participant";
  v_owner UUID;
BEGIN
  IF actor.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO v_sibling FROM "Participant" WHERE id = p_sibling_id;
  IF v_sibling.id IS NULL OR NOT public.fof_is_teen_age(v_sibling."ageRange") THEN
    RAISE EXCEPTION 'Brothers and sisters can only be added from a teen''s card';
  END IF;
  SELECT "ownerId" INTO v_owner FROM "FollowUpContact" WHERE id = v_sibling."followUpContactId";
  IF actor.role::text <> 'ADMIN'
     AND v_owner IS DISTINCT FROM actor.id
     AND NOT EXISTS (
       SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
       WHERE gp."participantId" = v_sibling.id AND g."supportId" = actor.id
     ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can add a brother or sister';
  END IF;
  RETURN public.household_add_person(v_sibling.id, actor.id, p_full_name, p_gender, TRUE, '10 - 17', p_date_of_birth,
                                     NULL, NULL, NULL, p_consent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_age_range(p_year integer, p_birthday text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_dob DATE;
  v_age INT;
BEGIN
  IF p_year IS NULL THEN RETURN NULL; END IF;
  IF p_birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
    v_dob := make_date(p_year, substr(p_birthday, 1, 2)::int, 1)
             + (LEAST(substr(p_birthday, 4, 2)::int,
                      EXTRACT(DAY FROM (date_trunc('month', make_date(p_year, substr(p_birthday, 1, 2)::int, 1)) + interval '1 month - 1 day'))::int) - 1);
    v_age := date_part('year', age(v_today, v_dob))::int;
  ELSE
    v_age := EXTRACT(YEAR FROM v_today)::int - p_year;
  END IF;
  RETURN public.age_range_for_age(v_age);
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_ask_manual_question(p_participant_id uuid, p_week_id integer, p_body text, p_hide_name boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_person public."Participant";
  v_group_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_row public."ManualQuestion";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_person FROM public."Participant" WHERE id = p_participant_id;
  IF v_person.id IS NULL OR v_person.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Participant was not found'; END IF;
  IF NOT public.fof_is_teen_age(v_person."ageRange") THEN
    RAISE EXCEPTION 'Questions can only be added for teens';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id AND "cohortId" = v_person."cohortId") THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  SELECT g.id, g."supportId" INTO v_group_id, v_support_id
  FROM public."GroupParticipant" gp
  JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_person."cohortId"
  WHERE gp."participantId" = v_person.id
  LIMIT 1;

  IF NOT public.app_is_admin() AND v_support_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can add a question for them';
  END IF;

  INSERT INTO public."ManualQuestion" ("participantId", "weekId", "cohortId", "groupId", body, "askedById", "hideName")
  VALUES (v_person.id, p_week_id, v_person."cohortId", v_group_id, v_body, v_actor_id, COALESCE(p_hide_name, TRUE))
  RETURNING * INTO v_row;

  RETURN json_build_object('id', v_row.id, 'weekId', v_row."weekId", 'status', v_row.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_checklist_admin_task_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF OLD."taskGroupId" IS NOT NULL
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.app_is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'ADMIN_TASK_LOCKED';
    END IF;
    IF NEW.label IS DISTINCT FROM OLD.label
       OR NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."weekId" IS DISTINCT FROM OLD."weekId"
       OR NEW.position IS DISTINCT FROM OLD.position
       OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
       OR NEW."taskGroupId" IS DISTINCT FROM OLD."taskGroupId"
       OR NEW."dueDay" IS DISTINCT FROM OLD."dueDay"
       OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
       OR NEW."cohortId" IS DISTINCT FROM OLD."cohortId" THEN
      RAISE EXCEPTION 'ADMIN_TASK_LOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cohort "Cohort";
  v_actor_id UUID;
  v_is_admin BOOLEAN;
  v_teen_ok BOOLEAN;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  SELECT * INTO cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort was not found';
  END IF;

  v_actor_id := public.app_current_user_id();
  v_is_admin := public.app_is_admin();
  -- The Teen recap is for Teen Supports (and admins who write it) only.
  v_teen_ok := v_is_admin OR EXISTS (
    SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId"
    WHERE t."systemKey" = 'TEEN_SUPPORT' AND m."userId" = v_actor_id
  );

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
      'title', w.title,
      'released', (rel.released OR cohort."isPractice"),
      'releasedAt', rel."releasedAt",
      'recapSummary', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapSummary" END,
      'discussionPrompt', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."discussionPrompt" END,
      'recapDocumentUrl', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapDocumentUrl" END,
      'recapDocumentName', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapDocumentName" END,
      'manual', CASE WHEN (manual_rel.released OR cohort."isPractice") AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
        'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
        'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
      ) END,
      'hasTeenRecap', (v_teen_ok AND (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> '')),
      'teenRecapReleased', (v_teen_ok AND teen_rel.released),
      'teenRecapReleaseAt', CASE WHEN v_teen_ok THEN w."teenRecapReleaseAt" END,
      'teenRecap', CASE WHEN v_teen_ok AND (teen_rel.released OR v_is_admin) AND (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> '') THEN json_build_object(
        'documentUrl', w."teenRecapDocumentUrl", 'documentName', w."teenRecapDocumentName",
        'summary', w."teenRecapSummary", 'discussionPrompt', w."teenDiscussionPrompt"
      ) END,
      'manualReleased', (manual_rel.released OR cohort."isPractice"),
      'manualReleasedAt', manual_rel."releasedAt",
      'unreadQuestionCount', (
        SELECT COUNT(*) FROM "ManualQuestion" mq
        WHERE mq."weekId" = w.id AND mq.status = 'NEW'
          AND (v_is_admin OR EXISTS (SELECT 1 FROM "Group" sg WHERE sg.id = mq."groupId" AND sg."supportId" = v_actor_id))
      )
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w
    CROSS JOIN LATERAL (
      SELECT
        NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS released,
        public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS "releasedAt"
    ) rel
    CROSS JOIN LATERAL (
      SELECT (w."teenRecapReleaseAt" IS NULL OR NOW() >= w."teenRecapReleaseAt" OR cohort."isPractice") AS released
    ) teen_rel
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(w."manualReleasedEarlyAt" IS NOT NULL OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'), FALSE) AS released,
        COALESCE(w."manualReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual')) AS "releasedAt"
    ) manual_rel
    WHERE w."cohortId" = p_cohort_id
      AND (
        btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL
        OR w."manualDocumentUrl" IS NOT NULL
        OR (v_teen_ok AND (w."teenRecapDocumentUrl" IS NOT NULL
          OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> ''))
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_set_tags(p_token text, p_user_id uuid, p_tag_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_ids UUID[] := COALESCE(p_tag_ids, '{}');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = p_user_id AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles))
  ) THEN
    RAISE EXCEPTION 'Only supports can be put on a tag';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM "SupportTag" t WHERE t.id = x)) THEN
    RAISE EXCEPTION 'One of those tags was not found';
  END IF;

  DELETE FROM "SupportTagMember" WHERE "userId" = p_user_id AND "tagId" <> ALL (v_ids);
  INSERT INTO "SupportTagMember" ("tagId", "userId")
  SELECT x, p_user_id FROM unnest(v_ids) x
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_tag_delete(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_id AND "systemKey" IS NOT NULL) THEN
    RAISE EXCEPTION 'This tag is built in and can''t be deleted';
  END IF;
  DELETE FROM "SupportTag" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_tag_save(p_token text, p_id uuid, p_name text)
 RETURNS "SupportTag"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_name TEXT := btrim(COALESCE(p_name, ''));
  saved "SupportTag";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Give the tag a name';
  END IF;
  IF char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Keep the tag name under 40 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupportTag" WHERE lower(btrim(name)) = lower(v_name) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'A tag with that name already exists';
  END IF;

  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_id AND "systemKey" IS NOT NULL) THEN
    RAISE EXCEPTION 'This tag is built in and can''t be renamed';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO "SupportTag" (name, "createdById") VALUES (v_name, actor.id) RETURNING * INTO saved;
  ELSE
    UPDATE "SupportTag" SET name = v_name WHERE id = p_id RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'That tag was not found';
    END IF;
  END IF;
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_tag_set_members(p_token text, p_tag_id uuid, p_user_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_ids UUID[] := COALESCE(p_user_ids, '{}');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_tag_id) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) x
    WHERE NOT EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = x AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles))
    )
  ) THEN
    RAISE EXCEPTION 'Only supports can be put on a tag';
  END IF;

  DELETE FROM "SupportTagMember" WHERE "tagId" = p_tag_id AND "userId" <> ALL (v_ids);
  INSERT INTO "SupportTagMember" ("tagId", "userId")
  SELECT p_tag_id, x FROM unnest(v_ids) x
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_update_manual_question(p_id uuid, p_body text, p_hide_name boolean, p_week_id integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;
  IF NOT public.app_is_admin() AND v_row."askedById" IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the person who added this question can change it';
  END IF;
  -- ...and only while they are still this teen's Teen Support (a teen can move to another one).
  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_row."cohortId"
    WHERE gp."participantId" = v_row."participantId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can change this question';
  END IF;
  IF v_row.status <> 'NEW' THEN
    RAISE EXCEPTION 'This question is already set for class and can no longer be changed';
  END IF;
  IF p_week_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id AND "cohortId" = v_row."cohortId") THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  UPDATE public."ManualQuestion"
  SET body = v_body, "hideName" = COALESCE(p_hide_name, "hideName"), "weekId" = COALESCE(p_week_id, "weekId")
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object('id', v_row.id, 'weekId', v_row."weekId", 'status', v_row.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_delete(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF EXISTS (SELECT 1 FROM "Survey" WHERE id = p_id AND "builtinKey" IS NOT NULL) THEN RAISE EXCEPTION 'BUILTIN_CANNOT_DELETE'; END IF;
  DELETE FROM "Survey" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_get(p_token text, p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  s "Survey";
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  RETURN json_build_object('survey', to_json(s), 'questions', public.survey_questions_json(s.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_list(p_token text, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  c "Cohort";
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO c FROM "Cohort" WHERE id = p_cohort_id;
  RETURN COALESCE((
    SELECT json_agg(item ORDER BY (item ->> 'sortKey')) FROM (
      SELECT json_build_object(
        'id', s.id, 'builtinKey', s."builtinKey", 'title', s.title, 'audience', s.audience, 'scope', s.scope,
        'cohortId', s."cohortId", 'cohortName', (SELECT name FROM "Cohort" WHERE id = s."cohortId"),
        'anonymous', s.anonymous, 'enabled', s.enabled, 'status', s.status, 'timingMode', s."timingMode",
        'weeksBeforeEnd', s."weeksBeforeEnd", 'closeDaysAfterEnd', s."closeDaysAfterEnd",
        'weeksAfterStart', s."weeksAfterStart", 'openForDays', s."openForDays",
        'opensAt', w.opens, 'closesAt', w.closes,
        'state', CASE
          WHEN s.status = 'DRAFT' THEN 'DRAFT'
          WHEN NOT s.enabled THEN 'OFF'
          WHEN NOW() < COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) THEN 'SCHEDULED'
          WHEN NOW() >= COALESCE(w.closes, 'infinity'::TIMESTAMPTZ) THEN 'CLOSED'
          ELSE 'OPEN' END,
        'eligible', (SELECT count(*) FROM public.survey_people(s, p_cohort_id)),
        'answered', (SELECT count(*) FROM "SurveySubmission" x JOIN public.survey_people(s, p_cohort_id) pp ON pp.respondent_key = x."respondentKey" WHERE x."surveyId" = s.id),
        'sortKey', (CASE WHEN s."builtinKey" IS NULL THEN '1' ELSE '0' END) || to_char(s."createdAt", 'YYYYMMDDHH24MISS')
      ) AS item
      FROM "Survey" s
      CROSS JOIN LATERAL public.survey_window(s, c."startDate", c."endDate", COALESCE(c."isPractice", FALSE)) w
      WHERE s.scope = 'GENERAL' OR s."cohortId" = p_cohort_id
    ) t
  ), '[]'::JSON);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_results(p_token text, p_id uuid, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  s "Survey";
  total INTEGER;
  show_answers BOOLEAN;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  SELECT count(*) INTO total FROM "SurveyAnswerSet" a
    WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id);
  show_answers := NOT s.anonymous OR total >= 5;
  RETURN json_build_object(
    'survey', to_json(s),
    'questions', public.survey_questions_json(s.id),
    'eligible', (SELECT count(*) FROM public.survey_people(s, p_cohort_id)),
    'answered', total,
    'visible', show_answers,
    'answers', CASE WHEN NOT show_answers THEN NULL WHEN s.anonymous THEN (
        SELECT COALESCE(json_agg(json_build_object('answers', a.answers) ORDER BY md5(a.id::TEXT)), '[]'::JSON)
        FROM "SurveyAnswerSet" a WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id)
      ) ELSE (
        SELECT COALESCE(json_agg(json_build_object(
          'name', COALESCE(p."fullName", u.name, 'Unknown'), 'submittedAt', a."submittedAt", 'answers', a.answers
        ) ORDER BY a."submittedAt"), '[]'::JSON)
        FROM "SurveyAnswerSet" a
        LEFT JOIN "Participant" p ON a."respondentKey" = 'p:' || p.id::TEXT
        LEFT JOIN "User" u ON a."respondentKey" = 'u:' || u.id::TEXT
        WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id)
      ) END,
    'people', (
      SELECT COALESCE(json_agg(json_build_object('name', pp.person_name, 'kind', pp.kind, 'answered', x."respondentKey" IS NOT NULL) ORDER BY pp.person_name), '[]'::JSON)
      FROM public.survey_people(s, p_cohort_id) pp
      LEFT JOIN "SurveySubmission" x ON x."surveyId" = s.id AND x."respondentKey" = pp.respondent_key
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_save(p_token text, p_survey jsonb, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  sid UUID := NULLIF(p_survey ->> 'id', '')::UUID;
  existing "Survey";
  q JSONB;
  qid UUID;
  kept UUID[] := ARRAY[]::UUID[];
  idx INTEGER := 0;
  kind TEXT;
  scale INTEGER;
  title_text TEXT := NULLIF(trim(COALESCE(p_survey ->> 'title', '')), '');
  new_status TEXT := COALESCE(NULLIF(p_survey ->> 'status', ''), 'DRAFT');
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF title_text IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN RAISE EXCEPTION 'QUESTIONS_INVALID'; END IF;
  IF new_status = 'PUBLISHED' AND jsonb_array_length(p_questions) = 0 THEN RAISE EXCEPTION 'ADD_A_QUESTION'; END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    kind := q ->> 'kind';
    IF kind NOT IN ('TEXT', 'TEXTAREA', 'NUMBER', 'RATING', 'FILE', 'DEPARTMENT', 'YESNO') THEN RAISE EXCEPTION 'QUESTIONS_INVALID'; END IF;
    IF NULLIF(trim(COALESCE(q ->> 'prompt', '')), '') IS NULL THEN RAISE EXCEPTION 'QUESTION_TEXT_REQUIRED'; END IF;
    IF kind = 'RATING' THEN
      scale := COALESCE((q -> 'config' ->> 'scale')::INTEGER, 5);
      IF scale < 2 OR scale > 10 THEN RAISE EXCEPTION 'SCALE_INVALID'; END IF;
    END IF;
  END LOOP;

  IF sid IS NOT NULL THEN
    SELECT * INTO existing FROM "Survey" WHERE id = sid;
    IF existing.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  END IF;

  IF existing.id IS NULL THEN
    sid := gen_random_uuid();
    INSERT INTO "Survey" (
      id, title, description, audience, scope, "cohortId", "targetGroupId", "targetHubId", "targetLabelId", anonymous, enabled, status, "timingMode",
      "opensAt", "closesAt", "weeksBeforeEnd", "closeDaysAfterEnd", "weeksAfterStart", "openForDays", "notifyOnOpen", "homeHeading", "homeLine", "homeButton", "createdBy"
    ) VALUES (
      sid, title_text, NULLIF(trim(COALESCE(p_survey ->> 'description', '')), ''),
      COALESCE(NULLIF(p_survey ->> 'audience', ''), 'PARTICIPANTS'), COALESCE(NULLIF(p_survey ->> 'scope', ''), 'COHORT'),
      NULLIF(p_survey ->> 'cohortId', '')::UUID, NULLIF(p_survey ->> 'targetGroupId', '')::UUID,
      NULLIF(p_survey ->> 'targetHubId', '')::UUID, NULLIF(p_survey ->> 'targetLabelId', '')::UUID,
      COALESCE((p_survey ->> 'anonymous')::BOOLEAN, FALSE), COALESCE((p_survey ->> 'enabled')::BOOLEAN, TRUE), new_status,
      COALESCE(NULLIF(p_survey ->> 'timingMode', ''), 'DATES'),
      NULLIF(p_survey ->> 'opensAt', '')::TIMESTAMPTZ, NULLIF(p_survey ->> 'closesAt', '')::TIMESTAMPTZ,
      NULLIF(p_survey ->> 'weeksBeforeEnd', '')::INTEGER, NULLIF(p_survey ->> 'closeDaysAfterEnd', '')::INTEGER,
      NULLIF(p_survey ->> 'weeksAfterStart', '')::INTEGER, NULLIF(p_survey ->> 'openForDays', '')::INTEGER,
      COALESCE((p_survey ->> 'notifyOnOpen')::BOOLEAN, FALSE),
      NULLIF(trim(COALESCE(p_survey ->> 'homeHeading', '')), ''), NULLIF(trim(COALESCE(p_survey ->> 'homeLine', '')), ''),
      NULLIF(trim(COALESCE(p_survey ->> 'homeButton', '')), ''), staff.id
    );
  ELSE
    UPDATE "Survey" SET
      title = CASE WHEN existing."builtinKey" IS NULL THEN title_text ELSE existing.title END,
      description = NULLIF(trim(COALESCE(p_survey ->> 'description', '')), ''),
      audience = CASE WHEN existing."builtinKey" IS NULL THEN COALESCE(NULLIF(p_survey ->> 'audience', ''), audience) ELSE audience END,
      scope = CASE WHEN existing."builtinKey" IS NULL THEN COALESCE(NULLIF(p_survey ->> 'scope', ''), scope) ELSE scope END,
      "cohortId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'cohortId', '')::UUID ELSE "cohortId" END,
      "targetGroupId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'targetGroupId', '')::UUID ELSE "targetGroupId" END,
      "targetHubId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'targetHubId', '')::UUID ELSE "targetHubId" END,
      "targetLabelId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'targetLabelId', '')::UUID ELSE "targetLabelId" END,
      anonymous = CASE WHEN existing."builtinKey" IS NULL AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = sid)
                       THEN COALESCE((p_survey ->> 'anonymous')::BOOLEAN, anonymous) ELSE anonymous END,
      enabled = COALESCE((p_survey ->> 'enabled')::BOOLEAN, enabled),
      status = new_status,
      "timingMode" = COALESCE(NULLIF(p_survey ->> 'timingMode', ''), "timingMode"),
      "opensAt" = NULLIF(p_survey ->> 'opensAt', '')::TIMESTAMPTZ,
      "closesAt" = NULLIF(p_survey ->> 'closesAt', '')::TIMESTAMPTZ,
      "weeksBeforeEnd" = NULLIF(p_survey ->> 'weeksBeforeEnd', '')::INTEGER,
      "closeDaysAfterEnd" = NULLIF(p_survey ->> 'closeDaysAfterEnd', '')::INTEGER,
      "weeksAfterStart" = NULLIF(p_survey ->> 'weeksAfterStart', '')::INTEGER,
      "openForDays" = NULLIF(p_survey ->> 'openForDays', '')::INTEGER,
      "notifyOnOpen" = COALESCE((p_survey ->> 'notifyOnOpen')::BOOLEAN, "notifyOnOpen"),
      "homeHeading" = NULLIF(trim(COALESCE(p_survey ->> 'homeHeading', '')), ''),
      "homeLine" = NULLIF(trim(COALESCE(p_survey ->> 'homeLine', '')), ''),
      "homeButton" = NULLIF(trim(COALESCE(p_survey ->> 'homeButton', '')), ''),
      "createdBy" = COALESCE("createdBy", staff.id),
      "updatedAt" = NOW()
    WHERE id = sid;
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    idx := idx + 1;
    qid := COALESCE(NULLIF(q ->> 'id', '')::UUID, gen_random_uuid());
    INSERT INTO "SurveyQuestion" (id, "surveyId", position, kind, prompt, required, config)
    VALUES (qid, sid, idx, q ->> 'kind', trim(q ->> 'prompt'), COALESCE((q ->> 'required')::BOOLEAN, TRUE), COALESCE(q -> 'config', '{}'::JSONB))
    ON CONFLICT (id) DO UPDATE SET
      position = EXCLUDED.position, kind = EXCLUDED.kind, prompt = EXCLUDED.prompt,
      required = EXCLUDED.required, config = EXCLUDED.config
    WHERE "SurveyQuestion"."surveyId" = sid;
    kept := kept || qid;
  END LOOP;
  DELETE FROM "SurveyQuestion" WHERE "surveyId" = sid AND id <> ALL (kept);
  RETURN sid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_admin_save_summary(p_token text, p_id uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL OR staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE "Survey" SET "aiSummary" = p_text, "aiSummaryAt" = NOW() WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_get(p_token text, p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  person "Participant";
  c "Cohort";
  s "Survey";
  rkey TEXT;
  ok BOOLEAN := FALSE;
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF pid IS NOT NULL THEN
    rkey := 'p:' || pid::TEXT;
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    ok := public.survey_open_for_participant(s, person, c);
  ELSE
    rkey := 'u:' || staff.id::TEXT;
    ok := public.survey_open_for_staff(s, staff.id);
  END IF;
  IF EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = rkey) THEN
    RETURN json_build_object('id', s.id, 'title', s.title, 'submitted', TRUE, 'anonymous', s.anonymous);
  END IF;
  IF s."builtinKey" = 'WRAPUP' AND pid IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = pid AND w."cohortId" = person."cohortId"
  ) THEN
    RETURN json_build_object('id', s.id, 'title', s.title, 'submitted', TRUE, 'anonymous', s.anonymous);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  RETURN json_build_object(
    'id', s.id, 'title', s.title, 'description', s.description, 'anonymous', s.anonymous,
    'builtinKey', s."builtinKey", 'submitted', FALSE, 'questions', public.survey_questions_json(s.id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_mark_notified(p_survey uuid, p_cohort uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  INSERT INTO "SurveyNotified" ("surveyId", "cohortKey") VALUES (p_survey, COALESCE(p_cohort::TEXT, 'ALL')) ON CONFLICT DO NOTHING;
$function$;

CREATE OR REPLACE FUNCTION public.survey_notifications_due()
 RETURNS TABLE(survey_id uuid, cohort_id uuid, title text, audience text, created_by uuid, hub_id uuid, label_id uuid, group_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  -- Dated surveys: once, to their cohort (or everyone when general).
  SELECT s.id, s."cohortId", COALESCE(s."homeHeading", s.title), s.audience, s."createdBy", s."targetHubId", s."targetLabelId", s."targetGroupId"
  FROM "Survey" s
  WHERE s."notifyOnOpen" AND s.enabled AND s.status = 'PUBLISHED' AND s."timingMode" = 'DATES'
    AND NOW() >= COALESCE(s."opensAt", '-infinity'::TIMESTAMPTZ)
    AND NOW() < COALESCE(s."closesAt", 'infinity'::TIMESTAMPTZ)
    AND NOT EXISTS (SELECT 1 FROM "SurveyNotified" n WHERE n."surveyId" = s.id AND n."cohortKey" = COALESCE(s."cohortId"::TEXT, 'ALL'))
  UNION ALL
  -- Weeks-before-end surveys: once per cohort, when that cohort's window opens.
  SELECT s.id, c.id, COALESCE(s."homeHeading", s.title), s.audience, s."createdBy", s."targetHubId", s."targetLabelId", s."targetGroupId"
  FROM "Survey" s
  JOIN "Cohort" c ON (s.scope = 'GENERAL' OR s."cohortId" = c.id) AND COALESCE(c."isPractice", FALSE) = FALSE
  CROSS JOIN LATERAL public.survey_window(s, c."startDate", c."endDate", FALSE) w
  WHERE s."notifyOnOpen" AND s.enabled AND s.status = 'PUBLISHED' AND s."timingMode" IN ('WEEKS_BEFORE_END', 'WEEKS_AFTER_START')
    AND NOW() >= COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ)
    AND NOT EXISTS (SELECT 1 FROM "SurveyNotified" n WHERE n."surveyId" = s.id AND n."cohortKey" = c.id::TEXT);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_open_for_participant(s "Survey", person "Participant", c "Cohort")
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  w RECORD;
BEGIN
  IF NOT s.enabled OR s.status <> 'PUBLISHED' THEN RETURN FALSE; END IF;
  IF s.audience NOT IN ('PARTICIPANTS', 'EVERYONE') THEN RETURN FALSE; END IF;
  IF COALESCE(c."isPractice", FALSE) AND s."timingMode" IN ('WEEKS_BEFORE_END', 'WEEKS_AFTER_START') THEN RETURN FALSE; END IF;
  IF s.scope = 'COHORT' AND s."cohortId" IS DISTINCT FROM person."cohortId" THEN RETURN FALSE; END IF;
  IF s."targetGroupId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "GroupParticipant" gp WHERE gp."groupId" = s."targetGroupId" AND gp."participantId" = person.id
  ) THEN RETURN FALSE; END IF;
  SELECT * INTO w FROM public.survey_window(s, c."startDate", c."endDate", COALESCE(c."isPractice", FALSE));
  RETURN NOW() >= COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_open_for_staff(s "Survey", uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT s.enabled OR s.status <> 'PUBLISHED' THEN RETURN FALSE; END IF;
  IF s.audience NOT IN ('SUPPORTS', 'EVERYONE') THEN RETURN FALSE; END IF;
  IF s.scope = 'COHORT' AND NOT EXISTS (
    SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = uid AND uc."cohortId" = s."cohortId"
  ) THEN RETURN FALSE; END IF;
  IF s."targetHubId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "HubMembership" hm WHERE hm."hubId" = s."targetHubId" AND hm."userId" = uid
  ) THEN RETURN FALSE; END IF;
  IF s."targetLabelId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UserLabel" ul WHERE ul."labelId" = s."targetLabelId" AND ul."userId" = uid
  ) THEN RETURN FALSE; END IF;
  RETURN NOW() >= COALESCE(s."opensAt", '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(s."closesAt", 'infinity'::TIMESTAMPTZ);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_pending(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  person "Participant";
  c "Cohort";
BEGIN
  IF pid IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    RETURN COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'builtinKey', s."builtinKey",
        'homeHeading', s."homeHeading", 'homeLine', s."homeLine", 'homeButton', s."homeButton"
      ) ORDER BY s."createdAt")
      FROM "Survey" s
      WHERE public.survey_open_for_participant(s, person, c)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'p:' || pid::TEXT)
        AND NOT (s."builtinKey" = 'WRAPUP' AND EXISTS (
          SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = pid AND w."cohortId" = person."cohortId"
        ))
    ), '[]'::JSON);
  END IF;
  IF staff.id IS NOT NULL THEN
    RETURN COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'builtinKey', s."builtinKey",
        'homeHeading', s."homeHeading", 'homeLine', s."homeLine", 'homeButton', s."homeButton"
      ) ORDER BY s."createdAt")
      FROM "Survey" s
      WHERE public.survey_open_for_staff(s, staff.id)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'u:' || staff.id::TEXT)
    ), '[]'::JSON);
  END IF;
  RAISE EXCEPTION 'SESSION_EXPIRED';
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_people(s "Survey", p_cohort uuid)
 RETURNS TABLE(respondent_key text, person_name text, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF s.audience IN ('PARTICIPANTS', 'EVERYONE') THEN
    RETURN QUERY
    SELECT 'p:' || p.id::TEXT, p."fullName", 'PARTICIPANT'::TEXT
    FROM "Participant" p
    WHERE p.status = 'ACTIVE'
      AND (CASE WHEN s.scope = 'COHORT' THEN p."cohortId" = s."cohortId" ELSE (p_cohort IS NULL OR p."cohortId" = p_cohort) END)
      AND (s."targetGroupId" IS NULL OR EXISTS (SELECT 1 FROM "GroupParticipant" gp WHERE gp."groupId" = s."targetGroupId" AND gp."participantId" = p.id));
  END IF;
  IF s.audience IN ('SUPPORTS', 'EVERYONE') THEN
    RETURN QUERY
    SELECT 'u:' || u.id::TEXT, u.name, 'SUPPORT'::TEXT
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE
      AND COALESCE(u."isTest", FALSE) = FALSE
      AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
      AND (CASE
             WHEN s.scope = 'COHORT' THEN EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = s."cohortId")
             WHEN p_cohort IS NOT NULL THEN EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort)
             ELSE TRUE
           END)
      AND (s."targetHubId" IS NULL OR EXISTS (SELECT 1 FROM "HubMembership" hm WHERE hm."hubId" = s."targetHubId" AND hm."userId" = u.id))
      AND (s."targetLabelId" IS NULL OR EXISTS (SELECT 1 FROM "UserLabel" ul WHERE ul."labelId" = s."targetLabelId" AND ul."userId" = u.id));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_questions_json(p_survey uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(json_agg(json_build_object(
    'id', q.id, 'position', q.position, 'kind', q.kind, 'prompt', q.prompt, 'required', q.required, 'config', q.config
  ) ORDER BY q.position, q.id), '[]'::JSON)
  FROM "SurveyQuestion" q WHERE q."surveyId" = p_survey;
$function$;

CREATE OR REPLACE FUNCTION public.survey_reminders_due()
 RETURNS TABLE("surveyId" uuid, "cohortId" uuid, title text, "participantIds" uuid[], "userIds" uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s.id, c.id, COALESCE(s."homeHeading", s.title),
    ARRAY(
      SELECT p.id FROM "Participant" p
      WHERE p."cohortId" = c.id AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
        AND public.survey_open_for_participant(s, p, c)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'p:' || p.id::TEXT)
        AND NOT (s."builtinKey" = 'WRAPUP' AND EXISTS (
          SELECT 1 FROM "ParticipantWrapUp" wu WHERE wu."participantId" = p.id AND wu."cohortId" = p."cohortId"))
    ),
    ARRAY(
      SELECT u.id FROM "User" u
      WHERE s.audience IN ('SUPPORTS', 'EVERYONE')
        AND u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
        AND EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = c.id)
        AND public.survey_open_for_staff(s, u.id)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'u:' || u.id::TEXT)
    )
  FROM "Survey" s
  JOIN "Cohort" c ON c.status = 'ACTIVE' AND COALESCE(c."isPractice", FALSE) = FALSE
    AND (s.scope <> 'COHORT' OR s."cohortId" = c.id)
  CROSS JOIN LATERAL public.survey_window(s, c."startDate", c."endDate", FALSE) w
  WHERE s.enabled AND s.status = 'PUBLISHED'
    AND w.opens IS NOT NULL AND NOW() >= w.opens + INTERVAL '2 days'
    AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ);
$function$;

CREATE OR REPLACE FUNCTION public.survey_respondent_id(p_token text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(public.app_participant_id(p_token), (public.app_staff(p_token)).id);
$function$;

CREATE OR REPLACE FUNCTION public.survey_submit(p_token text, p_id uuid, p_answers jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  rid UUID;
  person "Participant";
  c "Cohort";
  s "Survey";
  q RECORD;
  rkey TEXT;
  ok BOOLEAN := FALSE;
  cohort_id UUID;
  val TEXT;
  num NUMERIC;
  clean JSONB := '{}'::JSONB;
  dept TEXT;
  referral BOOLEAN := FALSE;
  note TEXT;
  wrap JSON;
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  rid := COALESCE(pid, staff.id);
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF pid IS NOT NULL THEN
    rkey := 'p:' || pid::TEXT;
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    ok := public.survey_open_for_participant(s, person, c);
    cohort_id := person."cohortId";
  ELSE
    rkey := 'u:' || staff.id::TEXT;
    ok := public.survey_open_for_staff(s, staff.id);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'ANSWERS_INVALID'; END IF;

  FOR q IN SELECT * FROM "SurveyQuestion" WHERE "surveyId" = s.id ORDER BY position LOOP
    -- A FILE answer is the {url, name} object the app sends; an older client may send the link as a plain string.
    IF q.kind = 'FILE' AND jsonb_typeof(p_answers -> q.id::TEXT) = 'object' THEN
      val := NULLIF(trim(COALESCE(p_answers -> q.id::TEXT ->> 'url', '')), '');
    ELSE
      val := NULLIF(trim(COALESCE(p_answers ->> q.id::TEXT, '')), '');
    END IF;
    IF val IS NULL THEN
      IF q.required THEN RAISE EXCEPTION 'ANSWER_REQUIRED: %', q.prompt; END IF;
      CONTINUE;
    END IF;
    IF q.kind = 'RATING' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF num < 1 OR num > COALESCE((q.config ->> 'scale')::NUMERIC, 5) OR num <> trunc(num) THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num::INTEGER);
    ELSIF q.kind = 'NUMBER' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF (q.config ? 'min' AND num < (q.config ->> 'min')::NUMERIC) OR (q.config ? 'max' AND num > (q.config ->> 'max')::NUMERIC) THEN
        RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt;
      END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num);
    ELSIF q.kind = 'YESNO' THEN
      IF val NOT IN ('Yes', 'No') THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, val);
    ELSIF q.kind = 'FILE' THEN
      -- A new upload is this respondent's own private file ("fof-private:survey-files/<survey id>/<respondent id>/…"); an old answer is a public https link.
      IF length(val) > 1000 OR position('..' IN val) > 0 OR NOT (val ~ '^https://' OR val LIKE 'fof-private:survey-files/' || s.id::TEXT || '/' || rid::TEXT || '/%') THEN
        RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt;
      END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, jsonb_build_object('url', val, 'name', left(COALESCE(p_answers -> q.id::TEXT ->> 'name', ''), 200)));
    ELSE
      clean := clean || jsonb_build_object(q.id::TEXT, left(val, CASE WHEN q.kind = 'TEXT' THEN 500 ELSE 5000 END));
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO "SurveySubmission" ("surveyId", "respondentKey") VALUES (s.id, rkey);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SURVEY_ALREADY_SENT';
  END;

  IF s.anonymous THEN
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers, "submittedAt", "submittedOn")
    VALUES (s.id, NULL, cohort_id, clean, date_trunc('day', NOW()), CURRENT_DATE);
  ELSE
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers) VALUES (s.id, rkey, cohort_id, clean);
  END IF;

  -- The wrap-up answers still feed the department list and referrals.
  IF s."builtinKey" = 'WRAPUP' AND pid IS NOT NULL THEN
    SELECT clean ->> q2.id::TEXT INTO dept FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'department' LIMIT 1;
    SELECT (clean ->> q2.id::TEXT) = 'Yes' INTO referral FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'referral' LIMIT 1;
    SELECT clean ->> q2.id::TEXT INTO note FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'note' LIMIT 1;
    IF dept IS NOT NULL THEN
      wrap := public.submit_wrap_up(p_token, dept, COALESCE(referral, FALSE), COALESCE(note, ''));
      RETURN json_build_object('ok', TRUE, 'supportId', wrap ->> 'supportId', 'wantsReferral', COALESCE(referral, FALSE), 'department', dept);
    END IF;
  END IF;
  RETURN json_build_object('ok', TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.survey_window(s "Survey", p_start date, p_end date, p_practice boolean)
 RETURNS TABLE(opens timestamp with time zone, closes timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  IF s."timingMode" = 'WEEKS_BEFORE_END' THEN
    IF p_practice OR p_end IS NULL THEN
      RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    ELSE
      RETURN QUERY SELECT
        ((p_end - COALESCE(s."weeksBeforeEnd", 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
        ((p_end + COALESCE(s."closeDaysAfterEnd", 14) + 1)::TIMESTAMP AT TIME ZONE 'Africa/Lagos');
    END IF;
  ELSIF s."timingMode" = 'WEEKS_AFTER_START' THEN
    IF p_practice OR p_start IS NULL THEN
      RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    ELSE
      RETURN QUERY SELECT
        ((p_start + COALESCE(s."weeksAfterStart", 4) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
        ((p_start + COALESCE(s."weeksAfterStart", 4) * 7 + COALESCE(s."openForDays", 14))::TIMESTAMP AT TIME ZONE 'Africa/Lagos');
    END IF;
  ELSE
    RETURN QUERY SELECT s."opensAt", s."closesAt";
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.switch_my_role(p_token text, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  u "User";
BEGIN
  IF s.id IS NULL OR s."userId" IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT * INTO u FROM "User" WHERE id = s."userId" AND "isActive" IS NOT FALSE;
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') OR NOT (p_role::"Role" = ANY (public.app_user_roles(u))) THEN
    RAISE EXCEPTION 'You do not have that role';
  END IF;
  UPDATE "AppSession" SET "activeRole" = p_role::"Role" WHERE id = s.id;
  u.role := p_role::"Role";
  RETURN public.safe_user_json(u);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_attendance_follow_up_tasks(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_sunday_date DATE;
  v_due_at TIMESTAMPTZ;
  v_absence RECORD;
  v_support_id UUID;
BEGIN
  SELECT w."cohortId", public.week_class_date(c."startDate", w."weekNumber", w."classDate")
  INTO v_cohort_id, v_sunday_date
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  -- Monday morning gives the assigned support a clear, actionable follow-up
  -- slot after Sunday class without depending on a browser's timezone.
  v_due_at := ((v_sunday_date + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Africa/Lagos';

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  FOR v_absence IN
    SELECT a.id AS attendance_record_id, a."participantId"
    FROM public."AttendanceRecord" a
    JOIN public."Participant" p ON p.id = a."participantId"
    WHERE a."weekId" = p_week_id
      AND a.status = 'ABSENT'
      AND p."cohortId" = v_cohort_id
      AND p.status = 'ACTIVE'
  LOOP
    SELECT g."supportId" INTO v_support_id
    FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
    JOIN public."User" u ON u.id = g."supportId" AND u."isActive" IS NOT FALSE
    WHERE gp."participantId" = v_absence."participantId"
    LIMIT 1;

    IF v_support_id IS NOT NULL THEN
      INSERT INTO public."AttendanceFollowUpTask" (
        "attendanceRecordId", "participantId", "weekId", "supportId", "dueAt"
      ) VALUES (
        v_absence.attendance_record_id, v_absence."participantId", p_week_id, v_support_id, v_due_at
      )
      ON CONFLICT ("attendanceRecordId") DO UPDATE
        SET "supportId" = EXCLUDED."supportId",
            "dueAt" = EXCLUDED."dueAt",
            status = CASE
              WHEN public."AttendanceFollowUpTask".status = 'DONE' THEN 'DONE'
              ELSE 'OPEN'
            END,
            "updatedAt" = NOW();
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_add_prospect(p_token text, p_full_name text, p_phone text, p_guardian_phone text, p_gender text, p_email text, p_cohort_id uuid DEFAULT NULL::uuid, p_guardian_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_enabled JSONB;
  v_name TEXT := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_own TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_guard TEXT := NULLIF(btrim(COALESCE(p_guardian_phone, '')), '');
  v_guard_name TEXT := NULLIF(regexp_replace(btrim(COALESCE(p_guardian_name, '')), '\s+', ' ', 'g'), '');
  v_gender TEXT := CASE lower(btrim(COALESCE(p_gender, ''))) WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' ELSE NULL END;
  v_email TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_cohort UUID := COALESCE(p_cohort_id, public.current_programme_cohort_id());
  v_phone TEXT;
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_owner_name TEXT;
  v_is_test BOOLEAN;
  v_reason TEXT;
  v_on_tag BOOLEAN;
  v_prev_owner UUID;
  v_prev_owner_name TEXT;
BEGIN
  IF actor.id IS NULL OR actor.role::text NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';
  IF v_enabled IS DISTINCT FROM to_jsonb(true) THEN
    RAISE EXCEPTION 'Teen handling is not switched on yet';
  END IF;
  IF char_length(v_name) < 2 THEN RAISE EXCEPTION 'Enter the teen''s name'; END IF;
  IF v_gender IS NULL THEN RAISE EXCEPTION 'Choose Male or Female'; END IF;
  IF v_cohort IS NULL THEN RAISE EXCEPTION 'There is no current cohort'; END IF;

  v_own := CASE WHEN public.followup_phone_is_valid(v_own) THEN public.fof_local_phone(v_own) END;
  v_guard := CASE WHEN public.followup_phone_is_valid(v_guard) THEN public.fof_local_phone(v_guard) END;
  IF v_own IS NULL AND v_guard IS NULL THEN
    RAISE EXCEPTION 'Add their number or a parent''s number';
  END IF;
  v_phone := COALESCE(v_own, v_guard);
  -- The church FOF email. The same address is in frontend/src/components/followups/TeenAddFields.tsx.
  v_email := COALESCE(v_email, 'tcn.fof.ikd@gmail.com');
  v_is_test := actor."isTest" IS TRUE;
  v_reason := 'Added as a teen by ' || actor.name;

  SELECT * INTO v_contact
  FROM "FollowUpContact" c
  WHERE (c."cohortId" = v_cohort OR c."cohortId" IS NULL)
    AND public.fof_phone_key(c.phone) = public.fof_phone_key(v_phone)
    AND public.fof_name_key(c."fullName") = public.fof_name_key(v_name)
  ORDER BY (c."cohortId" = v_cohort) DESC NULLS LAST, c."createdAt" DESC
  LIMIT 1;

  IF v_contact.id IS NOT NULL THEN
    -- Already known (say a support saved them as a prospect): make them a teen
    -- and, unless a Teen Support already holds them, hand them on.
    SELECT EXISTS (
      SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
      WHERE m."userId" = v_contact."ownerId"
    ) INTO v_on_tag;
    -- An adult who holds them now loses them: remember who, so they are told.
    IF v_contact."ownerId" IS NOT NULL AND NOT v_on_tag AND v_contact."registrationStatus" NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
      v_prev_owner := v_contact."ownerId";
      SELECT name INTO v_prev_owner_name FROM "User" WHERE id = v_prev_owner;
    END IF;
    UPDATE "FollowUpContact" SET
      "registrationStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "registrationStatus" ELSE 'TEENAGER'::"FollowUpRegistrationStatus" END,
      "ageRange" = '10 - 17',
      gender = COALESCE(NULLIF(gender, ''), v_gender),
      "guardianPhone" = COALESCE(v_guard, "guardianPhone"),
      "guardianName" = COALESCE(v_guard_name, "guardianName"),
      email = COALESCE(NULLIF(btrim(email), ''), v_email),
      "cohortId" = COALESCE("cohortId", v_cohort),
      "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
      "ownerId" = CASE WHEN "ownerId" IS NOT NULL AND NOT v_on_tag THEN NULL ELSE "ownerId" END,
      "archivedAt" = NULL,
      "registeredById" = COALESCE("registeredById", actor.id),
      "manualRegistrationAt" = COALESCE("manualRegistrationAt", now()),
      "manualRegistrationBy" = COALESCE("manualRegistrationBy", actor.id),
      "manualRegistrationReason" = COALESCE("manualRegistrationReason", v_reason),
      "updatedAt" = now()
    WHERE id = v_contact.id
    RETURNING * INTO v_contact;
  ELSE
    INSERT INTO "FollowUpContact" (
      "fullName", phone, "guardianPhone", "guardianName", email, gender, "ageRange", "cohortId", source,
      "registeredById", "registeredByActedAs", "registrationStatus", "replyStatus", "nextAction", "isTest",
      "manualRegistrationAt", "manualRegistrationBy", "manualRegistrationReason"
    ) VALUES (
      v_name, v_phone, v_guard, v_guard_name, v_email, v_gender, '10 - 17', v_cohort, 'Added for follow up by ' || actor.name || ' (teen)',
      actor.id, actor.role::text, 'TEENAGER', 'REPLIED', 'SEND_MESSAGE', v_is_test,
      now(), actor.id, v_reason
    ) RETURNING * INTO v_contact;
  END IF;

  SELECT id INTO v_part_id FROM "Participant" WHERE "followUpContactId" = v_contact.id;
  IF v_part_id IS NULL THEN
    SELECT id INTO v_part_id FROM "Participant" p
    WHERE p."cohortId" = v_cohort
      AND public.fof_phone_key(p.phone) = public.fof_phone_key(v_phone)
      AND public.fof_name_key(p."fullName") = public.fof_name_key(v_name)
    LIMIT 1;
  END IF;
  IF v_part_id IS NULL THEN
    INSERT INTO "Participant" ("fullName", phone, "guardianPhone", "cohortId", source, status, email, gender, "ageRange", "followUpContactId", "registrationDate", "isTest")
    VALUES (v_name, v_phone, v_guard, v_cohort, 'FOLLOW_UP', 'ACTIVE', v_email, v_gender, '10 - 17', v_contact.id, now(), v_is_test)
    RETURNING id INTO v_part_id;
  ELSE
    UPDATE "Participant" SET
      "ageRange" = '10 - 17',
      "guardianPhone" = COALESCE(v_guard, "guardianPhone"),
      gender = COALESCE(NULLIF(gender, ''), v_gender),
      "followUpContactId" = COALESCE("followUpContactId", v_contact.id),
      "updatedAt" = now()
    WHERE id = v_part_id;
  END IF;

  IF v_prev_owner IS NOT NULL THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_prev_owner, 'A teen moved to a Teen Support',
            v_name || ' was added as a teen, so they now go to a Teen Support and are off your list.',
            '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;

  PERFORM public.assign_teen_contacts(v_contact.id);
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = v_contact.id;
  SELECT name INTO v_owner_name FROM "User" WHERE id = v_contact."ownerId";

  RETURN jsonb_build_object(
    'contactId', v_contact.id,
    'participantId', v_part_id,
    'ownerId', v_contact."ownerId",
    'ownerName', v_owner_name,
    'previousOwnerName', v_prev_owner_name,
    'waiting', v_contact."ownerId" IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_cap_for(p_cohort uuid, p_gender text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(NULLIF(value->>(CASE p_gender WHEN 'Female' THEN 'maxTeensPerFemaleTeenSupport' WHEN 'Male' THEN 'maxTeensPerMaleTeenSupport' END), '')::int, 0)
       FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    (SELECT NULLIF(value->>'maxTeensPerTeenSupport', '')::int FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    4
  )
$function$;

CREATE OR REPLACE FUNCTION public.teen_card_mark(p_participant_id uuid, p_what text, p_on boolean, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_person public."Participant";
  v_contact public."FollowUpContact";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();
  IF p_what NOT IN ('CONSENT', 'CANT_REACH', 'NOT_INTERESTED') THEN RAISE EXCEPTION 'Unknown change'; END IF;

  SELECT * INTO v_person FROM public."Participant" WHERE id = p_participant_id;
  IF v_person.id IS NULL OR NOT public.fof_is_teen_age(v_person."ageRange") THEN
    RAISE EXCEPTION 'This is only for teens';
  END IF;
  SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = v_person."followUpContactId";
  IF v_contact.id IS NULL THEN RAISE EXCEPTION 'This teen has no follow-up record'; END IF;

  IF NOT public.app_is_admin()
     AND v_contact."ownerId" IS DISTINCT FROM v_actor_id
     AND NOT EXISTS (
       SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
       WHERE gp."participantId" = v_person.id AND g."supportId" = v_actor_id
     ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can change this';
  END IF;

  IF p_what = 'CONSENT' THEN
    UPDATE public."FollowUpContact"
    SET "guardianConsentAt" = CASE WHEN p_on THEN NOW() END,
        "guardianConsentById" = CASE WHEN p_on THEN v_actor_id END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  ELSIF p_what = 'CANT_REACH' THEN
    UPDATE public."FollowUpContact"
    SET "noResponseAt" = CASE WHEN p_on THEN COALESCE("noResponseAt", NOW()) END,
        "notInterestedAt" = CASE WHEN p_on THEN NULL ELSE "notInterestedAt" END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  ELSE
    UPDATE public."FollowUpContact"
    SET "notInterestedAt" = CASE WHEN p_on THEN COALESCE("notInterestedAt", NOW()) END,
        "notInterestedNote" = CASE WHEN p_on THEN NULLIF(btrim(COALESCE(p_note, '')), '') END,
        "noResponseAt" = CASE WHEN p_on THEN NULL ELSE "noResponseAt" END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  END IF;

  RETURN json_build_object(
    'guardianConsentAt', v_contact."guardianConsentAt",
    'noResponseAt', v_contact."noResponseAt",
    'notInterestedAt', v_contact."notInterestedAt",
    'notInterestedNote', v_contact."notInterestedNote"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_convert_participant(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  rec "Participant";
  v_contact "FollowUpContact";
  v_keep BOOLEAN;
  v_prev UUID;
  v_created BOOLEAN := FALSE;
  v_support UUID;
  v_told INT := 0;
  v_has_form BOOLEAN;
BEGIN
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec.status <> 'ACTIVE' OR rec."isTest" IS TRUE OR rec."cohortId" IS DISTINCT FROM v_cohort THEN
    RETURN jsonb_build_object('skipped', 'not an active participant of the current cohort');
  END IF;
  IF NOT COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) THEN
    RETURN jsonb_build_object('skipped', 'teen handling is off');
  END IF;

  -- Out of any adult group, and that group's support is told. Done first: moving the contact also runs the teen group sync,
  -- which would take them out of the adult group before we could see who to tell.
  FOR v_support IN
    SELECT DISTINCT g."supportId" FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = rec.id AND NOT g."isTeenGroup" AND g."supportId" IS NOT NULL
  LOOP
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_support, 'A teen left your group',
            rec."fullName" || ' is under 18, so a Teen Support looks after them now and they are no longer in your group.',
            '/support', 'FOLLOWUP_ASSIGNMENT');
    v_told := v_told + 1;
  END LOOP;
  DELETE FROM "GroupParticipant" gp USING "Group" g
   WHERE gp."participantId" = rec.id AND g.id = gp."groupId" AND NOT g."isTeenGroup";

  IF rec."followUpContactId" IS NOT NULL THEN
    SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  END IF;
  IF v_contact.id IS NULL THEN
    SELECT * INTO v_contact FROM "FollowUpContact" c
    WHERE (c."cohortId" = v_cohort OR c."cohortId" IS NULL)
      AND public.fof_phone_key(c.phone) = public.fof_phone_key(rec.phone)
      AND public.fof_name_key(c."fullName") = public.fof_name_key(rec."fullName")
    ORDER BY (c."cohortId" = v_cohort) DESC NULLS LAST, c."createdAt" DESC
    LIMIT 1;
  END IF;

  IF v_contact.id IS NULL THEN
    INSERT INTO "FollowUpContact" (
      "fullName", phone, "guardianPhone", email, gender, "ageRange", "cohortId", source,
      "registrationStatus", "replyStatus", "nextAction", "isTest", "manualRegistrationAt", "manualRegistrationReason"
    ) VALUES (
      rec."fullName", rec.phone, rec."guardianPhone", rec.email, rec.gender, '10 - 17', v_cohort, 'Moved to teen handling',
      'TEENAGER', 'REPLIED', 'SEND_MESSAGE', FALSE, now(), 'Age range changed to a teen age'
    ) RETURNING * INTO v_contact;
    v_created := TRUE;
  ELSE
    -- Someone who signed up on the form already has their registration on record. Only a contact with no form behind it
    -- is marked as registered by hand (the form gate lets a contact with no form back to Registered only with that mark).
    v_has_form := EXISTS (SELECT 1 FROM "SheetRegistration" r WHERE r."contactId" = v_contact.id);
    v_keep := v_contact."ownerId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id
      JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
      WHERE u.id = v_contact."ownerId" AND u.gender IS NOT NULL AND u.gender = COALESCE(NULLIF(v_contact.gender, ''), rec.gender)
    );
    IF v_contact."ownerId" IS NOT NULL AND NOT v_keep THEN v_prev := v_contact."ownerId"; END IF;

    UPDATE "FollowUpContact" SET
      "registrationStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "registrationStatus" ELSE 'TEENAGER'::"FollowUpRegistrationStatus" END,
      "ageRange" = '10 - 17',
      gender = COALESCE(NULLIF(gender, ''), rec.gender),
      "guardianPhone" = COALESCE("guardianPhone", rec."guardianPhone"),
      "cohortId" = COALESCE("cohortId", v_cohort),
      "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
      "nextAction" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "nextAction" ELSE 'SEND_MESSAGE'::"FollowUpNextAction" END,
      "ownerId" = CASE WHEN v_keep THEN "ownerId" ELSE NULL END,
      "archivedAt" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "archivedAt" ELSE NULL END,
      "manualRegistrationAt" = CASE WHEN v_has_form THEN "manualRegistrationAt" ELSE COALESCE("manualRegistrationAt", now()) END,
      "manualRegistrationReason" = CASE WHEN v_has_form THEN "manualRegistrationReason" ELSE COALESCE("manualRegistrationReason", 'Age range changed to a teen age') END,
      "updatedAt" = now()
    WHERE id = v_contact.id
    RETURNING * INTO v_contact;

    IF v_prev IS NOT NULL THEN
      INSERT INTO "Notification" ("userId", title, body, path, type)
      VALUES (v_prev, 'A teen moved to a Teen Support',
              rec."fullName" || ' is under 18, so they now go to a Teen Support and are off your list.',
              '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
      v_told := v_told + 1;
    END IF;
  END IF;

  UPDATE "Participant" SET "followUpContactId" = COALESCE("followUpContactId", v_contact.id), "updatedAt" = now() WHERE id = rec.id;

  RETURN jsonb_build_object('converted', TRUE, 'contactId', v_contact.id, 'created', v_created, 'told', v_told);
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_enable_move_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."settingKey" <> 'teen_flow_enabled' OR NEW.value IS DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE "settingKey" = 'teen_move_done') THEN RETURN NEW; END IF;
  PERFORM public.teen_move_existing();
  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt") VALUES ('teen_move_done', to_jsonb(true), now())
  ON CONFLICT ("settingKey") DO NOTHING;
  -- Quiet Teen Supports are accepted for the first 48 hours so the go-live placement is complete.
  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt")
  VALUES ('teen_quiet_bypass_until', to_jsonb((now() + interval '48 hours')::text), now())
  ON CONFLICT ("settingKey") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_family_members(p_participant_id uuid)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT q.id, q."fullName"
  FROM "Participant" me
  JOIN "Participant" q
    ON public.fof_phone_key(q.phone) = public.fof_phone_key(me.phone)
   AND q."cohortId" IS NOT DISTINCT FROM me."cohortId"
  JOIN "ParticipantAccount" a ON a."participantId" = q.id AND a."isActive"
  WHERE me.id = p_participant_id
    AND me."ageRange" = '10 - 17'
    AND public.fof_phone_key(me.phone) IS NOT NULL
    AND q."ageRange" = '10 - 17'
    AND q.status = 'ACTIVE'
  ORDER BY q."fullName";
$function$;

CREATE OR REPLACE FUNCTION public.teen_group_meeting_limits()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (SELECT value::JSONB FROM "AppSetting" WHERE "settingKey" = 'teen_group_meeting_limits'),
    public.group_meeting_limits()
  );
$function$;

CREATE OR REPLACE FUNCTION public.teen_group_sync(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_cohort UUID;
  v_group UUID;
  v_name TEXT;
  v_base TEXT;
BEGIN
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_part_id FROM "Participant" WHERE "followUpContactId" = p_contact_id LIMIT 1;
  IF v_part_id IS NULL THEN RETURN; END IF;

  -- Not (or no longer) a held teen: out of every teen group.
  IF v_contact."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED')
     OR v_contact."ownerId" IS NULL OR v_contact."archivedAt" IS NOT NULL THEN
    DELETE FROM "GroupParticipant" gp
    USING "Group" g
    WHERE gp."participantId" = v_part_id AND g.id = gp."groupId" AND g."isTeenGroup";
    RETURN;
  END IF;

  v_cohort := COALESCE(v_contact."cohortId", public.current_programme_cohort_id());
  IF v_cohort IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('teen_group:' || v_cohort::text || ':' || v_contact."ownerId"::text));

  SELECT id INTO v_group FROM "Group"
  WHERE "cohortId" = v_cohort AND "supportId" = v_contact."ownerId" AND "isTeenGroup" AND "archivedAt" IS NULL
  LIMIT 1;

  IF v_group IS NULL THEN
    SELECT 'Teens - ' || name INTO v_base FROM "User" WHERE id = v_contact."ownerId";
    v_name := COALESCE(v_base, 'Teens');
    IF EXISTS (SELECT 1 FROM "Group" WHERE "cohortId" = v_cohort AND name = v_name) THEN
      v_name := v_name || ' (' || left(v_contact."ownerId"::text, 4) || ')';
    END IF;
    INSERT INTO "Group" ("cohortId", name, "supportId", "isTeenGroup")
    VALUES (v_cohort, v_name, v_contact."ownerId", TRUE)
    RETURNING id INTO v_group;
  END IF;

  -- One group per participant: leave any other group (teen or adult), join this one.
  DELETE FROM "GroupParticipant" WHERE "participantId" = v_part_id AND "groupId" <> v_group;

  INSERT INTO "GroupParticipant" ("groupId", "participantId")
  VALUES (v_group, v_part_id)
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_group_sync_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'FollowUpContact' THEN
    PERFORM public.teen_group_sync(NEW.id);
  ELSIF NEW."followUpContactId" IS NOT NULL THEN
    PERFORM public.teen_group_sync(NEW."followUpContactId");
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_login_phone_set(p_token text, p_participant_id uuid, p_phone text DEFAULT NULL::text, p_remove boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  v_key TEXT;
  v_store TEXT;
  v_state JSON;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO person FROM "Participant" WHERE id = p_participant_id;
  IF person.id IS NULL OR NOT public.teen_login_staff_allowed(staff.id, staff.role::text, person.id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF person."ageRange" IS DISTINCT FROM '10 - 17' THEN RAISE EXCEPTION 'NOT_A_TEEN'; END IF;

  IF p_remove THEN
    DELETE FROM "ParticipantLoginPhone" WHERE "participantId" = person.id;
    -- Anyone signed in through that number is signed out.
    DELETE FROM "AppSession" WHERE "participantId" = person.id AND "viaTeenNumber";
  ELSE
    v_key := public.fof_phone_key(p_phone);
    IF v_key IS NULL THEN RAISE EXCEPTION 'BAD_NUMBER'; END IF;
    -- The guardian comes first: somebody on the guardian number must have chosen a password.
    IF NOT EXISTS (
      SELECT 1 FROM "Participant" q JOIN "ParticipantAccount" a ON a."participantId" = q.id
      WHERE public.fof_phone_key(q.phone) = public.fof_phone_key(person.phone) AND q."ageRange" = '10 - 17'
        AND q."cohortId" IS NOT DISTINCT FROM person."cohortId" AND a."passwordSetAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'GUARDIAN_FIRST';
    END IF;
    IF v_key = public.fof_phone_key(person.phone) THEN RAISE EXCEPTION 'SAME_AS_GUARDIAN'; END IF;
    IF EXISTS (SELECT 1 FROM "Participant" q WHERE public.fof_phone_key(q.phone) = v_key)
       OR EXISTS (SELECT 1 FROM "ParticipantLoginPhone" l WHERE public.fof_phone_key(l.phone) = v_key AND l."participantId" <> person.id) THEN
      RAISE EXCEPTION 'NUMBER_IN_USE';
    END IF;
    v_store := CASE WHEN v_key ~ '^234[0-9]{10}$' THEN '0' || substr(v_key, 4) ELSE v_key END;
    INSERT INTO "ParticipantLoginPhone" ("participantId", phone, "addedById")
    VALUES (person.id, v_store, staff.id)
    ON CONFLICT ("participantId") DO UPDATE SET phone = EXCLUDED.phone, "addedById" = EXCLUDED."addedById", "updatedAt" = NOW();
    -- A changed number ends sessions that came in through the old one.
    DELETE FROM "AppSession" WHERE "participantId" = person.id AND "viaTeenNumber";
  END IF;

  SELECT (public.teen_login_state(p_token, ARRAY[person.id]) -> 0) INTO v_state;
  RETURN v_state;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_login_staff_allowed(p_staff_id uuid, p_staff_role text, p_participant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p_staff_role = 'ADMIN'
    OR (p_staff_role = 'SUPPORT' AND (
      EXISTS (
        SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = p_participant_id AND g."supportId" = p_staff_id
      )
      OR EXISTS (
        SELECT 1 FROM "Participant" p JOIN "FollowUpContact" f ON f.id = p."followUpContactId"
        WHERE p.id = p_participant_id AND (f."ownerId" = p_staff_id OR f."registeredById" = p_staff_id)
      )
    ));
$function$;

CREATE OR REPLACE FUNCTION public.teen_login_state(p_token text, p_participant_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', p.id,
      'ownPhone', l.phone,
      'status', CASE
        WHEN p."ageRange" IS DISTINCT FROM '10 - 17' THEN 'NOT_TEEN'
        WHEN l."participantId" IS NOT NULL THEN 'SET'
        WHEN EXISTS (
          SELECT 1 FROM "Participant" q JOIN "ParticipantAccount" a ON a."participantId" = q.id
          WHERE public.fof_phone_key(q.phone) = public.fof_phone_key(p.phone) AND q."ageRange" = '10 - 17'
            AND q."cohortId" IS NOT DISTINCT FROM p."cohortId" AND a."passwordSetAt" IS NOT NULL
        ) THEN 'NONE'
        ELSE 'LOCKED'
      END
    ))
    FROM "Participant" p
    LEFT JOIN "ParticipantLoginPhone" l ON l."participantId" = p.id
    WHERE p.id = ANY (p_participant_ids)
      AND public.teen_login_staff_allowed(staff.id, staff.role::text, p.id)
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_move_existing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  rec RECORD;
  v_contact "FollowUpContact";
  v_keep BOOLEAN;
  v_prev UUID;
  v_moved INT := 0;
  v_created INT := 0;
  v_told INT := 0;
BEGIN
  IF v_cohort IS NULL THEN
    RETURN jsonb_build_object('moved', 0, 'created', 0, 'told', 0);
  END IF;

  FOR rec IN
    SELECT * FROM "Participant" p
    WHERE p."cohortId" = v_cohort AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow')
    ORDER BY p."fullName"
  LOOP
    v_contact := NULL;
    IF rec."followUpContactId" IS NOT NULL THEN
      SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = rec."followUpContactId";
    END IF;
    IF v_contact.id IS NULL THEN
      SELECT * INTO v_contact FROM "FollowUpContact" c
      WHERE (c."cohortId" = v_cohort OR c."cohortId" IS NULL)
        AND public.fof_phone_key(c.phone) = public.fof_phone_key(rec.phone)
        AND public.fof_name_key(c."fullName") = public.fof_name_key(rec."fullName")
      ORDER BY (c."cohortId" = v_cohort) DESC NULLS LAST, c."createdAt" DESC
      LIMIT 1;
    END IF;

    IF v_contact.id IS NULL THEN
      INSERT INTO "FollowUpContact" (
        "fullName", phone, "guardianPhone", email, gender, "ageRange", "cohortId", source,
        "registrationStatus", "replyStatus", "nextAction", "isTest", "manualRegistrationAt", "manualRegistrationReason"
      ) VALUES (
        rec."fullName", rec.phone, rec."guardianPhone", rec.email, rec.gender, '10 - 17', v_cohort, 'Moved to teen handling',
        'TEENAGER', 'REPLIED', 'SEND_MESSAGE', FALSE, now(), 'Already a participant aged 17 or under when teen handling started'
      ) RETURNING * INTO v_contact;
      v_created := v_created + 1;
    ELSE
      v_prev := NULL;
      v_keep := v_contact."ownerId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "User" u
        JOIN "SupportTagMember" m ON m."userId" = u.id
        JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
        WHERE u.id = v_contact."ownerId" AND u.gender IS NOT NULL AND u.gender = COALESCE(NULLIF(v_contact.gender, ''), rec.gender)
      );
      IF v_contact."ownerId" IS NOT NULL AND NOT v_keep THEN v_prev := v_contact."ownerId"; END IF;

      UPDATE "FollowUpContact" SET
        "registrationStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "registrationStatus" ELSE 'TEENAGER'::"FollowUpRegistrationStatus" END,
        "ageRange" = '10 - 17',
        gender = COALESCE(NULLIF(gender, ''), rec.gender),
        "guardianPhone" = COALESCE("guardianPhone", rec."guardianPhone"),
        "cohortId" = COALESCE("cohortId", v_cohort),
        "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
        "nextAction" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "nextAction" ELSE 'SEND_MESSAGE'::"FollowUpNextAction" END,
        "ownerId" = CASE WHEN v_keep THEN "ownerId" ELSE NULL END,
        "archivedAt" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "archivedAt" ELSE NULL END,
        "manualRegistrationAt" = COALESCE("manualRegistrationAt", now()),
        "manualRegistrationReason" = COALESCE("manualRegistrationReason", 'Already a participant aged 17 or under when teen handling started'),
        "updatedAt" = now()
      WHERE id = v_contact.id
      RETURNING * INTO v_contact;

      IF v_prev IS NOT NULL THEN
        INSERT INTO "Notification" ("userId", title, body, path, type)
        VALUES (v_prev, 'A teen moved to a Teen Support',
                rec."fullName" || ' is under 18, so they now go to a Teen Support and are off your list.',
                '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
        v_told := v_told + 1;
      END IF;
    END IF;

    UPDATE "Participant" SET "followUpContactId" = COALESCE("followUpContactId", v_contact.id), "updatedAt" = now() WHERE id = rec.id;
    v_moved := v_moved + 1;
  END LOOP;

  RETURN jsonb_build_object('moved', v_moved, 'created', v_created, 'told', v_told);
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_owner_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok BOOLEAN;
  v_owner_changed BOOLEAN := NEW."ownerId" IS DISTINCT FROM OLD."ownerId";
  v_gender_edited BOOLEAN := OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender;
BEGIN
  IF NEW."ownerId" IS NULL
     OR NEW."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED')
     OR NOT (v_owner_changed OR v_gender_edited) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "User" u
    JOIN "SupportTagMember" m ON m."userId" = u.id
    JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE u.id = NEW."ownerId" AND u.gender IS NOT NULL AND u.gender = NEW.gender
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'A teen can only go to a Teen Support of the same gender';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_quiet_bypass()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::timestamptz > now() FROM "AppSetting" WHERE "settingKey" = 'teen_quiet_bypass_until'),
    FALSE
  );
$function$;

CREATE OR REPLACE FUNCTION public.teen_revert_participant(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec "Participant";
  v_contact "FollowUpContact";
  v_was_teen_support BOOLEAN;
BEGIN
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no follow-up contact');
  END IF;
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  IF v_contact.id IS NULL OR v_contact."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
    RETURN jsonb_build_object('skipped', 'not on the teen path');
  END IF;

  v_was_teen_support := v_contact."ownerId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE m."userId" = v_contact."ownerId"
  );

  UPDATE "FollowUpContact" SET
    "registrationStatus" = 'REGISTERED'::"FollowUpRegistrationStatus",
    "ageRange" = rec."ageRange",
    "ownerId" = CASE WHEN v_was_teen_support THEN NULL ELSE "ownerId" END,
    "archivedAt" = NULL,
    "updatedAt" = now()
  WHERE id = v_contact.id;

  IF v_was_teen_support THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_contact."ownerId", 'A teen is now an adult',
            rec."fullName" || ' is 18 or over now, so they leave your teen list and go to the usual follow-up.',
            '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;

  RETURN jsonb_build_object('reverted', TRUE, 'contactId', v_contact.id, 'toldTeenSupport', v_was_teen_support);
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_after_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM "TelegramLink" l JOIN "User" u ON u.id = l."userId"
             WHERE l."userId" = NEW."userId" AND l.enabled AND u."isTest" IS NOT TRUE) THEN
    PERFORM public.invoke_telegram_send('USER', NEW."userId", NEW.title, NEW.body);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_after_participant_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ParticipantTelegramLink" l
    JOIN "Participant" p ON p.id = l."participantId"
    WHERE l."participantId" = NEW."participantId" AND l.enabled
      AND p."isTest" IS NOT TRUE
      AND NOT public.prayer_is_practice(p."cohortId")
  ) THEN
    PERFORM public.invoke_telegram_send('PARTICIPANT', NEW."participantId", NEW.title, NEW.body);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_connect_code(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  o RECORD;
  v_code TEXT := replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  DELETE FROM "TelegramLinkCode" WHERE "expiresAt" < NOW() OR ("ownerKind" = o.kind AND "ownerId" = o.owner_id);
  INSERT INTO "TelegramLinkCode" (code, "ownerKind", "ownerId", "expiresAt") VALUES (v_code, o.kind, o.owner_id, NOW() + INTERVAL '15 minutes');
  RETURN v_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_disconnect(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  DELETE FROM "TelegramLinkCode" WHERE "ownerKind" = o.kind AND "ownerId" = o.owner_id;
  IF o.kind = 'USER' THEN
    DELETE FROM "TelegramLink" WHERE "userId" = o.owner_id;
  ELSE
    DELETE FROM "ParticipantTelegramLink" WHERE "participantId" = o.owner_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_link_chat(p_code text, p_chat_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c "TelegramLinkCode";
BEGIN
  DELETE FROM "TelegramLinkCode" WHERE code = p_code AND "expiresAt" >= NOW() RETURNING * INTO c;
  IF c.code IS NULL THEN RETURN 'INVALID'; END IF;
  -- One chat belongs to one person: whoever pressed Start last takes it, so one person's messages never reach another's chat.
  DELETE FROM "TelegramLink" WHERE "chatId" = p_chat_id AND NOT (c."ownerKind" = 'USER' AND "userId" = c."ownerId");
  DELETE FROM "ParticipantTelegramLink" WHERE "chatId" = p_chat_id AND NOT (c."ownerKind" = 'PARTICIPANT' AND "participantId" = c."ownerId");
  IF c."ownerKind" = 'USER' THEN
    INSERT INTO "TelegramLink" ("userId", "chatId") VALUES (c."ownerId", p_chat_id)
    ON CONFLICT ("userId") DO UPDATE SET "chatId" = EXCLUDED."chatId", enabled = TRUE, "blockedAt" = NULL, "linkedAt" = NOW();
  ELSE
    INSERT INTO "ParticipantTelegramLink" ("participantId", "chatId") VALUES (c."ownerId", p_chat_id)
    ON CONFLICT ("participantId") DO UPDATE SET "chatId" = EXCLUDED."chatId", enabled = TRUE, "blockedAt" = NULL, "linkedAt" = NOW();
  END IF;
  RETURN 'OK';
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_owner(p_token text)
 RETURNS TABLE(kind text, owner_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff(p_token);
  pid UUID;
BEGIN
  IF u.id IS NOT NULL THEN
    kind := 'USER'; owner_id := u.id; RETURN NEXT; RETURN;
  END IF;
  pid := public.app_participant_id(p_token);
  IF pid IS NOT NULL THEN
    kind := 'PARTICIPANT'; owner_id := pid; RETURN NEXT;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_set_chat_enabled(p_chat_id bigint, p_enabled boolean, p_blocked boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  a INTEGER;
  b INTEGER;
BEGIN
  UPDATE "TelegramLink" SET enabled = p_enabled, "blockedAt" = CASE WHEN p_blocked THEN NOW() ELSE NULL END WHERE "chatId" = p_chat_id;
  GET DIAGNOSTICS a = ROW_COUNT;
  UPDATE "ParticipantTelegramLink" SET enabled = p_enabled, "blockedAt" = CASE WHEN p_blocked THEN NOW() ELSE NULL END WHERE "chatId" = p_chat_id;
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN a + b;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_set_enabled(p_token text, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF o.kind = 'USER' THEN
    UPDATE "TelegramLink" SET enabled = p_enabled WHERE "userId" = o.owner_id AND (NOT p_enabled OR "blockedAt" IS NULL);
  ELSE
    UPDATE "ParticipantTelegramLink" SET enabled = p_enabled WHERE "participantId" = o.owner_id AND (NOT p_enabled OR "blockedAt" IS NULL);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_status(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  o RECORD;
  l RECORD;
  v_eligible BOOLEAN;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF o.kind = 'USER' THEN
    SELECT t.enabled, t."blockedAt" INTO l FROM "TelegramLink" t WHERE t."userId" = o.owner_id;
    SELECT u."isTest" IS NOT TRUE INTO v_eligible FROM "User" u WHERE u.id = o.owner_id;
  ELSE
    SELECT t.enabled, t."blockedAt" INTO l FROM "ParticipantTelegramLink" t WHERE t."participantId" = o.owner_id;
    SELECT p."isTest" IS NOT TRUE AND NOT public.prayer_is_practice(p."cohortId") INTO v_eligible FROM "Participant" p WHERE p.id = o.owner_id;
  END IF;
  RETURN json_build_object('connected', l.enabled IS NOT NULL, 'enabled', COALESCE(l.enabled, FALSE), 'blocked', l."blockedAt" IS NOT NULL,
                           'eligible', COALESCE(v_eligible, FALSE));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_hub_meeting(p_hub_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."SupportHub";
  v_hub public."SupportHub";
  v_people UUID[];
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set a hub''s meeting';
  END IF;
  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  SELECT * INTO v_old FROM public."SupportHub" WHERE id = p_hub_id;

  UPDATE public."SupportHub"
  SET "meetingDay" = p_meeting_day,
      "meetingTime" = p_meeting_time,
      "callPlatform" = p_call_platform,
      "callLink" = p_call_link
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF p_notify AND (
    v_old."meetingDay" IS DISTINCT FROM v_hub."meetingDay"
    OR v_old."meetingTime" IS DISTINCT FROM v_hub."meetingTime"
    OR v_old."callLink" IS DISTINCT FROM v_hub."callLink"
  ) AND v_hub."meetingDay" IS NOT NULL AND v_hub."meetingTime" IS NOT NULL THEN
    SELECT array_agg(DISTINCT u) INTO v_people FROM (
      SELECT m."userId" AS u FROM public."HubMembership" m WHERE m."hubId" = v_hub.id
      UNION SELECT v_hub."leadUserId" WHERE v_hub."leadUserId" IS NOT NULL
      UNION SELECT v_hub."assistantLeadUserId" WHERE v_hub."assistantLeadUserId" IS NOT NULL
    ) x;
    PERFORM public.invoke_hub_message_push(
      v_people,
      format('%s meeting', v_hub.name),
      format('Now %s at %s. Open My Hub to join.',
        initcap(lower(v_hub."meetingDay")), to_char(v_hub."meetingTime"::time, 'FMHH12:MI AM')));
  END IF;

  RETURN jsonb_build_object(
    'id', v_hub.id, 'name', v_hub.name, 'leadUserId', v_hub."leadUserId", 'cohortId', v_hub."cohortId",
    'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime",
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_hub_message(p_message_id uuid, p_subject text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_subject TEXT;
  v_body TEXT;
  v_message public."HubMessage";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_message FROM public."HubMessage" WHERE id = p_message_id;
  IF v_message.id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_message."authorId" IS DISTINCT FROM v_actor_id
      AND NOT public.app_hub_can(v_message."hubId", 'MESSAGE')
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead, its assistant lead, or an admin can edit this message';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;

  UPDATE public."HubMessage"
  SET subject = v_subject, body = v_body, "editedAt" = NOW()
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body,
    'createdAt', v_message."createdAt", 'editedAt', v_message."editedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_participant_profile(p_token text, p_email text, p_occupation text, p_date_of_birth date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cleaned_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned_email IS NOT NULL AND cleaned_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  IF p_date_of_birth IS NOT NULL AND (p_date_of_birth > CURRENT_DATE OR p_date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'INVALID_DATE_OF_BIRTH';
  END IF;
  UPDATE "Participant"
  SET email = cleaned_email,
      occupation = NULLIF(trim(COALESCE(p_occupation, '')), ''),
      "dateOfBirth" = p_date_of_birth,
      "updatedAt" = NOW()
  WHERE id = person_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_testimony(p_token text, p_id uuid, p_title text, p_body text, p_visibility text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  my_cohort_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Testimony" WHERE id = p_id AND "participantId" = person_id AND status IN ('PENDING', 'APPROVED')
  ) THEN
    RAISE EXCEPTION 'NOT_EDITABLE';
  END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT g."supportId" INTO v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  v_status := CASE WHEN p_visibility = 'SUPPORT' THEN 'APPROVED' ELSE 'PENDING' END;

  UPDATE "Testimony"
  SET title = NULLIF(trim(COALESCE(p_title, '')), ''),
      body = v_body,
      visibility = p_visibility,
      status = v_status,
      "reviewedById" = NULL,
      "reviewedAt" = CASE WHEN v_status = 'APPROVED' THEN NOW() ELSE NULL END,
      "viewedAt" = NULL,
      "viewedById" = NULL,
      "updatedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt",
    'supportId', v_support_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_prayer_slot(p_token text, p_cohort_id uuid, p_id uuid, p_name text, p_time text, p_type text, p_timer integer, p_window integer, p_target_mode text, p_notify boolean, p_active boolean, p_blocks jsonb, p_audience_all boolean, p_hub_ids uuid[], p_telegram text, p_wait integer, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_time time;
  v_row public."CorporatePrayerSlot";
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_all boolean := COALESCE(p_audience_all, TRUE);
  v_hubs uuid[] := CASE WHEN COALESCE(p_audience_all, TRUE) THEN '{}'::uuid[] ELSE COALESCE(p_hub_ids, '{}'::uuid[]) END;
  v_blocks jsonb := '[]'::jsonb;
  v_link text := NULLIF(btrim(COALESCE(p_telegram, '')), '');
  v_msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_mode text := CASE WHEN p_type = 'PRAYER' THEN COALESCE(p_target_mode, 'HUB') ELSE NULL END;
  b jsonb;
  v_n integer := 0;
  v_projects integer := 0;
  x record;
  v_clash uuid[];
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF p_type NOT IN ('PRAYER', 'LIVE') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  BEGIN v_time := p_time::time; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_TIME'; END;
  IF COALESCE(p_timer, 15) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_TIMER'; END IF;
  IF COALESCE(p_window, 15) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF v_name IS NOT NULL AND length(v_name) > 40 THEN RAISE EXCEPTION 'NAME_TOO_LONG'; END IF;
  IF v_mode IS NOT NULL AND v_mode NOT IN ('COHORT', 'HUB') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;

  -- Audience: everyone, or at least one hub of this cohort.
  IF NOT v_all AND COALESCE(array_length(v_hubs, 1), 0) = 0 THEN RAISE EXCEPTION 'AUDIENCE_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_hubs) h WHERE NOT EXISTS (SELECT 1 FROM public."SupportHub" sh WHERE sh.id = h AND sh."cohortId" = p_cohort_id)) THEN
    RAISE EXCEPTION 'INVALID_HUB';
  END IF;

  IF p_type = 'PRAYER' THEN
    IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' OR jsonb_array_length(p_blocks) = 0 THEN RAISE EXCEPTION 'BLOCKS_REQUIRED'; END IF;
    IF jsonb_array_length(p_blocks) > 8 THEN RAISE EXCEPTION 'TOO_MANY_BLOCKS'; END IF;
    FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
      v_n := v_n + 1;
      IF b->>'type' = 'VERSE' THEN
        IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" v WHERE v.id::text = b->>'verseId') THEN RAISE EXCEPTION 'VERSE_NOT_FOUND'; END IF;
        v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', b->>'verseId'));
      ELSIF b->>'type' = 'FAITH_PROJECT' THEN
        v_projects := v_projects + 1;
        IF v_projects > 1 THEN RAISE EXCEPTION 'ONE_PROJECT_ONLY'; END IF;
        v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'FAITH_PROJECT'));
      ELSE
        RAISE EXCEPTION 'INVALID_BLOCK';
      END IF;
    END LOOP;
  ELSE
    IF v_link IS NULL THEN RAISE EXCEPTION 'LINK_REQUIRED'; END IF;
    IF v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
    IF COALESCE(p_wait, 5) NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'INVALID_WAIT'; END IF;
    IF v_msg IS NOT NULL AND length(v_msg) > 120 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  END IF;

  -- No hub may be in two active slots at the same time.
  IF COALESCE(p_active, TRUE) THEN
    FOR x IN SELECT o.id, o."audienceAll", o."hubIds" FROM public."CorporatePrayerSlot" o
             WHERE o."cohortId" = p_cohort_id AND o.active AND NOT o."isTest" AND o."timeOfDay" = v_time AND o.id IS DISTINCT FROM p_id LOOP
      v_clash := CASE
        WHEN v_all AND x."audienceAll" THEN NULL
        WHEN v_all THEN x."hubIds"
        WHEN x."audienceAll" THEN v_hubs
        ELSE ARRAY(SELECT unnest(v_hubs) INTERSECT SELECT unnest(x."hubIds"))
      END;
      IF (v_all AND x."audienceAll") OR COALESCE(array_length(v_clash, 1), 0) > 0 THEN
        RAISE EXCEPTION 'HUB_CLASH:%', COALESCE((SELECT string_agg(h.name, ', ' ORDER BY h.name) FROM public."SupportHub" h WHERE h.id = ANY (v_clash)), 'everyone');
      END IF;
    END LOOP;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerSlot" ("cohortId", name, "timeOfDay", "slotType", "timerMinutes", "joinWindowMinutes", "targetMode", notify, active,
                                              blocks, "audienceAll", "hubIds", "telegramLink", "liveWaitMinutes", "liveMessage")
    VALUES (p_cohort_id, v_name, v_time, p_type, CASE WHEN p_type = 'LIVE' THEN 15 ELSE COALESCE(p_timer, 15) END, COALESCE(p_window, 15), v_mode,
            COALESCE(p_notify, TRUE), COALESCE(p_active, TRUE),
            v_blocks, v_all, v_hubs,
            CASE WHEN p_type = 'LIVE' THEN v_link END, CASE WHEN p_type = 'LIVE' THEN COALESCE(p_wait, 5) ELSE 5 END, CASE WHEN p_type = 'LIVE' THEN v_msg END)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerSlot" SET
      name = v_name, "timeOfDay" = v_time, "slotType" = p_type,
      "timerMinutes" = CASE WHEN p_type = 'LIVE' THEN 15 ELSE COALESCE(p_timer, 15) END, "joinWindowMinutes" = COALESCE(p_window, 15),
      "targetMode" = v_mode, notify = COALESCE(p_notify, TRUE), active = COALESCE(p_active, TRUE),
      blocks = v_blocks, "audienceAll" = v_all, "hubIds" = v_hubs,
      "telegramLink" = CASE WHEN p_type = 'LIVE' THEN v_link END, "liveWaitMinutes" = CASE WHEN p_type = 'LIVE' THEN COALESCE(p_wait, 5) ELSE 5 END,
      "liveMessage" = CASE WHEN p_type = 'LIVE' THEN v_msg END, "updatedAt" = now()
    WHERE id = p_id AND "cohortId" = p_cohort_id AND NOT "isTest"
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    -- Today's and later days' sessions that nobody has joined are dropped, so the change takes effect (they are made again when next
    -- needed). A session someone joined is history and stays. Switching the slot off ends one that is open right now.
    DELETE FROM public."CorporatePrayerSession" se
    WHERE se."slotId" = v_row.id AND se."prayerDate" >= public.prayer_lagos_today()
      AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id);
    IF NOT v_row.active THEN
      UPDATE public."CorporatePrayerSession" SET "closesAt" = LEAST("closesAt", now())
      WHERE "slotId" = v_row.id AND "prayerDate" >= public.prayer_lagos_today() - 1 AND "closesAt" > now();
    END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_prayer_verse(p_token text, p_id uuid, p_title text, p_prayer text, p_reference text, p_active boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row public."CorporatePrayerVerse";
  v_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_prayer text := NULLIF(btrim(COALESCE(p_prayer, '')), '');
  v_ref text := NULLIF(btrim(COALESCE(p_reference, '')), '');
  v_slots text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF v_title IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF length(v_title) > 60 THEN RAISE EXCEPTION 'TITLE_TOO_LONG'; END IF;
  IF v_prayer IS NULL THEN RAISE EXCEPTION 'PRAYER_REQUIRED'; END IF;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  IF length(v_prayer) > 1500 THEN RAISE EXCEPTION 'PRAYER_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE lower(btrim(x.title)) = lower(v_title) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'TITLE_TAKEN';
  END IF;
  IF p_id IS NOT NULL AND NOT COALESCE(p_active, TRUE) AND EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE x.id = p_id AND x.active) THEN
    SELECT string_agg(COALESCE(sl.name, to_char(sl."timeOfDay", 'HH24:MI')), ', ' ORDER BY sl."timeOfDay") INTO v_slots
    FROM public."CorporatePrayerSlot" sl
    WHERE NOT sl."isTest" AND sl.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', p_id));
    IF v_slots IS NOT NULL THEN RAISE EXCEPTION 'VERSE_IN_SLOT:%', v_slots; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerVerse" (title, prayer, reference, "sortOrder", active)
    VALUES (v_title, v_prayer, v_ref, COALESCE((SELECT max("sortOrder") + 1 FROM public."CorporatePrayerVerse"), 0), COALESCE(p_active, TRUE))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerVerse" SET title = v_title, prayer = v_prayer, reference = v_ref, active = COALESCE(p_active, TRUE), "updatedAt" = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_age_from_birth_year()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_age INT;
  v_range TEXT;
  v_dob DATE;
BEGIN
  IF NEW."birthYear" IS NOT NULL THEN
    IF NEW.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
      -- Exact: the day is capped so 02-30 or 29 Feb in a non-leap year still gives a date.
      v_dob := make_date(NEW."birthYear", substr(NEW.birthday, 1, 2)::int, 1)
               + (LEAST(substr(NEW.birthday, 4, 2)::int,
                        EXTRACT(DAY FROM (date_trunc('month', make_date(NEW."birthYear", substr(NEW.birthday, 1, 2)::int, 1)) + interval '1 month - 1 day'))::int) - 1);
      v_age := date_part('year', age(v_today, v_dob))::int;
    ELSE
      v_age := EXTRACT(YEAR FROM v_today)::int - NEW."birthYear";
    END IF;
    v_range := public.age_range_for_age(v_age);
    IF v_range IS NOT NULL THEN
      NEW."ageRange" := v_range;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_last_active(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN public.app_is_staff() THEN (
    SELECT GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = p_user_id),
      (SELECT u."hubLastSeenAt" FROM "User" u WHERE u.id = p_user_id)
    )
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.users_last_active(p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN public.app_is_staff() THEN COALESCE((
    SELECT jsonb_object_agg(u.id, GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = u.id),
      u."hubLastSeenAt"))
    FROM "User" u WHERE u.id = ANY (COALESCE(p_user_ids, '{}'))
  ), '{}'::jsonb) END;
$function$;

CREATE OR REPLACE FUNCTION public.users_without_app()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'You must be signed in as an admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(u.id)
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE
      AND u.role IN ('SUPPORT', 'ADMIN', 'SOP_PREPARER')
      AND NOT EXISTS (
        SELECT 1 FROM "UserAppState" s WHERE s."userId" = u.id AND s."installedAt" IS NOT NULL
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.website_section_changes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN (SELECT public.app_is_admin()) THEN COALESCE((
    SELECT jsonb_object_agg(c.section, jsonb_build_object('at', c."changedAt", 'by', u.name))
    FROM public."WebsiteSectionChange" c
    LEFT JOIN public."User" u ON u.id = c."changedById"
  ), '{}'::jsonb) END;
$function$;

CREATE OR REPLACE FUNCTION public.website_section_changes_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old JSONB := '{}'::jsonb;
  v_new JSONB := NEW.value;
  v_sections TEXT[] := '{}';
  v_who UUID := public.app_current_user_id();
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.value) = 'object' THEN v_old := OLD.value; END IF;

  IF NEW."settingKey" = 'landing_images' THEN
    IF TG_OP = 'INSERT' OR v_new IS DISTINCT FROM OLD.value THEN v_sections := ARRAY['photos']; END IF;
  ELSIF NEW."settingKey" = 'landing_content' AND jsonb_typeof(v_new) = 'object' THEN
    -- Sections whose value differs from before, plus any that were removed.
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_sections
    FROM (
      SELECT n.k FROM jsonb_object_keys(v_new) AS n(k) WHERE v_new -> n.k IS DISTINCT FROM v_old -> n.k
      UNION ALL
      SELECT o.k FROM jsonb_object_keys(v_old) AS o(k) WHERE NOT v_new ? o.k
    ) changed(k);
  END IF;

  IF array_length(v_sections, 1) IS NOT NULL THEN
    INSERT INTO public."WebsiteSectionChange" (section, "changedAt", "changedById")
    SELECT s, NOW(), v_who FROM unnest(v_sections) AS s
    ON CONFLICT (section) DO UPDATE SET "changedAt" = EXCLUDED."changedAt", "changedById" = EXCLUDED."changedById";
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.week_class_date(p_start_date date, p_week_number integer, p_class_date date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(p_class_date, p_start_date + (p_week_number - 1) * 7);
$function$;

-- Row-level-security policies ------------------------------------------------------------------------------
CREATE POLICY "Allow all operations" ON public."Activity" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ActivityLabel" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ActivityTeam" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Announcement" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."AppSetting" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins can read attendance excusals" ON public."AttendanceExcusal" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read attendance follow-up tasks" ON public."AttendanceFollowUpTask" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read attendance records" ON public."AttendanceRecord" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read attendance sessions" ON public."AttendanceSession" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read church events" ON public."ChurchEvent" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Cohort" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."CoverRequest" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Day" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."DepartmentReferral" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can manage faith help requests" ON public."FaithHelpRequest" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."FaithProject" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins manage faith project categories" ON public."FaithProjectCategory" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read faith project categories" ON public."FaithProjectCategory" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins manage faith project settings" ON public."FaithProjectSetting" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read faith project settings" ON public."FaithProjectSetting" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read faith project versions" ON public."FaithProjectVersion" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."FaithThreadRead" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."FollowUpContact" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."FollowUpIssue" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."FollowUpIssueContact" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read login issues" ON public."FollowUpLoginIssue" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff read note history" ON public."FollowUpNoteHistory" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Group" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."GroupOnboardingStatus" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."GroupParticipant" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."GroupPrayer" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."GroupPrayerFocus" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."GroupPrayerStatus" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."HubComment" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins manage hub it supports" ON public."HubItSupport" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read hub it supports" ON public."HubItSupport" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins manage hub memberships" ON public."HubMembership" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read hub memberships" ON public."HubMembership" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Hub members and admin can read hub messages" ON public."HubMessage" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT app_is_admin() AS app_is_admin) OR (EXISTS ( SELECT 1
   FROM "HubMembership" m
  WHERE ((m."hubId" = "HubMessage"."hubId") AND (m."userId" = ( SELECT app_current_user_id() AS app_current_user_id)))))));
CREATE POLICY "Hub members and admin can read acks" ON public."HubMessageAck" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT app_is_admin() AS app_is_admin) OR (EXISTS ( SELECT 1
   FROM ("HubMessage" msg
     JOIN "HubMembership" m ON (((m."hubId" = msg."hubId") AND (m."userId" = ( SELECT app_current_user_id() AS app_current_user_id)))))
  WHERE (msg.id = "HubMessageAck"."messageId")))));
CREATE POLICY "Admins manage hub people of interest" ON public."HubPersonOfInterest" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Allow all operations" ON public."HubReaction" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."HubReply" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Caller and admin can read own role intro seen" ON public."HubRoleIntroSeen" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT app_is_admin() AS app_is_admin) OR ("userId" = ( SELECT app_current_user_id() AS app_current_user_id))));
CREATE POLICY "Allow all operations" ON public."HubTopic" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Label" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can manage manual questions" ON public."ManualQuestion" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."MeetingAttendance" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."MessageTemplate" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."OnboardingEvent" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Participant" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantCheckIn" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantFlag" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantHandover" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantNote" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantOnboardingStatus" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantStageChange" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ParticipantWrapUp" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."PendingChange" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read planner changes" ON public."PlannerChange" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ProfileField" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."ProfileFieldAnswer" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read public holidays" ON public."PublicHoliday" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."PushReminderLog" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."PushSubscription" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."RecapRelease" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."RejectedChange" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Resource: delete" ON public."Resource" AS PERMISSIVE FOR DELETE TO public USING (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Resource: insert" ON public."Resource" AS PERMISSIVE FOR INSERT TO public WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Resource: read" ON public."Resource" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT app_is_staff() AS app_is_staff) AND resource_visible_to_staff("cohortId", "visibleToSupports", "hubIds")));
CREATE POLICY resource_open ON public."Resource" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Allow all operations" ON public."Scripture" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."SheetRegistration" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."SupportActivityCompletion" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."SupportChecklistItem" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can manage class feedback" ON public."SupportClassFeedback" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admins manage hubs" ON public."SupportHub" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_admin() AS app_is_admin)) WITH CHECK (( SELECT app_is_admin() AS app_is_admin));
CREATE POLICY "Staff can read hubs" ON public."SupportHub" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Admin or hub lead can manage support notes" ON public."SupportNote" AS PERMISSIVE FOR ALL TO public USING ((( SELECT app_is_admin() AS app_is_admin) OR (("hubId" IS NOT NULL) AND ("supportId" <> ( SELECT app_current_user_id() AS app_current_user_id)) AND (EXISTS ( SELECT 1
   FROM ("SupportHub" h
     JOIN "HubMembership" m ON (((m."hubId" = h.id) AND (m."userId" = "SupportNote"."supportId"))))
  WHERE ((h.id = "SupportNote"."hubId") AND (h."leadUserId" = ( SELECT app_current_user_id() AS app_current_user_id)))))))) WITH CHECK ((( SELECT app_is_admin() AS app_is_admin) OR (("hubId" IS NOT NULL) AND ("supportId" <> ( SELECT app_current_user_id() AS app_current_user_id)) AND (EXISTS ( SELECT 1
   FROM ("SupportHub" h
     JOIN "HubMembership" m ON (((m."hubId" = h.id) AND (m."userId" = "SupportNote"."supportId"))))
  WHERE ((h.id = "SupportNote"."hubId") AND (h."leadUserId" = ( SELECT app_current_user_id() AS app_current_user_id))))))));
CREATE POLICY "Admins manage training sessions" ON public."SupportSession" AS PERMISSIVE FOR ALL TO public USING ((( SELECT app_is_admin() AS app_is_admin) AND (type <> 'SUNDAY_RECAP'::text))) WITH CHECK ((( SELECT app_is_admin() AS app_is_admin) AND (type <> 'SUNDAY_RECAP'::text)));
CREATE POLICY "Staff can read support sessions" ON public."SupportSession" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read support session attendance" ON public."SupportSessionAttendance" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read support tags" ON public."SupportTag" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can read support tag members" ON public."SupportTagMember" AS PERMISSIVE FOR SELECT TO public USING (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Team" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Staff can manage testimonies" ON public."Testimony" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."User" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."UserCohort" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."UserLabel" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."UserNotificationSetting" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public."Week" AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public.notification_settings AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));
CREATE POLICY "Allow all operations" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public USING (( SELECT app_is_staff() AS app_is_staff)) WITH CHECK (( SELECT app_is_staff() AS app_is_staff));

-- Triggers -------------------------------------------------------------------------------------------------
CREATE TRIGGER teen_enable_move AFTER INSERT OR UPDATE ON public."AppSetting" FOR EACH ROW EXECUTE FUNCTION teen_enable_move_trigger();
CREATE TRIGGER website_section_changes_trg AFTER INSERT OR UPDATE ON public."AppSetting" FOR EACH ROW WHEN ((new."settingKey" = ANY (ARRAY['landing_content'::text, 'landing_images'::text]))) EXECUTE FUNCTION website_section_changes_trg();
CREATE TRIGGER attendance_record_lock BEFORE UPDATE ON public."AttendanceRecord" FOR EACH ROW EXECUTE FUNCTION enforce_attendance_record_lock();
CREATE TRIGGER "acted_as_reviewedById" BEFORE INSERT OR UPDATE ON public."CoverRequest" FOR EACH ROW EXECUTE FUNCTION set_acted_as('reviewedById');
CREATE TRIGGER "acted_as_loggedById" BEFORE INSERT OR UPDATE ON public."DepartmentReferral" FOR EACH ROW EXECUTE FUNCTION set_acted_as('loggedById');
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."DepartmentReferral" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER "acted_as_resolvedById" BEFORE INSERT OR UPDATE ON public."FaithHelpRequest" FOR EACH ROW EXECUTE FUNCTION set_acted_as('resolvedById');
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."FaithProject" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER faith_project_keep_version_ins AFTER INSERT ON public."FaithProject" FOR EACH ROW WHEN (((new.status = 'SAVED'::text) AND (NULLIF(btrim(COALESCE(new.body, ''::text)), ''::text) IS NOT NULL))) EXECUTE FUNCTION faith_project_keep_version();
CREATE TRIGGER faith_project_keep_version_upd AFTER UPDATE OF body, status ON public."FaithProject" FOR EACH ROW WHEN (((new.status = 'SAVED'::text) AND (NULLIF(btrim(COALESCE(new.body, ''::text)), ''::text) IS NOT NULL) AND ((old.body IS DISTINCT FROM new.body) OR (old.status IS DISTINCT FROM new.status)))) EXECUTE FUNCTION faith_project_keep_version();
CREATE TRIGGER "acted_as_registeredById" BEFORE INSERT OR UPDATE ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION set_acted_as('registeredById');
CREATE TRIGGER followup_contact_registration_guard BEFORE INSERT OR UPDATE ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION followup_contact_registration_guard();
CREATE TRIGGER followupcontact_track_activity BEFORE INSERT OR UPDATE ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION followupcontact_track_activity();
CREATE TRIGGER teen_group_sync_contact AFTER INSERT OR UPDATE OF "ownerId", "registrationStatus", "archivedAt", "cohortId" ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION teen_group_sync_trigger();
CREATE TRIGGER teen_owner_guard BEFORE UPDATE OF "ownerId", "registrationStatus", gender ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION teen_owner_guard();
CREATE TRIGGER trg_followup_contact_local_phone BEFORE INSERT OR UPDATE OF phone ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION fof_localize_phone_trigger();
CREATE TRIGGER trg_record_follow_up_note AFTER INSERT OR UPDATE OF notes ON public."FollowUpContact" FOR EACH ROW EXECUTE FUNCTION record_follow_up_note();
CREATE TRIGGER "acted_as_resolvedById" BEFORE INSERT OR UPDATE ON public."FollowUpLoginIssue" FOR EACH ROW EXECUTE FUNCTION set_acted_as('resolvedById');
CREATE TRIGGER ensure_group_support_cohort_membership AFTER INSERT OR UPDATE OF "supportId", "cohortId" ON public."Group" FOR EACH ROW EXECUTE FUNCTION ensure_group_support_cohort_membership();
CREATE TRIGGER group_meeting_limits_guard BEFORE INSERT OR UPDATE ON public."Group" FOR EACH ROW EXECUTE FUNCTION group_meeting_limits_guard();
CREATE TRIGGER participant_handover_on_group_support AFTER UPDATE OF "supportId" ON public."Group" FOR EACH ROW EXECUTE FUNCTION log_group_support_handover();
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."GroupOnboardingStatus" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER participant_handover_on_group_member AFTER INSERT OR DELETE ON public."GroupParticipant" FOR EACH ROW EXECUTE FUNCTION log_group_participant_handover();
CREATE TRIGGER discussion_post_alerts AFTER INSERT ON public."GroupPost" FOR EACH ROW EXECUTE FUNCTION discussion_post_alerts();
CREATE TRIGGER discussion_reply_alerts AFTER INSERT ON public."GroupPostReply" FOR EACH ROW EXECUTE FUNCTION discussion_reply_alerts();
CREATE TRIGGER discussion_report_alerts AFTER INSERT ON public."GroupPostReport" FOR EACH ROW EXECUTE FUNCTION discussion_report_alerts();
CREATE TRIGGER "acted_as_createdById" BEFORE INSERT OR UPDATE ON public."GroupPrayer" FOR EACH ROW EXECUTE FUNCTION set_acted_as('createdById');
CREATE TRIGGER "acted_as_setById" BEFORE INSERT OR UPDATE ON public."GroupPrayerFocus" FOR EACH ROW EXECUTE FUNCTION set_acted_as('setById');
CREATE TRIGGER group_meeting_reopen_close AFTER INSERT OR UPDATE OF done ON public."GroupPrayerStatus" FOR EACH ROW EXECUTE FUNCTION group_meeting_reopen_close();
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."GroupPrayerStatus" FOR EACH ROW EXECUTE FUNCTION fof_meeting_window_guard();
CREATE TRIGGER trg_hub_it_support_added AFTER INSERT ON public."HubItSupport" FOR EACH ROW EXECUTE FUNCTION notify_hub_it_support_added();
CREATE TRIGGER trg_hub_it_support_kind AFTER INSERT OR DELETE ON public."HubItSupport" FOR EACH ROW EXECUTE FUNCTION hub_it_support_kind();
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."HubLeadsMeeting" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER trg_hub_membership_added AFTER INSERT ON public."HubMembership" FOR EACH ROW EXECUTE FUNCTION notify_hub_membership_added();
CREATE TRIGGER "acted_as_repliedById" BEFORE INSERT OR UPDATE ON public."ManualQuestion" FOR EACH ROW EXECUTE FUNCTION set_acted_as('repliedById');
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."MeetingAttendance" FOR EACH ROW EXECUTE FUNCTION fof_meeting_window_guard();
CREATE TRIGGER telegram_after_notification AFTER INSERT ON public."Notification" FOR EACH ROW EXECUTE FUNCTION telegram_after_notification();
CREATE TRIGGER trg_notification_stamp_read BEFORE UPDATE OF "isRead" ON public."Notification" FOR EACH ROW EXECUTE FUNCTION notification_stamp_read();
CREATE TRIGGER participant_age_teen_boundary AFTER UPDATE OF "ageRange", "dateOfBirth" ON public."Participant" FOR EACH ROW EXECUTE FUNCTION participant_age_teen_boundary();
CREATE TRIGGER participant_retake_note BEFORE INSERT ON public."Participant" FOR EACH ROW EXECUTE FUNCTION participant_retake_note();
CREATE TRIGGER teen_group_sync_participant AFTER INSERT OR UPDATE OF "followUpContactId" ON public."Participant" FOR EACH ROW EXECUTE FUNCTION teen_group_sync_trigger();
CREATE TRIGGER trg_participant_age_from_dob BEFORE INSERT OR UPDATE OF "dateOfBirth", "ageRange" ON public."Participant" FOR EACH ROW EXECUTE FUNCTION participant_age_from_dob();
CREATE TRIGGER trg_participant_local_phone BEFORE INSERT OR UPDATE OF phone ON public."Participant" FOR EACH ROW EXECUTE FUNCTION fof_localize_phone_trigger();
CREATE TRIGGER sign_in_throttle_clear AFTER UPDATE OF password_hash ON public."ParticipantAccount" FOR EACH ROW WHEN ((new.password_hash IS DISTINCT FROM old.password_hash)) EXECUTE FUNCTION sign_in_throttle_clear_participant();
CREATE TRIGGER trg_followup_access_confirmed AFTER UPDATE OF "passwordSetAt" ON public."ParticipantAccount" FOR EACH ROW WHEN (((old."passwordSetAt" IS NULL) AND (new."passwordSetAt" IS NOT NULL))) EXECUTE FUNCTION confirm_followup_access_on_password_set();
CREATE TRIGGER app_setup_after_install AFTER INSERT OR UPDATE OF "installedAt" ON public."ParticipantAppState" FOR EACH ROW EXECUTE FUNCTION check_participant_app_setup();
CREATE TRIGGER "acted_as_clearedById" BEFORE INSERT OR UPDATE ON public."ParticipantFlag" FOR EACH ROW EXECUTE FUNCTION set_acted_as('clearedById');
CREATE TRIGGER "acted_as_raisedById" BEFORE INSERT OR UPDATE ON public."ParticipantFlag" FOR EACH ROW EXECUTE FUNCTION set_acted_as('raisedById');
CREATE TRIGGER telegram_after_participant_notification AFTER INSERT ON public."ParticipantNotification" FOR EACH ROW EXECUTE FUNCTION telegram_after_participant_notification();
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."ParticipantOnboardingStatus" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER app_setup_after_push AFTER INSERT OR UPDATE OF "participantId" ON public."ParticipantPushSubscription" FOR EACH ROW EXECUTE FUNCTION check_participant_app_setup();
CREATE TRIGGER "acted_as_changedById" BEFORE INSERT OR UPDATE ON public."ParticipantStageChange" FOR EACH ROW EXECUTE FUNCTION set_acted_as('changedById');
CREATE TRIGGER "acted_as_createdById" BEFORE INSERT OR UPDATE ON public."PlannerChange" FOR EACH ROW EXECUTE FUNCTION set_acted_as('createdById');
CREATE TRIGGER "acted_as_updatedById" BEFORE INSERT OR UPDATE ON public."Resource" FOR EACH ROW EXECUTE FUNCTION set_acted_as('updatedById');
CREATE TRIGGER sheet_registration_question AFTER INSERT OR UPDATE OF "contactId" ON public."SheetRegistration" FOR EACH ROW EXECUTE FUNCTION sheet_registration_question();
CREATE TRIGGER support_checklist_admin_task_guard BEFORE DELETE OR UPDATE ON public."SupportChecklistItem" FOR EACH ROW EXECUTE FUNCTION support_checklist_admin_task_guard();
CREATE TRIGGER trg_hub_lead_support_kind AFTER INSERT OR UPDATE OF "leadUserId" ON public."SupportHub" FOR EACH ROW EXECUTE FUNCTION hub_lead_support_kind();
CREATE TRIGGER trg_hub_role_assigned AFTER UPDATE ON public."SupportHub" FOR EACH ROW WHEN (((new."leadUserId" IS DISTINCT FROM old."leadUserId") OR (new."assistantLeadUserId" IS DISTINCT FROM old."assistantLeadUserId") OR (new."recapLeadUserIds" IS DISTINCT FROM old."recapLeadUserIds") OR (new."prayerLeadUserIds" IS DISTINCT FROM old."prayerLeadUserIds"))) EXECUTE FUNCTION notify_hub_role_assigned();
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."SupportSession" FOR EACH ROW EXECUTE FUNCTION fof_meeting_window_guard();
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."SupportSessionAttendance" FOR EACH ROW EXECUTE FUNCTION fof_meeting_window_guard();
CREATE TRIGGER update_team_updated_at BEFORE UPDATE ON public."Team" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "acted_as_reviewedById" BEFORE INSERT OR UPDATE ON public."Testimony" FOR EACH ROW EXECUTE FUNCTION set_acted_as('reviewedById');
CREATE TRIGGER sign_in_throttle_clear AFTER UPDATE OF password_hash ON public."User" FOR EACH ROW WHEN ((new.password_hash IS DISTINCT FROM old.password_hash)) EXECUTE FUNCTION sign_in_throttle_clear_staff();
CREATE TRIGGER trg_user_age_from_birth_year BEFORE INSERT OR UPDATE OF "birthYear", birthday, "ageRange" ON public."User" FOR EACH ROW EXECUTE FUNCTION user_age_from_birth_year();
CREATE TRIGGER trg_user_local_phone BEFORE INSERT OR UPDATE OF phone ON public."User" FOR EACH ROW EXECUTE FUNCTION fof_localize_phone_trigger();
CREATE TRIGGER user_clear_group_support_before_delete BEFORE DELETE ON public."User" FOR EACH ROW EXECUTE FUNCTION clear_support_group_assignments_before_user_delete();

-- Scheduled jobs (pg_cron) ---------------------------------------------------------------------------------
SELECT cron.schedule('absence_auto_move', '*/15 * * * *', $cron$SELECT public.absence_auto_move_due();$cron$);
SELECT cron.schedule('absence_review_remind_saturday', '0 15-18 * * 6', $cron$SELECT public.absence_review_remind();$cron$);
SELECT cron.schedule('auto_finalize_sunday_attendance_noon', '0 11 * * 0', $cron$SELECT public.auto_finalize_sunday_attendance();$cron$);
SELECT cron.schedule('close_attendance_windows_every_minute', '* * * * *', $cron$SELECT public.close_attendance_windows();$cron$);
SELECT cron.schedule('corporate_prayer_slots_every_minute', '* * * * *', $cron$SELECT public.notify_prayer_slots();$cron$);
SELECT cron.schedule('followup_assignment_every_10min', '*/10 * * * *', $cron$select public.invoke_followup_assignment();$cron$);
SELECT cron.schedule('post_cohort_checkups_daily', '17 7 * * *', $cron$SELECT public.post_cohort_checkups_run();$cron$);
SELECT cron.schedule('push_reminder_log_cleanup', '30 2 * * *', $cron$delete from "PushReminderLog" where "createdAt" < now() - interval '30 days';$cron$);
SELECT cron.schedule('push_reminders_every_10min', '*/10 * * * *', $cron$select public.invoke_push_reminders();$cron$);
SELECT cron.schedule('refresh_age_brackets_daily', '30 0 * * *', $cron$select public.refresh_age_brackets();$cron$);
SELECT cron.schedule('refresh_public_holidays_fortnightly', '0 3 1,15 * *', $cron$select public.invoke_refresh_public_holidays();$cron$);
