import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type {
  User,
  Cohort,
  UserCohort,
  Week,
  Day,
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
import { sendTelegramNotificationBestEffort } from './telegramNotifications';

// Types for API responses are now imported from ../types

// Current user session
let currentSession: Session | null = null;
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
  currentSession = session;
  return session;
};

// Auth API using Supabase Auth
export const authApi = {
  async login(identifier: string, password: string): Promise<AuthResponse> {
    const normalized = identifier.trim().toLowerCase();
    const { data: users, error } = await supabase
      .from('User')
      .select('*')
      .or(`email.eq.${normalized},phone.eq.${normalized}`)
      .single();

    if (error || !users) {
      throw new Error('Invalid credentials');
    }

    return {
      user: users,
      accessToken: `mock_token_${users.id}`,
      refreshToken: `refresh_token_${users.id}`,
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
      throw new Error(error.message);
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
      if (cachedUser) {
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
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  },

  async createFromCurrent(input: {
    name: string;
    description?: string;
    startDate?: string | null;
    endDate?: string | null;
    sourceCohortId: string;
  }): Promise<{ cohort: Cohort }> {
    const { data: cohortRow, error: cohortError } = await supabase
      .from('Cohort')
      .insert([{
        name: input.name,
        description: input.description || null,
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
    startDate?: string | null;
    endDate?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
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

  async addWeek(cohortId: string): Promise<{ week: Week }> {
    const { data: latestWeeks, error: weeksError } = await supabase
      .from('Week')
      .select('weekNumber')
      .eq('cohortId', cohortId)
      .order('weekNumber', { ascending: false })
      .limit(1);

    if (weeksError) throw new Error(weeksError.message);

    const nextWeekNumber = (((latestWeeks || [])[0] as any)?.weekNumber as number | undefined || 0) + 1;
    const { data: newWeek, error: weekError } = await supabase
      .from('Week')
      .insert([{ cohortId, weekNumber: nextWeekNumber }])
      .select('*')
      .single();

    if (weekError || !newWeek) throw new Error(weekError?.message || 'Failed to create week');

    const { data: newDays, error: daysError } = await supabase
      .from('Day')
      .insert(DAY_ORDER.map((dayName) => ({
        weekId: (newWeek as any).id,
        dayName,
      })))
      .select('*');

    if (daysError) throw new Error(daysError.message);

    return {
      week: {
        id: (newWeek as any).id,
        cohortId,
        weekNumber: (newWeek as any).weekNumber,
        days: ((newDays || []) as any[]).sort((a, b) => DAY_ORDER.indexOf(a.dayName) - DAY_ORDER.indexOf(b.dayName)).map((day) => ({
          id: day.id,
          weekId: day.weekId,
          dayName: day.dayName,
          activities: [],
        })),
      },
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

    if (latestWeek.weekNumber <= 1) {
      throw new Error('Week 1 cannot be removed.');
    }

    const { error: deleteError } = await supabase
      .from('Week')
      .delete()
      .eq('id', latestWeek.id);

    if (deleteError) throw new Error(deleteError.message);

    return { deletedWeekNumber: latestWeek.weekNumber };
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
    let results = [];
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
  async getAll(): Promise<{ users: User[] }> {
    const { data, error } = await supabase
      .from('User')
      .select('*')
      .order('createdAt', { ascending: false });

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
      throw new Error(error.message);
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
};

// Push Subscriptions API
export const pushSubscriptionsApi = {
  async save(userId: string, subscription: PushSubscriptionJSON): Promise<void> {
    const keys = subscription.keys as { p256dh: string; auth: string } | undefined;
    if (!subscription.endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid push subscription');
    }

    // Delete all previous subscriptions for this user so only one active endpoint
    // exists per user — prevents duplicate notifications from stale PWA installs.
    await supabase.from('PushSubscription').delete().eq('userId', userId);

    const { error } = await supabase
      .from('PushSubscription')
      .insert([{
        userId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }]);

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
    options?: { scope?: 'ACTIVE_COHORT' | 'ALL_USERS'; cohortId?: string | null }
  ): Promise<{ sent: number }> {
    const { data, error } = await supabase.functions.invoke('send-announcement', {
      body: {
        subject,
        body,
        sentBy,
        scope: options?.scope || 'ACTIVE_COHORT',
        cohortId: options?.cohortId || null,
      },
    });
    if (error) throw new Error(error.message);
    return { sent: (data as any)?.sent ?? 0 };
  },

  async getHistory(options?: {
    cohortId?: string | null;
    userId?: string;
    isAdmin?: boolean;
    accessibleCohortIds?: string[];
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
    }));

    const isGlobal = (row: { scope?: string | null; cohortId?: string | null }) =>
      row.scope === 'ALL_USERS' || row.scope == null || row.cohortId == null;

    const announcements = allAnnouncements.filter((row) => {
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
