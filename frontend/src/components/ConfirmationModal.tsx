import React, { useState } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: '⚠️',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: '⚠️',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      confirmBtn: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    },
    info: {
      icon: 'ℹ️',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const styles = typeStyles[type];

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center mb-4">
            <div className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mr-4`}>
              <span className={`text-2xl ${styles.iconColor}`}>
                {styles.icon}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {title}
              </h3>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-gray-600 text-sm leading-relaxed">
              {message}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:justify-end">
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await onConfirm();
                  onClose();
                } catch (error) {
                  console.error('Confirmation action failed:', error);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className={`w-full sm:w-auto px-4 py-2 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 ${styles.confirmBtn}`}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {loading ? 'Processing' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;