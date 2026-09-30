import { useEffect } from 'react';

// Tapping a phone push counts as reading it. The service worker opens the app with
// "#fof-tap=<title and text of the push>"; this picks that up (on a fresh load or when the
// app was already open), removes it from the address, and hands it to `mark`, which marks
// the matching bell copy read. Nothing happens until `ready` (the person is signed in).
const PREFIX = '#fof-tap=';

export function usePushTapRead(ready: boolean, mark: (title: string, body: string) => Promise<unknown>) {
  useEffect(() => {
    if (!ready) return undefined;
    const handle = () => {
      const hash = window.location.hash;
      if (!hash.startsWith(PREFIX)) return;
      let tap: { t?: string; b?: string } | null = null;
      try { tap = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length))); } catch { tap = null; }
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      if (tap?.t) void Promise.resolve(mark(tap.t, tap.b ?? '')).catch(() => { /* the bell copy just stays unread */ });
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [ready, mark]);
}
