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

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join('\n'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Fallback Telegram send failed with status ${response.status}`);
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
