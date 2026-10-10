import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi, setAuthToken, clearAuthToken, usersApi, getSessionToken, SESSION_TOKEN_KEY } from '../services/api';
import { permissionsApi } from '../services/supabase-api';
import { applyTheme } from '../utils/theme';
import { ADMIN_PERMISSIONS, NO_MODULES, type MyPermissions } from '../utils/permissions';
import { setLoginPassword } from '../utils/loginPassword';
import type { Label, User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: (patch?: Partial<User>) => void;
  /** Act as another of the roles this login holds, then reload so nothing from the old view lingers. */
  switchRole: (role: 'ADMIN' | 'SUPPORT' | 'STAFF') => Promise<void>;
  isAdmin: boolean;
  /** A real admin (not a Team member, who acts as an admin but only sees what their roles allow). */
  isRealAdmin: boolean;
  /** What this person may see and do. Null until it has loaded (or for participants). */
  permissions: MyPermissions | null;
  permissionsStatus: 'idle' | 'loading' | 'ready' | 'error';
  reloadPermissions: () => Promise<void>;
  userLabelIds: string[];
  userLabels: Label[];
  userCohortIds: string[];
  refreshUserCohorts: () => Promise<void>;
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

const PERMISSIONS_CACHE_KEY = 'fofPermissions';

const readCachedPermissions = (userId: string): MyPermissions | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(PERMISSIONS_CACHE_KEY) || 'null');
    return saved?.userId === userId ? (saved.permissions as MyPermissions) : null;
  } catch {
    return null;
  }
};

const isInactiveAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return message.includes('Account deactivated') || message.includes('User not found');
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, _setUser] = useState<User | null>(null);
  const setUser = (u: User | null) => { _setUser(u); if (u) applyTheme(u.themeColor); };
  const [loading, setLoading] = useState(true);
  const [userLabelIds, setUserLabelIds] = useState<string[]>([]);
  const [userLabels, setUserLabels] = useState<Label[]>([]);
  const [userCohortIds, setUserCohortIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<MyPermissions | null>(null);
  const [permissionsStatus, setPermissionsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // Bumped on logout, so a permissions answer that arrives after it is ignored.
  const sessionEpoch = useRef(0);

  // Real admins have everything and supports keep their own screens, so neither needs a lookup. A Team member asks the database,
  // and keeps the last answer if a later check fails, so a bad signal never locks someone out of their own menu.
  const loadPermissions = useCallback(async (u: User) => {
    if (u.role === 'PARTICIPANT') {
      setPermissions(null);
      setPermissionsStatus('idle');
      return;
    }
    if (u.role === 'ADMIN' && !u.teamMember) {
      setPermissions(ADMIN_PERMISSIONS);
      setPermissionsStatus('ready');
      return;
    }
    // A support keeps exactly the support screens, so there is nothing to look up. (Extra modules reach a
    // support only through Team member access, in the Team member view.)
    if (u.role === 'SUPPORT') {
      setPermissions(NO_MODULES);
      setPermissionsStatus('ready');
      return;
    }
    const epoch = sessionEpoch.current;
    try {
      const next = await permissionsApi.getMine();
      if (epoch !== sessionEpoch.current) return;
      try { localStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify({ userId: u.id, permissions: next })); } catch { /* ignore */ }
      // Same answer -> same object, so the focus re-check doesn't ripple through every page.
      setPermissions((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setPermissionsStatus('ready');
    } catch {
      if (epoch !== sessionEpoch.current) return;
      const cached = readCachedPermissions(u.id);
      setPermissions((prev) => prev ?? cached);
      setPermissionsStatus((prev) => (prev === 'ready' || cached ? 'ready' : 'error'));
    }
  }, []);

  const reloadPermissions = useCallback(async () => {
    if (user) await loadPermissions(user);
  }, [loadPermissions, user]);

  const fetchUserLabels = useCallback(async (userId: string, role: string) => {
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
  }, []);

  const fetchUserCohorts = useCallback(async (userId: string, role: string) => {
    if (role !== 'SUPPORT') {
      setUserCohortIds([]);
      return;
    }
    try {
      const response = await usersApi.getUserCohorts(userId);
      const next = response.cohorts.map((cohort) => cohort.id).sort();
      // Same list → same array, so the 20-second re-check doesn't ripple through every consumer.
      setUserCohortIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
    } catch {
      // Keep what we had: a failed re-check must not empty someone's cohort list.
    }
  }, []);

  const refreshUserCohorts = useCallback(async () => {
    if (!user) return;
    await fetchUserCohorts(user.id, user.role);
  }, [fetchUserCohorts, user]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setLoginPassword(response.user.mustChangePassword ? password : null);
    setAuthToken(response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    if (response.sessionToken) localStorage.setItem(SESSION_TOKEN_KEY, response.sessionToken);
    localStorage.removeItem('fofPracticeStash');
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    await Promise.all([fetchUserLabels(response.user.id, response.user.role), fetchUserCohorts(response.user.id, response.user.role), loadPermissions(response.user)]);
  };

  const clearSession = useCallback(() => {
    setLoginPassword(null);
    const sessionToken = getSessionToken();
    if (sessionToken) void authApi.signOut(sessionToken).catch(() => undefined);
    clearAuthToken();
    localStorage.removeItem('fofPracticeStash');
    localStorage.removeItem('user');
    setUser(null);
    setUserLabelIds([]);
    setUserLabels([]);
    setUserCohortIds([]);
    sessionEpoch.current += 1;
    setPermissions(null);
    setPermissionsStatus('idle');
    try { localStorage.removeItem(PERMISSIONS_CACHE_KEY); } catch { /* ignore */ }
    applyTheme(null); // reset to default orange on logout
  }, []);

  const logout = () => {
    clearSession();
  };

  // Patch the current user in-place (e.g. after an avatar or theme change) so the
  // updated value propagates everywhere the global user is read, and persist it to
  // the cached session. Re-applies the theme in case themeColor changed.
  const refreshUser = useCallback((patch?: Partial<User>) => {
    _setUser((prev) => {
      if (!prev) return prev;
      const next = patch ? { ...prev, ...patch } : prev;
      try { localStorage.setItem('user', JSON.stringify(next)); } catch { /* ignore */ }
      applyTheme(next.themeColor);
      return next;
    });
  }, []);

  const switchRole = useCallback(async (role: 'ADMIN' | 'SUPPORT' | 'STAFF') => {
    const next = await authApi.switchRole(role);
    try { localStorage.setItem('user', JSON.stringify({ ...next, roles: next.roles })); } catch { /* ignore */ }
    // A clean start in the new view: cohorts, labels, caches and open pages all reload.
    window.location.assign('/');
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    // Signed in before database sessions existed: sign in once more to get one.
    if (!getSessionToken()) {
      clearSession();
      setLoading(false);
      return;
    }

    setAuthToken(token);

    // A returning participant: show their screen straight away from what was saved last time,
    // and confirm in the background (an invalid or switched-off account is signed out a moment
    // later). Staff still wait, because their team and cohort filters must be right first.
    // Skipped when the saved account still has to choose a password.
    try {
      const saved = JSON.parse(localStorage.getItem('user') || 'null');
      if (saved?.role === 'PARTICIPANT' && saved.isActive !== false && !saved.mustChangePassword) {
        setUser(saved);
        setLoading(false);
        authApi.getMe().then((response) => {
          if (response.user.isActive === false) {
            clearSession();
            return;
          }
          localStorage.setItem('user', JSON.stringify(response.user));
          _setUser((prev) => (prev && JSON.stringify(prev) === JSON.stringify(response.user) ? prev : response.user));
        }).catch((error) => {
          if (isInactiveAuthError(error)) clearSession();
        });
        return;
      }
    } catch {
      // Unreadable saved data: fall through to the normal check.
    }

    try {
      // The team and cohort lookups only need the saved user's id and role, so start them
      // alongside the "who am I" check instead of after it (one round trip less on a slow phone).
      let early: Promise<unknown> = Promise.resolve();
      let earlyFor: { id: string; role: string } | null = null;
      try {
        const saved = JSON.parse(localStorage.getItem('user') || 'null');
        if (saved?.id && saved.role && saved.role !== 'PARTICIPANT') {
          earlyFor = { id: saved.id, role: saved.role };
          early = Promise.all([fetchUserLabels(saved.id, saved.role), fetchUserCohorts(saved.id, saved.role)]);
        }
      } catch { /* no usable saved user: fall through */ }
      const response = await authApi.getMe();
      if (response.user.isActive === false) {
        clearSession();
        return;
      }
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      if (earlyFor && earlyFor.id === response.user.id && earlyFor.role === response.user.role) {
        await Promise.all([early, loadPermissions(response.user)]);
      } else {
        await Promise.all([fetchUserLabels(response.user.id, response.user.role), fetchUserCohorts(response.user.id, response.user.role), loadPermissions(response.user)]);
      }
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
          await Promise.all([fetchUserLabels(cachedUser.id, cachedUser.role), fetchUserCohorts(cachedUser.id, cachedUser.role), loadPermissions(cachedUser)]);
        } catch {
          clearSession();
        }
      } else {
        clearSession();
      }
    } finally {
      setLoading(false);
    }
  }, [clearSession, fetchUserCohorts, fetchUserLabels, loadPermissions]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!user?.id) return;

    // Returning to the tab fires both `focus` and `visibilitychange`; one check is enough.
    let lastVerifyAt = 0;
    const verifyCurrentUser = async () => {
      if (Date.now() - lastVerifyAt < 5000) return;
      lastVerifyAt = Date.now();
      try {
        const response = await authApi.getMe();
        if (response.user.isActive === false) {
          clearSession();
          return;
        }
        localStorage.setItem('user', JSON.stringify(response.user));
        // Only update state when the user actually changed. An unconditional
        // setUser hands back a brand-new object on every focus/visibility event,
        // which re-runs AppDataContext's init effect and remounts every page
        // ("the page reloads when I come back to it"). Reuse the old reference
        // when nothing changed so the identity stays stable.
        _setUser((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(response.user)) return prev;
          applyTheme(response.user.themeColor);
          return response.user;
        });
        // An admin may have changed this person's roles since they last looked.
        void loadPermissions(response.user);
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

    // No Realtime listener on the User row: the publication does not carry it, so it never
    // fired. A deactivated account is caught by this check instead, on focus and on return.
    return () => {
      window.removeEventListener('focus', verifyCurrentUser);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearSession, loadPermissions, user?.id]);

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    refreshUser,
    switchRole,
    isAdmin: user?.role === 'ADMIN',
    isRealAdmin: user?.role === 'ADMIN' && !user.teamMember,
    permissions,
    permissionsStatus,
    reloadPermissions,
    userLabelIds,
    userLabels,
    userCohortIds,
    refreshUserCohorts,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
