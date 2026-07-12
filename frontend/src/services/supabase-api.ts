import { supabase } from '../lib/supabase';
import type {
  User,
  Cohort,
  Week,
  Activity,
  Label,
  SupportActivityCompletion,
  PendingChange,
  RejectedChange,
  AuthResponse,
  TelegramNotificationEvent,
  DailyDigestFunctionResponse
} from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';
import { normalizeToIntlPhone } from '../utils/phone';
import { sendTelegramNotificationBestEffort } from './telegramNotifications';

// Types for API responses are now imported from ../types

// Current user session
const weekNumberCache = new Map<number, number>();
const DAILY_DIGEST_ENABLED_KEY = 'daily_digest_enabled';
const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseDailyDigestEnabled = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
  }
  if (value && typeof value === 'object') {
    const maybeEnabled = (value as { enabled?: unknown }).enabled;
    if (typeof maybeEnabled === 'boolean') return maybeEnabled;
  }
  // Safe default: enabled unless explicitly disabled.
  return true;
};

const getDigestFunctionEnv = (): { url: string; anonKey: string } => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase env config in frontend.');
  }

  return { url, anonKey };
};

const callDigestFunction = async (
  payload: Record<string, unknown>
): Promise<DailyDigestFunctionResponse> => {
  const { url, anonKey } = getDigestFunctionEnv();
  const response = await fetch(`${url}/functions/v1/telegram-daily-digest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as DailyDigestFunctionResponse;
  if (!response.ok || body.ok !== true) {
    const err = new Error(body.error || `Request failed (${response.status})`) as Error & {
      details?: unknown;
      payload?: DailyDigestFunctionResponse;
    };
    err.details = body.details;
    err.payload = body;
    throw err;
  }

  return body;
};

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

const getUserIdFromToken = (token: string, prefix: string): string | null => {
  if (!token || !token.startsWith(prefix)) {
    return null;
  }

  const userId = token.slice(prefix.length);
  return userId || null;
};

const getChangeSummary = (changeData: unknown): string => {
  if (!changeData || typeof changeData !== 'object') {
    return 'No summary provided';
  }

  const data = changeData as Record<string, unknown>;
  const time = typeof data.time === 'string' ? data.time : undefined;
  const description = typeof data.description === 'string' ? data.description : undefined;

  if (time && description) {
    return `${time} - ${description}`;
  }

  if (description) {
    return description;
  }

  if (typeof data.activityId === 'number') {
    return `Activity ID ${data.activityId}`;
  }

  return 'No summary provided';
};

const resolveWeekNumber = async (weekId?: number): Promise<number | undefined> => {
  if (typeof weekId !== 'number') return undefined;
  // Simple in-memory cache to avoid extra network calls during bulk operations.
  const cached = weekNumberCache.get(weekId);
  if (typeof cached === 'number') return cached;
  const { data, error } = await supabase
    .from('Week')
    .select('weekNumber')
    .eq('id', weekId)
    .single();
  if (error || !data) return undefined;
  const wn = (data as any).weekNumber as number | undefined;
  if (typeof wn === 'number') {
    weekNumberCache.set(weekId, wn);
  }
  return wn;
};

const getLoginUrl = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  // Keep it simple and always point to login.
  return `${window.location.origin}/login`;
};

const notifyTelegramBestEffort = (payload: TelegramNotificationEvent): void => {
  sendTelegramNotificationBestEffort(payload, { timeoutMs: 2500 });
};

const mapWeekRow = (week: any): Week => {
  const sortedDays = (week.Day || []).sort((a: any, b: any) => DAY_ORDER.indexOf(a.dayName) - DAY_ORDER.indexOf(b.dayName));

  return {
    id: week.id,
    cohortId: week.cohortId,
    weekNumber: week.weekNumber,
    title: week.title ?? null,
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
export const authApi = {
  async login(identifier: string, _password: string): Promise<AuthResponse> {
    const normalized = identifier.trim().toLowerCase();
    const lookupColumn = normalized.includes('@') ? 'email' : 'phone';

    // Look up one identifier at a time. PostgREST's `or` filter is parsed as a
    // query expression, so a combined email/phone lookup can be rejected by an
    // older cached client or database schema even when the email itself is a
    // valid, active account. A login value is unambiguously either an email or a
    // phone number, so a direct equality filter is both simpler and more robust.
    // Do NOT use .single(): it throws on duplicate legacy accounts and would
    // turn an otherwise usable account into a login failure.
    const { data: matches, error } = await supabase
      .from('User')
      .select('*')
      .eq(lookupColumn, normalized);

    if (error) {
      throw new Error('Login service unavailable');
    }

    const rows = (matches as any[]) || [];
    if (rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    // On a multi-match, prefer an active account, then the oldest (stable pick
    // and consistent with which row an account merge would keep).
    const pickUser = (candidates: any[]) => {
      const active = candidates.filter((u) => u.isActive !== false);
      const pool = active.length > 0 ? active : candidates;
      return [...pool].sort((a, b) =>
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      )[0];
    };

    const user = pickUser(rows);

    if (user.isActive === false) {
      throw new Error('Account deactivated');
    }

    return {
      user,
      accessToken: `mock_token_${user.id}`,
      refreshToken: `refresh_token_${user.id}`,
    };
  },

  async register(userData: {
    email?: string;
    phone?: string;
    name: string;
    password: string;
    role?: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'
  }): Promise<{ user: User }> {
    const { data, error } = await supabase
      .from('User')
      .insert([{
        ...(userData.email ? { email: userData.email.trim().toLowerCase() } : {}),
        ...(userData.phone ? { phone: userData.phone.trim() } : {}),
        name: userData.name,
        password_hash: `hashed_${userData.password}`,
        role: userData.role || 'SUPPORT',
      }])
      .select()
      .single();

    if (error) {
      throw new Error(friendlyUserError(error.message, 'Could not create the account. Please try again.'));
    }

    return { user: data };
  },

  async getMe(): Promise<{ user: User }> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot get current user outside browser context');
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
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    if (data.isActive === false) {
      throw new Error('Account deactivated');
    }

    return { user: data };
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const userId = getUserIdFromToken(refreshToken, 'refresh_token_');
    if (!userId) {
      throw new Error('Invalid refresh token');
    }

    const { data, error } = await supabase
      .from('User')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    if (data.isActive === false) {
      throw new Error('Account deactivated');
    }

    return {
      user: data,
      accessToken: `mock_token_${data.id}`,
      refreshToken: `refresh_token_${data.id}`,
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

  async update(weekId: number, input: { title?: string | null }): Promise<{ week: Week }> {
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
    status?: 'ACTIVE' | 'ARCHIVED';
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
      .select('userId, User(*)')
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
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
        }) as User),
    };
  },

  async setMembers(cohortId: string, userIds: string[]): Promise<{ message: string }> {
    const { error: deleteError } = await supabase
      .from('UserCohort')
      .delete()
      .eq('cohortId', cohortId);

    if (deleteError) throw new Error(deleteError.message);

    if (userIds.length === 0) return { message: 'Cohort members cleared' };

    const { error: insertError } = await supabase
      .from('UserCohort')
      .insert(userIds.map((userId) => ({ userId, cohortId })));

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

    const actor = getCurrentUserFromStorage();

    const weekNumber = await resolveWeekNumber(day.weekId);
    notifyTelegramBestEffort({
      event: 'CHANGE_REQUEST_CREATED',
      changeType: 'ADD',
      actorName: actor?.name || 'Support User',
      actorRole: actor?.role || 'SUPPORT',
      requestId: data.id,
      weekId: day.weekId,
      weekNumber,
      dayName: day.dayName,
      summary: `${activityData.time} - ${activityData.description}`,
      timestamp: data.createdAt,
      loginUrl: getLoginUrl(),
    });

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

    try {
      const actor = getCurrentUserFromStorage();
      const payloadData = changeData.changeData as Record<string, unknown> | undefined;
      const dayName = typeof payloadData?.dayName === 'string' ? (payloadData.dayName as string) : undefined;

      notifyTelegramBestEffort({
        event: 'CHANGE_REQUEST_CREATED',
        changeType: changeData.changeType,
        actorName: actor?.name || 'Support User',
        actorRole: actor?.role || 'SUPPORT',
        requestId: (data as any).id,
        weekId: changeData.weekId,
        weekNumber: await resolveWeekNumber(changeData.weekId),
        dayName,
        summary: getChangeSummary(changeData.changeData),
        timestamp: (data as any).createdAt,
        loginUrl: getLoginUrl(),
      });
    } catch (notifyError) {
      console.warn('Telegram notification failed for pending change create:', notifyError);
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

    const changeData = change.changeData as Record<string, unknown>;
    const dayName = typeof changeData.dayName === 'string' ? changeData.dayName : undefined;

    notifyTelegramBestEffort({
      event: 'CHANGE_APPROVED',
      changeType: change.changeType,
      actorName: 'Admin',
      actorRole: 'ADMIN',
      requestId: changeId,
      weekId: change.weekId,
      weekNumber: await resolveWeekNumber(change.weekId),
      dayName,
      summary: getChangeSummary(change.changeData),
      timestamp: new Date().toISOString(),
      loginUrl: getLoginUrl(),
    });

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

    const changeData = change.changeData as Record<string, unknown>;
    const dayName = typeof changeData.dayName === 'string' ? changeData.dayName : undefined;

    notifyTelegramBestEffort({
      event: 'CHANGE_REJECTED',
      changeType: change.changeType,
      actorName: 'Admin',
      actorRole: 'ADMIN',
      requestId: changeId,
      weekId: change.weekId,
      weekNumber: await resolveWeekNumber(change.weekId),
      dayName,
      summary: `${getChangeSummary(change.changeData)} | Reason: ${rejectionReason}`,
      timestamp: rejectedChange.rejectedAt,
      loginUrl: getLoginUrl(),
    });

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

    const { data, error } = await supabase
      .from('Notification')
      .select('*')
      .eq('userId', me.id)
      .order('createdAt', { ascending: false })
      .limit(50);

    if (error) {
      // Table not migrated yet → behave as an empty feed rather than crash.
      if ((error as any).code === '42P01') return { notifications: [], unreadCount: 0 };
      throw new Error(error.message);
    }

    const notifications = (data || []) as import('../types').Notification[];
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return { notifications, unreadCount };
  },

  async markAllRead(): Promise<{ updatedCount: number }> {
    const me = getCurrentUserFromStorage();
    if (!me?.id) return { updatedCount: 0 };

    const { data, error } = await supabase
      .from('Notification')
      .update({ isRead: true })
      .eq('userId', me.id)
      .eq('isRead', false)
      .select('id');

    if (error) throw new Error(error.message);
    return { updatedCount: data?.length || 0 };
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('Notification')
      .update({ isRead: true })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// App Settings API
export const settingsApi = {
  async getDailyDigestEnabled(): Promise<{ enabled: boolean }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', DAILY_DIGEST_ENABLED_KEY)
      .maybeSingle();

    if (error) {
      // Backward-compatible fallback when migration isn't applied yet.
      if ((error as any).code === '42P01' || error.message?.includes('AppSetting')) {
        return { enabled: true };
      }
      throw new Error(error.message);
    }

    return { enabled: parseDailyDigestEnabled((data as any)?.value) };
  },

  async setDailyDigestEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .upsert(
        [{
          settingKey: DAILY_DIGEST_ENABLED_KEY,
          value: enabled,
          updatedAt: new Date().toISOString(),
        }],
        { onConflict: 'settingKey' }
      )
      .select('value')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { enabled: parseDailyDigestEnabled((data as any)?.value) };
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
};

export const digestApi = {
  async getDigestStatus(): Promise<DailyDigestFunctionResponse> {
    return callDigestFunction({
      action: 'status',
      force: true,
    });
  },

  async sendDigestNow(): Promise<DailyDigestFunctionResponse> {
    return callDigestFunction({
      action: 'send',
      force: true,
      advance: false,
    });
  },

  async restartDigest(): Promise<DailyDigestFunctionResponse> {
    return callDigestFunction({
      action: 'restart',
      force: true,
    });
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
      .select('*')
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
      .select('*')
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
    email?: string;
    password?: string;
    role?: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT';
    isActive?: boolean;
    deactivatedAt?: string | null;
    isCoordinator?: boolean;
  }): Promise<{ user: User }> {
    const finalUpdateData: any = { ...updateData };

    // Simple hash for demo if password provided
    if (updateData.password) {
      finalUpdateData.password_hash = `hashed_${updateData.password}`;
      delete finalUpdateData.password;
    }

    const { data, error } = await supabase
      .from('User')
      .update(finalUpdateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(friendlyUserError(error.message, 'Could not save the changes. Please try again.'));
    }

    return { user: data };
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

  async uploadAvatar(userId: string, file: File): Promise<{ avatarUrl: string }> {
    // Resize to max 128×128 JPEG at 0.7 quality client-side
    const compressed = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        const scale = Math.min(size / img.width, size / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.7);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });

    const path = `avatars/${userId}.jpg`;
    const { error: uploadError } = await supabase.storage.from('resources').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
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

  async remove(userId: string, endpoint: string): Promise<void> {
    const { error } = await supabase
      .from('PushSubscription')
      .delete()
      .eq('userId', userId)
      .eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
  },
};

const REMIND_BEFORE_KEY = 'remind_before_minutes';

// Notification settings (stored in AppSetting table)
export const notificationSettingsApi = {
  async get(): Promise<{ remindBeforeMinutes: number[] }> {
    const { data, error } = await supabase
      .from('AppSetting')
      .select('value')
      .eq('settingKey', REMIND_BEFORE_KEY)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const value = (data as any)?.value;
    if (Array.isArray(value)) return { remindBeforeMinutes: value as number[] };
    return { remindBeforeMinutes: [60] };
  },

  async set(minutes: number[]): Promise<{ remindBeforeMinutes: number[] }> {
    const { error } = await supabase
      .from('AppSetting')
      .upsert([{
        settingKey: REMIND_BEFORE_KEY,
        value: minutes,
        updatedAt: new Date().toISOString(),
      }], { onConflict: 'settingKey' });

    if (error) throw new Error(error.message);

    return { remindBeforeMinutes: minutes };
  },
};

export const announcementsApi = {
  async send(
    subject: string,
    body: string,
    sentBy: string,
    options?: { scope?: 'ACTIVE_COHORT' | 'ALL_USERS'; cohortId?: string | null; targetLabelId?: string | null }
  ): Promise<{ sent: number }> {
    const { data, error } = await supabase.functions.invoke('send-announcement', {
      body: {
        subject,
        body,
        sentBy,
        scope: options?.scope || 'ACTIVE_COHORT',
        cohortId: options?.cohortId || null,
        targetLabelId: options?.targetLabelId || null,
      },
    });
    if (error) throw new Error(error.message);
    return { sent: (data as any)?.sent ?? 0 };
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
    }));

    const isGlobal = (row: { scope?: string | null; cohortId?: string | null }) =>
      row.scope === 'ALL_USERS' || row.scope == null || row.cohortId == null;

    // A tag-targeted announcement is visible to admins (always) and to non-admins
    // only if they hold that tag. Untargeted announcements pass this gate.
    const userLabelIds = new Set(options?.userLabelIds || []);
    const passesTarget = (row: { targetLabelId?: string | null }) => {
      if (!row.targetLabelId) return true;
      if (options?.isAdmin) return true;
      return userLabelIds.has(row.targetLabelId);
    };

    const announcements = allAnnouncements.filter((row) => {
      if (!passesTarget(row)) return false;
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
  }): Promise<{ resource: import('../types').Resource }> {
    const { data, error } = await supabase
      .from('Resource')
      .insert([{
        title: input.title,
        description: input.description || null,
        type: 'link',
        url: input.url,
        addedBy: input.addedBy,
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { resource: data as any };
  },

  async uploadFile(input: {
    title: string;
    description?: string;
    file: File;
    addedBy: string;
  }): Promise<{ resource: import('../types').Resource }> {
    const ext = input.file.name.split('.').pop()?.toLowerCase() || 'file';
    const path = `${Date.now()}_${input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(path, input.file, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path);
    const type = ['pdf'].includes(ext) ? 'pdf'
      : ['doc', 'docx'].includes(ext) ? 'doc'
      : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'image'
      : 'file';

    const { data, error } = await supabase
      .from('Resource')
      .insert([{
        title: input.title,
        description: input.description || null,
        type,
        url: urlData.publicUrl,
        fileName: input.file.name,
        fileSize: input.file.size,
        addedBy: input.addedBy,
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { resource: data as any };
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
  cohortId: row.cohortId,
  cohortName: row.Cohort?.name || null,
  cohortVenue: row.Cohort?.venue || null,
  cohortStartDate: row.Cohort?.startDate || null,
  dueDate: row.dueDate,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const FOLLOW_UP_SELECT = '*, owner:User!FollowUpContact_ownerId_fkey(id, name), Cohort(name, venue, startDate)';

export type FollowUpContactInput = import('../types').FollowUpContactUpdate;

const notifyFollowUpAssignment = (ownerId: string, contactNames: string[]) => {
  // Fire-and-forget: a push failure must never block the UI flow.
  void supabase.functions
    .invoke('notify-followup-assignment', {
      body: { ownerId, contactCount: contactNames.length, sample: contactNames.slice(0, 3) },
    })
    .catch(() => undefined);
};

const getTerminalFollowUpReason = (contact: {
  nextAction?: string | null;
  registrationStatus?: string | null;
  replyStatus?: string | null;
  callStatus?: string | null;
}): 'CLOSE' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'INCORRECT_NUMBER' | 'NO_RESPONSE' | null => {
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
  terminalState: 'CLOSE' | 'NOT_INTERESTED' | 'NOT_A_TCN_MEMBER' | 'NOT_A_GOOD_TIME' | 'INCORRECT_NUMBER' | 'NO_RESPONSE'
) => {
  void supabase.functions
    .invoke('notify-followup-terminal-status', {
      body: { contactId, actorId, terminalState },
    })
    .catch(() => undefined);
};

export const followUpContactsApi = {
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

  async create(input: FollowUpContactInput): Promise<{ contact: import('../types').FollowUpContact }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .insert([input])
      .select(FOLLOW_UP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create contact');

    const contact = mapFollowUpContact(data);
    if (input.ownerId) notifyFollowUpAssignment(input.ownerId, [contact.fullName]);
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

    if (fields.registrationStatus === 'NO_RESPONSE') {
      patch.replyStatus = 'NO_REPLY';
      patch.callStatus = 'NOT_APPLICABLE';
      patch.nextAction = 'CLOSE';
    }

    if (fields.nextAction === 'CLOSE') {
      patch.archivedAt = new Date().toISOString();
    } else if (fields.nextAction) {
      patch.archivedAt = null;
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
      actor.role !== 'ADMIN' &&
      nextTerminalReason &&
      nextTerminalReason !== previousTerminalReason
    ) {
      notifyFollowUpTerminalStatus(contact.id, actor.id, nextTerminalReason);
    }

    // Auto-create a Participant when the contact is marked REGISTERED.
    if (
      fields.registrationStatus === 'REGISTERED' &&
      (current as any).registrationStatus !== 'REGISTERED'
    ) {
      void participantsApi.upsertFromFollowUpContact(contact).catch(() => undefined);
    }

    return { contact };
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

  async getNextCohortContacts(cohortId: string): Promise<{ contacts: import('../types').FollowUpContact[] }> {
    const { data, error } = await supabase
      .from('FollowUpContact')
      .select(FOLLOW_UP_SELECT)
      .eq('cohortId', cohortId)
      .eq('registrationStatus', 'NEXT_COHORT')
      .is('archivedAt', null);
    if (error) throw new Error(error.message);
    return { contacts: ((data as any[]) || []).map(mapFollowUpContact) };
  },

  async bulkMoveNextCohortContacts(contactIds: string[], newCohortId: string): Promise<void> {
    const { error } = await supabase
      .from('FollowUpContact')
      .update({
        cohortId: newCohortId,
        registrationStatus: 'NOT_REGISTERED',
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .in('id', contactIds);
    if (error) throw new Error(error.message);
  },
};

export const messageTemplatesApi = {
  async getAll(options?: { category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR' }): Promise<{ templates: import('../types').MessageTemplate[] }> {
    let q = supabase.from('MessageTemplate').select('*').order('createdAt', { ascending: true });
    if (options?.category) q = q.eq('category', options.category);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { templates: (data as any[]) || [] };
  },

  async create(input: { useCase: string; body: string; whenToUse?: string | null; imageUrl?: string | null; imageName?: string | null; category?: 'FOLLOW_UP' | 'ONBOARDING' | 'COORDINATOR' }): Promise<{ template: import('../types').MessageTemplate }> {
    const { data, error } = await supabase
      .from('MessageTemplate')
      .insert([input])
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create template');
    return { template: data as any };
  },

  async update(templateId: string, input: { useCase: string; body: string; whenToUse?: string | null; imageUrl?: string | null; imageName?: string | null }): Promise<{ template: import('../types').MessageTemplate }> {
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

const ISSUE_SELECT = '*, contact:FollowUpContact(id, fullName), owner:User!FollowUpIssue_ownerId_fkey(id, name), reportedBy:User!FollowUpIssue_reportedById_fkey(id, name)';

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
    person?: string | null;
    issue: string;
    reportedById?: string | null;
    ownerId?: string | null;
    neededFrom?: string | null;
  }): Promise<{ issue: import('../types').FollowUpIssue }> {
    const { data, error } = await supabase
      .from('FollowUpIssue')
      .insert([input])
      .select(ISSUE_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create issue');
    const issue = mapFollowUpIssue(data);
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

// ── Participants ──────────────────────────────────────────────────────────────

const PARTICIPANT_SELECT = `
  *,
  cohort:Cohort(name),
  group:GroupParticipant(group:Group(id, name))
`.trim();

const resolveSupportScopedGroups = async (supportId: string, cohortId?: string | null): Promise<import('../types').Group[]> => {
  let directQuery = supabase
    .from('Group')
    .select(GROUP_SELECT)
    .eq('supportId', supportId)
    .order('name', { ascending: true });

  if (cohortId) directQuery = directQuery.eq('cohortId', cohortId);

  const { data: directRows, error: directError } = await directQuery;
  if (directError) throw new Error(directError.message);

  const directGroups = ((directRows as any[]) || []).map(mapGroup);
  if (directGroups.length > 0) return directGroups;

  let fallbackQuery = supabase
    .from('Group')
    .select(GROUP_SELECT)
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
    status: row.status ?? 'ACTIVE',
    notes: row.notes ?? null,
    email: row.email ?? null,
    gender: row.gender ?? null,
    ageRange: row.ageRange ?? null,
    departments: row.departments ?? [],
    registrationDate: row.registrationDate ?? null,
    smartRequest: row.smartRequest ?? null,
    groupId: gp?.group?.id ?? null,
    groupName: gp?.group?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const participantsApi = {
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
};

// ── Participant handovers and support notes ─────────────────────────────────

const PARTICIPANT_NOTE_SELECT = '*, author:User!ParticipantNote_authorId_fkey(id, name)';

const mapParticipantNote = (row: any): import('../types').ParticipantNote => ({
  id: row.id, participantId: row.participantId, body: row.body,
  authorId: row.authorId ?? null, authorName: row.author?.name ?? null,
  groupId: row.groupId ?? null, weekId: row.weekId ?? null,
  noteType: row.noteType ?? 'HANDOVER', createdAt: row.createdAt,
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
  async create(input: { participantId: string; body: string; authorId: string; groupId?: string | null; weekId?: number | null; noteType?: import('../types').ParticipantNoteType }): Promise<{ note: import('../types').ParticipantNote }> {
    const { data, error } = await supabase.from('ParticipantNote')
      .insert([{ ...input, body: input.body.trim(), noteType: input.noteType ?? 'HANDOVER' }])
      .select(PARTICIPANT_NOTE_SELECT).single();
    if (error || !data) throw new Error(error?.message || 'Failed to save participant note');
    return { note: mapParticipantNote(data) };
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
  updatedByName: row.updatedBy?.name ?? null,
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
  updatedByName: row.updatedBy?.name ?? null,
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
  const adopt = (candidates ?? []).find(
    (l: any) => !l.groupId && (l.cohortId === group.cohortId || l.cohortId === null)
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
  async getAll(options?: { cohortId?: string }): Promise<{ groups: import('../types').Group[] }> {
    let query = supabase
      .from('Group')
      .select(GROUP_SELECT)
      .order('name', { ascending: true });

    if (options?.cohortId) query = query.eq('cohortId', options.cohortId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { groups: ((data as any[]) || []).map(mapGroup) };
  },

  async create(input: { cohortId: string; name: string; supportId?: string | null; meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null }): Promise<{ group: import('../types').Group }> {
    const { data, error } = await supabase
      .from('Group')
      .insert([input])
      .select(GROUP_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create group');
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

  async update(groupId: string, input: { name?: string; supportId?: string | null; meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null }): Promise<{ group: import('../types').Group }> {
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

  async delete(groupId: string): Promise<{ message: string }> {
    // Label.groupId and UserLabel.labelId both cascade ON DELETE, so deleting the
    // group automatically removes its tag and that tag's support links.
    const { error } = await supabase.from('Group').delete().eq('id', groupId);
    if (error) throw new Error(error.message);
    return { message: 'Group deleted' };
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
});

export const attendanceApi = {
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

  async mark(participantId: string, weekId: number, status: import('../types').AttendanceStatus, markedById?: string): Promise<{ record: import('../types').AttendanceRecord }> {
    const { data, error } = await supabase
      .from('AttendanceRecord')
      .upsert(
        { participantId, weekId, status, markedById: markedById ?? null, markedAt: new Date().toISOString() },
        { onConflict: 'participantId,weekId' }
      )
      .select(ATTENDANCE_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to mark attendance');
    return { record: mapAttendance(data) };
  },

  async bulkMark(entries: Array<{ participantId: string; weekId: number; status: import('../types').AttendanceStatus }>, markedById?: string): Promise<{ records: import('../types').AttendanceRecord[] }> {
    if (entries.length === 0) return { records: [] };
    const rows = entries.map((e) => ({
      ...e,
      markedById: markedById ?? null,
      markedAt: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('AttendanceRecord')
      .upsert(rows, { onConflict: 'participantId,weekId' })
      .select(ATTENDANCE_SELECT);

    if (error) throw new Error(error.message);
    return { records: ((data as any[]) || []).map(mapAttendance) };
  },
};

// ── Faith Projects ────────────────────────────────────────────────────────────

const FAITH_PROJECT_SELECT = '*, participant:Participant(id, fullName), updatedBy:User!FaithProject_updatedById_fkey(id, name)';

const mapFaithProject = (row: any): import('../types').FaithProject => ({
  id: row.id,
  participantId: row.participantId,
  participantName: row.participant?.fullName ?? null,
  title: row.title ?? null,
  body: row.body ?? null,
  status: row.status ?? 'NOT_DRAFTED',
  updatedById: row.updatedById ?? null,
  updatedByName: row.updatedBy?.name ?? null,
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

  async upsertForParticipant(participantId: string, input: { title?: string | null; body?: string | null; status?: import('../types').FaithProjectStatus; updatedById?: string | null }): Promise<{ project: import('../types').FaithProject }> {
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

// ── Group Prayers ─────────────────────────────────────────────────────────────

const GROUP_PRAYER_SELECT = '*, createdBy:User!GroupPrayer_createdById_fkey(id, name), week:Week(weekNumber)';

const mapGroupPrayer = (row: any): import('../types').GroupPrayer => ({
  id: row.id,
  cohortId: row.cohortId,
  weekId: row.weekId,
  weekNumber: row.week?.weekNumber ?? undefined,
  body: row.body,
  createdById: row.createdById ?? null,
  createdByName: row.createdBy?.name ?? null,
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
  setByName: row.setBy?.name ?? null,
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
    return { status: mapGroupPrayerStatus(data) };
  },
};

// ─── Hub API ──────────────────────────────────────────────────────────────────

const HUB_TOPIC_SELECT = `*, author:User!HubTopic_authorId_fkey(id, name, "avatarUrl"), comments:HubComment(id), reactions:HubReaction("userId")`;
const HUB_COMMENT_SELECT = `*, author:User!HubComment_authorId_fkey(id, name, "avatarUrl"), replies:HubReply(id)`;
const HUB_REPLY_SELECT = `*, author:User!HubReply_authorId_fkey(id, name, "avatarUrl")`;

const mapTopic = (row: any, currentUserId?: string): import('../types').HubTopic => {
  const reactions = (row.reactions ?? []) as Array<{ userId: string }>;
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
