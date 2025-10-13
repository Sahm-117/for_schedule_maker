import React from 'react';

interface WelcomeModalProps {
  isOpen: boolean;
  userRole: 'ADMIN' | 'SUPPORT';
  userName: string;
  onStartTour: () => void;
  onSkipTour: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  userRole,
  userName,
  onStartTour,
  onSkipTour,
}) => {
  if (!isOpen) return null;

  const isAdmin = userRole === 'ADMIN';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideUp">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-6 rounded-t-2xl">
          <div className="flex items-center justify-center mb-4">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center animate-bounce-slow">
              <img src="/logo.png" alt="FOF Logo" className="w-16 h-16 object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">
            Welcome to FOF Schedule Manager!
          </h1>
          <p className="text-blue-100 text-center text-lg">
            Foundation of Faith Discipleship Program
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Greeting */}
          <div className="mb-6">
            <p className="text-xl text-gray-800 mb-2">
              Hi <span className="font-semibold text-blue-600">{userName}</span>! 👋
            </p>
            <p className="text-gray-600 leading-relaxed">
              Welcome to the schedule manager for the 8-week Foundation of Faith (FOF)
              discipleship program at Covenant Nation Ikorodu.
            </p>
          </div>

          {/* Role-specific features */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 mb-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`px-4 py-2 rounded-full font-semibold text-sm ${
                isAdmin
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-600 text-white'
              }`}>
                {isAdmin ? '👑 ADMIN' : '🤝 SUPPORT'}
              </div>
              <h2 className="text-lg font-bold text-gray-800">
                What you can do:
              </h2>
            </div>

            <div className="space-y-3">
              {isAdmin ? (
                <>
                  <Feature icon="✅" text="Manage all 8 weeks of FOF schedules" />
                  <Feature icon="⚡" text="Create, edit, and delete activities instantly" />
                  <Feature icon="🔄" text="Apply activities across multiple weeks at once" />
                  <Feature icon="🎨" text="Tag teams to activities with custom colors" />
                  <Feature icon="⚖️" text="Review & approve change requests from Support users" />
                  <Feature icon="📄" text="Export schedules as PDF (single week or all 8)" />
                  <Feature icon="👥" text="Manage users, teams, and permissions" />
                </>
              ) : (
                <>
                  <Feature icon="👀" text="View all 8 weeks of FOF schedules" />
                  <Feature icon="📝" text="Submit change requests (add/edit/delete activities)" />
                  <Feature icon="📬" text="Track your pending changes awaiting approval" />
                  <Feature icon="💡" text="See rejection feedback to improve submissions" />
                  <Feature icon="🔍" text="Search activities across all weeks" />
                  <Feature icon="📄" text="Export schedules as PDF for offline viewing" />
                </>
              )}
            </div>
          </div>

          {/* Tour info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">
                  Quick Interactive Tour
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  We'll walk you through the key features with an interactive guide.
                  It takes about <strong>2 minutes</strong> and will help you get started quickly.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onSkipTour}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Skip Tour
            </button>
            <button
              onClick={onStartTour}
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              Take the Tour (Recommended) 🚀
            </button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-gray-500 text-center mt-4">
            You can replay this tour anytime from your profile menu
          </p>
        </div>
      </div>
    </div>
  );
};

// Feature component for cleaner rendering
const Feature: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="flex items-start gap-3">
    <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
    <span className="text-gray-700 leading-relaxed">{text}</span>
  </div>
);

export default WelcomeModal;
