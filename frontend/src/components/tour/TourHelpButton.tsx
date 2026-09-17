import React from 'react';
import { useTourState } from '../../context/TourContext';

// The "?" beside a page title. Runs that page's tour; a soft pulsing dot shows
// until the person has seen it.

const TourHelpButton: React.FC<{ tourId: string; className?: string }> = ({ tourId, className = '' }) => {
  const { hasTour, hasSeen, startTour } = useTourState();
  if (!hasTour(tourId)) return null;
  const unseen = !hasSeen(tourId);

  return (
    <button
      type="button"
      onClick={() => startTour(tourId)}
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-sm font-bold text-gray-500 transition hover:bg-orange-100 hover:text-gray-700 active:scale-95 ${className}`}
      title="Take a quick tour of this page"
      aria-label={unseen ? 'Take a quick tour of this page (new)' : 'Take a quick tour of this page'}
      data-testid="tour-help"
    >
      ?
      {unseen && (
        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden="true">
          <span className="fof-help-ping absolute inline-flex h-full w-full rounded-full bg-primary" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white" />
        </span>
      )}
    </button>
  );
};

export default TourHelpButton;
