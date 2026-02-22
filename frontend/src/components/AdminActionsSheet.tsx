import React from 'react';

interface AdminActionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  digestEnabled: boolean;
  digestToggleLoading: boolean;
  digestSending: boolean;
  digestActionLabel: 'Send Digest Now' | 'Restart Digest';
  onToggleDigest: () => void;
  onSendDigestNow: () => void;
  onOpenLabels: () => void;
  onOpenUsers: () => void;
}

const AdminActionsSheet: React.FC<AdminActionsSheetProps> = ({
  isOpen,
  onClose,
  digestEnabled,
  digestToggleLoading,
  digestSending,
  digestActionLabel,
  onToggleDigest,
  onSendDigestNow,
  onOpenLabels,
  onOpenUsers,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close admin actions"
      />

      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl border-t border-gray-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Admin Actions</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Daily Digest</p>
              <p className="text-xs text-gray-500">Controls scheduled morning digest sends.</p>
            </div>
            <button
              type="button"
              onClick={onToggleDigest}
              disabled={digestToggleLoading}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                digestEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
              aria-label="Toggle daily digest"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  digestEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={onSendDigestNow}
            disabled={digestSending || (!digestEnabled && digestActionLabel !== 'Restart Digest')}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            {digestSending
              ? (digestActionLabel === 'Restart Digest' ? 'Restarting Digest...' : 'Sending Digest...')
              : digestActionLabel}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenLabels();
              onClose();
            }}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-lg border border-primary text-primary hover:bg-primary/5"
          >
            Manage Labels
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenUsers();
              onClose();
            }}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-lg border border-primary text-primary hover:bg-primary/5"
          >
            Manage Users
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminActionsSheet;
