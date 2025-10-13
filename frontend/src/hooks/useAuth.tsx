import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, clearAuthToken } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  completeOnboarding: () => Promise<void>;
  replayOnboarding: () => Promise<void>;
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

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password);
      setAuthToken(response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('userId', response.user.id);
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    clearAuthToken();
    localStorage.removeItem('userId');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  const completeOnboarding = async () => {
    try {
      const response = await authApi.completeOnboarding();
      setUser(response.user);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      throw error;
    }
  };

  const replayOnboarding = async () => {
    try {
      const response = await authApi.replayOnboarding();
      setUser(response.user);
    } catch (error) {
      console.error('Failed to replay onboarding:', error);
      throw error;
    }
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
      setUser(response.user);
    } catch (error) {
      console.error('Auth check failed:', error);
      clearAuthToken();
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      setUser(null);
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
    completeOnboarding,
    replayOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};