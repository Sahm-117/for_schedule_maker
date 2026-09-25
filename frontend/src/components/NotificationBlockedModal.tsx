import React from 'react';

interface Props {
  onDismiss: () => void;
}

// Shown instead of NotificationPromptModal when the browser has notifications
// switched off for this site (Notification.permission === 'denied'). We can't
// ask again from JS at that point, so this just explains where to turn it back
// on. Same shell/spacing as NotificationPromptModal, shared by the staff app
// (AppShell) and the participant app (ParticipantShell).
const NotificationBlockedModal: React.FC<Props> = ({ onDismiss }) => (
  <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
      <div className="bg-gray-700 px-6 pt-6 pb-5 text-white text-center">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.63 13A17.89 17.89 0 0 1 18 8a6 6 0 0 0-9.33-5M6.26 6.26A5.99 5.99 0 0 0 6 8v5a2.03 2.03 0 0 1-.6 1.4L4 16h11m0 0v1a3 3 0 0 1-5.83 1M4 4l16 16" />
          </svg>
        </div>
        <h2 className="text-lg font-bold">Notifications are blocked</h2>
        <p className="text-sm text-white/80 mt-1">You won&apos;t get updates from FOF Ops until this is turned back on</p>
      </div>

      <div className="px-6 py-5">
        <ul className="space-y-3 mb-6 text-sm text-gray-700">
          <li>
            <span className="font-semibold text-gray-900">iPhone:</span> Settings › Notifications › FOF, then turn notifications on.
          </li>
          <li>
            <span className="font-semibold text-gray-900">Android / Chrome:</span> tap the lock icon next to the web address, then Notifications › Allow.
          </li>
        </ul>

        <button
          onClick={onDismiss}
          className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-sm"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
);

export default NotificationBlockedModal;
