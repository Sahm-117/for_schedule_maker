import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Staff pages send participants to their app, and the participant app sends staff home. */
  audience?: 'staff' | 'participant';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, audience = 'staff' }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
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