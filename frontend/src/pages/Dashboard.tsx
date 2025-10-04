import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { weeksApi, rejectedChangesApi } from '../services/api';
import type { Week, RejectedChange } from '../types';
import WeekSelector from '../components/WeekSelector';
import ScheduleView from '../components/ScheduleView';
import RejectedChangesNotification from '../components/RejectedChangesNotification';

const Dashboard: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadWeeks();
    if (!isAdmin) {
      loadRejectedChanges();
    }
  }, [isAdmin]);

  const loadWeeks = async () => {
    try {
      const response = await weeksApi.getAll();
      setWeeks(response.weeks);
      if (response.weeks.length > 0 && !selectedWeek) {
        setSelectedWeek(response.weeks[0]);
      }
    } catch (error) {
      console.error('Failed to load weeks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRejectedChanges = async () => {
    try {
      const response = await rejectedChangesApi.getMine();
      setRejectedChanges(response.rejectedChanges);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error('Failed to load rejected changes:', error);
    }
  };

  const handleWeekSelect = async (weekId: number) => {
    try {
      const response = await weeksApi.getById(weekId);
      setSelectedWeek(response.week);
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  };

  const handleRejectedChangesUpdate = () => {
    loadRejectedChanges();
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
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                FOF Schedule Editor
              </h1>
              <span className="ml-3 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {isAdmin ? 'Admin' : 'Support'}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {user?.name}
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Rejected Changes Notification */}
      {!isAdmin && unreadCount > 0 && (
        <RejectedChangesNotification
          rejectedChanges={rejectedChanges}
          unreadCount={unreadCount}
          onUpdate={handleRejectedChangesUpdate}
        />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Week Selector */}
          <div className="lg:col-span-1">
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onWeekSelect={handleWeekSelect}
            />
          </div>

          {/* Schedule View */}
          <div className="lg:col-span-3">
            {selectedWeek ? (
              <ScheduleView
                week={selectedWeek}
                weeks={weeks}
                onWeekUpdate={loadWeeks}
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
    </div>
  );
};

export default Dashboard;