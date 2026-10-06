export interface Resource {
  id: string;
  title: string;
  description?: string;
  type: 'link' | 'pdf' | 'doc' | 'image' | 'file';
  url: string;
  fileName?: string;
  fileSize?: number;
  addedBy?: string;
  createdAt: string;
  /** Shown to participants in their app's Resources. */
  visibleToParticipants?: boolean;
  /** Shown to supports. Defaults to true. */
  visibleToSupports?: boolean;
  /** One cohort, or null for every cohort. */
  cohortId?: string | null;
  /** When set, supports see it only if they are in one of these hubs. */
  hubIds?: string[];
  updatedAt?: string | null;
  updateNote?: string | null;
  /** How many earlier versions are kept. */
  versionCount?: number;
}

/** Who a resource is for, as sent to the database. */
export interface ResourceAudiencePayload {
  visibleToSupports: boolean;
  visibleToParticipants: boolean;
  cohortId: string | null;
  hubIds: string[];
}

export interface ResourceVersionEntry {
  versionNo: number;
  type: Resource['type'];
  url: string;
  fileName?: string | null;
  fileSize?: number | null;
  note?: string | null;
  at: string;
  by?: string | null;
}

export interface ResourceVersions {
  current: ResourceVersionEntry;
  earlier: ResourceVersionEntry[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
  cohortId?: string | null;
  groupId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: 'ADMIN' | 'SUPPORT' | 'PARTICIPANT';
  /** Every role this login may act as (the active one is `role`). Absent = just `role`. */
  roles?: Array<'ADMIN' | 'SUPPORT'>;
  isActive?: boolean;
  /** Test account: works normally, but follow-up assignment and counts ignore it. */
  isTest?: boolean;
  deactivatedAt?: string | null;
  isCoordinator?: boolean;
  avatarUrl?: string | null;
  themeColor?: string | null;
  hubLastSeenAt?: string | null;
  whatsappGroupUrl?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  /** Birthday as MM-DD (no year). Optional; not part of profile completion. */
  birthday?: string | null;
  /** Optional birth year. Once set, the age range follows it (the database keeps them in line). */
  birthYear?: number | null;
  /** Set by an admin-issued reset: the app blocks until they pick a new password. */
  mustChangePassword?: boolean;
  /** Participant app only: the participant record behind this sign-in. */
  participantId?: string;
  cohortId?: string | null;
  cohortName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  cohortIds?: string[];
}

export interface Cohort {
  id: string;
  name: string;
  description?: string;
  venue?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** COMPLETED: the cohort has finished; it stays viewable and selectable. */
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  schedulePublished?: boolean;
  /** The Practice cohort: a safe place to try the app. Never the running cohort. */
  isPractice?: boolean;
  practiceOn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserCohort {
  userId: string;
  cohortId: string;
  createdAt?: string;
}

export interface Activity {
  id: number;
  dayId: number;
  time: string;
  description: string;
  period: 'MORNING' | 'AFTERNOON' | 'EVENING';
  orderIndex: number;
  day?: Day;
  labels?: Label[];
}

export interface Day {
  id: number;
  weekId: number;
  dayName: string;
  activities: Activity[];
  week?: Week;
}

export interface Week {
  id: number;
  cohortId: string;
  weekNumber: number;
  /** Set only when the Planner moves this week's class; otherwise start date + (weekNumber - 1) weeks. */
  classDate?: string | null;
  title?: string | null;
  recapSummary?: string | null;
  discussionPrompt?: string | null;
  recapDocumentUrl?: string | null;
  recapDocumentName?: string | null;
  /** Whether this week's recap goes to participants (released by their support). */
  shareWithParticipants?: boolean;
  /** Set by "Send to participants now"; overrides the configured participant release time. */
  participantReleasedEarlyAt?: string | null;
  /** What participants should do this week, one item per line. */
  expectations?: string | null;
  /** The class manual document, separate from the recap. */
  manualDocumentUrl?: string | null;
  manualDocumentName?: string | null;
  manualSummary?: string | null;
  manualDiscussionPrompt?: string | null;
  /** Set by "Send manual now"; overrides the configured manual release time. */
  manualReleasedEarlyAt?: string | null;
  days: Day[];
}

/** A participant who has signed in but still needs the app (shown to their support). */
export interface AppNudgePerson {
  participantId: string;
  name: string;
  phone: string | null;
  reason: 'NOT_INSTALLED' | 'NO_ALERTS';
  sentAt?: string | null;
}

/** An announcement shown as a popup until the person taps Got it. */
export interface AnnouncementPopupItem {
  id: string;
  subject: string;
  body: string;
  heading: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sentAt: string;
}

/** Admin view of a popup announcement: how many have acknowledged it, and who has not. */
export interface AnnouncementPopupStatus {
  total: number;
  acknowledged: number;
  waiting: string[];
}

/** A church event on the Planner. Only Stops-FOF ones can clash with a class. */
export interface ChurchEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  stopsFof: boolean;
}

/** "What moves" from planner_push_back (a preview, or what was applied). */
export interface PushBackResult {
  cohortId: string;
  cohortName: string;
  weekNumber: number;
  classDate: string;
  moves: Array<{ weekNumber: number; from: string; to: string }>;
  endBefore: string;
  endAfter: string;
  spareWeeksBefore: number;
  spareWeeksAfter: number;
  laterCohorts: Array<{ cohortId: string; name: string; shiftDays: number; firstClassBefore: string; firstClassAfter: string }>;
  applied: boolean;
  changeId: string | null;
}

/** A logged Planner change (Push back), newest first. */
export interface PlannerChange {
  id: string;
  summary: string;
  createdAt: string;
  undoneAt: string | null;
}

/** A Nigerian public holiday on the Planner (information only; never a clash). */
export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  /** Moon-sighted dates (Eid and so on) until the government announces them. */
  isEstimate: boolean;
  fetchedAt: string;
}

/** The class manual's content once released, same shape everywhere it appears. */
export interface ManualContent {
  documentUrl: string | null;
  documentName: string | null;
  summary: string | null;
  discussionPrompt: string | null;
}

/** One week as support_recaps() returns it: content always included; `released` = support release time passed. */
export interface SupportRecap {
  weekId: number;
  weekNumber: number;
  /** The week's class Sunday, YYYY-MM-DD. */
  classDate?: string | null;
  title: string | null;
  released: boolean;
  releasedAt: string | null;
  recapSummary: string | null;
  discussionPrompt: string | null;
  recapDocumentUrl: string | null;
  recapDocumentName: string | null;
  /** Present only once released (same manual release time for supports and participants). */
  manual: ManualContent | null;
  manualReleased: boolean;
  manualReleasedAt: string | null;
  /** NEW-status questions for this week, scoped to the caller's own groups (all cohort for an admin). */
  unreadQuestionCount: number;
}

export type ManualQuestionStatus = 'NEW' | 'IN_CLASS' | 'REPLIED';

/** A participant's own question, as returned inside participant_home. */
export interface ParticipantManualQuestion {
  id: string;
  body: string;
  status: ManualQuestionStatus;
  reply: string | null;
  createdAt: string;
}

