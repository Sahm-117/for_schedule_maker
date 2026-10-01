import React, { useEffect, useRef } from 'react';

type SegmentedTab = {
  key: string;
  label: string;
  shortLabel?: string;
  /** Small orange dot after the label: something new on that tab. */
  dot?: boolean;
};

// The one look for every tab group in the app: a soft grey tray with a dark
// pill on the active tab. SectionTabs reuses these so route tabs match.
export const TAB_TRAY = 'rounded-2xl bg-[#eceef2] p-1';
export const TAB_ACTIVE = 'bg-[#3f4757] text-white shadow-sm';
export const TAB_IDLE = 'text-gray-600 hover:text-gray-900';

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  active: string;
  onChange: (key: string) => void;
  /** Keep every tab at its natural width and let the row swipe sideways on phones. */
  scrollable?: boolean;
  /** Wrap onto two rows on phones even with four or fewer tabs (long labels). */
  wrap?: boolean;
  className?: string;
}

// Full-width segmented tab bar; `shortLabel` is shown on small screens.
// More than four tabs wrap onto a second row on phones instead of being cut off.
// `scrollable` instead keeps one row that scrolls sideways (no visible bar),
// with the active tab brought into view.
const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ tabs, active, onChange, scrollable = false, wrap = false, className = '' }) => {
  const wraps = !scrollable && (wrap || tabs.length > 4);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollable) return;
    const row = rowRef.current;
    const button = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !button) return;
    // Scroll only the row, never the page.
    const left = button.offsetLeft; // the row is `relative`, so this is within it
    const right = left + button.offsetWidth;
    if (left < row.scrollLeft) row.scrollTo({ left: Math.max(left - 8, 0), behavior: 'smooth' });
    else if (right > row.scrollLeft + row.clientWidth) row.scrollTo({ left: right - row.clientWidth + 8, behavior: 'smooth' });
  }, [active, scrollable, tabs.length]);

  return (
  <div
    ref={rowRef}
    role="tablist"
    className={`${scrollable
      ? 'relative flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      : wraps ? 'flex flex-wrap sm:grid' : 'grid'} gap-1 ${TAB_TRAY} ${className}`}
    style={scrollable ? undefined : { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
          className={`${scrollable ? 'flex-none snap-start whitespace-nowrap px-3.5 sm:flex-auto' : 'min-w-0 truncate px-1.5'} rounded-xl py-[9px] text-[12.5px] font-semibold transition ${wraps ? 'flex-1 basis-[30%]' : ''} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
        >
          {tab.shortLabel ? (
            <>
              <span className="xl:hidden">{tab.shortLabel}</span>
              <span className="hidden xl:inline">{tab.label}</span>
            </>
          ) : tab.label}
          {tab.dot && <span aria-label="New" className="ml-1.5 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" />}
        </button>
      );
    })}
  </div>
  );
};

export default SegmentedTabs;
