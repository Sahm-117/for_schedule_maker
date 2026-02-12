import axios from 'axios';
import type { AuthResponse, User, Week, PendingChange, RejectedChange } from '../types';
import { normalizePendingChanges } from '../utils/pendingChanges';

// Import Supabase API
import {
  authApi as supabaseAuthApi,
  weeksApi as supabaseWeeksApi,
  activitiesApi as supabaseActivitiesApi,
  pendingChangesApi as supabasePendingChangesApi,
  rejectedChangesApi as supabaseRejectedChangesApi,
  usersApi as supabaseUsersApi,
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

  async register(userData: { email: string; name: string; password: string; role?: string }): Promise<{ user: User }> {
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
};

// Weeks API
export const weeksApi = USE_SUPABASE ? supabaseWeeksApi : {
  async getAll(): Promise<{ weeks: Week[] }> {
    const response = await api.get('/weeks');
    return response.data;
  },

  async getById(weekId: number): Promise<{ week: Week; pendingChanges: PendingChange[] }> {
    const response = await api.get(`/weeks/${weekId}`);
    return {
      ...response.data,
      pendingChanges: normalizePendingChanges(response.data.pendingChanges || []),
    };
  },
};

// Activities API
export const activitiesApi = USE_SUPABASE ? supabaseActivitiesApi : {
  async checkDuplicates(time: string, description: string, dayName: string): Promise<{ existingWeeks: number[] }> {
    const response = await api.post('/activities/check-duplicates', { time, description, dayName });
    return response.data;
  },

  // Admin only - creates activities directly
  async create(activityData: {
    dayId: number;
    time: string;
    description: string;
    period: string;
    applyToWeeks?: number[];
  }): Promise<{ activities: any[] }> {
    const response = await api.post('/activities', activityData);
    return response.data;
  },

  // Support users - creates pending change requests
  async request(activityData: {
    dayId: number;
    time: string;
    description: string;
    period: string;
    applyToWeeks?: number[];
  }): Promise<{ message: string; pendingChange: any }> {
    const response = await api.post('/activities/request', activityData);
    return response.data;
  },

  async update(activityId: number, updateData: {
    time: string;
    description: string;
    applyToWeeks?: number[];
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

// Pending Changes API
export const pendingChangesApi = USE_SUPABASE ? supabasePendingChangesApi : {
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

// Users API
export const usersApi = USE_SUPABASE ? supabaseUsersApi : {
  async getAll(): Promise<{ users: User[] }> {
    const response = await api.get('/users');
    return response.data;
  },

  async getById(userId: string): Promise<{ user: User }> {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  async update(userId: string, updateData: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  }): Promise<{ user: User }> {
    const response = await api.put(`/users/${userId}`, updateData);
    return response.data;
  },

  async delete(userId: string): Promise<{ message: string }> {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },
};

export default api;
