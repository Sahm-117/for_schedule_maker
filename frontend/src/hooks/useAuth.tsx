import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, clearAuthToken, usersApi } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSopPreparer: boolean;
  userLabelIds: string[];
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLabelIds, setUserLabelIds] = useState<string[]>([]);

  const fetchUserLabels = async (userId: string, role: string) => {
    if (role !== 'SUPPORT') {
      setUserLabelIds([]);
      return;
    }
    try {
      const response = await usersApi.getUserLabels(userId);
      setUserLabelIds(response.labels.map((l) => l.id));
    } catch {
      setUserLabelIds([]);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setAuthToken(response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    await fetchUserLabels(response.user.id, response.user.role);
  };

  const logout = () => {
    clearAuthToken();
    localStorage.removeItem('user');
    setUser(null);
    setUserLabelIds([]);
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setAuthToken(token);
      const response = await authApi.getMe();
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      await fetchUserLabels(response.user.id, response.user.role);
    } catch (error) {
      console.error('Auth check failed:', error);
      clearAuthToken();
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'ADMIN',
    isSopPreparer: user?.role === 'SOP_PREPARER',
    userLabelIds,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
