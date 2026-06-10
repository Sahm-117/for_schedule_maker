import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cohortsApi, digestApi, pendingChangesApi, rejectedChangesApi, resourcesApi, settingsApi, weeksApi } from '../services/api';
import type { Cohort, DailyDigestCursor, DailyDigestFunctionResponse, PendingChange, RejectedChange, Week } from '../types';

const LAST_SEEN_KEY = 'fof_resources_last_seen';
const ACTIVE_COHORT_KEY = 'fof_active_cohort_id';

interface AppDataContextType {
  loading: boolean;
  liveRevision: number;
  cohorts: Cohort[];
  activeCohort: Cohort | null;
  setActiveCohort: (cohortId: string) => Promise<void>;
  reloadCohorts: () => Promise<void>;
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
  const { user, isAdmin, isSopPreparer, userCohortIds } = useAuth();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [activeCohort, setActiveCohortState] = useState<Cohort | null>(null);
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
  const [liveRevision, setLiveRevision] = useState(0);

  const refreshTimeoutRef = useRef<number | null>(null);

  const getAccessibleCohorts = useCallback((allCohorts: Cohort[]) => {
    if (isAdmin || isSopPreparer) return allCohorts;
    return allCohorts.filter((cohort) => userCohortIds.includes(cohort.id));
  }, [isAdmin, isSopPreparer, userCohortIds]);

  const applyActiveCohort = useCallback((allCohorts: Cohort[]) => {
    const accessible = getAccessibleCohorts(allCohorts);
    const persisted = localStorage.getItem(ACTIVE_COHORT_KEY);
    const next = (persisted ? accessible.find((cohort) => cohort.id === persisted) : null) || accessible[0] || null;
    setCohorts(accessible);
    setActiveCohortState(next);
    if (next) {
      localStorage.setItem(ACTIVE_COHORT_KEY, next.id);
    } else {
      localStorage.removeItem(ACTIVE_COHORT_KEY);
    }
    return next;
  }, [getAccessibleCohorts]);

  const loadCohorts = useCallback(async () => {
    const response = await cohortsApi.getAll();
    return applyActiveCohort(response.cohorts);
  }, [applyActiveCohort]);

  const loadWeeksForCohort = useCallback(async (cohortId?: string | null) => {
    if (!cohortId) {
      setWeeks([]);
      setSelectedWeek(null);
      return [] as Week[];
    }

    const response = await weeksApi.getAll(cohortId);
    setWeeks(response.weeks);
    setSelectedWeek((prev) => {
      if (response.weeks.length === 0) return null;
      if (prev && prev.cohortId === cohortId) {
        return response.weeks.find((week) => week.id === prev.id) || response.weeks[0];
      }
      const week1 = response.weeks.find((week) => week.weekNumber === 1);
      return week1 || response.weeks[0];
    });
    return response.weeks;
  }, []);

  const loadRejectedChanges = useCallback(async () => {
    const response = await rejectedChangesApi.getMine();
    setRejectedChanges(response.rejectedChanges);
    setUnreadCount(response.unreadCount);
  }, []);

