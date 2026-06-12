import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onHelp?: () => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action, onHelp }) => (
  <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
    <div className="flex items-center gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {onHelp && (
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
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

export default PageHeader;
