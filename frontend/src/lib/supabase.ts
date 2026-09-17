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

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const timeoutSignal = AbortSignal.timeout(url.includes('/functions/v1/ai-assist') ? AI_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? (signalAny ? signalAny([init.signal, timeoutSignal]) : init.signal)
    : timeoutSignal;
  return fetch(routeLocally(input), { ...withSessionToken(init), signal });
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
  role: 'ADMIN' | 'SOP_PREPARER' | 'SUPPORT'
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
