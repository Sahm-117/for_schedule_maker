import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { weeksApi, rejectedChangesApi } from '../services/api';
import type { Week, RejectedChange } from '../types';
import WeekSelector from '../components/WeekSelector';
import ScheduleView from '../components/ScheduleView';
import RejectedChangesNotification from '../components/RejectedChangesNotification';
import UserManagement from '../components/UserManagement';

const Dashboard: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUserManagement, setShowUserManagement] = useState(false);

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

      // Update selectedWeek if it exists to reflect latest changes
      if (selectedWeek && response.weeks.length > 0) {
        const updatedSelectedWeek = response.weeks.find(week => week.id === selectedWeek.id);
        if (updatedSelectedWeek) {
          setSelectedWeek(updatedSelectedWeek);
        }
      } else if (response.weeks.length > 0 && !selectedWeek) {
        // Default to Week 1 if available, otherwise first week
        const week1 = response.weeks.find(week => week.weekNumber === 1);
        setSelectedWeek(week1 || response.weeks[0]);
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-0 sm:h-16 gap-3 sm:gap-0">
            <div className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                FOF Schedule Editor
              </h1>
              <span className="ml-2 sm:ml-3 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {isAdmin ? 'Admin' : 'Support'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-gray-700">
                Welcome, {user?.name}
              </span>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowUserManagement(true)}
                    className="text-xs sm:text-sm text-primary hover:text-primary-dark px-2 sm:px-3 py-1 sm:py-2 rounded-md border border-primary hover:bg-primary/5"
                  >
                    Manage Users
                  </button>
                )}
                <button
                  onClick={logout}
                  className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 px-2 sm:px-3 py-1 sm:py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                >
                  Logout
                </button>
              </div>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-8">
          {/* Week Selector */}
          <div className="lg:col-span-1 order-1">
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onWeekSelect={handleWeekSelect}
            />
          </div>

          {/* Schedule View */}
          <div className="lg:col-span-3 order-2">
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

      {/* User Management Modal */}
      <UserManagement
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
    </div>
  );
};

export default Dashboard;