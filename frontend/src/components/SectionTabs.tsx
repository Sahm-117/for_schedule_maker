import React from 'react';
import { NavLink } from 'react-router-dom';

// Back office sections that group related pages under one sidebar item.
// Each page keeps its own URL (old links still work); the section shows a tab
// strip above it so the related pages are one tap apart.

export interface SectionTab {
  to: string;
  label: string;
  adminOnly?: boolean;
  badge?: 'pendingApprovals';
}

export const ADMIN_SECTIONS: Array<{ root: string; tabs: SectionTab[] }> = [
  {
    root: '/participants',
    tabs: [
      { to: '/participants', label: 'Participants' },
      { to: '/attendance', label: 'Attendance' },
      { to: '/faith-projects', label: 'Faith projects' },
      { to: '/onboarding', label: 'Onboarding' },
    ],
  },
  {
    root: '/groups',
    tabs: [
      { to: '/groups', label: 'Groups' },
      { to: '/allocation', label: 'Allocation' },
      { to: '/group-prayers', label: 'Group meetings' },
    ],
  },
  {
    root: '/schedule',
    tabs: [
      { to: '/schedule', label: 'Schedule' },
      { to: '/approvals', label: 'Approvals', adminOnly: true, badge: 'pendingApprovals' },
      { to: '/rota', label: 'Rota', adminOnly: true },
      { to: '/activity-overview', label: 'Activity overview', adminOnly: true },
    ],
  },
];

/** The section a page belongs to. Detail pages (e.g. /participants/:id) show no tabs. */
export const sectionForPath = (pathname: string) =>
  ADMIN_SECTIONS.find((section) => section.tabs.some((tab) => tab.to === pathname)) ?? null;

/** Whether a sidebar item should look active for this page, including its section's tabs. */
export const sectionMatches = (pathname: string, to: string) => {
  const section = ADMIN_SECTIONS.find((entry) => entry.root === to);
  if (!section) return false;
  return section.tabs.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
};

const SectionTabs: React.FC<{ pathname: string; isAdmin: boolean; pendingApprovals: number }> = ({ pathname, isAdmin, pendingApprovals }) => {
  const section = sectionForPath(pathname);
  if (!section) return null;
  const tabs = section.tabs.filter((tab) => !tab.adminOnly || isAdmin);
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Section" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max gap-1 rounded-2xl border border-[#eef0f4] bg-white p-[5px]">
        {tabs.map((tab) => {
          const active = pathname === tab.to;
          const count = tab.badge === 'pendingApprovals' ? pendingApprovals : 0;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${active ? 'bg-[#3f4757] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? 'bg-white text-gray-800' : 'bg-primary text-white'}`}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default SectionTabs;
