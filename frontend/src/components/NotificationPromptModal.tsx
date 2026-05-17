import React from 'react';

interface Props {
  onEnable: () => void;
  onDismiss: () => void;
}

const NotificationPromptModal: React.FC<Props> = ({ onEnable, onDismiss }) => (
  <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
      {/* Orange header strip */}
      <div className="bg-primary px-6 pt-6 pb-5 text-white text-center">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h2 className="text-lg font-bold">Stay in the loop</h2>
        <p className="text-sm text-white/80 mt-1">Enable notifications for FOF IKD Ops</p>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        <ul className="space-y-3 mb-6">
          {[
            { icon: '📅', text: 'Know instantly when the programme schedule changes' },
            { icon: '✅', text: 'Get notified when your change requests are approved' },
            { icon: '📢', text: 'Receive announcements from the programme team' },
            { icon: '📎', text: 'Be the first to see new resources in the hub' },
          ].map(({ icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-gray-700">
              <span className="text-base leading-tight">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onEnable}
          className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-sm"
        >
          Enable notifications
        </button>
        <button
          onClick={onDismiss}
          className="w-full py-2.5 mt-2 text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  </div>
);

export default NotificationPromptModal;
