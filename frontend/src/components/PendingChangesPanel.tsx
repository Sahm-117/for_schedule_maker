import React, { useState } from 'react';
import { pendingChangesApi } from '../services/api';
import type { PendingChange } from '../types';

interface PendingChangesPanelProps {
  pendingChanges: PendingChange[];
  onApprove: () => void;
  onReject: () => void;
  isAdmin: boolean;
}

const PendingChangesPanel: React.FC<PendingChangesPanelProps> = ({
  pendingChanges,
  onApprove,
  onReject,
  isAdmin,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const handleApprove = async (changeId: string) => {
    setLoading(changeId);
    try {
      await pendingChangesApi.approve(changeId);
      onApprove();
    } catch (error) {
      console.error('Failed to approve change:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (changeId: string) => {
    if (!rejectionReason.trim()) return;

    setLoading(changeId);
    try {
      await pendingChangesApi.reject(changeId, rejectionReason);
      setShowRejectModal(null);
      setRejectionReason('');
      onReject();
    } catch (error) {
      console.error('Failed to reject change:', error);
    } finally {
      setLoading(null);
    }
  };

  const getChangeDescription = (change: PendingChange) => {
    const { changeType, changeData } = change;

    switch (changeType) {
      case 'ADD':
        return `Add new activity: ${changeData.time} - ${changeData.description}`;
      case 'EDIT':
        return `Edit activity: ${changeData.description || 'Activity details'}`;
      case 'DELETE':
        return `Delete activity: ${changeData.description || 'Activity'}`;
      default:
        return 'Unknown change';
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'ADD':
        return (
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        );
      case 'EDIT':
        return (
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'DELETE':
        return (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zm2 6a1 1 0 011 1v.01a1 1 0 11-2 0V14a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Pending Changes ({pendingChanges.length})
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {pendingChanges.map((change) => (
          <div key={change.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  {getChangeIcon(change.changeType)}
                  <span className="text-sm font-medium text-gray-900">
                    {change.changeType} Request
                  </span>
                  <span className="text-xs text-gray-500">
                    by {change.user?.name ?? 'Unknown user'}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mb-2">
                  {getChangeDescription(change)}
                </p>

                <p className="text-xs text-gray-500">
                  Submitted on {new Date(change.createdAt).toLocaleDateString()} at{' '}
                  {new Date(change.createdAt).toLocaleTimeString()}
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleApprove(change.id)}
                    disabled={loading === change.id}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading === change.id ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setShowRejectModal(change.id)}
                    disabled={loading === change.id}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {pendingChanges.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500">No pending changes</p>
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Reject Change Request
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for rejection
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  placeholder="Please provide a reason for rejecting this change..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(showRejectModal)}
                  disabled={!rejectionReason.trim() || loading === showRejectModal}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading === showRejectModal ? 'Rejecting...' : 'Reject Change'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingChangesPanel;
