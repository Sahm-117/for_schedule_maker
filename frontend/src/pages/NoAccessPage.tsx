import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { MODULES } from '../utils/permissions';

// Shown inside the app when someone opens a page their role does not include, or has no modules at all yet.
const NoAccessPage: React.FC = () => {
  const { logout } = useAuth();
  const { landingPath } = usePermissions();
  const landingLabel = landingPath ? MODULES.find((m) => m.paths[0] === landingPath)?.label : null;

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="surface-card w-full max-w-md px-6 py-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100/80 text-amber-700">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 11V8a4 4 0 0 0-8 0v3m-1 0h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900" data-testid="no-access-title">
          {landingPath ? 'No access to this page' : 'No access yet'}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {landingPath
            ? 'Your role does not include this page. Ask an Admin if you need it.'
            : 'Your role does not include any pages yet. Ask an Admin to add some to it.'}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          {landingPath && (
            <Link
              to={landingPath}
              replace
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Go to {landingLabel ?? 'my pages'}
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoAccessPage;