  const loadGlobalPendingChanges = useCallback(async (cohortWeekIds?: number[]) => {
    const response = await pendingChangesApi.getAll();
    if (!cohortWeekIds || cohortWeekIds.length === 0) {
      setGlobalPendingChanges(response.pendingChanges);
      return;
    }
    setGlobalPendingChanges(response.pendingChanges.filter((change) => cohortWeekIds.includes(change.weekId)));
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

  const bumpLiveRevision = useCallback(() => {
    setLiveRevision((prev) => prev + 1);
  }, []);

  const refreshWorkspaceData = useCallback(() => {
    void (async () => {
      try {
        const resolvedCohort = await loadCohorts();
        const loadedWeeks = await loadWeeksForCohort(resolvedCohort?.id ?? activeCohort?.id ?? null);

        if (isAdmin) {
          await Promise.all([
            loadDigestStatus(),
            loadGlobalPendingChanges(loadedWeeks.map((week) => week.id)),
          ]);
        } else if (isSopPreparer) {
          await loadRejectedChanges();
        }

        if (isSopPreparer && selectedWeek) {
          const matchingWeek = loadedWeeks.find((week) => week.id === selectedWeek.id);
          if (matchingWeek) {
            await loadWeekPendingChanges(matchingWeek.id);
          }
        }

        await refreshResourceCount();
        bumpLiveRevision();
      } catch (error) {
        console.error('Failed to refresh workspace data:', error);
      }
    })();
  }, [
    activeCohort?.id,
    bumpLiveRevision,
    isAdmin,
    isSopPreparer,
    loadCohorts,
    loadDigestStatus,
    loadGlobalPendingChanges,
    loadRejectedChanges,
    loadWeekPendingChanges,
    loadWeeksForCohort,
    refreshResourceCount,
    selectedWeek,
  ]);

  const scheduleWorkspaceRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshWorkspaceData();
    }, 300);
  }, [refreshWorkspaceData]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setLoading(true);
      try {
        const resolvedCohort = await loadCohorts();
        const loadedWeeks = await loadWeeksForCohort(resolvedCohort?.id);

        if (isAdmin) {
          await Promise.all([loadDigestStatus(), loadGlobalPendingChanges(loadedWeeks.map((week) => week.id))]);
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
  }, [isAdmin, isSopPreparer, loadCohorts, loadDigestStatus, loadGlobalPendingChanges, loadRejectedChanges, loadWeeksForCohort, refreshResourceCount, user]);

  useEffect(() => {
    if (!isSopPreparer || !selectedWeek) return;

    loadWeekPendingChanges(selectedWeek.id).catch((error) => {
      console.error('Failed to load week pending changes:', error);
    });
  }, [isSopPreparer, loadWeekPendingChanges, selectedWeek]);

  useEffect(() => {
    if (!user || !(supabase as any)) return;

    const channel = (supabase as any)
      .channel(`app-sync-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'PendingChange' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Activity' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Week' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Resource' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Announcement' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Cohort' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'UserCohort' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'UserLabel' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'SupportActivityCompletion' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'AppSetting' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'FollowUpContact' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'FollowUpIssue' }, scheduleWorkspaceRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'MessageTemplate' }, scheduleWorkspaceRefresh)
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
  }, [scheduleWorkspaceRefresh, user]);

  useEffect(() => {
    if (!user || realtimeHealthy) return;
    const intervalId = window.setInterval(() => {
      refreshWorkspaceData();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [realtimeHealthy, refreshWorkspaceData, user]);

  const handleWeekSelect = useCallback(async (weekId: number) => {
    try {
      const response = await weeksApi.getById(weekId, activeCohort?.id);
      setSelectedWeek(response.week);

      if (isSopPreparer) {
        await loadWeekPendingChanges(response.week.id);
      }
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  }, [activeCohort?.id, isSopPreparer, loadWeekPendingChanges]);

  const setActiveCohort = useCallback(async (cohortId: string) => {
    const next = cohorts.find((cohort) => cohort.id === cohortId) || null;
    setActiveCohortState(next);
    if (next) {
      localStorage.setItem(ACTIVE_COHORT_KEY, next.id);
      const loadedWeeks = await loadWeeksForCohort(next.id);
      if (isAdmin) {
        await loadGlobalPendingChanges(loadedWeeks.map((week) => week.id));
      }
    } else {
      localStorage.removeItem(ACTIVE_COHORT_KEY);
      setWeeks([]);
      setSelectedWeek(null);
      setGlobalPendingChanges([]);
    }
  }, [cohorts, isAdmin, loadGlobalPendingChanges, loadWeeksForCohort]);

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
      await loadGlobalPendingChanges(weeks.map((week) => week.id));
      return;
    }

    if (selectedWeek) {
      await loadWeekPendingChanges(selectedWeek.id);
    }
  }, [isAdmin, loadGlobalPendingChanges, loadWeekPendingChanges, selectedWeek, weeks]);

  const handlePendingApprove = useCallback((changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const handlePendingReject = useCallback((changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const markResourcesViewed = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setNewResourceCount(0);
  }, []);

  const reloadWeeks = useCallback(async () => {
    await loadWeeksForCohort(activeCohort?.id);
  }, [activeCohort?.id, loadWeeksForCohort]);

  const value = useMemo<AppDataContextType>(() => ({
    loading,
    liveRevision,
    cohorts,
    activeCohort,
    setActiveCohort,
    reloadCohorts: loadCohorts,
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
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
    activeCohort,
    cohorts,
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
    liveRevision,
    loadRejectedChanges,
    loading,
    markResourcesViewed,
    newResourceCount,
    pendingChangesForSelectedWeek,
    realtimeHealthy,
    refreshPendingChanges,
    refreshResourceCount,
    rejectedChanges,
    reloadWeeks,
    loadCohorts,
    selectedWeek,
    setActiveCohort,
    unreadCount,
    weeks,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
