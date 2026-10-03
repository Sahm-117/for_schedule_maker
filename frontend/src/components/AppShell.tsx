import React, { useEffect, useMemo, useState } from 'react';
import SectionTabs, { sectionMatches } from './SectionTabs';
import LiveNavDot from './LiveNavDot';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import AppSelect from './AppSelect';
import AppSetupSheet from './participantApp/AppSetupSheet';
import AppSetupBanner from './participantApp/AppSetupBanner';
import { useAppSetup, appSetupSheetDue } from '../hooks/useAppSetup';
import { recordAppState, noteSheetShown, noteSheetDismissed } from '../hooks/useAppServerState';
import ClassFeedbackModal from './ClassFeedbackModal';
import HubRoleIntroModal from './hubs/HubRoleIntroModal';
import RoleGuideModal from './hubs/RoleGuideModal';
import { useSupportClassFeedbackPrompt } from '../hooks/useSupportClassFeedbackPrompt';
import { classFeedbackApi, groupsApi, myHubApi, notificationsApi, supportKindApi } from '../services/api';
import { usePushTapRead } from '../hooks/usePushTapRead';
import FollowUpCheckPrompt from './followups/FollowUpCheckPrompt';
import PracticeDock from './practice/PracticeDock';
import type { HubJob, SupportKind } from '../types';
import { HUB_JOB_INFO, sortHubJobs } from './hubs/hubJobs';
import ProfileMenu from './ProfileMenu';
import { useGroupMeetingLive } from '../hooks/useGroupMeetingLive';
import NewNotificationBanner from './NewNotificationBanner';
import NeedSupportButton from './NeedSupportButton';
import NotificationBell from './NotificationBell';
import ForcePasswordChangeModal from './ForcePasswordChangeModal';
import LoginShareReminder from './followups/LoginShareReminder';
import ErrorBoundary from './ErrorBoundary';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useTourState } from '../context/TourContext';
import { sortByText } from '../utils/sort';
import { getHubPhase } from '../utils/hubPhase';
import { usePracticePulse } from '../hooks/usePracticePulse';
import PracticeIncoming from './practice/PracticeIncoming';
import { OPEN_PRACTICE_EVENT, OPEN_PRACTICE_FLAG } from './practice/PracticeDock';
import { PracticeEntryProvider } from '../context/PracticeEntryContext';
import { practiceApi } from '../services/api';
import { PRACTICE_ROLE_LABEL } from '../constants/practiceScenarios';
import AnnouncementPopupHost from './AnnouncementPopupHost';
import { POPUP_PRIORITY, usePopupSlot, useSettled } from '../utils/popupQueue';

type NavItem = {
  to: string;
  label: string;
  mobileLabel?: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  mobileHidden?: boolean;
  mobileMore?: boolean;
  /** Only shown to a support who is in a hub for the active cohort. */
  hubOnly?: boolean;
  /** Hidden for a support whose kind in the active cohort is hub-only (no participant group). */
  hiddenForHubOnly?: boolean;
  /** Only shown while Practice is switched on for this support. */
  practiceOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type OpenNavGroups = Record<string, boolean>;

const IconBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="grid h-5 w-5 place-items-center">{children}</span>
);

// The crest only, cropped out of the full logo. The crop box and the picture scale together
// (the crest is 52:48 of the logo's height), so a smaller size can't let the lettering beside it creep in.
const BrandMark: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <span className="relative block flex-none overflow-hidden" style={{ height: size, width: Math.floor((size * 52) / 48) - 1 }}>
    <img src="/logo-full.png" alt="" className="absolute left-0 top-0 w-auto max-w-none" style={{ height: size }} />
  </span>
);

