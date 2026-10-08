import { supabase, SESSION_TOKEN_KEY } from '../lib/supabase';
import { normaliseRules } from '../utils/programmeRules';
import { normaliseGroupingRules } from '../utils/groupingRules';
import { normaliseSavedDraft } from '../utils/groupingEngine';
import { normaliseRecapReleaseTimes } from '../utils/recapReleaseTimes';
import { normaliseClassFeedbackTimes } from '../utils/classFeedbackTimes';
import { normaliseClassStartTime } from '../utils/classStartTime';
import { notifyGroupMeetingChanged } from '../utils/meetingLiveEvents';
import { DEFAULT_CHURCH_DEPARTMENTS } from '../constants/departments';
import type {
  User,
  Cohort,
  Week,
  Activity,
  Label,
  SupportActivityCompletion,
  PendingChange,
  RejectedChange,
  AuthResponse
} from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';
import { normalizeToIntlPhone } from '../utils/phone';
import { resizeImageToJpeg } from '../utils/resizeImage';

// Types for API responses are now imported from ../types

// Current user session
const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getCurrentUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('user');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

// The database session token from sign_in. Private calls (participant data,
// login details) pass it so the database knows who is asking; the Supabase
// client also sends it as a header on every request. Defined next to that
// client so the storage key lives in one place.
export { SESSION_TOKEN_KEY };
export const getSessionToken = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SESSION_TOKEN_KEY) || '';
};

const getUserIdFromToken = (token: string, prefix: string): string | null => {
  if (!token || !token.startsWith(prefix)) {
    return null;
  }

  const userId = token.slice(prefix.length);
  return userId || null;
};

const mapWeekRow = (week: any): Week => {
  const sortedDays = (week.Day || []).sort((a: any, b: any) => DAY_ORDER.indexOf(a.dayName) - DAY_ORDER.indexOf(b.dayName));

  return {
    id: week.id,
    cohortId: week.cohortId,
    weekNumber: week.weekNumber,
    classDate: week.classDate ?? null,
    title: week.title ?? null,
    recapSummary: week.recapSummary ?? null,
    discussionPrompt: week.discussionPrompt ?? null,
    recapDocumentUrl: week.recapDocumentUrl ?? null,
    recapDocumentName: week.recapDocumentName ?? null,
    shareWithParticipants: week.shareWithParticipants ?? true,
    participantReleasedEarlyAt: week.participantReleasedEarlyAt ?? null,
    expectations: week.expectations ?? null,
    manualDocumentUrl: week.manualDocumentUrl ?? null,
    manualDocumentName: week.manualDocumentName ?? null,
    manualSummary: week.manualSummary ?? null,
    manualDiscussionPrompt: week.manualDiscussionPrompt ?? null,
    manualReleasedEarlyAt: week.manualReleasedEarlyAt ?? null,
    teenRecapSummary: week.teenRecapSummary ?? null,
    teenDiscussionPrompt: week.teenDiscussionPrompt ?? null,
    teenRecapDocumentUrl: week.teenRecapDocumentUrl ?? null,
    teenRecapDocumentName: week.teenRecapDocumentName ?? null,
    teenRecapReleaseAt: week.teenRecapReleaseAt ?? null,
    days: sortedDays.map((day: any) => ({
      id: day.id,
      weekId: day.weekId,
      dayName: day.dayName,
      activities: (day.Activity || []).map((activity: any) => ({
        id: activity.id,
        dayId: activity.dayId,
        time: activity.time,
        description: activity.description,
        period: activity.period,
        orderIndex: activity.orderIndex,
        day: {
          id: day.id,
          weekId: day.weekId,
          dayName: day.dayName,
        },
        labels: ((activity.ActivityLabel || []) as any[])
          .map((al: any) => al?.Label)
          .filter(Boolean)
          .map((l: any) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
          }) as Label),
      })),
    })),
  };
};

// Initialize session from Supabase
export const initializeAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Turn raw Postgres/Supabase errors into clear, human messages. Centralized so
// every caller (signup, admin add-user, profile edit) shows the same friendly
// wording instead of leaking strings like
// "duplicate key value violates unique constraint uniq_user_phone".
const friendlyUserError = (rawMessage: string | undefined, fallback: string): string => {
  const msg = (rawMessage || '').toLowerCase();
  if (msg.includes('uniq_user_phone') || (msg.includes('duplicate') && msg.includes('phone'))) {
    return 'That phone number is already registered to another account. Please use a different number, or check if the account already exists.';
  }
  if (msg.includes('user_email_key') || (msg.includes('duplicate') && msg.includes('email'))) {
    return 'That email address is already registered to another account. Please use a different email, or check if the account already exists.';
  }
  if (msg.includes('duplicate') || msg.includes('already exists')) {
    return 'An account with these details already exists. Please check if the person has already been added.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timed out') || msg.includes('aborted')) {
    return 'Connection problem. Please check your internet and try again.';
  }
  return fallback;
};

// Auth API using Supabase Auth
// Every column of "User" the app uses. password_hash is deliberately absent so a
// stolen anon key (or DevTools) can never read password material.
// "Sam (Admin)": a change made by someone who holds several roles while acting as Admin.
// The database fills the ActedAs value from the session; support-mode and single-role changes stay plain.
const withActedAs = (name: string | null, actedAs?: string | null): string | null =>
  (name && actedAs === 'ADMIN' ? `${name} (Admin)` : name);

const USER_SELECT = 'id, email, phone, name, role, roles, "isActive", "isTest", "deactivatedAt", "isCoordinator", "avatarUrl", "themeColor", "birthYear", "hubLastSeenAt", "whatsappGroupUrl", gender, "ageRange", birthday, "onboardingCompleted", "onboardingReplayCount", "onboardingLastReplayAt", "mustChangePassword", "createdAt", "updatedAt"';

export const authApi = {
  async login(identifier: string, password: string): Promise<AuthResponse> {
    // Verification happens in the database (sign_in checks staff, then
    // participants), so the password hash never reaches the browser. It also
    // returns a session token the database can check on private calls.
    const { data, error } = await supabase.rpc('sign_in', {
      identifier: identifier.trim(),
      password,
    });

    if (error) {
      throw new Error('Login service unavailable');
    }
    if (!data) {
      throw new Error('Invalid credentials');
    }

    const { token, user } = data as { token: string; user: User };
    return {
      user,
      accessToken: `mock_token_${user.id}`,
      refreshToken: `refresh_token_${user.id}`,
      sessionToken: token,
    };
  },

  async signOut(sessionToken: string): Promise<void> {
    await supabase.rpc('sign_out', { p_token: sessionToken });
  },

  async register(userData: {
    email?: string;
    phone?: string;
    name: string;
    password: string;
    role?: 'ADMIN' | 'SUPPORT'
  }): Promise<{ user: User }> {
    // The account and its hashed password are created together in the database,
    // so no password material is ever written from the browser. The session
    // token goes with it because the database only lets an admin create users.
    const { data, error } = await supabase.rpc('create_user', {
      p_token: getSessionToken(),
      p_name: userData.name,
      p_password: userData.password,
      p_email: userData.email ? userData.email.trim().toLowerCase() : null,
      p_phone: userData.phone ? userData.phone.trim() : null,
      p_role: userData.role || 'SUPPORT',
    });

    if (error) {
      if (error.message.includes('at least 8')) {
        throw new Error('Password must be at least 8 characters.');
      }
      if (error.message.includes('NOT_AUTHORISED')) {
        throw new Error('Only an admin can create accounts.');
      }
      throw new Error(friendlyUserError(error.message, 'Could not create the account. Please try again.'));
    }

    return { user: data as unknown as User };
  },

  async getMe(): Promise<{ user: User }> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot get current user outside browser context');
    }

    // Participants have no "User" row; the database resolves them from the session.
    if (getCurrentUserFromStorage()?.role === 'PARTICIPANT') {
      const { data, error } = await supabase.rpc('get_session_user', { p_token: getSessionToken() });
      if (error) {
        throw new Error('Login service unavailable');
      }
      if (!data) {
        throw new Error('User not found');
      }
      return { user: data as User };
    }

    const token = localStorage.getItem('accessToken') || '';
    const userId = getUserIdFromToken(token, 'mock_token_');

    if (!userId) {
      const cachedUser = getCurrentUserFromStorage();
      if (cachedUser && cachedUser.isActive !== false) {
        return { user: cachedUser };
      }
      throw new Error('No active session');
    }

    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    if ((data as any).isActive === false) {
      throw new Error('Account deactivated');
    }

    // The table holds the home role; the database knows which role this login is acting as.
    const me = data as unknown as User;
    const roles = (me.roles && me.roles.length > 0) ? me.roles : [me.role as 'ADMIN' | 'SUPPORT'];
    // Only people with several roles need the extra round trip; everyone else keeps their one role.
    if (roles.length < 2) return { user: { ...me, roles } };
    const { data: session } = await supabase.rpc('get_session_user', { p_token: getSessionToken() });
    const active = (session as { role?: User['role'] } | null)?.role;
    return { user: { ...me, role: active ?? me.role, roles } };
  },

  async switchRole(role: 'ADMIN' | 'SUPPORT'): Promise<User> {
    const { data, error } = await supabase.rpc('switch_my_role', { p_token: getSessionToken(), p_role: role });
    if (error || !data) throw new Error(error?.message?.includes('do not have') ? 'You do not have that role.' : 'Could not switch roles.');
    return data as unknown as User;
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const userId = getUserIdFromToken(refreshToken, 'refresh_token_');
    if (!userId) {
      throw new Error('Invalid refresh token');
    }

    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    if ((data as any).isActive === false) {
      throw new Error('Account deactivated');
    }

    return {
      user: data as unknown as User,
      accessToken: `mock_token_${(data as any).id}`,
      refreshToken: `refresh_token_${(data as any).id}`,
    };
  },
};

// Weeks API
export const weeksApi = {
  async getAll(cohortId?: string): Promise<{ weeks: Week[] }> {
    let query = supabase
      .from('Week')
      .select(`
        *,
        Day (
          *,
          Activity (
            *,
            ActivityLabel (
              Label (*)
            )
          )
        )
      `)
      .order('weekNumber');

    if (cohortId) {
      query = query.eq('cohortId', cohortId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const weeks: Week[] = (data || []).map((week: any) => mapWeekRow(week));

    return { weeks };
  },

  async getById(weekId: number, cohortId?: string): Promise<{ week: Week; pendingChanges: PendingChange[] }> {
    // Get week with days and activities
    let weekQuery = supabase
      .from('Week')
      .select(`
        *,
        Day (
          *,
          Activity (
            *,
            ActivityLabel (
              Label (*)
            )
          )
        )
      `)
      .eq('id', weekId);

    if (cohortId) {
      weekQuery = weekQuery.eq('cohortId', cohortId);
    }

    const { data: weekData, error: weekError } = await weekQuery.single();

    if (weekError) {
      throw new Error(weekError.message);
    }

    // Get pending changes for this week
    const { data: pendingChangesData, error: changesError } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User (id, name, email)
      `)
      .eq('weekId', weekId);

    if (changesError) {
      throw new Error(changesError.message);
    }

    const week: Week = mapWeekRow(weekData);

    // Transform pending changes data
    const pendingChanges = normalizePendingChanges((pendingChangesData || []) as unknown[]);

    return { week, pendingChanges };
  },

  async update(weekId: number, input: { title?: string | null; recapSummary?: string | null; discussionPrompt?: string | null; recapDocumentUrl?: string | null; recapDocumentName?: string | null; shareWithParticipants?: boolean; participantReleasedEarlyAt?: string | null; expectations?: string | null; manualSummary?: string | null; manualDiscussionPrompt?: string | null; manualDocumentUrl?: string | null; manualDocumentName?: string | null; manualReleasedEarlyAt?: string | null; teenRecapSummary?: string | null; teenDiscussionPrompt?: string | null; teenRecapReleaseAt?: string | null }): Promise<{ week: Week }> {
    const { data, error } = await supabase
      .from('Week')
      .update(input)
      .eq('id', weekId)
      .select(`
        *,
        Day (
          *,
          Activity (
            *,
            ActivityLabel (
              Label (*)
            )
          )
        )
      `)
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update week');
    }

    return { week: mapWeekRow(data) };
  },
};

export const cohortsApi = {
  async getCurrentProgrammeCohortId(): Promise<string | null> {
    const { data, error } = await supabase.rpc('current_programme_cohort_id');
    if (error) throw new Error(error.message);
    return data ? String(data) : null;
  },

  async getPeople(cohortId: string): Promise<import('../utils/programmeRules').CohortPeoplePayload> {
    const { data, error } = await supabase.rpc('cohort_people', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return data as import('../utils/programmeRules').CohortPeoplePayload;
  },

  async getHealth(cohortId: string): Promise<import('../components/dashboard/healthModel').CohortHealthPayload> {
    const [{ data, error }, first] = await Promise.all([
      supabase.rpc('cohort_health', { p_cohort_id: cohortId }),
      // When the cohort's first contact came in, for "open since …" on the funnel.
      supabase.from('FollowUpContact').select('createdAt').eq('cohortId', cohortId)
        .order('createdAt', { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const health = data as import('../components/dashboard/healthModel').CohortHealthPayload;
    if (health?.followUps) health.followUps.firstAt = (first.data as { createdAt?: string } | null)?.createdAt ?? null;
    return health;
  },

  async getAll(): Promise<{ cohorts: Cohort[] }> {
    const { data, error } = await supabase
      .from('Cohort')
      .select('*')
      .order('createdAt', { ascending: true });

    if (error) throw new Error(error.message);

    return {
      cohorts: ((data || []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        venue: row.venue,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        schedulePublished: row.schedulePublished ?? false,
        isPractice: row.isPractice ?? false,
        practiceOn: row.practiceOn ?? false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  },

  async createFromCurrent(input: {
    name: string;
    description?: string;
    venue?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    sourceCohortId: string;
  }): Promise<{ cohort: Cohort }> {
    const { data: cohortRow, error: cohortError } = await supabase
      .from('Cohort')
      .insert([{
        name: input.name,
        description: input.description || null,
        venue: input.venue || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        status: 'ACTIVE',
      }])
      .select('*')
      .single();

    if (cohortError || !cohortRow) {
      throw new Error(cohortError?.message || 'Failed to create cohort');
    }

    const sourceWeeksResponse = await weeksApi.getAll(input.sourceCohortId);
    for (const sourceWeek of sourceWeeksResponse.weeks) {
      const { data: newWeek, error: weekError } = await supabase
        .from('Week')
        .insert([{
          cohortId: cohortRow.id,
          weekNumber: sourceWeek.weekNumber,
          title: sourceWeek.title ?? null,
        }])
        .select('id')
        .single();

      if (weekError || !newWeek) {
        throw new Error(weekError?.message || `Failed to clone Week ${sourceWeek.weekNumber}`);
      }

      const dayIdMap = new Map<number, number>();
      for (const dayName of DAY_ORDER) {
        const sourceDay = sourceWeek.days.find((day) => day.dayName === dayName);
        const { data: newDay, error: dayError } = await supabase
          .from('Day')
          .insert([{
            weekId: (newWeek as any).id,
            dayName,
          }])
          .select('id')
          .single();

        if (dayError || !newDay) {
          throw new Error(dayError?.message || `Failed to clone ${dayName}`);
        }

        if (sourceDay) {
          dayIdMap.set(sourceDay.id, (newDay as any).id as number);
        }
      }

      for (const sourceDay of sourceWeek.days) {
        for (const activity of sourceDay.activities) {
          const clonedDayId = dayIdMap.get(sourceDay.id);
          if (!clonedDayId) continue;

          const { data: newActivity, error: activityError } = await supabase
            .from('Activity')
            .insert([{
              dayId: clonedDayId,
              time: activity.time,
              description: activity.description,
              period: activity.period,
              orderIndex: activity.orderIndex,
            }])
            .select('id')
            .single();

          if (activityError || !newActivity) {
            throw new Error(activityError?.message || `Failed to clone activity ${activity.description}`);
          }

          const labelIds = (activity.labels || []).map((label) => label.id);
          if (labelIds.length > 0) {
            const { error: labelJoinError } = await supabase
              .from('ActivityLabel')
              .insert(labelIds.map((labelId) => ({
                activityId: (newActivity as any).id as number,
                labelId,
              })));
            if (labelJoinError) {
              throw new Error(labelJoinError.message);
            }
          }
        }
      }
    }

    return {
      cohort: {
        id: cohortRow.id,
        name: cohortRow.name,
        description: cohortRow.description,
        venue: cohortRow.venue,
        startDate: cohortRow.startDate,
        endDate: cohortRow.endDate,
        status: cohortRow.status,
        createdAt: cohortRow.createdAt,
        updatedAt: cohortRow.updatedAt,
      },
    };
  },

  async update(cohortId: string, input: {
    name?: string;
    description?: string | null;
    venue?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
    schedulePublished?: boolean;
  }): Promise<{ cohort: Cohort }> {
    const { data, error } = await supabase
      .from('Cohort')
      .update({
        ...input,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', cohortId)
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update cohort');
    return { cohort: data as Cohort };
  },

  async addWeekAt(cohortId: string, weekNumber: number, options?: { duplicateFromWeekId?: number }): Promise<{ week: Week }> {
    const targetWeekNumber = Math.trunc(weekNumber);
    if (!Number.isFinite(targetWeekNumber) || targetWeekNumber < 1) {
      throw new Error('Week number must be 1 or higher.');
    }

    const { data: existingWeek, error: existingError } = await supabase
      .from('Week')
      .select('id')
      .eq('cohortId', cohortId)
      .eq('weekNumber', targetWeekNumber)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existingWeek) {
      throw new Error(`Week ${targetWeekNumber} already exists in this cohort.`);
    }

    const sourceWeek = options?.duplicateFromWeekId
      ? (await weeksApi.getById(options.duplicateFromWeekId, cohortId)).week
      : null;

    const { data: newWeek, error: weekError } = await supabase
      .from('Week')
      .insert([{
        cohortId,
        weekNumber: targetWeekNumber,
        title: sourceWeek?.title ?? null,
      }])
      .select('*')
      .single();

    if (weekError || !newWeek) throw new Error(weekError?.message || 'Failed to create week');

    const dayIdMap = new Map<number, number>();
    for (const dayName of DAY_ORDER) {
      const sourceDay = sourceWeek?.days.find((day) => day.dayName === dayName);
      const { data: newDay, error: dayError } = await supabase
        .from('Day')
        .insert([{
          weekId: (newWeek as any).id,
          dayName,
        }])
        .select('id')
        .single();

      if (dayError || !newDay) {
        throw new Error(dayError?.message || `Failed to create ${dayName}`);
      }

      if (sourceDay) {
        dayIdMap.set(sourceDay.id, (newDay as any).id as number);
      }
    }

    if (sourceWeek) {
      for (const sourceDay of sourceWeek.days) {
        const clonedDayId = dayIdMap.get(sourceDay.id);
        if (!clonedDayId) continue;

        for (const activity of sourceDay.activities) {
          const { data: newActivity, error: activityError } = await supabase
            .from('Activity')
            .insert([{
              dayId: clonedDayId,
              time: activity.time,
              description: activity.description,
              period: activity.period,
              orderIndex: activity.orderIndex,
            }])
            .select('id')
            .single();

          if (activityError || !newActivity) {
            throw new Error(activityError?.message || `Failed to duplicate activity ${activity.description}`);
          }

          const labelIds = (activity.labels || []).map((label) => label.id);
          if (labelIds.length > 0) {
            const { error: labelJoinError } = await supabase
              .from('ActivityLabel')
              .insert(labelIds.map((labelId) => ({
                activityId: (newActivity as any).id as number,
                labelId,
              })));
            if (labelJoinError) {
              throw new Error(labelJoinError.message);
            }
          }
        }
      }
    }

    return {
      week: (await weeksApi.getById((newWeek as any).id as number, cohortId)).week,
    };
  },

  async addWeek(cohortId: string): Promise<{ week: Week }> {
    const { data: latestWeeks, error: weeksError } = await supabase
      .from('Week')
      .select('weekNumber')
      .eq('cohortId', cohortId)
      .order('weekNumber', { ascending: false })
      .limit(1);

    if (weeksError) throw new Error(weeksError.message);

    const nextWeekNumber = (((latestWeeks || [])[0] as any)?.weekNumber as number | undefined || 0) + 1;
    return this.addWeekAt(cohortId, nextWeekNumber);
  },

  async deleteWeek(weekId: number): Promise<{ deletedWeekNumber: number; cohortId: string }> {
    const { data: week, error: weekError } = await supabase
      .from('Week')
      .select('id, cohortId, weekNumber')
      .eq('id', weekId)
      .single();

    if (weekError || !week) throw new Error(weekError?.message || 'Week not found.');

    const { count, error: countError } = await supabase
      .from('Week')
      .select('id', { count: 'exact', head: true })
      .eq('cohortId', (week as any).cohortId);

    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error('A cohort must keep at least one week.');
    }

    const { error: deleteError } = await supabase
      .from('Week')
      .delete()
      .eq('id', weekId);

    if (deleteError) throw new Error(deleteError.message);

    return {
      deletedWeekNumber: (week as any).weekNumber as number,
      cohortId: (week as any).cohortId as string,
    };
  },

  async deleteLatestWeek(cohortId: string): Promise<{ deletedWeekNumber: number }> {
    const { data: latestWeeks, error: weeksError } = await supabase
      .from('Week')
      .select('id, weekNumber')
      .eq('cohortId', cohortId)
      .order('weekNumber', { ascending: false })
      .limit(1);

    if (weeksError) throw new Error(weeksError.message);

    const latestWeek = (latestWeeks || [])[0] as { id: number; weekNumber: number } | undefined;
    if (!latestWeek) {
      throw new Error('No weeks found for this cohort.');
    }

    return this.deleteWeek(latestWeek.id);
  },

  async delete(cohortId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('Cohort')
      .delete()
      .eq('id', cohortId);

    if (error) throw new Error(error.message);

    return { message: 'Cohort deleted.' };
  },

  async getMembers(cohortId: string): Promise<{ users: User[] }> {
    const { data, error } = await supabase
      .from('UserCohort')
      .select(`userId, User(${USER_SELECT})`)
      .eq('cohortId', cohortId);

    if (error) throw new Error(error.message);

    return {
      users: ((data || []) as any[])
        .map((row) => row.User)
        .filter(Boolean)
        .map((member: any) => ({
          id: member.id,
          email: member.email,
          phone: member.phone,
          name: member.name,
          role: member.role,
          isActive: member.isActive,
          isTest: !!member.isTest,
          avatarUrl: member.avatarUrl ?? null,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
        }) as User),
    };
  },

  async setMembers(cohortId: string, userIds: string[]): Promise<{ message: string }> {
    // Only add/remove the rows that changed, so kept members keep their supportKind.
    const { data: existing, error: readError } = await supabase
      .from('UserCohort')
      .select('userId')
      .eq('cohortId', cohortId);

    if (readError) throw new Error(readError.message);

    const current = new Set(((existing || []) as any[]).map((row) => row.userId as string));
    const wanted = new Set(userIds);
    const toRemove = [...current].filter((id) => !wanted.has(id));
    const toAdd = userIds.filter((id) => !current.has(id));

    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('UserCohort')
        .delete()
        .eq('cohortId', cohortId)
        .in('userId', toRemove);

      if (deleteError) throw new Error(deleteError.message);
    }

    if (userIds.length === 0) return { message: 'Cohort members cleared' };
    if (toAdd.length === 0) return { message: 'Cohort members updated' };

    const { error: insertError } = await supabase
      .from('UserCohort')
      .insert(toAdd.map((userId) => ({ userId, cohortId })));

    if (insertError) throw new Error(insertError.message);
    return { message: 'Cohort members updated' };
  },
};

// Labels API
export const labelsApi = {
  async getAll(): Promise<{ labels: Label[] }> {
    const { data, error } = await supabase
      .from('Label')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    const labels = ((data || []) as any[])
      .map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }) as Label)
      // Ensure "Group 2" comes before "Group 10"
      .sort((a, b) => collator.compare(a.name, b.name));

    return { labels };
  },

  async create(input: { name: string; color: string }): Promise<{ label: Label }> {
    const { data, error } = await supabase
      .from('Label')
      .insert([{
        name: input.name,
        color: input.color,
      }])
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to create label');
    }

    return {
      label: {
        id: (data as any).id,
        name: (data as any).name,
        color: (data as any).color,
        createdAt: (data as any).createdAt,
        updatedAt: (data as any).updatedAt,
      },
    };
  },

  async update(labelId: string, input: { name: string; color: string }): Promise<{ label: Label }> {
    const { data, error } = await supabase
      .from('Label')
      .update({
        name: input.name,
        color: input.color,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', labelId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update label');
    }

    return {
      label: {
        id: (data as any).id,
        name: (data as any).name,
        color: (data as any).color,
        createdAt: (data as any).createdAt,
        updatedAt: (data as any).updatedAt,
      },
    };
  },

  async delete(labelId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('Label')
      .delete()
      .eq('id', labelId);

    if (error) {
      throw new Error(error.message);
    }

    return { message: 'Label deleted' };
  },
};

const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr));

const chunk = <T,>(arr: T[], size = 500): T[][] => {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const uniqNumbers = (arr: Array<number | undefined | null>): number[] => {
  const set = new Set<number>();
  for (const v of arr) {
    if (typeof v === 'number' && Number.isFinite(v)) set.add(v);
  }
  return Array.from(set);
};

const setActivityLabels = async (activityId: number, labelIds: string[] | undefined): Promise<void> => {
  const ids = uniq((labelIds || []).filter(Boolean));

  const { error: delError } = await supabase
    .from('ActivityLabel')
    .delete()
    .eq('activityId', activityId);
  if (delError) {
    throw new Error(delError.message);
  }

  if (ids.length === 0) return;

  const { error: insError } = await supabase
    .from('ActivityLabel')
    .insert(ids.map((labelId) => ({ activityId, labelId })));
  if (insError) {
    throw new Error(insError.message);
  }
};

const setActivityLabelsBulk = async (activityIds: number[], labelIds: string[]): Promise<void> => {
  const aIds = uniqNumbers(activityIds);
  const lIds = uniq((labelIds || []).filter(Boolean));

  if (aIds.length === 0) return;

  const { error: delError } = await supabase
    .from('ActivityLabel')
    .delete()
    .in('activityId', aIds);
  if (delError) throw new Error(delError.message);

  if (lIds.length === 0) return;

  const joinRows = aIds.flatMap((activityId) => lIds.map((labelId) => ({ activityId, labelId })));
  for (const batch of chunk(joinRows, 500)) {
    const { error: insError } = await supabase
      .from('ActivityLabel')
      .insert(batch);
    if (insError) throw new Error(insError.message);
  }
};

const resolveWeekRowsByNumbers = async (
  weekNumbers: number[]
): Promise<Array<{ id: number; weekNumber: number }>> => {
  const nums = uniqNumbers(weekNumbers);
  if (nums.length === 0) return [];
  const { data, error } = await supabase
    .from('Week')
    .select('id, weekNumber')
    .in('weekNumber', nums);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((w) => ({ id: w.id as number, weekNumber: w.weekNumber as number }));
};

const resolveDayRowsForWeeks = async (
  dayName: string,
  weekIds: number[]
): Promise<Array<{ id: number; weekId: number }>> => {
  const ids = uniqNumbers(weekIds);
  if (!dayName || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('Day')
    .select('id, weekId')
    .in('weekId', ids)
    .eq('dayName', dayName);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((d) => ({ id: d.id as number, weekId: d.weekId as number }));
};

const getMaxOrderIndexByDayId = async (dayIds: number[]): Promise<Record<number, number>> => {
  const ids = uniqNumbers(dayIds);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('Activity')
    .select('dayId, orderIndex')
    .in('dayId', ids);
  if (error) throw new Error(error.message);

  const maxByDay: Record<number, number> = {};
  for (const row of (data || []) as any[]) {
    const dayId = row.dayId as number;
    const oi = row.orderIndex as number;
    if (typeof dayId !== 'number' || typeof oi !== 'number') continue;
    maxByDay[dayId] = Math.max(maxByDay[dayId] ?? 0, oi);
  }
  return maxByDay;
};

const resolveDayIdsForWeekNumbers = async (dayName: string, weekNumbers: number[]): Promise<number[]> => {
  const weeks = await resolveWeekRowsByNumbers(weekNumbers);
  const weekIds = weeks.map((w) => w.id);
  const days = await resolveDayRowsForWeeks(dayName, weekIds);
  return days.map((d) => d.id);
};

// Activities API
export const activitiesApi = {
  async checkDuplicates(time: string, description: string, dayName: string): Promise<{ existingWeeks: number[] }> {
    const { data, error } = await supabase
      .from('Activity')
      .select(`
        *,
        Day!inner (
          dayName,
          Week!inner (weekNumber)
        )
      `)
      .eq('time', time)
      .eq('description', description)
      .eq('Day.dayName', dayName);

    if (error) {
      throw new Error(error.message);
    }

    const existingWeeks = data?.map(activity =>
      (activity.Day as any)?.Week?.weekNumber
    ).filter(Boolean) || [];

    return { existingWeeks };
  },

  /**
   * Replace the labels on a set of activities in one write. Used by the Rota page
   * to assign a duty for a week (pass one label id) or clear it (pass []).
   *
   * Deliberately separate from `update()`: that path also rewrites
   * time/description and is keyed off a single seed activity, neither of which
   * Rota wants. Note the replace semantics — every existing label on these
   * activities is removed first, which is what makes "clear" work, so callers
   * must show the user what will be lost.
   */
  async setLabelsForActivities(activityIds: number[], labelIds: string[]): Promise<{ updated: number }> {
    const ids = uniqNumbers(activityIds);
    if (ids.length === 0) return { updated: 0 };
    await setActivityLabelsBulk(ids, labelIds);
    return { updated: ids.length };
  },

  async create(activityData: {
    dayId: number;
    time: string;
    description: string;
    period: 'MORNING' | 'AFTERNOON' | 'EVENING';
    applyToWeeks?: number[];
    labelIds?: string[];
  }): Promise<{ activities: Activity[] }> {
    // If applyToWeeks is specified, create activities for multiple weeks (always include originating week).
    if (activityData.applyToWeeks && activityData.applyToWeeks.length > 0) {
      const { data: originalDay, error: originalDayError } = await supabase
        .from('Day')
        .select('dayName, weekId')
        .eq('id', activityData.dayId)
        .single();

      if (originalDayError || !originalDay) {
        throw new Error('Day not found');
      }

      const { data: originalWeek, error: originalWeekError } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', (originalDay as any).weekId)
        .single();

      const originalWeekNumber = !originalWeekError && originalWeek
        ? ((originalWeek as any).weekNumber as number)
        : undefined;

      const weeksToApply = uniqNumbers([
        ...(activityData.applyToWeeks || []),
        ...(typeof originalWeekNumber === 'number' ? [originalWeekNumber] : []),
      ]);

      // Fetch all target weeks + corresponding days in bulk
      const weekRows = await resolveWeekRowsByNumbers(weeksToApply);
      const dayRows = await resolveDayRowsForWeeks((originalDay as any).dayName as string, weekRows.map((w) => w.id));

      const dayIds = dayRows.map((d) => d.id);
      if (dayIds.length === 0) {
        throw new Error('No target days found for selected weeks/day');
      }

      const maxByDay = await getMaxOrderIndexByDayId(dayIds);
      const insertRows = dayIds.map((dayId) => ({
        dayId,
        time: activityData.time,
        description: activityData.description,
        period: activityData.period,
        orderIndex: (maxByDay[dayId] ?? 0) + 1,
      }));

      const { data: inserted, error: insError } = await supabase
        .from('Activity')
        .insert(insertRows)
        .select();

      if (insError) {
        throw new Error(insError.message);
      }

      const activities = (inserted || []) as Activity[];
      if (activities.length === 0) {
        throw new Error('No activities were created. Check that target weeks/days exist.');
      }

      // Labels: bulk insert join rows (no deletes needed for new activities).
      const labelIds = uniq((activityData.labelIds || []).filter(Boolean));
      if (labelIds.length > 0) {
        const joinRows = activities.flatMap((a: any) =>
          labelIds.map((labelId) => ({ activityId: (a as any).id as number, labelId }))
        );
        for (const batch of chunk(joinRows, 500)) {
          const { error: alErr } = await supabase
            .from('ActivityLabel')
            .insert(batch);
          if (alErr) {
            // Best-effort: activity create should still succeed even if label linking fails.
            console.warn('Failed to insert ActivityLabel batch:', alErr.message);
            break;
          }
        }
      }

      return { activities };
    } else {
      // Create single activity
      const { data: maxOrder } = await supabase
        .from('Activity')
        .select('orderIndex')
        .eq('dayId', activityData.dayId)
        .order('orderIndex', { ascending: false })
        .limit(1)
        .single();

      const nextOrderIndex = (maxOrder?.orderIndex || 0) + 1;

      const { data, error } = await supabase
        .from('Activity')
        .insert([{
          dayId: activityData.dayId,
          time: activityData.time,
          description: activityData.description,
          period: activityData.period,
          orderIndex: nextOrderIndex,
        }])
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      await setActivityLabels((data as any).id as number, activityData.labelIds);

      return { activities: [data] };
    }
  },

  async request(activityData: {
    dayId: number;
    time: string;
    description: string;
    period: 'MORNING' | 'AFTERNOON' | 'EVENING';
    applyToWeeks?: number[];
    userId?: string;
    labelIds?: string[];
    labelNames?: string[];
    dayName?: string;
  }): Promise<{ message: string; pendingChange: PendingChange }> {
    // Get the week ID from the day
    const { data: day, error: dayError } = await supabase
      .from('Day')
      .select('weekId, dayName')
      .eq('id', activityData.dayId)
      .single();

    if (dayError || !day) {
      throw new Error('Day not found');
    }

    const resolvedLabelNames = Array.isArray(activityData.labelNames)
      ? activityData.labelNames.filter(Boolean)
      : [];

    const changeDataPayload = {
      ...activityData,
      dayName: day.dayName,
      labelNames: resolvedLabelNames,
    };

    const { data, error } = await supabase
      .from('PendingChange')
      .insert([{
        weekId: day.weekId,
        changeType: 'ADD',
        changeData: changeDataPayload,
        userId: (() => {
          const resolved = activityData.userId || getCurrentUserFromStorage()?.id;
          if (!resolved) {
            throw new Error('No active user session (missing userId)');
          }
          return resolved;
        })(),
      }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      message: 'Change request submitted',
      pendingChange: data
    };
  },

  async update(activityId: number, updateData: {
    time: string;
    period?: 'MORNING' | 'AFTERNOON' | 'EVENING';
    description: string;
    applyToWeeks?: number[];
    oldTime?: string;
    oldDescription?: string;
    dayName?: string;
    labelIds?: string[];
  }): Promise<{ activities: Activity[] }> {
    const activities: Activity[] = [];

    // Fetch current activity first so we can match other weeks by old values.
    const { data: current, error: currentError } = await supabase
      .from('Activity')
      .select('id, dayId, time, description')
      .eq('id', activityId)
      .single();

    if (currentError || !current) {
      throw new Error(currentError?.message || 'Activity not found');
    }

    const matchTime = updateData.oldTime || (current as any).time;
    const matchDescription = updateData.oldDescription || (current as any).description;
    const periodToSave = updateData.period || ((current as any).period as 'MORNING' | 'AFTERNOON' | 'EVENING');

    // Always update the requested activity id first.
    const { data: updatedOriginal, error: updateError } = await supabase
      .from('Activity')
      .update({
        time: updateData.time,
        period: periodToSave,
        description: updateData.description,
      })
      .eq('id', activityId)
      .select()
      .single();

    if (updateError || !updatedOriginal) {
      throw new Error(updateError?.message || 'Failed to update activity');
    }

    if (Array.isArray(updateData.labelIds)) {
      await setActivityLabels((updatedOriginal as any).id as number, updateData.labelIds);
    }

    activities.push(updatedOriginal as Activity);

    if (updateData.applyToWeeks && updateData.applyToWeeks.length > 0) {
      const { data: dayRow, error: dayError } = await supabase
        .from('Day')
        .select('id, weekId, dayName')
        .eq('id', (current as any).dayId)
        .single();

      if (dayError || !dayRow) {
        throw new Error('Day not found for activity');
      }

      const resolvedDayName = updateData.dayName || ((dayRow as any).dayName as string);

      const { data: originalWeek, error: originalWeekError } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', (dayRow as any).weekId)
        .single();

      const originalWeekNumber = !originalWeekError && originalWeek
        ? ((originalWeek as any).weekNumber as number)
        : undefined;

      const weeksToApply = uniqNumbers(updateData.applyToWeeks)
        .filter((w) => (typeof originalWeekNumber === 'number' ? w !== originalWeekNumber : true));

      const targetDayIds = await resolveDayIdsForWeekNumbers(resolvedDayName, weeksToApply);
      if (targetDayIds.length > 0) {
        const { data: matches, error: matchesError } = await supabase
          .from('Activity')
          .select('id')
          .in('dayId', targetDayIds)
          .eq('time', matchTime)
          .eq('description', matchDescription);

        if (!matchesError && matches && matches.length > 0) {
          const ids = (matches as any[]).map((m) => m.id as number).filter((v) => typeof v === 'number');
          const { data: updatedRows, error: updError } = await supabase
            .from('Activity')
            .update({ time: updateData.time, period: periodToSave, description: updateData.description })
            .in('id', ids)
            .select();

          if (updError) {
            throw new Error(updError.message);
          }

          const updatedActs = (updatedRows || []) as Activity[];
          for (const ua of updatedActs) {
            activities.push(ua);
          }

          if (Array.isArray(updateData.labelIds)) {
            try {
              const crossIds = uniqNumbers(updatedActs.map((a: any) => (a as any).id as number));
              await setActivityLabelsBulk(crossIds, updateData.labelIds);
            } catch (labelError) {
              console.warn('Failed to set activity labels for updated activities (bulk):', labelError);
            }
          }
        }
      }
    }

    if (activities.length === 0) {
      throw new Error('No activities were updated');
    }

    return { activities };
  },

  async delete(activityId: number, deleteData: {
    applyToWeeks?: number[];
  }): Promise<{ deletedActivities: Activity[] }> {
    if (deleteData.applyToWeeks && deleteData.applyToWeeks.length > 0) {
      // Delete activities across multiple weeks (same dayName, time, description)
      const { data: activity, error: actError } = await supabase
        .from('Activity')
        .select('id, dayId, time, description')
        .eq('id', activityId)
        .single();

      if (actError || !activity) {
        throw new Error('Activity not found');
      }

      const { data: dayRow, error: dayError } = await supabase
        .from('Day')
        .select('dayName, weekId')
        .eq('id', (activity as any).dayId)
        .single();

      if (dayError || !dayRow) {
        throw new Error('Day not found for activity');
      }

      const { data: originalWeek, error: originalWeekError } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', (dayRow as any).weekId)
        .single();

      const originalWeekNumber = !originalWeekError && originalWeek
        ? ((originalWeek as any).weekNumber as number)
        : undefined;

      const weekNumbers = uniqNumbers([
        ...(deleteData.applyToWeeks || []),
        ...(typeof originalWeekNumber === 'number' ? [originalWeekNumber] : []),
      ]);

      const targetDayIds = await resolveDayIdsForWeekNumbers((dayRow as any).dayName as string, weekNumbers);
      if (targetDayIds.length === 0) {
        throw new Error('No target days found for selected weeks/day');
      }

      const { data: matches, error: matchesError } = await supabase
        .from('Activity')
        .select('id')
        .in('dayId', targetDayIds)
        .eq('time', (activity as any).time)
        .eq('description', (activity as any).description);

      if (matchesError) {
        throw new Error(matchesError.message);
      }

      const ids = ((matches || []) as any[]).map((m) => m.id as number).filter((v) => typeof v === 'number');
      if (ids.length === 0) {
        throw new Error('No activities were deleted');
      }

      const { data: deleted, error: delError } = await supabase
        .from('Activity')
        .delete()
        .in('id', ids)
        .select();

      if (delError) {
        throw new Error(delError.message);
      }

      const deletedActivities = (deleted || []) as Activity[];
      if (deletedActivities.length === 0) {
        throw new Error('No activities were deleted');
      }

      return { deletedActivities };
    } else {
      // Delete single activity
      const { data, error } = await supabase
        .from('Activity')
        .delete()
        .eq('id', activityId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('No activity was deleted');
      }

      return { deletedActivities: [data] };
    }
  },

  async reorder(activityId: number, newOrderIndex: number): Promise<{ activity: Activity }> {
    const { data, error } = await supabase
      .from('Activity')
      .update({ orderIndex: newOrderIndex })
      .eq('id', activityId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { activity: data };
  },
};

// Pending Changes API
export const pendingChangesApi = {
  async getAll(): Promise<{ pendingChanges: PendingChange[] }> {
    const { data, error } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User (id, name, email)
      `)
      .order('createdAt', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return {
      pendingChanges: normalizePendingChanges((data || []) as unknown[]),
    };
  },

  async getByWeek(weekId: number): Promise<{ pendingChanges: PendingChange[] }> {
    const { data, error } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User (id, name, email)
      `)
      .eq('weekId', weekId)
      .order('createdAt', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return {
      pendingChanges: normalizePendingChanges((data || []) as unknown[]),
    };
  },

  async create(changeData: {
    weekId: number;
    changeType: 'ADD' | 'EDIT' | 'DELETE';
    changeData: any;
    userId?: string;
  }): Promise<{ pendingChange: PendingChange }> {
    const { data, error } = await supabase
      .from('PendingChange')
      .insert([{
        ...changeData,
        userId: changeData.userId || 'current_user_id',
      }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { pendingChange: data };
  },

  async approve(changeId: string): Promise<{ message: string; results: any[]; approvedBy: string }> {
    // Get the pending change
    const { data: change, error: changeError } = await supabase
      .from('PendingChange')
      .select('*')
      .eq('id', changeId)
      .single();

    if (changeError || !change) {
      throw new Error('Pending change not found');
    }

    // Execute the change based on type
    let results: any[] = [];
    if (change.changeType === 'ADD') {
      const result = await activitiesApi.create(change.changeData);
      results = result.activities;
    } else if (change.changeType === 'EDIT') {
      const result = await activitiesApi.update(change.changeData.activityId, change.changeData);
      results = result.activities;
    } else if (change.changeType === 'DELETE') {
      const result = await activitiesApi.delete(change.changeData.activityId, change.changeData);
      results = result.deletedActivities;
    }

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Approval applied 0 changes. Pending request kept.');
    }

    const { error: deleteError } = await supabase
      .from('PendingChange')
      .delete()
      .eq('id', changeId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (change.userId) {
      void notifyScheduleChangeDecision(change, true);
    }

    return {
      message: 'Change approved and applied',
      results,
      approvedBy: 'Admin'
    };
  },

  async reject(changeId: string, rejectionReason: string): Promise<{ message: string; rejectedChange: RejectedChange }> {
    // Get the pending change
    const { data: change, error: changeError } = await supabase
      .from('PendingChange')
      .select('*')
      .eq('id', changeId)
      .single();

    if (changeError || !change) {
      throw new Error('Pending change not found');
    }

    // Create rejected change record
    const { data: rejectedChange, error: rejectError } = await supabase
      .from('RejectedChange')
      .insert([{
        weekId: change.weekId,
        changeType: change.changeType,
        changeData: change.changeData,
        userId: change.userId,
        submittedAt: change.createdAt,
        rejectedBy: 'Admin',
        rejectionReason,
      }])
      .select()
      .single();

    if (rejectError) {
      throw new Error(rejectError.message);
    }

    // Delete the pending change
    await supabase
      .from('PendingChange')
      .delete()
      .eq('id', changeId);

    if (change.userId) {
      void notifyScheduleChangeDecision(change, false, rejectionReason);
    }

    return {
      message: 'Change rejected',
      rejectedChange
    };
  },
};

// Rejected Changes API
export const rejectedChangesApi = {
  async getMine(): Promise<{ rejectedChanges: RejectedChange[]; unreadCount: number }> {
    const { data, error } = await supabase
      .from('RejectedChange')
      .select(`
        *,
        User (name, email)
      `)
      .eq('userId', 'current_user_id') // Replace with actual user ID
      .order('rejectedAt', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rejectedChanges = data || [];
    const unreadCount = rejectedChanges.filter(change => !change.isRead).length;

    return { rejectedChanges, unreadCount };
  },

  async markRead(changeId: string): Promise<{ message: string; rejectedChange: RejectedChange }> {
    const { data, error } = await supabase
      .from('RejectedChange')
      .update({ isRead: true })
      .eq('id', changeId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { message: 'Marked as read', rejectedChange: data };
  },

  async markAllRead(): Promise<{ message: string; updatedCount: number }> {
    const { data, error } = await supabase
      .from('RejectedChange')
      .update({ isRead: true })
      .eq('userId', 'current_user_id') // Replace with actual user ID
      .eq('isRead', false)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    return { message: 'All marked as read', updatedCount: data?.length || 0 };
  },
};

// In-app notification feed. Mirrors the push notifications written by the edge
// functions; scoped to the current user. (Unlike rejectedChangesApi, this
// resolves the real signed-in user id from storage — no placeholder.)
export const notificationsApi = {
  async getMine(): Promise<{ notifications: import('../types').Notification[]; unreadCount: number }> {
    const me = getCurrentUserFromStorage();
    if (!me?.id) return { notifications: [], unreadCount: 0 };
    // Through a checked function: the table itself is closed to the public key.
    const { data, error } = await supabase.rpc('my_notifications', { p_limit: 50 });
    if (error) throw new Error(error.message);
    const notifications = ((data ?? []) as import('../types').Notification[]);
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return { notifications, unreadCount };
  },
  async markAllRead(): Promise<{ updatedCount: number }> {
    const me = getCurrentUserFromStorage();
    if (!me?.id) return { updatedCount: 0 };
    const { data, error } = await supabase.rpc('mark_all_notifications_read');
    if (error) throw new Error(error.message);
    return { updatedCount: Number(data ?? 0) };
  },
  async markRead(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
    if (error) throw new Error(error.message);
  },
  // A phone push was tapped: its bell copy counts as read.
  async markTapped(title: string, body: string): Promise<void> {
    const { error } = await supabase.rpc('mark_notifications_read_by_content', { p_title: title, p_body: body });
    if (error) throw new Error(error.message);
  },
};

// App Settings API
export const settingsApi = {
  // Which FOF day the first Inspirational Scripture post (position 1) shows on.
  async getScriptureStartDay(): Promise<number> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'scripture_start_day')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data as any)?.value;
    return typeof value === 'number' && value > 0 ? value : 1;
  },

  async setScriptureStartDay(day: number): Promise<number> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: 'scripture_start_day',
          value: day,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return day;
  },

  // Whether participants see Inspirational Scriptures at all. A missing row
  // means on; participant_home returns no scriptures when this is false.
  async getScripturesEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'scriptures_enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as any)?.value !== false;
  },

  async setScripturesEnabled(enabled: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: 'scriptures_enabled',
          value: enabled,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return enabled;
  },

  // Whether anyone still unassigned 2 hours after they were added gets
  // auto-assigned to a same-gender support. Missing row means on.
  async getFollowUpAutoAssignEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'followup_auto_assign_enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as any)?.value !== false;
  },

  async setFollowUpAutoAssignEnabled(enabled: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{ settingKey: 'followup_auto_assign_enabled', value: enabled, updatedAt: new Date().toISOString() }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return enabled;
  },

  // Whether teens (18 and below) are looked after by Teen Supports. Missing row means off.
  async getTeenFlowEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'teen_flow_enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as any)?.value === true;
  },

  async setTeenFlowEnabled(enabled: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{ settingKey: 'teen_flow_enabled', value: enabled, updatedAt: new Date().toISOString() }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return enabled;
  },

  // Whether a support who hasn't moved anyone in 24 hours is asked if they are following
  // up, and their people are handed to an active support if they don't answer. Missing row means on.
  async getFollowUpAutoReassignEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'followup_auto_reassign_enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as any)?.value !== false;
  },
  async setFollowUpAutoReassignEnabled(enabled: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{ settingKey: 'followup_auto_reassign_enabled', value: enabled, updatedAt: new Date().toISOString() }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return enabled;
  },
  // Staged relaxation when no same-gender support has room: the person who added
  // them, then any active support, then (off by default) ignoring the limit.
  async getFollowUpRelax(): Promise<{ adder: boolean; anyGender: boolean; overLimit: boolean }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('settingKey, value')
      .in('settingKey', ['followup_relax_adder', 'followup_relax_any_gender', 'followup_relax_over_limit']);
    if (error) throw new Error(error.message);
    const byKey = new Map(((data as any[]) ?? []).map((row) => [row.settingKey, row.value]));
    return {
      adder: byKey.get('followup_relax_adder') !== false,
      anyGender: byKey.get('followup_relax_any_gender') !== false,
      overLimit: byKey.get('followup_relax_over_limit') === true,
    };
  },
  async setFollowUpRelax(step: 'adder' | 'anyGender' | 'overLimit', enabled: boolean): Promise<boolean> {
    const settingKey = step === 'adder' ? 'followup_relax_adder' : step === 'anyGender' ? 'followup_relax_any_gender' : 'followup_relax_over_limit';
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey, value: enabled, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return enabled;
  },
  // Whether admins get a reminder every 2 hours while someone is still
  // waiting to be assigned. Missing row means on.
  async getFollowUpAdminAlertsEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'followup_admin_alerts_enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as any)?.value !== false;
  },

  async setFollowUpAdminAlertsEnabled(enabled: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{ settingKey: 'followup_admin_alerts_enabled', value: enabled, updatedAt: new Date().toISOString() }],
        { onConflict: 'settingKey' }
      );
    if (error) throw new Error(error.message);
    return enabled;
  },

  async getRegistrationLink(): Promise<{ url: string }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'registration_link')
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const value = (data as any)?.value;
    return { url: typeof value === 'string' ? value : '' };
  },

  async setRegistrationLink(url: string): Promise<{ url: string }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: 'registration_link',
          value: url,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      )
      .select('value')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const value = (data as any)?.value;
    return { url: typeof value === 'string' ? value : '' };
  },

  // Mobilisation target: how many sign-ups a cohort is aiming for, shown on
  // Follow-ups → Overview. One key per cohort; null when none is set.
  async getMobilisationTarget(cohortId: string): Promise<{ target: number | null }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', `mobilisation_target_${cohortId}`)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const value = Number((data as any)?.value);
    return { target: Number.isFinite(value) && value > 0 ? value : null };
  },

  async setMobilisationTarget(cohortId: string, target: number): Promise<{ target: number | null }> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: `mobilisation_target_${cohortId}`,
          value: target,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      );

    if (error) {
      throw new Error(error.message);
    }

    return { target: target > 0 ? target : null };
  },

  // Supports allowed to mark trainings & get-togethers attendance (admin
  // picks them on the Attendance page). mark_support_attendance enforces it.
  async getTrainingMarkers(): Promise<{ userIds: string[] }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'training_markers')
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const value = (data as any)?.value;
    return { userIds: Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [] };
  },

  async setTrainingMarkers(userIds: string[]): Promise<{ userIds: string[] }> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: 'training_markers',
          value: userIds,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      );

    if (error) {
      throw new Error(error.message);
    }

    return { userIds };
  },

  // Support contact shown by the floating "Need Support" button. Stored as a
  // { name, phone } object so admins can change who help routes to without a
  // deploy. Falls back to a sensible default so the button always works.
  async getSupportContact(): Promise<{ name: string; phone: string }> {
    const fallback = { name: 'Adetutu', phone: '2348184742850' };
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'support_contact')
      .maybeSingle();

    if (error) {
      // Missing table/row should not break the UI — return the default.
      return fallback;
    }

    const value = (data as any)?.value;
    if (value && typeof value === 'object' && typeof value.phone === 'string' && value.phone.trim()) {
      return { name: typeof value.name === 'string' && value.name.trim() ? value.name : fallback.name, phone: value.phone };
    }
    return fallback;
  },

  // Who the ? button's "Message ..." goes to instead of the support contact:
  // the IT Support of the caller's hub (participants: their support's hub).
  // null = none applies, so the caller falls back to getSupportContact().
  // See my_help_contact in 20260928190000_followup_login_issues.sql.
  async getMyHelpContact(cohortId?: string | null): Promise<{ name: string; phone: string } | null> {
    const token = getSessionToken();
    if (!token) return null;
    const { data, error } = await supabase.rpc('my_help_contact', { p_token: token, p_cohort_id: cohortId ?? null });
    if (error || !data) return null;
    const value = data as { name?: string | null; phone?: string | null };
    if (typeof value.phone !== 'string' || !value.phone.trim()) return null;
    return { name: value.name?.trim() || 'IT Support', phone: value.phone };
  },

  async setSupportContact(contact: { name: string; phone: string }): Promise<{ name: string; phone: string }> {
    const payload = { name: contact.name.trim(), phone: contact.phone.trim() };
    const { error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: 'support_contact',
          value: payload,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      );

    if (error) {
      throw new Error(error.message);
    }

    return payload;
  },

  async getChurchDepartments(): Promise<import('../constants/departments').ChurchDepartment[]> {
    const { data, error } = await supabase.from('AppSetting').select('value').eq('settingKey', 'church_departments').maybeSingle();
    const value = error ? null : (data as any)?.value;
    if (!Array.isArray(value)) return DEFAULT_CHURCH_DEPARTMENTS;
    return value
      .filter((entry: any) => entry && typeof entry.name === 'string' && entry.name.trim())
      .map((entry: any) => ({ name: entry.name.trim(), description: typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : undefined }));
  },

  async setChurchDepartments(departments: import('../constants/departments').ChurchDepartment[]): Promise<import('../constants/departments').ChurchDepartment[]> {
    const seen = new Set<string>();
    const value = departments
      .map((d) => ({ name: d.name.trim(), ...(d.description?.trim() ? { description: d.description.trim() } : {}) }))
      .filter((d) => d.name && !seen.has(d.name.toLowerCase()) && seen.add(d.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    const { error } = await supabase.from('AppSetting')
      .upsert([{ settingKey: 'church_departments', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  async getProgrammeRules(): Promise<import('../utils/programmeRules').ProgrammeRules> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'programme_rules')
      .maybeSingle();
    // No row yet (or a read error) means the agreed defaults apply.
    return normaliseRules(error ? null : (data as any)?.value);
  },

  async setProgrammeRules(rules: import('../utils/programmeRules').ProgrammeRules): Promise<import('../utils/programmeRules').ProgrammeRules> {
    const value = normaliseRules(rules);
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'programme_rules', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  // Group-building engine rules, one key per cohort (Groups → New group → engine).
  async getGroupingRules(cohortId: string): Promise<import('../utils/groupingRules').GroupingRules> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', `grouping_rules_${cohortId}`)
      .maybeSingle();
    // No row yet (or a read error) means the defaults apply.
    return normaliseGroupingRules(error ? null : (data as any)?.value);
  },

  async setGroupingRules(cohortId: string, rules: import('../utils/groupingRules').GroupingRules): Promise<import('../utils/groupingRules').GroupingRules> {
    const value = normaliseGroupingRules(rules);
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: `grouping_rules_${cohortId}`, value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  // A build saved part-way in the group builder (one per cohort). Cleared by writing an empty object.
  async getGroupingDraft(cohortId: string): Promise<import('../utils/groupingEngine').SavedGroupingDraft | null> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', `grouping_draft_${cohortId}`)
      .maybeSingle();
    if (error) return null;
    return normaliseSavedDraft((data as any)?.value);
  },

  async setGroupingDraft(cohortId: string, draft: import('../utils/groupingEngine').SavedGroupingDraft | null): Promise<void> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: `grouping_draft_${cohortId}`, value: draft ?? {}, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
  },

  // When supports and participants get a week's recap (Settings > Programme > Timings).
  async getRecapReleaseTimes(): Promise<import('../utils/recapReleaseTimes').RecapReleaseTimes> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'recap_release_times')
      .maybeSingle();
    return normaliseRecapReleaseTimes(error ? null : (data as any)?.value);
  },

  async setRecapReleaseTimes(times: import('../utils/recapReleaseTimes').RecapReleaseTimes): Promise<import('../utils/recapReleaseTimes').RecapReleaseTimes> {
    const value = normaliseRecapReleaseTimes(times);
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'recap_release_times', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  // When supports and participants get asked about a week's class, and which
  // week the department prompt opens from (Settings > Programme > Timings).
  async getClassFeedbackTimes(): Promise<import('../utils/classFeedbackTimes').ClassFeedbackTimes> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'class_feedback_times')
      .maybeSingle();
    return normaliseClassFeedbackTimes(error ? null : (data as any)?.value);
  },

  async setClassFeedbackTimes(times: import('../utils/classFeedbackTimes').ClassFeedbackTimes): Promise<import('../utils/classFeedbackTimes').ClassFeedbackTimes> {
    const value = normaliseClassFeedbackTimes(times);
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'class_feedback_times', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  // Sunday class start time shown in the Sat/Sun participant nudges
  // (Settings > Programme > Timings).
  async getClassStartTime(): Promise<string> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'class_start_time')
      .maybeSingle();
    return normaliseClassStartTime(error ? null : (data as any)?.value);
  },

  async setClassStartTime(time: string): Promise<string> {
    const value = normaliseClassStartTime(time);
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'class_start_time', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return value;
  },

  // Public FOF landing page photos (Settings > Programme > Website photos).
  // Each is a public URL into the 'resources' bucket's landing/ prefix, or
  // null when that slot hasn't been set — the landing page falls back to a
  // gradient wherever a slot is null.
  async getLandingImages(): Promise<LandingImages> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'landing_images')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data as any)?.value || {};
    return {
      hero: typeof value.hero === 'string' ? value.hero : null,
      heroMobile: typeof value.heroMobile === 'string' ? value.heroMobile : null,
      group: typeof value.group === 'string' ? value.group : null,
      class: typeof value.class === 'string' ? value.class : null,
    };
  },

  async setLandingImages(images: LandingImages): Promise<LandingImages> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'landing_images', value: images, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return images;
  },

  // Every piece of editable copy on the public landing page (Settings >
  // Website). Stored as one JSON blob — LandingPage.tsx and the admin editor
  // both deep-merge this against DEFAULT_LANDING_CONTENT, so a missing/empty
  // row (or a partial one) always renders sensibly.
  async getLandingContent(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', 'landing_content')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data as any)?.value;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  },

  async setLandingContent(content: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'landing_content', value: content, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
    return content;
  },
};

// ---------------------------------------------------------------------------
// Public FOF landing page photo uploads (Settings > Programme > Website
// photos). Same bucket + client-resize-before-upload pattern as scripturesApi
// above, just without a DB row — the public URL is stored directly on the
// 'landing_images' AppSetting (see settingsApi.setLandingImages).
// ---------------------------------------------------------------------------

export interface LandingImages {
  hero: string | null;
  /** Tall photo for phones; the hero photo is used when this is empty. */
  heroMobile: string | null;
  group: string | null;
  class: string | null;
}

export const landingImagesApi = {
  async upload(slot: 'hero' | 'heroMobile' | 'group' | 'class', image: Blob): Promise<string> {
    const extension = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
    const path = `landing/${slot}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('resources').upload(path, image, { upsert: false, contentType: image.type || undefined });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    return data.publicUrl;
  },

  // Best-effort cleanup of the file a slot used to point at; never blocks the
  // AppSetting write that replaces or clears it.
  async removeByUrl(url: string | null): Promise<void> {
    if (!url) return;
    const marker = '/resources/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length);
    void supabase.storage.from('resources').remove([path]);
  },
};

const normalizeSupportCompletionError = (error: any): Error => {
  if ((error as any)?.code === '42P01' || error?.message?.includes('SupportActivityCompletion')) {
    return new Error('Support completion is not active in the database yet. Apply the latest Supabase migration to enable mark-done persistence.');
  }

  return new Error(error?.message || 'Support completion request failed.');
};

export const supportActivityCompletionsApi = {
  async getMineForWeek(weekId: number, userId: string): Promise<{ completions: SupportActivityCompletion[] }> {
    const { data: days, error: daysError } = await supabase
      .from('Day')
      .select('id')
      .eq('weekId', weekId);

    if (daysError) {
      throw new Error(daysError.message);
    }

    const dayIds = ((days || []) as Array<{ id: number }>).map((day) => day.id);
    if (dayIds.length === 0) {
      return { completions: [] };
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('Activity')
      .select('id')
      .in('dayId', dayIds);

    if (activitiesError) {
      throw new Error(activitiesError.message);
    }

    const activityIds = ((activities || []) as Array<{ id: number }>).map((activity) => activity.id);
    if (activityIds.length === 0) {
      return { completions: [] };
    }

    const { data, error } = await supabase
      .from('SupportActivityCompletion')
      .select('*')
      .eq('userId', userId)
      .in('activityId', activityIds);

    if (error) {
      throw normalizeSupportCompletionError(error);
    }

    return {
      completions: ((data || []) as any[]).map((row) => ({
        id: row.id,
        activityId: row.activityId,
        userId: row.userId,
        completedAt: row.completedAt,
      }) as SupportActivityCompletion),
    };
  },

  async getByWeek(weekId: number): Promise<{ completions: SupportActivityCompletion[] }> {
    const { data: days, error: daysError } = await supabase
      .from('Day')
      .select('id')
      .eq('weekId', weekId);

    if (daysError) {
      throw new Error(daysError.message);
    }

    const dayIds = ((days || []) as Array<{ id: number }>).map((day) => day.id);
    if (dayIds.length === 0) {
      return { completions: [] };
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('Activity')
      .select('id')
      .in('dayId', dayIds);

    if (activitiesError) {
      throw new Error(activitiesError.message);
    }

    const activityIds = ((activities || []) as Array<{ id: number }>).map((activity) => activity.id);
    if (activityIds.length === 0) {
      return { completions: [] };
    }

    const { data, error } = await supabase
      .from('SupportActivityCompletion')
      .select('*')
      .in('activityId', activityIds);

    if (error) {
      throw normalizeSupportCompletionError(error);
    }

    return {
      completions: ((data || []) as any[]).map((row) => ({
        id: row.id,
        activityId: row.activityId,
        userId: row.userId,
        completedAt: row.completedAt,
      }) as SupportActivityCompletion),
    };
  },

  async markDone(activityId: number, userId: string): Promise<{ completion: SupportActivityCompletion }> {
    const { data, error } = await supabase
      .from('SupportActivityCompletion')
      .upsert(
        [{
          activityId,
          userId,
          completedAt: new Date().toISOString(),
        }],
        { onConflict: 'activityId,userId' }
      )
      .select()
      .single();

    if (error || !data) {
      throw normalizeSupportCompletionError(error);
    }

    return {
      completion: {
        id: (data as any).id,
        activityId: (data as any).activityId,
        userId: (data as any).userId,
        completedAt: (data as any).completedAt,
      },
    };
  },

  async markUndone(activityId: number, userId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('SupportActivityCompletion')
      .delete()
      .eq('activityId', activityId)
      .eq('userId', userId);

    if (error) {
      throw normalizeSupportCompletionError(error);
    }

    return { message: 'Activity marked as not done' };
  },
};

// Users API
export const usersApi = {
  async getAll(options: { includeInactive?: boolean } = {}): Promise<{ users: User[] }> {
    let query = supabase
      .from('User')
      .select(USER_SELECT)
      .order('createdAt', { ascending: false });

    if (!options.includeInactive) {
      query = query.eq('isActive', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { users: data || [] };
  },

  async getById(userId: string): Promise<{ user: User }> {
    const { data, error } = await supabase
      .from('User')
      .select(USER_SELECT)
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { user: data };
  },

  async getUserLabels(userId: string): Promise<{ labels: Label[] }> {
    const { data, error } = await supabase
      .from('UserLabel')
      .select('Label(*)')
      .eq('userId', userId);

    if (error) throw new Error(error.message);

    const labels = ((data || []) as any[])
      .map((row: any) => row.Label)
      .filter(Boolean)
      .map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }) as Label);

    return { labels };
  },

  /**
   * Every label -> user pairing in one query, so callers can tell which labels are
   * unowned (nobody would be notified) or shared by several people. Fetched in one
   * go rather than per-user: the Rota grid needs the whole map up front.
   */
  async getLabelOwners(): Promise<{ owners: Array<{ labelId: string; user: Pick<User, 'id' | 'name'> }> }> {
    const { data, error } = await supabase
      .from('UserLabel')
      .select('labelId, User(id, name)');

    if (error) throw new Error(error.message);

    const owners = ((data || []) as any[])
      .filter((row: any) => row.labelId && row.User)
      .map((row: any) => ({
        labelId: row.labelId as string,
        user: { id: row.User.id as string, name: row.User.name as string },
      }));

    return { owners };
  },

  async getUserCohorts(userId: string): Promise<{ cohorts: Cohort[] }> {
    const { data, error } = await supabase
      .from('UserCohort')
      .select('Cohort(*)')
      .eq('userId', userId);

    if (error) throw new Error(error.message);

    return {
      cohorts: ((data || []) as any[])
        .map((row: any) => row.Cohort)
        .filter(Boolean)
        .map((cohort: any) => ({
          id: cohort.id,
          name: cohort.name,
          description: cohort.description,
          venue: cohort.venue,
          startDate: cohort.startDate,
          endDate: cohort.endDate,
          status: cohort.status,
          createdAt: cohort.createdAt,
          updatedAt: cohort.updatedAt,
        }) as Cohort),
    };
  },

  async setUserLabels(userId: string, labelIds: string[]): Promise<{ message: string }> {
    const { error: delError } = await supabase
      .from('UserLabel')
      .delete()
      .eq('userId', userId);

    if (delError) throw new Error(delError.message);

    if (labelIds.length === 0) return { message: 'Labels cleared' };

    const { error: insError } = await supabase
      .from('UserLabel')
      .insert(labelIds.map((labelId) => ({ userId, labelId })));

    if (insError) throw new Error(insError.message);

    return { message: 'Labels updated' };
  },

  async update(userId: string, updateData: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    password?: string;
    role?: 'ADMIN' | 'SUPPORT';
    roles?: Array<'ADMIN' | 'SUPPORT'>;
    isActive?: boolean;
    deactivatedAt?: string | null;
    isCoordinator?: boolean;
  }): Promise<{ user: User }> {
    const finalUpdateData: any = { ...updateData };

    // The password is hashed in the database (set_user_password); it is never
    // written from the browser. The role goes the same way (set_user_role),
    // because writing it straight to the table would let anyone holding the
    // anon key promote an account to ADMIN.
    const newPassword = updateData.password;
    delete finalUpdateData.password;
    const newRole = updateData.role;
    delete finalUpdateData.role;
    const newRoles = updateData.roles;
    delete finalUpdateData.roles;

    if (newPassword) {
      const { error: passwordError } = await supabase.rpc('set_user_password', {
        p_token: getSessionToken(),
        target_user: userId,
        new_password: newPassword,
        force_change: true,
      });
      if (passwordError) {
        if (passwordError.message.includes('NOT_AUTHORISED')) {
          throw new Error('Only an admin can change someone else’s password.');
        }
        throw new Error(passwordError.message.includes('at least 8')
          ? 'Password must be at least 8 characters.'
          : 'The password could not be updated.');
      }
    }

    let roleUser: User | null = null;
    if (newRole || (newRoles && newRoles.length > 0)) {
      const { data: roleData, error: roleError } = newRoles && newRoles.length > 0
        ? await supabase.rpc('set_user_roles', { p_token: getSessionToken(), target_user: userId, p_roles: newRoles })
        : await supabase.rpc('set_user_role', { p_token: getSessionToken(), target_user: userId, p_role: newRole });
      if (roleError) {
        if (roleError.message.includes('NOT_AUTHORISED')) {
          throw new Error('Only an admin can change a role.');
        }
        if (roleError.message.includes('CANNOT_DEMOTE_SELF')) {
          throw new Error('You cannot remove your own admin access.');
        }
        throw new Error(friendlyUserError(roleError.message, 'The role could not be changed.'));
      }
      roleUser = roleData as unknown as User;
    }

    // With the password and role handled above there may be nothing left to
    // write, and PostgREST rejects an empty patch.
    if (Object.keys(finalUpdateData).length === 0) {
      if (roleUser) return { user: roleUser };

      const { data: current, error: readError } = await supabase
        .from('User')
        .select(USER_SELECT)
        .eq('id', userId)
        .single();

      if (readError) {
        throw new Error(friendlyUserError(readError.message, 'Could not save the changes. Please try again.'));
      }

      return { user: current as unknown as User };
    }

    const { data, error } = await supabase
      .from('User')
      .update(finalUpdateData)
      .eq('id', userId)
      .select(USER_SELECT)
      .single();

    if (error) {
      throw new Error(friendlyUserError(error.message, 'Could not save the changes. Please try again.'));
    }

    return { user: data as unknown as User };
  },

  // Test accounts work normally but follow-up assignment and counts skip them.
  // Admins only, checked in the database (set_user_test).
  async setTest(userId: string, isTest: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_user_test', {
      p_token: getSessionToken(),
      target_user: userId,
      p_is_test: isTest,
    });
    if (error) {
      if (error.message.includes('NOT_AUTHORISED')) throw new Error('Only an admin can mark a test account.');
      throw new Error(friendlyUserError(error.message, 'Could not save the change. Please try again.'));
    }
  },

  // Admin-issued reset: the person must set their own password at next login.
  async resetPassword(userId: string, temporaryPassword: string): Promise<void> {
    const { error } = await supabase.rpc('set_user_password', {
      p_token: getSessionToken(),
      target_user: userId,
      new_password: temporaryPassword,
      force_change: true,
    });
    if (error) {
      if (error.message.includes('NOT_AUTHORISED')) {
        throw new Error('Only an admin can reset a password.');
      }
      throw new Error(error.message.includes('at least 8')
        ? 'Password must be at least 8 characters.'
        : 'The password could not be reset.');
    }
  },

  // Self-service change; the current password must be correct.
  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const { data, error } = await supabase.rpc('change_own_password', {
      target_user: userId,
      current_password: currentPassword,
      new_password: newPassword,
    });
    if (error) {
      throw new Error(error.message.includes('at least 8')
        ? 'Your new password must be at least 8 characters.'
        : 'The password could not be changed.');
    }
    if (data !== true) {
      throw new Error('Your current password is not correct.');
    }
  },

  async delete(userId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('User')
      .delete()
      .eq('id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return { message: 'User deleted successfully' };
  },

  async saveThemeColor(userId: string, color: string | null): Promise<void> {
    const { error } = await supabase.from('User').update({ themeColor: color, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  async saveWhatsappGroupUrl(userId: string, url: string | null): Promise<void> {
    const { error } = await supabase.from('User').update({ whatsappGroupUrl: url, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  async saveProfileDetails(userId: string, details: { gender: string | null; ageRange: string | null }): Promise<void> {
    const { error } = await supabase.from('User').update({ ...details, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  // Admin-only: last time this account used the app (to the hour). Null for anyone else.
  async getLastActive(userId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('user_last_active', { p_user_id: userId });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },

  /** Adds (or clears) the birth year; the database then sets the age range from it. Returns the resulting age range. */
  async saveBirthYear(userId: string, birthYear: number | null): Promise<{ ageRange: string | null }> {
    const { data, error } = await supabase.from('User').update({ birthYear, updatedAt: new Date().toISOString() }).eq('id', userId).select('ageRange').single();
    if (error) throw new Error(error.message);
    return { ageRange: (data as any)?.ageRange ?? null };
  },

  async saveBirthday(userId: string, birthday: string | null): Promise<void> {
    const { error } = await supabase.from('User').update({ birthday, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  // A support adding their own number (the same number they could have signed up with).
  async savePhone(userId: string, phone: string): Promise<void> {
    const { error } = await supabase.from('User').update({ phone, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (error) {
      if (error.code === '23505' || error.message.includes('uniq_user_phone')) throw new Error('This number is already used by another account.');
      throw new Error(error.message);
    }
  },

  async markHubSeen(userId: string): Promise<void> {
    const { error } = await supabase.from('User').update({ hubLastSeenAt: new Date().toISOString() }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  async uploadAvatar(userId: string, file: File): Promise<{ avatarUrl: string }> {
    // Resized to 640px JPEG at 0.85 quality client-side (utils/resizeImage). A new
    // filename per upload so phones don't keep showing the previous cached photo.
    const compressed = await resizeImageToJpeg(file);

    const path = `avatars/${userId}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    const { error: updateError } = await supabase.from('User').update({ avatarUrl, updatedAt: new Date().toISOString() }).eq('id', userId);
    if (updateError) throw new Error(updateError.message);

    return { avatarUrl };
  },
};

// Push Subscriptions API
export const pushSubscriptionsApi = {
  async save(userId: string, subscription: PushSubscriptionJSON): Promise<void> {
    const keys = subscription.keys as { p256dh: string; auth: string } | undefined;
    if (!subscription.endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid push subscription');
    }

    const { error } = await supabase
      .from('PushSubscription')
      .upsert([{
        userId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }], { onConflict: 'userId,endpoint' });

    if (error) throw new Error(error.message);
  },

  // Tells the server what this device is: on the Home Screen or in a browser, and
  // whether notifications are on. Returns what a browser tab can't know itself.
  async recordAppState(installed: boolean, device: string, notifications: string): Promise<{ installedBefore: boolean; sheetDismissed: number }> {
    const { data, error } = await supabase.rpc('record_user_app_state', { p_installed: installed, p_device: device, p_notifications: notifications });
    if (error) throw new Error(error.message);
    return data as { installedBefore: boolean; sheetDismissed: number };
  },
  async recordSetupSheet(action: 'shown' | 'dismissed'): Promise<void> {
    const { error } = await supabase.rpc('record_user_setup_sheet', { p_action: action });
    if (error) throw new Error(error.message);
  },
  // Admin: active staff who have never opened the app from their Home Screen.
  async listNotInstalledUserIds(): Promise<string[]> {
    const { data, error } = await supabase.rpc('users_without_app');
    if (error) return [];
    return (data as string[]) ?? [];
  },

  async remove(userId: string, endpoint: string): Promise<void> {
    const { error } = await supabase
      .from('PushSubscription')
      .delete()
      .eq('userId', userId)
      .eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
  },

  // Staff (userIds) who have at least one saved subscription — used for the
  // admin Users page's "No alerts" tag/filter (anyone active and not in this
  // set can't receive a push). Direct table read: PushSubscription's RLS is
  // already app_is_staff(), no new function needed.
  // Sends one test notification to the signed-in user's own saved devices, via
  // the same notify-users function as every other alert. Returns how many
  // devices it reached (0 = nothing saved for this account).
  async sendTest(userId: string): Promise<number> {
    const { data, error } = await supabase.functions.invoke('notify-users', {
      body: {
        userIds: [userId],
        title: 'Test notification',
        body: 'Notifications are working on this device.',
        path: '/profile',
        type: 'REMINDER',
      },
    });
    if (error) throw new Error(error.message);
    return Number((data as { sent?: number } | null)?.sent ?? 0);
  },

  async listSubscribedUserIds(): Promise<string[]> {
    const { data, error } = await supabase.from('PushSubscription').select('userId');
    if (error) throw new Error(error.message);
    return Array.from(new Set((data ?? []).map((row: { userId: string }) => row.userId)));
  },
};

// Reminder timings are PER USER, in "UserNotificationSetting".
//
// These used to read/write a single global AppSetting row, so one support
// changing their timings silently changed them for everyone. The settings UI
// lives on each support's own profile, so it has to be per-account.
//
// Default when a user has never saved: one reminder, an hour ahead. Deliberately
// quiet — extra reminders are opt-in rather than something users have to turn off.
export const DEFAULT_REMIND_BEFORE_MINUTES = [60];

const sanitizeMinutes = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const cleaned = [...new Set(value.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : null;
};

export const notificationSettingsApi = {
  async get(userId?: string): Promise<{ remindBeforeMinutes: number[] }> {
    if (!userId) return { remindBeforeMinutes: DEFAULT_REMIND_BEFORE_MINUTES };

    const { data, error } = await supabase
      .from('UserNotificationSetting')
      .select('remindBeforeMinutes')
      .eq('userId', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      remindBeforeMinutes:
        sanitizeMinutes((data as any)?.remindBeforeMinutes) ?? DEFAULT_REMIND_BEFORE_MINUTES,
    };
  },

  async set(minutes: number[], userId?: string): Promise<{ remindBeforeMinutes: number[] }> {
    if (!userId) throw new Error('Cannot save reminder settings without a signed-in user');

    // An empty selection means "no reminders", which must persist as an empty
    // list rather than silently falling back to the default.
    const cleaned = [...new Set(minutes.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
      .sort((a, b) => a - b);

    const { error } = await supabase
      .from('UserNotificationSetting')
      .upsert([{
        userId,
        remindBeforeMinutes: cleaned,
        updatedAt: new Date().toISOString(),
      }], { onConflict: 'userId' });

    if (error) throw new Error(error.message);

    return { remindBeforeMinutes: cleaned };
  },
};

// Supports: their participants who have signed in but still need the app (not installed, or alerts off).
export const appNudgeApi = {
  async mine(): Promise<import('../types').AppNudgePerson[]> {
    const { data, error } = await supabase.rpc('my_app_nudge', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    return (data as import('../types').AppNudgePerson[]) ?? [];
  },
  async markSent(participantId: string): Promise<string> {
    const { data, error } = await supabase.rpc('mark_app_nudge_sent', {
      p_token: getSessionToken(), p_participant_id: participantId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
};

// Announcement popups: shown until the person taps Got it. See 20261003130000_announcement_popups.sql.
export const announcementPopupsApi = {
  async pending(): Promise<import('../types').AnnouncementPopupItem[]> {
    const { data, error } = await supabase.rpc('announcement_popups_pending', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    return (data as import('../types').AnnouncementPopupItem[]) ?? [];
  },
  async acknowledge(announcementId: string): Promise<void> {
    const { error } = await supabase.rpc('announcement_popup_ack', { p_token: getSessionToken(), p_announcement: announcementId });
    if (error) throw new Error(error.message);
  },
  /** Admin: who has and has not acknowledged a popup. */
  async status(announcementId: string): Promise<import('../types').AnnouncementPopupStatus> {
    const { data, error } = await supabase.rpc('announcement_popup_status', { p_token: getSessionToken(), p_announcement: announcementId });
    if (error) throw new Error(error.message);
    return data as import('../types').AnnouncementPopupStatus;
  },
};

export const announcementsApi = {
  async send(
    subject: string,
    body: string,
    sentBy: string,
    options?: {
      scope?: 'ACTIVE_COHORT' | 'ALL_USERS';
      cohortId?: string | null;
      targetLabelId?: string | null;
      targetGroupId?: string | null;
      targetHubId?: string | null;
      targetHubJobs?: import('../types').HubJob[];
      targetUserId?: string | null;
      targetParticipantId?: string | null;
      home?: { homeUntil: string; homeLabel?: string | null; linkUrl?: string | null; linkLabel?: string | null } | null;
      audience?: import('../types').AnnouncementAudience;
      /** A popup each recipient must acknowledge. */
      popup?: boolean;
      /** A button on the popup when it is not also pinned to Home. */
      link?: { linkUrl: string; linkLabel?: string | null } | null;
    }
  ): Promise<{ sent: number }> {
    const { data, error } = await supabase.functions.invoke('send-announcement', {
      body: {
        subject,
        body,
        sentBy,
        scope: options?.scope || 'ACTIVE_COHORT',
        cohortId: options?.cohortId || null,
        targetLabelId: options?.targetLabelId || null,
        targetGroupId: options?.targetGroupId || null,
        targetHubId: options?.targetHubId || null,
        targetHubJobs: options?.targetHubJobs?.length ? options.targetHubJobs : null,
        targetUserId: options?.targetUserId || null,
        targetParticipantId: options?.targetParticipantId || null,
        audience: options?.audience || 'SUPPORTS',
        popup: !!options?.popup,
      },
    });
    if (error) throw new Error(error.message);
    const announcementId = (data as any)?.announcementId as string | undefined;
    if (options?.home && announcementId) {
      const { error: homeError } = await supabase.from('Announcement').update({
        showOnHome: true,
        homeUntil: options.home.homeUntil,
        homeLabel: options.home.homeLabel?.trim() || null,
        linkUrl: options.home.linkUrl?.trim() || null,
        linkLabel: options.home.linkUrl?.trim() ? (options.home.linkLabel?.trim() || 'Open') : null,
      }).eq('id', announcementId);
      if (homeError) throw new Error(homeError.message);
    }
    if (!options?.home && options?.link?.linkUrl?.trim() && announcementId) {
      const { error: linkError } = await supabase.from('Announcement').update({
        linkUrl: options.link.linkUrl.trim(),
        linkLabel: options.link.linkLabel?.trim() || 'Open',
      }).eq('id', announcementId);
      if (linkError) throw new Error(linkError.message);
    }
    return { sent: (data as any)?.sent ?? 0 };
  },

  async removeFromHome(announcementId: string): Promise<void> {
    const { error } = await supabase.from('Announcement').update({ showOnHome: false }).eq('id', announcementId);
    if (error) throw new Error(error.message);
  },

  async delete(announcementId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('Announcement')
      .delete()
      .eq('id', announcementId);

    if (error) throw new Error(error.message);

    return { message: 'Announcement deleted.' };
  },

  async getHistory(options?: {
    cohortId?: string | null;
    userId?: string;
    isAdmin?: boolean;
    accessibleCohortIds?: string[];
    userLabelIds?: string[];
  }): Promise<{ announcements: import('../types').Announcement[] }> {
    const { data, error } = await supabase
      .from('Announcement')
      .select(`
        *,
        Cohort (
          name
        )
      `)
      .order('sentAt', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    const allAnnouncements = ((data as any[]) ?? []).map((row: any) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      sentAt: row.sentAt,
      sentBy: row.sentBy,
      scope: row.scope,
      cohortId: row.cohortId,
      cohortName: row.Cohort?.name || null,
      targetLabelId: row.targetLabelId ?? null,
      targetGroupId: row.targetGroupId ?? null,
      targetHubId: row.targetHubId ?? null,
      targetUserId: row.targetUserId ?? null,
      targetParticipantId: row.targetParticipantId ?? null,
      showOnHome: !!row.showOnHome,
      homeUntil: row.homeUntil ?? null,
      linkUrl: row.linkUrl ?? null,
      linkLabel: row.linkLabel ?? null,
      homeLabel: row.homeLabel ?? null,
      requirePopup: !!row.requirePopup,
      audience: (row.audience ?? 'SUPPORTS') as import('../types').AnnouncementAudience,
    }));

    const isGlobal = (row: { scope?: string | null; cohortId?: string | null }) =>
      row.scope === 'ALL_USERS' || row.scope == null || row.cohortId == null;

    // A tag-targeted announcement is visible to admins (always) and to non-admins
    // only if they hold that tag. A person-targeted announcement (targetUserId)
    // is visible to admins and only to that user. A participant-targeted one
    // (targetParticipantId) never reaches this staff feed. Untargeted rows pass.
    const userLabelIds = new Set(options?.userLabelIds || []);
    const passesTarget = (row: { targetLabelId?: string | null; targetUserId?: string | null; targetParticipantId?: string | null }) => {
      if (options?.isAdmin) return true;
      if (row.targetParticipantId) return false;
      if (row.targetUserId) return row.targetUserId === options?.userId;
      if (!row.targetLabelId) return true;
      return userLabelIds.has(row.targetLabelId);
    };

    const announcements = allAnnouncements.filter((row) => {
      if (!passesTarget(row)) return false;
      // Participant-only announcements belong to the participant app.
      if (!options?.isAdmin && row.audience === 'PARTICIPANTS') return false;
      if (options?.isAdmin) {
        if (!options.cohortId) return true;
        return isGlobal(row) || row.cohortId === options.cohortId;
      }

      if (options?.cohortId) {
        return isGlobal(row) || row.cohortId === options.cohortId;
      }

      const accessibleIds = options?.accessibleCohortIds || [];
      if (accessibleIds.length > 0) {
        return isGlobal(row) || accessibleIds.includes(row.cohortId || '');
      }

      return isGlobal(row);
    });

    return {
      announcements,
    };
  },
};

export const resourcesApi = {
  async setVisibleToParticipants(id: string, visible: boolean): Promise<void> {
    const { error } = await supabase.from('Resource').update({ visibleToParticipants: visible }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getAll(): Promise<{ resources: import('../types').Resource[] }> {
    const { data, error } = await supabase
      .from('Resource')
      .select('*')
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { resources: (data as any[]) ?? [] };
  },

  async addLink(input: {
    title: string;
    description?: string;
    url: string;
    addedBy: string;
    audience?: import('../types').ResourceAudiencePayload;
  }): Promise<{ resource: import('../types').Resource }> {
    const { data, error } = await supabase
      .from('Resource')
      .insert([{
        title: input.title,
        description: input.description || null,
        type: 'link',
        url: input.url,
        addedBy: input.addedBy,
        ...(input.audience ?? {}),
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { resource: data as any };
  },

  // Puts a file in the resources bucket and says what kind of file it is.
  async uploadToBucket(file: File): Promise<{ url: string; type: import('../types').Resource['type']; fileName: string; fileSize: number }> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'file';
    const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(path, file, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path);
    const type = ['pdf'].includes(ext) ? 'pdf'
      : ['doc', 'docx'].includes(ext) ? 'doc'
      : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'image'
      : 'file';
    return { url: urlData.publicUrl, type, fileName: file.name, fileSize: file.size };
  },

  async uploadFile(input: {
    title: string;
    description?: string;
    file: File;
    addedBy: string;
    audience?: import('../types').ResourceAudiencePayload;
  }): Promise<{ resource: import('../types').Resource }> {
    const stored = await resourcesApi.uploadToBucket(input.file);
    const { data, error } = await supabase
      .from('Resource')
      .insert([{
        title: input.title,
        description: input.description || null,
        type: stored.type,
        url: stored.url,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        addedBy: input.addedBy,
        ...(input.audience ?? {}),
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { resource: data as any };
  },

  // Swap in a new file or link (the old one goes to the version history), and/or
  // change who sees it. With no file or link given, only the audience changes.
  async replaceDocument(resourceId: string, input: {
    file?: File | null;
    url?: string | null;
    note?: string;
    audience: import('../types').ResourceAudiencePayload;
  }): Promise<{ resource: import('../types').Resource }> {
    let type: string | null = null;
    let url: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;
    if (input.file) {
      const stored = await resourcesApi.uploadToBucket(input.file);
      ({ type, url, fileName, fileSize } = stored);
    } else if (input.url) {
      type = 'link';
      url = input.url;
    }
    const { data, error } = await supabase.rpc('resource_replace_document', {
      p_resource_id: resourceId,
      p_type: type,
      p_url: url,
      p_file_name: fileName,
      p_file_size: fileSize,
      p_note: input.note ?? null,
      p_visible_to_supports: input.audience.visibleToSupports,
      p_visible_to_participants: input.audience.visibleToParticipants,
      p_cohort_id: input.audience.cohortId,
      p_hub_ids: input.audience.hubIds,
    });
    if (error || !data) throw new Error(error?.message || 'Could not update the resource');
    return { resource: data as any };
  },

  async getVersions(resourceId: string): Promise<import('../types').ResourceVersions> {
    const { data, error } = await supabase.rpc('resource_versions', { p_resource_id: resourceId });
    if (error || !data) throw new Error(error?.message || 'Could not load the version history');
    return data as import('../types').ResourceVersions;
  },

  async delete(resourceId: string): Promise<void> {
    const { error } = await supabase.from('Resource').delete().eq('id', resourceId);
    if (error) throw new Error(error.message);
  },

  async getNewCount(since?: string): Promise<number> {
    let query = supabase.from('Resource').select('id', { count: 'exact', head: true });
    if (since) query = (query as any).gt('createdAt', since);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  },
};

// Auth token management (mock for now)
export const setAuthToken = (token: string) => {
  localStorage.setItem('accessToken', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem(SESSION_TOKEN_KEY);
};

// ---------------------------------------------------------------------------
// Participant app accounts
// ---------------------------------------------------------------------------

// Database errors raised by the account functions, turned into plain wording.
const accountError = (rawMessage: string | undefined, fallback: string): Error => {
  const msg = rawMessage || '';
  if (msg.includes('SESSION_EXPIRED')) return new Error('SESSION_EXPIRED');
  if (msg.includes('NOT_ALLOWED')) return new Error("You can only see login details for your own participants.");
  if (msg.includes('NO_PHONE')) return new Error('Add a valid phone number for this person first. It is their username.');
  if (msg.includes('NO_FORM_REGISTRATION')) return new Error('No registration form found for this person. They need to fill the form first.');
  if (msg.includes('at least 5')) return new Error('Use at least 5 characters.');
  return new Error(friendlyUserError(msg, fallback));
};

export const participantAccountsApi = {
  // Reads the login status; with issue=true creates the first-time code if none exists.
  async getLoginDetails(target: { participantId?: string | null; followUpContactId?: string | null }, options: { issue?: boolean; newCode?: boolean } = {}): Promise<import('../types').ParticipantLoginDetails> {
    const { data, error } = await supabase.rpc('participant_login_details', {
      p_token: getSessionToken(),
      p_participant_id: target.participantId ?? null,
      p_follow_up_contact_id: target.followUpContactId ?? null,
      p_issue: options.issue ?? false,
      p_new_code: options.newCode ?? false,
    });
    if (error) throw accountError(error.message, 'Could not load the login details. Please try again.');
    return data as import('../types').ParticipantLoginDetails;
  },

  // First sign-in: the participant swaps the code for their own password.
  async setOwnPassword(newPassword: string): Promise<{ user: User }> {
    const { data, error } = await supabase.rpc('set_participant_password', {
      p_token: getSessionToken(),
      p_new_password: newPassword,
    });
    if (error) throw accountError(error.message, 'Could not save your password. Please try again.');
    return { user: data as User };
  },
};


// Reflection and check-in errors raised by the database, in plain wording.
const participantAppError = (rawMessage: string | undefined, fallback: string): Error => {
  const msg = rawMessage || '';
  if (msg.includes('SESSION_EXPIRED')) return new Error('SESSION_EXPIRED');
  if (msg.includes('GOAL_REQUIRED')) return new Error('Write one thing you will do.');
  if (msg.includes('RECAP_NOT_RELEASED')) return new Error("This week's recap is not out yet.");
  if (msg.includes('REFLECTION_LOCKED')) return new Error('This reflection can no longer be changed.');
  if (msg.includes('FEEDBACK_RATING_REQUIRED')) return new Error('Choose how the programme is going.');
  if (msg.includes('INVALID_EMAIL')) return new Error('Enter a valid email address.');
  if (msg.includes('INVALID_DATE_OF_BIRTH')) return new Error('Enter a valid date of birth.');
  if (msg.includes('DEPARTMENT_REQUIRED')) return new Error('Choose a department.');
  if (msg.includes('PROJECT_REQUIRED')) return new Error('Write your project before submitting.');
  if (msg.includes('PROJECT_LOCKED')) return new Error('Your faith project is with your support right now.');
  if (msg.includes('at least 5')) return new Error('Use at least 5 characters.');
  return new Error(friendlyUserError(msg, fallback));
};

// The signed-in participant's own data. Every call carries their session token.
export const participantAppApi = {
  // Teens (18 and below, teen handling on) get a page explaining their Teen Support instead of the app.
  async getTeenInfo(): Promise<import('../types').ParticipantTeenInfo> {
    const { data, error } = await supabase.rpc('participant_teen_info', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your FOF space. Please try again.');
    return data as import('../types').ParticipantTeenInfo;
  },

  async getHome(): Promise<import('../types').ParticipantHome> {
    const { data, error } = await supabase.rpc('participant_home', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your FOF space. Please try again.');
    return data as import('../types').ParticipantHome;
  },

  // The People page: every active support/admin in their cohort, and their own group members.
  async getPeople(): Promise<import('../types').ParticipantPeople> {
    const { data, error } = await supabase.rpc('participant_people', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load people. Please try again.');
    return data as import('../types').ParticipantPeople;
  },

  // Pre-start "Get ready" steps (intro, people) already done, kept on the server.
  async getReadySteps(): Promise<string[]> {
    const { data, error } = await supabase.rpc('participant_ready_steps', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your steps.');
    return (data as string[] | null) ?? [];
  },
  async markReadyStep(step: 'intro' | 'people'): Promise<void> {
    const { error } = await supabase.rpc('participant_mark_ready_step', { p_token: getSessionToken(), p_step: step });
    if (error) throw participantAppError(error.message, 'Could not save your step.');
  },

  // Participant-led onboarding: the four steps, and the actions behind them.
  async getOnboardingState(): Promise<import('../types').OnboardingState> {
    const { data, error } = await supabase.rpc('participant_onboarding_state_self', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your steps.');
    return data as import('../types').OnboardingState;
  },
  async markIntroGuideRead(): Promise<void> {
    const { error } = await supabase.rpc('participant_mark_intro_guide_read', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not save your step.');
  },
  async confirmReady(): Promise<import('../types').OnboardingState> {
    const { data, error } = await supabase.rpc('participant_confirm_ready', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not save your step.');
    return data as import('../types').OnboardingState;
  },
  async discussionIntro(body: string): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_intro', { p_token: getSessionToken(), p_body: body });
    if (error) throw participantAppError(error.message, 'Could not post your introduction. Please try again.');
  },

  // Group Discussion: their own group only (null when not in a group yet).
  async discussionFeed(before?: string | null): Promise<import('../types').DiscussionFeed | null> {
    const { data, error } = await supabase.rpc('participant_discussion_feed', { p_token: getSessionToken(), p_before: before ?? null });
    if (error) throw participantAppError(error.message, 'Could not load the discussion. Please try again.');
    return (data as import('../types').DiscussionFeed | null) ?? null;
  },
  // Posts and replies by others since they last opened the Discussion tab (the orange dot).
  async discussionUnseen(): Promise<number> {
    const { data, error } = await supabase.rpc('participant_discussion_unseen', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not check the discussion.');
    return Number(data ?? 0);
  },
  async discussionMarkSeen(): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_mark_seen', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not update the discussion.');
  },
  async discussionPost(body: string, mentions: import('../types').DiscussionMention[] = []): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_post', { p_token: getSessionToken(), p_body: body, p_mentions: mentions.map(({ kind, id }) => ({ kind, id })) });
    if (error) throw participantAppError(error.message, 'Could not post. Please try again.');
  },
  async discussionReply(postId: string, body: string, mentions: import('../types').DiscussionMention[] = []): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_reply', { p_token: getSessionToken(), p_post_id: postId, p_body: body, p_mentions: mentions.map(({ kind, id }) => ({ kind, id })) });
    if (error) throw participantAppError(error.message, 'Could not reply. Please try again.');
  },
  async discussionLike(postId: string, like: boolean): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_like', { p_token: getSessionToken(), p_post_id: postId, p_like: like });
    if (error) throw participantAppError(error.message, 'Could not save your like.');
  },
  async discussionDelete(kind: 'POST' | 'REPLY', id: string): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_delete', { p_token: getSessionToken(), p_kind: kind, p_id: id });
    if (error) throw participantAppError(error.message, 'Could not delete. Please try again.');
  },
  async discussionReport(postId: string, reason: import('../types').DiscussionReportReason): Promise<void> {
    const { error } = await supabase.rpc('participant_discussion_report', { p_token: getSessionToken(), p_post_id: postId, p_reason: reason });
    if (error) throw participantAppError(error.message, 'Could not send your report. Please try again.');
  },

  async saveReflection(weekId: number, input: { stoodOut: string; goal: string; goalCheck: string }): Promise<import('../types').ParticipantReflection> {
    const { data, error } = await supabase.rpc('save_reflection', {
      p_token: getSessionToken(),
      p_week_id: weekId,
      p_stood_out: input.stoodOut,
      p_goal: input.goal,
      p_goal_check: input.goalCheck,
    });
    if (error) throw participantAppError(error.message, 'Could not save your reflection. Please try again.');
    return data as import('../types').ParticipantReflection;
  },

  async setGoalDone(weekId: number, done: boolean): Promise<import('../types').ParticipantReflection> {
    const { data, error } = await supabase.rpc('set_reflection_goal_done', { p_token: getSessionToken(), p_week_id: weekId, p_done: done });
    if (error) throw participantAppError(error.message, 'Could not update your goal. Please try again.');
    return data as import('../types').ParticipantReflection;
  },

  // Same instant-notify pattern as submitTestimony: bell + push straight to
  // the participant's support, plus notifyAdmins, right after the RPC returns.
  async askManualQuestion(weekId: number, body: string, weekNumber: number, participantName: string): Promise<import('../types').ParticipantManualQuestion> {
    const { data, error } = await supabase.rpc('ask_manual_question', { p_token: getSessionToken(), p_week_id: weekId, p_body: body });
    if (error) throw participantAppError(error.message, 'Could not send your question. Please try again.');
    const result = data as import('../types').ParticipantManualQuestion & { supportId?: string | null; isPractice?: boolean };
    if (result.supportId) {
      void notify(
        { userIds: [result.supportId] },
        `${participantName} asked a question`,
        `About Week ${weekNumber}'s class manual.`,
        '/support/recap',
        'MANUAL_QUESTION',
      );
    }
    // A Practice question stays with the person testing; a real one also goes to every admin
    // (except the group's support, who already has the support alert).
    if (!result.isPractice) {
      void notify(
        { role: 'ADMIN', excludeUserId: result.supportId ?? undefined },
        `${participantName} asked a question`,
        `About Week ${weekNumber}'s class manual.`,
        '/feedback?tab=manual',
        'MANUAL_QUESTION',
      );
    }
    return { id: result.id, body: result.body, status: result.status, reply: result.reply, createdAt: result.createdAt };
  },

  async saveManualNote(weekId: number, body: string): Promise<{ weekId: number; body: string; updatedAt: string }> {
    const { data, error } = await supabase.rpc('save_manual_note', { p_token: getSessionToken(), p_week_id: weekId, p_body: body });
    if (error) throw participantAppError(error.message, 'Could not save your note. Please try again.');
    return data as { weekId: number; body: string; updatedAt: string };
  },

  async getFaith(): Promise<import('../types').ParticipantFaith> {
    const { data, error } = await supabase.rpc('participant_faith', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your faith project.');
    return data as import('../types').ParticipantFaith;
  },

  async markFaithRead(): Promise<void> {
    const { error } = await supabase.rpc('mark_participant_faith_read', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not mark the reply as read.');
  },

  async saveFaithProject(body: string, submit: boolean, participantName: string): Promise<NonNullable<import('../types').ParticipantFaith['project']>> {
    const { data, error } = await supabase.rpc('save_faith_project', { p_token: getSessionToken(), p_body: body, p_submit: submit });
    if (error) throw participantAppError(error.message, 'Could not save your faith project.');
    const result = data as { project: NonNullable<import('../types').ParticipantFaith['project']>; supportId: string | null };
    if (submit && result.supportId) {
      void notify(
        { userIds: [result.supportId] },
        `${participantName} sent their faith project`,
        'It is waiting for you to review in My Group.',
        '/support/participants',
        'FAITH_PROJECT_SUBMITTED',
      );
    }
    return result.project;
  },

  // "Is it going well?" -- returns the support's userId so the caller can
  // push+bell them when the participant asked to be contacted.
  async submitFaithHelpRequest(input: { reason: import('../types').FaithHelpReason; note: string; wantsContact: boolean }, participantName: string): Promise<void> {
    const { data, error } = await supabase.rpc('submit_faith_help_request', {
      p_token: getSessionToken(),
      p_reason: input.reason,
      p_note: input.note,
      p_wants_contact: input.wantsContact,
    });
    if (error) throw participantAppError(error.message, 'Could not send that. Please try again.');
    const supportId = (data as { supportId: string | null } | null)?.supportId;
    if (input.wantsContact && supportId) {
      void notify(
        { userIds: [supportId] },
        `${participantName} is not finding their faith project easy right now`,
        'They asked you to reach out. Open their card in My Group for what they shared.',
        '/support/participants',
        'FAITH_HELP',
      );
    }
  },

  async setPrayerShare(shared: boolean): Promise<{ id: string; sharedForPrayer: boolean }> {
    const { data, error } = await supabase.rpc('set_faith_project_prayer_share', { p_token: getSessionToken(), p_shared: shared });
    if (error || !data) throw participantAppError(error?.message, 'Could not save that. Please try again.');
    return data as { id: string; sharedForPrayer: boolean };
  },

  async getTestimonies(): Promise<{ mine: import('../types').ParticipantTestimony[]; feed: import('../types').TestimonyFeedItem[] }> {
    const { data, error } = await supabase.rpc('participant_testimonies', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load testimonies.');
    return data as { mine: import('../types').ParticipantTestimony[]; feed: import('../types').TestimonyFeedItem[] };
  },

  async submitTestimony(input: { title: string; body: string; visibility: import('../types').TestimonyVisibility }, participantName: string): Promise<import('../types').ParticipantTestimony> {
    const { data, error } = await supabase.rpc('submit_testimony', {
      p_token: getSessionToken(),
      p_title: input.title,
      p_body: input.body,
      p_visibility: input.visibility,
    });
    if (error) throw participantAppError(error.message, 'Could not save your testimony.');
    const result = data as import('../types').ParticipantTestimony & { supportId?: string | null };
    if (result.status === 'PENDING') {
      void notifyAdmins(
        'A testimony is waiting for approval',
        `${participantName} shared a testimony with their ${input.visibility === 'COHORT' ? 'cohort' : 'group'}.`,
        '/faith-projects?tab=testimonies',
        'TESTIMONY',
      );
    } else if (result.status === 'APPROVED' && input.visibility === 'SUPPORT' && result.supportId) {
      // "Just my support" is born APPROVED -- no admin review, so this is the
      // only alert. Same mechanism as FAITH_HELP: notify() straight to the
      // support's userId, path opens their card in My Group.
      void notify(
        { userIds: [result.supportId] },
        `${participantName} shared a testimony with you`,
        'Open their card in My Group to read it.',
        '/support/participants',
        'TESTIMONY',
      );
    }
    return { id: result.id, title: result.title, body: result.body, visibility: result.visibility, status: result.status, createdAt: result.createdAt, updatedAt: result.updatedAt };
  },

  async updateTestimony(id: string, input: { title: string; body: string; visibility: import('../types').TestimonyVisibility }, participantName: string): Promise<import('../types').ParticipantTestimony> {
    const { data, error } = await supabase.rpc('update_testimony', {
      p_token: getSessionToken(),
      p_id: id,
      p_title: input.title,
      p_body: input.body,
      p_visibility: input.visibility,
    });
    if (error) throw participantAppError(error.message, 'Could not save your testimony.');
    const result = data as import('../types').ParticipantTestimony & { supportId?: string | null };
    if (result.status === 'PENDING') {
      void notifyAdmins(
        'A testimony is waiting for approval',
        `${participantName} shared a testimony with their ${input.visibility === 'COHORT' ? 'cohort' : 'group'}.`,
        '/faith-projects?tab=testimonies',
        'TESTIMONY',
      );
    } else if (result.status === 'APPROVED' && input.visibility === 'SUPPORT' && result.supportId) {
      void notify(
        { userIds: [result.supportId] },
        `${participantName} shared a testimony with you`,
        'Open their card in My Group to read it.',
        '/support/participants',
        'TESTIMONY',
      );
    }
    return { id: result.id, title: result.title, body: result.body, visibility: result.visibility, status: result.status, createdAt: result.createdAt, updatedAt: result.updatedAt };
  },

  async deleteTestimony(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_testimony', { p_token: getSessionToken(), p_id: id });
    if (error) throw participantAppError(error.message, 'Could not delete your testimony.');
  },

  async saveReminders(meetingRemindMinutes: number[], recapReleased: boolean): Promise<void> {
    const { error } = await supabase.rpc('save_participant_reminders', {
      p_token: getSessionToken(),
      p_meeting_minutes: meetingRemindMinutes,
      p_recap_released: recapReleased,
    });
    if (error) throw participantAppError(error.message, 'Could not save your reminders.');
  },

  // Tells the server what this device is: on the Home Screen or in a browser, and
  // whether notifications are on. Returns what a browser tab can't know itself.
  async recordAppState(installed: boolean, device: string, notifications: string): Promise<{ installedBefore: boolean; sheetDismissed: number }> {
    const { data, error } = await supabase.rpc('record_participant_app_state', {
      p_token: getSessionToken(), p_installed: installed, p_device: device, p_notifications: notifications,
    });
    if (error) throw participantAppError(error.message, 'Could not save app status.');
    return data as { installedBefore: boolean; sheetDismissed: number };
  },
  async recordSetupSheet(action: 'shown' | 'dismissed'): Promise<void> {
    const { error } = await supabase.rpc('record_participant_setup_sheet', { p_token: getSessionToken(), p_action: action });
    if (error) throw participantAppError(error.message, 'Could not save app status.');
  },

  async savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
    const keys = subscription.keys as { p256dh: string; auth: string } | undefined;
    if (!subscription.endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Invalid push subscription');
    const { error } = await supabase.rpc('save_participant_push', {
      p_token: getSessionToken(),
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
    });
    if (error) throw participantAppError(error.message, 'Could not turn on notifications.');
  },

  // Resized to 640px JPEG at 0.85 quality in the browser before upload (utils/resizeImage).
  async uploadAvatar(participantId: string, file: File): Promise<{ avatarUrl: string }> {
    const compressed = await resizeImageToJpeg(file);
    const path = `avatars/participants/${participantId}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
    if (uploadError) throw new Error(uploadError.message);
    const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path);
    const { error } = await supabase.rpc('set_participant_avatar', { p_token: getSessionToken(), p_url: urlData.publicUrl });
    if (error) throw participantAppError(error.message, 'Could not save your photo.');
    return { avatarUrl: urlData.publicUrl };
  },

  /** Their saved accent colour, or null for the default. */
  async getTheme(): Promise<string | null> {
    const { data, error } = await supabase.rpc('participant_theme', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your colour.');
    return (data as string | null) ?? null;
  },

  async setTheme(color: string | null): Promise<void> {
    const { error } = await supabase.rpc('set_participant_theme', { p_token: getSessionToken(), p_color: color });
    if (error) throw participantAppError(error.message, 'Could not save your colour.');
  },

  // Saves their details and answers to requested fields; returns the new completion.
  async saveProfile(input: {
    email: string;
    gender: string;
    ageRange: string;
    occupation: string;
    dateOfBirth: string;
    answers: Record<string, string>;
  }): Promise<import('../types').ProfileCompletion> {
    const { data, error } = await supabase.rpc('save_participant_profile', {
      p_token: getSessionToken(),
      p_email: input.email,
      p_gender: input.gender,
      p_age_range: input.ageRange,
      p_occupation: input.occupation,
      p_date_of_birth: input.dateOfBirth || null,
      p_answers: input.answers,
    });
    if (error) throw participantAppError(error.message, 'Could not save your details.');
    return data as import('../types').ProfileCompletion;
  },

  async changePassword(current: string, next: string): Promise<void> {
    const { data, error } = await supabase.rpc('change_participant_password', { p_token: getSessionToken(), p_current: current, p_new: next });
    if (error) throw participantAppError(error.message, 'Could not change your password.');
    if (data !== true) throw new Error('Your current password is not right.');
  },

  // Anonymous: the database stores the answers without who sent them.
  async submitFeedback(answers: import('../types').FeedbackAnswers): Promise<void> {
    const { error } = await supabase.rpc('submit_feedback', { p_token: getSessionToken(), p_answers: answers });
    if (error) throw participantAppError(error.message, 'Could not send your feedback.');
  },

  async submitWrapUp(input: { department: string; wantsReferral: boolean; note: string }, participantName: string): Promise<void> {
    const { data, error } = await supabase.rpc('submit_wrap_up', {
      p_token: getSessionToken(),
      p_department: input.department,
      p_wants_referral: input.wantsReferral,
      p_note: input.note,
    });
    if (error) throw participantAppError(error.message, 'Could not send that.');
    const supportId = (data as { supportId: string | null } | null)?.supportId;
    if (supportId && input.wantsReferral) {
      void notify(
        { userIds: [supportId] },
        `${participantName} wants to join ${input.department}`,
        'They asked for a referral in the participant app. Confirm it on their profile once they have joined.',
        '/support/participants',
        'GENERAL',
      );
    }
  },

  // Anonymous unless showName is ticked. One answer per week -- the database
  // rejects a second submit for a week already answered.
  async submitClassFeedback(input: { weekId: number; rating: number; comment: string; showName: boolean }): Promise<void> {
    const { error } = await supabase.rpc('submit_class_feedback', {
      p_token: getSessionToken(),
      p_week_id: input.weekId,
      p_rating: input.rating,
      p_comment: input.comment,
      p_show_name: input.showName,
    });
    if (error) throw participantAppError(error.message, 'Could not send that. Please try again.');
  },

  // Saves the popup answer; "I need help" also alerts their support straight away.
  async recordCheckIn(response: import('../types').CheckInResponse, misses: { sunday: number; meeting: number }, participantName: string): Promise<void> {
    const { data, error } = await supabase.rpc('record_check_in', {
      p_token: getSessionToken(),
      p_response: response,
      p_sunday_misses: misses.sunday,
      p_meeting_misses: misses.meeting,
    });
    if (error) throw participantAppError(error.message, 'Could not send that. Please try again.');
    const supportId = (data as { supportId: string | null } | null)?.supportId;
    if (response === 'NEED_HELP' && supportId) {
      void notify(
        { userIds: [supportId] },
        `${participantName} asked for help`,
        `They answered "I need help" in the participant app. Please reach out to ${participantName.split(' ')[0]} today.`,
        '/support',
        'PARTICIPANT_FLAG',
      );
    }
  },

  async getNotifications(): Promise<{ unread: number; items: import('../types').ParticipantNotification[] }> {
    const { data, error } = await supabase.rpc('participant_notifications', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your notifications.');
    return data as { unread: number; items: import('../types').ParticipantNotification[] };
  },

  async markNotificationsRead(ids: string[] | null): Promise<void> {
    const { error } = await supabase.rpc('mark_participant_notifications_read', { p_token: getSessionToken(), p_ids: ids });
    if (error) throw participantAppError(error.message, 'Could not update your notifications.');
  },
  // A phone push was tapped: its bell copy counts as read.
  async markPushTapped(title: string, body: string): Promise<void> {
    const { error } = await supabase.rpc('mark_participant_notifications_read_by_content', { p_token: getSessionToken(), p_title: title, p_body: body });
    if (error) throw participantAppError(error.message, 'Could not update your notifications.');
  },
};

// ---------------------------------------------------------------------------
// Follow-ups module
// ---------------------------------------------------------------------------

const mapFollowUpContact = (row: any): import('../types').FollowUpContact => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  source: row.source,
  ownerId: row.ownerId,
  ownerName: row.owner?.name || null,
  messageStatus: row.messageStatus,
  replyStatus: row.replyStatus,
  callStatus: row.callStatus,
  registrationStatus: row.registrationStatus,
  nextAction: row.nextAction,
  lastContactDate: row.lastContactDate,
  followUpCount: row.followUpCount ?? 0,
  notes: row.notes,
  email: row.email ?? null,
  gender: row.gender ?? null,
  ageRange: row.ageRange ?? null,
  occupation: row.occupation ?? null,
  registeredById: row.registeredById ?? null,
  registeredByName: withActedAs(row.registeredBy?.name ?? null, row.registeredByActedAs),
  sheetSyncedAt: row.sheetSyncedAt ?? null,
  sheetSyncError: row.sheetSyncError ?? null,
  sheetSyncWarning: row.sheetSyncWarning ?? null,
  cohortId: row.cohortId,
  cohortName: row.Cohort?.name || null,
  cohortVenue: row.Cohort?.venue || null,
  cohortStartDate: row.Cohort?.startDate || null,
  dueDate: row.dueDate,
  archivedAt: row.archivedAt,
  isTest: row.isTest ?? false,
  formQuestion: row.formQuestion ?? null,
  formQuestionAnsweredAt: row.formQuestionAnsweredAt ?? null,
  formQuestionAnsweredById: row.formQuestionAnsweredById ?? null,
  ownerAssignedAt: row.ownerAssignedAt ?? null,
  guardianPhone: row.guardianPhone ?? null,
  guardianName: row.guardianName ?? null,
  noResponseAt: row.noResponseAt ?? null,
  teenOnboardedHow: row.teenOnboardedHow ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const FOLLOW_UP_SELECT = '*, owner:User!FollowUpContact_ownerId_fkey(id, name), registeredBy:User!FollowUpContact_registeredById_fkey(id, name), Cohort(name, venue, startDate)';

export type FollowUpContactInput = import('../types').FollowUpContactUpdate;

const notifyFollowUpAssignment = (ownerId: string, contactNames: string[]) => {
  // Fire-and-forget: a push failure must never block the UI flow.
  void supabase.functions
    .invoke('notify-followup-assignment', {
      body: { ownerId, contactCount: contactNames.length, sample: contactNames.slice(0, 3) },
    })
    .catch(() => undefined);
};

type FollowUpTerminalReason = 'CLOSE' | 'ACCESS_CONFIRMED' | 'LOGIN_ISSUE' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'INCORRECT_NUMBER' | 'NO_RESPONSE';

const getTerminalFollowUpReason = (contact: {
  nextAction?: string | null;
  registrationStatus?: string | null;
  replyStatus?: string | null;
  callStatus?: string | null;
}): FollowUpTerminalReason | null => {
  // A login problem isn't an ending, but the admins and IT Support still need
  // to hear about it. Login shared no longer closes anything, so it isn't here.
  if (contact.registrationStatus === 'LOGIN_ISSUE') return 'LOGIN_ISSUE';
  if (contact.registrationStatus === 'ACCESS_CONFIRMED') return 'ACCESS_CONFIRMED';
  if (contact.nextAction === 'CLOSE') return 'CLOSE';
  if (contact.registrationStatus === 'NOT_INTERESTED') return 'NOT_INTERESTED';
  if (contact.registrationStatus === 'NOT_A_TCN_MEMBER') return 'NOT_A_TCN_MEMBER';
  if (contact.registrationStatus === 'NOT_A_GOOD_TIME') return 'NOT_A_GOOD_TIME';
  if (contact.replyStatus === 'INCORRECT_NUMBER' || contact.callStatus === 'INCORRECT_NUMBER') return 'INCORRECT_NUMBER';
  if (contact.registrationStatus === 'NO_RESPONSE') return 'NO_RESPONSE';
  return null;
};

const notifyFollowUpTerminalStatus = (
  contactId: string,
  actorId: string,
  terminalState: FollowUpTerminalReason
) => {
  void supabase.functions
    .invoke('notify-followup-terminal-status', {
      body: { contactId, actorId, terminalState },
    })
    .catch(() => undefined);
};

// ── Sign-ups from the Google Form ───────────────────────────────────────────

export interface FormRegistration {
  id: string;
  fullName: string;
  phone: string;
  phoneNormalised: string | null;
  email: string | null;
  signedUpAt: string;
  outcome: 'PENDING' | 'MATCHED' | 'CREATED' | 'DUPLICATE' | 'FAILED';
  outcomeDetail: string | null;
  contactId: string | null;
  contactOwnerName: string | null;
  contactOwnerId: string | null;
  /** The support's number, for a WhatsApp badge beside their name. */
  contactOwnerPhone: string | null;
  /** Where their follow-up stands, so any support can see it. */
  contactStatus: import('../types').FollowUpRegistrationStatus | null;
}

const mapFormRegistration = (row: any): FormRegistration => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  phoneNormalised: row.phoneNormalised ?? null,
  email: row.email ?? null,
  signedUpAt: row.signedUpAt,
  outcome: row.outcome,
  outcomeDetail: row.outcomeDetail ?? null,
  contactId: row.contactId ?? null,
  contactOwnerName: row.contact?.owner?.name ?? null,
  contactOwnerId: row.contact?.owner?.id ?? null,
  contactOwnerPhone: row.contact?.owner?.phone ?? null,
  contactStatus: row.contact?.registrationStatus ?? null,
});

export const formRegistrationsApi = {
  // Every support sees every sign-up: the point is that they can check whether
  // someone has registered without asking the back office.
  async getAll(options?: { limit?: number }): Promise<{ registrations: FormRegistration[] }> {
    const { data, error } = await supabase
      .from('SheetRegistration')
      .select('*, contact:FollowUpContact(id, registrationStatus, owner:User!FollowUpContact_ownerId_fkey(id, name, phone))')
      .order('signedUpAt', { ascending: false })
      .limit(options?.limit ?? 500);

    if (error) throw new Error(error.message);
    return { registrations: ((data as any[]) || []).map(mapFormRegistration) };
  },
};

export const followUpContactsApi = {
  async getById(contactId: string): Promise<{ contact: import('../types').FollowUpContact | null }> {
    const { data, error } = await supabase.from('FollowUpContact').select(FOLLOW_UP_SELECT).eq('id', contactId).maybeSingle();
    if (error) throw new Error(error.message);
    return { contact: data ? mapFollowUpContact(data) : null };
  },

  async getAll(options?: {
    cohortId?: string | null;
    ownerId?: string;
    archived?: boolean;
  }): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    let query = supabase
      .from('FollowUpContact')
      .select(FOLLOW_UP_SELECT)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true });

    if (options?.cohortId) query = query.eq('cohortId', options.cohortId);
    if (options?.ownerId) query = query.eq('ownerId', options.ownerId);
    if (options?.archived === true) query = query.not('archivedAt', 'is', null);
    if (options?.archived === false) query = query.is('archivedAt', null);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { contacts: ((data as any[]) || []).map(mapFollowUpContact) };
  },

  // Every saved version of a contact's note, newest first (recorded by a
  // database trigger whenever the note changes).
  async getNoteHistory(contactId: string): Promise<{ entries: import('../types').FollowUpNoteEntry[] }> {
    const { data, error } = await supabase
      .from('FollowUpNoteHistory')
      .select('id, body, imported, notedAt, authorLabel, author:User!FollowUpNoteHistory_authorId_fkey(name)')
      .eq('contactId', contactId)
      .order('notedAt', { ascending: false });
    if (error) throw new Error(error.message);
    return {
      entries: ((data as any[]) || []).map((row) => ({
        id: row.id,
        body: row.body,
        authorName: row.author?.name ?? row.authorLabel ?? null,
        imported: !!row.imported,
        notedAt: row.notedAt,
      })),
    };
  },

  // Re-send every recent registered prospect that hasn't reached the Google sheet.
  async retrySheetSync(): Promise<{ attempted: number; sent: number }> {
    const { data, error } = await supabase.functions.invoke('sync-lead-to-sheet', { body: { pending: true } });
    if (error) throw new Error('Could not reach the sheet sync. Please try again.');
    return { attempted: (data as any)?.attempted ?? 0, sent: (data as any)?.sent ?? 0 };
  },

  async create(input: FollowUpContactInput): Promise<{ contact: import('../types').FollowUpContact }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .insert([input])
      .select(FOLLOW_UP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create contact');

    const contact = mapFollowUpContact(data);
    if (input.ownerId) notifyFollowUpAssignment(input.ownerId, [contact.fullName]);
    // Prospects are no longer pushed to the Google Sheet. A support saving someone's
    // name and number is not a registration -- the person registers themselves
    // on the form, and that submission comes back the other way. sync-lead-to-sheet
    // and retrySheetSync are left in place, unused, in case this is reversed.

    // A support registering a prospect from Mobilisation: operations needs to pick it up.
    if (input.registeredById && !input.ownerId) {
      void notify(
        { role: 'ADMIN' },
        'New prospect registered',
        `${contact.registeredByName || 'A support'} registered ${contact.fullName}. They're waiting to be assigned.`,
        '/follow-ups',
        'FOLLOWUP_ASSIGNMENT',
      );
    }
    return { contact };
  },

  async createMany(rows: FollowUpContactInput[]): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    if (rows.length === 0) return { contacts: [] };
    const { data, error } = await supabase
      .from('FollowUpContact')
      .insert(rows)
      .select(FOLLOW_UP_SELECT);

    if (error) throw new Error(error.message);
    return { contacts: ((data as any[]) || []).map(mapFollowUpContact) };
  },

  async update(contactId: string, input: FollowUpContactInput): Promise<{ contact: import('../types').FollowUpContact }> {
    const { previousOwnerId, ...fields } = input;
    const { data: current, error: currentError } = await supabase
      .from('FollowUpContact')
      .select('id, nextAction, registrationStatus')
      .eq('id', contactId)
      .single();

    if (currentError || !current) {
      throw new Error(currentError?.message || 'Contact not found');
    }

    const patch: Record<string, unknown> = { ...fields, updatedAt: new Date().toISOString() };

    if (fields.replyStatus === 'INCORRECT_NUMBER' || fields.callStatus === 'INCORRECT_NUMBER') {
      patch.replyStatus = 'INCORRECT_NUMBER';
      patch.callStatus = 'INCORRECT_NUMBER';
      patch.nextAction = 'CLOSE';
    }

    if (fields.nextAction === 'CLOSE') {
      patch.archivedAt = new Date().toISOString();
    } else if (fields.nextAction) {
      patch.archivedAt = null;
    }

    // No response parks the person instead of closing them: still open (so they can be put in
    // a group), never assigned or nudged again. An adult is released from their support; a teen
    // keeps their Teen Support and their status and is only flagged, because a teen always
    // needs a same-gender Teen Support.
    const wasTeen = (current as any).registrationStatus === 'TEENAGER' || (current as any).registrationStatus === 'TEEN_ONBOARDED';
    if (fields.registrationStatus === 'NO_RESPONSE') {
      // Someone already in the app has been reached. A support's screen may be out of date, so refuse here too.
      if ((current as any).registrationStatus === 'ACCESS_CONFIRMED' && getCurrentUserFromStorage()?.role !== 'ADMIN') {
        throw new Error('They are already confirmed in the app, so they cannot be marked No response.');
      }
      if (wasTeen) {
        for (const key of ['messageStatus', 'replyStatus', 'callStatus', 'registrationStatus', 'nextAction', 'archivedAt', 'teenOnboardedHow'] as const) delete patch[key];
      } else {
        patch.replyStatus = 'NO_REPLY';
        patch.callStatus = 'NOT_APPLICABLE';
        patch.nextAction = 'SEND_MESSAGE';
        patch.archivedAt = null;
        patch.ownerId = null;
      }
      patch.noResponseAt = new Date().toISOString();
    } else if (fields.registrationStatus) {
      patch.noResponseAt = null;
    }
    if ('dueDate' in fields) {
      // Re-arm the due reminder whenever the due date changes.
      patch.dueReminderSentAt = null;
    }

    const { data, error } = await supabase
      .from('FollowUpContact')
      .update(patch)
      .eq('id', contactId)
      .select(FOLLOW_UP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update contact');

    const contact = mapFollowUpContact(data);
    if (fields.ownerId && fields.ownerId !== previousOwnerId) {
      notifyFollowUpAssignment(fields.ownerId, [contact.fullName]);
    }

    const actor = getCurrentUserFromStorage();
    const previousTerminalReason = getTerminalFollowUpReason(current as any);
    const nextTerminalReason = getTerminalFollowUpReason(contact);
    if (
      actor?.id &&
      // A login problem goes to IT Support too, so it is sent whoever reports it.
      (actor.role !== 'ADMIN' || nextTerminalReason === 'LOGIN_ISSUE') &&
      nextTerminalReason &&
      nextTerminalReason !== previousTerminalReason
    ) {
      notifyFollowUpTerminalStatus(contact.id, actor.id, nextTerminalReason);
    }
    // A teen marked No response keeps their status, so admins are told here.
    if (wasTeen && fields.registrationStatus === 'NO_RESPONSE' && actor?.id && actor.role !== 'ADMIN') {
      notifyFollowUpTerminalStatus(contact.id, actor.id, 'NO_RESPONSE');
    }

    // Auto-create a Participant when the contact is marked REGISTERED.
    if (
      fields.registrationStatus === 'REGISTERED' &&
      (current as any).registrationStatus !== 'REGISTERED'
    ) {
      await participantsApi.upsertFromFollowUpContact(contact);
    }

    return { contact };
  },

  // Admin override for the no-form gate: records who approved and why, so the
  // blocked status change can go through on retry.
  async approveManualRegistration(contactId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('approve_manual_registration', {
      p_token: getSessionToken(),
      p_contact_id: contactId,
      p_reason: reason,
    });
    if (!error) return;
    const msg = error.message || '';
    if (msg.includes('SESSION_EXPIRED')) throw new Error('SESSION_EXPIRED');
    if (msg.includes('NOT_ALLOWED')) throw new Error('Only admins can approve.');
    if (msg.includes('REASON_REQUIRED')) throw new Error('Write a short reason first.');
    if (msg.includes('CONTACT_NOT_FOUND')) throw new Error('This contact no longer exists.');
    throw new Error(friendlyUserError(msg, 'Approval did not save. Please try again.'));
  },

  /** Contacts that were passed on to the signed-in support, and from whom (latest hand-over only). */
  async getMyHandovers(): Promise<Record<string, { fromName: string | null; at: string }>> {
    const { data, error } = await supabase.rpc('my_followup_handovers', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    const out: Record<string, { fromName: string | null; at: string }> = {};
    for (const row of ((data ?? []) as any[])) out[row.contactId] = { fromName: row.fromName ?? null, at: row.at };
    return out;
  },

  /**
   * A support adds a teen in full. The database registers them, makes them a
   * Teenager and gives them to a Teen Support straight away (teen_add_prospect).
   * The support who now holds them is told, like any new follow-up.
   */
  async addTeen(input: { fullName: string; phone?: string; guardianPhone?: string; guardianName?: string; gender: 'Male' | 'Female'; email?: string; cohortId?: string | null }): Promise<{ contactId: string; ownerId: string | null; ownerName: string | null; waiting: boolean }> {
    const { data, error } = await supabase.rpc('teen_add_prospect', {
      p_token: getSessionToken(),
      p_full_name: input.fullName,
      p_phone: input.phone ?? null,
      p_guardian_phone: input.guardianPhone ?? null,
      p_guardian_name: input.guardianName ?? null,
      p_gender: input.gender,
      p_email: input.email ?? null,
      p_cohort_id: input.cohortId ?? null,
    });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('SESSION_EXPIRED')) throw new Error('SESSION_EXPIRED');
      if (msg.includes('NOT_AUTHORISED')) throw new Error('You are not allowed to add a teen.');
      if (/^(Teen handling|Enter the teen|Choose Male|There is no current|Add their number)/.test(msg)) throw new Error(msg);
      throw new Error(friendlyUserError(msg, 'The teen was not saved. Please try again.'));
    }
    const row = (data ?? {}) as any;
    if (row.ownerId) notifyFollowUpAssignment(row.ownerId, [input.fullName]);
    return {
      contactId: row.contactId,
      ownerId: row.ownerId ?? null,
      ownerName: row.ownerName ?? null,
      waiting: !!row.waiting,
    };
  },

  async assignMany(contactIds: string[], ownerId: string | null, dueDate?: string | null): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    if (contactIds.length === 0) return { contacts: [] };
    const patch: Record<string, unknown> = { ownerId, updatedAt: new Date().toISOString() };
    if (dueDate !== undefined) {
      patch.dueDate = dueDate;
      patch.dueReminderSentAt = null;
    }

    const { data, error } = await supabase
      .from('FollowUpContact')
      .update(patch)
      .in('id', contactIds)
      .select(FOLLOW_UP_SELECT);

    if (error) throw new Error(error.message);

    const contacts = ((data as any[]) || []).map(mapFollowUpContact);
    if (ownerId) notifyFollowUpAssignment(ownerId, contacts.map((c) => c.fullName));
    return { contacts };
  },

  // Runs the same leadership rule the 2-hour scheduled sweep uses (same-gender,
  // added-by-support first, then fewest open follow-ups), immediately, for
  // everyone currently waiting. Notifies each newly-assigned support the same
  // way a manual bulk assign does.
  async assignPendingNow(): Promise<{ assigned: number; stuckNoGender: number; stuckUnknownGender: number; stuckInvalidPhone: number }> {
    const { data, error } = await supabase.rpc('assign_followups_now', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    // Not notifyFollowUpAssignment: the RPC only returns up to 3 sample names
    // per owner, but the real assigned count can be higher, so contactCount
    // is sent explicitly rather than re-derived from the (capped) name list.
    const batches = (data?.batches ?? {}) as Record<string, { count: number; names: string[] }>;
    Object.entries(batches).forEach(([ownerId, batch]) => {
      void supabase.functions
        .invoke('notify-followup-assignment', { body: { ownerId, contactCount: batch.count, sample: batch.names ?? [] } })
        .catch(() => undefined);
    });
    return {
      assigned: data?.assigned ?? 0,
      stuckNoGender: data?.stuckNoGender ?? 0,
      stuckUnknownGender: data?.stuckUnknownGender ?? 0,
      stuckInvalidPhone: data?.stuckInvalidPhone ?? 0,
    };
  },

  async logContact(contactId: string): Promise<{ contact: import('../types').FollowUpContact }> {
    const { data: current, error: readError } = await supabase
      .from('FollowUpContact')
      .select('followUpCount')
      .eq('id', contactId)
      .single();

    if (readError || !current) throw new Error(readError?.message || 'Contact not found');

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('FollowUpContact')
      .update({
        followUpCount: ((current as any).followUpCount ?? 0) + 1,
        lastContactDate: today,
        updatedAt: now.toISOString(),
      })
      .eq('id', contactId)
      .select(FOLLOW_UP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to log contact');
    return { contact: mapFollowUpContact(data) };
  },

  async delete(contactId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('FollowUpContact')
      .delete()
      .eq('id', contactId);

    if (error) throw new Error(error.message);
    return { message: 'Contact deleted' };
  },

  // Offered for the next cohort: people who said they will join it, and people marked No response
  // (including someone who signed up but could not be reached: their participant record stays in
  // this cohort, and the contact starts again in the next one, as a returning person does).
  async getNextCohortContacts(cohortId: string): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .select(FOLLOW_UP_SELECT)
      .eq('cohortId', cohortId)
      .in('registrationStatus', ['NEXT_COHORT', 'NO_RESPONSE'])
      .is('archivedAt', null);
    if (error) throw new Error(error.message);
    return { contacts: ((data as any[]) || []).map(mapFollowUpContact) };
  },

  // Everyone marked "Will join next cohort" who hasn't been moved into this cohort yet.
  async getWaitingForCohort(cohortId: string): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .select(FOLLOW_UP_SELECT)
      .in('registrationStatus', ['NEXT_COHORT', 'NO_RESPONSE'])
      .is('archivedAt', null)
      .or(`cohortId.is.null,cohortId.neq.${cohortId}`)
      .order('fullName', { ascending: true });
    if (error) throw new Error(error.message);
    return { contacts: ((data as any[]) || []).map(mapFollowUpContact) };
  },

  async bulkMoveNextCohortContacts(contactIds: string[], newCohortId: string): Promise<void> {
    // Back to "To contact" so they re-enter the follow-up list for the new cohort.
    const { error } = await supabase
      .from('FollowUpContact')
      .update({
        cohortId: newCohortId,
        registrationStatus: 'NOT_REGISTERED',
        noResponseAt: null,
        messageStatus: 'NOT_SENT',
        replyStatus: 'NO_REPLY',
        callStatus: 'NOT_CALLED',
        nextAction: 'SEND_MESSAGE',
        archivedAt: null,
        // A fresh start in the new cohort: the old cohort's owner and due date don't carry over.
        ownerId: null,
        ownerAssignedAt: null,
        dueDate: null,
        dueReminderSentAt: null,
        updatedAt: new Date().toISOString(),
      })
      .in('id', contactIds);
    if (error) throw new Error(error.message);
  },
};

export const messageTemplatesApi = {
  async getAll(options?: { category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR' | 'TEEN' | 'TEEN_PARENT' }): Promise<{ templates: import('../types').MessageTemplate[] }> {
    let q = supabase.from('MessageTemplate').select('*').order('createdAt', { ascending: true });
    // Follow-up screens also get the TEEN templates; the message picker shows each person the right kind.
    if (options?.category === 'FOLLOW_UP') q = q.in('category', ['FOLLOW_UP', 'TEEN', 'TEEN_PARENT']);
    else if (options?.category) q = q.eq('category', options.category);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { templates: (data as any[]) || [] };
  },

  async create(input: { useCase: string; body: string; whenToUse?: string | null; imageUrl?: string | null; imageName?: string | null; category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR' | 'TEEN' | 'TEEN_PARENT' }): Promise<{ template: import('../types').MessageTemplate }> {
    const { data, error } = await supabase
      .from('MessageTemplate')
      .insert([input])
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create template');
    return { template: data as any };
  },

  async update(templateId: string, input: { useCase: string; body: string; whenToUse?: string | null; imageUrl?: string | null; imageName?: string | null; category?: 'FOLLOW_UP' | 'TEEN' | 'TEEN_PARENT' }): Promise<{ template: import('../types').MessageTemplate }> {
    const { data, error } = await supabase
      .from('MessageTemplate')
      .update({ ...input, updatedAt: new Date().toISOString() })
      .eq('id', templateId)
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update template');
    return { template: data as any };
  },

  async delete(templateId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('MessageTemplate')
      .delete()
      .eq('id', templateId);

    if (error) throw new Error(error.message);
    return { message: 'Template deleted' };
  },

  async uploadTemplateImage(file: File): Promise<{ url: string; name: string }> {
    const path = `templates/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('resources').upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    return { url: data.publicUrl, name: file.name };
  },
};

const mapFollowUpIssue = (row: any): import('../types').FollowUpIssue => ({
  id: row.id,
  contactId: row.contactId,
  contactName: row.contact?.fullName || null,
  openedAt: row.openedAt,
  person: row.person,
  issue: row.issue,
  reportedById: row.reportedById,
  reportedByName: row.reportedBy?.name || null,
  ownerId: row.ownerId,
  ownerName: row.owner?.name || null,
  neededFrom: row.neededFrom,
  status: row.status,
  resolution: row.resolution,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ISSUE_SELECT = '*, contact:FollowUpContact!FollowUpIssue_contactId_fkey(id, fullName), owner:User!FollowUpIssue_ownerId_fkey(id, name), reportedBy:User!FollowUpIssue_reportedById_fkey(id, name)';

const notifyFollowUpIssue = (issueId: string, reporterId: string) => {
  void supabase.functions
    .invoke('notify-followup-issue', {
      body: { issueId, reporterId },
    })
    .catch(() => undefined);
};

export const followUpIssuesApi = {
  async getAll(options?: {
    contactId?: string;
    status?: import('../types').IssueStatus;
    reporterId?: string;
    contactIds?: string[];
  }): Promise<{ issues: import('../types').FollowUpIssue[] }> {
    let query = supabase
      .from('FollowUpIssue')
      .select(ISSUE_SELECT)
      .order('createdAt', { ascending: false });

    if (options?.contactId) query = query.eq('contactId', options.contactId);
    if (options?.status) query = query.eq('status', options.status);
    if (options?.reporterId && options?.contactIds?.length) {
      const contactIds = options.contactIds.map((id) => `"${id}"`).join(',');
      query = query.or(`reportedById.eq.${options.reporterId},contactId.in.(${contactIds})`);
    } else if (options?.reporterId) {
      query = query.eq('reportedById', options.reporterId);
    } else if (options?.contactIds?.length) {
      query = query.in('contactId', options.contactIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { issues: ((data as any[]) || []).map(mapFollowUpIssue) };
  },

  async create(input: {
    contactId?: string | null;
    // Every contact the issue is about (contactId stays the first). Each gets a link row.
    contactIds?: string[];
    person?: string | null;
    issue: string;
    reportedById?: string | null;
    ownerId?: string | null;
    neededFrom?: string | null;
  }): Promise<{ issue: import('../types').FollowUpIssue }> {
    const { contactIds, ...row } = input;
    const { data, error } = await supabase
      .from('FollowUpIssue')
      .insert([row])
      .select(ISSUE_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create issue');
    const issue = mapFollowUpIssue(data);
    // The issue is saved either way; a failed link write must not lose it.
    const linkIds = Array.from(new Set(contactIds?.length ? contactIds : input.contactId ? [input.contactId] : []));
    if (linkIds.length > 0) {
      const { error: linkError } = await supabase
        .from('FollowUpIssueContact')
        .insert(linkIds.map((contactId) => ({ issueId: issue.id, contactId })));
      if (linkError) console.error('followUpIssuesApi.create: link rows failed:', linkError.message);
    }
    if (input.reportedById) {
      notifyFollowUpIssue(issue.id, input.reportedById);
    }
    return { issue };
  },

  async update(issueId: string, input: {
    issue?: string;
    ownerId?: string | null;
    neededFrom?: string | null;
    status?: import('../types').IssueStatus;
    resolution?: string | null;
  }): Promise<{ issue: import('../types').FollowUpIssue }> {
    const { data, error } = await supabase
      .from('FollowUpIssue')
      .update({ ...input, updatedAt: new Date().toISOString() })
      .eq('id', issueId)
      .select(ISSUE_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update issue');
    return { issue: mapFollowUpIssue(data) };
  },

  async delete(issueId: string): Promise<{ message: string }> {
    const { error } = await supabase
      .from('FollowUpIssue')
      .delete()
      .eq('id', issueId);

    if (error) throw new Error(error.message);
    return { message: 'Issue deleted' };
  },
};

// "Issue with login" reports and the IT issues tab. Writes go through RPCs
// only (20260928190000_followup_login_issues.sql).
export const followUpLoginIssuesApi = {
  // Opens the contact's login issue, or updates its description if one is open.
  async report(contactId: string, description: string): Promise<{ id: string }> {
    const { data, error } = await supabase.rpc('report_followup_login_issue', { p_contact_id: contactId, p_description: description });
    if (error || !data) throw new Error(error?.message || 'Could not save the login problem');
    return { id: (data as { id: string }).id };
  },

  // The issues the caller covers as IT Support in this cohort (all, for an admin).
  async getForItSupport(cohortId: string): Promise<{ isItSupport: boolean; issues: import('../types').ItLoginIssue[] }> {
    const { data, error } = await supabase.rpc('it_login_issues', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    const value = (data as { isItSupport?: boolean; issues?: import('../types').ItLoginIssue[] } | null) ?? {};
    return { isItSupport: !!value.isItSupport, issues: value.issues ?? [] };
  },

  // Marks it sorted; the contact moves to Participant confirmed access if they
  // have signed in, otherwise back to Login shared.
  async resolve(issueId: string, note?: string | null): Promise<{ registrationStatus: import('../types').FollowUpRegistrationStatus }> {
    const { data, error } = await supabase.rpc('resolve_followup_login_issue', { p_issue_id: issueId, p_note: note?.trim() || null });
    if (error || !data) throw new Error(error?.message || 'Could not mark this resolved');
    return { registrationStatus: (data as { registrationStatus: import('../types').FollowUpRegistrationStatus }).registrationStatus };
  },
};

// ── Participants ──────────────────────────────────────────────────────────────

const PARTICIPANT_SELECT = `
  *,
  cohort:Cohort(name),
  group:GroupParticipant(group:Group(id, name)),
  followUp:FollowUpContact(registrationStatus)
`.trim();

const resolveSupportScopedGroups = async (supportId: string, cohortId?: string | null): Promise<import('../types').Group[]> => {
  let directQuery = supabase
    .from('Group')
    .select(GROUP_SELECT)
    .eq('supportId', supportId)
    .eq('isTeenGroup', false)
    .is('archivedAt', null)
    .order('name', { ascending: true });

  if (cohortId) directQuery = directQuery.eq('cohortId', cohortId);

  const { data: directRows, error: directError } = await directQuery;
  if (directError) throw new Error(directError.message);

  const directGroups = ((directRows as any[]) || []).map(mapGroup);
  if (directGroups.length > 0) return directGroups;

  let fallbackQuery = supabase
    .from('Group')
    .select(GROUP_SELECT)
    .eq('isTeenGroup', false)
    .is('archivedAt', null)
    .order('name', { ascending: true });

  if (cohortId) fallbackQuery = fallbackQuery.eq('cohortId', cohortId);

  const { data: fallbackRows, error: fallbackError } = await fallbackQuery;
  if (fallbackError) throw new Error(fallbackError.message);

  const populatedGroups = ((fallbackRows as any[]) || [])
    .map(mapGroup)
    .filter((group) => (group.participantCount ?? 0) > 0);

  if (populatedGroups.length === 1) return populatedGroups;

  const allGroups = ((fallbackRows as any[]) || []).map(mapGroup);
  if (allGroups.length === 1) return allGroups;

  return [];
};

// PostgREST returns the GroupParticipant embed as an array (to-many) or a single
// object (to-one) depending on how it resolves the relationship — normalise both.
const firstGroupEmbed = (group: any): any => (Array.isArray(group) ? group[0] : group);

const mapParticipant = (row: any): import('../types').Participant => {
  const gp = firstGroupEmbed(row.group);
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone ?? null,
    cohortId: row.cohortId ?? null,
    cohortName: row.cohort?.name ?? null,
    source: row.source ?? 'MANUAL',
    followUpContactId: row.followUpContactId ?? null,
    followUpStatus: (Array.isArray(row.followUp) ? row.followUp[0] : row.followUp)?.registrationStatus ?? null,
    status: row.status ?? 'ACTIVE',
    notes: row.notes ?? null,
    email: row.email ?? null,
    gender: row.gender ?? null,
    ageRange: row.ageRange ?? null,
    departments: row.departments ?? [],
    registrationDate: row.registrationDate ?? null,
    smartRequest: row.smartRequest ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    occupation: row.occupation ?? null,
    avatarUrl: row.avatarUrl ?? null,
    groupId: gp?.group?.id ?? null,
    groupName: gp?.group?.name ?? null,
    isTest: !!row.isTest,
    guardianPhone: row.guardianPhone ?? null,
    retakeStatus: row.retakeStatus ?? null,
    retakeNote: row.retakeNote ?? null,
    retakeCheckedAt: row.retakeCheckedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const participantsApi = {
  async getById(participantId: string): Promise<{ participant: import('../types').Participant | null }> {
    const { data, error } = await supabase.from('Participant').select(PARTICIPANT_SELECT).eq('id', participantId).maybeSingle();
    if (error) throw new Error(error.message);
    return { participant: data ? mapParticipant(data) : null };
  },

  async getAll(options?: {
    cohortId?: string;
    supportId?: string;
    includeArchived?: boolean;
  }): Promise<{ participants: import('../types').Participant[] }> {
    let query = supabase
      .from('Participant')
      .select(PARTICIPANT_SELECT)
      .order('fullName', { ascending: true });

    if (!options?.includeArchived) query = query.eq('status', 'ACTIVE');
    if (options?.cohortId) query = query.eq('cohortId', options.cohortId);

    if (options?.supportId) {
      const resolvedGroups = await resolveSupportScopedGroups(options.supportId, options.cohortId);
      const groupIds = resolvedGroups.map((group) => group.id);
      if (groupIds.length === 0) return { participants: [] };
      const { data: gpRows } = await supabase
        .from('GroupParticipant')
        .select('participantId')
        .in('groupId', groupIds);
      const participantIds = (gpRows ?? []).map((r: any) => r.participantId);
      if (participantIds.length === 0) return { participants: [] };
      query = query.in('id', participantIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { participants: ((data as any[]) || []).map(mapParticipant) };
  },

  async create(input: {
    fullName: string;
    phone?: string | null;
    cohortId?: string | null;
    source?: string;
    followUpContactId?: string | null;
    notes?: string | null;
    email?: string | null;
    gender?: string | null;
    ageRange?: string | null;
    departments?: string[];
    registrationDate?: string | null;
    smartRequest?: string | null;
  }): Promise<{ participant: import('../types').Participant }> {
    const { data, error } = await supabase
      .from('Participant')
      .insert([{ ...input, source: input.source ?? 'MANUAL' }])
      .select(PARTICIPANT_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create participant');
    return { participant: mapParticipant(data) };
  },

  async createMany(rows: Array<{
    fullName: string;
    phone?: string | null;
    cohortId?: string | null;
    source?: string;
    email?: string | null;
    gender?: string | null;
    ageRange?: string | null;
    departments?: string[];
    registrationDate?: string | null;
    smartRequest?: string | null;
  }>): Promise<{ participants: import('../types').Participant[] }> {
    if (rows.length === 0) return { participants: [] };
    const inserts = rows.map((r) => ({ ...r, source: r.source ?? 'IMPORT', departments: r.departments ?? [] }));
    const { data, error } = await supabase
      .from('Participant')
      .insert(inserts)
      .select(PARTICIPANT_SELECT);

    if (error) throw new Error(error.message);
    return { participants: ((data as any[]) || []).map(mapParticipant) };
  },

  // Create-or-fill import: rows whose phone matches an existing participant get
  // their EMPTY registration fields filled in (never overwriting a populated
  // value, never touching name/phone/group). Unmatched rows are created. Match
  // key is the normalized phone number.
  async importWithEnrich(
    rows: Array<{
      fullName: string;
      phone?: string | null;
      email?: string | null;
      gender?: string | null;
      ageRange?: string | null;
      departments?: string[];
      registrationDate?: string | null;
      smartRequest?: string | null;
    }>,
    cohortId: string | null,
    existing: import('../types').Participant[],
  ): Promise<{ created: import('../types').Participant[]; updated: import('../types').Participant[]; skipped: number }> {
    const byPhone = new Map<string, import('../types').Participant>();
    for (const p of existing) {
      const intl = normalizeToIntlPhone(p.phone);
      if (intl && !byPhone.has(intl)) byPhone.set(intl, p);
    }

    const isEmpty = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

    const toCreate: typeof rows = [];
    const matches: Array<{ id: string; patch: import('../types').ParticipantUpdate }> = [];
    let skipped = 0;

    for (const r of rows) {
      const intl = normalizeToIntlPhone(r.phone);
      const match = intl ? byPhone.get(intl) : undefined;
      if (!match) {
        toCreate.push(r);
        continue;
      }
      // Fill-only patch: include a field solely when the existing value is empty
      // and the CSV supplies a non-empty one.
      const patch: import('../types').ParticipantUpdate = {};
      if (isEmpty(match.email) && !isEmpty(r.email)) patch.email = r.email!.trim();
      if (isEmpty(match.gender) && !isEmpty(r.gender)) patch.gender = r.gender!.trim();
      if (isEmpty(match.ageRange) && !isEmpty(r.ageRange)) patch.ageRange = r.ageRange!.trim();
      if (isEmpty(match.departments) && !isEmpty(r.departments)) patch.departments = r.departments!;
      if (isEmpty(match.registrationDate) && !isEmpty(r.registrationDate)) patch.registrationDate = r.registrationDate!;
      if (isEmpty(match.smartRequest) && !isEmpty(r.smartRequest)) patch.smartRequest = r.smartRequest!.trim();

      if (Object.keys(patch).length === 0) {
        skipped += 1; // matched, but nothing to fill
      } else {
        matches.push({ id: match.id, patch });
      }
    }

    const created = toCreate.length
      ? (await participantsApi.createMany(toCreate.map((r) => ({ ...r, cohortId, source: 'IMPORT' })))).participants
      : [];

    // Apply fill-updates in small concurrent batches to bound round-trips.
    const updated: import('../types').Participant[] = [];
    const BATCH = 5;
    for (let i = 0; i < matches.length; i += BATCH) {
      const slice = matches.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map((m) => participantsApi.update(m.id, m.patch).then((res) => res.participant)),
      );
      updated.push(...results);
    }

    return { created, updated, skipped };
  },

  async update(participantId: string, input: import('../types').ParticipantUpdate): Promise<{ participant: import('../types').Participant }> {
    const { data, error } = await supabase
      .from('Participant')
      .update({ ...input, updatedAt: new Date().toISOString() })
      .eq('id', participantId)
      .select(PARTICIPANT_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update participant');
    return { participant: mapParticipant(data) };
  },

  async archive(participantId: string): Promise<{ participant: import('../types').Participant }> {
    return participantsApi.update(participantId, { status: 'ARCHIVED' });
  },

  async unarchive(participantId: string): Promise<{ participant: import('../types').Participant }> {
    return participantsApi.update(participantId, { status: 'ACTIVE' });
  },

  async delete(participantId: string): Promise<{ message: string }> {
    const { error } = await supabase.from('Participant').delete().eq('id', participantId);
    if (error) throw new Error(error.message);
    return { message: 'Participant deleted' };
  },

  // For the Retaking chip: records in other cohorts on the same phone number,
  // keyed by this cohort's participant id.
  async getRetakeMatches(cohortId: string): Promise<Map<string, import('../types').RetakeMatch[]>> {
    const { data, error } = await supabase.rpc('participant_retake_matches', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    const map = new Map<string, import('../types').RetakeMatch[]>();
    for (const row of (data as any[]) || []) {
      const list = map.get(row.participantId) ?? [];
      list.push({ otherName: row.otherName, otherCohort: row.otherCohort, otherCohortStart: row.otherCohortStart ?? null, sameFirstName: !!row.sameFirstName });
      map.set(row.participantId, list);
    }
    return map;
  },

  async upsertFromFollowUpContact(contact: import('../types').FollowUpContact): Promise<{ participant: import('../types').Participant }> {
    const { data: existing } = await supabase
      .from('Participant')
      .select('id')
      .eq('followUpContactId', contact.id)
      .maybeSingle();

    if (existing) {
      return participantsApi.update(existing.id, {
        fullName: contact.fullName,
        phone: contact.phone,
        cohortId: contact.cohortId,
      });
    }

    return participantsApi.create({
      fullName: contact.fullName,
      phone: contact.phone,
      cohortId: contact.cohortId,
      source: 'FOLLOW_UP',
      followUpContactId: contact.id,
    });
  },

  async ensureFromFollowUpContact(contactId: string): Promise<{ participant: import('../types').Participant }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .select(FOLLOW_UP_SELECT)
      .eq('id', contactId)
      .single();

    if (error || !data) throw new Error(error?.message || 'This registered contact could not be found.');
    const contact = mapFollowUpContact(data);
    if (contact.registrationStatus !== 'REGISTERED') {
      throw new Error('Mark this contact as Registered before adding them to Participants.');
    }
    return participantsApi.upsertFromFollowUpContact(contact);
  },
};

// ── Participant handovers and support notes ─────────────────────────────────

const PARTICIPANT_NOTE_SELECT = '*, author:User!ParticipantNote_authorId_fkey(id, name)';

const mapParticipantNote = (row: any): import('../types').ParticipantNote => ({
  id: row.id, participantId: row.participantId, body: row.body,
  authorId: row.authorId ?? null, authorName: row.author?.name ?? null,
  groupId: row.groupId ?? null, weekId: row.weekId ?? null,
  noteType: row.noteType ?? 'HANDOVER', createdAt: row.createdAt,
  byParticipant: row.byParticipant ?? false,
});

const mapParticipantHandover = (row: any): import('../types').ParticipantHandover => ({
  id: row.id, participantId: row.participantId, eventType: row.eventType,
  fromGroupName: row.fromGroupName ?? null, fromSupportName: row.fromSupportName ?? null,
  toGroupName: row.toGroupName ?? null, toSupportName: row.toSupportName ?? null,
  faithProjectStatus: row.faithProjectStatus ?? null,
  faithProjectUpdatedById: row.faithProjectUpdatedById ?? null,
  faithProjectUpdatedAt: row.faithProjectUpdatedAt ?? null, createdAt: row.createdAt,
});

export const participantNotesApi = {
  async getForParticipants(participantIds: string[]): Promise<{ notes: import('../types').ParticipantNote[] }> {
    if (participantIds.length === 0) return { notes: [] };
    const { data, error } = await supabase.from('ParticipantNote').select(PARTICIPANT_NOTE_SELECT)
      .in('participantId', participantIds).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: ((data as any[]) || []).map(mapParticipantNote) };
  },
  // The weekly group meeting report. It is stored as a MEETING note hung off the
  // week's prayer-focus participant, so the back office has to read it by group
  // and week rather than by person.
  async getMeetingReports(groupIds: string[]): Promise<{ notes: import('../types').ParticipantNote[] }> {
    if (groupIds.length === 0) return { notes: [] };
    const { data, error } = await supabase.from('ParticipantNote').select(PARTICIPANT_NOTE_SELECT)
      .eq('noteType', 'MEETING').in('groupId', groupIds).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: ((data as any[]) || []).map(mapParticipantNote) };
  },
  async create(input: { participantId: string; body: string; authorId: string; groupId?: string | null; weekId?: number | null; noteType?: import('../types').ParticipantNoteType }): Promise<{ note: import('../types').ParticipantNote }> {
    const { data, error } = await supabase.from('ParticipantNote')
      .insert([{ ...input, body: input.body.trim(), noteType: input.noteType ?? 'HANDOVER' }])
      .select(PARTICIPANT_NOTE_SELECT).single();
    if (error || !data) throw new Error(error?.message || 'Failed to save participant note');
    return { note: mapParticipantNote(data) };
  },
};

// Which department each participant said they want to join (ParticipantWrapUp,
// staff-readable via RLS app_is_staff()) -- used for the Participants page
// "Wants to join" filter and export.
export const wrapUpApi = {
  async getDepartmentsForCohort(cohortId: string): Promise<Map<string, string>> {
    const { data, error } = await supabase.from('ParticipantWrapUp').select('participantId, department').eq('cohortId', cohortId);
    if (error) return new Map();
    const map = new Map<string, string>();
    ((data as any[]) || []).forEach((row) => { if (row.department) map.set(row.participantId, row.department); });
    return map;
  },
};

const DEPARTMENT_REFERRAL_SELECT = '*, loggedBy:User!DepartmentReferral_loggedById_fkey(id, name), updatedBy:User!DepartmentReferral_updatedById_fkey(id, name)';

const mapDepartmentReferral = (row: any): import('../types').DepartmentReferral => ({
  id: row.id,
  participantId: row.participantId,
  department: row.department,
  status: row.status,
  loggedAt: row.loggedAt,
  loggedById: row.loggedById ?? null,
  loggedByName: withActedAs(row.loggedBy?.name ?? null, row.loggedByActedAs),
  joinedAt: row.joinedAt ?? null,
  updatedById: row.updatedById ?? null,
  updatedByName: withActedAs(row.updatedBy?.name ?? null, row.updatedByActedAs),
  note: row.note ?? null,
  updatedAt: row.updatedAt,
});

export const departmentReferralsApi = {
  async getForParticipants(participantIds: string[]): Promise<{ referrals: import('../types').DepartmentReferral[] }> {
    if (participantIds.length === 0) return { referrals: [] };
    const { data, error } = await supabase.from('DepartmentReferral').select(DEPARTMENT_REFERRAL_SELECT)
      .in('participantId', participantIds).order('loggedAt', { ascending: true });
    if (error) throw new Error(error.message);
    return { referrals: ((data as any[]) || []).map(mapDepartmentReferral) };
  },

  /** Log a department choice. Also keeps the participant's department list in step. */
  async log(input: { participantId: string; department: string; loggedById: string }): Promise<{ referral: import('../types').DepartmentReferral }> {
    const department = input.department.trim();
    const { data, error } = await supabase.from('DepartmentReferral')
      .insert([{ participantId: input.participantId, department, loggedById: input.loggedById, status: 'LOGGED' }])
      .select(DEPARTMENT_REFERRAL_SELECT)
      .single();
    if (error || !data) {
      throw new Error(error?.code === '23505' ? `${department} is already logged for this participant.` : error?.message || 'Failed to log department');
    }
    const { data: current } = await supabase.from('Participant').select('departments').eq('id', input.participantId).maybeSingle();
    const existing: string[] = ((current as any)?.departments as string[] | null) ?? [];
    if (!existing.some((d) => d.trim().toLowerCase() === department.toLowerCase())) {
      await supabase.from('Participant').update({ departments: [...existing, department], updatedAt: new Date().toISOString() }).eq('id', input.participantId);
    }
    return { referral: mapDepartmentReferral(data) };
  },

  async setStatus(referralId: string, status: import('../types').DepartmentReferralStatus, updatedById: string): Promise<{ referral: import('../types').DepartmentReferral }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('DepartmentReferral')
      .update({ status, joinedAt: status === 'JOINED' ? now : null, updatedById, updatedAt: now })
      .eq('id', referralId)
      .select(DEPARTMENT_REFERRAL_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update department');
    return { referral: mapDepartmentReferral(data) };
  },
};

const STAGE_CHANGE_SELECT = '*, changedBy:User!ParticipantStageChange_changedById_fkey(id, name)';

const mapStageChange = (row: any): import('../types').ParticipantStageChange => ({
  id: row.id,
  participantId: row.participantId,
  stage: row.stage,
  note: row.note ?? null,
  changedById: row.changedById ?? null,
  changedByName: withActedAs(row.changedBy?.name ?? null, row.changedByActedAs),
  changedAt: row.changedAt,
});

export const participantStageChangesApi = {
  async getForParticipant(participantId: string): Promise<{ changes: import('../types').ParticipantStageChange[] }> {
    const { data, error } = await supabase.from('ParticipantStageChange').select(STAGE_CHANGE_SELECT)
      .eq('participantId', participantId).order('changedAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { changes: ((data as any[]) || []).map(mapStageChange) };
  },

  async create(input: { participantId: string; stage: import('../types').JourneyStage; note?: string | null; changedById: string }): Promise<{ change: import('../types').ParticipantStageChange }> {
    const { data, error } = await supabase.from('ParticipantStageChange')
      .insert([{ participantId: input.participantId, stage: input.stage, note: input.note?.trim() || null, changedById: input.changedById }])
      .select(STAGE_CHANGE_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to move journey stage');
    return { change: mapStageChange(data) };
  },
};

export const faithThreadReadsApi = {
  async getForUser(userId: string): Promise<{ reads: Map<string, string> }> {
    const { data, error } = await supabase.from('FaithThreadRead').select('participantId, trail, lastReadAt').eq('userId', userId);
    if (error) throw new Error(error.message);
    return { reads: new Map(((data as any[]) || []).map((r) => [`${r.participantId}:${r.trail}`, r.lastReadAt])) };
  },

  async markRead(userId: string, participantId: string, trail: 'coach' | 'office'): Promise<string> {
    const lastReadAt = new Date().toISOString();
    const { error } = await supabase.from('FaithThreadRead')
      .upsert([{ userId, participantId, trail, lastReadAt }], { onConflict: 'userId,participantId,trail' });
    if (error) throw new Error(error.message);
    return lastReadAt;
  },
};

export const participantHandoversApi = {
  async getForParticipants(participantIds: string[]): Promise<{ handovers: import('../types').ParticipantHandover[] }> {
    if (participantIds.length === 0) return { handovers: [] };
    const { data, error } = await supabase.from('ParticipantHandover').select('*')
      .in('participantId', participantIds).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { handovers: ((data as any[]) || []).map(mapParticipantHandover) };
  },
};

// ── Groups ────────────────────────────────────────────────────────────────────

const GROUP_SELECT = '*, support:User!Group_supportId_fkey(id, name), members:GroupParticipant(participantId)';

const mapGroup = (row: any): import('../types').Group => ({
  id: row.id,
  cohortId: row.cohortId,
  name: row.name,
  supportId: row.supportId ?? null,
  supportName: row.support?.name ?? null,
  participantCount: (row.members ?? []).length,
  meetingDay: row.meetingDay ?? null,
  meetingTime: row.meetingTime ?? null,
  meetingDurationMins: row.meetingDurationMins ?? null,
  callPlatform: row.callPlatform ?? null,
  callLink: row.callLink ?? null,
  archivedAt: row.archivedAt ?? null,
  archivedById: row.archivedById ?? null,
  isTeenGroup: row.isTeenGroup === true,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const GROUP_ONBOARDING_STATUS_SELECT = `
  *,
  updatedBy:User!GroupOnboardingStatus_updatedById_fkey(id, name),
  group:Group!GroupOnboardingStatus_groupId_fkey(
    id,
    name,
    supportId,
    support:User!Group_supportId_fkey(id, name),
    members:GroupParticipant(participantId)
  )
`.trim();

const PARTICIPANT_ONBOARDING_STATUS_SELECT = `
  *,
  updatedBy:User!ParticipantOnboardingStatus_updatedById_fkey(id, name),
  participant:Participant!ParticipantOnboardingStatus_participantId_fkey(
    id,
    fullName,
    group:GroupParticipant(group:Group(id, name))
  )
`.trim();

const ONBOARDING_EVENT_SELECT = `
  *,
  actor:User!OnboardingEvent_actorId_fkey(id, name, role),
  participant:Participant(id, fullName),
  group:Group!OnboardingEvent_groupId_fkey(
    id,
    name,
    supportId,
    support:User!Group_supportId_fkey(id, name)
  )
`.trim();

const mapGroupOnboardingStatus = (row: any): import('../types').GroupOnboardingStatus => ({
  id: row.id,
  groupId: row.groupId,
  groupName: row.group?.name ?? null,
  supportId: row.group?.supportId ?? null,
  supportName: row.group?.support?.name ?? null,
  participantCount: (row.group?.members ?? []).length,
  groupCreated: !!row.groupCreated,
  updatedById: row.updatedById ?? null,
  updatedByName: withActedAs(row.updatedBy?.name ?? null, row.updatedByActedAs),
  updatedAt: row.updatedAt,
  completedAt: row.completedAt ?? null,
});

const mapParticipantOnboardingStatus = (row: any): import('../types').ParticipantOnboardingStatus => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  groupId: firstGroupEmbed(row.participant?.group)?.group?.id ?? null,
  groupName: firstGroupEmbed(row.participant?.group)?.group?.name ?? null,
  contacted: !!row.contacted,
  addedToGroup: !!row.addedToGroup,
  introductionDone: !!row.introductionDone,
  venueAcknowledged: !!row.venueAcknowledged,
  updatedById: row.updatedById ?? null,
  updatedByName: withActedAs(row.updatedBy?.name ?? null, row.updatedByActedAs),
  updatedAt: row.updatedAt,
});

const mapOnboardingEvent = (row: any): import('../types').OnboardingEvent => ({
  id: row.id,
  type: row.type,
  groupId: row.groupId,
  groupName: row.group?.name ?? null,
  participantId: row.participantId ?? null,
  participantName: row.participant?.fullName ?? null,
  actorId: row.actorId ?? null,
  actorName: row.actor?.name ?? null,
  actorRole: row.actor?.role ?? null,
  supportId: row.group?.supportId ?? null,
  supportName: row.group?.support?.name ?? null,
  payload: (row.payload as Record<string, unknown> | null) ?? {},
  createdAt: row.createdAt,
});

const isParticipantFullyOnboarded = (status: {
  contacted?: boolean | null;
  addedToGroup?: boolean | null;
  introductionDone?: boolean | null;
  venueAcknowledged?: boolean | null;
}) => !!status.contacted && !!status.addedToGroup && !!status.introductionDone && !!status.venueAcknowledged;

const buildVirtualGroupOnboardingStatus = (group: import('../types').Group): import('../types').GroupOnboardingStatus => ({
  id: `virtual-${group.id}`,
  groupId: group.id,
  groupName: group.name,
  supportId: group.supportId ?? null,
  supportName: group.supportName ?? null,
  participantCount: group.participantCount ?? 0,
  groupCreated: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
  completedAt: null,
});

const buildVirtualParticipantOnboardingStatus = (participant: import('../types').Participant): import('../types').ParticipantOnboardingStatus => ({
  id: `virtual-${participant.id}`,
  participantId: participant.id,
  participantName: participant.fullName,
  groupId: participant.groupId ?? null,
  groupName: participant.groupName ?? null,
  contacted: false,
  addedToGroup: false,
  introductionDone: false,
  venueAcknowledged: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
});

const deriveGroupCompletedAt = (
  groupStatus: import('../types').GroupOnboardingStatus | null | undefined,
  participantStatuses: import('../types').ParticipantOnboardingStatus[]
): string | null => {
  if (!groupStatus?.groupCreated || participantStatuses.length === 0) return null;
  return participantStatuses.every(isParticipantFullyOnboarded)
    ? groupStatus.completedAt ?? new Date().toISOString()
    : null;
};

const notifyOnboardingEvent = (eventId: string) => {
  void supabase.functions
    .invoke('notify-onboarding-event', {
      body: { eventId },
    })
    .catch(() => undefined);
};

const createOnboardingEvent = async (input: {
  type: import('../types').OnboardingEventType;
  groupId: string;
  participantId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<import('../types').OnboardingEvent> => {
  const { data, error } = await supabase
    .from('OnboardingEvent')
    .insert([{
      type: input.type,
      groupId: input.groupId,
      participantId: input.participantId ?? null,
      actorId: input.actorId ?? null,
      payload: input.payload ?? {},
    }])
    .select(ONBOARDING_EVENT_SELECT)
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to create onboarding event');
  const event = mapOnboardingEvent(data);
  notifyOnboardingEvent(event.id);
  return event;
};

// ── Auto group tags ────────────────────────────────────────────────────────
// Every group owns one cohort-scoped tag named "<group name> Support". The tag
// is tied to the group (Label.groupId) and its members mirror the group's
// assigned support (UserLabel). Manual / non-group tags (groupId null) are left
// untouched. These helpers keep the tag in sync as groups change.

const groupTagName = (groupName: string) => `${groupName} Support`;

// Labels require a distinct color (DB unique on lower(color)). Pick a colour not
// already taken: try a palette first, else generate random hexes until one is free.
const GROUP_TAG_PALETTE = [
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16', '#A855F7',
  '#3B82F6', '#22C55E', '#EAB308', '#D946EF', '#F43F5E', '#0D9488',
];

const pickUnusedLabelColor = async (): Promise<string> => {
  const { data } = await supabase.from('Label').select('color');
  const used = new Set((data ?? []).map((r: any) => String(r.color || '').toUpperCase()));
  for (const c of GROUP_TAG_PALETTE) {
    if (!used.has(c.toUpperCase())) return c;
  }
  // palette exhausted — random distinct hex
  for (let i = 0; i < 50; i++) {
    const c = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0').toUpperCase();
    if (!used.has(c)) return c;
  }
  return '#6366F1';
};

// Find-or-create the tag for a group, returning its id. Adopts an existing label
// that matches by name within the cohort (so prod's existing "Group N Support"
// labels are reused, not duplicated), and stamps cohortId/groupId on it.
const ensureGroupTag = async (group: { id: string; name: string; cohortId: string }): Promise<string> => {
  // 1. Already linked to this group?
  const { data: linked } = await supabase
    .from('Label')
    .select('id, name')
    .eq('groupId', group.id)
    .maybeSingle();
  const desiredName = groupTagName(group.name);
  if (linked) {
    if (linked.name !== desiredName) {
      await supabase.from('Label').update({ name: desiredName, updatedAt: new Date().toISOString() }).eq('id', linked.id);
    }
    return linked.id;
  }

  // 2. Adopt an existing same-name label in this cohort (or a legacy global one).
  const { data: candidates } = await supabase
    .from('Label')
    .select('id, name, cohortId, groupId')
    .ilike('name', desiredName);
  // A label still pointing at a group that no longer exists (it was deleted) is free to adopt too;
  // otherwise creating a fresh one with the same name fails on the unique name-per-cohort rule.
  const pointedAt = [...new Set((candidates ?? []).map((l: any) => l.groupId).filter(Boolean))] as string[];
  let alive = new Set<string>();
  let aliveKnown = true;
  if (pointedAt.length > 0) {
    const { data: rows, error: aliveError } = await supabase.from('Group').select('id').in('id', pointedAt);
    // If we can't tell which groups still exist, never treat a label as stale (it could belong to a live group).
    if (aliveError) aliveKnown = false;
    alive = new Set((rows ?? []).map((r: any) => r.id as string));
  }
  const adopt = (candidates ?? []).find(
    (l: any) => (!l.groupId || (aliveKnown && !alive.has(l.groupId))) && (l.cohortId === group.cohortId || l.cohortId === null)
  );
  if (adopt) {
    await supabase
      .from('Label')
      .update({ cohortId: group.cohortId, groupId: group.id, updatedAt: new Date().toISOString() })
      .eq('id', adopt.id);
    return adopt.id;
  }

  // 3. Create fresh with a distinct colour.
  const color = await pickUnusedLabelColor();
  const { data: created, error } = await supabase
    .from('Label')
    .insert([{ name: desiredName, color, cohortId: group.cohortId, groupId: group.id }])
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message || 'Failed to create group tag');
  return created.id;
};

// Make exactly the given user (if any) the holder of this tag among supports:
// removes the previous support's UserLabel link and adds the new one. Other
// tags the users hold are untouched (a user can hold many tags).
const setGroupTagSupport = async (
  tagId: string,
  newSupportId: string | null,
  previousSupportId: string | null
) => {
  if (previousSupportId && previousSupportId !== newSupportId) {
    await supabase.from('UserLabel').delete().eq('labelId', tagId).eq('userId', previousSupportId);
  }
  if (newSupportId) {
    // idempotent upsert into the (userId,labelId) PK
    await supabase.from('UserLabel').upsert({ userId: newSupportId, labelId: tagId }, { onConflict: 'userId,labelId' });
  }
};

const syncGroupTag = async (
  group: { id: string; name: string; cohortId: string; supportId?: string | null },
  previousSupportId: string | null
) => {
  const tagId = await ensureGroupTag(group);
  await setGroupTagSupport(tagId, group.supportId ?? null, previousSupportId);
  return tagId;
};

export const groupsApi = {
  // Teen groups (a Teen Support's teens, Sunday attendance only) stay out unless asked for,
  // so meetings, recaps, prayer and the group builder never see them.
  async getAll(options?: { cohortId?: string; includeArchived?: boolean; includeTeenGroups?: boolean }): Promise<{ groups: import('../types').Group[] }> {
    let query = supabase
      .from('Group')
      .select(GROUP_SELECT)
      .order('name', { ascending: true });

    if (options?.cohortId) query = query.eq('cohortId', options.cohortId);
    if (!options?.includeArchived) query = query.is('archivedAt', null);
    if (!options?.includeTeenGroups) query = query.eq('isTeenGroup', false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { groups: ((data as any[]) || []).map(mapGroup) };
  },

  // The group a given support user is directly assigned to (Group.supportId).
  // Unlike resolveSupportScopedGroups, this has no "guess the only group"
  // fallback — used when viewing a THIRD PARTY's assignment (Hub author
  // profile popup), where a wrong guess would misattribute someone else's group.
  // Pass the cohort being viewed so an old cohort's group never shows up; the
  // newest one wins if a support somehow leads two in the same cohort.
  async getForSupport(userId: string, cohortId?: string | null): Promise<{ group: import('../types').Group | null }> {
    let query = supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('supportId', userId)
      .eq('isTeenGroup', false)
      .is('archivedAt', null);
    if (cohortId) query = query.eq('cohortId', cohortId);
    const { data, error } = await query
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { group: data ? mapGroup(data as any) : null };
  },

  // The Teen Support's own teen group for a cohort (null if they hold no teens yet).
  async getTeenGroupForSupport(userId: string, cohortId: string): Promise<{ group: import('../types').Group | null }> {
    const { data, error } = await supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('supportId', userId)
      .eq('cohortId', cohortId)
      .eq('isTeenGroup', true)
      .is('archivedAt', null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { group: data ? mapGroup(data as any) : null };
  },

  async create(
    input: { cohortId: string; name: string; supportId?: string | null; meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null },
    options: { reuseEmpty?: boolean } = {},
  ): Promise<{ group: import('../types').Group }> {
    const { data: inserted, error } = await supabase
      .from('Group')
      .insert([input])
      .select(GROUP_SELECT)
      .single();

    let data: any = inserted;
    if (error && options.reuseEmpty && (error as { code?: string }).code === '23505') {
      // A first attempt already made this group but stopped before finishing (its tag, or adding people).
      // Finish it only when it is clearly that leftover: live, empty, and with this support (or none yet).
      const { data: existing, error: lookupError } = await supabase.from('Group').select(GROUP_SELECT).eq('cohortId', input.cohortId).eq('name', input.name).maybeSingle();
      const found = existing as any;
      if (!lookupError && found) {
        const { count } = await supabase.from('GroupParticipant').select('participantId', { count: 'exact', head: true }).eq('groupId', found.id);
        const sameSupport = !found.supportId || found.supportId === (input.supportId ?? null);
        if (found.archivedAt) throw new Error(`A group named "${input.name}" already exists but is archived. Rename or unarchive it, then try again.`);
        if ((count ?? 0) > 0 || !sameSupport) throw new Error(`A group named "${input.name}" already exists${(count ?? 0) > 0 ? ' with people in it' : ' with a different support'}. Rename the new group or remove the old one, then try again.`);
        if ((found.supportId ?? null) !== (input.supportId ?? null)) {
          const { data: updated, error: upError } = await supabase.from('Group').update({ supportId: input.supportId ?? null }).eq('id', found.id).select(GROUP_SELECT).single();
          if (upError || !updated) throw new Error(upError?.message || 'Failed to update group');
          data = updated;
        } else {
          data = found;
        }
      }
    }

    if (!data) throw new Error(error?.message || 'Failed to create group');
    const group = mapGroup(data);
    // Auto-create the group's cohort-scoped "<name> Support" tag and tie the support to it.
    await syncGroupTag({ id: group.id, name: group.name, cohortId: input.cohortId, supportId: group.supportId }, null);
    const actor = getCurrentUserFromStorage();
    if (group.supportId) {
      await createOnboardingEvent({
        type: 'GROUP_ASSIGNED',
        groupId: group.id,
        actorId: actor?.id ?? null,
        payload: { supportId: group.supportId, supportName: group.supportName ?? null },
      });
    }
    return { group };
  },

  async update(groupId: string, input: { name?: string; supportId?: string | null; meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null; callPlatform?: import('../types').GroupCallPlatform | null; callLink?: string | null }): Promise<{ group: import('../types').Group }> {
    const { data: current } = await supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('id', groupId)
      .single();

    const { data, error } = await supabase
      .from('Group')
      .update({ ...input, updatedAt: new Date().toISOString() })
      .eq('id', groupId)
      .select(GROUP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update group');
    const group = mapGroup(data);
    const previous = current ? mapGroup(current) : null;
    // Keep the group's tag in sync: rename it if the group was renamed, and
    // re-tie it to the new support if the support changed.
    await syncGroupTag(
      { id: group.id, name: group.name, cohortId: group.cohortId, supportId: group.supportId },
      previous?.supportId ?? null
    );
    const actor = getCurrentUserFromStorage();
    if (group.supportId && group.supportId !== previous?.supportId) {
      await createOnboardingEvent({
        type: 'GROUP_ASSIGNED',
        groupId: group.id,
        actorId: actor?.id ?? null,
        payload: {
          supportId: group.supportId,
          supportName: group.supportName ?? null,
          previousSupportId: previous?.supportId ?? null,
        },
      });
    }
    return { group };
  },

  async archive(groupId: string, archivedById?: string | null): Promise<{ group: import('../types').Group }> {
    const { data, error } = await supabase
      .from('Group')
      .update({ archivedAt: new Date().toISOString(), archivedById: archivedById ?? null, updatedAt: new Date().toISOString() })
      .eq('id', groupId)
      .select(GROUP_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to archive group');
    return { group: mapGroup(data) };
  },

  async unarchive(groupId: string): Promise<{ group: import('../types').Group }> {
    const { data, error } = await supabase
      .from('Group')
      .update({ archivedAt: null, archivedById: null, updatedAt: new Date().toISOString() })
      .eq('id', groupId)
      .select(GROUP_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to restore group');
    return { group: mapGroup(data) };
  },

  // One-off: ensure every group in a cohort has its tag created/adopted and its
  // current support linked. Used to backfill cohorts that predate auto-tagging.
  async backfillTags(cohortId: string): Promise<{ message: string; groups: number }> {
    const { data, error } = await supabase.from('Group').select(GROUP_SELECT).eq('cohortId', cohortId);
    if (error) throw new Error(error.message);
    const groups = ((data as any[]) || []).map(mapGroup);
    for (const g of groups) {
      // previousSupportId = null so we only add the link (never remove an existing one)
      await syncGroupTag({ id: g.id, name: g.name, cohortId: g.cohortId, supportId: g.supportId }, null);
    }
    return { message: `Backfilled ${groups.length} group tags`, groups: groups.length };
  },

  async getParticipants(groupId: string): Promise<{ participants: import('../types').Participant[] }> {
    const { data, error } = await supabase
      .from('GroupParticipant')
      .select(`participantId, participant:Participant(${PARTICIPANT_SELECT})`)
      .eq('groupId', groupId);

    if (error) throw new Error(error.message);
    return { participants: ((data as any[]) || []).map((r: any) => mapParticipant(r.participant)) };
  },

  async setParticipants(groupId: string, participantIds: string[]): Promise<{ message: string }> {
    const { data: groupRow } = await supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('id', groupId)
      .single();
    const previousGroup = groupRow ? mapGroup(groupRow) : null;
    const { data: previousRows } = await supabase
      .from('GroupParticipant')
      .select('participantId')
      .eq('groupId', groupId);
    const previousIds = new Set((previousRows ?? []).map((row: any) => row.participantId as string));

    const { error: delError } = await supabase
      .from('GroupParticipant')
      .delete()
      .eq('groupId', groupId);

    if (delError) throw new Error(delError.message);
    if (participantIds.length === 0) return { message: 'Members cleared' };

    const inserts = participantIds.map((participantId) => ({ groupId, participantId }));
    const { error: insError } = await supabase.from('GroupParticipant').insert(inserts);
    if (insError) throw new Error(insError.message);
    const addedParticipantIds = participantIds.filter((participantId) => !previousIds.has(participantId));
    if (addedParticipantIds.length > 0) {
      const actor = getCurrentUserFromStorage();
      await createOnboardingEvent({
        type: 'PARTICIPANTS_ASSIGNED',
        groupId,
        actorId: actor?.id ?? null,
        payload: {
          participantCount: addedParticipantIds.length,
          participantIds: addedParticipantIds,
          supportId: previousGroup?.supportId ?? null,
          supportName: previousGroup?.supportName ?? null,
        },
      });
    }
    return { message: 'Members updated' };
  },

  // Move a single participant to a group (or to `null` = unassigned).
  // Enforces one-group-per-participant by clearing any prior membership first.
  async moveParticipant(participantId: string, toGroupId: string | null): Promise<{ message: string }> {
    const { error: delError } = await supabase
      .from('GroupParticipant')
      .delete()
      .eq('participantId', participantId);
    if (delError) throw new Error(delError.message);

    if (!toGroupId) return { message: 'Participant unassigned' };

    const { error: insError } = await supabase
      .from('GroupParticipant')
      .insert({ groupId: toGroupId, participantId });
    if (insError) throw new Error(insError.message);

    const { data: groupRow } = await supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('id', toGroupId)
      .single();
    const group = groupRow ? mapGroup(groupRow) : null;
    const actor = getCurrentUserFromStorage();
    await createOnboardingEvent({
      type: 'PARTICIPANTS_ASSIGNED',
      groupId: toGroupId,
      actorId: actor?.id ?? null,
      payload: {
        participantCount: 1,
        participantIds: [participantId],
        supportId: group?.supportId ?? null,
        supportName: group?.supportName ?? null,
      },
    });
    return { message: 'Participant moved' };
  },

  // Assign many participants to groups in one batch (used by auto-distribute).
  // Clears each listed participant's prior membership, then inserts the new ones.
  async bulkAssign(assignments: Array<{ participantId: string; groupId: string }>): Promise<{ message: string }> {
    if (assignments.length === 0) return { message: 'Nothing to assign' };
    const participantIds = assignments.map((a) => a.participantId);

    const { error: delError } = await supabase
      .from('GroupParticipant')
      .delete()
      .in('participantId', participantIds);
    if (delError) throw new Error(delError.message);

    const { error: insError } = await supabase
      .from('GroupParticipant')
      .insert(assignments.map((a) => ({ groupId: a.groupId, participantId: a.participantId })));
    if (insError) throw new Error(insError.message);

    const actor = getCurrentUserFromStorage();
    const byGroup = assignments.reduce<Record<string, string[]>>((acc, a) => {
      (acc[a.groupId] ??= []).push(a.participantId);
      return acc;
    }, {});
    await Promise.all(
      Object.entries(byGroup).map(([groupId, ids]) =>
        createOnboardingEvent({
          type: 'PARTICIPANTS_ASSIGNED',
          groupId,
          actorId: actor?.id ?? null,
          payload: { participantCount: ids.length, participantIds: ids, supportId: null, supportName: null },
        })
      )
    );
    return { message: `${assignments.length} participants assigned` };
  },
};

export const groupOnboardingStatusApi = {
  async getForCohort(cohortId: string): Promise<{ statuses: import('../types').GroupOnboardingStatus[] }> {
    const { data: groups, error: groupError } = await supabase
      .from('Group')
      .select(GROUP_SELECT)
      .eq('cohortId', cohortId)
      .eq('isTeenGroup', false)
      .order('name', { ascending: true });
    if (groupError) throw new Error(groupError.message);

    const groupRows = ((groups as any[]) || []).map(mapGroup);
    if (groupRows.length === 0) return { statuses: [] };

    const groupIds = groupRows.map((group) => group.id);
    const { data, error } = await supabase
      .from('GroupOnboardingStatus')
      .select(GROUP_ONBOARDING_STATUS_SELECT)
      .in('groupId', groupIds);
    if (error) throw new Error(error.message);

    const statusMap = new Map<string, import('../types').GroupOnboardingStatus>();
    ((data as any[]) || []).forEach((row) => {
      const status = mapGroupOnboardingStatus(row);
      statusMap.set(status.groupId, status);
    });

    return {
      statuses: groupRows.map((group) =>
        statusMap.get(group.id) || buildVirtualGroupOnboardingStatus(group)
      ),
    };
  },

  async getForSupport(userId: string, cohortId?: string): Promise<{ statuses: import('../types').GroupOnboardingStatus[] }> {
    const groupRows = await resolveSupportScopedGroups(userId, cohortId);
    if (groupRows.length === 0) return { statuses: [] };
    const groupIds = groupRows.map((group) => group.id);
    const { data, error } = await supabase
      .from('GroupOnboardingStatus')
      .select(GROUP_ONBOARDING_STATUS_SELECT)
      .in('groupId', groupIds);
    if (error) throw new Error(error.message);

    const statusMap = new Map<string, import('../types').GroupOnboardingStatus>();
    ((data as any[]) || []).forEach((row) => {
      const status = mapGroupOnboardingStatus(row);
      statusMap.set(status.groupId, status);
    });

    return {
      statuses: groupRows.map((group) =>
        statusMap.get(group.id) || buildVirtualGroupOnboardingStatus(group)
      ),
    };
  },

  async update(groupId: string, patch: {
    groupCreated?: boolean;
  }, actorId?: string | null): Promise<{ status: import('../types').GroupOnboardingStatus }> {
    const { data: existing } = await supabase
      .from('GroupOnboardingStatus')
      .select(GROUP_ONBOARDING_STATUS_SELECT)
      .eq('groupId', groupId)
      .maybeSingle();

    const previous = existing ? mapGroupOnboardingStatus(existing) : null;
    const { participants } = await groupsApi.getParticipants(groupId);
    const participantIds = participants.map((participant) => participant.id);
    const { data: participantRows } = participantIds.length > 0
      ? await supabase
        .from('ParticipantOnboardingStatus')
        .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
        .in('participantId', participantIds)
      : { data: [] as any[] };
    const participantStatuses = participants.map((participant) => {
      const matched = ((participantRows as any[]) || []).find((row) => row.participantId === participant.id);
      return matched ? mapParticipantOnboardingStatus(matched) : buildVirtualParticipantOnboardingStatus(participant);
    });
    const next = {
      groupCreated: patch.groupCreated ?? previous?.groupCreated ?? false,
    };
    const completedAt = deriveGroupCompletedAt({
      id: previous?.id ?? `virtual-${groupId}`,
      groupId,
      groupName: previous?.groupName ?? null,
      supportId: previous?.supportId ?? null,
      supportName: previous?.supportName ?? null,
      participantCount: previous?.participantCount ?? participantStatuses.length,
      updatedById: previous?.updatedById ?? null,
      updatedByName: previous?.updatedByName ?? null,
      updatedAt: previous?.updatedAt,
      completedAt: previous?.completedAt ?? null,
      ...next,
    }, participantStatuses);

    const { data, error } = await supabase
      .from('GroupOnboardingStatus')
      .upsert([{
        groupId,
        ...next,
        updatedById: actorId ?? null,
        updatedAt: new Date().toISOString(),
        completedAt,
      }], { onConflict: 'groupId' })
      .select(GROUP_ONBOARDING_STATUS_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update onboarding progress');
    const status = mapGroupOnboardingStatus(data);
    const actor = actorId ?? getCurrentUserFromStorage()?.id ?? null;
    await createOnboardingEvent({
      type: 'GROUP_CREATED_UPDATED',
      groupId,
      actorId: actor,
      payload: {
        groupCreated: status.groupCreated,
      },
    });
    if (!previous?.completedAt && status.completedAt) {
      await createOnboardingEvent({
        type: 'GROUP_COMPLETED',
        groupId,
        actorId: actor,
        payload: {
          participantCount: status.participantCount ?? 0,
        },
      });
    }
    return { status };
  },
};

export const participantOnboardingStatusApi = {
  async getForCohort(cohortId: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> {
    const { data: participants, error: participantError } = await supabase
      .from('Participant')
      .select(PARTICIPANT_SELECT)
      .eq('cohortId', cohortId)
      .eq('status', 'ACTIVE')
      .order('fullName', { ascending: true });
    if (participantError) throw new Error(participantError.message);

    const participantRows = ((participants as any[]) || []).map(mapParticipant);
    if (participantRows.length === 0) return { statuses: [] };

    const { data, error } = await supabase
      .from('ParticipantOnboardingStatus')
      .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
      .in('participantId', participantRows.map((participant) => participant.id));

    if (error) throw new Error(error.message);
    const statusMap = new Map<string, import('../types').ParticipantOnboardingStatus>();
    ((data as any[]) || []).forEach((row) => {
      const status = mapParticipantOnboardingStatus(row);
      statusMap.set(status.participantId, status);
    });

    return {
      statuses: participantRows
        .filter((participant) => participant.groupId)
        .map((participant) => statusMap.get(participant.id) || buildVirtualParticipantOnboardingStatus(participant)),
    };
  },

  async getForGroup(groupId: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> {
    const { participants } = await groupsApi.getParticipants(groupId);
    if (participants.length === 0) return { statuses: [] };

    const { data, error } = await supabase
      .from('ParticipantOnboardingStatus')
      .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
      .in('participantId', participants.map((participant) => participant.id));

    if (error) throw new Error(error.message);
    const statusMap = new Map<string, import('../types').ParticipantOnboardingStatus>();
    ((data as any[]) || []).forEach((row) => {
      const status = mapParticipantOnboardingStatus(row);
      statusMap.set(status.participantId, status);
    });

    return {
      statuses: participants.map((participant) => statusMap.get(participant.id) || buildVirtualParticipantOnboardingStatus(participant)),
    };
  },

  async getForSupport(userId: string, cohortId?: string): Promise<{ statuses: import('../types').ParticipantOnboardingStatus[] }> {
    const { participants } = await participantsApi.getAll({ cohortId, supportId: userId });
    if (participants.length === 0) return { statuses: [] };

    const { data, error } = await supabase
      .from('ParticipantOnboardingStatus')
      .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
      .in('participantId', participants.map((participant) => participant.id));

    if (error) throw new Error(error.message);
    const statusMap = new Map<string, import('../types').ParticipantOnboardingStatus>();
    ((data as any[]) || []).forEach((row) => {
      const status = mapParticipantOnboardingStatus(row);
      statusMap.set(status.participantId, status);
    });

    return {
      statuses: participants.map((participant) => statusMap.get(participant.id) || buildVirtualParticipantOnboardingStatus(participant)),
    };
  },

  async update(participantId: string, patch: {
    contacted?: boolean;
    addedToGroup?: boolean;
    introductionDone?: boolean;
    venueAcknowledged?: boolean;
  }, actorId?: string | null): Promise<{ status: import('../types').ParticipantOnboardingStatus }> {
    const { data: existing } = await supabase
      .from('ParticipantOnboardingStatus')
      .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
      .eq('participantId', participantId)
      .maybeSingle();
    const previous = existing ? mapParticipantOnboardingStatus(existing) : null;
    const next = {
      contacted: patch.contacted ?? previous?.contacted ?? false,
      addedToGroup: patch.addedToGroup ?? previous?.addedToGroup ?? false,
      introductionDone: patch.introductionDone ?? previous?.introductionDone ?? false,
      venueAcknowledged: patch.venueAcknowledged ?? previous?.venueAcknowledged ?? false,
    };

    const { data, error } = await supabase
      .from('ParticipantOnboardingStatus')
      .upsert([{
        participantId,
        ...next,
        updatedById: actorId ?? null,
        updatedAt: new Date().toISOString(),
      }], { onConflict: 'participantId' })
      .select(PARTICIPANT_ONBOARDING_STATUS_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update participant onboarding status');
    const status = mapParticipantOnboardingStatus(data);
    const actor = actorId ?? getCurrentUserFromStorage()?.id ?? null;
    if (status.groupId) {
      await createOnboardingEvent({
        type: 'PARTICIPANT_STATUS_UPDATED',
        groupId: status.groupId,
        participantId,
        actorId: actor,
        payload: next,
      });

      const [{ data: groupRow }, { data: groupStatusRow }, { statuses: groupParticipantStatuses }] = await Promise.all([
        supabase.from('Group').select(GROUP_SELECT).eq('id', status.groupId).single(),
        supabase.from('GroupOnboardingStatus').select(GROUP_ONBOARDING_STATUS_SELECT).eq('groupId', status.groupId).maybeSingle(),
        participantOnboardingStatusApi.getForGroup(status.groupId),
      ]);
      const groupStatus = groupStatusRow
        ? mapGroupOnboardingStatus(groupStatusRow)
        : groupRow
          ? buildVirtualGroupOnboardingStatus(mapGroup(groupRow))
          : null;
      const completedAt = deriveGroupCompletedAt(groupStatus, groupParticipantStatuses);
      if (groupStatus && groupStatus.completedAt !== completedAt) {
        await supabase
          .from('GroupOnboardingStatus')
          .upsert([{
            groupId: status.groupId,
            groupCreated: groupStatus.groupCreated,
            updatedById: actor ?? null,
            updatedAt: new Date().toISOString(),
            completedAt,
          }], { onConflict: 'groupId' });
      }
      if (!groupStatus?.completedAt && completedAt) {
        await createOnboardingEvent({
          type: 'GROUP_COMPLETED',
          groupId: status.groupId,
          actorId: actor,
          payload: {
            participantCount: groupParticipantStatuses.length,
          },
        });
      }
    }

    return { status };
  },
};

export const onboardingEventsApi = {
  async getForCohort(cohortId: string): Promise<{ events: import('../types').OnboardingEvent[] }> {
    const { data: groups, error: groupError } = await supabase
      .from('Group')
      .select('id')
      .eq('cohortId', cohortId);
    if (groupError) throw new Error(groupError.message);
    const groupIds = (groups ?? []).map((row: any) => row.id);
    if (groupIds.length === 0) return { events: [] };

    const { data, error } = await supabase
      .from('OnboardingEvent')
      .select(ONBOARDING_EVENT_SELECT)
      .in('groupId', groupIds)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { events: ((data as any[]) || []).map(mapOnboardingEvent) };
  },

  async getForSupport(userId: string, cohortId?: string): Promise<{ events: import('../types').OnboardingEvent[] }> {
    const groupIds = (await resolveSupportScopedGroups(userId, cohortId)).map((group) => group.id);
    if (groupIds.length === 0) return { events: [] };

    const { data, error } = await supabase
      .from('OnboardingEvent')
      .select(ONBOARDING_EVENT_SELECT)
      .in('groupId', groupIds)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { events: ((data as any[]) || []).map(mapOnboardingEvent) };
  },
};

// ── Attendance ────────────────────────────────────────────────────────────────

const ATTENDANCE_SELECT = '*, participant:Participant(id, fullName)';

const mapAttendance = (row: any): import('../types').AttendanceRecord => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? undefined,
  weekId: row.weekId,
  status: row.status,
  markedById: row.markedById ?? null,
  markedAt: row.markedAt,
  lateExcused: row.lateExcused ?? false,
  lateExcusedAt: row.lateExcusedAt ?? null,
  lateExcusedById: row.lateExcusedById ?? null,
});

const mapAttendanceSession = (row: any): import('../types').AttendanceSession => ({
  weekId: row.weekId,
  autoFinalizeAtNoon: row.autoFinalizeAtNoon ?? true,
  startedAt: row.startedAt ?? null,
  startedById: row.startedById ?? null,
  closesAt: row.closesAt ?? null,
  finalizedAt: row.finalizedAt ?? null,
  finalizedById: row.finalizedById ?? null,
  finalizationMethod: row.finalizationMethod ?? null,
  reopenedAt: row.reopenedAt ?? null,
});

const mapAttendanceExcusal = (row: any): import('../types').AttendanceExcusal => ({
  attendanceRecordId: row.attendanceRecordId,
  note: row.note,
  excusedById: row.excusedById ?? null,
  excusedByName: row.excusedBy?.name ?? null,
  createdAt: row.createdAt,
});

export const attendanceApi = {
  async getSession(weekId: number): Promise<{ session: import('../types').AttendanceSession | null }> {
    const { data, error } = await supabase
      .from('AttendanceSession')
      .select('*')
      .eq('weekId', weekId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { session: data ? mapAttendanceSession(data) : null };
  },

  async getForWeek(options: { weekId: number; supportId?: string }): Promise<{ records: import('../types').AttendanceRecord[] }> {
    let query = supabase
      .from('AttendanceRecord')
      .select(ATTENDANCE_SELECT)
      .eq('weekId', options.weekId);

    if (options.supportId) {
      const groupIds = (await resolveSupportScopedGroups(options.supportId)).map((group) => group.id);
      if (groupIds.length === 0) return { records: [] };
      const { data: gpRows } = await supabase
        .from('GroupParticipant')
        .select('participantId')
        .in('groupId', groupIds);
      const participantIds = (gpRows ?? []).map((r: any) => r.participantId);
      if (participantIds.length === 0) return { records: [] };
      query = query.in('participantId', participantIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { records: ((data as any[]) || []).map(mapAttendance) };
  },

  // Records for several weeks at once, so a week picker can show what's marked
  // without a query per week.
  async getForWeeks(options: { weekIds: number[]; participantIds: string[] }): Promise<{ records: import('../types').AttendanceRecord[] }> {
    if (options.weekIds.length === 0 || options.participantIds.length === 0) return { records: [] };
    const { data, error } = await supabase
      .from('AttendanceRecord')
      .select(ATTENDANCE_SELECT)
      .in('weekId', options.weekIds)
      .in('participantId', options.participantIds);
    if (error) throw new Error(error.message);
    return { records: ((data as any[]) || []).map(mapAttendance) };
  },

  async mark(participantId: string, weekId: number, status: import('../types').AttendanceStatus): Promise<{ record: import('../types').AttendanceRecord }> {
    const { data, error } = await supabase.rpc('mark_shared_attendance', {
      p_participant_id: participantId,
      p_week_id: weekId,
      p_status: status,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to mark attendance');
    return { record: mapAttendance(data) };
  },

  async bulkMark(entries: Array<{ participantId: string; weekId: number; status: import('../types').AttendanceStatus }>): Promise<{ records: import('../types').AttendanceRecord[] }> {
    if (entries.length === 0) return { records: [] };
    const records = await Promise.all(entries.map((entry) => this.mark(entry.participantId, entry.weekId, entry.status).then((result) => result.record)));
    return { records };
  },

  async finalize(weekId: number): Promise<{ session: import('../types').AttendanceSession }> {
    const { data, error } = await supabase.rpc('finalize_shared_attendance', { p_week_id: weekId });
    if (error || !data) throw new Error(error?.message || 'Failed to finalise attendance');
    return { session: mapAttendanceSession(data) };
  },

  async setAutoFinalize(weekId: number, enabled: boolean): Promise<{ session: import('../types').AttendanceSession }> {
    const { data, error } = await supabase.rpc('set_attendance_auto_finalize', { p_week_id: weekId, p_enabled: enabled });
    if (error || !data) throw new Error(error?.message || 'Failed to update automatic finalisation');
    return { session: mapAttendanceSession(data) };
  },

  async reopen(weekId: number): Promise<{ session: import('../types').AttendanceSession }> {
    const { data, error } = await supabase.rpc('reopen_shared_attendance', { p_week_id: weekId });
    if (error || !data) throw new Error(error?.message || 'Failed to reopen attendance');
    return { session: mapAttendanceSession(data) };
  },

  async startWindow(weekId: number): Promise<{ session: import('../types').AttendanceSession }> {
    const { data, error } = await supabase.rpc('start_attendance_window', { p_week_id: weekId });
    if (error || !data) throw new Error(error?.message || 'Failed to start attendance');
    return { session: mapAttendanceSession(data) };
  },

  async excuseLateness(recordId: string, note: string): Promise<{ record: import('../types').AttendanceRecord }> {
    const { data, error } = await supabase.rpc('excuse_lateness', { p_record_id: recordId, p_note: note });
    if (error || !data) throw new Error(error?.message || 'Failed to excuse this record');
    return { record: mapAttendance(data) };
  },
};

export const attendanceExcusalsApi = {
  async getForRecords(recordIds: string[]): Promise<{ excusals: import('../types').AttendanceExcusal[] }> {
    if (recordIds.length === 0) return { excusals: [] };
    const { data, error } = await supabase
      .from('AttendanceExcusal')
      .select('*, excusedBy:User!AttendanceExcusal_excusedById_fkey(id, name)')
      .in('attendanceRecordId', recordIds);
    if (error) throw new Error(error.message);
    return { excusals: ((data as any[]) || []).map(mapAttendanceExcusal) };
  },
};

const ATTENDANCE_FOLLOW_UP_TASK_SELECT = '*, participant:Participant(id, fullName), support:User!AttendanceFollowUpTask_supportId_fkey(id, name)';

const mapAttendanceFollowUpTask = (row: any): import('../types').AttendanceFollowUpTask => ({
  id: row.id,
  attendanceRecordId: row.attendanceRecordId,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  weekId: row.weekId,
  supportId: row.supportId,
  supportName: row.support?.name ?? null,
  dueAt: row.dueAt,
  status: row.status,
  completedAt: row.completedAt ?? null,
  completionNote: row.completionNote ?? null,
});

export const attendanceFollowUpTasksApi = {
  async getForWeek(weekId: number): Promise<{ tasks: import('../types').AttendanceFollowUpTask[] }> {
    const { data, error } = await supabase
      .from('AttendanceFollowUpTask')
      .select(ATTENDANCE_FOLLOW_UP_TASK_SELECT)
      .eq('weekId', weekId)
      .neq('status', 'CANCELLED')
      .order('dueAt');
    if (error) throw new Error(error.message);
    return { tasks: ((data as any[]) || []).map(mapAttendanceFollowUpTask) };
  },

  async getMine(weekId: number, supportId: string): Promise<{ tasks: import('../types').AttendanceFollowUpTask[] }> {
    const { data, error } = await supabase
      .from('AttendanceFollowUpTask')
      .select(ATTENDANCE_FOLLOW_UP_TASK_SELECT)
      .eq('weekId', weekId)
      .eq('supportId', supportId)
      .neq('status', 'CANCELLED')
      .order('dueAt');
    if (error) throw new Error(error.message);
    return { tasks: ((data as any[]) || []).map(mapAttendanceFollowUpTask) };
  },

  async setDone(taskId: string, done: boolean, completionNote?: string): Promise<{ task: import('../types').AttendanceFollowUpTask }> {
    const { data, error } = await supabase.rpc('complete_attendance_follow_up_task', {
      p_task_id: taskId,
      p_done: done,
      p_note: completionNote ?? null,
    });
    if (error || !data) throw new Error(error?.message || 'Could not update the attendance follow-up');
    return { task: mapAttendanceFollowUpTask(data) };
  },
};

// ── Support Hubs (Phase 3) ────────────────────────────────────────────────────
// Named supportHubsApi (not hubApi) — hubApi below is the Community forum.

const SUPPORT_HUB_SELECT = '*, lead:User!SupportHub_leadUserId_fkey(id, name), assistantLead:User!SupportHub_assistantLeadUserId_fkey(id, name)';

const mapSupportHub = (row: any): import('../types').SupportHub => ({
  id: row.id,
  cohortId: row.cohortId,
  name: row.name,
  leadUserId: row.leadUserId ?? null,
  leadName: row.lead?.name ?? null,
  assistantLeadUserId: row.assistantLeadUserId ?? null,
  assistantLeadName: row.assistantLead?.name ?? null,
  assistantPermissions: row.assistantPermissions ?? [],
  recapLeadUserIds: row.recapLeadUserIds ?? [],
  prayerLeadUserIds: row.prayerLeadUserIds ?? [],
  meetingDay: row.meetingDay ?? null,
  meetingTime: row.meetingTime ?? null,
  meetingDurationMins: row.meetingDurationMins ?? null,
  callPlatform: row.callPlatform ?? null,
  callLink: row.callLink ?? null,
  createdAt: row.createdAt,
});

export const supportHubsApi = {
  async getAll(cohortId: string): Promise<{ hubs: import('../types').SupportHub[] }> {
    const { data, error } = await supabase
      .from('SupportHub')
      .select(SUPPORT_HUB_SELECT)
      .eq('cohortId', cohortId)
      .order('name');
    if (error) throw new Error(error.message);
    return { hubs: ((data as any[]) || []).map(mapSupportHub) };
  },

  async create(input: { cohortId: string; name: string; leadUserId?: string | null }): Promise<{ hub: import('../types').SupportHub }> {
    const { data, error } = await supabase
      .from('SupportHub')
      .insert([{ cohortId: input.cohortId, name: input.name, leadUserId: input.leadUserId || null }])
      .select(SUPPORT_HUB_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to create hub');
    return { hub: mapSupportHub(data) };
  },

  async update(hubId: string, input: { name?: string; leadUserId?: string | null; assistantLeadUserId?: string | null; recapLeadUserIds?: string[]; prayerLeadUserIds?: string[] }): Promise<{ hub: import('../types').SupportHub }> {
    const { data, error } = await supabase
      .from('SupportHub')
      .update(input)
      .eq('id', hubId)
      .select(SUPPORT_HUB_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update hub');
    return { hub: mapSupportHub(data) };
  },

  // The hub lead (or admin) chooses which of the assistant's actions
  // (MEETING/ATTENDANCE/MESSAGE) they can run — see app_hub_can in
  // 20260926120000_hub_roles.sql.
  async setAssistantPermissions(hubId: string, perms: import('../types').AssistantHubPermission[]): Promise<{ id: string; assistantPermissions: import('../types').AssistantHubPermission[] }> {
    const { data, error } = await supabase.rpc('set_assistant_permissions', { p_hub_id: hubId, p_perms: perms });
    if (error || !data) throw new Error(error?.message || 'Failed to save assistant permissions');
    return data as { id: string; assistantPermissions: import('../types').AssistantHubPermission[] };
  },

  // The hub's IT support(s) — an operational support covering 2+ hubs without
  // being a HubMembership member of any of them.
  async getItSupports(hubId: string): Promise<{ itSupports: import('../types').HubItSupportEntry[] }> {
    const { data, error } = await supabase
      .from('HubItSupport')
      .select('user:User(id, name)')
      .eq('hubId', hubId);
    if (error) throw new Error(error.message);
    return { itSupports: ((data as any[]) || []).map((r) => ({ userId: r.user?.id, name: r.user?.name })).filter((r) => r.userId) };
  },

  // Diffs against the hub's current IT-support list, same shape as setMembers.
  async setItSupports(hubId: string, userIds: string[]): Promise<{ message: string }> {
    const { data: existingRows, error: existingError } = await supabase
      .from('HubItSupport')
      .select('userId')
      .eq('hubId', hubId);
    if (existingError) throw new Error(existingError.message);
    const existingIds = new Set(((existingRows as any[]) || []).map((r) => r.userId as string));
    const nextIds = new Set(userIds);
    const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
    const toAdd = userIds.filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('HubItSupport').delete().eq('hubId', hubId).in('userId', toRemove);
      if (removeError) throw new Error(removeError.message);
    }
    if (toAdd.length > 0) {
      const { error: insError } = await supabase.from('HubItSupport').insert(toAdd.map((userId) => ({ hubId, userId })));
      if (insError) throw new Error(insError.message);
    }
    return { message: 'IT supports updated' };
  },

  // Members with a note about them in this hub — they get a ★ on the hub card.
  async getMembersWithNotes(hubId: string): Promise<{ userIds: string[] }> {
    const { data, error } = await supabase
      .from('SupportNote')
      .select('supportId')
      .eq('hubId', hubId)
      .eq('noteType', 'NOTE');
    if (error) throw new Error(error.message);
    return { userIds: [...new Set(((data as any[]) || []).map((r) => r.supportId as string))] };
  },

  async remove(hubId: string): Promise<void> {
    const { error } = await supabase.from('SupportHub').delete().eq('id', hubId);
    if (error) throw new Error(error.message);
  },

  // Every membership row for a cohort in one call, so callers (Supports page,
  // Hubs page) can build a userId -> hub map without a request per hub.
  async getMembershipsForCohort(cohortId: string): Promise<{ memberships: import('../types').HubMembership[] }> {
    const { data, error } = await supabase
      .from('HubMembership')
      .select('*')
      .eq('cohortId', cohortId);
    if (error) throw new Error(error.message);
    return { memberships: (data as any[]) || [] };
  },

  async getMembers(hubId: string): Promise<{ members: import('../types').User[] }> {
    const { data, error } = await supabase
      .from('HubMembership')
      .select('user:User(id, name, phone, role)')
      .eq('hubId', hubId);
    if (error) throw new Error(error.message);
    return { members: ((data as any[]) || []).map((r) => r.user).filter(Boolean) };
  },

  // Diffs against the hub's current member list rather than delete-then-insert
  // everyone: only removed members are deleted and only new members are
  // inserted, so unchanged members' rows are untouched and the "added to a
  // hub" trigger (AFTER INSERT on HubMembership) doesn't fire for them. A
  // support can only be in one hub per cohort, so any newly-added member is
  // first cleared from whatever hub they were in.
  async setMembers(hubId: string, cohortId: string, userIds: string[]): Promise<{ message: string }> {
    const { data: existingRows, error: existingError } = await supabase
      .from('HubMembership')
      .select('userId')
      .eq('cohortId', cohortId)
      .eq('hubId', hubId);
    if (existingError) throw new Error(existingError.message);
    const existingIds = new Set(((existingRows as any[]) || []).map((r) => r.userId as string));
    const nextIds = new Set(userIds);
    const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
    const toAdd = userIds.filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from('HubMembership')
        .delete()
        .eq('cohortId', cohortId)
        .eq('hubId', hubId)
        .in('userId', toRemove);
      if (removeError) throw new Error(removeError.message);
    }

    if (toAdd.length > 0) {
      const { error: clearPriorMembershipError } = await supabase
        .from('HubMembership')
        .delete()
        .eq('cohortId', cohortId)
        .in('userId', toAdd);
      if (clearPriorMembershipError) throw new Error(clearPriorMembershipError.message);

      const { error: insError } = await supabase
        .from('HubMembership')
        .insert(toAdd.map((userId) => ({ hubId, userId, cohortId })));
      if (insError) throw new Error(insError.message);
    }
    return { message: 'Members updated' };
  },
};

const mapSupportNote = (row: any): import('../types').SupportNote => ({
  id: row.id,
  supportId: row.supportId,
  authorId: row.authorId ?? null,
  authorName: row.author?.name ?? null,
  hubId: row.hubId ?? null,
  noteType: row.noteType,
  body: row.body,
  createdAt: row.createdAt,
});

export const supportNotesApi = {
  async getForSupport(supportId: string): Promise<{ notes: import('../types').SupportNote[] }> {
    const { data, error } = await supabase
      .from('SupportNote')
      .select('*, author:User!SupportNote_authorId_fkey(id, name)')
      .eq('supportId', supportId)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: ((data as any[]) || []).map(mapSupportNote) };
  },

  async create(input: { supportId: string; hubId?: string | null; noteType?: import('../types').SupportNoteType; body: string }): Promise<{ note: import('../types').SupportNote }> {
    const { data, error } = await supabase
      .from('SupportNote')
      .insert([{ supportId: input.supportId, hubId: input.hubId ?? null, noteType: input.noteType ?? 'NOTE', body: input.body }])
      .select('*, author:User!SupportNote_authorId_fkey(id, name)')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to save note');
    return { note: mapSupportNote(data) };
  },

  async update(noteId: string, body: string): Promise<{ note: import('../types').SupportNote }> {
    const { data, error } = await supabase
      .from('SupportNote')
      .update({ body })
      .eq('id', noteId)
      .select('*, author:User!SupportNote_authorId_fkey(id, name)')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update note');
    return { note: mapSupportNote(data) };
  },

  // Supports with a note in one of these hubs, or a note not tied to any hub — they get a ★.
  async getSupportIdsWithNotes(hubIds: string[]): Promise<{ supportIds: string[] }> {
    const { data, error } = await supabase
      .from('SupportNote')
      .select('supportId, hubId')
      .eq('noteType', 'NOTE');
    if (error) throw new Error(error.message);
    const inCohort = new Set(hubIds);
    const ids = ((data as any[]) || []).filter((r) => !r.hubId || inCohort.has(r.hubId)).map((r) => r.supportId as string);
    return { supportIds: [...new Set(ids)] };
  },
};

const mapSupportSession = (row: any): import('../types').SupportSession => ({
  id: row.id,
  cohortId: row.cohortId,
  type: row.type,
  title: row.title,
  sessionDate: row.sessionDate,
  weekId: row.weekId ?? null,
  hubId: row.hubId ?? null,
  createdById: row.createdById ?? null,
  createdAt: row.createdAt,
});

export const supportSessionsApi = {
  async mark(input: { status: import('../types').SupportAttendanceStatus; userId: string; hubId?: string; weekId?: number; sessionId?: string }): Promise<{ attendance: import('../types').SupportSessionAttendance }> {
    const { data, error } = await supabase.rpc('mark_support_attendance', {
      p_status: input.status,
      p_user_id: input.userId,
      p_hub_id: input.hubId ?? null,
      p_week_id: input.weekId ?? null,
      p_session_id: input.sessionId ?? null,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to mark attendance');
    return { attendance: data as import('../types').SupportSessionAttendance };
  },

  // Every member's mark for one hub's recap in one week, so the lead's marking
  // screen can show current status without a call per member.
  async getForHubWeek(hubId: string, weekId: number): Promise<{ attendance: Array<{ userId: string; status: import('../types').SupportAttendanceStatus }>; session?: { id: string; notes: string | null; submittedAt: string | null } | null }> {
    const { data: session, error: sessionError } = await supabase
      .from('SupportSession')
      .select('id, notes, submittedAt')
      .eq('hubId', hubId)
      .eq('weekId', weekId)
      .eq('type', 'SUNDAY_RECAP')
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) return { attendance: [], session: null };
    const { data, error } = await supabase
      .from('SupportSessionAttendance')
      .select('userId, status')
      .eq('sessionId', (session as any).id);
    if (error) throw new Error(error.message);
    return { attendance: (data as any[]) || [], session: session as { id: string; notes: string | null; submittedAt: string | null } };
  },

  // Phase 4 — pre-cohort trainings / get-togethers: every session of the given
  // type(s) in a cohort, plus every mark on them in one call, so the admin
  // Trainings tab, the hub lead's My Hub tab, and the "x/y trainings" badges
  // on the Groups/Supports pages can all be built from one fetch.
  async getForCohort(cohortId: string | string[], types: import('../types').SupportSessionType[]): Promise<{ sessions: import('../types').SupportSession[]; attendance: Array<{ sessionId: string; userId: string; status: import('../types').SupportAttendanceStatus; learned?: string | null; willApply?: string | null }> }> {
    let query = supabase
      .from('SupportSession')
      .select('*')
      .in('type', types)
      .order('sessionDate', { ascending: false });
    query = Array.isArray(cohortId) ? query.in('cohortId', cohortId) : query.eq('cohortId', cohortId);
    const { data: sessions, error: sessionsError } = await query;
    if (sessionsError) throw new Error(sessionsError.message);
    const mapped = ((sessions as any[]) || []).map(mapSupportSession);
    const ids = mapped.map((s) => s.id);
    if (ids.length === 0) return { sessions: mapped, attendance: [] };
    const { data: attendance, error: attendanceError } = await supabase
      .from('SupportSessionAttendance')
      .select('sessionId, userId, status, learned, willApply')
      .in('sessionId', ids);
    if (attendanceError) throw new Error(attendanceError.message);
    return { sessions: mapped, attendance: (attendance as any[]) || [] };
  },

  // "What I learned": pre-cohort trainings this support was marked present
  // (or late) at and hasn't written about yet, from 12 noon on the day.
  async getMyPendingLearned(userId: string): Promise<{ sessions: import('../types').SupportSession[] }> {
    const { data, error } = await supabase
      .from('SupportSessionAttendance')
      .select('status, learned, session:SupportSession!inner(*, cohort:Cohort(status))')
      .eq('userId', userId)
      .in('status', ['PRESENT', 'LATE'])
      .is('learned', null)
      .eq('session.type', 'PRE_COHORT_TRAINING');
    if (error) throw new Error(error.message);
    const now = Date.now();
    // Noon (local) on the training's day; sessionDate is stored as local midnight.
    const noonOf = (iso: string) => { const d = new Date(iso); d.setHours(12, 0, 0, 0); return d.getTime(); };
    return {
      sessions: ((data as any[]) || [])
        // Only trainings for a cohort that's still running or upcoming.
        .filter((row) => !['COMPLETED', 'ARCHIVED'].includes(row.session?.cohort?.status))
        .map((row) => mapSupportSession(row.session))
        .filter((s) => noonOf(s.sessionDate) <= now),
    };
  },

  async submitLearned(sessionId: string, learned: string, willApply: string): Promise<void> {
    const { error } = await supabase.rpc('submit_training_learned', { p_session_id: sessionId, p_learned: learned, p_will_apply: willApply });
    if (error) throw new Error(error.message);
  },

  // Admin-only create/edit/delete for trainings and get-togethers (RLS: see
  // 20260925040000_pre_cohort_trainings.sql). Recap sessions stay RPC-only.
  async create(input: { cohortId: string; type: 'PRE_COHORT_TRAINING' | 'GET_TOGETHER'; title: string; sessionDate: string }): Promise<{ session: import('../types').SupportSession }> {
    const { data, error } = await supabase
      .from('SupportSession')
      .insert([{ cohortId: input.cohortId, type: input.type, title: input.title, sessionDate: input.sessionDate }])
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to create session');
    return { session: mapSupportSession(data) };
  },

  async update(sessionId: string, input: { title?: string; sessionDate?: string }): Promise<{ session: import('../types').SupportSession }> {
    const { data, error } = await supabase
      .from('SupportSession')
      .update(input)
      .eq('id', sessionId)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update session');
    return { session: mapSupportSession(data) };
  },

  async remove(sessionId: string): Promise<void> {
    const { error } = await supabase.from('SupportSession').delete().eq('id', sessionId);
    if (error) throw new Error(error.message);
  },
};

// Group Discussion for staff: the group's support posts and moderates, admins
// moderate, hub leads (with "See groups") read. Access is checked in each RPC.
export const groupDiscussionApi = {
  async feed(groupId: string, before?: string | null): Promise<import('../types').DiscussionFeed> {
    const { data, error } = await supabase.rpc('group_discussion_feed', { p_group_id: groupId, p_before: before ?? null });
    if (error) throw new Error(error.message);
    return data as import('../types').DiscussionFeed;
  },
  // Admin Dashboard line: this week's posts/replies, how many groups are talking, reports waiting.
  async summary(cohortId: string): Promise<{ groups: number; postsAndReplies: number; activeGroups: number; openReports: number }> {
    const { data, error } = await supabase.rpc('admin_discussion_summary', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return data as { groups: number; postsAndReplies: number; activeGroups: number; openReports: number };
  },
  // The group's support only: new posts/replies since they last opened the tab (0 for others).
  async unseen(groupId: string): Promise<number> {
    const { data, error } = await supabase.rpc('group_discussion_unseen', { p_group_id: groupId });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },
  async markSeen(groupId: string): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_mark_seen', { p_group_id: groupId });
    if (error) throw new Error(error.message);
  },
  async activity(groupId: string): Promise<import('../types').DiscussionActivity> {
    const { data, error } = await supabase.rpc('group_discussion_activity', { p_group_id: groupId });
    if (error) throw new Error(error.message);
    return data as import('../types').DiscussionActivity;
  },
  async post(groupId: string, body: string, mentions: import('../types').DiscussionMention[] = []): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_post', { p_group_id: groupId, p_body: body, p_mentions: mentions.map(({ kind, id }) => ({ kind, id })) });
    if (error) throw new Error(error.message);
  },
  async intro(groupId: string, body: string): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_intro', { p_group_id: groupId, p_body: body });
    if (error) throw new Error(error.message);
  },
  async onboardingProgress(groupId: string): Promise<import('../types').OnboardingProgress> {
    const { data, error } = await supabase.rpc('group_onboarding_progress', { p_group_id: groupId });
    if (error) throw new Error(error.message);
    return data as import('../types').OnboardingProgress;
  },
  async cohortOnboardingProgress(cohortId: string): Promise<import('../types').OnboardingProgress> {
    const { data, error } = await supabase.rpc('cohort_onboarding_progress', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return data as import('../types').OnboardingProgress;
  },
  async reply(postId: string, body: string, mentions: import('../types').DiscussionMention[] = []): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_reply', { p_post_id: postId, p_body: body, p_mentions: mentions.map(({ kind, id }) => ({ kind, id })) });
    if (error) throw new Error(error.message);
  },
  async like(postId: string, like: boolean): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_like', { p_post_id: postId, p_like: like });
    if (error) throw new Error(error.message);
  },
  async deleteOwn(kind: 'POST' | 'REPLY', id: string): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_delete', { p_kind: kind, p_id: id });
    if (error) throw new Error(error.message);
  },
  async pin(postId: string, pin: boolean): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_pin', { p_post_id: postId, p_pin: pin });
    if (error) throw new Error(error.message);
  },
  async moderate(kind: 'POST' | 'REPLY', id: string, action: 'KEEP' | 'REMOVE'): Promise<void> {
    const { error } = await supabase.rpc('group_discussion_moderate', { p_kind: kind, p_id: id, p_action: action });
    if (error) throw new Error(error.message);
  },
};

export const myHubApi = {
  async get(cohortId: string): Promise<import('../types').MyHubPayload> {
    const { data, error } = await supabase.rpc('get_my_hub', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return (data as import('../types').MyHubPayload) ?? { hub: null, isLead: false, members: [], messages: [], myAttendance: [] };
  },

  async postMessage(hubId: string, subject: string, body: string): Promise<{ message: import('../types').HubMessage }> {
    const { data, error } = await supabase.rpc('post_hub_message', { p_hub_id: hubId, p_subject: subject, p_body: body });
    if (error || !data) throw new Error(error?.message || 'Failed to send message');
    return { message: data as import('../types').HubMessage };
  },

  async acknowledgeMessage(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('acknowledge_hub_message', { p_message_id: messageId });
    if (error) throw new Error(error.message);
  },

  async updateMessage(messageId: string, subject: string, body: string): Promise<{ message: import('../types').HubMessage }> {
    const { data, error } = await supabase.rpc('update_hub_message', { p_message_id: messageId, p_subject: subject, p_body: body });
    if (error || !data) throw new Error(error?.message || 'Failed to update message');
    return { message: data as import('../types').HubMessage };
  },

  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_hub_message', { p_message_id: messageId });
    if (error) throw new Error(error.message);
  },

  async updateMeeting(hubId: string, input: { meetingDay: string | null; meetingTime: string | null; meetingDurationMins: number | null; callPlatform: import('../types').GroupCallPlatform | null; callLink: string | null }, notify = false): Promise<{ hub: NonNullable<import('../types').MyHubPayload['hub']> }> {
    const { data, error } = await supabase.rpc('update_hub_meeting', {
      p_hub_id: hubId,
      p_meeting_day: input.meetingDay,
      p_meeting_time: input.meetingTime,
      p_meeting_duration_mins: input.meetingDurationMins,
      p_call_platform: input.callPlatform,
      p_call_link: input.callLink,
      p_notify: notify,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to save the hub meeting');
    return { hub: data as NonNullable<import('../types').MyHubPayload['hub']> };
  },

  // The weekly meeting for a cohort's Hub Leads. Hub Leads and admins read it;
  // only admins write it.
  async getLeadsMeeting(cohortId: string): Promise<import('../types').HubLeadsMeeting> {
    const { data, error } = await supabase.rpc('get_hub_leads_meeting', { p_cohort_id: cohortId });
    if (error || !data) throw new Error(error?.message || 'Could not load the Hub Leads meeting');
    return data as import('../types').HubLeadsMeeting;
  },

  async setLeadsMeeting(cohortId: string, input: { meetingDay: string | null; meetingTime: string | null; meetingDurationMins: number | null; callPlatform: import('../types').GroupCallPlatform | null; callLink: string | null }, notify = false): Promise<import('../types').HubLeadsMeeting> {
    const { data, error } = await supabase.rpc('set_hub_leads_meeting', {
      p_cohort_id: cohortId,
      p_meeting_day: input.meetingDay,
      p_meeting_time: input.meetingTime,
      p_meeting_duration_mins: input.meetingDurationMins,
      p_call_platform: input.callPlatform,
      p_call_link: input.callLink,
      p_notify: notify,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to save the Hub Leads meeting');
    return data as import('../types').HubLeadsMeeting;
  },

  // Every hub the caller belongs to or IT-supports in a cohort — for an
  // operational support covering 2+ hubs, where get() only returns one.
  async getMyHubs(cohortId: string): Promise<{ hubs: import('../types').MyHubPayload[] }> {
    const { data, error } = await supabase.rpc('get_my_hubs', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return { hubs: (data as import('../types').MyHubPayload[]) ?? [] };
  },

  // One hub by id, for a caller who is a member, IT support, or admin of it.
  async getHubView(hubId: string): Promise<import('../types').MyHubPayload> {
    const { data, error } = await supabase.rpc('get_hub_view', { p_hub_id: hubId });
    if (error) throw new Error(error.message);
    return data as import('../types').MyHubPayload;
  },

  // A hub member's group (meeting + Join call), for their hub lead, an
  // assistant with "See groups", or an admin. Null when they have no group.
  async getSupportGroupView(supportId: string, cohortId: string): Promise<import('../types').SupportGroupView | null> {
    const { data, error } = await supabase.rpc('get_support_group_view', { p_support_id: supportId, p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return (data as import('../types').SupportGroupView | null) ?? null;
  },

  async getGroupOverview(groupId: string): Promise<import('../types').HubGroupOverview> {
    const { data, error } = await supabase.rpc('hub_group_overview', { p_group_id: groupId });
    if (error || !data) throw new Error(error?.message || 'Could not load the group overview');
    return data as import('../types').HubGroupOverview;
  },

  async submitMeeting(hubId: string, weekId: number, notes: string): Promise<{ sessionId: string; hubId: string; weekId: number; notes: string | null; submittedAt: string; submittedById: string | null }> {
    const { data, error } = await supabase.rpc('submit_hub_meeting', { p_hub_id: hubId, p_week_id: weekId, p_notes: notes });
    if (error || !data) throw new Error(error?.message || 'Failed to submit the hub meeting');
    return data as any;
  },

  async reopenMeeting(hubId: string, weekId: number): Promise<{ sessionId: string; hubId: string; weekId: number; submittedAt: string | null }> {
    const { data, error } = await supabase.rpc('reopen_hub_meeting', { p_hub_id: hubId, p_week_id: weekId });
    if (error || !data) throw new Error(error?.message || 'Failed to reopen the hub meeting');
    return data as any;
  },

  // Approved + shared-for-prayer faith projects for this hub's members' groups.
  async prayerList(hubId: string): Promise<{ items: import('../types').HubPrayerListItem[] }> {
    const { data, error } = await supabase.rpc('hub_prayer_list', { p_hub_id: hubId });
    if (error) throw new Error(error.message);
    return { items: (data as import('../types').HubPrayerListItem[]) ?? [] };
  },

  async markRoleIntroSeen(hubId: string, job: import('../types').HubJob): Promise<void> {
    const { error } = await supabase.rpc('mark_hub_role_intro_seen', { p_hub_id: hubId, p_job: job });
    if (error) throw new Error(error.message);
  },

  // Live "now praying for" focus, one at a time, saved per hub/week. Setting
  // it broadcasts to hub-meeting:<hubId>:<weekId> so every open Hub meeting
  // tab refetches — see HubMeetingPanel for why (SupportSession's RLS blocks
  // postgres_changes here).
  async getPrayerFocus(hubId: string, weekId: number): Promise<import('../types').HubPrayerFocus> {
    const { data, error } = await supabase.rpc('get_hub_prayer_focus', { p_hub_id: hubId, p_week_id: weekId });
    if (error) throw new Error(error.message);
    return (data as import('../types').HubPrayerFocus) ?? { faithProjectId: null, participantName: null, groupName: null, projectText: null, setAt: null, prayedForIds: [], hubPrayerDone: false, prayerFinished: false };
  },

  async setPrayerFocus(hubId: string, weekId: number, faithProjectId: string | null): Promise<{ faithProjectId: string | null; setAt: string | null; prayedForIds: string[] }> {
    const { data, error } = await supabase.rpc('set_hub_prayer_focus', { p_hub_id: hubId, p_week_id: weekId, p_faith_project_id: faithProjectId });
    if (error || !data) throw new Error(error?.message || 'Failed to set the prayer focus');
    return data as { faithProjectId: string | null; setAt: string | null; prayedForIds: string[] };
  },

  // Persisted "1 · Pray for your hub" done + "Finish prayer" — nullable args,
  // only changes what's passed. Finishing also clears the live focus
  // server-side (see set_hub_prayer_state), so the frontend just re-fetches
  // getPrayerFocus and broadcasts, same as setPrayerFocus.
  async setPrayerState(hubId: string, weekId: number, input: { hubPrayerDone?: boolean; prayerFinished?: boolean }): Promise<{ hubPrayerDone: boolean; prayerFinished: boolean }> {
    const { data, error } = await supabase.rpc('set_hub_prayer_state', {
      p_hub_id: hubId,
      p_week_id: weekId,
      p_hub_prayer_done: input.hubPrayerDone ?? null,
      p_prayer_finished: input.prayerFinished ?? null,
    });
    if (error || !data) throw new Error(error?.message || 'Failed to save this');
    return data as { hubPrayerDone: boolean; prayerFinished: boolean };
  },
};

// ── Support kind (admin-set: PARTICIPANT_SUPPORT / HUB_LEAD / OPERATIONAL) ──

export const supportKindApi = {
  async getForCohort(cohortId: string): Promise<{ kinds: Record<string, import('../types').SupportKind> }> {
    const { data, error } = await supabase
      .from('UserCohort')
      .select('userId, supportKind')
      .eq('cohortId', cohortId);
    if (error) throw new Error(error.message);
    const kinds: Record<string, import('../types').SupportKind> = {};
    ((data || []) as any[]).forEach((row) => { kinds[row.userId] = row.supportKind ?? 'PARTICIPANT_SUPPORT'; });
    return { kinds };
  },

  async set(userId: string, cohortId: string, kind: import('../types').SupportKind): Promise<{ userId: string; cohortId: string; supportKind: import('../types').SupportKind }> {
    const { data, error } = await supabase.rpc('set_support_kind', { p_user_id: userId, p_cohort_id: cohortId, p_kind: kind });
    if (error || !data) throw new Error(error?.message || 'Failed to set support kind');
    return data as { userId: string; cohortId: string; supportKind: import('../types').SupportKind };
  },
};

// ── Support tags (admin-made labels the group builder reads) ──────────────────

const tagAdminError = (message: string) => (message === 'NOT_AUTHORISED' ? 'Only admins can change support tags.' : message);

export const supportTagsApi = {
  async getAll(): Promise<{ tags: import('../types').SupportTag[] }> {
    const [tags, members] = await Promise.all([
      supabase.from('SupportTag').select('id, name, systemKey').order('name'),
      supabase.from('SupportTagMember').select('tagId, userId'),
    ]);
    if (tags.error) throw new Error(tags.error.message);
    if (members.error) throw new Error(members.error.message);
    const byTag = new Map<string, string[]>();
    ((members.data || []) as any[]).forEach((row) => byTag.set(row.tagId, [...(byTag.get(row.tagId) ?? []), row.userId]));
    return { tags: ((tags.data || []) as any[]).map((t) => ({ id: t.id, name: t.name, userIds: byTag.get(t.id) ?? [], systemKey: t.systemKey ?? null })) };
  },

  /** Create (id null) or rename. */
  async save(id: string | null, name: string): Promise<{ id: string; name: string }> {
    const { data, error } = await supabase.rpc('support_tag_save', { p_token: getSessionToken(), p_id: id, p_name: name });
    if (error) throw new Error(tagAdminError(error.message));
    return { id: (data as any).id, name: (data as any).name };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.rpc('support_tag_delete', { p_token: getSessionToken(), p_id: id });
    if (error) throw new Error(tagAdminError(error.message));
  },

  /** Replace the supports on one tag. */
  async setMembers(tagId: string, userIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('support_tag_set_members', { p_token: getSessionToken(), p_tag_id: tagId, p_user_ids: userIds });
    if (error) throw new Error(tagAdminError(error.message));
  },

  /** Replace the tags on one support. */
  async setUserTags(userId: string, tagIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('support_set_tags', { p_token: getSessionToken(), p_user_id: userId, p_tag_ids: tagIds });
    if (error) throw new Error(tagAdminError(error.message));
  },
};

// ── Support recaps ─────────────────────────────────────────────────────────

export const supportRecapsApi = {
  async getForCohort(cohortId: string): Promise<{ recaps: import('../types').SupportRecap[] }> {
    const { data, error } = await supabase.rpc('support_recaps', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return { recaps: (data as import('../types').SupportRecap[]) ?? [] };
  },
};

export const notificationDeliveryApi = {
  async getSends(days = 14): Promise<import('../types').NotificationSend[]> {
    const { data, error } = await supabase.rpc('notification_sends', { p_days: days });
    if (error) throw new Error(error.message);
    return (data as import('../types').NotificationSend[]) ?? [];
  },
  async getRecipients(send: import('../types').NotificationSend): Promise<import('../types').NotificationRecipient[]> {
    const { data, error } = await supabase.rpc('notification_send_recipients', {
      p_source: send.source, p_type: send.type, p_title: send.title, p_body: send.body, p_path: send.path,
      p_from: send.sentAt, p_to: send.lastAt,
    });
    if (error) throw new Error(error.message);
    return (data as import('../types').NotificationRecipient[]) ?? [];
  },
  // Re-sends the same message to the people named, through the same sender as every other alert.
  async remind(send: import('../types').NotificationSend, recipients: Array<{ id: string; role: string }>): Promise<{ notified: number; sent: number }> {
    const userIds = recipients.filter((r) => r.role !== 'PARTICIPANT').map((r) => r.id);
    const participantIds = recipients.filter((r) => r.role === 'PARTICIPANT').map((r) => r.id);
    const { data, error } = await supabase.functions.invoke('notify-users', {
      body: {
        ...(userIds.length ? { userIds } : {}),
        ...(participantIds.length ? { participantIds } : {}),
        title: `Reminder: ${send.title}`,
        body: send.body,
        path: send.path || undefined,
        type: 'REMINDER',
      },
    });
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { notified?: number; participants?: number; sent?: number };
    return { notified: Number(r.notified ?? 0) + Number(r.participants ?? 0), sent: Number(r.sent ?? 0) };
  },
};

// A support's question "are you actively following up?", and the admin view of what moved.
export const followUpChecksApi = {
  async getMine(): Promise<import('../types').FollowUpCheck | null> {
    const { data, error } = await supabase.rpc('my_followup_check');
    if (error) throw new Error(error.message);
    return (data as import('../types').FollowUpCheck | null) ?? null;
  },
  async answer(answer: 'YES' | 'NOT_NOW'): Promise<void> {
    const { error } = await supabase.rpc('answer_followup_check', { p_answer: answer });
    if (error) throw new Error(error.message);
  },
  async getReassignments(days = 7): Promise<import('../types').FollowUpReassignmentSummary> {
    const { data, error } = await supabase.rpc('followup_reassignments', { p_days: days });
    if (error) throw new Error(error.message);
    return data as import('../types').FollowUpReassignmentSummary;
  },
};

export const plannerApi = {
  /** Every week's number and class date, across all cohorts, for the Planner. */
  async getClassWeeks(): Promise<{ weeks: Array<{ id: number; cohortId: string; weekNumber: number; classDate: string | null }> }> {
    const { data, error } = await supabase.from('Week').select('*').order('weekNumber');
    if (error) throw new Error(error.message);
    return {
      weeks: ((data ?? []) as any[]).map((w) => ({ id: w.id, cohortId: w.cohortId, weekNumber: w.weekNumber, classDate: w.classDate ?? null })),
    };
  },

  /** Nigerian public holidays between two dates (YYYY-MM-DD), for the timeline. */
  async getHolidays(from: string, to: string): Promise<{ holidays: import('../types').PublicHoliday[] }> {
    const { data, error } = await supabase
      .from('PublicHoliday')
      .select('id, date, name, isEstimate, fetchedAt')
      .gte('date', from)
      .lte('date', to)
      .order('date');
    if (error) throw new Error(error.message);
    return { holidays: (data ?? []) as import('../types').PublicHoliday[] };
  },

  async getEvents(): Promise<{ events: import('../types').ChurchEvent[] }> {
    const { data, error } = await supabase
      .from('ChurchEvent')
      .select('id, name, startDate, endDate, stopsFof')
      .order('startDate');
    if (error) throw new Error(error.message);
    return { events: (data ?? []) as import('../types').ChurchEvent[] };
  },

  // Admins only, checked in the database (planner_save_event / planner_delete_event).
  async saveEvent(input: { id?: string | null; name: string; startDate: string; endDate: string; stopsFof: boolean }): Promise<{ event: import('../types').ChurchEvent }> {
    const { data, error } = await supabase.rpc('planner_save_event', {
      p_token: getSessionToken(),
      p_id: input.id ?? null,
      p_name: input.name,
      p_start: input.startDate,
      p_end: input.endDate,
      p_stops_fof: input.stopsFof,
    });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can change church events.' : error.message);
    return { event: data as import('../types').ChurchEvent };
  },

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.rpc('planner_delete_event', { p_token: getSessionToken(), p_id: id });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can change church events.' : error.message);
  },

  /** What moves if this class is pushed back a Sunday; with apply, it moves them. */
  async pushBack(weekId: number, eventId: string | null, apply: boolean): Promise<import('../types').PushBackResult> {
    const { data, error } = await supabase.rpc('planner_push_back', {
      p_token: getSessionToken(),
      p_week_id: weekId,
      p_event_id: eventId,
      p_apply: apply,
    });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can move classes.' : error.message);
    return data as import('../types').PushBackResult;
  },

  async getChanges(): Promise<{ changes: import('../types').PlannerChange[] }> {
    const { data, error } = await supabase
      .from('PlannerChange')
      .select('id, summary, createdAt, undoneAt')
      .order('createdAt', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return { changes: (data ?? []) as import('../types').PlannerChange[] };
  },

  async undoChange(changeId: string): Promise<void> {
    const { error } = await supabase.rpc('planner_undo_change', { p_token: getSessionToken(), p_change_id: changeId });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can undo changes.' : error.message);
  },

  /** Hand-set dates for planned (not yet created) cohorts, keyed by cohort name. */
  async getPlannedDates(): Promise<{ dates: Record<string, string[]> }> {
    const { data, error } = await supabase.from('AppSetting').select('value').eq('settingKey', 'planner_planned_dates').maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data as any)?.value;
    return { dates: value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string[]>) : {} };
  },

  /** A real cohort's class dates; with apply false it only returns what moves. */
  async setClassDates(cohortId: string, dates: Array<{ weekId: number; date: string }>, apply: boolean): Promise<{ moves: Array<{ weekNumber: number; from: string; to: string }>; endBefore: string; endAfter: string; applied: boolean }> {
    const { data, error } = await supabase.rpc('planner_set_class_dates', {
      p_token: getSessionToken(),
      p_cohort_id: cohortId,
      p_dates: dates,
      p_apply: apply,
    });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can change class dates.' : error.message);
    return data as any;
  },

  /** Moves a cohort's classes earlier into freed Sundays; the end date comes back by the weeks recovered. */
  async pullForward(cohortId: string, dates: Array<{ weekId: number; date: string }>, apply: boolean): Promise<{ moves: Array<{ weekNumber: number; from: string; to: string }>; endBefore: string; endAfter: string; applied: boolean }> {
    const { data, error } = await supabase.rpc('planner_pull_forward', {
      p_token: getSessionToken(),
      p_cohort_id: cohortId,
      p_dates: dates,
      p_apply: apply,
    });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can change class dates.' : error.message);
    return data as any;
  },

  /** A planned cohort's class dates, or null to go back to automatic. */
  async setPlannedDates(name: string, dates: string[] | null): Promise<void> {
    const { error } = await supabase.rpc('planner_set_planned_dates', { p_token: getSessionToken(), p_name: name, p_dates: dates });
    if (error) throw new Error(error.message === 'NOT_AUTHORISED' ? 'Only admins can change class dates.' : error.message);
  },

  /** Admin "Refresh now": re-reads the holiday calendar straight away. */
  async refreshHolidays(): Promise<{ holidays: number }> {
    const { data, error } = await supabase.functions.invoke('refresh-public-holidays', { body: {} });
    if (error || !(data as any)?.ok) throw new Error('Could not refresh the holidays. Please try again.');
    return { holidays: (data as any).holidays ?? 0 };
  },
};

// ── Faith Projects ────────────────────────────────────────────────────────────

const FAITH_PROJECT_SELECT = '*, participant:Participant(id, fullName), updatedBy:User!FaithProject_updatedById_fkey(id, name), category:FaithProjectCategory(id, name)';

const mapFaithProject = (row: any): import('../types').FaithProject => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  title: row.title ?? null,
  body: row.body ?? null,
  categoryId: row.categoryId ?? null,
  categoryName: row.category?.name ?? null,
  status: row.status ?? 'NOT_DRAFTED',
  updatedById: row.updatedById ?? null,
  updatedByName: withActedAs(row.updatedBy?.name ?? null, row.updatedByActedAs),
  reviewHistory: (row.reviewHistory as import('../types').FaithProjectReviewEntry[]) ?? [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const faithProjectsApi = {
  async getByParticipant(participantId: string): Promise<{ projects: import('../types').FaithProject[] }> {
    const { data, error } = await supabase
      .from('FaithProject')
      .select(FAITH_PROJECT_SELECT)
      .eq('participantId', participantId)
      .order('createdAt', { ascending: false });

    if (error) throw new Error(error.message);
    return { projects: ((data as any[]) || []).map(mapFaithProject) };
  },

  async getAll(options?: { cohortId?: string; status?: import('../types').FaithProjectStatus }): Promise<{ projects: import('../types').FaithProject[] }> {
    let query = supabase
      .from('FaithProject')
      .select(FAITH_PROJECT_SELECT)
      .order('updatedAt', { ascending: false });

    if (options?.status) query = query.eq('status', options.status);

    if (options?.cohortId) {
      const { data: pRows } = await supabase
        .from('Participant')
        .select('id')
        .eq('cohortId', options.cohortId);
      const ids = (pRows ?? []).map((p: any) => p.id);
      if (ids.length === 0) return { projects: [] };
      query = query.in('participantId', ids);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { projects: ((data as any[]) || []).map(mapFaithProject) };
  },

  async upsertForParticipant(participantId: string, input: { title?: string | null; body?: string | null; categoryId?: string | null; status?: import('../types').FaithProjectStatus; updatedById?: string | null }): Promise<{ project: import('../types').FaithProject }> {
    const { data: existing } = await supabase
      .from('FaithProject')
      .select('id')
      .eq('participantId', participantId)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('FaithProject')
        .update({ ...input, updatedAt: new Date().toISOString() })
        .eq('id', existing.id)
        .select(FAITH_PROJECT_SELECT)
        .single();

      if (error || !data) throw new Error(error?.message || 'Failed to update faith project');
      return { project: mapFaithProject(data) };
    }

    const { data, error } = await supabase
      .from('FaithProject')
      .insert([{ participantId, ...input }])
      .select(FAITH_PROJECT_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create faith project');
    return { project: mapFaithProject(data) };
  },

  async reviewProject(projectId: string, input: {
    status: 'APPROVED' | 'NEEDS_REFINEMENT';
    note?: string | null;
    actorId: string;
    actorName: string;
  }): Promise<{ project: import('../types').FaithProject }> {
    const { data: existing, error: fetchErr } = await supabase
      .from('FaithProject')
      .select('reviewHistory')
      .eq('id', projectId)
      .single();
    if (fetchErr || !existing) throw new Error(fetchErr?.message || 'Faith project not found');

    const entry: import('../types').FaithProjectReviewEntry = {
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.status,
      note: input.note ?? null,
      at: new Date().toISOString(),
    };
    const history = [...((existing.reviewHistory as import('../types').FaithProjectReviewEntry[]) ?? []), entry];

    const { data, error } = await supabase
      .from('FaithProject')
      .update({ status: input.status, reviewHistory: history, updatedById: input.actorId, updatedAt: new Date().toISOString() })
      .eq('id', projectId)
      .select(FAITH_PROJECT_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to save review');
    return { project: mapFaithProject(data) };
  },

  async delete(projectId: string): Promise<{ message: string }> {
    const { error } = await supabase.from('FaithProject').delete().eq('id', projectId);
    if (error) throw new Error(error.message);
    return { message: 'Faith project deleted' };
  },
};

// ── Faith help requests ("Is it going well?") ───────────────────────────────

const FAITH_HELP_REQUEST_SELECT = '*, participant:Participant(id, fullName, phone), resolvedBy:User!FaithHelpRequest_resolvedById_fkey(id, name)';

const mapFaithHelpRequest = (row: any): import('../types').FaithHelpRequest => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  participantPhone: row.participant?.phone ?? null,
  faithProjectId: row.faithProjectId ?? null,
  reason: row.reason,
  note: row.note ?? null,
  wantsContact: row.wantsContact,
  createdAt: row.createdAt,
  resolvedAt: row.resolvedAt ?? null,
  resolvedById: row.resolvedById ?? null,
  resolvedByName: withActedAs(row.resolvedBy?.name ?? null, row.resolvedByActedAs),
});

export const faithHelpRequestsApi = {
  async getOpenForParticipants(participantIds: string[]): Promise<{ requests: import('../types').FaithHelpRequest[] }> {
    if (participantIds.length === 0) return { requests: [] };
    const { data, error } = await supabase.from('FaithHelpRequest').select(FAITH_HELP_REQUEST_SELECT)
      .in('participantId', participantIds).is('resolvedAt', null).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: ((data as any[]) || []).map(mapFaithHelpRequest) };
  },

  async getForParticipant(participantId: string): Promise<{ requests: import('../types').FaithHelpRequest[] }> {
    const { data, error } = await supabase.from('FaithHelpRequest').select(FAITH_HELP_REQUEST_SELECT)
      .eq('participantId', participantId).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: ((data as any[]) || []).map(mapFaithHelpRequest) };
  },

  async resolve(id: string, resolvedById: string): Promise<{ request: import('../types').FaithHelpRequest }> {
    const { data, error } = await supabase.from('FaithHelpRequest')
      .update({ resolvedAt: new Date().toISOString(), resolvedById })
      .eq('id', id)
      .select(FAITH_HELP_REQUEST_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Could not mark that resolved.');
    return { request: mapFaithHelpRequest(data) };
  },
};

// ── Testimonies (support + admin side) ──────────────────────────────────────

const TESTIMONY_SELECT = '*, participant:Participant(id, fullName), reviewedBy:User!Testimony_reviewedById_fkey(id, name)';

const mapTestimony = (row: any): import('../types').Testimony => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  cohortId: row.cohortId,
  groupId: row.groupId ?? null,
  title: row.title ?? null,
  body: row.body,
  visibility: row.visibility,
  status: row.status,
  reviewedById: row.reviewedById ?? null,
  reviewedByName: withActedAs(row.reviewedBy?.name ?? null, row.reviewedByActedAs),
  reviewedAt: row.reviewedAt ?? null,
  viewedAt: row.viewedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const testimoniesApi = {
  async getForParticipants(participantIds: string[]): Promise<{ testimonies: import('../types').Testimony[] }> {
    if (participantIds.length === 0) return { testimonies: [] };
    const { data, error } = await supabase.from('Testimony').select(TESTIMONY_SELECT)
      .in('participantId', participantIds).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { testimonies: ((data as any[]) || []).map(mapTestimony) };
  },

  async getAll(options?: { cohortId?: string; status?: import('../types').TestimonyStatus }): Promise<{ testimonies: import('../types').Testimony[] }> {
    let query = supabase.from('Testimony').select(TESTIMONY_SELECT).order('createdAt', { ascending: false });
    if (options?.status) query = query.eq('status', options.status);
    if (options?.cohortId) query = query.eq('cohortId', options.cohortId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { testimonies: ((data as any[]) || []).map(mapTestimony) };
  },

  // Approve or hide. Approving also bells the participant (written by the
  // review_testimony function itself, straight into ParticipantNotification).
  async review(id: string, status: 'APPROVED' | 'HIDDEN'): Promise<{ testimony: import('../types').Testimony }> {
    const { data, error } = await supabase.rpc('review_testimony', { p_id: id, p_status: status });
    if (error) throw new Error(error.message);
    const row = data as any;
    return {
      testimony: {
        id: row.id,
        participantId: row.participantId,
        title: row.title ?? null,
        body: row.body,
        visibility: row.visibility,
        status: row.status,
        reviewedById: row.reviewedById ?? null,
        reviewedAt: row.reviewedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    };
  },

  // Clears the "New testimony" pill once the assigned support opens the
  // participant's card. Staff already have full read/write on Testimony via
  // the "Staff can manage testimonies" RLS policy, so this is a plain update.
  async markViewed(ids: string[], userId: string): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from('Testimony')
      .update({ viewedAt: new Date().toISOString(), viewedById: userId })
      .in('id', ids)
      .is('viewedAt', null);
    if (error) throw new Error(error.message);
  },
};

const mapFaithProjectCategory = (row: any): import('../types').FaithProjectCategory => ({
  id: row.id, cohortId: row.cohortId, name: row.name, archivedAt: row.archivedAt ?? null, createdAt: row.createdAt,
});

export const faithProjectSettingsApi = {
  async get(cohortId: string): Promise<{ settings: import('../types').FaithProjectSettings }> {
    const { data, error } = await supabase.from('FaithProjectSetting').select('cohortId, deadlineAt').eq('cohortId', cohortId).maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: { cohortId, deadlineAt: data?.deadlineAt ?? null } };
  },
  async set(cohortId: string, deadlineAt: string | null): Promise<{ settings: import('../types').FaithProjectSettings }> {
    const { data, error } = await supabase.from('FaithProjectSetting')
      .upsert([{ cohortId, deadlineAt, updatedAt: new Date().toISOString() }], { onConflict: 'cohortId' })
      .select('cohortId, deadlineAt').single();
    if (error || !data) throw new Error(error?.message || 'Could not save the Faith Project deadline.');
    return { settings: { cohortId: data.cohortId, deadlineAt: data.deadlineAt ?? null } };
  },
};

export const faithProjectCategoriesApi = {
  // Categories are shared across the programme. `cohortId` remains an argument
  // for compatibility with callers and is only recorded as the creation context.
  async getAll(_cohortId: string, includeArchived = false): Promise<{ categories: import('../types').FaithProjectCategory[] }> {
    let query = supabase.from('FaithProjectCategory').select('*').order('name');
    if (!includeArchived) query = query.is('archivedAt', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { categories: ((data as any[]) ?? []).map(mapFaithProjectCategory) };
  },
  async create(cohortId: string, name: string): Promise<{ category: import('../types').FaithProjectCategory }> {
    const cleanName = name.trim();
    const { data: existing, error: existingError } = await supabase.from('FaithProjectCategory')
      .select('id')
      .ilike('name', cleanName)
      .is('archivedAt', null)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error('That category already exists.');
    const { data, error } = await supabase.from('FaithProjectCategory').insert([{ cohortId, name: cleanName }]).select('*').single();
    if (error || !data) throw new Error(error?.message || 'Could not add category.');
    return { category: mapFaithProjectCategory(data) };
  },
  async archive(categoryId: string): Promise<void> {
    const { error } = await supabase.from('FaithProjectCategory').update({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).eq('id', categoryId);
    if (error) throw new Error(error.message);
  },
};

// ── Group Prayers ─────────────────────────────────────────────────────────────

const GROUP_PRAYER_SELECT = '*, createdBy:User!GroupPrayer_createdById_fkey(id, name), week:Week(weekNumber)';

const mapGroupPrayer = (row: any): import('../types').GroupPrayer => ({
  id: row.id,
  cohortId: row.cohortId,
  weekId: row.weekId,
  weekNumber: row.week?.weekNumber ?? undefined,
  body: row.body,
  createdById: row.createdById ?? null,
  createdByName: withActedAs(row.createdBy?.name ?? null, row.createdByActedAs),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const groupPrayersApi = {
  async getForCohort(cohortId: string): Promise<{ prayers: import('../types').GroupPrayer[] }> {
    const { data, error } = await supabase
      .from('GroupPrayer')
      .select(GROUP_PRAYER_SELECT)
      .eq('cohortId', cohortId)
      .order('weekId', { ascending: true });

    if (error) throw new Error(error.message);
    return { prayers: ((data as any[]) || []).map(mapGroupPrayer) };
  },

  async upsertForWeek(cohortId: string, weekId: number, body: string, createdById?: string): Promise<{ prayer: import('../types').GroupPrayer }> {
    const { data, error } = await supabase
      .from('GroupPrayer')
      .upsert(
        { cohortId, weekId, body, createdById: createdById ?? null, updatedAt: new Date().toISOString() },
        { onConflict: 'cohortId,weekId' }
      )
      .select(GROUP_PRAYER_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to save prayer');
    return { prayer: mapGroupPrayer(data) };
  },

  async delete(prayerId: string): Promise<{ message: string }> {
    const { error } = await supabase.from('GroupPrayer').delete().eq('id', prayerId);
    if (error) throw new Error(error.message);
    return { message: 'Prayer deleted' };
  },
};

// ── Group Prayer Focus ────────────────────────────────────────────────────────

const GROUP_PRAYER_FOCUS_SELECT = '*, group:Group(id, name), week:Week(weekNumber), participant:Participant(id, fullName), setBy:User!GroupPrayerFocus_setById_fkey(id, name)';

const mapGroupPrayerFocus = (row: any): import('../types').GroupPrayerFocus => ({
  id: row.id,
  groupId: row.groupId,
  groupName: row.group?.name ?? null,
  weekId: row.weekId,
  weekNumber: row.week?.weekNumber ?? undefined,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  setById: row.setById ?? null,
  setByName: withActedAs(row.setBy?.name ?? null, row.setByActedAs),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const groupPrayerFocusApi = {
  async getForCohort(cohortId: string): Promise<{ focuses: import('../types').GroupPrayerFocus[] }> {
    const { data: groupRows, error: gErr } = await supabase
      .from('Group')
      .select('id')
      .eq('cohortId', cohortId);
    if (gErr) throw new Error(gErr.message);

    const groupIds = (groupRows ?? []).map((g: any) => g.id);
    if (groupIds.length === 0) return { focuses: [] };

    const { data, error } = await supabase
      .from('GroupPrayerFocus')
      .select(GROUP_PRAYER_FOCUS_SELECT)
      .in('groupId', groupIds)
      .order('weekId', { ascending: true });

    if (error) throw new Error(error.message);
    return { focuses: ((data as any[]) || []).map(mapGroupPrayerFocus) };
  },

  async setFocus(groupId: string, weekId: number, participantId: string, setById?: string): Promise<{ focus: import('../types').GroupPrayerFocus }> {
    const { data: membership, error: membershipError } = await supabase
      .from('GroupParticipant')
      .select('groupId')
      .eq('groupId', groupId)
      .eq('participantId', participantId)
      .maybeSingle();

    if (membershipError) throw new Error(membershipError.message);
    if (!membership) {
      throw new Error('Choose a participant in this group.');
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('GroupPrayerFocus')
      .upsert(
        { groupId, weekId, participantId, setById: setById ?? null, updatedAt: now },
        { onConflict: 'groupId,weekId' },
      )
      .select(GROUP_PRAYER_FOCUS_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to save prayer focus');
    return { focus: mapGroupPrayerFocus(data) };
  },

  async clear(groupId: string, weekId: number): Promise<{ message: string }> {
    const { error } = await supabase
      .from('GroupPrayerFocus')
      .delete()
      .eq('groupId', groupId)
      .eq('weekId', weekId);

    if (error) throw new Error(error.message);
    return { message: 'Prayer focus cleared' };
  },
};

// ── Group Prayer Status ───────────────────────────────────────────────────────

const GROUP_PRAYER_STATUS_SELECT = '*, group:Group(id, name), week:Week(weekNumber)';

const mapGroupPrayerStatus = (row: any): import('../types').GroupPrayerStatus => ({
  id: row.id,
  groupId: row.groupId,
  groupName: row.group?.name ?? null,
  weekId: row.weekId,
  weekNumber: row.week?.weekNumber ?? undefined,
  done: row.done,
  markedById: row.markedById ?? null,
  markedAt: row.markedAt ?? undefined,
  metOn: row.metOn ?? null,
  notes: row.notes ?? null,
});

export const groupPrayerStatusApi = {
  async getForCohort(cohortId: string): Promise<{ statuses: import('../types').GroupPrayerStatus[] }> {
    const { data: groupRows, error: gErr } = await supabase
      .from('Group')
      .select('id')
      .eq('cohortId', cohortId);
    if (gErr) throw new Error(gErr.message);
    const groupIds = (groupRows ?? []).map((g: any) => g.id);
    if (groupIds.length === 0) return { statuses: [] };

    const { data, error } = await supabase
      .from('GroupPrayerStatus')
      .select(GROUP_PRAYER_STATUS_SELECT)
      .in('groupId', groupIds)
      .order('weekId', { ascending: true });

    if (error) throw new Error(error.message);
    return { statuses: ((data as any[]) || []).map(mapGroupPrayerStatus) };
  },

  async setDone(groupId: string, weekId: number, done: boolean, markedById?: string): Promise<{ status: import('../types').GroupPrayerStatus }> {
    const { data, error } = await supabase
      .from('GroupPrayerStatus')
      .upsert(
        { groupId, weekId, done, markedById: markedById ?? null, markedAt: new Date().toISOString() },
        { onConflict: 'groupId,weekId' }
      )
      .select(GROUP_PRAYER_STATUS_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update prayer status');
    notifyGroupMeetingChanged();
    return { status: mapGroupPrayerStatus(data) };
  },

  /** Support moved past (or back to) the Prayer step — participants' My Group switches between prayer and recap. */
  async setPrayerFinished(groupId: string, weekId: number, finished: boolean): Promise<void> {
    const { error } = await supabase
      .from('GroupPrayerStatus')
      .upsert(
        { groupId, weekId, prayerFinishedAt: finished ? new Date().toISOString() : null },
        { onConflict: 'groupId,weekId' }
      );
    if (error) throw new Error(error.message);
  },

  /** Support moved past (or back to) the Recap step — participants' My Group shows the meeting as completed. */
  async setRecapFinished(groupId: string, weekId: number, finished: boolean): Promise<void> {
    const { error } = await supabase
      .from('GroupPrayerStatus')
      .upsert(
        { groupId, weekId, recapFinishedAt: finished ? new Date().toISOString() : null },
        { onConflict: 'groupId,weekId' }
      );
    if (error) throw new Error(error.message);
  },
};

// ─── Hub API ──────────────────────────────────────────────────────────────────

const HUB_TOPIC_SELECT = `*, author:User!HubTopic_authorId_fkey(id, name, "avatarUrl"), comments:HubComment(id), reactions:HubReaction("userId", user:User(id, name, "avatarUrl"))`;
const HUB_COMMENT_SELECT = `*, author:User!HubComment_authorId_fkey(id, name, "avatarUrl"), replies:HubReply(id)`;
const HUB_REPLY_SELECT = `*, author:User!HubReply_authorId_fkey(id, name, "avatarUrl")`;

const mapTopic = (row: any, currentUserId?: string): import('../types').HubTopic => {
  const reactions = (row.reactions ?? []) as Array<{ userId: string; user?: { id: string; name: string; avatarUrl?: string | null } }>;
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author?.name ?? 'Unknown',
    authorAvatarUrl: row.author?.avatarUrl ?? null,
    title: row.title,
    body: row.body,
    status: row.status,
    commentCount: (row.comments ?? []).length,
    likeCount: reactions.length,
    likedByMe: currentUserId ? reactions.some((r) => r.userId === currentUserId) : false,
    likedBy: reactions
      .filter((r) => r.user)
      .map((r) => ({ id: r.user!.id, name: r.user!.name, avatarUrl: r.user!.avatarUrl ?? null })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const mapComment = (row: any): import('../types').HubComment => ({
  id: row.id,
  topicId: row.topicId,
  authorId: row.authorId,
  authorName: row.author?.name ?? 'Unknown',
  authorAvatarUrl: row.author?.avatarUrl ?? null,
  body: row.body,
  replyCount: (row.replies ?? []).length,
  createdAt: row.createdAt,
});

const mapReply = (row: any): import('../types').HubReply => ({
  id: row.id,
  commentId: row.commentId,
  authorId: row.authorId,
  authorName: row.author?.name ?? 'Unknown',
  authorAvatarUrl: row.author?.avatarUrl ?? null,
  body: row.body,
  createdAt: row.createdAt,
});

export const hubApi = {
  // Most recent Hub activity (new topic or comment) — used to show an unread
  // dot on the Hub nav item against the user's hubLastSeenAt.
  async getLatestActivityAt(): Promise<string | null> {
    const [topicRes, commentRes] = await Promise.all([
      supabase.from('HubTopic').select('createdAt').order('createdAt', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('HubComment').select('createdAt').order('createdAt', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (topicRes.error) throw new Error(topicRes.error.message);
    if (commentRes.error) throw new Error(commentRes.error.message);
    const dates = [topicRes.data?.createdAt, commentRes.data?.createdAt].filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));
  },

  async getTopics(status: 'OPEN' | 'CLOSED', currentUserId?: string): Promise<{ topics: import('../types').HubTopic[] }> {
    const { data, error } = await supabase
      .from('HubTopic')
      .select(HUB_TOPIC_SELECT)
      .eq('status', status)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { topics: ((data as any[]) || []).map((row) => mapTopic(row, currentUserId)) };
  },

  // Toggle the current user's thumbs-up on a topic. Returns the new liked state.
  async toggleReaction(topicId: string, userId: string): Promise<{ liked: boolean }> {
    const { data: existing, error: selErr } = await supabase
      .from('HubReaction')
      .select('id')
      .eq('topicId', topicId)
      .eq('userId', userId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) {
      const { error } = await supabase.from('HubReaction').delete().eq('id', existing.id);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await supabase.from('HubReaction').insert([{ topicId, userId }]);
    if (error) throw new Error(error.message);
    return { liked: true };
  },

  async createTopic(input: { title: string; body: string; authorId: string }): Promise<{ topic: import('../types').HubTopic }> {
    const { data, error } = await supabase
      .from('HubTopic')
      .insert([{ title: input.title, body: input.body, authorId: input.authorId, status: 'OPEN' }])
      .select(HUB_TOPIC_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { topic: mapTopic(data) };
  },

  async setTopicStatus(topicId: string, status: 'OPEN' | 'CLOSED'): Promise<{ topic: import('../types').HubTopic }> {
    const { data, error } = await supabase
      .from('HubTopic')
      .update({ status, updatedAt: new Date().toISOString() })
      .eq('id', topicId)
      .select(HUB_TOPIC_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { topic: mapTopic(data) };
  },

  async getComments(topicId: string): Promise<{ comments: import('../types').HubComment[] }> {
    const { data, error } = await supabase
      .from('HubComment')
      .select(HUB_COMMENT_SELECT)
      .eq('topicId', topicId)
      .order('createdAt', { ascending: true });
    if (error) throw new Error(error.message);
    return { comments: ((data as any[]) || []).map(mapComment) };
  },

  async createComment(input: { topicId: string; body: string; authorId: string }): Promise<{ comment: import('../types').HubComment }> {
    const { data, error } = await supabase
      .from('HubComment')
      .insert([{ topicId: input.topicId, body: input.body, authorId: input.authorId }])
      .select(HUB_COMMENT_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { comment: mapComment(data) };
  },

  async getReplies(commentId: string): Promise<{ replies: import('../types').HubReply[] }> {
    const { data, error } = await supabase
      .from('HubReply')
      .select(HUB_REPLY_SELECT)
      .eq('commentId', commentId)
      .order('createdAt', { ascending: true });
    if (error) throw new Error(error.message);
    return { replies: ((data as any[]) || []).map(mapReply) };
  },

  async createReply(input: { commentId: string; body: string; authorId: string }): Promise<{ reply: import('../types').HubReply }> {
    const { data, error } = await supabase
      .from('HubReply')
      .insert([{ commentId: input.commentId, body: input.body, authorId: input.authorId }])
      .select(HUB_REPLY_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { reply: mapReply(data) };
  },

  async getUsers(): Promise<{ users: Array<{ id: string; name: string; avatarUrl?: string | null; role?: string }> }> {
    const { data, error } = await supabase
      .from('User')
      .select('id, name, "avatarUrl", role')
      .eq('isActive', true)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return { users: (data as any[]) || [] };
  },

  async sendNotifications(entries: Array<{ userId: string; title: string; body: string; path: string }>): Promise<void> {
    if (entries.length === 0) return;
    // Route through the notify-hub edge function (service role) so each event
    // produces BOTH an in-app feed row AND a Web Push — matching every other
    // notify-* path. Entries within one call share a title/body, so group by
    // them and send one request per (title, body) group with role-aware paths.
    const groups = new Map<string, { title: string; body: string; recipients: Array<{ userId: string; path: string }> }>();
    for (const e of entries) {
      const key = `${e.title} ${e.body}`;
      const g = groups.get(key) ?? { title: e.title, body: e.body, recipients: [] };
      g.recipients.push({ userId: e.userId, path: e.path });
      groups.set(key, g);
    }
    await Promise.all(
      [...groups.values()].map((g) =>
        supabase.functions
          .invoke('notify-hub', { body: { recipients: g.recipients, title: g.title, body: g.body } })
          .catch(() => undefined), // fire-and-forget — never block the UI on notifications
      ),
    );
  },

  async deleteTopic(topicId: string): Promise<void> {
    const { error } = await supabase.from('HubTopic').delete().eq('id', topicId);
    if (error) throw new Error(error.message);
  },

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await supabase.from('HubComment').delete().eq('id', commentId);
    if (error) throw new Error(error.message);
  },

  async deleteReply(replyId: string): Promise<void> {
    const { error } = await supabase.from('HubReply').delete().eq('id', replyId);
    if (error) throw new Error(error.message);
  },

  async updateTopic(topicId: string, body: string): Promise<{ topic: import('../types').HubTopic }> {
    const { data, error } = await supabase.from('HubTopic').update({ body, updatedAt: new Date().toISOString() }).eq('id', topicId).select(HUB_TOPIC_SELECT).single();
    if (error) throw new Error(error.message);
    return { topic: mapTopic(data) };
  },

  async updateComment(commentId: string, body: string): Promise<{ comment: import('../types').HubComment }> {
    const { data, error } = await supabase.from('HubComment').update({ body, updatedAt: new Date().toISOString() }).eq('id', commentId).select(HUB_COMMENT_SELECT).single();
    if (error) throw new Error(error.message);
    return { comment: mapComment(data) };
  },

  async updateReply(replyId: string, body: string): Promise<{ reply: import('../types').HubReply }> {
    const { data, error } = await supabase.from('HubReply').update({ body, updatedAt: new Date().toISOString() }).eq('id', replyId).select(HUB_REPLY_SELECT).single();
    if (error) throw new Error(error.message);
    return { reply: mapReply(data) };
  },
};

// ── Support V2: meeting attendance, flags, checklist, cover requests ──────────

// In-app notification for every admin. Failures are swallowed: alerting must never block the support's action.
// Notifications go through one edge function: it writes the in-app row (which
// everyone sees) and pushes to whoever has a subscription. Delivery must never
// block the action that triggered it, so failures are swallowed.
type NotifyTarget = {
  userIds?: string[];
  role?: 'ADMIN' | 'SUPPORT';
  cohortId?: string | null;
  excludeUserId?: string | null;
};

const notify = async (
  target: NotifyTarget,
  title: string,
  body: string,
  path: string,
  type: import('../types').NotificationType,
) => {
  try {
    await supabase.functions.invoke('notify-users', {
      body: {
        userIds: target.userIds,
        role: target.role,
        cohortId: target.cohortId ?? undefined,
        excludeUserId: target.excludeUserId ?? undefined,
        title,
        body,
        path,
        type,
      },
    });
  } catch { /* non-critical */ }
};

const notifyAdmins = (title: string, body: string, path: string, type: import('../types').NotificationType) =>
  notify({ role: 'ADMIN' }, title, body, path, type);

const notifyUser = (userId: string, title: string, body: string, path: string, type: import('../types').NotificationType) =>
  notify({ userIds: [userId] }, title, body, path, type);

// Tells the requesting support what happened to a schedule change they
// submitted (ActivityModal / DaySchedule via pendingChangesApi.create), once
// an admin approves or rejects it in PendingChangesPanel.
const notifyScheduleChangeDecision = async (change: any, approved: boolean, rejectionReason?: string) => {
  const description = change?.changeData?.description ? `"${change.changeData.description}"` : 'Your schedule change';
  const dayName = change?.changeData?.dayName as string | undefined;
  let weekLabel = '';
  if (change?.weekId) {
    const { data: week } = await supabase.from('Week').select('weekNumber').eq('id', change.weekId).maybeSingle();
    if ((week as any)?.weekNumber) weekLabel = `Week ${(week as any).weekNumber}`;
  }
  const where = [weekLabel, dayName].filter(Boolean).join(', ');
  const title = approved ? 'Schedule change approved' : 'Schedule change not approved';
  const body = approved
    ? `${description}${where ? ` (${where})` : ''} is now on the live schedule.`
    : `${description}${where ? ` (${where})` : ''} was not approved.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
  await notifyUser(change.userId, title, body, '/support/schedule', 'SCHEDULE_CHANGE');
};

const mapMeetingAttendance = (row: any): import('../types').MeetingAttendance => ({
  id: row.id,
  participantId: row.participantId,
  groupId: row.groupId ?? null,
  weekId: row.weekId,
  status: row.status,
  markedById: row.markedById ?? null,
  markedAt: row.markedAt,
});

export const meetingAttendanceApi = {
  async getForGroupWeek(groupId: string, weekId: number): Promise<{ records: import('../types').MeetingAttendance[] }> {
    const { data, error } = await supabase.from('MeetingAttendance').select('*').eq('groupId', groupId).eq('weekId', weekId);
    if (error) throw new Error(error.message);
    return { records: ((data as any[]) || []).map(mapMeetingAttendance) };
  },

  async getForWeeks(weekIds: number[]): Promise<{ records: import('../types').MeetingAttendance[] }> {
    if (weekIds.length === 0) return { records: [] };
    const { data, error } = await supabase.from('MeetingAttendance').select('*').in('weekId', weekIds);
    if (error) throw new Error(error.message);
    return { records: ((data as any[]) || []).map(mapMeetingAttendance) };
  },

  async mark(input: { participantId: string; groupId: string | null; weekId: number; status: import('../types').MeetingAttendanceStatus; markedById?: string | null }): Promise<{ record: import('../types').MeetingAttendance }> {
    const { data, error } = await supabase
      .from('MeetingAttendance')
      .upsert({ ...input, markedById: input.markedById ?? null, markedAt: new Date().toISOString() }, { onConflict: 'participantId,weekId' })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to save meeting attendance');
    notifyGroupMeetingChanged();
    return { record: mapMeetingAttendance(data) };
  },

  // "Group meeting is on now" — no SupportSession-style row for group
  // meetings, so this is computed from data already recorded: the earliest
  // attendance mark for a (group, week) is when that week's meeting started;
  // "live" means that's within the last 3 hours and the week isn't submitted
  // (GroupPrayerStatus.done) yet. MeetingAttendance/GroupPrayerStatus are
  // staff-only tables (20260918040000_staff_only_meetings_attendance.sql), so
  // this queries them directly — same as meetingAttendanceApi/groupPrayerStatusApi
  // above, no RPC needed on the support side.
  async getLiveForGroup(groupId: string): Promise<{ weekId: number; startedAt: string } | null> {
    const { data, error } = await supabase.from('MeetingAttendance').select('weekId, markedAt').eq('groupId', groupId);
    if (error) throw new Error(error.message);
    const rows = (data as Array<{ weekId: number; markedAt: string }>) || [];
    if (rows.length === 0) return null;
    const startedByWeek = new Map<number, string>();
    rows.forEach((row) => {
      const current = startedByWeek.get(row.weekId);
      if (!current || new Date(row.markedAt).getTime() < new Date(current).getTime()) startedByWeek.set(row.weekId, row.markedAt);
    });
    const { data: statusRows, error: statusError } = await supabase.from('GroupPrayerStatus').select('weekId, done').eq('groupId', groupId);
    if (statusError) throw new Error(statusError.message);
    const doneWeeks = new Set(((statusRows as Array<{ weekId: number; done: boolean }>) || []).filter((s) => s.done).map((s) => s.weekId));
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    let best: { weekId: number; startedAt: string } | null = null;
    startedByWeek.forEach((startedAt, weekId) => {
      if (doneWeeks.has(weekId)) return;
      if (new Date(startedAt).getTime() < threeHoursAgo) return;
      if (!best || new Date(startedAt).getTime() > new Date(best.startedAt).getTime()) best = { weekId, startedAt };
    });
    return best;
  },

  /** Meetings with attendance marked but no report submitted, newest first (reminder card on support Home). */
  async getUnfinishedForGroup(groupId: string): Promise<Array<{ weekId: number; startedAt: string }>> {
    const [{ data, error }, { data: statusRows, error: statusError }] = await Promise.all([
      supabase.from('MeetingAttendance').select('weekId, markedAt').eq('groupId', groupId),
      supabase.from('GroupPrayerStatus').select('weekId, done').eq('groupId', groupId),
    ]);
    if (error) throw new Error(error.message);
    if (statusError) throw new Error(statusError.message);
    const doneWeeks = new Set(((statusRows as Array<{ weekId: number; done: boolean }>) || []).filter((s) => s.done).map((s) => s.weekId));
    const startedByWeek = new Map<number, string>();
    ((data as Array<{ weekId: number; markedAt: string }>) || []).forEach((row) => {
      if (doneWeeks.has(row.weekId)) return;
      const current = startedByWeek.get(row.weekId);
      if (!current || new Date(row.markedAt).getTime() < new Date(current).getTime()) startedByWeek.set(row.weekId, row.markedAt);
    });
    return [...startedByWeek.entries()]
      .map(([weekId, startedAt]) => ({ weekId, startedAt }))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  },

  /** "It was a test": clears an unsubmitted meeting's attendance, prayer pick and live progress. Refuses a submitted one. */
  async discardUnfinished(groupId: string, weekId: number): Promise<void> {
    const { data: status, error: statusError } = await supabase.from('GroupPrayerStatus').select('done').eq('groupId', groupId).eq('weekId', weekId).maybeSingle();
    if (statusError) throw new Error(statusError.message);
    if ((status as { done: boolean } | null)?.done) throw new Error('This meeting was already submitted.');
    const results = await Promise.all([
      supabase.from('MeetingAttendance').delete().eq('groupId', groupId).eq('weekId', weekId),
      supabase.from('GroupPrayerFocus').delete().eq('groupId', groupId).eq('weekId', weekId),
      supabase.from('GroupPrayerStatus').delete().eq('groupId', groupId).eq('weekId', weekId).eq('done', false),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    notifyGroupMeetingChanged();
  },
};

// A Teen Support's Saturday meeting with their teens. It reuses MeetingAttendance (one row per teen)
// and the group's GroupPrayerStatus row (done, the day they met, the Teen Support's own notes).
// Teen groups are kept out of the dashboards and reminders (FLOW_MAP rule 31).
export const teenMeetingsApi = {
  async getWeek(groupId: string, weekId: number): Promise<{ status: import('../types').GroupPrayerStatus | null; records: import('../types').MeetingAttendance[] }> {
    const [{ data: status, error: statusError }, { data: records, error: recordsError }] = await Promise.all([
      supabase.from('GroupPrayerStatus').select(GROUP_PRAYER_STATUS_SELECT).eq('groupId', groupId).eq('weekId', weekId).maybeSingle(),
      supabase.from('MeetingAttendance').select('*').eq('groupId', groupId).eq('weekId', weekId),
    ]);
    if (statusError) throw new Error(statusError.message);
    if (recordsError) throw new Error(recordsError.message);
    return { status: status ? mapGroupPrayerStatus(status) : null, records: ((records as any[]) || []).map(mapMeetingAttendance) };
  },

  /** Every teen group's meeting rows for the cohort, for the admin Teens card. */
  async getForCohort(cohortId: string): Promise<{ groups: Array<{ id: string; name: string; supportId: string | null; supportName: string | null }>; statuses: import('../types').GroupPrayerStatus[] }> {
    const { data: groupRows, error: groupError } = await supabase
      .from('Group')
      .select('id, name, supportId, support:User!Group_supportId_fkey(name), members:GroupParticipant(participantId)')
      .eq('cohortId', cohortId).eq('isTeenGroup', true).is('archivedAt', null);
    if (groupError) throw new Error(groupError.message);
    const groups = ((groupRows as any[]) || []).filter((g) => (g.members ?? []).length > 0).map((g) => ({ id: g.id as string, name: g.name as string, supportId: (g.supportId as string | null) ?? null, supportName: (g.support?.name as string | null) ?? null }));
    if (groups.length === 0) return { groups, statuses: [] };
    const { data, error } = await supabase.from('GroupPrayerStatus').select(GROUP_PRAYER_STATUS_SELECT).in('groupId', groups.map((g) => g.id));
    if (error) throw new Error(error.message);
    return { groups, statuses: ((data as any[]) || []).map(mapGroupPrayerStatus) };
  },

  /** Saves the day they met, each teen's mark and the notes; `done` is the "We met" tick the admins are told about. */
  async save(input: {
    groupId: string;
    weekId: number;
    userId: string;
    metOn: string | null;
    notes: string | null;
    done: boolean;
    marks: Array<{ participantId: string; status: import('../types').MeetingAttendanceStatus }>;
  }): Promise<{ status: import('../types').GroupPrayerStatus }> {
    for (const mark of input.marks) {
      await meetingAttendanceApi.mark({ participantId: mark.participantId, groupId: input.groupId, weekId: input.weekId, status: mark.status, markedById: input.userId });
    }
    const { data, error } = await supabase
      .from('GroupPrayerStatus')
      .upsert(
        { groupId: input.groupId, weekId: input.weekId, done: input.done, markedById: input.userId, markedAt: new Date().toISOString(), metOn: input.metOn, notes: input.notes },
        { onConflict: 'groupId,weekId' },
      )
      .select(GROUP_PRAYER_STATUS_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Could not save the meeting');
    return { status: mapGroupPrayerStatus(data) };
  },
};

const PARTICIPANT_FLAG_SELECT = '*, participant:Participant(id, fullName), group:Group(id, name), week:Week(weekNumber), raisedBy:User!ParticipantFlag_raisedById_fkey(id, name), clearedBy:User!ParticipantFlag_clearedById_fkey(id, name)';

const mapParticipantFlag = (row: any): import('../types').ParticipantFlag => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  groupId: row.groupId ?? null,
  groupName: row.group?.name ?? null,
  weekId: row.weekId ?? null,
  weekNumber: row.week?.weekNumber ?? null,
  reason: row.reason,
  note: row.note ?? null,
  raisedById: row.raisedById ?? null,
  raisedByName: withActedAs(row.raisedBy?.name ?? null, row.raisedByActedAs),
  raisedAt: row.raisedAt,
  clearedById: row.clearedById ?? null,
  clearedByName: withActedAs(row.clearedBy?.name ?? null, row.clearedByActedAs),
  clearedAt: row.clearedAt ?? null,
});

export const participantFlagsApi = {
  async getOpenForParticipants(participantIds: string[]): Promise<{ flags: import('../types').ParticipantFlag[] }> {
    if (participantIds.length === 0) return { flags: [] };
    const { data, error } = await supabase.from('ParticipantFlag').select(PARTICIPANT_FLAG_SELECT)
      .in('participantId', participantIds).is('clearedAt', null).order('raisedAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { flags: ((data as any[]) || []).map(mapParticipantFlag) };
  },

  async getForParticipant(participantId: string): Promise<{ flags: import('../types').ParticipantFlag[] }> {
    const { data, error } = await supabase.from('ParticipantFlag').select(PARTICIPANT_FLAG_SELECT)
      .eq('participantId', participantId).order('raisedAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { flags: ((data as any[]) || []).map(mapParticipantFlag) };
  },

  async getAll(options: { openOnly?: boolean } = {}): Promise<{ flags: import('../types').ParticipantFlag[] }> {
    let query = supabase.from('ParticipantFlag').select(PARTICIPANT_FLAG_SELECT).order('raisedAt', { ascending: false });
    if (options.openOnly) query = query.is('clearedAt', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { flags: ((data as any[]) || []).map(mapParticipantFlag) };
  },

  async raise(input: { participantId: string; participantName: string; groupId?: string | null; weekId?: number | null; reason: string; note?: string | null; raisedById: string; raisedByName: string }): Promise<{ flag: import('../types').ParticipantFlag }> {
    const { data, error } = await supabase.from('ParticipantFlag')
      .insert([{
        participantId: input.participantId,
        groupId: input.groupId ?? null,
        weekId: input.weekId ?? null,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        raisedById: input.raisedById,
      }])
      .select(PARTICIPANT_FLAG_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to flag participant');
    void notifyAdmins('Participant needs attention', `${input.raisedByName} flagged ${input.participantName}: ${input.reason.trim()}`, '/participants', 'PARTICIPANT_FLAG');
    return { flag: mapParticipantFlag(data) };
  },

  async clear(flagId: string, clearedById: string): Promise<{ flag: import('../types').ParticipantFlag }> {
    const { data, error } = await supabase.from('ParticipantFlag')
      .update({ clearedAt: new Date().toISOString(), clearedById })
      .eq('id', flagId)
      .select(PARTICIPANT_FLAG_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to clear flag');
    const flag = mapParticipantFlag(data);
    // Tell whoever raised it that it has been dealt with (unless they cleared it).
    if (flag.raisedById && flag.raisedById !== clearedById) {
      void notify(
        { userIds: [flag.raisedById] },
        'Concern cleared',
        `${flag.clearedByName || 'Operations'} cleared the concern you raised about ${flag.participantName || 'a participant'}.`,
        '/support/participants',
        'PARTICIPANT_FLAG',
      );
    }
    return { flag };
  },
};

const mapChecklistItem = (row: any): import('../types').SupportChecklistItem => ({
  id: row.id,
  userId: row.userId,
  weekId: row.weekId,
  label: row.label,
  done: !!row.done,
  position: row.position ?? 0,
  createdById: row.createdById ?? null,
  taskGroupId: row.taskGroupId ?? null,
  dueDay: row.dueDay ?? null,
  completionNote: row.completionNote ?? null,
  completedAt: row.completedAt ?? null,
});

export const supportChecklistApi = {
  // Returns only the support's own checklist entries for this week.
  async getForWeek(userId: string, weekId: number): Promise<{ items: import('../types').SupportChecklistItem[] }> {
    const load = async () => {
      const { data, error } = await supabase.from('SupportChecklistItem').select('*')
        .eq('userId', userId).eq('weekId', weekId).order('position').order('createdAt');
      if (error) throw new Error(error.message);
      return ((data as any[]) || []).map(mapChecklistItem);
    };
    return { items: await load() };
  },

  async add(userId: string, weekId: number, label: string, position: number): Promise<{ item: import('../types').SupportChecklistItem }> {
    const { data, error } = await supabase.from('SupportChecklistItem')
      .insert([{ userId, weekId, label: label.trim(), position }]).select('*').single();
    if (error || !data) throw new Error(error?.code === '23505' ? 'That duty is already on your list.' : (error?.message || 'Failed to add duty'));
    return { item: mapChecklistItem(data) };
  },

  // A note is only kept while the task is ticked; unticking clears it and the time.
  async setDone(itemId: string, done: boolean, note?: string | null): Promise<{ item: import('../types').SupportChecklistItem }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('SupportChecklistItem')
      .update({ done, completedAt: done ? now : null, completionNote: done ? (note?.trim() || null) : null, updatedAt: now })
      .eq('id', itemId).select('*').single();
    if (error || !data) throw new Error(error?.message || 'Failed to update duty');
    return { item: mapChecklistItem(data) };
  },

  async remove(itemId: string): Promise<void> {
    const { error } = await supabase.from('SupportChecklistItem').delete().eq('id', itemId);
    if (error) throw new Error(/ADMIN_TASK_LOCKED/.test(error.message) ? 'This task was set by an admin, so it can only be ticked.' : error.message);
  },
};

const checklistAdminError = (message: string): Error => {
  if (message.includes('SESSION_EXPIRED')) return new Error('SESSION_EXPIRED');
  if (message.includes('NOT_AUTHORISED')) return new Error('Only admins can do this.');
  if (/^(Write the task|Keep the task|Choose|That tag)/.test(message)) return new Error(message);
  return new Error('That did not save. Please try again.');
};

// Admin tasks on supports' weekly checklists, added from the Schedule page.
export const adminChecklistApi = {
  async addTask(input: { label: string; weekIds: number[]; dueDay?: string | null; target: import('../types').AdminChecklistTarget }): Promise<{ supports: number; rows: number; skipped: number }> {
    const { data, error } = await supabase.rpc('admin_add_checklist_task', {
      p_token: getSessionToken(), p_label: input.label, p_week_ids: input.weekIds, p_due_day: input.dueDay ?? null, p_target: input.target,
    });
    if (error) throw checklistAdminError(error.message || '');
    const row = (data ?? {}) as any;
    return { supports: row.supports ?? 0, rows: row.rows ?? 0, skipped: row.skipped ?? 0 };
  },

  async listTasks(weekId: number): Promise<import('../types').AdminChecklistTask[]> {
    const { data, error } = await supabase.rpc('admin_checklist_tasks', { p_token: getSessionToken(), p_week_id: weekId });
    if (error) throw checklistAdminError(error.message || '');
    return ((data ?? []) as any[]).map((t) => ({
      taskGroupId: t.taskGroupId, label: t.label, dueDay: t.dueDay ?? null, total: t.total ?? 0, done: t.done ?? 0, people: t.people ?? [],
    }));
  },

  /** Removes the task from one week, or from every week when weekId is null. */
  async deleteTask(taskGroupId: string, weekId: number | null): Promise<number> {
    const { data, error } = await supabase.rpc('admin_delete_checklist_task', { p_token: getSessionToken(), p_task_group_id: taskGroupId, p_week_id: weekId });
    if (error) throw checklistAdminError(error.message || '');
    return Number(data ?? 0);
  },
};

const COVER_REQUEST_SELECT = '*, support:User!CoverRequest_supportId_fkey(id, name), coverSupport:User!CoverRequest_coverSupportId_fkey(id, name)';

const mapCoverRequest = (row: any): import('../types').CoverRequest => ({
  id: row.id,
  supportId: row.supportId,
  supportName: row.support?.name ?? null,
  cohortId: row.cohortId ?? null,
  reason: row.reason,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  note: row.note ?? null,
  status: row.status,
  coverSupportId: row.coverSupportId ?? null,
  coverSupportName: row.coverSupport?.name ?? null,
  assignedById: row.assignedById ?? null,
  assignedAt: row.assignedAt ?? null,
  createdAt: row.createdAt,
});

export const coverRequestsApi = {
  async getMine(supportId: string): Promise<{ requests: import('../types').CoverRequest[] }> {
    const { data, error } = await supabase.from('CoverRequest').select(COVER_REQUEST_SELECT)
      .eq('supportId', supportId).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: ((data as any[]) || []).map(mapCoverRequest) };
  },

  async getAll(options: { status?: import('../types').CoverRequestStatus } = {}): Promise<{ requests: import('../types').CoverRequest[] }> {
    let query = supabase.from('CoverRequest').select(COVER_REQUEST_SELECT).order('createdAt', { ascending: false });
    if (options.status) query = query.eq('status', options.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { requests: ((data as any[]) || []).map(mapCoverRequest) };
  },

  async create(input: { supportId: string; supportName: string; cohortId?: string | null; reason: string; startsAt: string; endsAt: string; note?: string | null }): Promise<{ request: import('../types').CoverRequest }> {
    const { data, error } = await supabase.from('CoverRequest')
      .insert([{
        supportId: input.supportId,
        cohortId: input.cohortId ?? null,
        reason: input.reason.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        note: input.note?.trim() || null,
      }])
      .select(COVER_REQUEST_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to send cover request');
    return { request: mapCoverRequest(data) };
  },

  // Covers a support is running right now (ASSIGNED and the current time is inside the period).
  async getActiveForCover(coverSupportId: string): Promise<{ requests: import('../types').CoverRequest[] }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('CoverRequest').select(COVER_REQUEST_SELECT)
      .eq('coverSupportId', coverSupportId).eq('status', 'ASSIGNED').lte('startsAt', now).gte('endsAt', now);
    if (error) throw new Error(error.message);
    return { requests: ((data as any[]) || []).map(mapCoverRequest) };
  },

  async assign(requestId: string, coverSupportId: string, assignedById: string): Promise<{ request: import('../types').CoverRequest }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('CoverRequest')
      .update({ status: 'ASSIGNED', coverSupportId, assignedById, assignedAt: now, updatedAt: now })
      .eq('id', requestId)
      .select(COVER_REQUEST_SELECT)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to assign cover');
    const request = mapCoverRequest(data);
    return { request };
  },
};

// Weekly recap document (usually a PDF). Stored in the shared resources bucket under recaps/.
export const recapDocumentsApi = {
  async upload(weekId: number, file: File): Promise<{ url: string; name: string }> {
    const path = `recaps/week-${weekId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    const { data: week, error } = await supabase
      .from('Week')
      .update({ recapDocumentUrl: data.publicUrl, recapDocumentName: file.name })
      .eq('id', weekId)
      .select('weekNumber, cohortId')
      .single();
    if (error) throw new Error(error.message);

    void notify(
      { role: 'SUPPORT', cohortId: (week as any)?.cohortId ?? null },
      'Week recap available',
      `The recap for Week ${(week as any)?.weekNumber ?? ''} is ready to read in your group meeting.`.replace('Week  ', 'this week'),
      '/support/participants',
      'GENERAL',
    );

    return { url: data.publicUrl, name: file.name };
  },

  async remove(weekId: number): Promise<void> {
    const { error } = await supabase.from('Week').update({ recapDocumentUrl: null, recapDocumentName: null }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },

  /** Attach an already-uploaded document (from another cohort's week) instead of uploading a new file. */
  async choose(weekId: number, url: string, name: string | null): Promise<void> {
    const { error } = await supabase.from('Week').update({ recapDocumentUrl: url, recapDocumentName: name }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },
};

// The Teen recap document, same shape as the adult recap's, under teen-recaps/.
// No push is sent here: Teen Supports find it on their Recap page.
export const teenRecapDocumentsApi = {
  async upload(weekId: number, file: File): Promise<{ url: string; name: string }> {
    const path = `teen-recaps/week-${weekId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    const { error } = await supabase.from('Week').update({ teenRecapDocumentUrl: data.publicUrl, teenRecapDocumentName: file.name }).eq('id', weekId);
    if (error) throw new Error(error.message);
    return { url: data.publicUrl, name: file.name };
  },

  async remove(weekId: number): Promise<void> {
    const { error } = await supabase.from('Week').update({ teenRecapDocumentUrl: null, teenRecapDocumentName: null }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },

  /** Attach an already-uploaded document (from another cohort's week) instead of uploading a new file. */
  async choose(weekId: number, url: string, name: string | null): Promise<void> {
    const { error } = await supabase.from('Week').update({ teenRecapDocumentUrl: url, teenRecapDocumentName: name }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },
};

// Class manual document (usually a PDF), separate from the recap. Same
// storage shape as recapDocumentsApi, under manuals/ instead of recaps/.
export const manualDocumentsApi = {
  async upload(weekId: number, file: File): Promise<{ url: string; name: string }> {
    const path = `manuals/week-${weekId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    const { error } = await supabase
      .from('Week')
      .update({ manualDocumentUrl: data.publicUrl, manualDocumentName: file.name })
      .eq('id', weekId);
    if (error) throw new Error(error.message);
    return { url: data.publicUrl, name: file.name };
  },

  async remove(weekId: number): Promise<void> {
    const { error } = await supabase.from('Week').update({ manualDocumentUrl: null, manualDocumentName: null }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },

  /** Attach an already-uploaded document (from another cohort's week) instead of uploading a new file. */
  async choose(weekId: number, url: string, name: string | null): Promise<void> {
    const { error } = await supabase.from('Week').update({ manualDocumentUrl: url, manualDocumentName: name }).eq('id', weekId);
    if (error) throw new Error(error.message);
  },
};

// "Choose an earlier file" picker: every distinct manual/recap document ever
// uploaded, from other cohorts.
export const earlierClassDocumentsApi = {
  async getAll(excludeCohortId?: string): Promise<{ documents: import('../types').EarlierClassDocument[] }> {
    const { data, error } = await supabase.rpc('list_earlier_class_documents', { p_exclude_cohort_id: excludeCohortId ?? null });
    if (error) throw new Error(error.message);
    return { documents: (data as import('../types').EarlierClassDocument[]) || [] };
  },
};

// Manual questions: participants ask via SECURITY DEFINER RPCs (token-based,
// same as testimonies/faith help); support/admin read and act on them via
// staff RPCs (session-token header, same as get_my_hub).
export const manualQuestionsApi = {
  async listForCohort(cohortId: string, filters?: { weekId?: number; groupId?: string }): Promise<{ questions: import('../types').ManualQuestion[] }> {
    const { data, error } = await supabase.rpc('list_manual_questions', {
      p_cohort_id: cohortId,
      p_week_id: filters?.weekId ?? null,
      p_group_id: filters?.groupId ?? null,
    });
    if (error) throw new Error(error.message);
    return { questions: (data as import('../types').ManualQuestion[]) || [] };
  },

  async markInClass(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_manual_question_in_class', { p_id: id });
    if (error) throw new Error(error.message);
  },

  async reply(id: string, reply: string): Promise<void> {
    const { error } = await supabase.rpc('reply_manual_question', { p_id: id, p_reply: reply });
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------------------
// Participant app: staff side
// ---------------------------------------------------------------------------

// When participants reflected, never what they wrote.
export const reflectionActivityApi = {
  async getForCohort(cohortId: string): Promise<{ activity: import('../types').ReflectionActivity[] }> {
    const { data, error } = await supabase.rpc('reflection_activity', { p_token: getSessionToken(), p_cohort_id: cohortId });
    if (error) throw new Error(error.message.includes('SESSION_EXPIRED') ? 'SESSION_EXPIRED' : error.message);
    return { activity: (data as import('../types').ReflectionActivity[]) || [] };
  },
};

export const recapReleasesApi = {
  async get(groupId: string, weekId: number): Promise<{ release: import('../types').RecapRelease | null }> {
    const { data, error } = await supabase.from('RecapRelease').select('groupId, weekId, releasedById, releasedAt')
      .eq('groupId', groupId).eq('weekId', weekId).maybeSingle();
    if (error) throw new Error(error.message);
    return { release: (data as import('../types').RecapRelease | null) ?? null };
  },

  async release(groupId: string, weekId: number, userId: string): Promise<{ release: import('../types').RecapRelease }> {
    const { data, error } = await supabase.from('RecapRelease')
      .upsert({ groupId, weekId, releasedById: userId, releasedAt: new Date().toISOString() }, { onConflict: 'groupId,weekId' })
      .select('groupId, weekId, releasedById, releasedAt')
      .single();
    if (error) throw new Error(error.message);
    return { release: data as import('../types').RecapRelease };
  },
};

const mapCheckIn = (row: any): import('../types').ParticipantCheckIn => ({
  id: row.id,
  participantId: row.participantId,
  response: row.response,
  sundayMisses: row.sundayMisses ?? 0,
  meetingMisses: row.meetingMisses ?? 0,
  handledAt: row.handledAt ?? null,
  handledById: row.handledById ?? null,
  createdAt: row.createdAt,
});

export const participantCheckInsApi = {
  async getForParticipants(participantIds: string[]): Promise<{ checkIns: import('../types').ParticipantCheckIn[] }> {
    if (participantIds.length === 0) return { checkIns: [] };
    const { data, error } = await supabase.from('ParticipantCheckIn').select('*')
      .in('participantId', participantIds).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { checkIns: ((data as any[]) || []).map(mapCheckIn) };
  },

  async markHandled(id: string, userId: string): Promise<{ checkIn: import('../types').ParticipantCheckIn }> {
    const { data, error } = await supabase.from('ParticipantCheckIn')
      .update({ handledAt: new Date().toISOString(), handledById: userId })
      .eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return { checkIn: mapCheckIn(data) };
  },
};

// Which welcome + page tours this person has seen. Saved per account through
// session-checked functions, so it follows them across devices.
export const tourProgressApi = {
  async getSeen(): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_tour_progress', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    return (data as string[] | null) || [];
  },

  async markSeen(key: string): Promise<void> {
    const { error } = await supabase.rpc('mark_tour_seen', { p_token: getSessionToken(), p_key: key });
    if (error) throw new Error(error.message);
  },
};

export const scripturesApi = {
  async getAll(): Promise<{ scriptures: import('../types').Scripture[] }> {
    const { data, error } = await supabase.from('Scripture').select('id, dayNumber, imageUrl, storagePath, createdAt').order('dayNumber');
    if (error) throw new Error(error.message);
    return { scriptures: (data as import('../types').Scripture[]) || [] };
  },

  // Uploads the (already resized) image and sets it as that day's scripture,
  // replacing any design already on that day.
  async upload(dayNumber: number, image: Blob, userId: string): Promise<{ scripture: import('../types').Scripture }> {
    const extension = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
    const path = `scriptures/day-${dayNumber}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, image, { upsert: false, contentType: image.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
    const { data: publicUrl } = supabase.storage.from('resources').getPublicUrl(path);

    const { data: previous } = await supabase.from('Scripture').select('id, storagePath').eq('dayNumber', dayNumber).maybeSingle();
    // Update-or-insert by hand: the dayNumber unique constraint is DEFERRABLE
    // (for drag reordering), and Postgres refuses a deferrable constraint as
    // an ON CONFLICT target, so .upsert(..., { onConflict: 'dayNumber' }) fails.
    const row = { dayNumber, imageUrl: publicUrl.publicUrl, storagePath: path, createdById: userId, updatedAt: new Date().toISOString() };
    const { data, error } = await (previous?.id
      ? supabase.from('Scripture').update(row).eq('id', previous.id)
      : supabase.from('Scripture').insert(row))
      .select('id, dayNumber, imageUrl, storagePath, createdAt')
      .single();
    if (error) throw new Error(error.message);
    // The replaced design's file is no longer used by anything.
    if (previous?.storagePath && previous.storagePath !== path) {
      void supabase.storage.from('resources').remove([previous.storagePath]);
    }
    return { scripture: data as import('../types').Scripture };
  },

  async remove(scripture: import('../types').Scripture): Promise<void> {
    const { error } = await supabase.from('Scripture').delete().eq('id', scripture.id);
    if (error) throw new Error(error.message);
    if (scripture.storagePath) void supabase.storage.from('resources').remove([scripture.storagePath]);
  },

  // Persists a drag-reorder: dayNumber becomes each id's 1-based position.
  async reorder(ids: string[]): Promise<void> {
    const { error } = await supabase.rpc('reorder_scriptures', { ids });
    if (error) throw new Error(error.message);
  },
};

// Push to participants' devices (they have no in-app feed). Used when a support
// replies in a participant's faith project conversation.
export const participantPushApi = {
  async notify(participantIds: string[], title: string, body: string, path: string): Promise<void> {
    if (participantIds.length === 0) return;
    try {
      await supabase.functions.invoke('notify-users', { body: { participantIds, title, body, path } });
    } catch { /* non-critical */ }
  },

  // participantIds with an active ParticipantAccount but no saved push
  // subscription — used for the "No alerts" tag/filter on the support and
  // admin participant lists. Backed by participants_without_push()
  // (20260925070000_participants_without_push.sql), which is not applied yet
  // — until it is, the RPC 404s and this resolves to [] so the UI just shows
  // no tags, no console error.
  async getUnreachableIds(): Promise<string[]> {
    try {
      const { data, error } = await supabase.rpc('participants_without_push');
      if (error) return [];
      return (data as string[]) ?? [];
    } catch {
      return [];
    }
  },

  // participantIds who have signed in but never opened the app from their Home
  // Screen. Backed by participants_without_app(); a failure resolves to [].
  async getNotInstalledIds(): Promise<string[]> {
    try {
      const { data, error } = await supabase.rpc('participants_without_app');
      if (error) return [];
      return (data as string[]) ?? [];
    } catch {
      return [];
    }
  },

  // Phone type and last-opened times for every participant the app has heard from, by id.
  // Backed by participants_app_details(); a failure resolves to {} (the details are only a hint).
  async getAppDetails(): Promise<Record<string, import('../types').ParticipantAppInfo>> {
    try {
      const { data, error } = await supabase.rpc('participants_app_details');
      if (error) { console.warn('participants_app_details failed:', error.message); return {}; }
      const out: Record<string, import('../types').ParticipantAppInfo> = {};
      ((data as import('../types').ParticipantAppInfo[]) ?? []).forEach((row) => { out[row.participantId] = row; });
      return out;
    } catch {
      return {};
    }
  },

  // participantIds in a cohort whose login is confirmed (they chose their own
  // password). Backed by participants_signed_in(); throws so the group builder
  // never hides people on a failed lookup.
  async getSignedInIds(cohortId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('participants_signed_in', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return (data as string[]) ?? [];
  },
};

export const feedbackApi = {
  async getResults(cohortId: string): Promise<import('../types').FeedbackResults> {
    const { data, error } = await supabase.rpc('feedback_results', { p_token: getSessionToken(), p_cohort_id: cohortId });
    if (error) throw new Error(error.message.includes('SESSION_EXPIRED') ? 'Please sign out and sign in again.' : error.message);
    return data as import('../types').FeedbackResults;
  },

  // Post-class feedback: each week's support notes and participant ratings.
  async getClassFeedbackResults(cohortId: string): Promise<import('../types').ClassFeedbackWeekResult[]> {
    const { data, error } = await supabase.rpc('class_feedback_results', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return (data as import('../types').ClassFeedbackWeekResult[]) ?? [];
  },
};

// Birthdays (admins): supports and participants, nearest first.
export const birthdaysApi = {
  async list(cohortId: string | null): Promise<import('../types').BirthdayList> {
    const { data, error } = await supabase.rpc('birthdays_list', { p_token: getSessionToken(), p_cohort_id: cohortId });
    if (error) throw new Error(error.message.includes('SESSION_EXPIRED') ? 'Please sign out and sign in again.' : error.message);
    return data as import('../types').BirthdayList;
  },
};

// Other sign-ups that used the same email as a follow-up contact (for contacts with no working number).
export const followUpRelatedApi = {
  async forContact(contactId: string): Promise<import('../types').FollowUpRelatedContact[]> {
    const { data, error } = await supabase.rpc('followup_related_contacts', { p_token: getSessionToken(), p_contact_id: contactId });
    if (error) return [];
    return (data as import('../types').FollowUpRelatedContact[]) ?? [];
  },
};

// Surveys: admins build them, participants and supports answer them. Everything
// goes through database functions that check who is asking.
const SURVEY_ERRORS: Record<string, string> = {
  SESSION_EXPIRED: 'Please sign out and sign in again.',
  NOT_ALLOWED: 'Only admins can do this.',
  SURVEY_NOT_AVAILABLE: 'This survey is not open right now.',
  SURVEY_ALREADY_SENT: 'You have already answered this survey.',
  TITLE_REQUIRED: 'Give the survey a name.',
  ADD_A_QUESTION: 'Add at least one question before publishing.',
  QUESTION_TEXT_REQUIRED: 'Every question needs some text.',
  SCALE_INVALID: 'A rating scale must be between 2 and 10.',
  BUILTIN_CANNOT_DELETE: 'This built-in survey cannot be deleted. Turn it off instead.',
  FEEDBACK_NOT_VISIBLE: 'Answers appear once at least five people have answered.',
};
const surveyError = (message: string): Error => {
  const known = Object.keys(SURVEY_ERRORS).find((code) => message.includes(code));
  if (known) return new Error(SURVEY_ERRORS[known]);
  const required = message.match(/ANSWER_REQUIRED: (.+)/);
  if (required) return new Error(`Please answer: ${required[1]}`);
  const invalid = message.match(/ANSWER_INVALID: (.+)/);
  if (invalid) return new Error(`Check your answer to: ${invalid[1]}`);
  return new Error(message || 'Something went wrong. Please try again.');
};

export const SURVEY_FILE_MAX_BYTES = 5 * 1024 * 1024;

export const surveyApi = {
  async pending(): Promise<import('../types').PendingSurvey[]> {
    const { data, error } = await supabase.rpc('survey_pending', { p_token: getSessionToken() });
    if (error) throw surveyError(error.message);
    return (data as import('../types').PendingSurvey[]) ?? [];
  },

  async get(id: string): Promise<import('../types').SurveyForFilling> {
    const { data, error } = await supabase.rpc('survey_get', { p_token: getSessionToken(), p_id: id });
    if (error) throw surveyError(error.message);
    return data as import('../types').SurveyForFilling;
  },

  async submit(id: string, answers: Record<string, unknown>, participantName?: string): Promise<void> {
    const { data, error } = await supabase.rpc('survey_submit', { p_token: getSessionToken(), p_id: id, p_answers: answers });
    if (error) throw surveyError(error.message);
    // Wrap-up answers that ask for a referral tell the participant's support, as before.
    const result = (data as { supportId?: string | null; wantsReferral?: boolean; department?: string } | null) ?? {};
    if (result.supportId && result.wantsReferral && result.department) {
      void notify(
        { userIds: [result.supportId] },
        `${participantName || 'Someone in your group'} wants to join ${result.department}`,
        'They asked for a referral in the participant app. Confirm it on their profile once they have joined.',
        '/support/participants',
        'GENERAL',
      );
    }
  },

  // A photo or file for a FILE question. Stored with the other app files.
  async uploadFile(surveyId: string, file: File): Promise<{ url: string; name: string }> {
    if (file.size > SURVEY_FILE_MAX_BYTES) throw new Error('That file is over 5 MB. Choose a smaller one.');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-60) || 'file';
    const path = `survey-files/${surveyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage.from('resources').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw new Error('Could not upload that file. Please try again.');
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    return { url: data.publicUrl, name: file.name };
  },

  async adminList(cohortId: string): Promise<import('../types').SurveyListItem[]> {
    const { data, error } = await supabase.rpc('survey_admin_list', { p_token: getSessionToken(), p_cohort_id: cohortId });
    if (error) throw surveyError(error.message);
    return (data as import('../types').SurveyListItem[]) ?? [];
  },

  async adminGet(id: string): Promise<import('../types').SurveyDetail> {
    const { data, error } = await supabase.rpc('survey_admin_get', { p_token: getSessionToken(), p_id: id });
    if (error) throw surveyError(error.message);
    return data as import('../types').SurveyDetail;
  },

  async adminSave(survey: Partial<import('../types').SurveyRecord>, questions: import('../types').SurveyQuestion[]): Promise<string> {
    const { data, error } = await supabase.rpc('survey_admin_save', { p_token: getSessionToken(), p_survey: survey, p_questions: questions });
    if (error) throw surveyError(error.message);
    return data as string;
  },

  async adminDelete(id: string): Promise<void> {
    const { error } = await supabase.rpc('survey_admin_delete', { p_token: getSessionToken(), p_id: id });
    if (error) throw surveyError(error.message);
  },

  async adminResults(id: string, cohortId: string | null): Promise<import('../types').SurveyResults> {
    const { data, error } = await supabase.rpc('survey_admin_results', { p_token: getSessionToken(), p_id: id, p_cohort_id: cohortId });
    if (error) throw surveyError(error.message);
    return data as import('../types').SurveyResults;
  },

  async summarise(id: string, cohortId: string | null): Promise<{ summary: string; createdAt: string }> {
    return invokeAi<{ summary: string; createdAt: string }>({ action: 'survey-summary', surveyId: id, cohortId });
  },
};

// Post-class feedback, the support side: their own "Anything to flag?" note
// per week. SupportClassFeedback is a staff-readable/writable table (RLS
// app_is_staff()), same as SupportHub -- no RPC needed for a support writing
// their own row.
export const classFeedbackApi = {
  // weekIds this support has already answered, for the cohort.
  async getMineForCohort(cohortId: string, supportId: string): Promise<Set<number>> {
    try {
      const { data, error } = await supabase
        .from('SupportClassFeedback')
        .select('weekId')
        .eq('cohortId', cohortId)
        .eq('supportId', supportId);
      if (error) return new Set();
      return new Set(((data as any[]) || []).map((r) => r.weekId));
    } catch {
      return new Set();
    }
  },

  async submitSupportFeedback(input: { cohortId: string; weekId: number; supportId: string; note: string; isNone: boolean }): Promise<void> {
    const { error } = await supabase
      .from('SupportClassFeedback')
      .upsert(
        [{
          cohortId: input.cohortId,
          weekId: input.weekId,
          supportId: input.supportId,
          note: input.isNone ? null : (input.note.trim() || null),
          isNone: input.isNone,
        }],
        { onConflict: 'supportId,weekId' },
      );
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------------------
// AI help (ai-assist edge function, OpenRouter free models)
// ---------------------------------------------------------------------------

// Keep in sync with DEFAULT_MODELS in supabase/functions/ai-assist/index.ts.
export const DEFAULT_AI_MODELS = ['nex-agi/nex-n2.5-pro:free', 'poolside/laguna-s-2.1:free', 'inclusionai/ling-3.0-flash-vl:free', 'google/gemma-4-31b-it:free'];

const AI_ERRORS: Record<string, string> = {
  AI_BUSY: 'The free AI service is busy right now. Try again in a few minutes.',
  AI_DISABLED: 'AI help is turned off in Settings.',
  AI_NOT_CONFIGURED: 'AI help is not set up yet.',
  AI_NOT_OPTED_IN: 'Turn on the AI summary first.',
  SUMMARY_LOCKED: 'Your summary unlocks in the last week of FOF.',
  NO_REFLECTIONS: 'Write at least one weekly reflection first.',
  NOTES_TOO_SHORT: 'Paste more of the class notes first.',
  FEEDBACK_NOT_VISIBLE: 'Themes are available once at least five people have sent feedback.',
  NO_COMMENTS: 'There are no written comments to summarise.',
  SESSION_EXPIRED: 'Please sign out and sign in again.',
  NOT_ALLOWED: 'Only admins can do this.',
};

const invokeAi = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('ai-assist', { body: { ...body, token: getSessionToken() } });
  if (error) {
    let code = '';
    try { code = (await (error as any).context?.json())?.error ?? ''; } catch { /* no body */ }
    throw new Error(AI_ERRORS[code] || 'AI help is not available right now. Please try again.');
  }
  return data as T;
};

export const aiApi = {
  async getSummaryState(): Promise<import('../types').ParticipantSummaryState> {
    const { data, error } = await supabase.rpc('participant_summary', { p_token: getSessionToken() });
    if (error) throw participantAppError(error.message, 'Could not load your summary.');
    return data as import('../types').ParticipantSummaryState;
  },

  async setOptIn(optIn: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_ai_opt_in', { p_token: getSessionToken(), p_opt_in: optIn });
    if (error) throw participantAppError(error.message, 'Could not save that.');
  },

  async generateSummary(): Promise<{ text: string; createdAt: string }> {
    return (await invokeAi<{ summary: { text: string; createdAt: string } }>({ action: 'participant-summary' })).summary;
  },

  async draftRecap(weekTitle: string, notes: string): Promise<{ summary: string; prompt: string }> {
    return invokeAi<{ summary: string; prompt: string }>({ action: 'recap-draft', weekTitle, notes });
  },

  async summariseFeedback(cohortId: string): Promise<{ themes: string; createdAt: string }> {
    return invokeAi<{ themes: string; createdAt: string }>({ action: 'feedback-themes', cohortId });
  },

  // The saved themes for the cohort's anonymous feedback, if any.
  async getFeedbackThemes(cohortId: string): Promise<{ themes: string; createdAt: string } | null> {
    const { data, error } = await supabase.rpc('feedback_themes', { p_token: getSessionToken(), p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return ((data as Array<{ round: string; themes: string; createdAt: string }>) || []).find((row) => row.round === 'GENERAL') ?? null;
  },

  async getSettings(): Promise<import('../types').AiSettings> {
    const { data } = await supabase.from('AppSetting').select('value').eq('settingKey', 'ai_settings').maybeSingle();
    const value = ((data as any)?.value ?? {}) as { enabled?: boolean; models?: unknown };
    const models = Array.isArray(value.models) ? value.models.map(String).filter((m) => m.trim()) : [];
    return { enabled: value.enabled !== false, models: models.length ? models : DEFAULT_AI_MODELS };
  },

  async saveSettings(settings: import('../types').AiSettings): Promise<void> {
    const value = { enabled: settings.enabled, models: settings.models.map((m) => m.trim()).filter(Boolean) };
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{ settingKey: 'ai_settings', value, updatedAt: new Date().toISOString() }], { onConflict: 'settingKey' });
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------------------
// Participant profile fields ("Request information")
// ---------------------------------------------------------------------------

const mapProfileField = (row: any): import('../types').ProfileField => ({
  id: row.id,
  label: row.label,
  helpText: row.helpText ?? null,
  fieldType: row.fieldType,
  options: Array.isArray(row.options) ? row.options.map(String) : [],
  required: row.required !== false,
  cohortIds: row.cohortIds ?? [],
  groupIds: row.groupIds ?? null,
  participantIds: row.participantIds ?? null,
  createdAt: row.createdAt,
  archivedAt: row.archivedAt ?? null,
});

export const profileFieldsApi = {
  async getAll(): Promise<{ fields: import('../types').ProfileField[] }> {
    const { data, error } = await supabase.from('ProfileField').select('*').order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return { fields: ((data as any[]) || []).map(mapProfileField) };
  },

  async create(input: Omit<import('../types').ProfileField, 'id' | 'createdAt' | 'archivedAt'>, createdById: string): Promise<{ field: import('../types').ProfileField }> {
    const { data, error } = await supabase.from('ProfileField').insert([{ ...input, createdById }]).select('*').single();
    if (error) throw new Error(error.message);
    return { field: mapProfileField(data) };
  },

  // Stop asking for a field. Answers already given are kept.
  async archive(id: string): Promise<void> {
    const { error } = await supabase.from('ProfileField').update({ archivedAt: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getSummary(): Promise<Map<string, { applies: number; answered: number }>> {
    const { data, error } = await supabase.rpc('profile_field_summary');
    if (error) throw new Error(error.message);
    return new Map(((data as any[]) || []).map((row) => [row.fieldId, { applies: Number(row.applies), answered: Number(row.answered) }]));
  },

  async getCohortCompletion(cohortId: string): Promise<Map<string, import('../types').ProfileCompletion>> {
    const { data, error } = await supabase.rpc('cohort_profile_completion', { p_cohort_id: cohortId });
    if (error) throw new Error(error.message);
    return new Map(((data as any[]) || []).map((row) => [row.participantId, row.completion]));
  },

  async getOverview(participantId: string): Promise<{ completion: import('../types').ProfileCompletion; fields: import('../types').ProfileFieldEntry[] }> {
    const { data, error } = await supabase.rpc('participant_profile_overview', { p_participant_id: participantId });
    if (error) throw new Error(error.message);
    return data as { completion: import('../types').ProfileCompletion; fields: import('../types').ProfileFieldEntry[] };
  },
};

// ---------------------------------------------------------------------------
// Public FOF landing page (fof.tcnikorodu.org) — signed-out visitors only
// ---------------------------------------------------------------------------

export interface PublicLandingInfo {
  registrationLink: string;
  nextCohort: { name: string; startDate: string } | null;
  classStartTime: string | null;
  landingImages: LandingImages;
  /** Raw saved override for DEFAULT_LANDING_CONTENT (components/landing/landingContent.ts)
   * — absent/empty until an admin edits Settings > Website, and possibly
   * partial even then; always render it through deepMerge/resolveLandingContent. */
  landingContent?: Record<string, unknown> | null;
}

export const landingApi = {
  async get(): Promise<PublicLandingInfo> {
    const { data, error } = await supabase.rpc('public_fof_landing');
    if (error) throw new Error(error.message);
    return data as PublicLandingInfo;
  },
};


// ---------------------------------------------------------------------------
// Practice: a safe place for the team to try the app together
// ---------------------------------------------------------------------------

export const practiceApi = {
  async getState(): Promise<import('../types').PracticeState> {
    const { data, error } = await supabase.rpc('practice_state');
    if (error || !data) throw new Error(error?.message || 'Could not load Practice');
    return data as import('../types').PracticeState;
  },

  async setRoster(members: Array<{ userId: string; role: import('../types').PracticeRole }>): Promise<void> {
    const { error } = await supabase.rpc('practice_set_roster', { p_members: members });
    if (error) throw new Error(error.message);
  },

  // Wipes and rebuilds Practice from the team list.
  async build(calendar?: import('../types').PracticeCalendar | null): Promise<void> {
    const { error } = await supabase.rpc('practice_build', { p_calendar: calendar ?? null });
    if (error) throw new Error(error.message);
  },

  async pulse(active = true): Promise<import('../types').PracticePulse> {
    // `active`: the person is inside Practice or in a walkthrough. Otherwise the database
    // skips the tick-checking scan, which keeps the beat light for supports doing real work.
    const { data, error } = await supabase.rpc('practice_pulse', { p_active: active });
    if (error || !data) throw new Error(error?.message || 'pulse failed');
    return data as import('../types').PracticePulse;
  },

  async team(): Promise<import('../types').PracticeTeamMember[]> {
    const { data, error } = await supabase.rpc('practice_team');
    if (error) throw new Error(error.message);
    return (data as import('../types').PracticeTeamMember[]) ?? [];
  },

  async setMyRole(role: import('../types').PracticeRole): Promise<void> {
    const { error } = await supabase.rpc('practice_set_my_role', { p_role: role });
    if (error) throw new Error(error.message);
  },

  async peerRequest(toUserId: string, myRole: import('../types').PracticeSeatKey, theirRole: import('../types').PracticeSeatKey): Promise<void> {
    const { error } = await supabase.rpc('practice_peer_request', { p_to: toUserId, p_my_role: myRole, p_their_role: theirRole });
    if (error) throw new Error(error.message);
  },

  async peerRespond(id: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('practice_peer_respond', { p_id: id, p_accept: accept });
    if (error) throw new Error(error.message);
  },

  async peerEnd(id: string): Promise<void> {
    const { error } = await supabase.rpc('practice_peer_end', { p_id: id });
    if (error) throw new Error(error.message);
  },

  // A real participant session for one of my practice participants.
  async enterParticipant(): Promise<{ token: string; user: import('../types').User }> {
    const { data, error } = await supabase.rpc('practice_enter_participant');
    if (error || !data) throw new Error(error?.message || 'Could not switch');
    return data as { token: string; user: import('../types').User };
  },

  async overview(): Promise<import('../types').PracticeOverview> {
    const { data, error } = await supabase.rpc('practice_overview');
    if (error || !data) throw new Error(error?.message || 'Could not load Practice');
    return data as import('../types').PracticeOverview;
  },

  async getStatus(): Promise<import('../types').PracticeStatus> {
    const { data, error } = await supabase.rpc('practice_status');
    if (error || !data) throw new Error(error?.message || 'Could not load Practice');
    return data as import('../types').PracticeStatus;
  },

  async resetMe(): Promise<void> {
    const { error } = await supabase.rpc('practice_reset_me');
    if (error) throw new Error(error.message);
  },

  async resetMyFirstTime(): Promise<void> {
    const { error } = await supabase.rpc('practice_reset_my_first_time');
    if (error) throw new Error(error.message);
  },

  async participantResetMe(): Promise<void> {
    const { error } = await supabase.rpc('practice_participant_reset_me', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
  },

  async participantPeerEnd(): Promise<void> {
    const { error } = await supabase.rpc('practice_participant_peer_end', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
  },

  async activePeers(): Promise<import('../types').PracticeActivePeer[]> {
    const { data, error } = await supabase.rpc('practice_active_peers');
    if (error) throw new Error(error.message);
    return (data as import('../types').PracticeActivePeer[]) ?? [];
  },

  async endAllPeers(): Promise<number> {
    const { data, error } = await supabase.rpc('practice_end_all_peers');
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },

  async leaveParticipant(): Promise<void> {
    await supabase.rpc('practice_leave_participant');
  },

  async participantPeer(): Promise<import('../types').PracticePeerActive | null> {
    const { data, error } = await supabase.rpc('practice_participant_peer', { p_token: getSessionToken() });
    if (error) throw new Error(error.message);
    return (data as import('../types').PracticePeerActive | null) ?? null;
  },

  // Next sign-in feels brand new: welcome, tours, role intros, Get the app prompt.
  async resetFirstTime(userId: string, forcePassword = false): Promise<void> {
    const { error } = await supabase.rpc('admin_reset_first_time', { p_user_id: userId, p_force_password: forcePassword });
    if (error) throw new Error(error.message);
  },

  async resetParticipantFirstTime(participantId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_reset_participant_first_time', { p_participant_id: participantId });
    if (error) throw new Error(error.message);
  },

  async setOn(on: boolean): Promise<void> {
    const { error } = await supabase.rpc('practice_set_on', { p_on: on });
    if (error) throw new Error(error.message);
  },

  async setCalendar(mode: import('../types').PracticeCalendar): Promise<void> {
    const { error } = await supabase.rpc('practice_set_calendar', { p_mode: mode });
    if (error) throw new Error(error.message);
  },

  async resetPerson(userId: string): Promise<void> {
    const { error } = await supabase.rpc('practice_reset_person', { p_user_id: userId });
    if (error) throw new Error(error.message);
  },

  async resetParticipant(participantId: string): Promise<void> {
    const { error } = await supabase.rpc('practice_reset_participant', { p_participant_id: participantId });
    if (error) throw new Error(error.message);
  },

  // Staff: my role and ticks.
  async getMine(): Promise<import('../types').PracticeMyProgress> {
    const { data, error } = await supabase.rpc('practice_my_progress');
    if (error || !data) throw new Error(error?.message || 'Could not load your checklist');
    return data as import('../types').PracticeMyProgress;
  },

  async setMine(key: string, done: boolean, stuck: boolean): Promise<void> {
    const { error } = await supabase.rpc('practice_set_progress', { p_key: key, p_done: done, p_stuck: stuck });
    if (error) throw new Error(error.message);
  },

  // Practice participants, through their own sign-in.
  async getForParticipant(): Promise<import('../types').PracticeMyProgress> {
    const { data, error } = await supabase.rpc('practice_participant_progress', { p_token: getSessionToken() });
    if (error || !data) throw new Error(error?.message || 'Could not load your checklist');
    return data as import('../types').PracticeMyProgress;
  },

  async setForParticipant(key: string, done: boolean, stuck: boolean): Promise<void> {
    const { error } = await supabase.rpc('practice_participant_set_progress', { p_token: getSessionToken(), p_key: key, p_done: done, p_stuck: stuck });
    if (error) throw new Error(error.message);
  },
};
