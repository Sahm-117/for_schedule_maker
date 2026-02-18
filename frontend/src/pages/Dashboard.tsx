import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { weeksApi, rejectedChangesApi, settingsApi, pendingChangesApi } from '../services/api';
import type { Week, RejectedChange, PendingChange } from '../types';
import { supabase } from '../lib/supabase';
import WeekSelector from '../components/WeekSelector';
import ScheduleView from '../components/ScheduleView';
import RejectedChangesNotification from '../components/RejectedChangesNotification';
import UserManagement from '../components/UserManagement';
import LabelManagement from '../components/LabelManagement';
import PendingChangesPanel from '../components/PendingChangesPanel';
import AdminActionsSheet from '../components/AdminActionsSheet';

const Dashboard: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalPendingChanges, setGlobalPendingChanges] = useState<PendingChange[]>([]);
  const [weekPendingChanges, setWeekPendingChanges] = useState<PendingChange[]>([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showLabelManagement, setShowLabelManagement] = useState(false);
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestToggleLoading, setDigestToggleLoading] = useState(false);
  const [digestStatus, setDigestStatus] = useState<string>('');
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

  const loadDigestSettings = useCallback(async () => {
    const response = await settingsApi.getDailyDigestEnabled();
    setDigestEnabled(response.enabled);
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
          await Promise.all([loadDigestSettings(), loadGlobalPendingChanges()]);
        } else {
          await loadRejectedChanges();
        }
      } catch (error) {
        console.error('Failed to initialize dashboard:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, loadDigestSettings, loadGlobalPendingChanges, loadRejectedChanges, loadWeeks]);

  useEffect(() => {
    if (isAdmin || !selectedWeek) return;

    loadWeekPendingChanges(selectedWeek.id).catch((error) => {
      console.error('Failed to load week pending changes:', error);
    });
  }, [isAdmin, selectedWeek, loadWeekPendingChanges]);

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

  const handleWeekSelect = async (weekId: number) => {
    try {
      const response = await weeksApi.getById(weekId);
      setSelectedWeek(response.week);

      if (!isAdmin) {
        await loadWeekPendingChanges(response.week.id);
      }
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  };

  const handleRejectedChangesUpdate = () => {
    void loadRejectedChanges();
  };

  const handleToggleDigest = async () => {
    const nextValue = !digestEnabled;
    setDigestToggleLoading(true);
    setDigestStatus('');

    try {
      const response = await settingsApi.setDailyDigestEnabled(nextValue);
      setDigestEnabled(response.enabled);
      setDigestStatus(response.enabled ? 'Daily digest enabled.' : 'Daily digest disabled.');
    } catch (error) {
      setDigestStatus(`Digest toggle failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDigestToggleLoading(false);
    }
  };

  const handleSendDigestNow = async () => {
    if (!digestEnabled) {
      setDigestStatus('Daily digest is currently OFF. Turn it on first.');
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !anonKey) {
      setDigestStatus('Missing Supabase env config in frontend.');
      return;
    }

    setDigestSending(true);
    setDigestStatus('');

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/telegram-daily-digest?force=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ force: true }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok || body?.ok !== true) {
        const dispatchDetail = body?.details?.failed?.[0]?.error;
        const errText = dispatchDetail
          ? `${body?.error || `Request failed (${response.status})`} - ${dispatchDetail}`
          : (body?.error || `Request failed (${response.status})`);
        setDigestStatus(`Digest failed: ${errText}`);
        return;
      }

      setDigestStatus(`Digest sent to Telegram (${body?.dayName || 'today'}).`);
    } catch (error) {
      setDigestStatus(`Digest failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDigestSending(false);
    }
  };

  const pendingChangesForSelectedWeek = useMemo(() => {
    if (!selectedWeek) return [];
    if (isAdmin) {
      return globalPendingChanges.filter((change) => change.weekId === selectedWeek.id);
    }
    return weekPendingChanges;
  }, [globalPendingChanges, isAdmin, selectedWeek, weekPendingChanges]);

  const handlePendingChangesRefresh = () => {
    if (isAdmin) {
      void loadGlobalPendingChanges();
      return;
    }

    if (selectedWeek) {
      void loadWeekPendingChanges(selectedWeek.id);
    }
  };

  const handlePendingApprove = (changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshAdminData();
  };

  const handlePendingReject = (changeIds?: string[]) => {
    if (changeIds && changeIds.length > 0) {
      setGlobalPendingChanges((prev) => prev.filter((change) => !changeIds.includes(change.id)));
    }
    refreshAdminData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                FOF IKD - SOP Manager
              </h1>
              <img
                src="/logo-mark.png"
                alt="The Covenant Nation"
                className="ml-3 h-8 w-8 rounded bg-white p-1 border border-gray-200 object-contain shrink-0"
              />
              <span className="ml-2 sm:ml-3 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {isAdmin ? 'Admin' : 'Support'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminActions(true)}
                  className="text-xs sm:text-sm text-primary hover:text-primary-dark px-3 py-2 rounded-md border border-primary hover:bg-primary/5"
                >
                  Admin Actions
                </button>
              )}
              <button
                onClick={logout}
                className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-700">Welcome, {user?.name}</span>
            {isAdmin && (
              <>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 text-xs">
                  Pending: {globalPendingChanges.length}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs ${realtimeHealthy ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                  {realtimeHealthy ? 'Live sync' : 'Polling fallback'}
                </span>
              </>
            )}
          </div>

          {isAdmin && digestStatus && (
            <p className={`text-xs sm:text-sm ${digestStatus.startsWith('Digest sent') || digestStatus.includes('enabled') || digestStatus.includes('disabled') ? 'text-green-700' : 'text-red-600'}`}>
              {digestStatus}
            </p>
          )}
        </div>
      </header>

      {!isAdmin && unreadCount > 0 && (
        <RejectedChangesNotification
          rejectedChanges={rejectedChanges}
          unreadCount={unreadCount}
          onUpdate={handleRejectedChangesUpdate}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {isAdmin && (
          <PendingChangesPanel
            pendingChanges={globalPendingChanges}
            onApprove={handlePendingApprove}
            onReject={handlePendingReject}
            isAdmin={isAdmin}
            weeks={weeks}
          />
        )}

        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-8">
          <div className="lg:col-span-1 order-1">
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onWeekSelect={handleWeekSelect}
            />
          </div>

          <div className="lg:col-span-3 order-2">
            {selectedWeek ? (
              <ScheduleView
                week={selectedWeek}
                weeks={weeks}
                pendingChanges={pendingChangesForSelectedWeek}
                onWeekUpdate={loadWeeks}
                onPendingChangesRefresh={handlePendingChangesRefresh}
                isAdmin={isAdmin}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500">Select a week to view the schedule</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <AdminActionsSheet
        isOpen={showAdminActions}
        onClose={() => setShowAdminActions(false)}
        digestEnabled={digestEnabled}
        digestToggleLoading={digestToggleLoading}
        digestSending={digestSending}
        onToggleDigest={handleToggleDigest}
        onSendDigestNow={handleSendDigestNow}
        onOpenLabels={() => setShowLabelManagement(true)}
        onOpenUsers={() => setShowUserManagement(true)}
      />

      <UserManagement
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />

      <LabelManagement
        isOpen={showLabelManagement}
        onClose={() => setShowLabelManagement(false)}
      />
    </div>
  );
};

export default Dashboard;
