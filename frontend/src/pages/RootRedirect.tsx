import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';

const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  const { landingPath } = usePermissions();

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }

  // Admins land on the Dashboard; a Team member on the first page their role includes.
  return <Navigate to={landingPath ?? '/dashboard'} replace />;
};

export default RootRedirect;
