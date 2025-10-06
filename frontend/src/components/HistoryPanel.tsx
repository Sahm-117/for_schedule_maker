import React, { useState, useEffect } from 'react';
import { rejectedChangesApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { RejectedChange } from '../types';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'approved' | 'rejected';

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { rejectedChanges } = await rejectedChangesApi.getMine(user?.id);
      setRejectedChanges(rejectedChanges);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (changeId: string) => {
    try {
      await rejectedChangesApi.markRead(changeId);
      loadHistory(); // Refresh the list
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const getChangeDescription = (change: RejectedChange) => {
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

  const getStatusBadge = (change: RejectedChange) => {
    // For now, we only have rejected changes
    // In the future, this can be expanded to include approved changes
    return (
      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
        Rejected
      </span>
    );
  };

  const filteredChanges = rejectedChanges.filter((change) => {
    if (filter === 'all') return true;
    if (filter === 'rejected') return true; // All changes in this list are rejected
    // Future: Add logic for approved changes when we track them
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Change History</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex space-x-2 border-b border-gray-200">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === 'all'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === 'rejected'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Rejected
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === 'approved'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              disabled
            >
              Approved <span className="text-xs text-gray-400">(Coming Soon)</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-gray-500 mt-2">Loading history...</p>
            </div>
          ) : filteredChanges.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 text-lg">No history found</p>
              <p className="text-gray-400 text-sm mt-2">Your rejected changes will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredChanges.map((change) => (
                <div
                  key={change.id}
                  className={`border rounded-lg p-4 ${
                    change.isRead ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getStatusBadge(change)}
                        <span className="text-sm font-medium text-gray-900">
                          {change.changeType} Request
                        </span>
                        {!change.isRead && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            New
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 mb-2">
                        {getChangeDescription(change)}
                      </p>

                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">
                          <strong>Submitted:</strong> {new Date(change.submittedAt).toLocaleDateString()} at{' '}
                          {new Date(change.submittedAt).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          <strong>Rejected:</strong> {new Date(change.rejectedAt).toLocaleDateString()} at{' '}
                          {new Date(change.rejectedAt).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          <strong>Rejected by:</strong> {change.rejectedBy}
                        </p>
                        {change.rejectionReason && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-xs font-medium text-yellow-900">Reason:</p>
                            <p className="text-xs text-yellow-800 mt-1">{change.rejectionReason}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {!change.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(change.id)}
                        className="ml-4 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Mark as Read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <p className="text-sm text-gray-600">
            Showing {filteredChanges.length} {filter === 'all' ? 'total' : filter} change{filteredChanges.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;