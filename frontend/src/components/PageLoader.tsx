import React from 'react';

interface PageLoaderProps {
  label?: string;
}

// Centered spinner for in-page loading states (matches ProtectedRoute / route fallback).
const PageLoader: React.FC<PageLoaderProps> = ({ label = 'Loading…' }) => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="text-center">
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      <p className="mt-4 text-sm text-gray-500">{label}</p>
    </div>
  </div>
);

export default PageLoader;
