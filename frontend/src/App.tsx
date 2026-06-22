import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';
import { AppDataProvider } from './context/AppDataContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import RootRedirect from './pages/RootRedirect';

// Lazy-loaded pages — each becomes its own chunk, so the initial load only
// ships the shell + the route the user actually lands on.
const SopDownload = lazy(() => import('./pages/SopDownload'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminSchedulePage = lazy(() => import('./pages/AdminSchedulePage'));
const AdminApprovalsPage = lazy(() => import('./pages/AdminApprovalsPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminAnnouncementsPage = lazy(() => import('./pages/AdminAnnouncementsPage'));
const AdminResourcesPage = lazy(() => import('./pages/AdminResourcesPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AnnouncementsFeedPage = lazy(() => import('./pages/AnnouncementsFeedPage'));
const ActivityOverviewPage = lazy(() => import('./pages/ActivityOverviewPage'));
const CohortsPage = lazy(() => import('./pages/CohortsPage'));
const AdminFollowUpsPage = lazy(() => import('./pages/AdminFollowUpsPage'));
const AdminParticipantsPage = lazy(() => import('./pages/AdminParticipantsPage'));
const AdminGroupsPage = lazy(() => import('./pages/AdminGroupsPage'));
const AdminAllocationPage = lazy(() => import('./pages/AdminAllocationPage'));
const AdminAttendancePage = lazy(() => import('./pages/AdminAttendancePage'));
const AdminFaithProjectsPage = lazy(() => import('./pages/AdminFaithProjectsPage'));
const AdminGroupPrayersPage = lazy(() => import('./pages/AdminGroupPrayersPage'));
const SupportFollowUpsPage = lazy(() => import('./pages/SupportFollowUpsPage'));
const SupportAttendancePage = lazy(() => import('./pages/SupportAttendancePage'));
const SupportParticipantsPage = lazy(() => import('./pages/SupportParticipantsPage'));
const SupportHomePage = lazy(() => import('./pages/SupportHomePage'));
const SupportSchedulePage = lazy(() => import('./pages/SupportSchedulePage'));
const SupportResourcesPage = lazy(() => import('./pages/SupportResourcesPage'));
const SupportProfilePage = lazy(() => import('./pages/SupportProfilePage'));
const AdminOnboardingPage = lazy(() => import('./pages/AdminOnboardingPage'));
const SupportOnboardingPage = lazy(() => import('./pages/SupportOnboardingPage'));
const HubPage = lazy(() => import('./pages/HubPage'));

const RouteFallback: React.FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

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
            <Route path="/dashboard" element={<Suspense fallback={<RouteFallback />}><AdminDashboardPage /></Suspense>} />
            <Route path="/schedule" element={<Suspense fallback={<RouteFallback />}><AdminSchedulePage /></Suspense>} />
            <Route path="/approvals" element={<Suspense fallback={<RouteFallback />}><AdminApprovalsPage /></Suspense>} />
            <Route path="/users" element={<Suspense fallback={<RouteFallback />}><AdminUsersPage /></Suspense>} />
            <Route path="/announcements" element={<Suspense fallback={<RouteFallback />}><AdminAnnouncementsPage /></Suspense>} />
            <Route path="/team-announcements" element={<Suspense fallback={<RouteFallback />}><AnnouncementsFeedPage /></Suspense>} />
            <Route path="/resources" element={<Suspense fallback={<RouteFallback />}><AdminResourcesPage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><AdminSettingsPage /></Suspense>} />
            <Route path="/activity-overview" element={<Suspense fallback={<RouteFallback />}><ActivityOverviewPage /></Suspense>} />
            <Route path="/cohorts" element={<Suspense fallback={<RouteFallback />}><CohortsPage /></Suspense>} />
            <Route path="/follow-ups" element={<Suspense fallback={<RouteFallback />}><AdminFollowUpsPage /></Suspense>} />
            <Route path="/participants" element={<Suspense fallback={<RouteFallback />}><AdminParticipantsPage /></Suspense>} />
            <Route path="/groups" element={<Suspense fallback={<RouteFallback />}><AdminGroupsPage /></Suspense>} />
            <Route path="/allocation" element={<Suspense fallback={<RouteFallback />}><AdminAllocationPage /></Suspense>} />
            <Route path="/attendance" element={<Suspense fallback={<RouteFallback />}><AdminAttendancePage /></Suspense>} />
            <Route path="/faith-projects" element={<Suspense fallback={<RouteFallback />}><AdminFaithProjectsPage /></Suspense>} />
            <Route path="/group-prayers" element={<Suspense fallback={<RouteFallback />}><AdminGroupPrayersPage /></Suspense>} />
            <Route path="/onboarding" element={<Suspense fallback={<RouteFallback />}><AdminOnboardingPage /></Suspense>} />
            <Route path="/support/onboarding" element={<Suspense fallback={<RouteFallback />}><SupportOnboardingPage /></Suspense>} />
            <Route path="/support/follow-ups" element={<Suspense fallback={<RouteFallback />}><SupportFollowUpsPage /></Suspense>} />
            <Route path="/support/attendance" element={<Suspense fallback={<RouteFallback />}><SupportAttendancePage /></Suspense>} />
            <Route path="/support/participants" element={<Suspense fallback={<RouteFallback />}><SupportParticipantsPage /></Suspense>} />
            <Route path="/support" element={<Suspense fallback={<RouteFallback />}><SupportHomePage /></Suspense>} />
            <Route path="/support/schedule" element={<Suspense fallback={<RouteFallback />}><SupportSchedulePage /></Suspense>} />
            <Route path="/support/resources" element={<Suspense fallback={<RouteFallback />}><SupportResourcesPage /></Suspense>} />
            <Route path="/support/announcements" element={<Suspense fallback={<RouteFallback />}><AnnouncementsFeedPage /></Suspense>} />
            <Route path="/support/profile" element={<Suspense fallback={<RouteFallback />}><SupportProfilePage /></Suspense>} />
            <Route path="/support/hub" element={<Suspense fallback={<RouteFallback />}><HubPage /></Suspense>} />
            <Route path="/hub" element={<Suspense fallback={<RouteFallback />}><HubPage /></Suspense>} />
            <Route path="/sop-download" element={<Suspense fallback={<RouteFallback />}><SopDownload /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App
