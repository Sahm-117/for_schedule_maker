import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, clearAuthToken, usersApi } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Label, User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSopPreparer: boolean;
  userLabelIds: string[];
  userLabels: Label[];
  userCohortIds: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const isInactiveAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return message.includes('Account deactivated') || message.includes('User not found');
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLabelIds, setUserLabelIds] = useState<string[]>([]);
  const [userLabels, setUserLabels] = useState<Label[]>([]);
  const [userCohortIds, setUserCohortIds] = useState<string[]>([]);

  const fetchUserLabels = async (userId: string, role: string) => {
    if (role !== 'SUPPORT') {
      setUserLabelIds([]);
      setUserLabels([]);
      return;
    }
    try {
      const response = await usersApi.getUserLabels(userId);
      setUserLabelIds(response.labels.map((l) => l.id));
      setUserLabels(response.labels);
    } catch {
      setUserLabelIds([]);
      setUserLabels([]);
    }
  };

  const fetchUserCohorts = async (userId: string, role: string) => {
    if (role !== 'SUPPORT') {
      setUserCohortIds([]);
      return;
    }
    try {
      const response = await usersApi.getUserCohorts(userId);
      setUserCohortIds(response.cohorts.map((cohort) => cohort.id));
    } catch {
      setUserCohortIds([]);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setAuthToken(response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    await fetchUserLabels(response.user.id, response.user.role);
    await fetchUserCohorts(response.user.id, response.user.role);
  };

  const clearSession = () => {
    clearAuthToken();
    localStorage.removeItem('user');
    setUser(null);
    setUserLabelIds([]);
    setUserLabels([]);
    setUserCohortIds([]);
  };

  const logout = () => {
    clearSession();
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    setAuthToken(token);

    try {
      const response = await authApi.getMe();
      if (response.user.isActive === false) {
        clearSession();
        return;
      }
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      await fetchUserLabels(response.user.id, response.user.role);
      await fetchUserCohorts(response.user.id, response.user.role);
    } catch (error) {
      if (isInactiveAuthError(error)) {
        clearSession();
        return;
      }
      // Network/DB unavailable — restore from cache so PWA stays signed in
      const cached = localStorage.getItem('user');
      if (cached) {
        try {
          const cachedUser = JSON.parse(cached);
          if (cachedUser?.isActive === false) {
            clearSession();
            return;
          }
          setUser(cachedUser);
          await fetchUserLabels(cachedUser.id, cachedUser.role);
          await fetchUserCohorts(cachedUser.id, cachedUser.role);
        } catch {
          clearSession();
        }
      } else {
        clearSession();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const verifyCurrentUser = async () => {
      try {
        const response = await authApi.getMe();
        if (response.user.isActive === false) {
          clearSession();
          return;
        }
        localStorage.setItem('user', JSON.stringify(response.user));
        setUser(response.user);
      } catch (error) {
        if (isInactiveAuthError(error)) {
          clearSession();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verifyCurrentUser();
      }
    };

    window.addEventListener('focus', verifyCurrentUser);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const supabaseClient = supabase as unknown as {
      channel?: typeof supabase.channel;
      removeChannel?: typeof supabase.removeChannel;
    };

    if (!supabaseClient?.channel || !supabaseClient?.removeChannel) {
      return () => {
        window.removeEventListener('focus', verifyCurrentUser);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const channel = supabaseClient
      .channel(`user-status-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'User', filter: `id=eq.${user.id}` },
        (payload) => {
          const nextUser = payload.new as User;
          if (nextUser.isActive === false) {
            clearSession();
            return;
          }
          localStorage.setItem('user', JSON.stringify(nextUser));
          setUser(nextUser);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', verifyCurrentUser);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabaseClient.removeChannel?.(channel);
    };
  }, [user?.id]);

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'ADMIN',
    isSopPreparer: user?.role === 'SOP_PREPARER',
    userLabelIds,
    userLabels,
    userCohortIds,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