const ICONS = {
  dashboard: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-18v7h6V2h-6z" /></svg></IconBox>,
  schedule: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></IconBox>,
  planner: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 6h9M4 12h16M4 18h6M15 4v4M20 10v4M12 16v4" /></svg></IconBox>,
  approvals: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></IconBox>,
  overview: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 19h16M6 16V8m6 8V5m6 11v-6" /></svg></IconBox>,
  cohorts: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5 5.15 5 3.067 5.865 2 7.2v11.547C3.067 17.412 5.15 16.547 7.5 16.547c1.746 0 3.332.477 4.5 1.253m0-11.547C13.168 5.477 14.754 5 16.5 5c2.35 0 4.433.865 5.5 2.2v11.547c-1.067-1.335-3.15-2.2-5.5-2.2-1.746 0-3.332.477-4.5 1.253" /></svg></IconBox>,
  users: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2a5 5 0 00-10 0v2m10-8a4 4 0 10-8 0 4 4 0 008 0zm6 2a4 4 0 11-8 0 4 4 0 018 0z" /></svg></IconBox>,
  bell: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" /></svg></IconBox>,
  megaphone: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 5 6 9H3v6h3l5 4V5Zm0 0h4a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4" /></svg></IconBox>,
  resources: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" /></svg></IconBox>,
  practice: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 3h6M10 3v5.2L5.4 17A2.2 2.2 0 0 0 7.3 20.3h9.4a2.2 2.2 0 0 0 1.9-3.3L14 8.200V3M8 14h8" /></svg></IconBox>,
  settings: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.325 4.317a1 1 0 0 1 1.9 0 1 1 0 0 0 1.49.617 1 1 0 0 1 1.366.366 1 1 0 0 0 1.324.472 1 1 0 0 1 1.366.366 1 1 0 0 1-.366 1.366 1 1 0 0 0-.472 1.324 1 1 0 0 1 .617 1.49 1 1 0 0 0 0 1.9 1 1 0 0 1-.617 1.49 1 1 0 0 0-.472 1.324 1 1 0 0 1 .366 1.366 1 1 0 0 1-1.366.366 1 1 0 0 0-1.324.472 1 1 0 0 1-1.49.617 1 1 0 0 0-1.9 0 1 1 0 0 1-1.49-.617 1 1 0 0 0-1.324-.472 1 1 0 0 1-1.366-.366 1 1 0 0 1 .366-1.366 1 1 0 0 0 .472-1.324 1 1 0 0 1-.617-1.49 1 1 0 0 0 0-1.9 1 1 0 0 1 .617-1.49 1 1 0 0 0 .472-1.324 1 1 0 0 1-.366-1.366 1 1 0 0 1 1.366-.366 1 1 0 0 0 1.324-.472 1 1 0 0 1 1.49-.617Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg></IconBox>,
  birthdays: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 21h16M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 13V9M12 9c-1 0-1.6-.8-1.6-1.6S12 5 12 5s1.6 1.6 1.6 2.4S13 9 12 9ZM5 17c1.5 1 2.5 1 3.5 0s2-1 3.5 0 2.5 1 3.5 0 2-1 3.5 0" /></svg></IconBox>,
  followups: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" /></svg></IconBox>,
  profile: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 21a8 8 0 1 0-16 0m8-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg></IconBox>,
  participants: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0m13 13v-2a4 4 0 0 0-3-3.87" /></svg></IconBox>,
  groups: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg></IconBox>,
  attendance: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" /></svg></IconBox>,
  faith: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg></IconBox>,
  prayer: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4.318 6.318a4.5 4.5 0 0 0 0 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 0 0-6.364 0Z" /></svg></IconBox>,
  onboarding: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-3 3v-3Z" /></svg></IconBox>,
  hub: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></IconBox>,
  mobilisation: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M18 9v6m3-3h-6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 20a6 6 0 0 1 12 0v1H3v-1Z" /></svg></IconBox>,
  more: <IconBox><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.25 10a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" /></svg></IconBox>,
  feedback: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 6l2.5-3H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v14z" /></svg></IconBox>,
  rota: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 9h18M9 4v16M4 20h16a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" /></svg></IconBox>,
  website: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.21 0 4-4.03 4-9s-1.79-9-4-9-4 4.03-4 9 1.79 9 4 9Zm-9-9h18" /></svg></IconBox>,
};

// Related pages sit under one item and share a tab strip (see SectionTabs):
// Participants (+ Attendance, Faith projects, Onboarding), Groups (+ Allocation,
// Group meetings), Schedule (+ Approvals, Rota, Activity overview).
const adminNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
  { to: '/planner', label: 'Planner', icon: ICONS.planner, adminOnly: true },
  { to: '/participants', label: 'Participants', icon: ICONS.participants, adminOnly: true },
  { to: '/groups', label: 'Groups', icon: ICONS.groups, adminOnly: true },
  { to: '/supports', label: 'Supports', icon: ICONS.attendance, adminOnly: true },
  { to: '/hubs', label: 'Hubs', icon: ICONS.groups, adminOnly: true },
  { to: '/cohorts', label: 'Cohorts', icon: ICONS.cohorts, adminOnly: true },
  { to: '/follow-ups', label: 'Follow-ups', icon: ICONS.followups, adminOnly: true },
  { to: '/feedback', label: 'Feedback', icon: ICONS.feedback, adminOnly: true },
  { to: '/surveys', label: 'Surveys', icon: ICONS.feedback, adminOnly: true },
  { to: '/birthdays', label: 'Birthdays', icon: ICONS.birthdays, adminOnly: true },
  { to: '/users', label: 'Users', icon: ICONS.users, adminOnly: true },
  { to: '/announcements', label: 'Announcements', icon: ICONS.megaphone, adminOnly: true },
  { to: '/notifications', label: 'Notifications', icon: ICONS.bell, adminOnly: true },
  { to: '/practice', label: 'Practice', icon: ICONS.practice, adminOnly: true },
  { to: '/community', label: 'Community', icon: ICONS.hub },
  { to: '/resources', label: 'Resources', icon: ICONS.resources },
  { to: '/website', label: 'Website', icon: ICONS.website, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: ICONS.settings },
];

const adminNavGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
    ],
  },
  {
    label: 'Programme',
    items: [
      { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
      { to: '/planner', label: 'Planner', icon: ICONS.planner, adminOnly: true },
    ],
  },
  {
    label: 'People & groups',
    items: [
      { to: '/participants', label: 'Participants', icon: ICONS.participants, adminOnly: true },
      { to: '/groups', label: 'Groups', icon: ICONS.groups, adminOnly: true },
      { to: '/supports', label: 'Supports', icon: ICONS.attendance, adminOnly: true },
      { to: '/hubs', label: 'Hubs', icon: ICONS.groups, adminOnly: true },
      { to: '/cohorts', label: 'Cohorts', icon: ICONS.cohorts, adminOnly: true },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/follow-ups', label: 'Follow-ups', icon: ICONS.followups, adminOnly: true },
      { to: '/feedback', label: 'Feedback', icon: ICONS.feedback, adminOnly: true },
      { to: '/surveys', label: 'Surveys', icon: ICONS.feedback, adminOnly: true },
      { to: '/birthdays', label: 'Birthdays', icon: ICONS.birthdays, adminOnly: true },
      { to: '/community', label: 'Community', icon: ICONS.hub },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: ICONS.users, adminOnly: true },
      { to: '/announcements', label: 'Announcements', icon: ICONS.megaphone, adminOnly: true },
      { to: '/notifications', label: 'Notifications', icon: ICONS.bell, adminOnly: true },
      { to: '/practice', label: 'Practice', icon: ICONS.practice, adminOnly: true },
      { to: '/resources', label: 'Resources', icon: ICONS.resources },
      { to: '/website', label: 'Website', icon: ICONS.website, adminOnly: true },
      { to: '/settings', label: 'Settings', icon: ICONS.settings },
    ],
  },
];

