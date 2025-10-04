import React, { useState } from 'react';
import type { RejectedChange } from '../types';
import { rejectedChangesApi } from '../services/api';

interface RejectedChangesNotificationProps {
  rejectedChanges: RejectedChange[];
  unreadCount: number;
  onUpdate: () => void;
}

const RejectedChangesNotification: React.FC<RejectedChangesNotificationProps> = ({
  rejectedChanges,
  unreadCount,
  onUpdate,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleMarkAllRead = async () => {
    try {
      await rejectedChangesApi.markAllRead();
      onUpdate();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleMarkRead = async (changeId: string) => {
    try {
      await rejectedChangesApi.markRead(changeId);
      onUpdate();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const unreadChanges = rejectedChanges.filter(change => !change.isRead);

  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4">
      <div className="flex">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <h3 className="text-sm font-medium text-red-800">
                {unreadCount} Change{unreadCount !== 1 ? 's' : ''} Rejected
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                {expanded ? 'Hide' : 'View'} Details
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Mark All Read
                </button>
              )}
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-2">
              {unreadChanges.map((change) => (
                <div key={change.id} className="bg-white p-3 rounded border border-red-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {change.changeType} Request Rejected
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Reason:</strong> {change.rejectionReason}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Rejected on {new Date(change.rejectedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleMarkRead(change.id)}
                      className="ml-3 text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Mark Read
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RejectedChangesNotification;