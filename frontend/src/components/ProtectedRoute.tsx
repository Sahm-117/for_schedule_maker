import React, { Suspense, lazy } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Public landing page — only ever needed for a signed-out visitor at "/",
// so it's lazy so it never ships in the bundle any signed-in staff/support
// user loads.
const LandingPage = lazy(() => import('../pages/LandingPage'));

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Staff pages send participants to their app, and the participant app sends staff home. */
  audience?: 'staff' | 'participant';
}

const RouteFallbackSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, audience = 'staff' }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <RouteFallbackSpinner />;
  }

  if (!user) {
    // Signed-out visitor at the root URL sees the public FOF landing page
    // instead of being bounced to /login; every other staff/participant
    // route keeps redirecting to /login exactly as before.
    if (audience === 'staff' && location.pathname === '/') {
      return (
        <Suspense fallback={<RouteFallbackSpinner />}>
          <LandingPage />
        </Suspense>
      );
    }
    return <Navigate to="/login" replace />;
  }

  const isParticipant = user.role === 'PARTICIPANT';
  if (audience === 'staff' && isParticipant) {
    return <Navigate to="/me" replace />;
  }
  if (audience === 'participant' && !isParticipant) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;