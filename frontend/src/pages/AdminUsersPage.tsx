import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import UserManagement from '../components/UserManagement';
import { useAuth } from '../hooks/useAuth';

const AdminUsersPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [showCreateUser, setShowCreateUser] = React.useState(false);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage admins, SOP preparers, supports, and their label assignments."
        action={(
          <button
            type="button"
            onClick={() => setShowCreateUser(true)}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Add User
          </button>
        )}
      />
      <UserManagement isOpen onClose={() => {}} embedded showUserList showCreateForm={false} />
      <UserManagement
        isOpen={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        showUserList={false}
        showCreateForm
      />
    </div>
  );
};

export default AdminUsersPage;
