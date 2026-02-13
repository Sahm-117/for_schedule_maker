import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type {
  User,
  Week,
  Day,
  Activity,
  PendingChange,
  RejectedChange,
  AuthResponse,
  TelegramNotificationEvent
} from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';
import { sendTelegramNotification } from './telegramNotifications';

// Types for API responses are now imported from ../types

// Current user session
let currentSession: Session | null = null;

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

const notifyTelegram = async (payload: TelegramNotificationEvent): Promise<void> => {
  await sendTelegramNotification(payload);
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
          Activity (*)
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
          Activity (*)
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
        })),
      })),
    };

    // Transform pending changes data
    const pendingChanges = normalizePendingChanges((pendingChangesData || []) as unknown[]);

    return { week, pendingChanges };
  },
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
  }): Promise<{ activities: Activity[] }> {
    // If applyToWeeks is specified, create activities for multiple weeks (always include originating week).
    if (activityData.applyToWeeks && activityData.applyToWeeks.length > 0) {
      const activities: Activity[] = [];

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

      const weeksToApply = Array.from(new Set([
        ...activityData.applyToWeeks,
        ...(typeof originalWeekNumber === 'number' ? [originalWeekNumber] : []),
      ]));

      for (const weekNumber of weeksToApply) {
        const { data: weekRow, error: weekError } = await supabase
          .from('Week')
          .select('id')
          .eq('weekNumber', weekNumber)
          .single();

        if (weekError || !weekRow) {
          console.warn('Week not found for weekNumber', weekNumber);
          continue;
        }

        const { data: dayRow, error: dayError } = await supabase
          .from('Day')
          .select('id')
          .eq('weekId', (weekRow as any).id)
          .eq('dayName', (originalDay as any).dayName)
          .single();

        if (dayError || !dayRow) {
          console.warn('Target day not found for weekNumber/dayName', weekNumber, (originalDay as any).dayName);
          continue;
        }

        const { data: maxOrder } = await supabase
          .from('Activity')
          .select('orderIndex')
          .eq('dayId', (dayRow as any).id)
          .order('orderIndex', { ascending: false })
          .limit(1)
          .single();

        const nextOrderIndex = ((maxOrder as any)?.orderIndex || 0) + 1;

        const { data: activity, error: actError } = await supabase
          .from('Activity')
          .insert([{
            dayId: (dayRow as any).id,
            time: activityData.time,
            description: activityData.description,
            period: activityData.period,
            orderIndex: nextOrderIndex,
          }])
          .select()
          .single();

        if (actError || !activity) {
          console.warn('Failed to insert activity for weekNumber', weekNumber, actError?.message);
          continue;
        }

        activities.push(activity as Activity);
      }

      if (activities.length === 0) {
        throw new Error('No activities were created. Check that target weeks/days exist.');
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
        userId: activityData.userId || 'demo_user_id',
      }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const actor = getCurrentUserFromStorage();

    await notifyTelegram({
      event: 'CHANGE_REQUEST_CREATED',
      changeType: 'ADD',
      actorName: actor?.name || 'Support User',
      actorRole: actor?.role || 'SUPPORT',
      requestId: data.id,
      weekId: day.weekId,
      dayName: day.dayName,
      summary: `${activityData.time} - ${activityData.description}`,
      timestamp: data.createdAt,
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

      const weeksToApply = Array.from(new Set(updateData.applyToWeeks))
        .filter((w) => typeof w === 'number')
        .filter((w) => (typeof originalWeekNumber === 'number' ? w !== originalWeekNumber : true));

      for (const weekNumber of weeksToApply) {
        const { data: weekRow, error: weekError } = await supabase
          .from('Week')
          .select('id')
          .eq('weekNumber', weekNumber)
          .single();

        if (weekError || !weekRow) {
          console.warn('Week not found for weekNumber', weekNumber);
          continue;
        }

        const { data: targetDay, error: targetDayError } = await supabase
          .from('Day')
          .select('id')
          .eq('weekId', (weekRow as any).id)
          .eq('dayName', resolvedDayName)
          .single();

        if (targetDayError || !targetDay) {
          console.warn('Target day not found for weekNumber/dayName', weekNumber, resolvedDayName);
          continue;
        }

        const { data: matches, error: matchesError } = await supabase
          .from('Activity')
          .select('id')
          .eq('dayId', (targetDay as any).id)
          .eq('time', matchTime)
          .eq('description', matchDescription);

        if (matchesError || !matches || matches.length === 0) {
          console.warn('No matching activities found to update for weekNumber', weekNumber);
          continue;
        }

        for (const match of matches) {
          const { data: updated, error: matchUpdateError } = await supabase
            .from('Activity')
            .update({
              time: updateData.time,
              description: updateData.description,
            })
            .eq('id', (match as any).id)
            .select()
            .single();

          if (matchUpdateError || !updated) {
            console.warn('Failed to update matching activity for weekNumber', weekNumber, matchUpdateError?.message);
            continue;
          }

          activities.push(updated as Activity);
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
      // Delete activities across multiple weeks
      const { data: activity, error: actError } = await supabase
        .from('Activity')
        .select('time, description')
        .eq('id', activityId)
        .single();

      if (actError || !activity) {
        throw new Error('Activity not found');
      }

      const deletedActivities = [];

      for (const weekNumber of deleteData.applyToWeeks) {
        const { data, error } = await supabase
          .from('Activity')
          .select(`
            *,
            Day!inner (
              Week!inner (weekNumber)
            )
          `)
          .eq('Day.Week.weekNumber', weekNumber)
          .eq('time', activity.time)
          .eq('description', activity.description);

        if (!error && data) {
          for (const act of data) {
            const { error: deleteError } = await supabase
              .from('Activity')
              .delete()
              .eq('id', act.id);

            if (!deleteError) {
              deletedActivities.push(act);
            }
          }
        }
      }

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

      await notifyTelegram({
        event: 'CHANGE_REQUEST_CREATED',
        changeType: changeData.changeType,
        actorName: actor?.name || 'Support User',
        actorRole: actor?.role || 'SUPPORT',
        requestId: (data as any).id,
        weekId: changeData.weekId,
        dayName,
        summary: getChangeSummary(changeData.changeData),
        timestamp: (data as any).createdAt,
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

    await notifyTelegram({
      event: 'CHANGE_APPROVED',
      changeType: change.changeType,
      actorName: 'Admin',
      actorRole: 'ADMIN',
      requestId: changeId,
      weekId: change.weekId,
      dayName,
      summary: getChangeSummary(change.changeData),
      timestamp: new Date().toISOString(),
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

    await notifyTelegram({
      event: 'CHANGE_REJECTED',
      changeType: change.changeType,
      actorName: 'Admin',
      actorRole: 'ADMIN',
      requestId: changeId,
      weekId: change.weekId,
      dayName,
      summary: `${getChangeSummary(change.changeData)} | Reason: ${rejectionReason}`,
      timestamp: rejectedChange.rejectedAt,
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
