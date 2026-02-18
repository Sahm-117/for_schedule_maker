import type { TelegramNotificationEvent } from '../types';

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
};

export const sendTelegramNotification = async (
  payload: TelegramNotificationEvent,
  options: { timeoutMs?: number } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 2500;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing Supabase env for Telegram edge function');
    }

    const response = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/notify-telegram`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          // We don't use Supabase Auth sessions in this app; send anon JWT explicitly.
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('Edge function Telegram notification failed:', response.status, text);
    }
  } catch (error) {
    console.warn('Telegram notification invocation failed:', error);
  }
};

export const sendTelegramNotificationBestEffort = (
  payload: TelegramNotificationEvent,
  options: { timeoutMs?: number } = {}
): void => {
  // Intentionally fire-and-forget; never block business actions.
  void sendTelegramNotification(payload, options).catch((e) => {
    console.warn('Telegram notification (best effort) failed:', e);
  });
};
