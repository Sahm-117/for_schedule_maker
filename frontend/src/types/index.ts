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
  role: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT' | 'PARTICIPANT';
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
  /** What participants should do this week, one item per line. */
  expectations?: string | null;
  days: Day[];
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
  | 'COVER_REQUEST'
  | 'HUB'
  | 'REMINDER'
  | 'ESCALATION'
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

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface AttendanceRecord {
  id: string;
  participantId: string;
  participantName?: string;
  weekId: number;
  status: AttendanceStatus;
  markedById?: string | null;
  markedAt?: string;
}

export interface AttendanceSession {
  weekId: number;
  autoFinalizeAtNoon: boolean;
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

export type CoverRequestStatus = 'PENDING' | 'ASSIGNED';

export interface CoverRequest {
  id: string;
  supportId: string;
  supportName?: string | null;
  cohortId?: string | null;
  reason: string;
  startsAt: string;
  endsAt: string;
  note?: string | null;
  status: CoverRequestStatus;
  coverSupportId?: string | null;
  coverSupportName?: string | null;
  assignedById?: string | null;
  assignedAt?: string | null;
  createdAt: string;
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
  } | null;
  weeks: ParticipantHomeWeek[];
  reflections: ParticipantReflection[];
  sunday: Array<{ weekId: number; status: string }>;
  meeting: Array<{ weekId: number; status: string }>;
  faithProjectStatus: FaithProjectStatus | null;
  rules: unknown;
  scriptures: Array<{ dayNumber: number; imageUrl: string }>;
  lastCheckIn: { response: CheckInResponse; sundayMisses: number; meetingMisses: number; createdAt: string } | null;
  members: Array<{ name: string }>;
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
  wrapUp: { submitted: boolean };
  /** Fields admins requested that apply to this participant, with their answers. */
  profileFields: ProfileFieldEntry[];
  profileCompletion: ProfileCompletion;
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

export interface ParticipantFaith {
  project: { id: string; body: string | null; status: FaithProjectStatus; updatedAt: string } | null;
  deadlineAt: string | null;
  trail: Array<{ id: string; body: string; createdAt: string; byParticipant: boolean; authorName: string | null }>;
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
