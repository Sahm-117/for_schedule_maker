// Once the first screen is up and the browser is idle, download the other screens on the bottom bar,
// so the next tap opens at once instead of waiting for its code. Skipped on Data Saver and slow links.
const prefetchWhenIdle = (loaders: Array<() => Promise<unknown>>): void => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return;
  const start = () => {
    // One at a time, so they never compete with something the person just opened.
    loaders.reduce<Promise<unknown>>((chain, load) => chain.then(() => load().catch(() => undefined)).then(() => new Promise((resolve) => setTimeout(resolve, 400))), Promise.resolve());
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  const arm = () => { if (ric) ric(start, { timeout: 8000 }); else setTimeout(start, 4000); };
  if (document.readyState === 'complete') arm(); else window.addEventListener('load', arm, { once: true });
};


// A returning person's sign-in is checked on every load, and only then does the app know
// which screens to download. This starts those downloads straight away, in parallel with the
// check, using what was saved last time (who they are, and the page they opened). If it
// guesses wrong, the only cost is a few unused kilobytes.
export function prefetchLikelyScreens(): void {
  try {
    if (!localStorage.getItem('accessToken')) return;
    const role = JSON.parse(localStorage.getItem('user') || 'null')?.role as string | undefined;
    if (!role) return;
    const path = window.location.pathname;
    if (role === 'PARTICIPANT') {
      void import('./components/participantApp/ParticipantShell');
      // Ask for the home data now, in parallel with the sign-in check, instead of after the
      // screen has loaded and run. The screen's own request reuses this answer (lib/supabase.ts).
      void import('./services/supabase-api').then(({ participantAppApi }) => {
        void participantAppApi.getHome().catch(() => undefined);
        void participantAppApi.getNotifications().catch(() => undefined);
      });
      if (path === '/' || path === '/me') void import('./pages/ParticipantHomePage');
      prefetchWhenIdle([
        () => import('./pages/ParticipantJourneyPage'),
        () => import('./pages/ParticipantFaithPage'),
        () => import('./pages/ParticipantGroupPage'),
        () => import('./pages/ParticipantWeekPage'),
      ]);
      return;
    }
    void import('./components/StaffApp');
    if (role === 'ADMIN' && (path === '/' || path === '/dashboard')) void import('./pages/AdminDashboardPage');
    if (role !== 'ADMIN' && (path === '/' || path === '/support')) void import('./pages/SupportHomePage');
    if (role === 'ADMIN') {
      prefetchWhenIdle([
        () => import('./pages/AdminSchedulePage'),
        () => import('./pages/AdminApprovalsPage'),
        () => import('./pages/AdminResourcesPage'),
      ]);
    } else {
      prefetchWhenIdle([
        () => import('./pages/SupportSchedulePage'),
        () => import('./pages/SupportParticipantsPage'),
        () => import('./pages/SupportMyHubPage'),
      ]);
    }
  } catch {
    // Private browsing or damaged storage: skip it, the app loads as usual.
  }
}
