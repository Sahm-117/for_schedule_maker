import React, { useEffect, useMemo, useState } from 'react';
import { pendingChangesApi } from '../services/api';
import type { PendingChange, Week } from '../types';
import ConfirmationModal from './ConfirmationModal';
import { buildPendingChangePreview, type ChangeSnapshot } from '../utils/pendingChangePreview';

interface PendingChangesPanelProps {
  pendingChanges: PendingChange[];
  onApprove: (changeIds?: string[]) => void;
  onReject: (changeIds?: string[]) => void;
  isAdmin: boolean;
  weeks?: Week[];
}

const getTypeStyles = (changeType: string): string => {
  switch (changeType) {
    case 'ADD':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'EDIT':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'DELETE':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const FieldRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="text-sm text-gray-700">
      <span className="font-medium text-gray-900">{label}:</span> {value}
    </div>
  );
};

const LabelChips: React.FC<{ labels: string[] }> = ({ labels }) => {
  if (!labels || labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {labels.map((label) => (
        <span key={label} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-800">
          {label}
        </span>
      ))}
    </div>
  );
};

const SnapshotBlock: React.FC<{ title: string; snapshot?: ChangeSnapshot; tone: 'before' | 'after' }> = ({
  title,
  snapshot,
  tone,
}) => {
  if (!snapshot) return null;

  const classes = tone === 'before'
    ? 'bg-red-50 border-red-200'
    : 'bg-green-50 border-green-200';

  return (
    <div className={`rounded-md border p-3 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">{title}</p>
      <div className="space-y-1">
        <FieldRow label="Time" value={snapshot.time} />
        <FieldRow label="Period" value={snapshot.period} />
        <FieldRow label="Description" value={snapshot.description} />
      </div>
      <LabelChips labels={snapshot.labels} />
    </div>
  );
};

const PendingChangesPanel: React.FC<PendingChangesPanelProps> = ({
  pendingChanges,
  onApprove,
  onReject,
  isAdmin,
  weeks = [],
}) => {
  const [visibleChanges, setVisibleChanges] = useState<PendingChange[]>(pendingChanges);
  const [loading, setLoading] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>('');
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRejectionReason, setBulkRejectionReason] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ mode: 'approve' | 'reject'; done: number; total: number } | null>(null);

  useEffect(() => {
    setVisibleChanges(pendingChanges);
  }, [pendingChanges]);

  const previews = useMemo(() => {
    return visibleChanges.map((change) => ({
      change,
      preview: buildPendingChangePreview(change, weeks),
    }));
  }, [visibleChanges, weeks]);

  const removeChangesByIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setVisibleChanges((prev) => prev.filter((change) => !ids.includes(change.id)));
  };

  const handleApprove = async (changeId: string) => {
    setLoading(changeId);
    setActionError('');
    try {
      await pendingChangesApi.approve(changeId);
      removeChangesByIds([changeId]);
      onApprove([changeId]);
    } catch (error) {
      console.error('Failed to approve change:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to approve change');
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (changeId: string) => {
    if (!rejectionReason.trim()) return;

    setLoading(changeId);
    setActionError('');
    try {
      await pendingChangesApi.reject(changeId, rejectionReason);
      removeChangesByIds([changeId]);
      setShowRejectModal(null);
      setRejectionReason('');
      onReject([changeId]);
    } catch (error) {
      console.error('Failed to reject change:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to reject change');
    } finally {
      setLoading(null);
    }
  };

  const handleApproveAll = async () => {
    if (visibleChanges.length === 0) return;
    setBulkLoading(true);
    setActionError('');
    setBulkProgress({ mode: 'approve', done: 0, total: visibleChanges.length });

    const approvedIds: string[] = [];

    try {
      for (let i = 0; i < visibleChanges.length; i += 1) {
        const change = visibleChanges[i];
        await pendingChangesApi.approve(change.id);
        approvedIds.push(change.id);
        removeChangesByIds([change.id]);
        setBulkProgress({ mode: 'approve', done: i + 1, total: visibleChanges.length });
      }
      onApprove(approvedIds);
    } catch (error) {
      console.error('Failed to approve all changes:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to approve all changes');
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
    }
  };

  const handleRejectAll = async () => {
    if (visibleChanges.length === 0 || !bulkRejectionReason.trim()) return;
    setBulkLoading(true);
    setActionError('');
    setBulkProgress({ mode: 'reject', done: 0, total: visibleChanges.length });

    const rejectedIds: string[] = [];

    try {
      for (let i = 0; i < visibleChanges.length; i += 1) {
        const change = visibleChanges[i];
        await pendingChangesApi.reject(change.id, bulkRejectionReason);
        rejectedIds.push(change.id);
        removeChangesByIds([change.id]);
        setBulkProgress({ mode: 'reject', done: i + 1, total: visibleChanges.length });
      }
      setBulkRejectionReason('');
      onReject(rejectedIds);
    } catch (error) {
      console.error('Failed to reject all changes:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to reject all changes');
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-orange-200">
      <div className="p-4 border-b border-orange-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Global Pending Inbox ({visibleChanges.length})
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Requests from all weeks appear here.
            </p>
            {bulkProgress && (
              <p className="text-xs text-gray-500 mt-1">
                {bulkProgress.mode === 'approve' ? 'Approving' : 'Rejecting'} {bulkProgress.done}/{bulkProgress.total}...
              </p>
            )}
          </div>

          {isAdmin && visibleChanges.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkApproveOpen(true)}
                disabled={bulkLoading}
                className="px-2 py-1 text-xs border border-green-300 text-green-700 bg-white rounded hover:bg-green-50 disabled:opacity-50"
                title="Approve all pending changes (requires confirmation)"
              >
                Approve All
              </button>
              <button
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkLoading}
                className="px-2 py-1 text-xs border border-red-300 text-red-700 bg-white rounded hover:bg-red-50 disabled:opacity-50"
                title="Reject all pending changes (requires confirmation)"
              >
                Reject All
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {actionError && (
          <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded">
            {actionError}
          </div>
        )}

        {previews.map(({ change, preview }) => (
          <div key={change.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${getTypeStyles(preview.type)}`}>
                    {preview.type}
                  </span>
                  {typeof preview.weekNumber === 'number' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-700">
                      Week {preview.weekNumber}
                    </span>
                  )}
                  {preview.dayName && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-700">
                      {preview.dayName}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-xs text-amber-700">
                    {preview.isMultiWeek
                      ? `Multi-week${preview.scopeWeeks.length > 0 ? ` (${preview.scopeWeeks.join(', ')})` : ''}`
                      : 'Single week'}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  by {preview.requesterName} • Submitted on {new Date(preview.submittedAt).toLocaleDateString()} at{' '}
                  {new Date(preview.submittedAt).toLocaleTimeString()}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SnapshotBlock title="Before" snapshot={preview.before} tone="before" />
                  <SnapshotBlock title="After" snapshot={preview.after} tone="after" />
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center space-x-2">
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

        {visibleChanges.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500">No pending changes</p>
          </div>
        )}
      </div>

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

      <ConfirmationModal
        isOpen={bulkApproveOpen}
        onClose={() => setBulkApproveOpen(false)}
        onConfirm={handleApproveAll}
        title="Approve All Changes"
        message={`This will approve and apply ${visibleChanges.length} pending change(s). Continue?`}
        confirmText={bulkLoading ? 'Approving...' : 'Approve All'}
        type="warning"
      />

      {bulkRejectOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Reject All Changes
              </h3>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  This will reject {visibleChanges.length} pending change(s). Provide a single reason that will be applied to all.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for rejection
                </label>
                <textarea
                  value={bulkRejectionReason}
                  onChange={(e) => setBulkRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  placeholder="Reason for rejecting all changes..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setBulkRejectOpen(false);
                    setBulkRejectionReason('');
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleRejectAll();
                    setBulkRejectOpen(false);
                  }}
                  disabled={!bulkRejectionReason.trim() || bulkLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkLoading ? 'Rejecting...' : 'Reject All'}
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
