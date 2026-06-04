import React from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ResourceHubModal from '../components/ResourceHubModal';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';

const SupportResourcesPage: React.FC = () => {
  const { user } = useAuth();
  const { markResourcesViewed } = useAppData();

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/resources" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Resources"
        subtitle="Browse links, files, and reference materials shared with the support team."
      />
      <ResourceHubModal isOpen onClose={() => {}} embedded onViewed={markResourcesViewed} />
    </div>
  );
};

export default SupportResourcesPage;
