import axios from 'axios';
import type { AuthResponse, User, Week, PendingChange, RejectedChange, Label, SupportActivityCompletion, Cohort } from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';
import { DEFAULT_PROGRAMME_RULES } from '../utils/programmeRules';
import { DEFAULT_CHURCH_DEPARTMENTS } from '../constants/departments';

// Import Supabase API
import {
  authApi as supabaseAuthApi,
  cohortsApi as supabaseCohortsApi,
  weeksApi as supabaseWeeksApi,
  activitiesApi as supabaseActivitiesApi,
  labelsApi as supabaseLabelsApi,
  settingsApi as supabaseSettingsApi,
  pendingChangesApi as supabasePendingChangesApi,
  rejectedChangesApi as supabaseRejectedChangesApi,
  notificationsApi as supabaseNotificationsApi,
  usersApi as supabaseUsersApi,
  supportActivityCompletionsApi as supabaseSupportActivityCompletionsApi,
  pushSubscriptionsApi as supabasePushSubscriptionsApi,
  notificationSettingsApi as supabaseNotificationSettingsApi,
  announcementsApi as supabaseAnnouncementsApi,
  resourcesApi as supabaseResourcesApi,
  followUpContactsApi as supabaseFollowUpContactsApi,
  formRegistrationsApi as supabaseFormRegistrationsApi,
  messageTemplatesApi as supabaseMessageTemplatesApi,
  followUpIssuesApi as supabaseFollowUpIssuesApi,
  participantsApi as supabaseParticipantsApi,
  groupsApi as supabaseGroupsApi,
  attendanceApi as supabaseAttendanceApi,
  attendanceFollowUpTasksApi as supabaseAttendanceFollowUpTasksApi,
  attendanceExcusalsApi as supabaseAttendanceExcusalsApi,
  supportHubsApi as supabaseSupportHubsApi,
  supportNotesApi as supabaseSupportNotesApi,
  supportSessionsApi as supabaseSupportSessionsApi,
  myHubApi as supabaseMyHubApi,
  faithProjectsApi as supabaseFaithProjectsApi,
  faithProjectSettingsApi as supabaseFaithProjectSettingsApi,
  faithProjectCategoriesApi as supabaseFaithProjectCategoriesApi,
  groupPrayersApi as supabaseGroupPrayersApi,
  groupPrayerFocusApi as supabaseGroupPrayerFocusApi,
  groupPrayerStatusApi as supabaseGroupPrayerStatusApi,
  groupOnboardingStatusApi as supabaseGroupOnboardingStatusApi,
  participantOnboardingStatusApi as supabaseParticipantOnboardingStatusApi,
  participantNotesApi as supabaseParticipantNotesApi,
  participantHandoversApi as supabaseParticipantHandoversApi,
  meetingAttendanceApi as supabaseMeetingAttendanceApi,
  participantFlagsApi as supabaseParticipantFlagsApi,
  departmentReferralsApi as supabaseDepartmentReferralsApi,
  participantStageChangesApi as supabaseParticipantStageChangesApi,
  faithThreadReadsApi as supabaseFaithThreadReadsApi,
  supportChecklistApi as supabaseSupportChecklistApi,
  coverRequestsApi as supabaseCoverRequestsApi,
  recapDocumentsApi as supabaseRecapDocumentsApi,
  onboardingEventsApi as supabaseOnboardingEventsApi,
  hubApi as supabaseHubApi,
  participantAccountsApi as supabaseParticipantAccountsApi,
  participantAppApi as supabaseParticipantAppApi,
  participantPushApi as supabaseParticipantPushApi,
  feedbackApi as supabaseFeedbackApi,
  aiApi as supabaseAiApi,
  profileFieldsApi as supabaseProfileFieldsApi,
  reflectionActivityApi as supabaseReflectionActivityApi,
  recapReleasesApi as supabaseRecapReleasesApi,
  participantCheckInsApi as supabaseParticipantCheckInsApi,
  scripturesApi as supabaseScripturesApi,
  tourProgressApi as supabaseTourProgressApi,
  getSessionToken as supabaseGetSessionToken,
  SESSION_TOKEN_KEY,
  setAuthToken as supabaseSetAuthToken,
  clearAuthToken as supabaseClearAuthToken,
} from './supabase-api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const DATA_PROVIDER = (import.meta.env.VITE_DATA_PROVIDER || 'supabase').toLowerCase();
const USE_SUPABASE = DATA_PROVIDER === 'supabase';

