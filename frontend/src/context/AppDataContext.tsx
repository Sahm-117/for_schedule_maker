import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePolling } from '../hooks/usePolling';
import { cohortsApi, hubApi, myHubApi, notificationsApi, pendingChangesApi, rejectedChangesApi, resourcesApi, settingsApi, usersApi, weeksApi } from '../services/api';
import { cohortsApi as supabaseCohortsApi } from '../services/supabase-api';
import type { Cohort, MyHubPayload, Notification, PendingChange, RejectedChange, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';

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
  notifications: Notification[];
  notificationUnreadCount: number;
  refreshNotifications: () => Promise<void>;
  /** Title of a notification that just arrived live; drives the "Refresh" prompt. */
  liveNotificationTitle: string | null;
  dismissLiveNotification: () => void;
  markNotificationsRead: () => Promise<void>;
  globalPendingChanges: PendingChange[];
  pendingChangesForSelectedWeek: PendingChange[];
  refreshPendingChanges: () => Promise<void>;
  handlePendingApprove: (changeIds?: string[]) => void;
  handlePendingReject: (changeIds?: string[]) => void;
  newResourceCount: number;
  refreshResourceCount: () => Promise<void>;
  markResourcesViewed: () => void;
  hasNewHubActivity: boolean;
  refreshHubActivity: () => Promise<void>;
  markHubSeen: () => void;
  myHub: MyHubPayload | null;
  refreshMyHub: () => Promise<void>;
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
  const { user, isAdmin, userCohortIds, refreshUser, refreshUserCohorts } = useAuth();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [activeCohort, setActiveCohortState] = useState<Cohort | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [liveNotificationTitle, setLiveNotificationTitle] = useState<string | null>(null);
  const dismissLiveNotification = useCallback(() => setLiveNotificationTitle(null), []);
  const [globalPendingChanges, setGlobalPendingChanges] = useState<PendingChange[]>([]);
  const [weekPendingChanges, setWeekPendingChanges] = useState<PendingChange[]>([]);
  const [newResourceCount, setNewResourceCount] = useState(0);
  const [latestHubActivityAt, setLatestHubActivityAt] = useState<string | null>(null);
  const [myHub, setMyHub] = useState<MyHubPayload | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);

  const refreshInProgressRef = useRef(false);
  // Mirror the latest cohort/week into refs so refreshWorkspaceData can read them
  // without listing them as deps. That keeps the callback (and the realtime
  // channel effect that depends on it) stable, so the channel subscribes ONCE
  // per session instead of tearing down + re-subscribing 20 listeners on every
  // cohort/week change.
  const activeCohortRef = useRef<Cohort | null>(null);
  const firstCohortResolveRef = useRef(true);

  const getAccessibleCohorts = useCallback((allCohorts: Cohort[]) => {
    if (isAdmin) return allCohorts;
    return allCohorts.filter((cohort) => userCohortIds.includes(cohort.id));
  }, [isAdmin, userCohortIds]);

  const applyActiveCohort = useCallback((allCohorts: Cohort[], automaticCurrentCohortId?: string | null) => {
    const accessible = getAccessibleCohorts(allCohorts);
    const persistedId = localStorage.getItem(ACTIVE_COHORT_KEY);
    const persisted = persistedId ? accessible.find((cohort) => cohort.id === persistedId) ?? null : null;
    // The database owns the automatic-current rule (dates, practice exclusion,
    // and stable tie-breaking). Keep the local list only as the presentation
    // source and never re-derive that rule here.
    const running = automaticCurrentCohortId
      ? accessible.find((cohort) => cohort.id === automaticCurrentCohortId) ?? null
      : null;
    // On first load, a remembered cohort that has finished gives way to the
    // running one; after that the remembered pick sticks, so an admin who
    // switches to an old cohort isn't moved off it by background refreshes.
    const isFirstResolve = firstCohortResolveRef.current;
    firstCohortResolveRef.current = false;
    const keepPersisted = persisted && (!isFirstResolve || persisted.status === 'ACTIVE' || persisted.isPractice || !running);
    const resolved = (keepPersisted ? persisted : null) || running || accessible[0] || null;

    // Keep references STABLE when nothing actually changed. Background refreshes
    // (the 15s poll, workspace refresh) re-fetch cohorts and would otherwise hand
    // back a brand-new Cohort object every time — that new `activeCohort` identity
    // re-creates each page's `load` callback and re-fires its `load(false)` effect,
    // flipping the global loader and remounting the page ("it reloads on its own").
    setCohorts((prev) =>
      prev.length === accessible.length && JSON.stringify(prev) === JSON.stringify(accessible) ? prev : accessible
    );
    let kept = resolved;
    setActiveCohortState((prev) => {
      if (prev && resolved && prev.id === resolved.id && JSON.stringify(prev) === JSON.stringify(resolved)) {
        kept = prev; // unchanged → reuse the old reference so `activeCohort` is stable
        return prev;
      }
      return resolved;
    });

    if (kept) {
      localStorage.setItem(ACTIVE_COHORT_KEY, kept.id);
    } else {
      localStorage.removeItem(ACTIVE_COHORT_KEY);
    }
    return kept; // callers pass this onward to loadWeeksForCohort — return the stable ref
  }, [getAccessibleCohorts]);

  const loadCohorts = useCallback(async () => {
    const [response, automaticCurrentCohortId] = await Promise.all([
      cohortsApi.getAll(),
      supabaseCohortsApi.getCurrentProgrammeCohortId().catch(() => null),
    ]);
    return applyActiveCohort(response.cohorts, automaticCurrentCohortId);
  }, [applyActiveCohort]);

  const loadWeeksForCohort = useCallback(async (cohortId?: string | null, cohortForDate?: Cohort | null) => {
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
        return response.weeks.find((week) => week.id === prev.id) || getIdealWeekForCohort(cohortForDate ?? null, response.weeks);
      }
      return getIdealWeekForCohort(cohortForDate ?? null, response.weeks);
    });
    return response.weeks;
  }, []);

  const loadRejectedChanges = useCallback(async () => {
    const response = await rejectedChangesApi.getMine();
    setRejectedChanges(response.rejectedChanges);
    setUnreadCount(response.unreadCount);
  }, []);

  // Ids already seen, so a poll can tell what is new (null until the first load).
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);
  const refreshNotifications = useCallback(async () => {
    const response = await notificationsApi.getMine();
    const seen = seenNotificationIdsRef.current;
    if (seen) {
      const arrived = response.notifications.filter((n) => !seen.has(n.id) && !n.isRead);
      if (arrived.length > 0) {
        // Something changed elsewhere: offer a refresh so the page catches up.
        setLiveNotificationTitle(arrived[0].title);
        // Group-assignment notifications are the signal that a support's cohort access may have changed.
        if (arrived.some((n) => n.path === '/support/participants')) void refreshUserCohorts();
      }
    }
    seenNotificationIdsRef.current = new Set(response.notifications.map((n) => n.id));
    // The 10-second check usually finds nothing new; keeping the same list stops the whole
    // app re-rendering for no reason.
    setNotifications((prev) => (
      prev.length === response.notifications.length
      && prev.every((n, i) => n.id === response.notifications[i].id && n.isRead === response.notifications[i].isRead)
        ? prev
        : response.notifications
    ));
    setNotificationUnreadCount(response.unreadCount);
  }, [refreshUserCohorts]);

  const markNotificationsRead = useCallback(async () => {
    // Optimistic: clear the badge immediately, then persist.
    setNotificationUnreadCount(0);
    setNotifications((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true })));
    try {
      await notificationsApi.markAllRead();
    } catch {
      // On failure, re-sync from the server so the badge reflects reality.
      void refreshNotifications();
    }
  }, [refreshNotifications]);

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

  const refreshResourceCount = useCallback(async () => {
    const since = localStorage.getItem(LAST_SEEN_KEY) ?? undefined;
    const count = await resourcesApi.getNewCount(since);
    setNewResourceCount(count);
  }, []);

  const refreshHubActivity = useCallback(async () => {
    const latest = await hubApi.getLatestActivityAt();
    setLatestHubActivityAt(latest);
  }, []);

  // Support hub membership — fetched once per cohort so nav (My Hub link),
  // Support Home and the lead nudge can all read it without their own calls.
  const loadMyHub = useCallback(async (cohortId?: string | null) => {
    if (user?.role !== 'SUPPORT' || !cohortId) { setMyHub(null); return; }
    try {
      const hub = await myHubApi.get(cohortId);
      setMyHub(hub);
    } catch (error) {
      console.error('Failed to load my hub:', error);
    }
  }, [user?.role]);

  const bumpLiveRevision = useCallback(() => {
    setLiveRevision((prev) => prev + 1);
  }, []);

  // Keep refs current every render so realtime-triggered refreshes always read
  // the freshest cohort/week without re-creating the callback.
  activeCohortRef.current = activeCohort;

  const refreshWorkspaceData = useCallback(() => {
    if (refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    void (async () => {
      try {
        const currentCohort = activeCohortRef.current;
        const resolvedCohort = await loadCohorts();
        const loadedWeeks = await loadWeeksForCohort(resolvedCohort?.id ?? currentCohort?.id ?? null, resolvedCohort ?? currentCohort);

        if (isAdmin) {
          await loadGlobalPendingChanges(loadedWeeks.map((week) => week.id));
        }

        await Promise.all([refreshResourceCount(), refreshHubActivity(), loadMyHub(resolvedCohort?.id ?? currentCohort?.id ?? null)]);
        bumpLiveRevision();
      } catch (error) {
        console.error('Failed to refresh workspace data:', error);
      } finally {
        refreshInProgressRef.current = false;
      }
    })();
  }, [
    bumpLiveRevision,
    isAdmin,
    loadCohorts,
    loadGlobalPendingChanges,
    loadWeeksForCohort,
    refreshResourceCount,
    refreshHubActivity,
    loadMyHub,
  ]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setLoading(true);
      try {
        const resolvedCohort = await loadCohorts();
        const loadedWeeks = await loadWeeksForCohort(resolvedCohort?.id, resolvedCohort);

        if (isAdmin) {
          await loadGlobalPendingChanges(loadedWeeks.map((week) => week.id));
        }

        await Promise.all([refreshResourceCount(), refreshNotifications(), refreshHubActivity(), loadMyHub(resolvedCohort?.id ?? null)]);
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
  }, [isAdmin, loadCohorts, loadGlobalPendingChanges, loadWeeksForCohort, refreshNotifications, refreshResourceCount, refreshHubActivity, loadMyHub, user]);

  // There is no live feed to the staff app: the Realtime publication carries only the
  // Notification table, which the public key cannot read, so table listeners here would
  // never fire (they used to, on paper, and kept a websocket open for nothing). A change
  // made elsewhere reaches a person through a notification: this check finds it and offers
  // the "Refresh" prompt, and pages that need to stay current poll for themselves.
  useEffect(() => {
    seenNotificationIdsRef.current = null; // a different person: start fresh
  }, [user?.id]);
  usePolling(() => refreshNotifications(), user ? 30000 : null);
  // The Community unread dot.
  usePolling(() => refreshHubActivity(), user ? 60000 : null);

  // A support whose cohort list changes (e.g. Practice switched on for them) sees
  // it in their cohort menu straight away, without reloading.
  const cohortIdsKey = userCohortIds.join(',');
  const lastCohortIdsKey = useRef(cohortIdsKey);
  useEffect(() => {
    if (lastCohortIdsKey.current === cohortIdsKey) return;
    lastCohortIdsKey.current = cohortIdsKey;
    if (user && !isAdmin) refreshWorkspaceData();
  }, [cohortIdsKey, isAdmin, refreshWorkspaceData, user]);

  const handleWeekSelect = useCallback(async (weekId: number) => {
    try {
      const response = await weeksApi.getById(weekId, activeCohort?.id);
      setSelectedWeek(response.week);
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  }, [activeCohort?.id]);

  const setActiveCohort = useCallback(async (cohortId: string) => {
    const next = cohorts.find((cohort) => cohort.id === cohortId) || null;
    setActiveCohortState(next);
    if (next) {
      localStorage.setItem(ACTIVE_COHORT_KEY, next.id);
      const loadedWeeks = await loadWeeksForCohort(next.id, next);
      if (isAdmin) {
        await loadGlobalPendingChanges(loadedWeeks.map((week) => week.id));
      }
      await loadMyHub(next.id);
    } else {
      localStorage.removeItem(ACTIVE_COHORT_KEY);
      setWeeks([]);
      setSelectedWeek(null);
      setGlobalPendingChanges([]);
      setMyHub(null);
    }
  }, [cohorts, isAdmin, loadGlobalPendingChanges, loadWeeksForCohort, loadMyHub]);

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

  // Keyed on the id only: refreshUser replaces the user object, so depending on
  // `user` would re-create this callback and re-run the page effect forever.
  const userId = user?.id;
  const markHubSeen = useCallback(() => {
    if (!userId) return;
    const seenAt = new Date().toISOString();
    refreshUser({ hubLastSeenAt: seenAt });
    usersApi.markHubSeen(userId).catch((error) => {
      console.error('Failed to mark Community as seen:', error);
    });
  }, [refreshUser, userId]);

  const reloadWeeks = useCallback(async () => {
      await loadWeeksForCohort(activeCohort?.id, activeCohort);
  }, [activeCohort, loadWeeksForCohort]);

  const refreshMyHub = useCallback(async () => {
    await loadMyHub(activeCohortRef.current?.id ?? null);
  }, [loadMyHub]);

  const hasNewHubActivity = useMemo(() => {
    if (!latestHubActivityAt) return false;
    if (!user?.hubLastSeenAt) return true;
    return new Date(latestHubActivityAt) > new Date(user.hubLastSeenAt);
  }, [latestHubActivityAt, user?.hubLastSeenAt]);

  const value = useMemo<AppDataContextType>(() => ({
    loading,
    liveRevision,
    cohorts,
    activeCohort,
    setActiveCohort,
    reloadCohorts: async () => { await loadCohorts(); },
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    rejectedChanges,
    unreadCount,
    refreshRejectedChanges: loadRejectedChanges,
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    liveNotificationTitle,
    dismissLiveNotification,
    markNotificationsRead,
    globalPendingChanges,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    handlePendingApprove,
    handlePendingReject,
    newResourceCount,
    refreshResourceCount,
    markResourcesViewed,
    hasNewHubActivity,
    refreshHubActivity,
    markHubSeen,
    myHub,
    refreshMyHub,
  }), [
    activeCohort,
    cohorts,
    globalPendingChanges,
    handlePendingApprove,
    handlePendingReject,
    handleWeekSelect,
    liveRevision,
    loadRejectedChanges,
    loading,
    markNotificationsRead,
    markResourcesViewed,
    newResourceCount,
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    liveNotificationTitle,
    dismissLiveNotification,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    refreshResourceCount,
    rejectedChanges,
    reloadWeeks,
    loadCohorts,
    selectedWeek,
    setActiveCohort,
    unreadCount,
    weeks,
    hasNewHubActivity,
    refreshHubActivity,
    markHubSeen,
    myHub,
    refreshMyHub,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
