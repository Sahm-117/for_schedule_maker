import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import PWAUpdateBanner from './components/PWAUpdateBanner';
import AppShell from './components/AppShell';
import { AppDataProvider } from './context/AppDataContext';
import { TourProvider } from './context/TourContext';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import RootRedirect from './pages/RootRedirect';

// Lazy-loaded pages — each becomes its own chunk, so the initial load only
// ships the shell + the route the user actually lands on.
const SopDownload = lazy(() => import('./pages/SopDownload'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminScripturesPage = lazy(() => import('./pages/AdminScripturesPage'));
const ParticipantHomePage = lazy(() => import('./pages/ParticipantHomePage'));
const ParticipantWelcomePage = lazy(() => import('./pages/ParticipantWelcomePage'));
const ParticipantWeekPage = lazy(() => import('./pages/ParticipantWeekPage'));
const ParticipantJourneyPage = lazy(() => import('./pages/ParticipantJourneyPage'));
const ParticipantShell = lazy(() => import('./components/participantApp/ParticipantShell'));
const ParticipantGroupPage = lazy(() => import('./pages/ParticipantGroupPage'));
const ParticipantFaithPage = lazy(() => import('./pages/ParticipantFaithPage'));
const ParticipantResourcesPage = lazy(() => import('./pages/ParticipantResourcesPage'));
const ParticipantProfilePage = lazy(() => import('./pages/ParticipantProfilePage'));
const ParticipantFeedbackPage = lazy(() => import('./pages/ParticipantFeedbackPage'));
const ParticipantCompletePage = lazy(() => import('./pages/ParticipantCompletePage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
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
const AdminParticipantProfilePage = lazy(() => import('./pages/AdminParticipantProfilePage'));
const AdminSupportsPage = lazy(() => import('./pages/AdminSupportsPage'));
const AdminHubsPage = lazy(() => import('./pages/AdminHubsPage'));
const SupportMyHubPage = lazy(() => import('./pages/SupportMyHubPage'));
const SupportRecapPage = lazy(() => import('./pages/SupportRecapPage'));
const AdminGroupsPage = lazy(() => import('./pages/AdminGroupsPage'));
const AdminRotaPage = lazy(() => import('./pages/AdminRotaPage'));
const AdminAllocationPage = lazy(() => import('./pages/AdminAllocationPage'));
const AdminAttendancePage = lazy(() => import('./pages/AdminAttendancePage'));
const AdminFaithProjectsPage = lazy(() => import('./pages/AdminFaithProjectsPage'));
const AdminGroupPrayersPage = lazy(() => import('./pages/AdminGroupPrayersPage'));
const SupportMobilisationPage = lazy(() => import('./pages/SupportMobilisationPage'));
const SupportAttendancePage = lazy(() => import('./pages/SupportAttendancePage'));
const SupportParticipantsPage = lazy(() => import('./pages/SupportParticipantsPage'));
const SupportHomePage = lazy(() => import('./pages/SupportHomePage'));
const SupportSchedulePage = lazy(() => import('./pages/SupportSchedulePage'));
const SupportResourcesPage = lazy(() => import('./pages/SupportResourcesPage'));
const SupportProfilePage = lazy(() => import('./pages/SupportProfilePage'));
const AdminOnboardingPage = lazy(() => import('./pages/AdminOnboardingPage'));
const SupportOnboardingPage = lazy(() => import('./pages/SupportOnboardingPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));

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
        <ScrollToTop />
        {/* Mounted once for the app's whole lifetime, not per-page (Login,
            AppShell and ParticipantShell used to each render their own copy).
            useRegisterSW's service worker registration is kicked off from a
            useState lazy initializer, a side effect that isn't safe to repeat
            on every navigation — remounting it on the Login → AppShell/
            ParticipantShell transition raced the workbox-window import
            against React's commit and threw "Can't perform a React state
            update on a component that hasn't mounted yet" on every login. */}
        <PWAUpdateBanner />
        <TourProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Support self sign-up is paused; accounts are created by admins. */}
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          {/* Participant app: its own screens, never the staff shell. */}
          <Route element={<ErrorBoundary><ProtectedRoute audience="participant"><Suspense fallback={<RouteFallback />}><ParticipantShell /></Suspense></ProtectedRoute></ErrorBoundary>}>
            <Route path="/me" element={<Suspense fallback={<RouteFallback />}><ParticipantHomePage /></Suspense>} />
            <Route path="/me/week/:weekNumber" element={<Suspense fallback={<RouteFallback />}><ParticipantWeekPage /></Suspense>} />
            <Route path="/me/journey" element={<Suspense fallback={<RouteFallback />}><ParticipantJourneyPage /></Suspense>} />
            <Route path="/me/group" element={<Suspense fallback={<RouteFallback />}><ParticipantGroupPage /></Suspense>} />
            <Route path="/me/faith" element={<Suspense fallback={<RouteFallback />}><ParticipantFaithPage /></Suspense>} />
            <Route path="/me/resources" element={<Suspense fallback={<RouteFallback />}><ParticipantResourcesPage /></Suspense>} />
            <Route path="/me/profile" element={<Suspense fallback={<RouteFallback />}><ParticipantProfilePage /></Suspense>} />
            <Route path="/me/feedback" element={<Suspense fallback={<RouteFallback />}><ParticipantFeedbackPage /></Suspense>} />
            <Route path="/me/complete" element={<Suspense fallback={<RouteFallback />}><ParticipantCompletePage /></Suspense>} />
          </Route>
          <Route path="/me/welcome" element={<ErrorBoundary><ProtectedRoute audience="participant"><Suspense fallback={<RouteFallback />}><ParticipantWelcomePage /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <AppDataProvider>
                    <ToastProvider>
                      <AppShell />
                    </ToastProvider>
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
            <Route path="/scriptures" element={<Suspense fallback={<RouteFallback />}><AdminScripturesPage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><AdminSettingsPage /></Suspense>} />
            <Route path="/activity-overview" element={<Suspense fallback={<RouteFallback />}><ActivityOverviewPage /></Suspense>} />
            <Route path="/cohorts" element={<Suspense fallback={<RouteFallback />}><CohortsPage /></Suspense>} />
            <Route path="/follow-ups" element={<Suspense fallback={<RouteFallback />}><AdminFollowUpsPage /></Suspense>} />
            <Route path="/participants" element={<Suspense fallback={<RouteFallback />}><AdminParticipantsPage /></Suspense>} />
            <Route path="/participants/:participantId" element={<Suspense fallback={<RouteFallback />}><AdminParticipantProfilePage /></Suspense>} />
            <Route path="/groups" element={<Suspense fallback={<RouteFallback />}><AdminGroupsPage /></Suspense>} />
            <Route path="/supports" element={<Suspense fallback={<RouteFallback />}><AdminSupportsPage /></Suspense>} />
            <Route path="/hubs" element={<Suspense fallback={<RouteFallback />}><AdminHubsPage /></Suspense>} />
            <Route path="/rota" element={<Suspense fallback={<RouteFallback />}><AdminRotaPage /></Suspense>} />
            <Route path="/allocation" element={<Suspense fallback={<RouteFallback />}><AdminAllocationPage /></Suspense>} />
            <Route path="/attendance" element={<Suspense fallback={<RouteFallback />}><AdminAttendancePage /></Suspense>} />
            <Route path="/faith-projects" element={<Suspense fallback={<RouteFallback />}><AdminFaithProjectsPage /></Suspense>} />
            <Route path="/group-prayers" element={<Suspense fallback={<RouteFallback />}><AdminGroupPrayersPage /></Suspense>} />
            <Route path="/onboarding" element={<Suspense fallback={<RouteFallback />}><AdminOnboardingPage /></Suspense>} />
            <Route path="/feedback" element={<Suspense fallback={<RouteFallback />}><AdminFeedbackPage /></Suspense>} />
            <Route path="/support/onboarding" element={<Suspense fallback={<RouteFallback />}><SupportOnboardingPage /></Suspense>} />
            <Route path="/support/follow-ups" element={<Navigate to="/support/mobilisation?tab=follow" replace />} />
            <Route path="/support/mobilisation" element={<Suspense fallback={<RouteFallback />}><SupportMobilisationPage /></Suspense>} />
            <Route path="/support/attendance" element={<Suspense fallback={<RouteFallback />}><SupportAttendancePage /></Suspense>} />
            <Route path="/support/participants" element={<Suspense fallback={<RouteFallback />}><SupportParticipantsPage /></Suspense>} />
            <Route path="/support/my-hub" element={<Suspense fallback={<RouteFallback />}><SupportMyHubPage /></Suspense>} />
            <Route path="/support/recap" element={<Suspense fallback={<RouteFallback />}><SupportRecapPage /></Suspense>} />
            <Route path="/support" element={<Suspense fallback={<RouteFallback />}><SupportHomePage /></Suspense>} />
            <Route path="/support/schedule" element={<Suspense fallback={<RouteFallback />}><SupportSchedulePage /></Suspense>} />
            <Route path="/support/resources" element={<Suspense fallback={<RouteFallback />}><SupportResourcesPage /></Suspense>} />
            <Route path="/support/announcements" element={<Suspense fallback={<RouteFallback />}><AnnouncementsFeedPage /></Suspense>} />
            <Route path="/support/profile" element={<Suspense fallback={<RouteFallback />}><SupportProfilePage /></Suspense>} />
            <Route path="/support/community" element={<Suspense fallback={<RouteFallback />}><CommunityPage /></Suspense>} />
            <Route path="/community" element={<Suspense fallback={<RouteFallback />}><CommunityPage /></Suspense>} />
            {/* Old paths — Notification rows already stored in the database carry these. */}
            <Route path="/support/hub" element={<Navigate to="/support/community" replace />} />
            <Route path="/hub" element={<Navigate to="/community" replace />} />
            <Route path="/sop-download" element={<Suspense fallback={<RouteFallback />}><SopDownload /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </TourProvider>
      </Router>
    </AuthProvider>
  );
}

export default App