if (USE_SUPABASE && (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  throw new Error('Supabase mode selected but VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are missing');
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      authToken = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = USE_SUPABASE ? supabaseSetAuthToken : (token: string) => {
  authToken = token;
  localStorage.setItem('accessToken', token);
};

export const clearAuthToken = USE_SUPABASE ? supabaseClearAuthToken : () => {
  authToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

// Initialize token from localStorage
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('accessToken');
  if (token) {
    authToken = token;
  }
}

// Auth API
export const authApi = USE_SUPABASE ? supabaseAuthApi : {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  async register(userData: { email?: string; phone?: string; name: string; password: string; role?: string }): Promise<{ user: User }> {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  async getMe(): Promise<{ user: User }> {
    const response = await api.get('/auth/me');
    return response.data;
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  async signOut(_sessionToken: string): Promise<void> { return; },
};

// Weeks API
export const weeksApi = USE_SUPABASE ? supabaseWeeksApi : {
  async getAll(_cohortId?: string): Promise<{ weeks: Week[] }> {
    const response = await api.get('/weeks');
    return response.data;
  },

  async getById(weekId: number, _cohortId?: string): Promise<{ week: Week; pendingChanges: PendingChange[] }> {
    const response = await api.get(`/weeks/${weekId}`);
    return {
      ...response.data,
      pendingChanges: normalizePendingChanges(response.data.pendingChanges || []),
    };
  },

  async update(_weekId: number, _input: { title?: string | null; shareWithParticipants?: boolean; expectations?: string | null }): Promise<{ week: Week }> {
    throw new Error('Weeks are only editable in Supabase mode.');
  },
};

export const cohortsApi = USE_SUPABASE ? supabaseCohortsApi : {
  async getAll(): Promise<{ cohorts: Cohort[] }> { return { cohorts: [] }; },
  async getPeople(_cohortId: string): Promise<import('../utils/programmeRules').CohortPeoplePayload> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async getHealth(_cohortId: string): Promise<import('../components/dashboard/healthModel').CohortHealthPayload> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async createFromCurrent(_input: {
    name: string;
    description?: string;
    venue?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    sourceCohortId: string;
  }): Promise<{ cohort: Cohort }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async update(_cohortId: string, _input: any): Promise<{ cohort: Cohort }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async addWeekAt(_cohortId: string, _weekNumber: number, _options?: { duplicateFromWeekId?: number }): Promise<{ week: Week }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async addWeek(_cohortId: string): Promise<{ week: Week }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async deleteWeek(_weekId: number): Promise<{ deletedWeekNumber: number; cohortId: string }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async deleteLatestWeek(_cohortId: string): Promise<{ deletedWeekNumber: number }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async delete(_cohortId: string): Promise<{ message: string }> { throw new Error('Cohorts are only available in Supabase mode.'); },
  async getMembers(_cohortId: string): Promise<{ users: User[] }> { return { users: [] }; },
  async setMembers(_cohortId: string, _userIds: string[]): Promise<{ message: string }> { return { message: 'Not supported' }; },
};

const followUpsUnavailable = () => {
  throw new Error('Follow-ups are only available in Supabase mode.');
};

export const followUpContactsApi = USE_SUPABASE ? supabaseFollowUpContactsApi : {
  async retrySheetSync(): Promise<{ attempted: number; sent: number }> { return { attempted: 0, sent: 0 }; },
  async getAll(_options?: any): Promise<{ contacts: import('../types').FollowUpContact[] }> { return { contacts: [] }; },
  async create(_input: any): Promise<never> { return followUpsUnavailable(); },
  async createMany(_rows: any[]): Promise<never> { return followUpsUnavailable(); },
  async update(_id: string, _input: any): Promise<never> { return followUpsUnavailable(); },
  async assignMany(_ids: string[], _ownerId: string | null, _dueDate?: string | null): Promise<never> { return followUpsUnavailable(); },
  async logContact(_id: string): Promise<never> { return followUpsUnavailable(); },
  async delete(_id: string): Promise<never> { return followUpsUnavailable(); },
  async getNextCohortContacts(_cohortId: string): Promise<{ contacts: import('../types').FollowUpContact[] }> { return { contacts: [] }; },
  async getWaitingForCohort(_cohortId: string): Promise<{ contacts: import('../types').FollowUpContact[] }> { return { contacts: [] }; },
  async bulkMoveNextCohortContacts(_ids: string[], _newCohortId: string): Promise<void> { return; },
};

export const messageTemplatesApi = USE_SUPABASE ? supabaseMessageTemplatesApi : {
  async getAll(_options?: any): Promise<{ templates: import('../types').MessageTemplate[] }> { return { templates: [] }; },
  async create(_input: any): Promise<never> { return followUpsUnavailable(); },
  async update(_id: string, _input: any): Promise<never> { return followUpsUnavailable(); },
  async delete(_id: string): Promise<never> { return followUpsUnavailable(); },
  async uploadTemplateImage(_file: File): Promise<never> { return followUpsUnavailable(); },
};

export const followUpIssuesApi = USE_SUPABASE ? supabaseFollowUpIssuesApi : {
  async getAll(_options?: any): Promise<{ issues: import('../types').FollowUpIssue[] }> { return { issues: [] }; },
  async create(_input: any): Promise<never> { return followUpsUnavailable(); },
  async update(_id: string, _input: any): Promise<never> { return followUpsUnavailable(); },
  async delete(_id: string): Promise<never> { return followUpsUnavailable(); },
};

// Activities API
export const activitiesApi = USE_SUPABASE ? supabaseActivitiesApi : {
  async checkDuplicates(time: string, description: string, dayName: string): Promise<{ existingWeeks: number[] }> {
    const response = await api.post('/activities/check-duplicates', { time, description, dayName });
    return response.data;
  },

  async setLabelsForActivities(_activityIds: number[], _labelIds: string[]): Promise<{ updated: number }> {
    throw new Error('The Rota requires Supabase mode.');
  },

  // Admin only - creates activities directly
  async create(activityData: {
    dayId: number;
    dayName?: string;
    time: string;
    description: string;
    period: string;
    applyToWeeks?: number[];
    labelIds?: string[];
    labelNames?: string[];
    userId?: string;
  }): Promise<{ activities: any[] }> {
    const response = await api.post('/activities', activityData);
    return response.data;
  },

  // Support users - creates pending change requests
  async request(activityData: {
    dayId: number;
    dayName?: string;
    time: string;
    description: string;
    period: string;
    applyToWeeks?: number[];
    labelIds?: string[];
    labelNames?: string[];
    userId?: string;
  }): Promise<{ message: string; pendingChange: any }> {
    const response = await api.post('/activities/request', activityData);
    return response.data;
  },

  async update(activityId: number, updateData: {
    time: string;
    period?: string;
    description: string;
    applyToWeeks?: number[];
    labelIds?: string[];
    labelNames?: string[];
  }): Promise<{ activities: any[] }> {
    const response = await api.put(`/activities/${activityId}`, updateData);
    return response.data;
  },

  async delete(activityId: number, deleteData: {
    applyToWeeks?: number[];
  }): Promise<{ deletedActivities: any[] }> {
    const response = await api.delete(`/activities/${activityId}`, { data: deleteData });
    return response.data;
  },

  async reorder(activityId: number, newOrderIndex: number): Promise<{ activity: any }> {
    const response = await api.put(`/activities/${activityId}/reorder`, { newOrderIndex });
    return response.data;
  },
};

// Labels API
export const labelsApi = USE_SUPABASE ? supabaseLabelsApi : {
  async getAll(): Promise<{ labels: Label[] }> {
    const response = await api.get('/labels');
    return response.data;
  },
  async create(input: { name: string; color: string }): Promise<{ label: Label }> {
    const response = await api.post('/labels', input);
    return response.data;
  },
  async update(labelId: string, input: { name: string; color: string }): Promise<{ label: Label }> {
    const response = await api.put(`/labels/${labelId}`, input);
    return response.data;
  },
  async delete(labelId: string): Promise<{ message: string }> {
    const response = await api.delete(`/labels/${labelId}`);
    return response.data;
  },
};

// Pending Changes API
export const pendingChangesApi = USE_SUPABASE ? supabasePendingChangesApi : {
  async getAll(): Promise<{ pendingChanges: PendingChange[] }> {
    return { pendingChanges: [] };
  },

  async getByWeek(weekId: number): Promise<{ pendingChanges: PendingChange[] }> {
    const response = await api.get(`/pending-changes/${weekId}`);
    return {
      pendingChanges: normalizePendingChanges(response.data.pendingChanges || []),
    };
  },

  async create(changeData: {
    weekId: number;
    changeType: string;
    changeData: any;
    userId?: string;
  }): Promise<{ pendingChange: PendingChange }> {
    const response = await api.post('/pending-changes', changeData);
    return response.data;
  },

  async approve(changeId: string): Promise<{ message: string; results: any[]; approvedBy: string }> {
    const response = await api.put(`/pending-changes/${changeId}/approve`);
    return response.data;
  },

  async reject(changeId: string, rejectionReason: string): Promise<{ message: string; rejectedChange: any }> {
    const response = await api.post(`/pending-changes/${changeId}/reject`, { rejectionReason });
    return response.data;
  },
};

// Rejected Changes API
export const rejectedChangesApi = USE_SUPABASE ? supabaseRejectedChangesApi : {
  async getMine(): Promise<{ rejectedChanges: RejectedChange[]; unreadCount: number }> {
    const response = await api.get('/rejected-changes/me');
    return response.data;
  },

  async markRead(changeId: string): Promise<{ message: string; rejectedChange: RejectedChange }> {
    const response = await api.put(`/rejected-changes/${changeId}/mark-read`);
    return response.data;
  },

  async markAllRead(): Promise<{ message: string; updatedCount: number }> {
    const response = await api.put('/rejected-changes/mark-all-read');
    return response.data;
  },
};

// In-app Notifications API
export const notificationsApi = USE_SUPABASE ? supabaseNotificationsApi : {
  async getMine(): Promise<{ notifications: import('../types').Notification[]; unreadCount: number }> {
    const response = await api.get('/notifications/me');
    return response.data;
  },
  async markAllRead(): Promise<{ updatedCount: number }> {
    const response = await api.put('/notifications/mark-all-read');
    return response.data;
  },
  async markRead(id: string): Promise<void> {
    await api.put(`/notifications/${id}/mark-read`);
  },
};

// Users API
export const usersApi = USE_SUPABASE ? supabaseUsersApi : {
  async getAll(options: { includeInactive?: boolean } = {}): Promise<{ users: User[] }> {
    const response = await api.get('/users');
    const users = response.data.users || [];
    return {
      users: options.includeInactive ? users : users.filter((user: User) => user.isActive !== false),
    };
  },

  async getById(userId: string): Promise<{ user: User }> {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  async resetPassword(userId: string, temporaryPassword: string): Promise<void> {
    await api.put(`/users/${userId}`, { password: temporaryPassword });
  },

  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    await api.put(`/users/${userId}/password`, { currentPassword, newPassword });
  },

  async update(userId: string, updateData: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    isActive?: boolean;
    deactivatedAt?: string | null;
    isCoordinator?: boolean;
  }): Promise<{ user: User }> {
    const response = await api.put(`/users/${userId}`, updateData);
    return response.data;
  },

  async delete(userId: string): Promise<{ message: string }> {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },

  async getUserLabels(_userId: string): Promise<{ labels: Label[] }> {
    return { labels: [] };
  },

  async getLabelOwners(): Promise<{ owners: Array<{ labelId: string; user: Pick<User, 'id' | 'name'> }> }> {
    return { owners: [] };
  },

  async getUserCohorts(_userId: string): Promise<{ cohorts: Cohort[] }> {
    return { cohorts: [] };
  },

  async setUserLabels(_userId: string, _labelIds: string[]): Promise<{ message: string }> {
    return { message: 'Not supported' };
  },

  async saveThemeColor(_userId: string, _color: string | null): Promise<void> { return; },
  async uploadAvatar(_userId: string, _file: File): Promise<{ avatarUrl: string }> {
    throw new Error('Avatar upload is not available in REST mode');
  },
  async saveWhatsappGroupUrl(_userId: string, _url: string | null): Promise<void> { return; },
  async markHubSeen(_userId: string): Promise<void> { return; },
};

export const supportActivityCompletionsApi = USE_SUPABASE ? supabaseSupportActivityCompletionsApi : {
  async getMineForWeek(_weekId: number, _userId: string): Promise<{ completions: SupportActivityCompletion[] }> {
    return { completions: [] };
  },
  async getByWeek(_weekId: number): Promise<{ completions: SupportActivityCompletion[] }> {
    return { completions: [] };
  },
  async markDone(_activityId: number, _userId: string): Promise<{ completion: SupportActivityCompletion }> {
    throw new Error('Support activity completion is only available in Supabase mode.');
  },
  async markUndone(_activityId: number, _userId: string): Promise<{ message: string }> {
    throw new Error('Support activity completion is only available in Supabase mode.');
  },
};

export const settingsApi = USE_SUPABASE ? supabaseSettingsApi : {
  async getChurchDepartments(): Promise<import('../constants/departments').ChurchDepartment[]> { return DEFAULT_CHURCH_DEPARTMENTS; },
  async setChurchDepartments(departments: import('../constants/departments').ChurchDepartment[]): Promise<import('../constants/departments').ChurchDepartment[]> { return departments; },
  async getProgrammeRules(): Promise<import('../utils/programmeRules').ProgrammeRules> { return { ...DEFAULT_PROGRAMME_RULES }; },
  async setProgrammeRules(rules: import('../utils/programmeRules').ProgrammeRules): Promise<import('../utils/programmeRules').ProgrammeRules> { return rules; },
  async getRegistrationLink(): Promise<{ url: string }> {
    return { url: '' };
  },
  async setRegistrationLink(url: string): Promise<{ url: string }> {
    return { url };
  },
  async getSupportContact(): Promise<{ name: string; phone: string }> {
    return { name: 'Adetutu', phone: '2348184742850' };
  },
  async setSupportContact(contact: { name: string; phone: string }): Promise<{ name: string; phone: string }> {
    return contact;
  },
};

export const pushSubscriptionsApi = USE_SUPABASE ? supabasePushSubscriptionsApi : {
  async save(_userId: string, _subscription: PushSubscriptionJSON): Promise<void> {},
  async remove(_userId: string, _endpoint: string): Promise<void> {},
};

export const notificationSettingsApi = USE_SUPABASE ? supabaseNotificationSettingsApi : {
  async get(_userId?: string): Promise<{ remindBeforeMinutes: number[] }> { return { remindBeforeMinutes: [60] }; },
  async set(minutes: number[], _userId?: string): Promise<{ remindBeforeMinutes: number[] }> { return { remindBeforeMinutes: minutes }; },
};

export const announcementsApi = USE_SUPABASE ? supabaseAnnouncementsApi : {
  async send(_subject: string, _body: string, _sentBy: string, _options?: { scope?: 'ACTIVE_COHORT' | 'ALL_USERS'; cohortId?: string | null; targetLabelId?: string | null; targetGroupId?: string | null; targetHubId?: string | null; home?: { homeUntil: string; linkUrl?: string | null; linkLabel?: string | null } | null }): Promise<{ sent: number }> { return { sent: 0 }; },
  async delete(_announcementId: string): Promise<{ message: string }> { return { message: 'Not supported' }; },
  async removeFromHome(_announcementId: string): Promise<void> {},
  async getHistory(_options?: {
    cohortId?: string | null;
    userId?: string;
    isAdmin?: boolean;
    accessibleCohortIds?: string[];
  }): Promise<{ announcements: import('../types').Announcement[] }> { return { announcements: [] }; },
};

export const resourcesApi = USE_SUPABASE ? supabaseResourcesApi : {
  async getAll(): Promise<{ resources: import('../types').Resource[] }> { return { resources: [] }; },
  async addLink(_input: any): Promise<any> { return {}; },
  async uploadFile(_input: any): Promise<any> { return {}; },
  async delete(_id: string): Promise<void> {},
  async setVisibleToParticipants(_id: string, _visible: boolean): Promise<void> {},
  async getNewCount(_since?: string): Promise<number> { return 0; },
};

const peopleUnavailable = () => {
  throw new Error('This feature is only available in Supabase mode.');
};

export const participantsApi = USE_SUPABASE ? supabaseParticipantsApi : {
  async getById(_participantId: string): Promise<{ participant: import('../types').Participant | null }> { return { participant: null }; },
  async getAll(_options?: any): Promise<{ participants: import('../types').Participant[] }> { return { participants: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
  async createMany(_rows: any[]): Promise<never> { return peopleUnavailable(); },
  async importWithEnrich(_rows: any[], _cohortId: string | null, _existing: any[]): Promise<never> { return peopleUnavailable(); },
  async update(_id: string, _input: any): Promise<never> { return peopleUnavailable(); },
  async archive(_id: string): Promise<never> { return peopleUnavailable(); },
  async unarchive(_id: string): Promise<never> { return peopleUnavailable(); },
  async delete(_id: string): Promise<never> { return peopleUnavailable(); },
  async upsertFromFollowUpContact(_contact: any): Promise<never> { return peopleUnavailable(); },
  async ensureFromFollowUpContact(_contactId: string): Promise<never> { return peopleUnavailable(); },
};

export const groupsApi = USE_SUPABASE ? supabaseGroupsApi : {
  async getAll(_options?: any): Promise<{ groups: import('../types').Group[] }> { return { groups: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
  async update(_id: string, _input: any): Promise<never> { return peopleUnavailable(); },
  async archive(_id: string, _archivedById?: string | null): Promise<never> { return peopleUnavailable(); },
  async unarchive(_id: string): Promise<never> { return peopleUnavailable(); },
  async getParticipants(_groupId: string): Promise<{ participants: import('../types').Participant[] }> { return { participants: [] }; },
  async getForSupport(_userId: string): Promise<{ group: import('../types').Group | null }> { return { group: null }; },
  async setParticipants(_groupId: string, _ids: string[]): Promise<never> { return peopleUnavailable(); },
  async moveParticipant(_participantId: string, _toGroupId: string | null): Promise<never> { return peopleUnavailable(); },
  async bulkAssign(_assignments: Array<{ participantId: string; groupId: string }>): Promise<never> { return peopleUnavailable(); },
  async backfillTags(_cohortId: string): Promise<never> { return peopleUnavailable(); },
};

export const groupOnboardingStatusApi = USE_SUPABASE ? supabaseGroupOnboardingStatusApi : {
  async getForCohort(_cohortId: string): Promise<{ statuses: import('../types').GroupOnboardingStatus[] }> { return { statuses: [] }; },
  async getForSupport(_userId: string, _cohortId?: string): Promise<{ statuses: import('../types').GroupOnboardingStatus[] }> { return { statuses: [] }; },
  async update(_groupId: string, _patch: any, _actorId?: string | null): Promise<never> { return peopleUnavailable(); },
};

export const participantOnboardingStatusApi = USE_SUPABASE ? supabaseParticipantOnboardingStatusApi : {
  async getForCohort(_cohortId: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> { return { statuses: [] }; },
  async getForGroup(_groupId: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> { return { statuses: [] }; },
  async getForSupport(_userId: string, _cohortId?: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> { return { statuses: [] }; },
  async update(_participantId: string, _patch: any, _actorId?: string | null): Promise<never> { return peopleUnavailable(); },
};

export const onboardingEventsApi = USE_SUPABASE ? supabaseOnboardingEventsApi : {
  async getForCohort(_cohortId: string): Promise<{ events: import('../types').OnboardingEvent[] }> { return { events: [] }; },
  async getForSupport(_userId: string, _cohortId?: string): Promise<{ events: import('../types').OnboardingEvent[] }> { return { events: [] }; },
};

export const attendanceApi = USE_SUPABASE ? supabaseAttendanceApi : {
  async getSession(_weekId: number): Promise<{ session: import('../types').AttendanceSession | null }> { return { session: null }; },
  async getForWeeks(_options: { weekIds: number[]; participantIds: string[] }): Promise<{ records: import('../types').AttendanceRecord[] }> { return { records: [] }; },
  async getForWeek(_options: any): Promise<{ records: import('../types').AttendanceRecord[] }> { return { records: [] }; },
  async mark(_participantId: string, _weekId: number, _status: any): Promise<never> { return peopleUnavailable(); },
  async bulkMark(_entries: any[]): Promise<never> { return peopleUnavailable(); },
  async finalize(_weekId: number): Promise<never> { return peopleUnavailable(); },
  async setAutoFinalize(_weekId: number, _enabled: boolean): Promise<never> { return peopleUnavailable(); },
  async reopen(_weekId: number): Promise<never> { return peopleUnavailable(); },
  async startWindow(_weekId: number): Promise<never> { return peopleUnavailable(); },
  async excuseLateness(_recordId: string, _note: string): Promise<never> { return peopleUnavailable(); },
};

export const attendanceFollowUpTasksApi = USE_SUPABASE ? supabaseAttendanceFollowUpTasksApi : {
  async getForWeek(_weekId: number): Promise<{ tasks: import('../types').AttendanceFollowUpTask[] }> { return { tasks: [] }; },
  async getMine(_weekId: number, _supportId: string): Promise<{ tasks: import('../types').AttendanceFollowUpTask[] }> { return { tasks: [] }; },
  async setDone(_taskId: string, _done: boolean, _completionNote?: string): Promise<never> { return peopleUnavailable(); },
};

export const attendanceExcusalsApi = USE_SUPABASE ? supabaseAttendanceExcusalsApi : {
  async getForRecords(_recordIds: string[]): Promise<{ excusals: import('../types').AttendanceExcusal[] }> { return { excusals: [] }; },
};

export const supportHubsApi = USE_SUPABASE ? supabaseSupportHubsApi : {
  async getAll(_cohortId: string): Promise<{ hubs: import('../types').SupportHub[] }> { return { hubs: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
  async update(_hubId: string, _input: any): Promise<never> { return peopleUnavailable(); },
  async remove(_hubId: string): Promise<never> { return peopleUnavailable(); },
  async getMembershipsForCohort(_cohortId: string): Promise<{ memberships: import('../types').HubMembership[] }> { return { memberships: [] }; },
  async getMembers(_hubId: string): Promise<{ members: import('../types').User[] }> { return { members: [] }; },
  async setMembers(_hubId: string, _cohortId: string, _userIds: string[]): Promise<never> { return peopleUnavailable(); },
};

export const supportNotesApi = USE_SUPABASE ? supabaseSupportNotesApi : {
  async getForSupport(_supportId: string): Promise<{ notes: import('../types').SupportNote[] }> { return { notes: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
};

export const supportSessionsApi = USE_SUPABASE ? supabaseSupportSessionsApi : {
  async mark(_input: any): Promise<never> { return peopleUnavailable(); },
  async getForHubWeek(_hubId: string, _weekId: number): Promise<{ attendance: Array<{ userId: string; status: import('../types').SupportAttendanceStatus }> }> { return { attendance: [] }; },
};

export const myHubApi = USE_SUPABASE ? supabaseMyHubApi : {
  async get(_cohortId: string): Promise<import('../types').MyHubPayload> { return { hub: null, isLead: false, members: [], messages: [], myAttendance: [] }; },
  async postMessage(_hubId: string, _subject: string, _body: string): Promise<never> { return peopleUnavailable(); },
};

export const faithProjectsApi = USE_SUPABASE ? supabaseFaithProjectsApi : {
  async getByParticipant(_participantId: string): Promise<{ projects: import('../types').FaithProject[] }> { return { projects: [] }; },
  async getAll(_options?: any): Promise<{ projects: import('../types').FaithProject[] }> { return { projects: [] }; },
  async upsertForParticipant(_participantId: string, _input: any): Promise<never> { return peopleUnavailable(); },
  async reviewProject(_projectId: string, _input: any): Promise<never> { return peopleUnavailable(); },
  async delete(_id: string): Promise<never> { return peopleUnavailable(); },
};

export const faithProjectSettingsApi = USE_SUPABASE ? supabaseFaithProjectSettingsApi : {
  async get(_cohortId: string): Promise<{ settings: import('../types').FaithProjectSettings }> { return { settings: { cohortId: _cohortId, deadlineAt: null } }; },
  async set(_cohortId: string, _deadlineAt: string | null): Promise<never> { return peopleUnavailable(); },
};

export const faithProjectCategoriesApi = USE_SUPABASE ? supabaseFaithProjectCategoriesApi : {
  async getAll(_cohortId: string, _includeArchived?: boolean): Promise<{ categories: import('../types').FaithProjectCategory[] }> { return { categories: [] }; },
  async create(_cohortId: string, _name: string): Promise<never> { return peopleUnavailable(); },
  async archive(_categoryId: string): Promise<never> { return peopleUnavailable(); },
};

export const participantNotesApi = USE_SUPABASE ? supabaseParticipantNotesApi : {
  async getForParticipants(_participantIds: string[]): Promise<{ notes: import('../types').ParticipantNote[] }> { return { notes: [] }; },
  async getMeetingReports(_groupIds: string[]): Promise<{ notes: import('../types').ParticipantNote[] }> { return { notes: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
};

export const departmentReferralsApi = USE_SUPABASE ? supabaseDepartmentReferralsApi : {
  async getForParticipants(_participantIds: string[]): Promise<{ referrals: import('../types').DepartmentReferral[] }> { return { referrals: [] }; },
  async log(_input: any): Promise<never> { return peopleUnavailable(); },
  async setStatus(_id: string, _status: import('../types').DepartmentReferralStatus, _updatedById: string): Promise<never> { return peopleUnavailable(); },
};

export const participantStageChangesApi = USE_SUPABASE ? supabaseParticipantStageChangesApi : {
  async getForParticipant(_participantId: string): Promise<{ changes: import('../types').ParticipantStageChange[] }> { return { changes: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
};

export const faithThreadReadsApi = USE_SUPABASE ? supabaseFaithThreadReadsApi : {
  async getForUser(_userId: string): Promise<{ reads: Map<string, string> }> { return { reads: new Map() }; },
  async markRead(_userId: string, _participantId: string, _trail: 'coach' | 'office'): Promise<string> { return new Date().toISOString(); },
};

export const participantHandoversApi = USE_SUPABASE ? supabaseParticipantHandoversApi : {
  async getForParticipants(_participantIds: string[]): Promise<{ handovers: import('../types').ParticipantHandover[] }> { return { handovers: [] }; },
};

export const meetingAttendanceApi = USE_SUPABASE ? supabaseMeetingAttendanceApi : {
  async getForGroupWeek(_groupId: string, _weekId: number): Promise<{ records: import('../types').MeetingAttendance[] }> { return { records: [] }; },
  async getForWeeks(_weekIds: number[]): Promise<{ records: import('../types').MeetingAttendance[] }> { return { records: [] }; },
  async mark(_input: any): Promise<never> { return peopleUnavailable(); },
};

export const participantFlagsApi = USE_SUPABASE ? supabaseParticipantFlagsApi : {
  async getOpenForParticipants(_participantIds: string[]): Promise<{ flags: import('../types').ParticipantFlag[] }> { return { flags: [] }; },
  async getForParticipant(_participantId: string): Promise<{ flags: import('../types').ParticipantFlag[] }> { return { flags: [] }; },
  async getAll(_options?: { openOnly?: boolean }): Promise<{ flags: import('../types').ParticipantFlag[] }> { return { flags: [] }; },
  async raise(_input: any): Promise<never> { return peopleUnavailable(); },
  async clear(_flagId: string, _clearedById: string): Promise<never> { return peopleUnavailable(); },
};

export const supportChecklistApi = USE_SUPABASE ? supabaseSupportChecklistApi : {
  async getForWeek(_userId: string, _weekId: number): Promise<{ items: import('../types').SupportChecklistItem[] }> { return { items: [] }; },
  async add(_userId: string, _weekId: number, _label: string, _position: number): Promise<never> { return peopleUnavailable(); },
  async setDone(_itemId: string, _done: boolean): Promise<never> { return peopleUnavailable(); },
  async remove(_itemId: string): Promise<never> { return peopleUnavailable(); },
};

export const coverRequestsApi = USE_SUPABASE ? supabaseCoverRequestsApi : {
  async getMine(_supportId: string): Promise<{ requests: import('../types').CoverRequest[] }> { return { requests: [] }; },
  async getAll(_options?: { status?: import('../types').CoverRequestStatus }): Promise<{ requests: import('../types').CoverRequest[] }> { return { requests: [] }; },
  async create(_input: any): Promise<never> { return peopleUnavailable(); },
  async getActiveForCover(_coverSupportId: string): Promise<{ requests: import('../types').CoverRequest[] }> { return { requests: [] }; },
  async assign(_requestId: string, _coverSupportId: string, _assignedById: string): Promise<never> { return peopleUnavailable(); },
};

export const recapDocumentsApi = USE_SUPABASE ? supabaseRecapDocumentsApi : {
  async upload(_weekId: number, _file: File): Promise<never> { return peopleUnavailable(); },
  async remove(_weekId: number): Promise<never> { return peopleUnavailable(); },
};

export const groupPrayersApi = USE_SUPABASE ? supabaseGroupPrayersApi : {
  async getForCohort(_cohortId: string): Promise<{ prayers: import('../types').GroupPrayer[] }> { return { prayers: [] }; },
  async upsertForWeek(_cohortId: string, _weekId: number, _body: string, _createdById?: string): Promise<never> { return peopleUnavailable(); },
  async delete(_id: string): Promise<never> { return peopleUnavailable(); },
};

export const groupPrayerFocusApi = USE_SUPABASE ? supabaseGroupPrayerFocusApi : {
  async getForCohort(_cohortId: string): Promise<{ focuses: import('../types').GroupPrayerFocus[] }> { return { focuses: [] }; },
  async setFocus(_groupId: string, _weekId: number, _participantId: string, _setById?: string): Promise<never> { return peopleUnavailable(); },
  async clear(_groupId: string, _weekId: number): Promise<never> { return peopleUnavailable(); },
};

export const groupPrayerStatusApi = USE_SUPABASE ? supabaseGroupPrayerStatusApi : {
  async getForCohort(_cohortId: string): Promise<{ statuses: import('../types').GroupPrayerStatus[] }> { return { statuses: [] }; },
  async setDone(_groupId: string, _weekId: number, _done: boolean, _markedById?: string): Promise<never> { return peopleUnavailable(); },
};

export const hubApi = USE_SUPABASE ? supabaseHubApi : {
  async getLatestActivityAt(): Promise<string | null> { return null; },
  async getTopics(_status: 'OPEN' | 'CLOSED', _currentUserId?: string): Promise<{ topics: import('../types').HubTopic[] }> { return { topics: [] }; },
  async toggleReaction(_topicId: string, _userId: string): Promise<{ liked: boolean }> { return peopleUnavailable(); },
  async createTopic(_input: any): Promise<never> { return peopleUnavailable(); },
  async setTopicStatus(_topicId: string, _status: 'OPEN' | 'CLOSED'): Promise<never> { return peopleUnavailable(); },
  async getComments(_topicId: string): Promise<{ comments: import('../types').HubComment[] }> { return { comments: [] }; },
  async createComment(_input: any): Promise<never> { return peopleUnavailable(); },
  async getReplies(_commentId: string): Promise<{ replies: import('../types').HubReply[] }> { return { replies: [] }; },
  async createReply(_input: any): Promise<never> { return peopleUnavailable(); },
  async getUsers(): Promise<{ users: Array<{ id: string; name: string; avatarUrl?: string | null }> }> { return { users: [] }; },
  async sendNotifications(_entries: Array<{ userId: string; title: string; body: string; path: string }>): Promise<void> { return; },
  async deleteTopic(_topicId: string): Promise<void> { return; },
  async deleteComment(_commentId: string): Promise<void> { return; },
  async deleteReply(_replyId: string): Promise<void> { return; },
  async updateTopic(_topicId: string, _body: string): Promise<never> { return peopleUnavailable(); },
  async updateComment(_commentId: string, _body: string): Promise<never> { return peopleUnavailable(); },
  async updateReply(_replyId: string, _body: string): Promise<never> { return peopleUnavailable(); },
};

export const participantAccountsApi = USE_SUPABASE ? supabaseParticipantAccountsApi : {
  async getLoginDetails(_target: { participantId?: string | null; followUpContactId?: string | null }, _options?: { issue?: boolean; newCode?: boolean }): Promise<never> { return peopleUnavailable(); },
  async setOwnPassword(_newPassword: string): Promise<never> { return peopleUnavailable(); },
};

export const participantAppApi = USE_SUPABASE ? supabaseParticipantAppApi : {
  async getHome(): Promise<never> { return peopleUnavailable(); },
  async saveReflection(_weekId: number, _input: { stoodOut: string; goal: string; goalCheck: string }): Promise<never> { return peopleUnavailable(); },
  async setGoalDone(_weekId: number, _done: boolean): Promise<never> { return peopleUnavailable(); },
  async recordCheckIn(_response: import('../types').CheckInResponse, _misses: { sunday: number; meeting: number }, _participantName: string): Promise<never> { return peopleUnavailable(); },
  async getFaith(): Promise<never> { return peopleUnavailable(); },
  async saveFaithProject(_body: string, _submit: boolean, _participantName: string): Promise<never> { return peopleUnavailable(); },
  async saveReminders(_minutes: number[], _recapReleased: boolean): Promise<never> { return peopleUnavailable(); },
  async savePushSubscription(_subscription: PushSubscriptionJSON): Promise<never> { return peopleUnavailable(); },
  async uploadAvatar(_participantId: string, _file: File): Promise<never> { return peopleUnavailable(); },
  async saveProfile(_input: { email: string; gender: string; ageRange: string; occupation: string; dateOfBirth: string; answers: Record<string, string> }): Promise<never> { return peopleUnavailable(); },
  async changePassword(_current: string, _next: string): Promise<never> { return peopleUnavailable(); },
  async submitFeedback(_answers: import('../types').FeedbackAnswers): Promise<never> { return peopleUnavailable(); },
  async submitWrapUp(_input: { department: string; wantsReferral: boolean; note: string }, _participantName: string): Promise<never> { return peopleUnavailable(); },
};

export const feedbackApi = USE_SUPABASE ? supabaseFeedbackApi : {
  async getResults(_cohortId: string): Promise<never> { return peopleUnavailable(); },
};

export const participantPushApi = USE_SUPABASE ? supabaseParticipantPushApi : {
  async notify(_participantIds: string[], _title: string, _body: string, _path: string): Promise<void> { return; },
};

export const reflectionActivityApi = USE_SUPABASE ? supabaseReflectionActivityApi : {
  async getForCohort(_cohortId: string): Promise<{ activity: import('../types').ReflectionActivity[] }> { return { activity: [] }; },
};

export const recapReleasesApi = USE_SUPABASE ? supabaseRecapReleasesApi : {
  async get(_groupId: string, _weekId: number): Promise<{ release: import('../types').RecapRelease | null }> { return { release: null }; },
  async release(_groupId: string, _weekId: number, _userId: string): Promise<never> { return peopleUnavailable(); },
};

export const participantCheckInsApi = USE_SUPABASE ? supabaseParticipantCheckInsApi : {
  async getForParticipants(_participantIds: string[]): Promise<{ checkIns: import('../types').ParticipantCheckIn[] }> { return { checkIns: [] }; },
  async markHandled(_id: string, _userId: string): Promise<never> { return peopleUnavailable(); },
};

export const scripturesApi = USE_SUPABASE ? supabaseScripturesApi : {
  async getAll(): Promise<{ scriptures: import('../types').Scripture[] }> { return { scriptures: [] }; },
  async upload(_dayNumber: number, _image: Blob, _userId: string): Promise<never> { return peopleUnavailable(); },
  async remove(_scripture: import('../types').Scripture): Promise<void> { return; },
};

export const tourProgressApi = USE_SUPABASE ? supabaseTourProgressApi : {
  async getSeen(): Promise<string[]> { return []; },
  async markSeen(_key: string): Promise<void> { return; },
};

export const aiApi = USE_SUPABASE ? supabaseAiApi : {
  async getSummaryState(): Promise<never> { return peopleUnavailable(); },
  async setOptIn(_optIn: boolean): Promise<never> { return peopleUnavailable(); },
  async generateSummary(): Promise<never> { return peopleUnavailable(); },
  async draftRecap(_weekTitle: string, _notes: string): Promise<never> { return peopleUnavailable(); },
  async summariseFeedback(_cohortId: string): Promise<never> { return peopleUnavailable(); },
  async getFeedbackThemes(_cohortId: string): Promise<never> { return peopleUnavailable(); },
  async getSettings(): Promise<never> { return peopleUnavailable(); },
  async saveSettings(_settings: import('../types').AiSettings): Promise<never> { return peopleUnavailable(); },
};

export const profileFieldsApi = USE_SUPABASE ? supabaseProfileFieldsApi : {
  async getAll(): Promise<{ fields: import('../types').ProfileField[] }> { return { fields: [] }; },
  async create(_input: Omit<import('../types').ProfileField, 'id' | 'createdAt' | 'archivedAt'>, _createdById: string): Promise<never> { return peopleUnavailable(); },
  async archive(_id: string): Promise<void> { return; },
  async getSummary(): Promise<Map<string, { applies: number; answered: number }>> { return new Map(); },
  async getCohortCompletion(_cohortId: string): Promise<Map<string, import('../types').ProfileCompletion>> { return new Map(); },
  async getOverview(_participantId: string): Promise<never> { return peopleUnavailable(); },
};

export const formRegistrationsApi = USE_SUPABASE ? supabaseFormRegistrationsApi : {
  async getAll(_options?: any): Promise<{ registrations: import('./supabase-api').FormRegistration[] }> { return { registrations: [] }; },
};

export { SESSION_TOKEN_KEY };
export const getSessionToken = USE_SUPABASE ? supabaseGetSessionToken : () => '';

export default api;
