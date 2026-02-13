import { supabase } from '../lib/supabase';
import type { TelegramNotificationEvent } from '../types';

const sendTelegramDirectFallback = async (payload: TelegramNotificationEvent): Promise<void> => {
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
    await fetch(url, { method: 'GET', mode: 'no-cors' });
  } catch (error) {
    // Best-effort only: if this fails, we still don't want to break the main action.
    console.warn('Direct Telegram fallback failed:', error);
  }
};

export const sendTelegramNotification = async (payload: TelegramNotificationEvent): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('notify-telegram', {
      body: payload,
    });

    if (error) {
      console.warn('Edge function Telegram notification failed:', error.message);
      await sendTelegramDirectFallback(payload);
    }
  } catch (error) {
    console.warn('Telegram notification invocation failed:', error);
    try {
      await sendTelegramDirectFallback(payload);
    } catch (fallbackError) {
      console.warn('Telegram fallback notification failed:', fallbackError);
    }
  }
};
