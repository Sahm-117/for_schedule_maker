import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import UserManagement from '../components/UserManagement';
import { useAuth } from '../hooks/useAuth';

const AdminUsersPage: React.FC = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage admins, SOP preparers, supports, and their label assignments."
      />
      <UserManagement isOpen onClose={() => {}} embedded />
    </div>
  );
};

export default AdminUsersPage;
