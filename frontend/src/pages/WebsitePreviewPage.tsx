import React, { Suspense, lazy, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { WEBSITE_PREVIEW_KEY } from '../components/landing/landingContent';

const LandingPage = lazy(() => import('./LandingPage'));

const readDraft = (): unknown => {
  try {
    const raw = sessionStorage.getItem(WEBSITE_PREVIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * The public homepage showing the admin's unsaved Website changes. The draft is passed in this tab's session storage
 * (copied when Preview opens the tab); nothing is saved, and a visitor never sees it.
 */
const WebsitePreviewPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [draft] = useState(readDraft);
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (!draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center text-sm text-gray-600">
        There is no draft to preview. Go back to Settings &rarr; Website and press Preview.
      </div>
    );
  }
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[1000] bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-800">
        Preview of your unsaved changes. Nobody else sees this, and nothing has been saved.
      </div>
      <Suspense fallback={null}>
        <LandingPage previewContent={draft} />
      </Suspense>
    </>
  );
};

export default WebsitePreviewPage;
