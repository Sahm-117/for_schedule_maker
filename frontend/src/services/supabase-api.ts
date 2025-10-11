import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type {
  User,
  Week,
  Day,
  Activity,
  PendingChange,
  RejectedChange,
  AuthResponse
} from '../types';
import { sendNotifications } from './notifications';

// Types for API responses are now imported from ../types

// Current user session
let currentSession: Session | null = null;

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
    // In a real implementation, you'd decode the JWT token to get user ID
    // For now, we'll return mock data
    throw new Error('getMe not implemented yet');
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    // Mock implementation
    throw new Error('Refresh not implemented yet');
  },

  async completeOnboarding(): Promise<{ user: User }> {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      throw new Error('No user logged in');
    }

    const { data, error } = await supabase
      .from('User')
      .update({ onboardingCompleted: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { user: data };
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

    // Get pending changes for this week with User relation
    const { data: pendingChangesData, error: changesError } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User:User!PendingChange_userId_fkey (id, name, email)
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
    const SYSTEM_ID = 'a0000000-0000-4000-8000-000000000002';
    const pendingChanges: PendingChange[] = (pendingChangesData || []).map((change: any) => {
      const uiUser = change.User ?? {};
      const isSystem = (uiUser.id || change.userId) === SYSTEM_ID;

      return {
        id: change.id,
        weekId: change.weekId,
        changeType: change.changeType,
        changeData: change.changeData,
        userId: change.userId,
        user: {
          id: uiUser.id || change.userId,
          name: isSystem ? 'System' : (uiUser.name || '—'),
          email: isSystem ? 'system@fof.com' : (uiUser.email || ''),
        },
        createdAt: change.createdAt,
      };
    });

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
    // If applyToWeeks is specified, create activities for multiple weeks
    if (activityData.applyToWeeks && activityData.applyToWeeks.length > 0) {
      const activities = [];

      for (const weekNumber of activityData.applyToWeeks) {
        // First get the original day's name
        const { data: originalDay } = await supabase
          .from('Day')
          .select('dayName')
          .eq('id', activityData.dayId)
          .single();

        if (!originalDay) continue;

        // Find the same day name in the target week
        const { data: day, error: dayError } = await supabase
          .from('Day')
          .select('id, Week!inner (weekNumber)')
          .eq('Week.weekNumber', weekNumber)
          .eq('dayName', originalDay.dayName)
          .single();

        if (dayError || !day) continue;

        // Get next order index
        const { data: maxOrder } = await supabase
          .from('Activity')
          .select('orderIndex')
          .eq('dayId', day.id)
          .order('orderIndex', { ascending: false })
          .limit(1)
          .single();

        const nextOrderIndex = (maxOrder?.orderIndex || 0) + 1;

        const { data: activity, error: actError } = await supabase
          .from('Activity')
          .insert([{
            dayId: day.id,
            time: activityData.time,
            description: activityData.description,
            period: activityData.period,
            orderIndex: nextOrderIndex,
          }])
          .select()
          .single();

        if (!actError && activity) {
          activities.push(activity);
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
          ...activityData,
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
        userId: activityData.userId || 'a0000000-0000-4000-8000-000000000002',
      }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Send notifications to all admins
    try {
      // Get the user who submitted the change
      const { data: submittedBy } = await supabase
        .from('User')
        .select('name, email')
        .eq('id', activityData.userId || 'a0000000-0000-4000-8000-000000000002')
        .single();

      // Get week info
      const { data: week } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', day.weekId)
        .single();

      // Get all admin users
      const { data: admins } = await supabase
        .from('User')
        .select('name, email, role')
        .or('role.eq.admin,role.eq.ADMIN');

      console.log('📧 Found admins for notification:', admins);

      // Send email to each admin with an email
      const emailPromises = (admins || [])
        .filter(admin => admin.email)
        .map(admin =>
          sendNotifications({
            userName: admin.name || 'Admin',
            userEmail: admin.email,
            type: 'pending',
            changeType: 'ADD',
            activityDescription: activityData.description || 'Activity',
            activityTime: activityData.time,
            weekNumber: week?.weekNumber || 1,
            dayName: day.dayName,
            submittedBy: submittedBy?.name || 'User',
          })
        );

      // Send Telegram notification to group
      const telegramPromise = sendNotifications({
        userName: 'Admins',
        userEmail: 'admin@fof.com', // Dummy email, Telegram will still send
        type: 'pending',
        changeType: 'ADD',
        activityDescription: activityData.description || 'Activity',
        activityTime: activityData.time,
        weekNumber: week?.weekNumber || 1,
        dayName: day.dayName,
        submittedBy: submittedBy?.name || 'User',
      });

      await Promise.all([...emailPromises, telegramPromise]);
      console.log('✅ Admin notifications sent successfully');
    } catch (notifError) {
      console.error('⚠️ Failed to send admin notifications:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      message: 'Change request submitted',
      pendingChange: data
    };
  },

  async update(activityId: number, updateData: {
    time: string;
    description: string;
    applyToWeeks?: number[];
  }): Promise<{ activities: Activity[] }> {
    if (updateData.applyToWeeks && updateData.applyToWeeks.length > 0) {
      // Update activities across multiple weeks
      const activities = [];

      for (const weekNumber of updateData.applyToWeeks) {
        // Find activities with same time/description in this week
        const { data, error } = await supabase
          .from('Activity')
          .select(`
            *,
            Day!inner (
              Week!inner (weekNumber)
            )
          `)
          .eq('Day.Week.weekNumber', weekNumber)
          .eq('time', updateData.time)
          .eq('description', updateData.description);

        if (!error && data) {
          for (const activity of data) {
            const { data: updated, error: updateError } = await supabase
              .from('Activity')
              .update({
                time: updateData.time,
                description: updateData.description,
              })
              .eq('id', activity.id)
              .select()
              .single();

            if (!updateError && updated) {
              activities.push(updated);
            }
          }
        }
      }

      return { activities };
    } else {
      // Update single activity
      const { data, error } = await supabase
        .from('Activity')
        .update({
          time: updateData.time,
          description: updateData.description,
        })
        .eq('id', activityId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return { activities: [data] };
    }
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
        User:User!PendingChange_userId_fkey (id, name, email)
      `)
      .eq('weekId', weekId)
      .order('createdAt', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    // Transform with System mapper
    const SYSTEM_ID = 'a0000000-0000-4000-8000-000000000002';
    const pendingChanges = (data || []).map((change: any) => {
      const uiUser = change.User ?? {};
      const isSystem = (uiUser.id || change.userId) === SYSTEM_ID;

      return {
        ...change,
        user: {
          id: uiUser.id || change.userId,
          name: isSystem ? 'System' : (uiUser.name || '—'),
          email: isSystem ? 'system@fof.com' : (uiUser.email || ''),
        },
      };
    });

    return { pendingChanges };
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
        weekId: changeData.weekId,
        changeType: changeData.changeType,
        changeData: changeData.changeData,
        userId: changeData.userId || 'a0000000-0000-4000-8000-000000000002', // Use provided userId or fallback
      }])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Send notifications to all admins
    try {
      // Get the user who submitted the change
      const { data: submittedBy } = await supabase
        .from('User')
        .select('name, email')
        .eq('id', changeData.userId || 'a0000000-0000-4000-8000-000000000002')
        .single();

      // Get week info
      const { data: week } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', changeData.weekId)
        .single();

      // Get day name
      let dayName = 'Unknown';
      if (changeData.changeData.dayId) {
        const { data: day } = await supabase
          .from('Day')
          .select('dayName')
          .eq('id', changeData.changeData.dayId)
          .single();
        dayName = day?.dayName || 'Unknown';
      } else if (changeData.changeData.dayName) {
        dayName = changeData.changeData.dayName;
      }

      // Get all admin users
      const { data: admins } = await supabase
        .from('User')
        .select('name, email, role')
        .or('role.eq.admin,role.eq.ADMIN');

      console.log('📧 Found admins for notification:', admins);

      // Send email to each admin with an email
      const emailPromises = (admins || [])
        .filter(admin => admin.email)
        .map(admin =>
          sendNotifications({
            userName: admin.name || 'Admin',
            userEmail: admin.email,
            type: 'pending',
            changeType: changeData.changeType as 'ADD' | 'EDIT' | 'DELETE',
            activityDescription: changeData.changeData.description || 'Activity',
            activityTime: changeData.changeData.time,
            weekNumber: week?.weekNumber || 1,
            dayName: dayName,
            submittedBy: submittedBy?.name || 'User',
          })
        );

      // Send Telegram notification to group
      const telegramPromise = sendNotifications({
        userName: 'Admins',
        userEmail: 'admin@fof.com', // Dummy email, Telegram will still send
        type: 'pending',
        changeType: changeData.changeType as 'ADD' | 'EDIT' | 'DELETE',
        activityDescription: changeData.changeData.description || 'Activity',
        activityTime: changeData.changeData.time,
        weekNumber: week?.weekNumber || 1,
        dayName: dayName,
        submittedBy: submittedBy?.name || 'User',
      });

      await Promise.all([...emailPromises, telegramPromise]);
    } catch (notifError) {
      console.error('⚠️ Failed to send admin notifications:', notifError);
      // Don't fail the request if notification fails
    }

    return { pendingChange: data };
  },

  async approve(changeId: string): Promise<{ message: string; results: any[]; approvedBy: string }> {
    // Get the pending change with user info
    const { data: change, error: changeError } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User:User!PendingChange_userId_fkey (id, name, email)
      `)
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

    // Delete the pending change
    await supabase
      .from('PendingChange')
      .delete()
      .eq('id', changeId);

    // Send notifications (email + Telegram)
    try {
      // Get week info for notification
      const { data: week } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', change.weekId)
        .single();

      // Get day name - for ADD it's in changeData, for EDIT/DELETE we need to fetch from activity
      let dayName = 'Unknown';
      if (change.changeType === 'ADD') {
        if (change.changeData.dayId) {
          const { data: day } = await supabase
            .from('Day')
            .select('dayName')
            .eq('id', change.changeData.dayId)
            .single();
          dayName = day?.dayName || 'Unknown';
        } else if (change.changeData.dayName) {
          dayName = change.changeData.dayName;
        }
      } else if (change.changeType === 'EDIT' || change.changeType === 'DELETE') {
        // For EDIT/DELETE, fetch the activity and its day
        const { data: activity } = await supabase
          .from('Activity')
          .select('Day (dayName)')
          .eq('id', change.changeData.activityId)
          .single();

        if (activity && activity.Day) {
          dayName = (activity.Day as any).dayName;
        }
      }

      await sendNotifications({
        userName: change.User?.name || 'User',
        userEmail: change.User?.email || '',
        type: 'approved',
        changeType: change.changeType as 'ADD' | 'EDIT' | 'DELETE',
        activityDescription: change.changeData.description || 'Activity',
        activityTime: change.changeData.time,
        weekNumber: week?.weekNumber || 1,
        dayName: dayName,
        approvedBy: 'Admin',
      });
    } catch (notifError) {
      console.error('⚠️ Failed to send notifications:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      message: 'Change approved and applied',
      results,
      approvedBy: 'Admin'
    };
  },

  async cancel(changeId: string): Promise<{ message: string }> {
    // Simply delete the pending change (allows users to cancel their own requests)
    const { error } = await supabase
      .from('PendingChange')
      .delete()
      .eq('id', changeId);

    if (error) {
      throw new Error(error.message);
    }

    return { message: 'Change request cancelled' };
  },

  async reject(changeId: string, rejectionReason: string): Promise<{ message: string; rejectedChange: RejectedChange }> {
    // Get the pending change with user info
    const { data: change, error: changeError } = await supabase
      .from('PendingChange')
      .select(`
        *,
        User:User!PendingChange_userId_fkey (id, name, email)
      `)
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

    // Send notifications (email + Telegram)
    try {
      // Get week info for notification
      const { data: week } = await supabase
        .from('Week')
        .select('weekNumber')
        .eq('id', change.weekId)
        .single();

      // Get day name - for ADD it's in changeData, for EDIT/DELETE we need to fetch from activity
      let dayName = 'Unknown';
      if (change.changeType === 'ADD') {
        if (change.changeData.dayId) {
          const { data: day } = await supabase
            .from('Day')
            .select('dayName')
            .eq('id', change.changeData.dayId)
            .single();
          dayName = day?.dayName || 'Unknown';
        } else if (change.changeData.dayName) {
          dayName = change.changeData.dayName;
        }
      } else if (change.changeType === 'EDIT' || change.changeType === 'DELETE') {
        // For EDIT/DELETE, fetch the activity and its day
        const { data: activity } = await supabase
          .from('Activity')
          .select('Day (dayName)')
          .eq('id', change.changeData.activityId)
          .single();

        if (activity && activity.Day) {
          dayName = (activity.Day as any).dayName;
        }
      }

      await sendNotifications({
        userName: change.User?.name || 'User',
        userEmail: change.User?.email || '',
        type: 'rejected',
        changeType: change.changeType as 'ADD' | 'EDIT' | 'DELETE',
        activityDescription: change.changeData.description || 'Activity',
        activityTime: change.changeData.time,
        weekNumber: week?.weekNumber || 1,
        dayName: dayName,
        rejectedBy: 'Admin',
        rejectionReason,
      });
    } catch (notifError) {
      console.error('⚠️ Failed to send notifications:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      message: 'Change rejected',
      rejectedChange
    };
  },
};

// Rejected Changes API
export const rejectedChangesApi = {
  async getMine(userId?: string): Promise<{ rejectedChanges: RejectedChange[]; unreadCount: number }> {
    if (!userId) {
      // If no user ID provided, return all rejected changes (for admins)
      // Or return empty for now
      return { rejectedChanges: [], unreadCount: 0 };
    }

    const { data, error } = await supabase
      .from('RejectedChange')
      .select(`
        *,
        User:User!RejectedChange_userId_fkey (id, name, email)
      `)
      .eq('userId', userId)
      .order('rejectedAt', { ascending: false });

    if (error) {
      console.error('Failed to fetch rejected changes:', error);
      return { rejectedChanges: [], unreadCount: 0 };
    }

    // Transform with System mapper
    const SYSTEM_ID = 'a0000000-0000-4000-8000-000000000002';
    const rejectedChanges: RejectedChange[] = (data || []).map((change: any) => {
      const uiUser = change.User ?? {};
      const isSystem = (uiUser.id || change.userId) === SYSTEM_ID;

      return {
        ...change,
        user: {
          id: uiUser.id || change.userId,
          name: isSystem ? 'System' : (uiUser.name || '—'),
          email: isSystem ? 'system@fof.com' : (uiUser.email || ''),
        },
      };
    });

    const unreadCount = rejectedChanges.filter(c => !c.isRead).length;

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
    // For now, return 0 since we're not implementing this functionality yet
    console.log('markAllRead called - returning 0 for now');
    return { message: 'All marked as read', updatedCount: 0 };
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