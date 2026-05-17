import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'fof_tour_done';

export function useTour(isAdmin: boolean, loading: boolean) {
  const started = useRef(false);

  const startTour = (force = false) => {
    const steps = isAdmin
      ? [
          {
            element: 'header',
            popover: {
              title: 'Welcome to FOF SOP Manager',
              description: 'This is your admin dashboard. You can manage the full programme schedule from here.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="admin-actions"]',
            popover: {
              title: 'Admin Actions',
              description: 'Tap here to manage users, labels, notification settings, and the daily digest.',
              side: 'bottom' as const,
              align: 'end' as const,
            },
          },
          {
            element: '[data-tour="pending-changes"]',
            popover: {
              title: 'Pending Changes',
              description: 'SOP Preparers submit change requests here for your review and approval.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="week-selector"]',
            popover: {
              title: 'Week Selector',
              description: 'Browse all 8 weeks of the FOF programme using the week list.',
              side: 'right' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="schedule-view"]',
            popover: {
              title: 'Schedule Grid',
              description: "Each day's activities are listed here, grouped by period. Click a day to expand it.",
              side: 'left' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="export-week"]',
            popover: {
              title: 'Export Schedule',
              description: 'Export any week as a PDF to share with the team.',
              side: 'bottom' as const,
              align: 'end' as const,
            },
          },
        ]
      : [
          {
            element: 'header',
            popover: {
              title: 'Welcome to FOF SOP Manager',
              description: 'This is your personal schedule view. You only see activities assigned to your support group.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="week-selector"]',
            popover: {
              title: 'Week Selector',
              description: 'Use this to browse your schedule across all 8 weeks of the programme.',
              side: 'right' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="schedule-view"]',
            popover: {
              title: 'Your Schedule',
              description: 'Your activities are shown here. Only activities tagged with your support group appear.',
              side: 'left' as const,
              align: 'start' as const,
            },
          },
          {
            element: '[data-tour="export-my-schedule"]',
            popover: {
              title: 'Export My Schedule',
              description: 'Download your personal schedule as a PDF whenever you need it.',
              side: 'bottom' as const,
              align: 'end' as const,
            },
          },
        ];

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0,0,0,0.5)',
      smoothScroll: true,
      onDestroyStarted: () => {
        driverObj.destroy();
        if (!force) localStorage.setItem(TOUR_KEY, '1');
      },
      steps,
    });

    driverObj.drive();
    if (!force) localStorage.setItem(TOUR_KEY, '1');
  };

  useEffect(() => {
    if (loading || started.current) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    started.current = true;
    // slight delay so DOM elements have rendered
    const t = setTimeout(() => startTour(false), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return { startTour: () => startTour(true) };
}
