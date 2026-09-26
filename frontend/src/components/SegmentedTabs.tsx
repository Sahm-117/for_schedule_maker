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
// More than four tabs wrap onto a second row on phones instead of being cut off.
const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ tabs, active, onChange }) => {
  const wraps = tabs.length > 4;
  return (
  <div
    role="tablist"
    className={`${wraps ? 'flex flex-wrap sm:grid' : 'grid'} gap-1.5 rounded-2xl border border-[#eef0f4] bg-white p-[5px]`}
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
          className={`min-w-0 truncate rounded-xl px-1.5 py-[9px] text-[12.5px] font-semibold transition ${wraps ? 'flex-1 basis-[30%]' : ''} ${isActive ? 'bg-[#3f4757] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          {tab.shortLabel ? (
            <>
              <span className="xl:hidden">{tab.shortLabel}</span>
              <span className="hidden xl:inline">{tab.label}</span>
            </>
          ) : tab.label}
        </button>
      );
    })}
  </div>
  );
};

export default SegmentedTabs;
