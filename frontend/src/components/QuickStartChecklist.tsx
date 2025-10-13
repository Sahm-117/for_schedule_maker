import React, { useState, useEffect } from 'react';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

interface QuickStartChecklistProps {
  userRole: 'ADMIN' | 'SUPPORT';
  onReplayTour: () => void;
}

const QuickStartChecklist: React.FC<QuickStartChecklistProps> = ({
  userRole,
  onReplayTour,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([]);

  const adminItems: ChecklistItem[] = [
    { id: 'create-activity', label: 'Create your first activity', completed: false },
    { id: 'cross-week-activity', label: 'Add an activity across 3+ weeks', completed: false },
    { id: 'create-team', label: 'Create a team with a color', completed: false },
    { id: 'tag-activity', label: 'Tag an activity with a team', completed: false },
    { id: 'export-pdf', label: 'Export a week as PDF', completed: false },
  ];

  const supportItems: ChecklistItem[] = [
    { id: 'browse-weeks', label: 'Browse all 8 weeks', completed: false },
    { id: 'submit-request', label: 'Submit your first change request', completed: false },
    { id: 'use-search', label: 'Use the search bar', completed: false },
    { id: 'export-pdf', label: 'Export a schedule as PDF', completed: false },
  ];

  useEffect(() => {
    // Load checklist state from localStorage
    const savedState = localStorage.getItem('quickStartChecklist');
    const savedDismissed = localStorage.getItem('quickStartDismissed');

    if (savedDismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setItems(parsed);
      } catch (error) {
        console.error('Failed to parse checklist state:', error);
        setItems(userRole === 'ADMIN' ? adminItems : supportItems);
      }
    } else {
      setItems(userRole === 'ADMIN' ? adminItems : supportItems);
    }
  }, [userRole]);

  useEffect(() => {
    // Save checklist state to localStorage
    if (items.length > 0 && !isDismissed) {
      localStorage.setItem('quickStartChecklist', JSON.stringify(items));
    }
  }, [items, isDismissed]);

  const handleToggleItem = (id: string) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handleDismiss = () => {
    if (window.confirm('Are you sure you want to permanently dismiss this checklist? You can always replay the tour from your profile menu.')) {
      setIsDismissed(true);
      localStorage.setItem('quickStartDismissed', 'true');
      localStorage.removeItem('quickStartChecklist');
    }
  };

  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progressPercentage = (completedCount / totalCount) * 100;
  const allCompleted = completedCount === totalCount;

  if (isDismissed) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 transition-all duration-300 ${
        isMinimized ? 'w-64' : 'w-80'
      }`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h3 className="font-semibold text-sm">Quick Start Checklist</h3>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="hover:bg-white/20 rounded p-1 transition-colors"
          aria-label={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-4">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span className="font-medium">
                {completedCount} of {totalCount} completed
              </span>
              <span className="font-semibold text-blue-600">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Checklist items */}
          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggleItem(item.id)}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span
                  className={`text-sm leading-relaxed transition-all ${
                    item.completed
                      ? 'text-gray-400 line-through'
                      : 'text-gray-700 group-hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {/* Completion message */}
          {allCompleted && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 animate-slideUp">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-xl">🎉</span>
                <p className="text-sm font-medium">
                  Great job! You've completed all quick start tasks!
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
            <button
              onClick={onReplayTour}
              className="flex-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              🔄 Replay Tour
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-gray-500 text-center mt-3">
            Progress saved automatically
          </p>
        </div>
      )}

      {/* Minimized view */}
      {isMinimized && (
        <div className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {completedCount}/{totalCount}
            </span>
            <div className="flex items-center gap-1">
              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickStartChecklist;
