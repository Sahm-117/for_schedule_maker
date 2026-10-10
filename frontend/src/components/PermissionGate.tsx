import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import PageLoader from './PageLoader';
import NoAccessPage from '../pages/NoAccessPage';

// One gate for every staff page: a page the person's role does not include shows "No access" instead.
// Menus are hidden by AppShell; this covers typed addresses, old bookmarks and notification links.
const PermissionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { user, reloadPermissions } = useAuth();
  const { status, canOpen } = usePermissions();

  if (!user || user.role === 'PARTICIPANT') return <>{children}</>;

  if (status === 'idle' || status === 'loading') return <PageLoader label="Loading your access…" />;

  if (status === 'error') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="surface-card w-full max-w-md px-6 py-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">Could not load your access</h1>
          <p className="mt-2 text-sm text-gray-500">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => { void reloadPermissions(); }}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return canOpen(pathname) ? <>{children}</> : <NoAccessPage />;
};

export default PermissionGate;
