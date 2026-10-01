import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  console.warn('Supabase environment variables are not set. Supabase mode is unavailable.');
}

// Wrap fetch with a timeout so a hung network request can't freeze the UI
// indefinitely (a request that never resolves leaves loaders spinning forever).
// This only affects REST/PostgREST + auth HTTP calls — realtime uses a
// WebSocket and is untouched. Any caller-supplied AbortSignal is preserved.
const REQUEST_TIMEOUT_MS = 20000;
// AI help can wait on a busy free model and fall back to the next, so give it longer.
const AI_REQUEST_TIMEOUT_MS = 150000;

// Local development only: send the named edge functions to locally running copies
// (VITE_LOCAL_FUNCTIONS_URL, e.g. http://localhost:54330) so unreleased function
// changes can be tried before they are deployed. Never set in production.
const localFunctionsUrl = import.meta.env.DEV ? (import.meta.env.VITE_LOCAL_FUNCTIONS_URL as string | undefined) : undefined;
const LOCAL_FUNCTIONS = /\/functions\/v1\/(ai-assist|notify-users|send-announcement)(?=$|\?)/;
const routeLocally = (input: RequestInfo | URL): RequestInfo | URL => {
  if (!localFunctionsUrl) return input;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const match = url.match(LOCAL_FUNCTIONS);
  return match ? `${localFunctionsUrl}/${match[1]}` : input;
};
// AbortSignal.any may be absent in older lib typings/runtimes; reference it
// through a typed optional shape instead of `any`.
const signalAny = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;

// Carry the app's own session token on every request so table policies can tell
// a signed-in member of the team from an anonymous caller. This app doesn't use
// Supabase auth, so without this header every browser request looks identical
// to a stranger holding the public key. PostgREST hands the header to SQL,
// where app_is_staff() reads it back.
//
// Read from localStorage per request rather than once at module load, so a
// fresh sign-in or a sign-out takes effect immediately.
const SESSION_TOKEN_HEADER = 'x-session-token';
export const SESSION_TOKEN_KEY = 'sessionToken';
const withSessionToken = (init: RequestInit | undefined): RequestInit | undefined => {
  let token = '';
  try {
    token = localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    // Storage can throw in private browsing; carry on without the header.
    return init;
  }
  if (!token) return init;
  const headers = new Headers(init?.headers);
  headers.set(SESSION_TOKEN_HEADER, token);
  return { ...init, headers };
};

// AbortSignal.timeout is missing before iOS 16 / Safari 16; without this
// fallback every request there throws and sign-in shows "Connection error".
const timeoutSignalFor = (ms: number): AbortSignal => {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

// The same read is often asked for by several parts of a screen at once (a dozen duplicate
// requests on one load). Identical reads that overlap in time share one network request.
// Only plain reads are shared: GET selects, and a short list of read-only functions.
const SHAREABLE_RPCS = ['my_help_contact', 'get_my_hubs', 'get_my_hub', 'support_recaps', 'my_notifications', 'participant_home', 'participant_notifications'];
// A participant's home data is asked for at start-up (prefetch.ts) before the screen is ready
// to use it. These answers are kept for about three seconds so the screen picks them up instead of
// asking again. Any change the person makes (a write) throws them away, so nothing stale is shown.
const KEPT_RPCS = ['participant_home', 'participant_notifications'];
const KEEP_MS = 3000;
const HARMLESS_POSTS = /\/rest\/v1\/rpc\/(get_session_user|get_tour_progress|record_participant_app_state|record_participant_setup_sheet|record_user_app_state|record_user_setup_sheet|my_help_contact|get_my_hubs|get_my_hub|support_recaps|my_notifications|participant_home|participant_notifications)$/;
const inFlight = new Map<string, Promise<Response>>();
const keptKeys = new Set<string>();
const dropKept = () => { keptKeys.forEach((k) => inFlight.delete(k)); keptKeys.clear(); };
const shareKey = (url: string, init: RequestInit | undefined): string | null => {
  if (init?.signal) return null; // a caller that can cancel gets its own request
  const method = (init?.method || 'GET').toUpperCase();
  if (method === 'GET' && url.includes('/rest/v1/')) {
    const h = new Headers(init?.headers);
    return `GET ${url} ${h.get('accept') || ''} ${h.get('prefer') || ''} ${h.get('range') || ''} ${h.get('accept-profile') || ''}`;
  }
  if (method === 'POST' && typeof init?.body === 'string') {
    const name = url.split('/rest/v1/rpc/')[1]?.split('?')[0];
    if (name && SHAREABLE_RPCS.includes(name)) return `RPC ${name} ${init.body}`;
  }
  return null;
};

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const timeoutSignal = timeoutSignalFor(url.includes('/functions/v1/ai-assist') ? AI_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? (signalAny ? signalAny([init.signal, timeoutSignal]) : init.signal)
    : timeoutSignal;
  const send = () => fetch(routeLocally(input), { ...withSessionToken(init), signal });
  const key = shareKey(url, init);
  if (!key) {
    // A real change drops the saved answers. Start-up bookkeeping and plain reads sent as POSTs don't.
    if ((init?.method || 'GET').toUpperCase() !== 'GET' && !HARMLESS_POSTS.test(url.split('?')[0])) dropKept();
    return send();
  }
  let pending = inFlight.get(key);
  if (!pending) {
    pending = send();
    inFlight.set(key, pending);
    const made = pending;
    const keep = KEPT_RPCS.some((name) => key.startsWith(`RPC ${name} `));
    made.then(
      () => {
        if (!keep) { inFlight.delete(key); return; }
        keptKeys.add(key);
        setTimeout(() => { if (inFlight.get(key) === made) inFlight.delete(key); keptKeys.delete(key); }, KEEP_MS);
      },
      () => { inFlight.delete(key); },
    );
  }
  // Everyone gets their own copy, so one reader can't use up another's body.
  return pending.then((response) => response.clone());
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: { fetch: fetchWithTimeout },
    })
  : (null as unknown as ReturnType<typeof createClient>);

// Database types
export interface User {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'SUPPORT'
  isActive?: boolean
  deactivatedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Cohort {
  id: string
  name: string
  description?: string | null
  venue?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
}

export interface Week {
  id: number
  cohortId: string
  weekNumber: number
  title?: string | null
}

export interface Day {
  id: number
  weekId: number
  dayName: string
  week?: Week
}

export interface Activity {
  id: number
  dayId: number
  time: string
  description: string
  period: 'MORNING' | 'AFTERNOON' | 'EVENING'
  orderIndex: number
  day?: Day
}

export interface PendingChange {
  id: string
  weekId: number
  changeType: 'ADD' | 'EDIT' | 'DELETE'
  changeData: any
  userId: string
  createdAt: string
  user?: User
}

export interface RejectedChange {
  id: string
  weekId: number
  changeType: 'ADD' | 'EDIT' | 'DELETE'
  changeData: any
  userId: string
  submittedAt: string
  rejectedBy: string
  rejectedAt: string
  rejectionReason: string
  isRead: boolean
  user?: User
}
