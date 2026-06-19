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
        subtitle="Share links and files with the support team."
      />
      <ResourceHubModal isOpen onClose={() => {}} embedded onViewed={markResourcesViewed} />
    </div>
  );
};

export default AdminResourcesPage;
