import React from 'react';
import type { Week } from '../types';
import AppSelect from './AppSelect';

interface WeekSelectorProps {
  weeks: Week[];
  selectedWeek: Week | null;
  onWeekSelect: (weekId: number) => void;
  compact?: boolean;
  className?: string;
}

const WeekSelector: React.FC<WeekSelectorProps> = ({
  weeks,
  selectedWeek,
  onWeekSelect,
  compact = false,
  className = '',
}) => {
  const options = weeks.map((week) => ({
    value: String(week.id),
    label: `Week ${week.weekNumber}`,
    meta: `${week.days.length} days`,
  }));

  return (
    <div className={`bg-white shadow ${compact ? 'rounded-3xl border border-orange-100' : 'rounded-lg'} ${className}`}>
      <div className={`${compact ? 'border-b border-orange-100 px-4 py-4' : 'border-b border-gray-200 p-3 sm:p-4'}`}>
        <h2 className={`${compact ? 'text-sm font-semibold uppercase tracking-[0.12em] text-gray-500' : 'text-base sm:text-lg font-medium text-gray-900'}`}>
          {compact ? 'Week Focus' : 'Program Weeks'}
        </h2>
        <p className={`${compact ? 'mt-1 text-sm font-semibold text-gray-900' : 'text-xs sm:text-sm text-gray-500'}`}>
          {compact ? 'Choose the week you want to manage.' : 'Select a week to view schedule'}
        </p>
      </div>

      <div className={`${compact ? 'p-4' : 'p-3 sm:p-4'}`}>
        <div className="block">
          <AppSelect
            value={selectedWeek ? String(selectedWeek.id) : ''}
            onChange={(nextValue) => onWeekSelect(parseInt(nextValue, 10))}
            options={options}
            placeholder="Select a week"
            compact={compact}
          />
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
