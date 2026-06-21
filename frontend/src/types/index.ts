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
  role: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT';
  isActive?: boolean;
  deactivatedAt?: string | null;
  isCoordinator?: boolean;
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
  status?: 'ACTIVE' | 'ARCHIVED';
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
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface TelegramNotificationEvent {
  event: 'CHANGE_REQUEST_CREATED' | 'CHANGE_APPROVED' | 'CHANGE_REJECTED' | 'DAILY_DIGEST';
  changeType?: 'ADD' | 'EDIT' | 'DELETE';
  actorName?: string;
  actorRole?: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT' | 'SYSTEM';
  requestId?: string;
  weekId?: number;
  weekNumber?: number;
  dayName?: string;
  summary?: string;
  timestamp?: string;
  loginUrl?: string;
  digestTitle?: string;
  digestLines?: string[];
  pdfUrl?: string;
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
}

export type FollowUpMessageStatus = 'NOT_SENT' | 'SENT';
export type FollowUpReplyStatus = 'NO_REPLY' | 'REPLIED' | 'NEEDS_REMINDER' | 'INCORRECT_NUMBER';
export type FollowUpCallStatus = 'NOT_CALLED' | 'CALLED' | 'MISSED_CALL' | 'CALL_BACK_LATER' | 'NOT_APPLICABLE' | 'INCORRECT_NUMBER';
export type FollowUpRegistrationStatus = 'NOT_REGISTERED' | 'PENDING_CONFIRMATION' | 'REGISTERED' | 'STILL_THINKING' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'NO_RESPONSE';
export type FollowUpNextAction = 'SEND_MESSAGE' | 'SEND_REMINDER' | 'CALL' | 'CLOSE';
export type FollowUpStatus = 'TO_CONTACT' | 'WAITING' | 'NEEDS_REMINDER' | 'REPLIED' | 'CALL_BACK_LATER' | 'REGISTERED' | 'WRONG_NUMBER' | 'NOT_INTERESTED' | 'NO_RESPONSE';
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
  groupId?: string | null;
  groupName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ParticipantUpdate = Partial<Pick<Participant,
  'fullName' | 'phone' | 'cohortId' | 'notes' | 'status' |
  'email' | 'gender' | 'ageRange' | 'departments' | 'registrationDate' | 'smartRequest'
>>;

// ── Groups ────────────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  cohortId: string;
  cohortName?: string | null;
  name: string;
  supportId?: string | null;
  supportName?: string | null;
  participantCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

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

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';

export interface AttendanceRecord {
  id: string;
  participantId: string;
  participantName?: string;
  weekId: number;
  status: AttendanceStatus;
  markedById?: string | null;
  markedAt?: string;
}

// ── Faith Projects ────────────────────────────────────────────────────────────

export type FaithProjectStatus = 'NOT_DRAFTED' | 'UNDER_REFINEMENT' | 'APPROVED';

export interface FaithProject {
  id: string;
  participantId: string;
  participantName?: string | null;
  title?: string | null;
  body?: string | null;
  status: FaithProjectStatus;
  updatedById?: string | null;
  updatedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
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

export interface DailyDigestCursor {
  weekNumber: number;
  dayName: string;
  completed: boolean;
}

export interface DailyDigestFunctionResponse {
  ok: boolean;
  status?: string;
  enabled?: boolean;
  reason?: string;
  error?: string;
  cursor?: DailyDigestCursor;
  current?: DailyDigestCursor;
  next?: DailyDigestCursor;
  nextActionLabel?: 'Send Digest Now' | 'Restart Digest';
  dayName?: string;
  weekNumber?: number;
  details?: unknown;
}