/** A question as support/admin see it via list_manual_questions(). */
export interface ManualQuestion {
  id: string;
  weekId: number;
  weekNumber: number;
  groupId: string | null;
  groupName: string | null;
  participantId: string;
  participantName: string;
  body: string;
  status: ManualQuestionStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** One row from list_earlier_class_documents(), for the "choose an earlier file" picker. */
export interface EarlierClassDocument {
  kind: 'RECAP' | 'MANUAL';
  url: string;
  name: string | null;
  cohortName: string;
  weekNumber: number;
}

export interface SupportActivityCompletion {
  id: string;
  activityId: number;
  userId: string;
  completedAt: string;
}

export interface PendingChange {
  id: string;
  weekId: number;
  changeType: 'ADD' | 'EDIT' | 'DELETE';
  changeData: any;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  createdAt: string;
}

export interface RejectedChange {
  id: string;
  weekId: number;
  changeType: 'ADD' | 'EDIT' | 'DELETE';
  changeData: any;
  userId: string;
  submittedAt: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
  isRead: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** Database session from sign_in; private calls pass it. */
  sessionToken?: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface Announcement {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  sentBy?: string;
  scope?: 'ACTIVE_COHORT' | 'ALL_USERS';
  cohortId?: string | null;
  cohortName?: string | null;
  targetLabelId?: string | null;
  /** Group id: narrows a PARTICIPANTS-audience send to one group's roster. */
  targetGroupId?: string | null;
  /** Hub id: narrows a SUPPORTS/EVERYONE-audience send to one hub's members. */
  targetHubId?: string | null;
  /** User id: send to a single support/admin only. Mutually exclusive with the group/hub/tag filters. */
  targetUserId?: string | null;
  /** Participant id: send to a single participant only. Mutually exclusive with the group/hub/tag filters. */
  targetParticipantId?: string | null;
  showOnHome?: boolean;
  homeUntil?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  /** Small heading above the pinned Home card, chosen by the admin. */
  homeLabel?: string | null;
  /** Shown as a popup until each person taps Got it. */
  requirePopup?: boolean;
  /** Who it is for: supports (default), participants, or everyone. */
  audience?: AnnouncementAudience;
}

export type AnnouncementAudience = 'SUPPORTS' | 'PARTICIPANTS' | 'EVERYONE';

export type NotificationType =
  | 'ANNOUNCEMENT'
  | 'FOLLOWUP_ASSIGNMENT'
  | 'FOLLOWUP_ISSUE'
  | 'FOLLOWUP_TERMINAL'
  | 'FAITH_PROJECT_REVIEW'
  | 'FAITH_PROJECT_SUBMITTED'
  | 'GROUP_MEETING_COMPLETED'
  | 'ATTENDANCE_REPORT'
  | 'PARTICIPANT_FLAG'
  | 'HUB'
  | 'REMINDER'
  | 'ESCALATION'
  | 'SCHEDULE_CHANGE'
  | 'FAITH_HELP'
  | 'TESTIMONY'
  | 'MANUAL_QUESTION'
  | 'GENERAL';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  path?: string | null;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export type FollowUpMessageStatus = 'NOT_SENT' | 'SENT';
export type FollowUpReplyStatus = 'NO_REPLY' | 'REPLIED' | 'NEEDS_REMINDER' | 'INCORRECT_NUMBER';
export type FollowUpCallStatus = 'NOT_CALLED' | 'CALLED' | 'MISSED_CALL' | 'CALL_BACK_LATER' | 'NOT_APPLICABLE' | 'INCORRECT_NUMBER';
export type FollowUpRegistrationStatus = 'NOT_REGISTERED' | 'PENDING_CONFIRMATION' | 'REGISTERED' | 'STILL_THINKING' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'NO_RESPONSE' | 'NEXT_COHORT' | 'LOGIN_SHARED' | 'LOGIN_ISSUE' | 'ACCESS_CONFIRMED' | 'ATTENDED' | 'TEENAGER' | 'TEEN_ONBOARDED';
export type FollowUpNextAction = 'SEND_MESSAGE' | 'SEND_REMINDER' | 'CALL' | 'CLOSE';
export type FollowUpStatus = 'TO_CONTACT' | 'WAITING' | 'NEEDS_REMINDER' | 'REPLIED' | 'CALL_BACK_LATER' | 'REGISTERED' | 'WRONG_NUMBER' | 'NOT_INTERESTED' | 'NO_RESPONSE' | 'NEXT_COHORT' | 'LOGIN_SHARED' | 'LOGIN_ISSUE' | 'ACCESS_CONFIRMED' | 'ATTENDED' | 'TEENAGER' | 'TEEN_ONBOARDED';
export type IssueStatus = 'OPEN' | 'RESOLVED';

/** One saved version of a contact's note, with who wrote it and when. */
export interface FollowUpNoteEntry {
  id: string;
  body: string;
  authorName: string | null;
  /** Copied in from before note history existed; the date is approximate. */
  imported: boolean;
  notedAt: string;
}

export interface FollowUpContact {
  id: string;
  fullName: string;
  phone?: string | null;
  source?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  messageStatus: FollowUpMessageStatus;
  replyStatus: FollowUpReplyStatus;
  callStatus: FollowUpCallStatus;
  registrationStatus: FollowUpRegistrationStatus;
  nextAction: FollowUpNextAction;
  lastContactDate?: string | null;
  followUpCount: number;
  notes?: string | null;
  email?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  occupation?: string | null;
  registeredById?: string | null;
  registeredByName?: string | null;
  /** When the prospect reached the Google sheet (null until it does). */
  sheetSyncedAt?: string | null;
  /** Why the last attempt to reach the sheet failed. */
  sheetSyncError?: string | null;
  /** Reached the sheet, but some columns couldn't be found. */
  sheetSyncWarning?: string | null;
  cohortId?: string | null;
  cohortName?: string | null;
  cohortVenue?: string | null;
  cohortStartDate?: string | null;
  dueDate?: string | null;
  archivedAt?: string | null;
  /** Test contact: left out of assignment, counts and exports. */
  isTest?: boolean;
  /** What they wrote under "Any other questions or concerns?" on the sign-up form. */
  formQuestion?: string | null;
  formQuestionAnsweredAt?: string | null;
  formQuestionAnsweredById?: string | null;
  /** When this support was given them (changes when they are passed on). */
  ownerAssignedAt?: string | null;
  /** A teen's parent or guardian number. Teen messages and calls go to it first. */
  guardianPhone?: string | null;
  /** What warranted marking a teen Onboarded. */
  teenOnboardedHow?: TeenOnboardedHow | null;
  createdAt?: string;
  updatedAt?: string;
}

export type TeenOnboardedHow = 'WHATSAPP_GROUP' | 'PARENT_REACHED' | 'PHONE_CALL';

export type FollowUpContactUpdate = Partial<Pick<
  FollowUpContact,
  | 'fullName'
  | 'phone'
  | 'source'
  | 'ownerId'
  | 'messageStatus'
  | 'replyStatus'
  | 'callStatus'
  | 'registrationStatus'
  | 'nextAction'
  | 'lastContactDate'
  | 'followUpCount'
  | 'notes'
  | 'email'
  | 'gender'
  | 'ageRange'
  | 'occupation'
  | 'registeredById'
  | 'cohortId'
  | 'dueDate'
  | 'archivedAt'
  | 'isTest'
  | 'formQuestionAnsweredAt'
  | 'formQuestionAnsweredById'
  | 'guardianPhone'
  | 'teenOnboardedHow'
>> & {
  previousOwnerId?: string | null;
};

export interface MessageTemplate {
  id: string;
  useCase: string;
  body: string;
  whenToUse?: string | null;
  imageUrl?: string | null;
  imageName?: string | null;
  category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR' | 'TEEN';
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowUpIssue {
  id: string;
  contactId?: string | null;
  contactName?: string | null;
  openedAt: string;
  person?: string | null;
  issue: string;
  reportedById?: string | null;
  reportedByName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  neededFrom?: string | null;
  status: IssueStatus;
  resolution?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** A reported "Issue with login", as the IT issues tab lists it (it_login_issues). */
export type LoginIssueStatus = 'OPEN' | 'RESOLVED';

export interface ItLoginIssue {
  id: string;
  contactId: string;
  description: string;
  status: LoginIssueStatus;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  reportedById?: string | null;
  reportedByName?: string | null;
  resolvedByName?: string | null;
  contactName: string;
  contactPhone?: string | null;
  registrationStatus: FollowUpRegistrationStatus;
  cohortId?: string | null;
  cohortName?: string | null;
  cohortStartDate?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** They have chosen a password or signed in at least once. */
  signedIn: boolean;
}

// ── Participants ──────────────────────────────────────────────────────────────

export type ParticipantStatus = 'ACTIVE' | 'ARCHIVED';
export type ParticipantSource = 'FOLLOW_UP' | 'FORM' | 'MANUAL' | 'IMPORT';

export interface Participant {
  id: string;
  fullName: string;
  phone?: string | null;
  cohortId?: string | null;
  cohortName?: string | null;
  source: ParticipantSource;
  followUpContactId?: string | null;
  /** Pre-cohort (follow-up) status, e.g. LOGIN_SHARED. Null when they never came through follow-up. */
  followUpStatus?: FollowUpRegistrationStatus | null;
  status: ParticipantStatus;
  notes?: string | null;
  // Registration details (from the church platform / Google Form). All optional.
  email?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  departments?: string[];
  registrationDate?: string | null;
  smartRequest?: string | null;
  /** Added by the participant in their app. */
  dateOfBirth?: string | null;
  occupation?: string | null;
  avatarUrl?: string | null;
  /** Test participant (e.g. a demo login): works as normal, left out of counts. */
  isTest?: boolean;
  /** A teen's parent or guardian number. */
  guardianPhone?: string | null;
  /** A support/admin's answer to the Retaking chip: same person, or not. */
  retakeStatus?: 'CONFIRMED' | 'NOT_SAME' | null;
  /** Why they were marked as retaking by hand (e.g. "Was in FOF 8"). */
  retakeNote?: string | null;
  retakeCheckedAt?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ParticipantUpdate = Partial<Pick<Participant,
  'fullName' | 'phone' | 'cohortId' | 'notes' | 'status' |
  'email' | 'gender' | 'ageRange' | 'departments' | 'registrationDate' | 'smartRequest' | 'isTest' |
  'retakeStatus' | 'retakeNote'
>> & { retakeCheckedById?: string | null; retakeCheckedAt?: string | null };

/** Another cohort's record on the same phone number (for the Retaking chip). */
export interface RetakeMatch {
  otherName: string;
  otherCohort: string;
  otherCohortStart: string | null;
  sameFirstName: boolean;
}

export type ParticipantNoteType = 'HANDOVER' | 'MEETING' | 'FAITH_COACH' | 'FAITH_OFFICE' | 'CHECK_IN';

export interface ParticipantNote {
  id: string;
  participantId: string;
  body: string;
  authorId?: string | null;
  authorName?: string | null;
  /** Written by the participant in their app (their submitted faith project). */
  byParticipant?: boolean;
  groupId?: string | null;
  weekId?: number | null;
  noteType: ParticipantNoteType;
  createdAt: string;
}

export type ParticipantHandoverEventType = 'GROUP_JOINED' | 'GROUP_LEFT' | 'SUPPORT_REASSIGNED';

export interface ParticipantHandover {
  id: string;
  participantId: string;
  eventType: ParticipantHandoverEventType;
  fromGroupName?: string | null;
  fromSupportName?: string | null;
  toGroupName?: string | null;
  toSupportName?: string | null;
  faithProjectStatus?: string | null;
  faithProjectUpdatedById?: string | null;
  faithProjectUpdatedAt?: string | null;
  createdAt: string;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  cohortId: string;
  cohortName?: string | null;
  name: string;
  supportId?: string | null;
  supportName?: string | null;
  participantCount?: number;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingDurationMins?: number | null;
  callPlatform?: GroupCallPlatform | null;
  callLink?: string | null;
  archivedAt?: string | null;
  archivedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type GroupCallPlatform = 'WHATSAPP' | 'GOOGLE_MEET';

export interface GroupOnboardingStatus {
  id: string;
  groupId: string;
  groupName?: string | null;
  supportId?: string | null;
  supportName?: string | null;
  participantCount?: number;
  groupCreated: boolean;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface ParticipantOnboardingStatus {
  id: string;
  participantId: string;
  participantName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  contacted: boolean;
  addedToGroup: boolean;
  introductionDone: boolean;
  venueAcknowledged: boolean;
  updatedById?: string | null;
  updatedByName?: string | null;
  updatedAt?: string;
}

export type OnboardingEventType =
  | 'GROUP_ASSIGNED'
  | 'PARTICIPANTS_ASSIGNED'
  | 'GROUP_CREATED_UPDATED'
  | 'PARTICIPANT_STATUS_UPDATED'
  | 'GROUP_COMPLETED';

export interface OnboardingEvent {
  id: string;
  type: OnboardingEventType;
  groupId: string;
  groupName?: string | null;
  participantId?: string | null;
  participantName?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: User['role'] | null;
  supportId?: string | null;
  supportName?: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEFT_EARLY' | 'EXCUSED';

export interface AttendanceRecord {
  id: string;
  participantId: string;
  participantName?: string;
  weekId: number;
  status: AttendanceStatus;
  markedById?: string | null;
  markedAt?: string;
  /** Late/Left early only. An admin-excused record counts as attended again. */
  lateExcused?: boolean;
  lateExcusedAt?: string | null;
  lateExcusedById?: string | null;
}

/** The appeal note behind an excusal. Admin-only, at the database level too. */
export interface AttendanceExcusal {
  attendanceRecordId: string;
  note: string;
  excusedById?: string | null;
  excusedByName?: string | null;
  createdAt: string;
}

export interface AttendanceSession {
  weekId: number;
  autoFinalizeAtNoon: boolean;
  startedAt?: string | null;
  startedById?: string | null;
  closesAt?: string | null;
  finalizedAt?: string | null;
  finalizedById?: string | null;
  finalizationMethod?: 'MANUAL' | 'AUTO' | null;
  reopenedAt?: string | null;
}

export type AttendanceFollowUpTaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';

export interface AttendanceFollowUpTask {
  id: string;
  attendanceRecordId: string;
  participantId: string;
  participantName?: string | null;
  weekId: number;
  supportId: string;
  supportName?: string | null;
  dueAt: string;
  status: AttendanceFollowUpTaskStatus;
  completedAt?: string | null;
  completionNote?: string | null;
}

export type MeetingAttendanceStatus = 'JOINED' | 'EXCUSED' | 'MISSED';

export interface MeetingAttendance {
  id: string;
  participantId: string;
  groupId?: string | null;
  weekId: number;
  status: MeetingAttendanceStatus;
  markedById?: string | null;
  markedAt?: string;
}

export interface ParticipantFlag {
  id: string;
  participantId: string;
  participantName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  weekId?: number | null;
  weekNumber?: number | null;
  reason: string;
  note?: string | null;
  raisedById?: string | null;
  raisedByName?: string | null;
  raisedAt: string;
  clearedById?: string | null;
  clearedByName?: string | null;
  clearedAt?: string | null;
}

export type DepartmentReferralStatus = 'LOGGED' | 'JOINED' | 'NOT_JOINED';

/** A department choice, logged and then confirmed as joined (or not). */
export interface DepartmentReferral {
  id: string;
  participantId: string;
  department: string;
  status: DepartmentReferralStatus;
  loggedAt: string;
  loggedById?: string | null;
  loggedByName?: string | null;
  joinedAt?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  note?: string | null;
  updatedAt: string;
}

export type JourneyStage = 'REGISTERED' | 'ONBOARDED' | 'ACTIVE' | 'COMPLETED' | 'REFERRED' | 'INTEGRATED';

export interface ParticipantStageChange {
  id: string;
  participantId: string;
  stage: JourneyStage;
  note?: string | null;
  changedById?: string | null;
  changedByName?: string | null;
  changedAt: string;
}

export interface SupportChecklistItem {
  id: string;
  userId: string;
  weekId: number;
  label: string;
  done: boolean;
  position: number;
  /** The admin who set it. */
  createdById?: string | null;
  /** All copies of one admin task share this; set only for tasks an admin added. */
  taskGroupId?: string | null;
  /** Weekday name, e.g. "Friday". */
  dueDay?: string | null;
  /** What the support wrote when they ticked it. */
  completionNote?: string | null;
  completedAt?: string | null;
}

/** An admin task as the admin sees it for a week: who has done it, with their notes. */
export interface AdminChecklistTask {
  taskGroupId: string;
  label: string;
  dueDay: string | null;
  total: number;
  done: number;
  people: Array<{ userId: string; name: string; done: boolean; note: string | null; at: string | null }>;
}

export type AdminChecklistTarget =
  | { kind: 'ALL' }
  | { kind: 'TAG'; tagId: string }
  | { kind: 'USERS'; userIds: string[] };

// ── Faith Projects ────────────────────────────────────────────────────────────

export type FaithProjectStatus = 'NOT_DRAFTED' | 'AWAITING_DRAFT' | 'UNDER_REFINEMENT' | 'NEEDS_REFINEMENT' | 'APPROVED';

export interface FaithProjectReviewEntry {
  actorId: string;
  actorName: string;
  action: 'APPROVED' | 'NEEDS_REFINEMENT';
  note?: string | null;
  at: string;
}

export interface FaithProject {
  id: string;
  participantId: string;
  participantName?: string | null;
  title?: string | null;
  body?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  status: FaithProjectStatus;
  updatedById?: string | null;
  updatedByName?: string | null;
  reviewHistory?: FaithProjectReviewEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FaithProjectCategory {
  id: string;
  cohortId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface FaithProjectSettings {
  cohortId: string;
  deadlineAt: string | null;
}

// ── Group Prayers ─────────────────────────────────────────────────────────────

export interface GroupPrayer {
  id: string;
  cohortId: string;
  weekId: number;
  weekNumber?: number;
  body: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupPrayerStatus {
  id: string;
  groupId: string;
  groupName?: string | null;
  weekId: number;
  weekNumber?: number;
  done: boolean;
  markedById?: string | null;
  markedAt?: string;
}

export interface GroupPrayerFocus {
  id: string;
  groupId: string;
  groupName?: string | null;
  weekId: number;
  weekNumber?: number;
  participantId: string;
  participantName?: string | null;
  setById?: string | null;
  setByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}


// ─── Hub ─────────────────────────────────────────────────────────────────────

export type HubTopicStatus = 'OPEN' | 'CLOSED';

export interface HubTopic {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  title: string;
  body: string;
  status: HubTopicStatus;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  likedBy: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface HubComment {
  id: string;
  topicId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  body: string;
  replyCount: number;
  createdAt: string;
  replies?: HubReply[];
}

export interface HubReply {
  id: string;
  commentId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  body: string;
  createdAt: string;
}

// ── Participant app accounts ──────────────────────────────────────────────────

/** NO_PARTICIPANT = prospect has no participant record; NONE = no login yet; CODE_READY = first-time code issued, password not chosen; ACTIVE = password chosen. */
export type ParticipantLoginStatus = 'NO_PARTICIPANT' | 'NONE' | 'CODE_READY' | 'ACTIVE';

export interface ParticipantLoginDetails {
  participantId: string;
  name: string;
  phone: string | null;
  status: ParticipantLoginStatus;
  /** Only present until the participant chooses their own password. */
  setupCode: string | null;
  issuedAt: string | null;
  passwordSetAt: string | null;
  lastSignInAt: string | null;
}

// ── Participant app ───────────────────────────────────────────────────────────

export interface ParticipantReflection {
  weekId: number;
  stoodOut: string | null;
  goal: string | null;
  goalCheck: string | null;
  goalDoneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantHomeWeek {
  id: number;
  weekNumber: number;
  /** The week's class Sunday, YYYY-MM-DD. */
  classDate?: string | null;
  title: string | null;
  /** Sunday class start, "HH:MM", from the schedule. */
  classTime: string | null;
  expectations: string | null;
  shared: boolean;
  released: boolean;
  releasedAt: string | null;
  recapSummary: string | null;
  discussionPrompt: string | null;
  recapDocumentUrl: string | null;
  recapDocumentName: string | null;
  /** Present only once released (manualReleasedEarlyAt, or the configured manual release time has passed) and a document exists. */
  manual: ManualContent | null;
  /** This participant's own questions for this week, always visible to them regardless of release. */
  manualQuestions: ParticipantManualQuestion[];
  /** This participant's own private note for this week, or null if they haven't written one. */
  manualNote: string | null;
}

export type CheckInResponse = 'OKAY' | 'NEED_HELP';

export interface ParticipantNotification {
  id: string;
  title: string;
  body: string;
  path: string | null;
  type: string;
  readAt: string | null;
  createdAt: string;
}

export interface ParticipantHome {
  now: string;
  participant: { id: string; name: string; phone: string | null };
  cohort: { id: string; name: string; startDate: string | null; endDate: string | null; status: string; venue: string | null } | null;
  group: {
    id: string;
    name: string;
    meetingDay: string | null;
    meetingTime: string | null;
    meetingDurationMins: number | null;
    callPlatform: GroupCallPlatform | null;
    callLink: string | null;
    supportName: string | null;
    supportPhone: string | null;
    supportAvatarUrl: string | null;
  } | null;
  /** Set when the group's meeting has an attendance mark in the last 3 hours and this week isn't submitted yet. */
  groupMeetingLive: { weekId: number; startedAt: string; /** Support has moved past the Prayer step. */ prayerFinished?: boolean; /** Support has moved past the Recap step. */ recapFinished?: boolean; /** The meeting week's recap, sent once the support reaches Recap even before its normal release time. */ recap?: { recapSummary: string | null; discussionPrompt: string | null; recapDocumentUrl: string | null; recapDocumentName: string | null } | null } | null;
  /** Who the group is praying for in the meeting that's on now. projectText only when approved and shared for prayer. */
  groupPrayerFocus: { weekId: number; participantName: string; projectText: string | null } | null;
  weeks: ParticipantHomeWeek[];
  reflections: ParticipantReflection[];
  sunday: Array<{ weekId: number; status: string; lateExcused?: boolean }>;
  meeting: Array<{ weekId: number; status: string }>;
  openWindow: { weekId: number; closesAt: string; myStatus: string | null } | null;
  faithProjectStatus: FaithProjectStatus | null;
  rules: unknown;
  scriptures: Array<{ dayNumber: number; imageUrl: string }>;
  /** Which FOF day the first scripture (position 1) shows on. */
  scriptureStartDay: number;
  lastCheckIn: { response: CheckInResponse; sundayMisses: number; meetingMisses: number; createdAt: string } | null;
  members: Array<{ name: string; avatarUrl: string | null }>;
  profile: {
    email: string | null;
    avatarUrl: string | null;
    gender: string | null;
    ageRange: string | null;
    /** YYYY-MM-DD, added by the participant. */
    dateOfBirth: string | null;
    occupation: string | null;
  };
  /** Their support wrote in the faith project conversation since they last read it. */
  faithUnread: boolean;
  reminders: { meetingRemindMinutes: number[]; recapReleased: boolean };
  resources: Array<{ id: string; title: string; description: string | null; type: Resource['type']; url: string; fileName: string | null }>;
  announcement: { id: string; subject: string; body: string; linkUrl: string | null; linkLabel: string | null; homeLabel?: string | null } | null;
  wrapUp: { submitted: boolean; department: string | null };
  /** Fields admins requested that apply to this participant, with their answers. */
  profileFields: ProfileFieldEntry[];
  profileCompletion: ProfileCompletion;
  /** The most recent class week not yet answered, even a future one; `open` is whether its feedback time has passed. */
  classFeedbackDue: { weekId: number; weekNumber: number; open: boolean } | null;
  /** True from the admin-chosen week's class Sunday onward, until they have a ParticipantWrapUp row. */
  departmentPromptDue: boolean;
}

export type FeedbackRating = 'NOT_GREAT' | 'OKAY' | 'GREAT';

export interface FeedbackAnswers {
  rating: FeedbackRating;
  workingWell?: string | null;
  needsAttention?: string | null;
}

export interface FeedbackResults {
  count: number;
  /** Answers show once a cohort has at least five, so nobody can be picked out. */
  visible: boolean;
  answers: FeedbackAnswers[] | null;
}

/** One week of class_feedback_results(), admin-only. */
export interface ClassFeedbackWeekResult {
  weekId: number;
  weekNumber: number;
  title: string | null;
  supports: Array<{ supportId: string; supportName: string; note: string | null; isNone: boolean; answeredAt: string }>;
  supportsMissing: string[];
  participants: {
    count: number;
    /** Answers show once the week has at least five, so nobody can be picked out. */
    visible: boolean;
    average: number | null;
    answers: Array<{ rating: number; comment: string | null; name: string | null }> | null;
  };
}

export interface ParticipantFaith {
  project: { id: string; body: string | null; status: FaithProjectStatus; updatedAt: string; sharedForPrayer: boolean; fromForm?: boolean } | null;
  deadlineAt: string | null;
  trail: Array<{ id: string; body: string; createdAt: string; byParticipant: boolean; authorName: string | null }>;
  openHelpRequest: { id: string; reason: FaithHelpReason; note: string | null; wantsContact: boolean; createdAt: string } | null;
}

// ── Faith help ("Is it going well?") ────────────────────────────────────────

export type FaithHelpReason = 'LOST_MOTIVATION' | 'SITUATION_CHANGED' | 'UNSURE_NEXT' | 'NO_TIME' | 'OTHER';

export const FAITH_HELP_REASON_LABELS: Record<FaithHelpReason, string> = {
  LOST_MOTIVATION: "I've lost motivation",
  SITUATION_CHANGED: 'My situation changed',
  UNSURE_NEXT: "I'm not sure what to do next",
  NO_TIME: "I'm struggling to find the time",
  OTHER: 'Something else',
};

export interface FaithHelpRequest {
  id: string;
  participantId: string;
  participantName?: string | null;
  participantPhone?: string | null;
  faithProjectId?: string | null;
  reason: FaithHelpReason;
  note: string | null;
  wantsContact: boolean;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById?: string | null;
  resolvedByName?: string | null;
}

// ── Testimonies ──────────────────────────────────────────────────────────────

export type TestimonyVisibility = 'SUPPORT' | 'GROUP' | 'COHORT';
export type TestimonyStatus = 'PENDING' | 'APPROVED' | 'HIDDEN';

export interface Testimony {
  id: string;
  participantId: string;
  participantName?: string | null;
  cohortId?: string;
  groupId?: string | null;
  title: string | null;
  body: string;
  visibility: TestimonyVisibility;
  status: TestimonyStatus;
  reviewedById?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  /** When the assigned support opened this participant's card and saw it (SUPPORT-visibility only). Null = not yet seen. */
  viewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A lighter row for the participant app's own list and the shared feed. */
export interface ParticipantTestimony {
  id: string;
  title: string | null;
  body: string;
  visibility: TestimonyVisibility;
  status: TestimonyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestimonyFeedItem {
  id: string;
  title: string | null;
  body: string;
  visibility: TestimonyVisibility;
  participantName: string;
  avatarUrl: string | null;
  createdAt: string;
}

// The participant People page: every active support/admin in their cohort
// (my support flagged and listed first), plus their own group's other members.
export interface ParticipantPeople {
  supports: Array<{ id: string; name: string; avatarUrl: string | null; role: 'SUPPORT' | 'ADMIN'; isMySupport: boolean }>;
  groupName: string | null;
  members: Array<{ name: string; avatarUrl: string | null }>;
  /** Every other active participant in the cohort — name and photo only. */
  cohort: Array<{ name: string; avatarUrl: string | null }>;
}

export interface ReflectionActivity {
  participantId: string;
  weekId: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecapRelease {
  groupId: string;
  weekId: number;
  releasedById: string | null;
  releasedAt: string;
}

export interface Scripture {
  id: string;
  dayNumber: number;
  imageUrl: string;
  storagePath: string | null;
  createdAt: string;
}

export interface ParticipantCheckIn {
  id: string;
  participantId: string;
  response: CheckInResponse;
  sundayMisses: number;
  meetingMisses: number;
  handledAt: string | null;
  handledById: string | null;
  createdAt: string;
}

// ── AI help (OpenRouter, via the ai-assist edge function) ─────────────────────

export interface ParticipantSummaryState {
  optedIn: boolean;
  /** From the start of the cohort's last week. */
  unlocked: boolean;
  summary: { text: string; createdAt: string } | null;
}

export interface AiSettings {
  enabled: boolean;
  /** OpenRouter model ids, tried in order. */
  models: string[];
}

// ── Participant profile fields ("Request information") ──────────────────────

export type ProfileFieldType = 'SHORT_TEXT' | 'LONG_TEXT' | 'DATE' | 'CHOICE' | 'YES_NO';

export interface ProfileField {
  id: string;
  label: string;
  helpText: string | null;
  fieldType: ProfileFieldType;
  /** Choices for CHOICE fields. */
  options: string[];
  /** Required fields count towards profile completion; optional ones do not. */
  required: boolean;
  /** Applies to participants in these cohorts (all groups when groupIds is null)... */
  cohortIds: string[];
  groupIds: string[] | null;
  /** ...or only to these participants, when set. */
  participantIds: string[] | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface ProfileFieldEntry {
  id: string;
  label: string;
  helpText: string | null;
  fieldType: ProfileFieldType;
  options: string[];
  required: boolean;
  value: string | null;
}

export interface ProfileCompletion {
  percent: number;
  missing: number;
}

// ── Hubs ──────────────────────────────────────────────────────────────────────
// A hub is a cluster of supports (and their groups) in a cohort, with one
// support picked as lead. The lead marks Sunday-recap attendance, messages
// the hub and keeps private notes on each support.

/** Granular permissions a hub lead can grant their assistant. */
export type AssistantHubPermission = 'MEETING' | 'ATTENDANCE' | 'MESSAGE' | 'GROUPS';

/** A support's kind within a cohort (UserCohort.supportKind). */
export type SupportKind = 'PARTICIPANT_SUPPORT' | 'HUB_LEAD' | 'OPERATIONAL';

/** The jobs a member can hold at a hub. */
export type HubJob = 'HUB_LEAD' | 'ASSISTANT_HUB_LEAD' | 'RECAP_LEAD' | 'PRAYER_LEAD' | 'IT_SUPPORT';

export interface HubItSupportEntry {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

export interface SupportHub {
  id: string;
  cohortId: string;
  name: string;
  leadUserId?: string | null;
  leadName?: string | null;
  assistantLeadUserId?: string | null;
  assistantLeadName?: string | null;
  assistantPermissions?: AssistantHubPermission[];
  /** A hub can have several Recap Leads and Prayer Leads. */
  recapLeadUserIds?: string[];
  recapLeadNames?: string[];
  prayerLeadUserIds?: string[];
  prayerLeadNames?: string[];
  itSupports?: HubItSupportEntry[];
  /** The hub's weekly meeting. Set by admins only. */
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingDurationMins?: number | null;
  callPlatform?: GroupCallPlatform | null;
  callLink?: string | null;
  memberCount?: number;
  createdAt?: string;
}

/** A label admins put on supports ("Men only"); the group builder reads it. A tag with a systemKey (Teen Support) is built in and can't be renamed or deleted. */
export interface SupportTag {
  id: string;
  name: string;
  userIds: string[];
  systemKey?: string | null;
}

export interface HubMembership {
  id: string;
  hubId: string;
  userId: string;
  cohortId: string;
  createdAt?: string;
}

export type SupportSessionType = 'SUNDAY_RECAP' | 'PRE_COHORT_TRAINING' | 'GET_TOGETHER';
export type SupportAttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface SupportSession {
  id: string;
  cohortId: string;
  type: SupportSessionType;
  title: string;
  sessionDate: string;
  weekId?: number | null;
  hubId?: string | null;
  createdById?: string | null;
  createdAt?: string;
}

export interface SupportSessionAttendance {
  id: string;
  sessionId: string;
  userId: string;
  status: SupportAttendanceStatus;
  markedById?: string | null;
  markedAt?: string;
}

export type SupportNoteType = 'NOTE' | 'ELIGIBILITY_OVERRIDE';

export interface SupportNote {
  id: string;
  supportId: string;
  authorId?: string | null;
  authorName?: string | null;
  hubId?: string | null;
  noteType: SupportNoteType;
  body: string;
  createdAt: string;
}

export interface HubMessage {
  id: string;
  hubId: string;
  authorId?: string | null;
  authorName?: string | null;
  subject: string;
  body: string;
  createdAt: string;
  /** Set when the message has been edited since it was first sent. */
  editedAt?: string | null;
  /** Whether the signed-in member has tapped "Got it" on this message. */
  ackedByMe?: boolean;
  ackCount?: number;
  /** Other hub members besides the caller — the "Y" in "X of Y acknowledged". */
  memberCount?: number;
  /** Only set for the hub's lead or an admin. */
  ackedUserIds?: string[] | null;
}

/** My Hub, as returned by get_my_hub: the caller's own hub for one cohort. */
export interface MyHubMember {
  userId: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  isLead: boolean;
  groupName?: string | null;
  jobs?: HubJob[];
  /** Admin-set tag, only returned to admins and this hub's lead (null for everyone else). */
  isPersonOfInterest?: boolean | null;
}

export interface MyHubAttendanceRow {
  sessionId: string;
  type: SupportSessionType;
  title: string;
  sessionDate: string;
  weekId?: number | null;
  status: SupportAttendanceStatus;
  /** SUNDAY_RECAP sessions only: the hub's submitted meeting notes. */
  notes?: string | null;
  submittedAt?: string | null;
}

/** Group Discussion (build_discussion_feed). Removed text comes back null
 * except for moderators (the group's support and admins). */
export type DiscussionAccess = 'PARTICIPANT' | 'SUPPORT' | 'ADMIN' | 'HUB';
export type DiscussionReportReason = 'SPAM' | 'UNKIND' | 'OFF_TOPIC' | 'OTHER';

export interface DiscussionAuthor {
  kind: 'SUPPORT' | 'PARTICIPANT';
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Participants only (read live from their profile). */
  gender?: string | null;
  isSupport?: boolean;
}

/** Someone who can be @-tagged in a group's discussion. */
export interface DiscussionMember {
  kind: 'SUPPORT' | 'PARTICIPANT';
  id: string;
  name: string;
  avatarUrl?: string | null;
}
export type DiscussionMention = Pick<DiscussionMember, 'kind' | 'id'> & { name?: string };

export interface DiscussionReply {
  id: string;
  author: DiscussionAuthor;
  isMine: boolean;
  removed: boolean;
  body: string | null;
  createdAt: string;
  mentions: DiscussionMention[];
}

export interface DiscussionPost extends DiscussionReply {
  /** 'INTRO' = an onboarding introduction (one per person per group). */
  kind: 'POST' | 'INTRO';
  pinned: boolean;
  pinnedByName: string | null;
  likeCount: number;
  likedByMe: boolean;
  reportCount: number;
  replies: DiscussionReply[];
}

export interface DiscussionFeed {
  groupId: string;
  groupName: string;
  supportId: string | null;
  supportName: string | null;
  supportAvatarUrl?: string | null;
  access: DiscussionAccess;
  canPost: boolean;
  canModerate: boolean;
  members: DiscussionMember[];
  pinned: DiscussionPost | null;
  posts: DiscussionPost[];
  hasMore: boolean;
  openReports: Array<{ postId: string; count: number; reasons: DiscussionReportReason[] }>;
}

/** Where one participant stands on the four onboarding steps (participant_onboarding_state). */
export interface OnboardingState {
  introPosted: boolean;
  supportIntroPosted: boolean;
  introGuideRead: boolean;
  profileComplete: boolean;
  profileMissing: number;
  readyConfirmed: boolean;
  completed: boolean;
  /** First class date, YYYY-MM-DD (null if the cohort has none). */
  firstClassDate: string | null;
}

export interface OnboardingProgressParticipant extends OnboardingState {
  participantId: string;
  name: string;
  avatarUrl: string | null;
  groupId: string | null;
  groupName: string | null;
}

export interface OnboardingProgressGroup {
  groupId: string;
  groupName: string;
  supportId: string | null;
  supportName: string | null;
  supportIntroPosted: boolean;
}

/** group_onboarding_progress / cohort_onboarding_progress. */
export interface OnboardingProgress {
  groups: OnboardingProgressGroup[];
  participants: OnboardingProgressParticipant[];
}

/** "Discussion this week" on the group view (group_discussion_activity). */
export interface DiscussionActivity {
  weekStart: string;
  postsAndReplies: number;
  members: number;
  active: number;
  quiet: number;
  mostActive: string[];
  goneQuiet: string[];
  latest: { body: string; createdAt: string } | null;
}

/** One support's group as a hub lead (or admin) sees it — get_support_group_view. */
export interface SupportGroupView {
  groupId: string;
  groupName: string;
  supportId: string;
  supportName: string;
  supportAvatarUrl?: string | null;
  hubName: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingDurationMins: number | null;
  callPlatform: GroupCallPlatform | null;
  callLink: string | null;
  participantCount: number;
}

/** The weekly meeting for the Hub Leads of a cohort. Set by admins only. */
export interface HubLeadsMeeting {
  cohortId: string;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingDurationMins: number | null;
  callPlatform: GroupCallPlatform | null;
  callLink: string | null;
}

export interface HubGroupOverview {
  groupId: string;
  groupName: string;
  support: {
    id: string;
    name: string;
    hasPhoto: boolean;
    hasGender: boolean;
    hasAgeRange: boolean;
    hasPhone: boolean;
    hasPush: boolean;
  } | null;
  /** Classes whose register has been finalized: what attendance is counted against. */
  classesRun: number;
  participants: Array<{
    participantId: string;
    name: string;
    avatarUrl: string | null;
    onboarding: OnboardingState;
    faithProjectStatus: FaithProjectStatus | null;
    hasPush: boolean;
    classesAttended: number;
    recent: Array<{ weekNumber: number; status: string; attended: boolean }>;
  }>;
}

export interface MyHubPayload {
  hub: {
    id: string; name: string; leadUserId: string | null; leadName: string | null; cohortId: string;
    assistantLeadUserId?: string | null; assistantLeadName?: string | null;
    assistantPermissions?: AssistantHubPermission[];
    recapLeadUserIds?: string[]; recapLeadNames?: string[];
    prayerLeadUserIds?: string[]; prayerLeadNames?: string[];
    itSupports?: HubItSupportEntry[];
    meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null;
    callPlatform?: GroupCallPlatform | null; callLink?: string | null;
  } | null;
  isLead: boolean;
  isAssistant?: boolean;
  isItSupport?: boolean;
  canMeeting?: boolean;
  canAttendance?: boolean;
  canMessage?: boolean;
  myJobs?: HubJob[];
  unseenIntroJobs?: HubJob[];
  members: MyHubMember[];
  messages: HubMessage[];
  myAttendance: MyHubAttendanceRow[];
  /** Set when this hub's SUNDAY_RECAP session has an attendance mark in the last 3 hours and isn't submitted yet. */
  meetingLive?: { weekId: number; startedAt: string } | null;
}

/** hub_prayer_list: shared faith-project entries for a hub's members' groups. */
export interface HubPrayerListItem {
  faithProjectId: string;
  participantId: string;
  fullName: string;
  groupName: string | null;
  supportName: string | null;
  body: string;
  categoryName: string | null;
  /** How many of this hub's Sunday recaps (this cohort) have prayed for them. */
  timesPrayedFor: number;
  /** The most recent such week's number, or null if never. */
  lastPrayedWeek: number | null;
}

/** get_hub_prayer_focus: the one Faith Project the hub is currently praying for. */
export interface HubPrayerFocus {
  faithProjectId: string | null;
  participantName: string | null;
  groupName: string | null;
  projectText: string | null;
  setAt: string | null;
  prayedForIds: string[];
  /** Persisted "1 · Pray for your hub" done toggle, this hub/week. */
  hubPrayerDone: boolean;
  /** Persisted "Finish prayer" — clears the focus for everyone when set. */
  prayerFinished: boolean;
}

/** One batch of notifications, as Announcements → Sent & read lists it. */
export interface NotificationSend {
  /** STAFF and PARTICIPANT have bell rows (read is tracked); PUSH is a push that has none. */
  source: 'STAFF' | 'PARTICIPANT' | 'PUSH';
  type: string;
  title: string;
  body: string;
  path: string;
  sentAt: string;
  lastAt: string;
  recipients: number;
  readCount: number;
  tracked: boolean;
}

export interface NotificationRecipient {
  id: string;
  name: string;
  role: string;
  /** null for push-only sends, where reading is not tracked. */
  read: boolean | null;
  readAt: string | null;
  sentAt: string;
  /** Has a saved device, so a push can reach them. */
  hasPush: boolean;
}

/** A support's open question: "are you actively following up?" (automatic reassignment). */
export interface FollowUpCheck {
  id: string;
  promptedAt: string;
  deadlineAt: string;
  people: Array<{ id: string; name: string }>;
}

export interface FollowUpReassignmentRow {
  id: string;
  createdAt: string;
  reason: 'NO_RESPONSE' | 'NOT_NOW' | 'NO_MOVEMENT_AFTER_YES';
  contactName: string;
  fromName: string | null;
  toName: string | null;
}

/** Admin view of automatic reassignment: who is being asked, and what has moved. */
export interface FollowUpReassignmentSummary {
  recent: FollowUpReassignmentRow[];
  waiting: Array<{ ownerName: string; promptedAt: string; deadlineAt: string; answer: 'YES' | 'NOT_NOW' | null; people: number }>;
  activeSupports: number;
}

// ---------------------------------------------------------------------------
// Practice (a safe place to try the app together)
// ---------------------------------------------------------------------------

export type PracticeRole = 'SUPPORT' | 'HUB_LEAD' | 'ASSISTANT' | 'RECAP_LEAD' | 'PRAYER_LEAD';
export type PracticeCalendar = 'BEFORE' | 'CLASS_DAY' | 'MID_WEEK' | 'WEEK_2';

export interface PracticeProgressItem {
  key: string;
  doneAt: string | null;
  stuckAt: string | null;
}

export interface PracticeParticipant {
  id: string;
  name: string;
  phone: string;
  /** The first-sign-in code, shown until they choose their own password. */
  code: string | null;
  signedIn: boolean;
  progress: PracticeProgressItem[];
}

export interface PracticeMemberState {
  userId: string;
  name: string;
  role: PracticeRole;
  avatarUrl?: string | null;
  progress: PracticeProgressItem[];
  group: { id: string; name: string; participants: PracticeParticipant[] } | null;
}

export interface PracticeState {
  cohortId: string | null;
  on: boolean;
  built: boolean;
  calendar: PracticeCalendar | null;
  members: PracticeMemberState[];
  hubs?: Array<{ id: string; name: string; leadName: string | null }>;
}

export interface PracticeMyProgress {
  /** Staff: their practice role (null when not in Practice). Participants: unused. */
  role: PracticeRole | null;
  practice?: boolean;
  /** Staff: the practice group and hub they sit in, and the practice participants in that group. */
  groupName?: string | null;
  hubName?: string | null;
  groupParticipants?: string[];
  items: PracticeProgressItem[];
}

export type PracticeSeatKey = PracticeRole | 'PARTICIPANT';

export interface PracticeTeamMember {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: PracticeRole;
  online: boolean;
  busy: boolean;
}

export interface PracticePeerActive {
  id: string;
  partnerUserId: string;
  partnerName: string;
  myRole: PracticeSeatKey;
  partnerRole: PracticeSeatKey;
  iAmParticipant: boolean;
  partnerPresent: boolean;
  partnerInParticipantView: boolean;
  myProgress: PracticeProgressItem[];
  partnerProgress: PracticeProgressItem[];
}

export interface PracticePulse {
  member: boolean;
  on?: boolean;
  role?: PracticeRole;
  inParticipantView?: boolean;
  /** Changes whenever the person's cohort access changes. */
  cohortKey: string;
  incoming?: Array<{ id: string; fromName: string; fromRole: PracticeSeatKey; toRole: PracticeSeatKey }>;
  outgoing?: { id: string; toName: string; myRole: PracticeSeatKey; theirRole: PracticeSeatKey } | null;
  active?: PracticePeerActive | null;
}

export interface PracticeActivePeer {
  id: string;
  fromName: string;
  toName: string;
  fromRole: PracticeSeatKey;
  toRole: PracticeSeatKey;
  status: 'ACTIVE' | 'PENDING';
}

export interface PracticeOverviewMember {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: PracticeRole;
  joinedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  inParticipantView: boolean;
  progress: Array<{ key: string; doneAt: string | null; stuckAt: string | null }>;
}

export interface PracticeOverviewWalkthrough {
  id: string;
  fromName: string;
  toName: string;
  fromRole: string;
  toRole: string;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  endedAt: string | null;
}

export interface PracticeOverview {
  on: boolean;
  members: PracticeOverviewMember[];
  walkthroughs: PracticeOverviewWalkthrough[];
}

export interface PracticeStatus {
  on: boolean;
  people: number;
  online: number;
  walkthroughs: number;
}


// ── Surveys ──────────────────────────────────────────────────────────────────
export type SurveyTimingMode = 'DATES' | 'WEEKS_BEFORE_END' | 'WEEKS_AFTER_START';
export type SurveyAudience = 'PARTICIPANTS' | 'SUPPORTS' | 'EVERYONE';
export type SurveyQuestionKind = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'RATING' | 'FILE' | 'DEPARTMENT' | 'YESNO';
export type SurveyState = 'DRAFT' | 'OFF' | 'SCHEDULED' | 'OPEN' | 'CLOSED';

export interface SurveyQuestionConfig {
  /** Rating: top of the scale (2 to 10). */
  scale?: number;
  lowLabel?: string;
  highLabel?: string;
  /** Number: optional limits. */
  min?: number;
  max?: number;
  /** Built-in wrap-up questions that feed the department list. */
  feeds?: 'department' | 'referral' | 'note';
}

export interface SurveyQuestion {
  id?: string;
  position?: number;
  kind: SurveyQuestionKind;
  prompt: string;
  required: boolean;
  config: SurveyQuestionConfig;
}

export interface SurveyListItem {
  id: string;
  builtinKey: string | null;
  title: string;
  audience: SurveyAudience;
  scope: 'COHORT' | 'GENERAL';
  cohortId: string | null;
  cohortName: string | null;
  anonymous: boolean;
  enabled: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  timingMode: SurveyTimingMode;
  weeksBeforeEnd: number | null;
  closeDaysAfterEnd: number | null;
  weeksAfterStart: number | null;
  openForDays: number | null;
  opensAt: string | null;
  closesAt: string | null;
  state: SurveyState;
  eligible: number;
  answered: number;
}

export interface SurveyRecord {
  id: string;
  builtinKey: string | null;
  title: string;
  description: string | null;
  audience: SurveyAudience;
  scope: 'COHORT' | 'GENERAL';
  cohortId: string | null;
  targetGroupId: string | null;
  targetHubId: string | null;
  targetLabelId: string | null;
  anonymous: boolean;
  enabled: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  timingMode: SurveyTimingMode;
  opensAt: string | null;
  closesAt: string | null;
  weeksBeforeEnd: number | null;
  closeDaysAfterEnd: number | null;
  weeksAfterStart: number | null;
  openForDays: number | null;
  notifyOnOpen: boolean;
  homeHeading: string | null;
  homeLine: string | null;
  homeButton: string | null;
  aiSummary: string | null;
  aiSummaryAt: string | null;
}

export interface SurveyDetail {
  survey: SurveyRecord;
  questions: SurveyQuestion[];
}

export type SurveyAnswerValue = string | number | { url: string; name?: string } | null | undefined;

export interface SurveyResults extends SurveyDetail {
  eligible: number;
  answered: number;
  /** An anonymous survey keeps its answers hidden until five people have answered. */
  visible: boolean;
  answers: Array<{ name?: string; submittedAt?: string; answers: Record<string, SurveyAnswerValue> }> | null;
  people: Array<{ name: string; kind: 'PARTICIPANT' | 'SUPPORT'; answered: boolean }>;
}

export interface PendingSurvey {
  id: string;
  title: string;
  description: string | null;
  builtinKey: string | null;
  homeHeading: string | null;
  homeLine: string | null;
  homeButton: string | null;
}

export interface SurveyForFilling {
  id: string;
  title: string;
  description?: string | null;
  anonymous: boolean;
  builtinKey?: string | null;
  submitted: boolean;
  questions?: SurveyQuestion[];
}

/** Another sign-up in the same cohort that used the same email or number. */
export interface FollowUpRelatedContact {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** 'EMAIL' or 'PHONE': what the two sign-ups share. */
  sharedBy: 'EMAIL' | 'PHONE';
  /** Minutes between the two sign-ups (a few minutes usually means one person signed up two people). */
  minutesApart: number;
  /** The cohort the other sign-up is in, and whether it is the same one. */
  cohortName: string | null;
  sameCohort: boolean;
  ownerName: string | null;
  mine: boolean;
}

// ── Birthdays ────────────────────────────────────────────────────────────────
export interface BirthdayPerson {
  id: string;
  name: string;
  /** 1 to 12, and the day of that month. The year is never sent. */
  month: number;
  day: number;
  /** 0 = today. */
  daysUntil: number;
  cohorts: string[];
}

export interface BirthdayList {
  today: string;
  supports: BirthdayPerson[];
  participants: BirthdayPerson[];
  /** People with no birthday on file yet. */
  missing: { supports: number; participants: number };
}
