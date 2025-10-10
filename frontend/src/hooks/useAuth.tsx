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
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    clearAuthToken();
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

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    console.log('Checking auth with token:', token ? 'exists' : 'none');

    if (!token) {
      console.log('No token found, user not authenticated');
      setLoading(false);
      return;
    }

    try {
      setAuthToken(token);
      console.log('Calling authApi.getMe()...');
      const response = await authApi.getMe();
      console.log('Auth response:', response);
      setUser(response.user);
      console.log('User set successfully:', response.user);
    } catch (error) {
      console.error('Auth check failed:', error);
      console.error('Error details:', error.response?.data || error.message);
      clearAuthToken();
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};