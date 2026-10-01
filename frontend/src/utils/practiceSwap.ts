import { practiceApi, authApi } from '../services/api';
import { SESSION_TOKEN_KEY } from '../lib/supabase';

// Stepping into a practice participant swaps the stored sign-in for a
// participant one, and keeps the person's own sign-in to put back.
const STASH_KEY = 'fofPracticeStash';
const AUTH_KEYS = ['accessToken', 'refreshToken', SESSION_TOKEN_KEY, 'user'] as const;

export const isInParticipantView = (): boolean => {
  try { return !!localStorage.getItem(STASH_KEY); } catch { return false; }
};

export const enterParticipantView = async (): Promise<void> => {
  const { token, user } = await practiceApi.enterParticipant();
  const stash: Record<string, string | null> = {};
  AUTH_KEYS.forEach((key) => { stash[key] = localStorage.getItem(key); });
  localStorage.setItem(STASH_KEY, JSON.stringify(stash));
  localStorage.setItem('accessToken', `mock_token_${user.id}`);
  localStorage.setItem('refreshToken', `refresh_token_${user.id}`);
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem('user', JSON.stringify(user));
  window.location.assign('/me');
};

export const leaveParticipantView = async (): Promise<void> => {
  let stash: Record<string, string | null> | null = null;
  try { stash = JSON.parse(localStorage.getItem(STASH_KEY) || 'null'); } catch { stash = null; }
  const participantToken = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!stash) {
    // Nothing to go back to: sign the practice session out so they can sign in as themselves.
    if (participantToken) { try { await authApi.signOut(participantToken); } catch { /* it expires on its own */ } }
    AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    window.location.assign('/login');
    return;
  }
  AUTH_KEYS.forEach((key) => {
    const value = stash![key];
    if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  });
  localStorage.removeItem(STASH_KEY);
  try { await practiceApi.leaveParticipant(); } catch { /* the flag clears itself on the next set-up */ }
  if (participantToken) {
    try { await authApi.signOut(participantToken); } catch { /* it expires on its own */ }
  }
  window.location.assign('/support/my-schedule');
};
