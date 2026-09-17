import React from 'react';
import TourHelpButton from './tour/TourHelpButton';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onHelp?: () => void;
  /** Page tour id from constants/tours (e.g. 'support:home'); shows the "?" that runs it. */
  tourId?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action, onHelp, tourId }) => (
  <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {/* The "?" sits right beside the page name. */}
      <div className="flex items-center gap-2.5">
        <h1 className="page-title">{title}</h1>
        {tourId && <TourHelpButton tourId={tourId} />}
        {!tourId && onHelp && (
          <button
            type="button"
            onClick={onHelp}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-sm font-bold text-gray-500 hover:bg-orange-100 active:scale-95"
            title="Walkthrough"
          >
            ?
          </button>
        )}
      </div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {action ? <div className="shrink-0" data-wt="page-action">{action}</div> : null}
  </div>
);

export default PageHeader;