const supportNav: NavItem[] = [
  { to: '/support', label: 'Home', icon: ICONS.dashboard },
  { to: '/support/mobilisation', label: 'Mobilisation', icon: ICONS.mobilisation },
  { to: '/support/schedule', label: 'My Schedule', mobileLabel: 'Schedule', icon: ICONS.schedule },
  { to: '/support/participants', label: 'My Group', mobileLabel: 'Group', icon: ICONS.participants, hiddenForHubOnly: true },
  { to: '/support/my-hub', label: 'My Hub', icon: ICONS.groups, mobileMore: true, hubOnly: true },
  { to: '/support/attendance', label: 'Attendance', icon: ICONS.attendance, mobileMore: true },
  { to: '/support/onboarding', label: 'Onboard', icon: ICONS.onboarding, mobileMore: true },
  { to: '/support/community', label: 'Community', icon: ICONS.hub, mobileMore: true },
  { to: '/support/practice', label: 'Practice', icon: ICONS.practice, mobileMore: true, practiceOnly: true },
  { to: '/support/resources', label: 'Resources', icon: ICONS.resources, mobileMore: true },
  { to: '/support/profile', label: 'Profile', icon: ICONS.profile, mobileMore: true },
];

const MobileBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
};

const isNavActive = (pathname: string, to: string) => {
  if (to === '/support' || to === '/dashboard') {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`) || sectionMatches(pathname, to);
};

const canShowNavItem = (item: NavItem, isAdmin: boolean) => !(item.adminOnly && !isAdmin);

const NavDot: React.FC = () => (
  <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
);

// Small pulsing dot for "a meeting is on right now" — same visual language as
// HubMeetingPanel's LiveDot, just the dot on its own for a nav item.
// Tapping "My Hub"/"My Group" while their meeting is live opens the meeting
// tab directly, instead of the plain page.
const resolveNavTo = (item: NavItem, hubMeetingLive: boolean, groupMeetingLive: boolean, groupLiveWeekId?: number | null) => {
  if (item.to === '/support/my-hub' && hubMeetingLive) return '/support/my-hub?tab=meeting';
  if (item.to === '/support/participants' && groupMeetingLive) return `/support/participants?tab=prayers${groupLiveWeekId ? `&week=${groupLiveWeekId}` : ''}`;
  return item.to;
};

// Admins inside the Practice cohort can't open the areas that are not cohort data.
const PracticeLockContext = React.createContext(false);
const LOCKED_IN_PRACTICE = ['/users', '/resources'];
const isLockedInPractice = (path: string) => LOCKED_IN_PRACTICE.some((base) => path === base || path.startsWith(`${base}/`));

const NavItemLink: React.FC<{
  item: NavItem;
  active: boolean;
  globalPendingCount: number;
  newResourceCount: number;
  hasNewHubActivity: boolean;
  hubMeetingLive?: boolean;
  groupMeetingLive?: boolean;
  groupLiveWeekId?: number | null;
  onClick?: () => void;
}> = ({ item, active, globalPendingCount, newResourceCount, hasNewHubActivity, hubMeetingLive = false, groupMeetingLive = false, groupLiveWeekId = null, onClick }) => {
  const isLive = (item.to === '/support/my-hub' && hubMeetingLive) || (item.to === '/support/participants' && groupMeetingLive);
  const practiceLocked = React.useContext(PracticeLockContext) && isLockedInPractice(item.to);
  if (practiceLocked) {
    return (
      <span className="nav-pill cursor-not-allowed opacity-40" title="Not available while you are in the Practice cohort" aria-disabled="true">
        {item.icon}
        <span>{item.label}</span>
      </span>
    );
  }
  return (
    <NavLink
      key={item.to}
      to={resolveNavTo(item, hubMeetingLive, groupMeetingLive, groupLiveWeekId)}
      end={item.to === '/support' || item.to === '/dashboard'}
      onClick={onClick}
      className={({ isActive }) => `nav-pill ${active || isActive ? 'nav-pill-active' : ''}`}
    >
      {item.icon}
      <span>{item.label}</span>
      {item.to === '/schedule' && <MobileBadge count={globalPendingCount} />}
      {item.to.includes('community') && hasNewHubActivity && <NavDot />}
      {isLive && <LiveNavDot className="ml-auto" ringClass="ring-transparent" />}
    </NavLink>
  );
};

const NavGroupSection: React.FC<{
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  locationPathname: string;
  globalPendingCount: number;
  newResourceCount: number;
  hasNewHubActivity: boolean;
  onItemClick?: () => void;
}> = ({
  group,
  open,
  onToggle,
  locationPathname,
  globalPendingCount,
  newResourceCount,
  hasNewHubActivity,
  onItemClick,
}) => (
  <div className="space-y-1.5">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 hover:bg-orange-50/70 hover:text-gray-600"
      aria-expanded={open}
    >
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <svg
        className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m9 5 7 7-7 7" />
      </svg>
    </button>
    {open && (
      <div className="space-y-1">
        {group.items.map((item) => (
          <NavItemLink
            key={item.to}
            item={item}
            active={isNavActive(locationPathname, item.to)}
            globalPendingCount={globalPendingCount}
            newResourceCount={newResourceCount}
            hasNewHubActivity={hasNewHubActivity}
            onClick={onItemClick}
          />
        ))}
      </div>
    )}
  </div>
);

const AppShell: React.FC = () => {
  const { user, isAdmin, logout, refreshUserCohorts, switchRole } = useAuth();
  const {
    cohorts,
    loading: appDataLoading,
    activeCohort,
    setActiveCohort,
    reloadCohorts,
    globalPendingChanges,
    newResourceCount,
    hasNewHubActivity,
    myHub,
    weeks,
    liveRevision,
    refreshNotifications,
    refreshMyHub,
  } = useAppData();
  // A tapped phone push counts as reading its bell copy.
  usePushTapRead(!!user, React.useCallback(async (title: string, body: string) => {
    await notificationsApi.markTapped(title, body);
    await refreshNotifications();
  }, [refreshNotifications]));
  const { enable } = usePushNotifications(user?.id);
  const appSetup = useAppSetup();
  const isSupport = user?.role === 'SUPPORT';
  // Practice: one tiny check every few seconds, so Test mode, seats and
  // walkthrough requests show up by themselves with no reload.
  const { pulse: practicePulse, refresh: refreshPracticePulse } = usePracticePulse(isSupport, () => { void refreshUserCohorts(); }, !!activeCohort?.isPractice);
  const practiceOn = !!practicePulse?.member && !!practicePulse.on;
  const practiceEntryReady = !appDataLoading && practicePulse !== null;
  // Before a real cohort starts, Practice takes the Resources spot in the quick actions; once one
  // has started it moves under More. Either way it switches to the Practice cohort and opens the pop-up.
  const realCohortStarted = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return cohorts.some((c) => !c.isPractice && c.status !== 'COMPLETED' && !!c.startDate && c.startDate.slice(0, 10) <= today);
  }, [cohorts]);
  const openPractice = React.useCallback(async () => {
    const practiceCohort = cohorts.find((c) => c.isPractice);
    if (!practiceCohort) throw new Error('Practice is not available yet. Refresh and try again.');
    try { sessionStorage.setItem(OPEN_PRACTICE_FLAG, '1'); } catch { /* ignore */ }
    try {
      if (activeCohort?.id !== practiceCohort.id) await setActiveCohort(practiceCohort.id);
      else window.dispatchEvent(new Event(OPEN_PRACTICE_EVENT));
    } catch (error) {
      try { sessionStorage.removeItem(OPEN_PRACTICE_FLAG); } catch { /* ignore */ }
      throw error;
    }
  }, [cohorts, activeCohort?.id, setActiveCohort]);
  const retryPracticeEntry = React.useCallback(async () => {
    await Promise.all([reloadCohorts(), refreshPracticePulse()]);
  }, [reloadCohorts, refreshPracticePulse]);
  // The cohort to go back to from Test mode: the last real one they were looking at.
  useEffect(() => {
    if (activeCohort && !activeCohort.isPractice) { try { localStorage.setItem('fof_last_real_cohort', activeCohort.id); } catch { /* ignore */ } }
  }, [activeCohort]);
  const returnCohortId = useMemo(() => {
    const real = cohorts.filter((c) => !c.isPractice);
    let last: string | null = null;
    try { last = localStorage.getItem('fof_last_real_cohort'); } catch { /* ignore */ }
    const remembered = real.find((c) => c.id === last);
    if (remembered) return remembered.id;
    const active = real.filter((c) => c.status !== 'COMPLETED').sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')))[0];
    return (active ?? real[0])?.id ?? null;
  }, [cohorts, activeCohort?.id]);
  const [returningToReal, setReturningToReal] = useState(false);
  const returnToRealCohort = async () => {
    if (!returnCohortId || returningToReal) return;
    setReturningToReal(true);
    try { await setActiveCohort(returnCohortId); navigate('/support'); } finally { setReturningToReal(false); }
  };
  const practiceEntry = useMemo(() => ({ ready: practiceEntryReady, on: practiceOn, started: realCohortStarted, open: openPractice, retry: retryPracticeEntry }), [practiceEntryReady, practiceOn, realCohortStarted, openPractice, retryPracticeEntry]);
  // First time a support opens the app after getting a hub job: welcome them
  // to it (once per job, remembered on the server), with a link to the guide.
  const [introDoneJobs, setIntroDoneJobs] = useState<HubJob[]>([]);
  const [guideJob, setGuideJob] = useState<HubJob | null>(null);
  const pendingIntroJob = isSupport && myHub?.hub
    ? (myHub.unseenIntroJobs ?? []).find((job) => !introDoneJobs.includes(job)) ?? null
    : null;
  // TEMPORARY (Olamide, 27 Sep 2026): for this one roll-out, the first welcome
  // opens the full visual role guide instead of the short popup. Set back to
  // false afterwards to return to the popup (which still links to the guide).
  const OPEN_GUIDE_AS_WELCOME = true;
  const finishIntro = (job: HubJob) => {
    setIntroDoneJobs((prev) => [...prev, job]);
    if (myHub?.hub) void myHubApi.markRoleIntroSeen(myHub.hub.id, job).catch(() => undefined);
  };
  // Supports only -- admins get the full per-week breakdown on the Feedback page instead.
  const { dueWeek: classFeedbackDueWeek, dismiss: dismissClassFeedback, markAnswered: markClassFeedbackAnswered } =
    useSupportClassFeedbackPrompt(isSupport ? activeCohort : null, isSupport ? weeks : [], isSupport ? user?.id : undefined);
  const [open, setOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<OpenNavGroups>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // First-login order: password change, Welcome + Home tour, then the notification prompt.
  const { busy: tourBusy } = useTourState();
  // Get the app (Home Screen + notifications): one ask per launch. It waits for a
  // launch where the weekly feedback question or a role intro isn't due, and the
  // banner in the page keeps asking meanwhile.
  const [appSetupDismissed, setAppSetupDismissed] = useState(() => {
    try { return sessionStorage.getItem('fof_staff_appsetup_dismissed_session') === '1'; } catch { return false; }
  });
  const showAppSetup = !!user && !tourBusy && !classFeedbackDueWeek && !pendingIntroJob && !appSetupDismissed && appSetupSheetDue(appSetup);
  useEffect(() => {
    if (user) void recordAppState(appSetup.installed, appSetup.device, appSetup.notifications, 'staff');
  }, [user?.id, appSetup.installed, appSetup.device, appSetup.notifications]); // eslint-disable-line react-hooks/exhaustive-deps
  // One popup at a time (see utils/popupQueue): each popup asks for its place.
  const popupsSettled = useSettled();
  const introSlot = usePopupSlot('hub-intro', POPUP_PRIORITY.hubIntro, !tourBusy && !classFeedbackDueWeek && !!pendingIntroJob, 'required');
  const classFeedbackSlot = usePopupSlot('class-feedback', POPUP_PRIORITY.classFeedback, popupsSettled && !tourBusy && !!user && !!activeCohort && !!classFeedbackDueWeek);
  const appSetupSlot = usePopupSlot('get-the-app', POPUP_PRIORITY.getTheApp, popupsSettled && showAppSetup);
  const shownCounted = React.useRef(false);
  useEffect(() => {
    if (showAppSetup && !shownCounted.current) { shownCounted.current = true; noteSheetShown(); }
  }, [showAppSetup]);
  const closeAppSetup = () => {
    noteSheetDismissed();
    try { sessionStorage.setItem('fof_staff_appsetup_dismissed_session', '1'); } catch { /* private browsing etc. */ }
    setAppSetupDismissed(true);
  };
  // Day 5+ of the cohort, a hub support reaches My Hub more than Mobilisation,
  // so the two swap places on the mobile bottom bar (desktop keeps both).
  const hubPhase = useMemo(
    () => isSupport && getHubPhase(!!myHub?.hub, activeCohort?.startDate),
    [isSupport, myHub?.hub, activeCohort?.startDate]
  );
  const isMobileMoreItem = (item: NavItem) => {
    if (item.to === '/support/mobilisation') return hubPhase;
    if (item.to === '/support/my-hub') return !hubPhase;
    return !!item.mobileMore;
  };
  // Kind tagged for this cohort: hub leads and operational supports don't run
  // a participant group, so "My Group" doesn't apply to them.
  // Bumped when Practice moves the person to another seat or resets them. The header label and
  // the page behind it (My Hub, My Group, Attendance...) re-read everything right away instead of
  // on the next background refresh.
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [supportKind, setSupportKind] = useState<SupportKind>('PARTICIPANT_SUPPORT');
  useEffect(() => {
    if (!isSupport || !user || !activeCohort) { setSupportKind('PARTICIPANT_SUPPORT'); return; }
    let cancelled = false;
    supportKindApi.getForCohort(activeCohort.id)
      .then(({ kinds }) => { if (!cancelled) setSupportKind(kinds[user.id] ?? 'PARTICIPANT_SUPPORT'); })
      .catch(() => { if (!cancelled) setSupportKind('PARTICIPANT_SUPPORT'); });
    return () => { cancelled = true; };
  }, [isSupport, user, activeCohort, workspaceRevision]);
  const isHubOnlySupport = isSupport && (supportKind === 'HUB_LEAD' || supportKind === 'OPERATIONAL');
  const canShowForKind = (item: NavItem) => !(item.hiddenForHubOnly && isHubOnlySupport);
  const navItems = useMemo(() => {
    if (isSupport) return supportNav.filter((item) => (!item.hubOnly || !!myHub?.hub) && canShowForKind(item) && (!item.practiceOnly || practiceOn));
    return adminNav.filter((item) => canShowNavItem(item, isAdmin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isSupport, myHub?.hub, isHubOnlySupport, practiceOn]);
  const navGroups = useMemo(() => {
    if (isSupport) return [];
    return adminNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canShowNavItem(item, isAdmin)),
      }))
      .filter((group) => group.items.length > 0);
  }, [isAdmin, isSupport]);
  const isNavGroupOpen = (label: string) => openNavGroups[label] ?? true;
  const toggleNavGroup = (label: string) => {
    setOpenNavGroups((current) => ({
      ...current,
      [label]: !(current[label] ?? true),
    }));
  };
  const mobileNavItems = useMemo(() => {
    if (isSupport) return supportNav.filter((item) => !item.mobileHidden && !isMobileMoreItem(item) && (!item.hubOnly || !!myHub?.hub) && canShowForKind(item) && (!item.practiceOnly || practiceOn));
    const mobileAdminRoutes = new Set(['/dashboard', '/schedule', '/participants', '/supports', '/community']);
    return navItems.filter((item) => mobileAdminRoutes.has(item.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupport, navItems, myHub?.hub, hubPhase, isHubOnlySupport, practiceOn]);
  const mobileMoreItems = useMemo(
    () => (isSupport ? supportNav.filter((item) => isMobileMoreItem(item) && (!item.hubOnly || !!myHub?.hub) && canShowForKind(item) && (!item.practiceOnly || practiceOn)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSupport, myHub?.hub, hubPhase, isHubOnlySupport, practiceOn]
  );
  const moreActive = mobileMoreItems.some((item) => isNavActive(location.pathname, item.to));

  // The support badge names the group(s) they lead in the selected cohort —
  // activity tags aren't cohort-specific, so an old cohort's tag would show.
  const [myGroupNames, setMyGroupNames] = useState<string[]>([]);
  // This support's own group id, for the "My Group" nav dot (useGroupMeetingLive
  // polls MeetingAttendance/GroupPrayerStatus for it — see that hook).
  const [myGroupId, setMyGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupport || !user || !activeCohort) { setMyGroupNames([]); setMyGroupId(null); return; }
    let cancelled = false;
    groupsApi.getAll({ cohortId: activeCohort.id })
      .then((res) => {
        if (cancelled) return;
        const own = res.groups.filter((g) => g.supportId === user.id && !g.archivedAt);
        setMyGroupNames(own.map((g) => g.name));
        setMyGroupId(own[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) { setMyGroupNames([]); setMyGroupId(null); } });
    return () => { cancelled = true; };
  }, [isSupport, user, activeCohort, workspaceRevision]);
  // Hub jobs held in the selected cohort — fetched across every hub this
  // support belongs to or IT-supports, so an operational support on 2+ hubs
  // still gets a single deduped list of job labels.
  const [myHubJobs, setMyHubJobs] = useState<HubJob[]>([]);
  // Whether ANY hub this support belongs to/IT-supports has a meeting on
  // right now — an operational support covering 2+ hubs needs every one
  // checked, not just myHub (which only ever holds one).
  const [hubsMeetingLive, setHubsMeetingLive] = useState(false);
  useEffect(() => {
    if (!isSupport || !activeCohort) { setMyHubJobs([]); setHubsMeetingLive(false); return; }
    let cancelled = false;
    myHubApi.getMyHubs(activeCohort.id)
      .then(({ hubs }) => {
        if (cancelled) return;
        const jobSet = new Set<HubJob>();
        hubs.forEach((h) => (h.myJobs ?? []).forEach((job) => jobSet.add(job)));
        setMyHubJobs(sortHubJobs([...jobSet]));
        setHubsMeetingLive(hubs.some((h) => !!h.meetingLive));
      })
      .catch(() => { if (!cancelled) setMyHubJobs([]); });
    return () => { cancelled = true; };
    // liveRevision re-checks meetingLive on the app's existing refresh cadence
    // (realtime + 15s fallback), same as myHub — no separate polling needed.
  }, [isSupport, activeCohort, liveRevision, workspaceRevision]);
  const myHubJobLabels = myHubJobs.map((job) => HUB_JOB_INFO[job].label);
  const groupMeetingLiveInfo = useGroupMeetingLive(myGroupId);
  const groupMeetingLive = !!groupMeetingLiveInfo;
  const groupLiveWeekId = groupMeetingLiveInfo?.weekId ?? null;
  const hubMeetingLive = hubsMeetingLive || !!myHub?.meetingLive;
  const currentLabel = isAdmin ? 'Admin' : ([...myGroupNames, ...myHubJobLabels].join(' · ') || null);
  const formatDateLabel = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };
  const cohortOptions = sortByText(cohorts, (cohort) => cohort.name).map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
    meta: cohort.startDate && cohort.endDate
      ? `${formatDateLabel(cohort.startDate)} to ${formatDateLabel(cohort.endDate)}`
      : 'No dates set',
  }));

  const practiceLocked = isAdmin && !!activeCohort?.isPractice;
  useEffect(() => {
    if (practiceLocked && isLockedInPractice(location.pathname)) navigate('/dashboard', { replace: true });
  }, [practiceLocked, location.pathname, navigate]);

  return (
    <PracticeLockContext.Provider value={practiceLocked}>
    <div className="app-shell-bg min-h-screen text-gray-900">
      {/* The update prompt is mounted once, app-wide, in App.tsx. */}
      <NewNotificationBanner />
      {activeCohort?.isPractice && (
        practicePulse?.active ? (
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-violet-700 px-4 py-2 text-white">
            <span className="min-w-0 truncate text-[12.5px] font-semibold">With {practicePulse.active.partnerName.split(' ')[0]} · {PRACTICE_ROLE_LABEL[practicePulse.active.myRole]}</span>
            <button
              type="button"
              onClick={() => { const id = practicePulse.active!.id; void practiceApi.peerEnd(id).then(() => refreshPracticePulse()); }}
              className="flex-none rounded-full bg-white px-4 py-1.5 text-[12.5px] font-bold text-violet-800 shadow-sm active:scale-[0.97]"
            >
              End walkthrough
            </button>
          </div>
        ) : isAdmin ? (
          <div className="sticky top-0 z-40 bg-[#3f4757] px-4 py-1.5 text-center text-[12px] font-semibold text-white">Practice cohort. Users and Resources are switched off here.</div>
        ) : (
          <button
            type="button"
            onClick={() => { if (returnCohortId) void returnToRealCohort(); }}
            disabled={!returnCohortId || returningToReal}
            className="sticky top-0 z-40 flex w-full items-center justify-center gap-2 bg-[#3f4757] px-4 py-1.5 text-center text-[12px] font-semibold text-white disabled:cursor-default"
          >
            {returnCohortId ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">Test mode</span>
                <span>{returningToReal ? 'Switching…' : 'Tap to return to your real cohort'}</span>
              </span>
            ) : (
              <span>Test mode. Nothing here is real.</span>
            )}
          </button>
        )
      )}
      {showAppSetup && appSetupSlot && <AppSetupSheet audience="staff" enable={enable} onClose={closeAppSetup} />}
      {!tourBusy && user && activeCohort && classFeedbackDueWeek && classFeedbackSlot && (
        <ClassFeedbackModal
          weekNumber={classFeedbackDueWeek.weekNumber}
          onSend={async (note) => {
            await classFeedbackApi.submitSupportFeedback({ cohortId: activeCohort.id, weekId: classFeedbackDueWeek.weekId, supportId: user.id, note, isNone: false });
            markClassFeedbackAnswered();
          }}
          onNone={async () => {
            await classFeedbackApi.submitSupportFeedback({ cohortId: activeCohort.id, weekId: classFeedbackDueWeek.weekId, supportId: user.id, note: '', isNone: true });
            markClassFeedbackAnswered();
          }}
          onDismiss={dismissClassFeedback}
        />
      )}
      {/* Supports: ask about logins they made over an hour ago but never marked as sent. */}
      {user && (
        <LoginShareReminder userId={user.id} enabled={isSupport && !tourBusy && !classFeedbackDueWeek && !pendingIntroJob} />
      )}
      {/* Supports: asked once if they are following up the people they were given. */}
      {user && (
        <PracticeDock
          mode="staff"
          active={isSupport && practiceOn && !!activeCohort?.isPractice}
          pulse={practicePulse}
          refreshPulse={refreshPracticePulse}
          onWorkspaceChanged={() => {
            setWorkspaceRevision((n) => n + 1);
            window.dispatchEvent(new Event('fof:workspace-changed'));
            void refreshMyHub();
          }}
        />
      )}
      {user && isSupport && practiceOn && (
        <PracticeIncoming
          request={practicePulse?.incoming?.[0]}
          onAnswered={(accepted) => {
            void (async () => {
              await refreshPracticePulse();
              if (!accepted) return;
              const practiceCohort = cohorts.find((c) => c.isPractice);
              if (practiceCohort && activeCohort?.id !== practiceCohort.id) await setActiveCohort(practiceCohort.id);
              await refreshMyHub();
            })();
          }}
        />
      )}
      {user && !user.mustChangePassword && <AnnouncementPopupHost enabled={!tourBusy} />}
      {user && <FollowUpCheckPrompt enabled={isSupport && !tourBusy && !classFeedbackDueWeek && !pendingIntroJob && !showAppSetup} />}
      {OPEN_GUIDE_AS_WELCOME && !tourBusy && !classFeedbackDueWeek && pendingIntroJob && introSlot && (
        <RoleGuideModal job={pendingIntroJob} onClose={() => finishIntro(pendingIntroJob)} />
      )}
      {!OPEN_GUIDE_AS_WELCOME && !tourBusy && !classFeedbackDueWeek && pendingIntroJob && introSlot && (
        <HubRoleIntroModal
          job={pendingIntroJob}
          onGotIt={() => finishIntro(pendingIntroJob)}
          onSeeGuide={() => { finishIntro(pendingIntroJob); setGuideJob(pendingIntroJob); }}
        />
      )}
      {guideJob && <RoleGuideModal job={guideJob} onClose={() => setGuideJob(null)} />}

      <aside className="surface-card fixed inset-y-4 left-4 z-30 hidden w-72 flex-col overflow-hidden lg:flex">
        <div className="border-b border-orange-100 px-6 py-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(isSupport ? '/support' : '/dashboard')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(isSupport ? '/support' : '/dashboard'); } }}
            aria-label="FOF Ops home"
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <BrandMark />
            <div>
              <p className="text-base font-bold text-gray-900">FOF Ops</p>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); window.location.reload(); }}
                className="text-xs text-gray-400 hover:text-primary transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>

        <nav data-wt="app-nav" className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {isSupport ? (
            <div className="space-y-2">
              {navItems.map((item) => (
                <NavItemLink
                  key={item.to}
                  item={item}
                  active={isNavActive(location.pathname, item.to)}
                  globalPendingCount={globalPendingChanges.length}
                  newResourceCount={newResourceCount}
                  hasNewHubActivity={hasNewHubActivity}
                  hubMeetingLive={hubMeetingLive}
                  groupMeetingLive={groupMeetingLive}
                  groupLiveWeekId={groupLiveWeekId}
                />
              ))}
            </div>
          ) : navGroups.map((group) => (
            <NavGroupSection
              key={group.label}
              group={group}
              open={isNavGroupOpen(group.label)}
              onToggle={() => toggleNavGroup(group.label)}
              locationPathname={location.pathname}
              globalPendingCount={globalPendingChanges.length}
              newResourceCount={newResourceCount}
              hasNewHubActivity={hasNewHubActivity}
            />
          ))}
        </nav>

        <div className="border-t border-orange-100 px-4 py-4">
          <div className="surface-muted flex items-center gap-3 px-4 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-sm font-bold text-primary">
              {user?.name?.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{currentLabel ?? 'Support'}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={() => setOpen(false)} />
          <div className="surface-card relative m-4 flex w-80 flex-col overflow-hidden !bg-white">
            <div className="flex items-center justify-between border-b border-orange-100 px-5 py-5">
            <div className="flex items-center gap-2">
              <BrandMark size={40} />
              <div>
                <p className="text-base font-bold text-gray-900">FOF Ops</p>
                <button
                  type="button"
                  onClick={() => { window.location.reload(); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-primary transition-colors"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-orange-50 hover:text-gray-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {cohortOptions.length > 0 && (
                <div className="mb-4 rounded-3xl border border-orange-100 bg-orange-50/45 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Active Cohort</p>
                  <AppSelect
                    value={activeCohort?.id || ''}
                    onChange={(cohortId) => {
                      void setActiveCohort(cohortId);
                      setOpen(false);
                    }}
                    options={cohortOptions}
                    placeholder="Choose cohort"
                    compact
                  />
                </div>
              )}
              {isSupport ? (
                <div className="space-y-2">
                  {navItems.map((item) => (
                    <NavItemLink
                      key={item.to}
                      item={item}
                      active={isNavActive(location.pathname, item.to)}
                      globalPendingCount={globalPendingChanges.length}
                      newResourceCount={newResourceCount}
                      hasNewHubActivity={hasNewHubActivity}
                      hubMeetingLive={hubMeetingLive}
                      groupMeetingLive={groupMeetingLive}
                      groupLiveWeekId={groupLiveWeekId}
                      onClick={() => setOpen(false)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {navGroups.map((group) => (
                    <NavGroupSection
                      key={group.label}
                      group={group}
                      open={isNavGroupOpen(group.label)}
                      onToggle={() => toggleNavGroup(group.label)}
                      locationPathname={location.pathname}
                      globalPendingCount={globalPendingChanges.length}
                      newResourceCount={newResourceCount}
                      onItemClick={() => setOpen(false)}
                    />
                  ))}
                </div>
              )}
            </nav>
            <div className="border-t border-orange-100 px-4 py-4">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-orange-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-[19rem]">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button type="button" onClick={() => setOpen(true)} className="rounded-2xl border border-orange-100 bg-white p-2 text-gray-500 lg:hidden">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            {user && <ProfileMenu name={user.name} avatarUrl={user.avatarUrl} profilePath={isSupport ? '/support/profile' : '/settings'} onLogout={logout} roles={user.roles} activeRole={user.role} onSwitchRole={switchRole} />}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {currentLabel && <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-700">{currentLabel}</span>}
                {activeCohort && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                    {activeCohort.name}
                  </span>
                )}
              </div>
            </div>

            {/* Bell is visible at every width — Support users are mobile-heavy
                and rely on this in-app feed when push doesn't reach them. */}
            <NotificationBell />
            <NeedSupportButton inline className="hidden lg:grid" cohortId={activeCohort?.id ?? null} />

            <div className="hidden items-center gap-3 sm:flex">
              {cohortOptions.length > 0 && (
                <div className="w-64">
                  <AppSelect
                    value={activeCohort?.id || ''}
                    onChange={(cohortId) => {
                      void setActiveCohort(cohortId);
                    }}
                    options={cohortOptions}
                    placeholder="Choose cohort"
                    compact
                  />
                </div>
              )}
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 lg:hidden"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-8">
          {/* Route-level boundary: a single page crash shows a contained error
              (nav/shell survive) and auto-recovers when the route changes. */}
          <AppSetupBanner audience="staff" enable={enable} className="mb-4" />
          <ErrorBoundary inline resetKey={location.pathname}>
            {!isSupport && (
              <SectionTabs pathname={location.pathname} isAdmin={isAdmin} pendingApprovals={globalPendingChanges.length} />
            )}
            {/* A seat switch in Practice remounts the page so it loads the new group and hub. */}
            <PracticeEntryProvider value={practiceEntry}><React.Fragment key={workspaceRevision}><Outlet /></React.Fragment></PracticeEntryProvider>
          </ErrorBoundary>
        </main>

        {/* Blocks the app until a reset password is replaced by the person's own. */}
        <ForcePasswordChangeModal />
      </div>

      <nav data-wt="app-nav" className={isSupport
        ? 'fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] max-w-[400px] -translate-x-1/2 rounded-[22px] border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(17,24,39,0.28)] lg:hidden'
        : 'fixed inset-x-0 bottom-0 z-30 border-t border-orange-100 bg-white/95 px-2 py-2 backdrop-blur lg:hidden'}
      >
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(mobileNavItems.length + (mobileMoreItems.length > 0 ? 1 : 0), 1), 5)}, minmax(0, 1fr))` }}>
          {mobileNavItems.map((item) => {
            const active = isNavActive(location.pathname, item.to);
            const isLive = (item.to === '/support/my-hub' && hubMeetingLive) || (item.to === '/support/participants' && groupMeetingLive);
            return (
              <NavLink
                key={item.to}
                to={resolveNavTo(item, hubMeetingLive, groupMeetingLive, groupLiveWeekId)}
                className={isSupport
                  ? `relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${active ? 'bg-primary text-white' : 'text-gray-500'}`
                  : `relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium ${active ? 'bg-orange-50 text-primary' : 'text-gray-500'}`}
              >
                <span className="relative inline-flex">
                  {item.icon}
                  {isLive && <LiveNavDot className="absolute -right-1.5 -top-1" ringClass={active ? (isSupport ? 'ring-primary' : 'ring-orange-50') : 'ring-white'} />}
                </span>
                <span className="truncate">{item.mobileLabel ?? item.label}</span>
                {item.to === '/schedule' && globalPendingChanges.length > 0 && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
                {item.to.includes('community') && hasNewHubActivity && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </NavLink>
            );
          })}
          {mobileMoreItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-expanded={moreOpen}
              className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${moreActive || moreOpen ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-500'}`}
            >
              {ICONS.more}
              <span className="truncate">More</span>
              {(hasNewHubActivity || mobileMoreItems.some((item) => (item.to === '/support/my-hub' && hubMeetingLive) || (item.to === '/support/participants' && groupMeetingLive))) && (
                <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          )}
        </div>
      </nav>

      {moreOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-default" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-[92px] flex w-[168px] flex-col gap-0.5 rounded-2xl border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(17,24,39,0.3)]"
            style={{ right: 'max(18px, calc(50% - 194px))' }}
          >
            {mobileMoreItems.map((item) => {
              const active = isNavActive(location.pathname, item.to);
              const isLive = (item.to === '/support/my-hub' && hubMeetingLive) || (item.to === '/support/participants' && groupMeetingLive);
              return (
                <NavLink
                  key={item.to}
                  to={resolveNavTo(item, hubMeetingLive, groupMeetingLive, groupLiveWeekId)}
                  onClick={() => setMoreOpen(false)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-800 hover:bg-gray-50'}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.to.includes('community') && hasNewHubActivity && <NavDot />}
                  {isLive && <LiveNavDot className="ml-auto" ringClass="ring-transparent" />}
                </NavLink>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      <NeedSupportButton className="lg:hidden" cohortId={activeCohort?.id ?? null} />
    </div>
    </PracticeLockContext.Provider>
  );
};

export default AppShell;
