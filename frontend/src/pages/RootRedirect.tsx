import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const RootRedirect: React.FC = () => {
  const { user } = useAuth();

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

export default RootRedirect;
