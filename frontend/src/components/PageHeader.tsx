import React from 'react';
import { useNavigate } from 'react-router-dom';
import TourHelpButton from './tour/TourHelpButton';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onHelp?: () => void;
  /** Page tour id from constants/tours (e.g. 'support:home'); shows the "?" that runs it. */
  tourId?: string;
  /** A detail page reached one level deep from a list/tab: shows a "‹ Label"
   * link above the title. Goes back in history, or to `fallbackTo` when there
   * is none (a direct link or a notification opened the page). */
  back?: { label: string; fallbackTo: string };
}

/** Shared back-navigation link — chevron + short label, same look wherever a
 * detail page needs one (see also CommunityPage's topic-detail back button). */
const BackLink: React.FC<{ label: string; fallbackTo: string }> = ({ label, fallbackTo }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(fallbackTo);
      }}
      className="mb-2 flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
};

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action, onHelp, tourId, back }) => (
  <div className="mb-4 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {back && <BackLink label={back.label} fallbackTo={back.fallbackTo} />}
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
