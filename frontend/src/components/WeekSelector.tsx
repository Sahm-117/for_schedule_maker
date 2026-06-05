import React from 'react';
import type { Week } from '../types';
import AppSelect from './AppSelect';

interface WeekSelectorProps {
  weeks: Week[];
  selectedWeek: Week | null;
  onWeekSelect: (weekId: number) => void;
  compact?: boolean;
}

const WeekSelector: React.FC<WeekSelectorProps> = ({
  weeks,
  selectedWeek,
  onWeekSelect,
  compact = false,
}) => {
  const options = weeks.map((week) => ({
    value: String(week.id),
    label: `Week ${week.weekNumber}`,
    meta: `${week.days.length} days`,
  }));

  return (
    <div className={`bg-white shadow ${compact ? 'rounded-3xl border border-orange-100' : 'rounded-lg'}`}>
      <div className={`${compact ? 'border-b border-orange-100 px-4 py-4' : 'border-b border-gray-200 p-3 sm:p-4'}`}>
        <h2 className={`${compact ? 'text-sm font-semibold uppercase tracking-[0.12em] text-gray-500' : 'text-base sm:text-lg font-medium text-gray-900'}`}>
          {compact ? 'Week Focus' : 'Program Weeks'}
        </h2>
        <p className={`${compact ? 'mt-1 text-sm font-semibold text-gray-900' : 'text-xs sm:text-sm text-gray-500'}`}>
          {compact ? 'Choose the week you want to manage.' : 'Select a week to view schedule'}
        </p>
      </div>

      <div className={`${compact ? 'p-4' : 'p-3 sm:p-4'}`}>
        <div className={compact ? 'block' : 'block sm:hidden'}>
          <AppSelect
            value={selectedWeek ? String(selectedWeek.id) : ''}
            onChange={(nextValue) => onWeekSelect(parseInt(nextValue, 10))}
            options={options}
            placeholder="Select a week"
            compact={compact}
          />
        </div>

        <div className={`${compact ? 'mt-4 hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-3' : 'hidden sm:block space-y-2'}`}>
          {weeks.map((week) => (
            <button
              key={week.id}
              onClick={() => onWeekSelect(week.id)}
              className={`w-full text-left transition-colors ${
                selectedWeek?.id === week.id
                  ? compact
                    ? 'rounded-2xl border border-primary bg-primary text-white shadow-lg shadow-orange-200/50'
                    : 'rounded-lg border border-primary bg-primary/5 text-primary font-medium'
                  : compact
                    ? 'rounded-2xl border border-orange-100 bg-orange-50/35 text-gray-700 hover:border-orange-200 hover:bg-orange-50'
                    : 'rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className={`flex items-center justify-between ${compact ? 'px-3 py-3' : 'px-3 sm:px-4 py-2 sm:py-3'}`}>
                <span className={compact ? 'text-sm font-semibold' : 'text-sm sm:text-base'}>Week {week.weekNumber}</span>
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <span className={`text-xs ${selectedWeek?.id === week.id && compact ? 'text-white/80' : 'text-gray-500'}`}>
                    {week.days.length} days
                  </span>
                  {selectedWeek?.id === week.id && (
                    <svg className={`w-3 h-3 sm:w-4 sm:h-4 ${compact ? 'text-white' : 'text-primary'}`} fill="currentColor" viewBox="0 0 20 20">
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
