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
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT';
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
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
  weekNumber: number;
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
