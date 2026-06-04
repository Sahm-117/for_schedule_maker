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
        subtitle="Share links, upload files, and keep the team aligned with the latest materials."
      />
      <ResourceHubModal isOpen onClose={() => {}} embedded onViewed={markResourcesViewed} />
    </div>
  );
};

export default AdminResourcesPage;
