import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type {
  User,
  Week,
  Day,
  Activity,
  Label,
  PendingChange,
  RejectedChange,
  AuthResponse,
  TelegramNotificationEvent
} from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';
import { sendTelegramNotificationBestEffort } from './telegramNotifications';

// Types for API responses are now imported from ../types

// Current user session
let currentSession: Session | null = null;
const weekNumberCache = new Map<number, number>();

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

// Initialize session from Supabase
export const initializeAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;
  return session;
};

// Auth API using Supabase Auth
export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    // Simple auth for now - in production you'd verify against hashed passwords
    const { data: users, error } = await supabase
      .from('User')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !users) {
      throw new Error('Invalid credentials');
    }

    // For demo purposes, accept any password (you'd verify hash in production)
    return {
      user: users,
      accessToken: `mock_token_${users.id}`,
      refreshToken: `refresh_token_${users.id}`,
    };
  },

  async register(userData: {
    email: string;
    name: string;
    password: string;
    role?: 'ADMIN' | 'SUPPORT'
  }): Promise<{ user: User }> {
    const { data, error } = await supabase
      .from('User')
      .insert([{
        email: userData.email,
        name: userData.name,
        password_hash: `hashed_${userData.password}`, // Simple hash for demo
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
  async getAll(): Promise<{ weeks: Week[] }> {
    const { data, error } = await supabase
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

    if (error) {
      throw new Error(error.message);
    }

    // Transform Supabase data to match app types
    const weeks: Week[] = (data || []).map((week: any) => {
      // Define day order (FOF weeks start on Sunday)
      const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Sort days according to FOF week order
      const sortedDays = (week.Day || []).sort((a: any, b: any) => {
        return dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName);
      });

      return {
        id: week.id,
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
    });

    return { weeks };
  },

  async getById(weekId: number): Promise<{ week: Week; pendingChanges: PendingChange[] }> {
    // Get week with days and activities
    const { data: weekData, error: weekError } = await supabase
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
      .eq('id', weekId)
      .single();

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

    // Transform week data
    const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sortedDays = (weekData.Day || []).sort((a: any, b: any) => {
      return dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName);
    });

    const week: Week = {
      id: weekData.id,
      weekNumber: weekData.weekNumber,
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

    // Transform pending changes data
    const pendingChanges = normalizePendingChanges((pendingChangesData || []) as unknown[]);

    return { week, pendingChanges };
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

    const { data, error } = await supabase
      .from('PendingChange')
      .insert([{
        weekId: day.weekId,
        changeType: 'ADD',
        changeData: activityData,
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

    // Always update the requested activity id first.
    const { data: updatedOriginal, error: updateError } = await supabase
      .from('Activity')
      .update({
        time: updateData.time,
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
            .update({ time: updateData.time, description: updateData.description })
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

  async update(userId: string, updateData: {
    name?: string;
    email?: string;
    password?: string;
    role?: 'ADMIN' | 'SUPPORT';
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

// Auth token management (mock for now)
export const setAuthToken = (token: string) => {
  localStorage.setItem('accessToken', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};
