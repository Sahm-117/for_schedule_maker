import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { digestApi, pendingChangesApi, rejectedChangesApi, resourcesApi, settingsApi, weeksApi } from '../services/api';
import type { DailyDigestCursor, DailyDigestFunctionResponse, PendingChange, RejectedChange, Week } from '../types';

const LAST_SEEN_KEY = 'fof_resources_last_seen';

interface AppDataContextType {
  loading: boolean;
  weeks: Week[];
  selectedWeek: Week | null;
  handleWeekSelect: (weekId: number) => Promise<void>;
  reloadWeeks: () => Promise<void>;
  rejectedChanges: RejectedChange[];
  unreadCount: number;
  refreshRejectedChanges: () => Promise<void>;
  globalPendingChanges: PendingChange[];
  pendingChangesForSelectedWeek: PendingChange[];
  refreshPendingChanges: () => Promise<void>;
  handlePendingApprove: (changeIds?: string[]) => void;
  handlePendingReject: (changeIds?: string[]) => void;
  realtimeHealthy: boolean;
  digestSending: boolean;
  digestEnabled: boolean;
  digestToggleLoading: boolean;
  digestStatus: string;
  digestCursor: DailyDigestCursor | null;
  digestActionLabel: 'Send Digest Now' | 'Restart Digest';
  handleToggleDigest: () => Promise<void>;
  handleSendDigestNow: () => Promise<void>;
  newResourceCount: number;
  refreshResourceCount: () => Promise<void>;
  markResourcesViewed: () => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
};

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isSopPreparer } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalPendingChanges, setGlobalPendingChanges] = useState<PendingChange[]>([]);
  const [weekPendingChanges, setWeekPendingChanges] = useState<PendingChange[]>([]);
  const [newResourceCount, setNewResourceCount] = useState(0);
  const [digestSending, setDigestSending] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestToggleLoading, setDigestToggleLoading] = useState(false);
  const [digestStatus, setDigestStatus] = useState('');
  const [digestCursor, setDigestCursor] = useState<DailyDigestCursor | null>(null);
  const [digestActionLabel, setDigestActionLabel] = useState<'Send Digest Now' | 'Restart Digest'>('Send Digest Now');
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);

  const refreshTimeoutRef = useRef<number | null>(null);

  const loadWeeks = useCallback(async () => {
    const response = await weeksApi.getAll();
    setWeeks(response.weeks);
    setSelectedWeek((prev) => {
      if (response.weeks.length === 0) return null;
      if (prev) {
        return response.weeks.find((week) => week.id === prev.id) || response.weeks[0];
      }
      const week1 = response.weeks.find((week) => week.weekNumber === 1);
      return week1 || response.weeks[0];
    });
  }, []);

  const loadRejectedChanges = useCallback(async () => {
    const response = await rejectedChangesApi.getMine();
    setRejectedChanges(response.rejectedChanges);
    setUnreadCount(response.unreadCount);
  }, []);

  const loadGlobalPendingChanges = useCallback(async () => {
    const response = await pendingChangesApi.getAll();
    setGlobalPendingChanges(response.pendingChanges);
  }, []);

  const loadWeekPendingChanges = useCallback(async (weekId: number) => {
    const response = await pendingChangesApi.getByWeek(weekId);
    setWeekPendingChanges(response.pendingChanges);
  }, []);

  const applyDigestResponseState = useCallback((response: DailyDigestFunctionResponse) => {
    if (typeof response.enabled === 'boolean') {
      setDigestEnabled(response.enabled);
    }
    if (response.cursor && typeof response.cursor.weekNumber === 'number' && typeof response.cursor.dayName === 'string') {
      setDigestCursor(response.cursor);
    }
    if (response.nextActionLabel === 'Send Digest Now' || response.nextActionLabel === 'Restart Digest') {
      setDigestActionLabel(response.nextActionLabel);
    }
  }, []);

  const loadDigestStatus = useCallback(async () => {
    const response = await digestApi.getDigestStatus();
    applyDigestResponseState(response);
  }, [applyDigestResponseState]);

  const refreshResourceCount = useCallback(async () => {
    const since = localStorage.getItem(LAST_SEEN_KEY) ?? undefined;
    const count = await resourcesApi.getNewCount(since);
    setNewResourceCount(count);
  }, []);

  const refreshAdminData = useCallback(() => {
    void Promise.all([loadWeeks(), loadGlobalPendingChanges()]);
  }, [loadGlobalPendingChanges, loadWeeks]);

  const scheduleAdminRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshAdminData();
    }, 300);
  }, [refreshAdminData]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setLoading(true);
      try {
        await loadWeeks();

        if (isAdmin) {
          await Promise.all([loadDigestStatus(), loadGlobalPendingChanges()]);
        } else if (isSopPreparer) {
          await loadRejectedChanges();
        }

        await refreshResourceCount();
      } catch (error) {
        console.error('Failed to initialize app data:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (user) {
      initialize();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isSopPreparer, loadDigestStatus, loadGlobalPendingChanges, loadRejectedChanges, loadWeeks, refreshResourceCount, user]);

  useEffect(() => {
    if (!isSopPreparer || !selectedWeek) return;

    loadWeekPendingChanges(selectedWeek.id).catch((error) => {
      console.error('Failed to load week pending changes:', error);
    });
  }, [isSopPreparer, loadWeekPendingChanges, selectedWeek]);

  useEffect(() => {
    if (!isAdmin || !(supabase as any)) return;

    const channel = (supabase as any)
      .channel(`dashboard-sync-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'PendingChange' }, () => {
        scheduleAdminRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Activity' }, () => {
        scheduleAdminRefresh();
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeHealthy(true);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeHealthy(false);
        }
      });

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      setRealtimeHealthy(false);
      (supabase as any).removeChannel(channel);
    };
  }, [isAdmin, scheduleAdminRefresh]);

  useEffect(() => {
    if (!isAdmin || realtimeHealthy) return;

    const intervalId = window.setInterval(() => {
      refreshAdminData();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdmin, realtimeHealthy, refreshAdminData]);

  const handleWeekSelect = useCallback(async (weekId: number) => {
    try {
      const response = await weeksApi.getById(weekId);
      setSelectedWeek(response.week);

      if (isSopPreparer) {
        await loadWeekPendingChanges(response.week.id);
      }
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  }, [isSopPreparer, loadWeekPendingChanges]);

  const handleToggleDigest = useCallback(async () => {
    const nextValue = !digestEnabled;
    setDigestToggleLoading(true);
    setDigestStatus('');

    try {
      const response = await settingsApi.setDailyDigestEnabled(nextValue);
      setDigestEnabled(response.enabled);
      setDigestStatus(response.enabled ? 'Daily digest enabled.' : 'Daily digest disabled.');
      await loadDigestStatus();
    } catch (error) {
      setDigestStatus(`Digest toggle failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDigestToggleLoading(false);
    }
  }, [digestEnabled, loadDigestStatus]);

  const handleSendDigestNow = useCallback(async () => {
    if (!digestEnabled && digestActionLabel !== 'Restart Digest') {
      setDigestStatus('Daily digest is currently OFF. Turn it on first.');
      return;
    }

    setDigestSending(true);
    setDigestStatus('');

    try {
      if (digestActionLabel === 'Restart Digest') {
        const body = await digestApi.restartDigest();
        applyDigestResponseState(body);
        const restartedAt = body.cursor ? `Week ${body.cursor.weekNumber} • ${body.cursor.dayName}` : 'Week 1 • Sunday';
        setDigestStatus(`Digest restarted at ${restartedAt}.`);
      } else {
        const body = await digestApi.sendDigestNow();
        applyDigestResponseState(body);
        if (body.status === 'COMPLETED') {
          setDigestStatus('Digest already completed. Use Restart Digest.');
        } else {
          const currentCursor = body.current || body.cursor;
          const sentLabel = currentCursor
            ? `Week ${currentCursor.weekNumber} • ${currentCursor.dayName}`
            : (body.dayName ? `${body.dayName}` : 'current day');
          setDigestStatus(`Digest sent to Telegram (${sentLabel}).`);
        }
      }
    } catch (error) {
      const maybePayload = (error as { payload?: DailyDigestFunctionResponse } | undefined)?.payload;
      const dispatchDetail = (maybePayload?.details as { failed?: Array<{ error?: string }> } | undefined)?.failed?.[0]?.error;
      const errText = dispatchDetail
        ? `${error instanceof Error ? error.message : 'Unknown error'} - ${dispatchDetail}`
        : (error instanceof Error ? error.message : 'Unknown error');
      setDigestStatus(`Digest failed: ${errText}`);
    } finally {
      setDigestSending(false);
      try {
        await loadDigestStatus();
      } catch (error) {
        console.warn('Failed to refresh digest status:', error);
      }
    }
  }, [applyDigestResponseState, digestActionLabel, digestEnabled, loadDigestStatus]);

  const pendingChangesForSelectedWeek = useMemo(() => {
    if (!selectedWeek) return [];
    if (isAdmin) {
      return globalPendingChanges.filter((change) => change.weekId === selectedWeek.id);
    }
    return weekPendingChanges;
  }, [globalPendingChanges, isAdmin, selectedWeek, weekPendingChanges]);

  const refreshPendingChanges = useCallback(async () => {
    if (isAdmin) {
      await loadGlobalPendingChanges();
      return;
    }

    if (selectedWeek) {
      await loadWeekPendingChanges(selectedWeek.id);
    }
  }, [isAdmin, loadGlobalPendingChanges, loadWeekPendingChanges, selectedWeek]);

  const handlePendingApprove = useCallback((changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshAdminData();
  }, [refreshAdminData]);

  const handlePendingReject = useCallback((changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshAdminData();
  }, [refreshAdminData]);

  const markResourcesViewed = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setNewResourceCount(0);
  }, []);

  const value = useMemo<AppDataContextType>(() => ({
    loading,
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks: loadWeeks,
    rejectedChanges,
    unreadCount,
    refreshRejectedChanges: loadRejectedChanges,
    globalPendingChanges,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    handlePendingApprove,
    handlePendingReject,
    realtimeHealthy,
    digestSending,
    digestEnabled,
    digestToggleLoading,
    digestStatus,
    digestCursor,
    digestActionLabel,
    handleToggleDigest,
    handleSendDigestNow,
    newResourceCount,
    refreshResourceCount,
    markResourcesViewed,
  }), [
    digestActionLabel,
    digestCursor,
    digestEnabled,
    digestSending,
    digestStatus,
    digestToggleLoading,
    globalPendingChanges,
    handlePendingApprove,
    handlePendingReject,
    handleSendDigestNow,
    handleToggleDigest,
    handleWeekSelect,
    loadRejectedChanges,
    loadWeeks,
    loading,
    markResourcesViewed,
    newResourceCount,
    pendingChangesForSelectedWeek,
    realtimeHealthy,
    refreshPendingChanges,
    refreshResourceCount,
    rejectedChanges,
    selectedWeek,
    unreadCount,
    weeks,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
