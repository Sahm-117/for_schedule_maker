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
      if (path === '/' || path === '/me') void import('./pages/ParticipantHomePage');
      return;
    }
    void import('./components/StaffApp');
    if (role === 'ADMIN' && (path === '/' || path === '/dashboard')) void import('./pages/AdminDashboardPage');
    if (role !== 'ADMIN' && (path === '/' || path === '/support')) void import('./pages/SupportHomePage');
  } catch {
    // Private browsing or damaged storage: skip it, the app loads as usual.
  }
}
