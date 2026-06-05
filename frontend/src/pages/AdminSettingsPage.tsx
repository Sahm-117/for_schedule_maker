import React from 'react';
import PageHeader from '../components/PageHeader';
import LabelManagement from '../components/LabelManagement';
import NotificationSettings from '../components/NotificationSettings';
import { useAppData } from '../context/AppDataContext';

const AdminSettingsPage: React.FC = () => {
  const {
    digestEnabled,
    digestToggleLoading,
    digestSending,
    digestStatus,
    digestActionLabel,
    handleToggleDigest,
    handleSendDigestNow,
  } = useAppData();

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Control digest behavior, notification timings, and support groups."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="surface-card p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Daily Digest</h3>
              <p className="mt-1 text-sm text-gray-500">Controls the Telegram digest workflow without changing backend contracts.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleToggleDigest();
              }}
              disabled={digestToggleLoading}
              className={`relative inline-flex h-8 w-14 items-center rounded-full ${digestEnabled ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white transition-transform ${digestEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleSendDigestNow();
            }}
            disabled={digestSending || (!digestEnabled && digestActionLabel !== 'Restart Digest')}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-green-600 px-4 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            {digestSending ? 'Working…' : digestActionLabel}
          </button>
          {digestStatus && (
            <p className={`mt-4 text-sm ${digestStatus.toLowerCase().includes('failed') ? 'text-red-600' : 'text-gray-600'}`}>
              {digestStatus}
            </p>
          )}
        </div>

        <NotificationSettings isOpen onClose={() => {}} embedded />
      </div>

      <LabelManagement isOpen onClose={() => {}} embedded />
    </div>
  );
};

export default AdminSettingsPage;
