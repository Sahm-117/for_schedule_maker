import React from 'react';
import type { Week } from '../types';

interface WeekSelectorProps {
  weeks: Week[];
  selectedWeek: Week | null;
  onWeekSelect: (weekId: number) => void;
}

const WeekSelector: React.FC<WeekSelectorProps> = ({
  weeks,
  selectedWeek,
  onWeekSelect,
}) => {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-3 sm:p-4 border-b border-gray-200">
        <h2 className="text-base sm:text-lg font-medium text-gray-900">Program Weeks</h2>
        <p className="text-xs sm:text-sm text-gray-500">Select a week to view schedule</p>
      </div>

      <div className="p-3 sm:p-4">
        {/* Mobile Dropdown */}
        <div className="block sm:hidden">
          <select
            value={selectedWeek?.id || ''}
            onChange={(e) => onWeekSelect(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary bg-white"
          >
            <option value="" disabled>Select a week</option>
            {weeks.map((week) => (
              <option key={week.id} value={week.id}>
                Week {week.weekNumber} ({week.days.length} days)
              </option>
            ))}
          </select>
        </div>

        {/* Desktop List */}
        <div className="hidden sm:block space-y-2">
          {weeks.map((week) => (
            <button
              key={week.id}
              onClick={() => onWeekSelect(week.id)}
              className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg border transition-colors ${
                selectedWeek?.id === week.id
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base">Week {week.weekNumber}</span>
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <span className="text-xs text-gray-500">
                    {week.days.length} days
                  </span>
                  {selectedWeek?.id === week.id && (
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {weeks.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-sm">No weeks available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeekSelector;