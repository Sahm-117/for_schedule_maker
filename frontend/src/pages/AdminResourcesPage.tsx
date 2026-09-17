import React from 'react';
import PageHeader from '../components/PageHeader';
import ResourceHubModal from '../components/ResourceHubModal';
import { useAppData } from '../context/AppDataContext';

const AdminResourcesPage: React.FC = () => {
  const { markResourcesViewed } = useAppData();

  return (
    <div>
      <PageHeader
        title="Resources"
        tourId="admin:resources"
        subtitle="Share links and files with the support team."
      />
      <div data-wt="resources-hub">
        <ResourceHubModal isOpen onClose={() => {}} embedded onViewed={markResourcesViewed} />
      </div>
    </div>
  );
};

export default AdminResourcesPage;
