import React from 'react';

type SegmentedTab = {
  key: string;
  label: string;
  shortLabel?: string;
};

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  active: string;
  onChange: (key: string) => void;
}

// Full-width segmented tab bar; `shortLabel` is shown on small screens.
const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ tabs, active, onChange }) => (
  <div
    role="tablist"
    className="grid gap-1.5 rounded-2xl border border-[#eef0f4] bg-white p-[5px]"
    style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
  >
    {tabs.map((tab) => {
      const isActive = tab.key === active;
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.key)}
          className={`min-w-0 truncate rounded-xl px-1.5 py-[9px] text-[12.5px] font-semibold transition ${isActive ? 'bg-[#3f4757] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          {tab.shortLabel ? (
            <>
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </>
          ) : tab.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedTabs;
