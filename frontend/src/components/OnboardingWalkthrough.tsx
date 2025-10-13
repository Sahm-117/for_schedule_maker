import React, { useState, useEffect, useCallback } from 'react';

interface OnboardingStep {
  target: string;
  title: string;
  content: string;
  tip?: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  icon?: string;
}

interface OnboardingWalkthroughProps {
  isOpen: boolean;
  onComplete: () => void;
  userRole: 'ADMIN' | 'SUPPORT';
}

const OnboardingWalkthrough: React.FC<OnboardingWalkthroughProps> = ({
  isOpen,
  onComplete,
  userRole,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const adminSteps: OnboardingStep[] = [
    {
      target: '.week-selector',
      title: 'Week Navigation',
      content: 'FOF is an 8-week program. Select any week to view or edit its schedule. Your last viewed week is automatically saved for next time.',
      tip: 'Click any week number to switch between weeks',
      position: 'right',
      icon: '📅',
    },
    {
      target: '.search-bar',
      title: 'Global Search',
      content: 'Need to find a specific activity? Use the search bar to search across all weeks instantly. Results show the week, day, and time.',
      tip: 'Try searching for keywords like "prayer" or "worship"',
      position: 'bottom',
      icon: '🔍',
    },
    {
      target: '.add-activity-btn',
      title: 'Add Single Activity',
      content: 'Add activities to any day with a specific time and description. Tag teams with colors to organize responsibilities. Your changes are instant!',
      tip: 'Activities are auto-organized by time periods',
      position: 'bottom',
      icon: '➕',
    },
    {
      target: '.add-cross-week-btn',
      title: 'Cross-Week Magic',
      content: 'Need the same activity in multiple weeks? This powerful feature creates identical activities across selected weeks in one click!',
      tip: 'Perfect for recurring events like devotions or meals',
      position: 'bottom',
      icon: '⭐',
    },
    {
      target: '.activity-card',
      title: 'Edit & Manage Activities',
      content: 'Click edit or delete on any activity card. Choose to update or delete across multiple weeks, or just modify this single week.',
      tip: 'The system detects duplicates across weeks automatically',
      position: 'top',
      icon: '✏️',
    },
    {
      target: '.team-badge',
      title: 'Team Color Tagging',
      content: 'Tag activities with teams (e.g., Ushers, Tech, Kitchen). Each team has a custom color. Multiple teams can be assigned to one activity.',
      tip: 'Manage teams from the header menu',
      position: 'top',
      icon: '🎨',
    },
    {
      target: '.pending-changes-panel',
      title: 'Approval Dashboard',
      content: 'Support users submit change requests here. Review each change and approve to apply it instantly, or reject with feedback to help them improve.',
      tip: 'Orange badge shows pending count',
      position: 'left',
      icon: '⚖️',
    },
    {
      target: '.history-btn',
      title: 'Change History',
      content: 'Track all approved and rejected changes. See who made what changes, when they were made, and any rejection reasons provided.',
      tip: 'Great for auditing and accountability',
      position: 'bottom',
      icon: '📜',
    },
    {
      target: '.user-management-btn',
      title: 'User Management',
      content: 'Create Support users, assign roles, and control access. The System Admin account is protected and cannot be deleted for security.',
      tip: 'Each user gets their own login credentials',
      position: 'bottom',
      icon: '👥',
    },
    {
      target: '.export-btn',
      title: 'Export & Share',
      content: 'Export single weeks or all 8 weeks at once as a professional PDF. Perfect for printing, sharing offline, or distributing to team members.',
      tip: 'PDFs include all team tags with colors',
      position: 'bottom',
      icon: '📄',
    },
  ];

  const supportSteps: OnboardingStep[] = [
    {
      target: '.week-selector',
      title: 'Week Navigation',
      content: 'FOF is an 8-week program. Browse all weeks to see the complete schedule. Your last viewed week is saved for easy access next time.',
      tip: 'Click any week to view its schedule',
      position: 'right',
      icon: '📅',
    },
    {
      target: '.search-bar',
      title: 'Quick Search',
      content: 'Search for any activity across all 8 weeks instantly. Click a search result to jump directly to that activity with highlighting.',
      tip: 'Results show week, day, time, and description',
      position: 'bottom',
      icon: '🔍',
    },
    {
      target: '.add-activity-btn',
      title: 'Submit New Activity',
      content: 'Want to add an activity? Click here to submit a request. Your changes go to admins for approval—think of it as making a helpful suggestion!',
      tip: 'Include clear descriptions for faster approval',
      position: 'bottom',
      icon: '📝',
    },
    {
      target: '.activity-card',
      title: 'Edit Request',
      content: 'Click edit on any activity to suggest changes. Admins will review your suggestion and either approve it or provide feedback on improvements.',
      tip: 'Be specific about why changes are needed',
      position: 'top',
      icon: '✏️',
    },
    {
      target: '.pending-changes-badge',
      title: 'Track Your Requests',
      content: 'See your pending requests here. The orange badge shows the count. Wait for admin approval before they go live in the schedule.',
      tip: 'You can view all pending changes in the panel',
      position: 'bottom',
      icon: '📬',
    },
    {
      target: '.rejected-changes-notification',
      title: 'Learn from Feedback',
      content: 'If a request is rejected, you\'ll see a notification with the reason. Use this feedback to understand what needs improvement for future submissions.',
      tip: 'Rejected changes help you learn admin preferences',
      position: 'bottom',
      icon: '💡',
    },
    {
      target: '.history-btn',
      title: 'Review History',
      content: 'Access all your rejected changes here with detailed reasons. Understanding feedback helps you make better change requests going forward.',
      tip: 'Red badge indicates unread rejections',
      position: 'bottom',
      icon: '📜',
    },
    {
      target: '.export-btn',
      title: 'Export Schedule',
      content: 'Export the current week as a PDF for offline viewing, printing, or sharing with your team members who don\'t have system access.',
      tip: 'Great for field reference during events',
      position: 'bottom',
      icon: '📄',
    },
  ];

  const steps = userRole === 'ADMIN' ? adminSteps : supportSteps;

  const calculateTooltipPosition = useCallback((step: OnboardingStep) => {
    const element = document.querySelector(step.target);
    if (!element) return { top: 0, left: 0 };

    const rect = element.getBoundingClientRect();
    const tooltipWidth = 380;
    const tooltipHeight = 280;
    const offset = 20;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'top':
        top = rect.top - tooltipHeight - offset;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - offset;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + offset;
        break;
    }

    // Ensure tooltip stays within viewport
    top = Math.max(20, Math.min(top, window.innerHeight - tooltipHeight - 20));
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipWidth - 20));

    return { top, left };
  }, []);

  useEffect(() => {
    if (isOpen && steps[currentStep]) {
      const updatePosition = () => {
        const position = calculateTooltipPosition(steps[currentStep]);
        setTooltipPosition(position);
      };

      // Initial position
      setTimeout(updatePosition, 100);

      // Update on resize
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
  }, [isOpen, currentStep, steps, calculateTooltipPosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  if (!currentStepData) return null;

  // Highlight the target element
  const targetElement = document.querySelector(currentStepData.target);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] animate-fadeIn" />

      {/* Spotlight effect with animated pulse ring */}
      {targetElement && (
        <>
          <div
            className="fixed z-[70] pointer-events-none transition-all duration-500 ease-out"
            style={{
              top: targetElement.getBoundingClientRect().top - 8,
              left: targetElement.getBoundingClientRect().left - 8,
              width: targetElement.getBoundingClientRect().width + 16,
              height: targetElement.getBoundingClientRect().height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              borderRadius: '8px',
            }}
          />
          {/* Animated pulse ring */}
          <div
            className="fixed z-[65] pointer-events-none animate-pulse-ring"
            style={{
              top: targetElement.getBoundingClientRect().top - 12,
              left: targetElement.getBoundingClientRect().left - 12,
              width: targetElement.getBoundingClientRect().width + 24,
              height: targetElement.getBoundingClientRect().height + 24,
              border: '3px solid rgba(59, 130, 246, 0.6)',
              borderRadius: '12px',
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[80] bg-white rounded-xl shadow-2xl p-6 w-[380px] transition-all duration-300 animate-slideUp"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
      >
        {/* Progress indicator - Circular style */}
        <div className="flex gap-1.5 mb-5">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'bg-blue-600 scale-110'
                  : index < currentStep
                  ? 'bg-blue-400'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step indicator badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentStepData.icon}</span>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              Step {currentStep + 1} of {steps.length}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="mb-5">
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            {currentStepData.title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            {currentStepData.content}
          </p>

          {/* Tip section */}
          {currentStepData.tip && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <span className="text-base flex-shrink-0">💡</span>
              <p className="text-xs text-gray-700 leading-relaxed">
                <strong className="font-semibold">Tip:</strong> {currentStepData.tip}
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors font-medium"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 shadow-md hover:shadow-lg"
            >
              {currentStep === steps.length - 1 ? 'Finish 🎉' : `Next →`}
            </button>
          </div>
        </div>

        {/* Interactive prompt */}
        {targetElement && (
          <div className="text-center mt-3">
            <p className="text-xs text-gray-500 animate-bounce">
              👆 Try interacting with the highlighted element!
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default OnboardingWalkthrough;
