import React, { useState, useEffect, useCallback } from 'react';

interface OnboardingStep {
  target: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
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
      title: 'Week Selection',
      content: 'Select different weeks to view and manage their schedules. You can switch between weeks at any time.',
      position: 'right',
    },
    {
      target: '.add-activity-btn',
      title: 'Add Activities',
      content: 'Click here to add new activities to the schedule. Activities are organized by time periods (Morning, Afternoon, Evening).',
      position: 'bottom',
    },
    {
      target: '.add-cross-week-btn',
      title: 'Cross-Week Activities',
      content: 'Use this button to add the same activity across multiple weeks at once. Great for recurring activities!',
      position: 'bottom',
    },
    {
      target: '.activity-card',
      title: 'Manage Activities',
      content: 'Each activity card shows the time and description. Click the edit or delete icons. When editing/deleting, you can apply changes to multiple weeks.',
      position: 'top',
    },
    {
      target: '.pending-changes-panel',
      title: 'Pending Changes',
      content: 'Review changes submitted by Support users here. You can approve or reject each change with optional comments.',
      position: 'left',
    },
    {
      target: '.user-management-btn',
      title: 'User Management',
      content: 'As an admin, you can create new users, manage roles, and delete users from here.',
      position: 'bottom',
    },
    {
      target: '.export-btn',
      title: 'Export Schedule',
      content: 'Export the schedule as a PDF for printing or sharing offline.',
      position: 'bottom',
    },
  ];

  const supportSteps: OnboardingStep[] = [
    {
      target: '.week-selector',
      title: 'Week Selection',
      content: 'Select different weeks to view their schedules. You can switch between weeks at any time.',
      position: 'right',
    },
    {
      target: '.add-activity-btn',
      title: 'Submit Changes',
      content: 'Click here to suggest new activities. Your changes will be submitted for admin approval.',
      position: 'bottom',
    },
    {
      target: '.activity-card',
      title: 'Edit Activities',
      content: 'Click the edit icon on any activity to suggest changes. Your modifications will be sent to admins for review.',
      position: 'top',
    },
    {
      target: '.history-btn',
      title: 'Rejected Changes',
      content: 'If your changes are rejected, click the History button to see the rejection reason. Review feedback to understand what needs improvement.',
      position: 'bottom',
    },
    {
      target: '.export-btn',
      title: 'Export Schedule',
      content: 'Export the current week\'s schedule as a PDF for offline viewing or printing.',
      position: 'bottom',
    },
  ];

  const steps = userRole === 'ADMIN' ? adminSteps : supportSteps;

  const calculateTooltipPosition = useCallback((step: OnboardingStep) => {
    const element = document.querySelector(step.target);
    if (!element) return { top: 0, left: 0 };

    const rect = element.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;
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
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />

      {/* Spotlight effect */}
      {targetElement && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            top: targetElement.getBoundingClientRect().top - 8,
            left: targetElement.getBoundingClientRect().left - 8,
            width: targetElement.getBoundingClientRect().width + 16,
            height: targetElement.getBoundingClientRect().height + 16,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            borderRadius: '8px',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-2xl p-6 w-80 transition-all duration-300"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
      >
        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index <= currentStep ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {currentStepData.title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {currentStepData.content}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>

        {/* Step counter */}
        <div className="text-center mt-4 text-xs text-gray-500">
          Step {currentStep + 1} of {steps.length}
        </div>
      </div>
    </>
  );
};

export default OnboardingWalkthrough;
