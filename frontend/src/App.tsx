import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';
import { AppDataProvider } from './context/AppDataContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SopDownload from './pages/SopDownload';
import RootRedirect from './pages/RootRedirect';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminSchedulePage from './pages/AdminSchedulePage';
import AdminApprovalsPage from './pages/AdminApprovalsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminAnnouncementsPage from './pages/AdminAnnouncementsPage';
import AdminResourcesPage from './pages/AdminResourcesPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AnnouncementsFeedPage from './pages/AnnouncementsFeedPage';
import ActivityOverviewPage from './pages/ActivityOverviewPage';
import CohortsPage from './pages/CohortsPage';
import AdminFollowUpsPage from './pages/AdminFollowUpsPage';
import AdminParticipantsPage from './pages/AdminParticipantsPage';
import AdminGroupsPage from './pages/AdminGroupsPage';
import AdminAttendancePage from './pages/AdminAttendancePage';
import AdminFaithProjectsPage from './pages/AdminFaithProjectsPage';
import AdminGroupPrayersPage from './pages/AdminGroupPrayersPage';
import SupportFollowUpsPage from './pages/SupportFollowUpsPage';
import SupportAttendancePage from './pages/SupportAttendancePage';
import SupportParticipantsPage from './pages/SupportParticipantsPage';
import SupportHomePage from './pages/SupportHomePage';
import SupportSchedulePage from './pages/SupportSchedulePage';
import SupportResourcesPage from './pages/SupportResourcesPage';
import SupportProfilePage from './pages/SupportProfilePage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <AppDataProvider>
                    <AppShell />
                  </AppDataProvider>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          >
            <Route index element={<RootRedirect />} />
            <Route path="/dashboard" element={<AdminDashboardPage />} />
            <Route path="/schedule" element={<AdminSchedulePage />} />
            <Route path="/approvals" element={<AdminApprovalsPage />} />
            <Route path="/users" element={<AdminUsersPage />} />
            <Route path="/announcements" element={<AdminAnnouncementsPage />} />
            <Route path="/team-announcements" element={<AnnouncementsFeedPage />} />
            <Route path="/resources" element={<AdminResourcesPage />} />
            <Route path="/settings" element={<AdminSettingsPage />} />
            <Route path="/activity-overview" element={<ActivityOverviewPage />} />
            <Route path="/cohorts" element={<CohortsPage />} />
            <Route path="/follow-ups" element={<AdminFollowUpsPage />} />
            <Route path="/participants" element={<AdminParticipantsPage />} />
            <Route path="/groups" element={<AdminGroupsPage />} />
            <Route path="/attendance" element={<AdminAttendancePage />} />
            <Route path="/faith-projects" element={<AdminFaithProjectsPage />} />
            <Route path="/group-prayers" element={<AdminGroupPrayersPage />} />
            <Route path="/support/follow-ups" element={<SupportFollowUpsPage />} />
            <Route path="/support/attendance" element={<SupportAttendancePage />} />
            <Route path="/support/participants" element={<SupportParticipantsPage />} />
            <Route path="/support" element={<SupportHomePage />} />
            <Route path="/support/schedule" element={<SupportSchedulePage />} />
            <Route path="/support/resources" element={<SupportResourcesPage />} />
            <Route path="/support/announcements" element={<AnnouncementsFeedPage />} />
            <Route path="/support/profile" element={<SupportProfilePage />} />
            <Route path="/sop-download" element={<SopDownload />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App
