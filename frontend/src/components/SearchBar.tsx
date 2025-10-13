import React, { useState, useEffect, useRef } from 'react';
import type { Week, Day, Activity } from '../types';

interface SearchResult {
  activity: Activity;
  week: Week;
  day: Day;
}

interface SearchBarProps {
  weeks: Week[];
  onResultClick: (weekId: number, activityId: number) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ weeks, onResultClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllResultsModal, setShowAllResultsModal] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted search term on mount
  useEffect(() => {
    const savedSearch = localStorage.getItem('searchTerm');
    if (savedSearch) {
      setSearchTerm(savedSearch);
    }
  }, []);

  // Handle search with debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm.length >= 2) {
        performSearch(searchTerm);
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, weeks]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = (term: string) => {
    setIsSearching(true);
    const searchResults: SearchResult[] = [];
    const lowerTerm = term.toLowerCase();

    weeks.forEach((week) => {
      week.days.forEach((day) => {
        day.activities.forEach((activity) => {
          // Search in description, time, and period
          const matchesDescription = activity.description.toLowerCase().includes(lowerTerm);
          const matchesTime = activity.time.toLowerCase().includes(lowerTerm);
          const matchesPeriod = activity.period.toLowerCase().includes(lowerTerm);

          if (matchesDescription || matchesTime || matchesPeriod) {
            searchResults.push({ activity, week, day });
          }
        });
      });
    });

    setResults(searchResults);
    setIsOpen(searchResults.length > 0);
    setIsSearching(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Persist search term
    if (value) {
      localStorage.setItem('searchTerm', value);
    } else {
      localStorage.removeItem('searchTerm');
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setResults([]);
    setIsOpen(false);
    localStorage.removeItem('searchTerm');
    inputRef.current?.focus();
  };

  const handleResultClick = (result: SearchResult) => {
    onResultClick(result.week.id, result.activity.id);
    setIsOpen(false);
    setShowAllResultsModal(false);
  };

  const handleViewAllResults = () => {
    setIsOpen(false);
    setShowAllResultsModal(true);
  };

  const getDayDisplayName = (dayName: string) => {
    const dayNames: { [key: string]: string } = {
      'MONDAY': 'Monday',
      'TUESDAY': 'Tuesday',
      'WEDNESDAY': 'Wednesday',
      'THURSDAY': 'Thursday',
      'FRIDAY': 'Friday',
      'SATURDAY': 'Saturday',
      'SUNDAY': 'Sunday',
    };
    return dayNames[dayName] || dayName;
  };

  const getPeriodEmoji = (period: string) => {
    const emojis: { [key: string]: string } = {
      'MORNING': '🌅',
      'AFTERNOON': '☀️',
      'EVENING': '🌆',
    };
    return emojis[period] || '•';
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term) return text;

    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, index) =>
          regex.test(part) ? (
            <mark key={index} className="bg-yellow-200 text-gray-900 rounded px-0.5">
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </>
    );
  };

  const displayedResults = results.slice(0, 10);
  const hasMoreResults = results.length > 10;

  return (
    <div ref={searchRef} className="relative w-full search-bar">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Search activities across all weeks..."
          className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
        />

        {/* Clear Button */}
        {searchTerm && (
          <button
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Loading Spinner */}
        {isSearching && (
          <div className="absolute inset-y-0 right-10 pr-3 flex items-center">
            <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
          {/* Results Header */}
          <div className="sticky top-0 bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">
              Found {results.length} activit{results.length !== 1 ? 'ies' : 'y'} matching "{searchTerm}"
            </p>
          </div>

          {/* Results List */}
          <div className="py-2">
            {displayedResults.map((result, index) => (
              <button
                key={`${result.week.id}-${result.day.id}-${result.activity.id}-${index}`}
                onClick={() => handleResultClick(result)}
                className="w-full px-4 py-3 hover:bg-gray-50 text-left transition-colors border-b border-gray-100 last:border-b-0"
              >
                {/* Location Context */}
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span className="font-medium text-primary">Week {result.week.weekNumber}</span>
                  <span>→</span>
                  <span>{getDayDisplayName(result.day.dayName)}</span>
                  <span>→</span>
                  <span className="flex items-center gap-1">
                    <span>{getPeriodEmoji(result.activity.period)}</span>
                    <span className="capitalize">{result.activity.period.toLowerCase()}</span>
                  </span>
                </div>

                {/* Activity Details */}
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-gray-600 flex-shrink-0">
                    {result.activity.time}
                  </span>
                  <p className="text-sm text-gray-900 flex-1">
                    {highlightMatch(result.activity.description, searchTerm)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* View All Results Footer */}
          {hasMoreResults && (
            <div className="sticky bottom-0 bg-gray-50 px-4 py-3 border-t border-gray-200">
              <button
                onClick={handleViewAllResults}
                className="w-full text-sm text-primary hover:text-primary-dark font-medium transition-colors"
              >
                View All {results.length} Results →
              </button>
            </div>
          )}
        </div>
      )}

      {/* No Results */}
      {isOpen && searchTerm.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-6 text-center">
          <div className="text-gray-400 text-4xl mb-2">🔍</div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            No activities found
          </p>
          <p className="text-xs text-gray-500">
            No activities match "{searchTerm}"
          </p>
        </div>
      )}

      {/* All Results Modal */}
      {showAllResultsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 rounded-t-lg flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Search Results
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Found {results.length} activit{results.length !== 1 ? 'ies' : 'y'} matching "{searchTerm}"
                </p>
              </div>
              <button
                onClick={() => setShowAllResultsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {results.map((result, index) => (
                  <button
                    key={`${result.week.id}-${result.day.id}-${result.activity.id}-${index}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors border border-gray-200 rounded-lg"
                  >
                    {/* Location Context */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-medium text-primary">Week {result.week.weekNumber}</span>
                      <span>→</span>
                      <span>{getDayDisplayName(result.day.dayName)}</span>
                      <span>→</span>
                      <span className="flex items-center gap-1">
                        <span>{getPeriodEmoji(result.activity.period)}</span>
                        <span className="capitalize">{result.activity.period.toLowerCase()}</span>
                      </span>
                    </div>

                    {/* Activity Details */}
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-medium text-gray-600 flex-shrink-0">
                        {result.activity.time}
                      </span>
                      <p className="text-sm text-gray-900 flex-1">
                        {highlightMatch(result.activity.description, searchTerm)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg">
              <button
                onClick={() => setShowAllResultsModal(false)}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
