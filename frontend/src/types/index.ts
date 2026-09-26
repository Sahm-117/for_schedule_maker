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
  isActive?: boolean;
  deactivatedAt?: string | null;
  isCoordinator?: boolean;
  avatarUrl?: string | null;
  themeColor?: string | null;
  hubLastSeenAt?: string | null;
  whatsappGroupUrl?: string | null;
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
  days: Day[];
}

/** One week as support_recaps() returns it: content only once support-released. */
export interface SupportRecap {
  weekId: number;
  weekNumber: number;
  title: string | null;
  released: boolean;
  releasedAt: string | null;
  recapSummary: string | null;
  discussionPrompt: string | null;
  recapDocumentUrl: string | null;
  recapDocumentName: string | null;
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
export type FollowUpRegistrationStatus = 'NOT_REGISTERED' | 'PENDING_CONFIRMATION' | 'REGISTERED' | 'STILL_THINKING' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'NO_RESPONSE' | 'NEXT_COHORT' | 'LOGIN_SHARED';
export type FollowUpNextAction = 'SEND_MESSAGE' | 'SEND_REMINDER' | 'CALL' | 'CLOSE';
export type FollowUpStatus = 'TO_CONTACT' | 'WAITING' | 'NEEDS_REMINDER' | 'REPLIED' | 'CALL_BACK_LATER' | 'REGISTERED' | 'WRONG_NUMBER' | 'NOT_INTERESTED' | 'NO_RESPONSE' | 'NEXT_COHORT' | 'LOGIN_SHARED';
export type IssueStatus = 'OPEN' | 'RESOLVED';

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
  createdAt?: string;
  updatedAt?: string;
}

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
  category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR';
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

// ── Participants ──────────────────────────────────────────────────────────────

export type ParticipantStatus = 'ACTIVE' | 'ARCHIVED';
export type ParticipantSource = 'FOLLOW_UP' | 'MANUAL' | 'IMPORT';

export interface Participant {
  id: string;
  fullName: string;
  phone?: string | null;
  cohortId?: string | null;
  cohortName?: string | null;
  source: ParticipantSource;
  followUpContactId?: string | null;
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
  groupId?: string | null;
  groupName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ParticipantUpdate = Partial<Pick<Participant,
  'fullName' | 'phone' | 'cohortId' | 'notes' | 'status' |
  'email' | 'gender' | 'ageRange' | 'departments' | 'registrationDate' | 'smartRequest'
>>;

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
}

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
  groupMeetingLive: { weekId: number; startedAt: string } | null;
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
  announcement: { id: string; subject: string; body: string; linkUrl: string | null; linkLabel: string | null } | null;
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
  project: { id: string; body: string | null; status: FaithProjectStatus; updatedAt: string; sharedForPrayer: boolean } | null;
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
export type AssistantHubPermission = 'MEETING' | 'ATTENDANCE' | 'MESSAGE';

/** A support's kind within a cohort (UserCohort.supportKind). */
export type SupportKind = 'PARTICIPANT_SUPPORT' | 'HUB_LEAD' | 'OPERATIONAL';

/** The jobs a member can hold at a hub. */
export type HubJob = 'HUB_LEAD' | 'ASSISTANT_HUB_LEAD' | 'RECAP_LEAD' | 'PRAYER_LEAD' | 'IT_SUPPORT';

export interface HubItSupportEntry {
  userId: string;
  name: string;
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
  recapLeadUserId?: string | null;
  recapLeadName?: string | null;
  prayerLeadUserId?: string | null;
  prayerLeadName?: string | null;
  itSupports?: HubItSupportEntry[];
  memberCount?: number;
  createdAt?: string;
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
  isLead: boolean;
  groupName?: string | null;
  jobs?: HubJob[];
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

export interface MyHubPayload {
  hub: {
    id: string; name: string; leadUserId: string | null; leadName: string | null; cohortId: string;
    assistantLeadUserId?: string | null; assistantLeadName?: string | null;
    assistantPermissions?: AssistantHubPermission[];
    recapLeadUserId?: string | null; recapLeadName?: string | null;
    prayerLeadUserId?: string | null; prayerLeadName?: string | null;
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
