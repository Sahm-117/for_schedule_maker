import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LabelChip from '../components/LabelChip';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { usersApi } from '../services/api';
import type { Label } from '../types';
import NotificationSettings from '../components/NotificationSettings';
import { useAuth } from '../hooks/useAuth';
import { useWalkthrough } from '../hooks/useWalkthrough';
import WalkthroughPopup from '../components/walkthrough/WalkthroughPopup';

const SupportProfilePage: React.FC = () => {
  const { user, userLabelIds } = useAuth();
  const [activityTags, setActivityTags] = useState<Label[]>([]);
  const { liveRevision } = useAppData();
  const wt = useWalkthrough('profile');

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/settings" replace />;
  }

  useEffect(() => {
    usersApi.getUserLabels(user.id)
      .then((response) => setActivityTags(response.labels))
      .catch(() => setActivityTags([]));
  }, [liveRevision, user.id]);

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, activity tags, and how you want to receive reminders."
        onHelp={wt.reopen}
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div data-wt="profile-groups" className="surface-card p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-2xl font-bold text-primary">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{user.name}</h3>
              <p className="text-sm text-gray-500">{user.email || user.phone || 'No contact detail'}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <InfoRow label="Role" value={user.role} />
            <InfoRow
              label="Activity tags"
              value={userLabelIds.length === 0 ? 'None assigned' : undefined}
              content={activityTags.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {activityTags.map((tag) => (
                    <LabelChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                  ))}
                </div>
              ) : undefined}
            />
          </div>
        </div>

        <div data-wt="profile-notifications">
          <NotificationSettings isOpen onClose={() => {}} embedded />
        </div>
      </div>

      {wt.show && (
        <WalkthroughPopup
          steps={[
            { targetSelector: '[data-wt="profile-groups"]', title: 'Your activity tags', body: 'These are the tags assigned to you. Your schedule and activities are filtered to these tags.', position: 'top' },
            { targetSelector: '[data-wt="profile-notifications"]', title: 'Reminder alerts', body: 'Set up reminder alerts here so you never miss a follow-up.', position: 'top' },
          ]}
          onDone={wt.done}
          onSkip={wt.skipAll}
        />
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value?: string; content?: React.ReactNode }> = ({ label, value, content }) => (
  <div className="surface-muted flex items-center justify-between px-4 py-3">
    <span className="text-sm text-gray-500">{label}</span>
    {content || <span className="text-sm font-semibold text-gray-900">{value}</span>}
  </div>
);

export default SupportProfilePage;
