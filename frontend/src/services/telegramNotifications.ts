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

const sendTelegramDirectFallback = async (
  payload: TelegramNotificationEvent,
  timeoutMs: number
): Promise<void> => {
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.VITE_TELEGRAM_GROUP_CHAT_ID;

  if (!botToken || !chatId) {
    return;
  }

  const eventLabel = payload.event.split('_').join(' ');
  const lines = [
    `FOF Scheduler: ${eventLabel}`,
    `Action: ${payload.changeType}`,
    `Actor: ${payload.actorName} (${payload.actorRole})`,
    `Request ID: ${payload.requestId}`,
  ];

  if (typeof payload.weekId === 'number') {
    lines.push(`Week ID: ${payload.weekId}`);
  }

  if (payload.dayName) {
    lines.push(`Day: ${payload.dayName}`);
  }

  if (payload.summary) {
    lines.push(`Summary: ${payload.summary}`);
  }

  lines.push(`At: ${payload.timestamp || new Date().toISOString()}`);

  // Telegram Bot API does not reliably support browser CORS for JSON POSTs.
  // Use a GET request with `no-cors` mode as a best-effort fallback.
  const text = lines.join('\n');
  const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${encodeURIComponent(
    chatId
  )}&text=${encodeURIComponent(text)}`;

  try {
    await fetchWithTimeout(url, { method: 'GET', mode: 'no-cors' }, timeoutMs);
  } catch (error) {
    // Best-effort only: if this fails, we still don't want to break the main action.
    console.warn('Direct Telegram fallback failed:', error);
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
      await sendTelegramDirectFallback(payload, timeoutMs);
    }
  } catch (error) {
    console.warn('Telegram notification invocation failed:', error);
    try {
      await sendTelegramDirectFallback(payload, timeoutMs);
    } catch (fallbackError) {
      console.warn('Telegram fallback notification failed:', fallbackError);
    }
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
