import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { weeksApi, rejectedChangesApi } from '../services/api';
import type { Week, RejectedChange } from '../types';
import WeekSelector from '../components/WeekSelector';
import ScheduleView from '../components/ScheduleView';
import RejectedChangesNotification from '../components/RejectedChangesNotification';
import UserManagement from '../components/UserManagement';
import TeamManagement from '../components/TeamManagement';
import OnboardingWalkthrough from '../components/OnboardingWalkthrough';
import SearchBar from '../components/SearchBar';

const Dashboard: React.FC = () => {
  const { user, logout, isAdmin, completeOnboarding } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedActivityId, setHighlightedActivityId] = useState<number | null>(null);

  useEffect(() => {
    loadWeeks();
    if (!isAdmin) {
      loadRejectedChanges();
    }
  }, [isAdmin]);

  // Check if onboarding should be shown
  useEffect(() => {
    if (user && !user.onboardingCompleted && weeks.length > 0) {
      setShowOnboarding(true);
    }
  }, [user, weeks]);

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
        // Try to restore last viewed week from localStorage
        const savedWeekId = localStorage.getItem('lastViewedWeekId');
        let weekToSelect: Week | undefined;

        if (savedWeekId) {
          weekToSelect = response.weeks.find(week => week.id === parseInt(savedWeekId));
        }

        // Fallback: Week 1 if available, otherwise first week
        if (!weekToSelect) {
          weekToSelect = response.weeks.find(week => week.weekNumber === 1) || response.weeks[0];
        }

        setSelectedWeek(weekToSelect);
      }
    } catch (error) {
      console.error('Failed to load weeks:', error);
      setError(error instanceof Error ? error.message : 'Failed to load weeks');
      setWeeks([]);
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
      // Save to localStorage for persistence
      localStorage.setItem('lastViewedWeekId', weekId.toString());
    } catch (error) {
      console.error('Failed to load week:', error);
    }
  };

  const handleRejectedChangesUpdate = () => {
    loadRejectedChanges();
  };

  const handleOnboardingComplete = async () => {
    try {
      await completeOnboarding();
      setShowOnboarding(false);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  const handleSearchResultClick = async (weekId: number, activityId: number) => {
    // Navigate to the week
    await handleWeekSelect(weekId);

    // Set highlighted activity
    setHighlightedActivityId(activityId);

    // Scroll to activity after a short delay to ensure DOM is ready
    setTimeout(() => {
      const activityElement = document.getElementById(`activity-${activityId}`);
      if (activityElement) {
        activityElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedActivityId(null);
    }, 3000);
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              loadWeeks();
            }}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
          >
            Try Again
          </button>
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
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="FOF IKD Logo" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Foundation of Faith
                </h1>
                <p className="text-xs sm:text-sm text-gray-600">Covenant Nation Ikorodu</p>
              </div>
              <span className="ml-2 sm:ml-3 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {isAdmin ? 'Admin' : 'Support'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-gray-700">
                Welcome, {user?.name || 'User'}
              </span>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setShowUserManagement(true)}
                      className="user-management-btn text-xs sm:text-sm text-primary hover:text-primary-dark px-2 sm:px-3 py-1 sm:py-2 rounded-md border border-primary hover:bg-primary/5"
                    >
                      Manage Users
                    </button>
                    <button
                      onClick={() => setShowTeamManagement(true)}
                      className="text-xs sm:text-sm text-primary hover:text-primary-dark px-2 sm:px-3 py-1 sm:py-2 rounded-md border border-primary hover:bg-primary/5"
                    >
                      Manage Teams
                    </button>
                  </>
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
        <div className="rejected-changes-notification">
          <RejectedChangesNotification
            rejectedChanges={rejectedChanges}
            unreadCount={unreadCount}
            onUpdate={handleRejectedChangesUpdate}
          />
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar
            weeks={weeks}
            onResultClick={handleSearchResultClick}
          />
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-8">
          {/* Week Selector */}
          <div className="lg:col-span-1 order-1 week-selector">
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
                highlightedActivityId={highlightedActivityId}
              />
            ) : weeks.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="text-gray-400 text-6xl mb-4">📅</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Schedule Data</h3>
                <p className="text-gray-500 mb-4">
                  The schedule database appears to be empty. Please contact your administrator to initialize the schedule data.
                </p>
                <button
                  onClick={() => {
                    setLoading(true);
                    loadWeeks();
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
                >
                  Refresh
                </button>
              </div>
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

      {/* Team Management Modal */}
      {showTeamManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-2xl font-semibold text-gray-900">Team Management</h2>
              <button
                onClick={() => setShowTeamManagement(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <TeamManagement />
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Walkthrough */}
      {user && (
        <OnboardingWalkthrough
          isOpen={showOnboarding}
          onComplete={handleOnboardingComplete}
          userRole={user.role}
        />
      )}
    </div>
  );
};

export default Dashboard;