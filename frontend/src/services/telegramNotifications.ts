import { supabase } from '../lib/supabase';
import type { TelegramNotificationEvent } from '../types';

export const sendTelegramNotification = async (payload: TelegramNotificationEvent): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('notify-telegram', {
      body: payload,
    });

    if (error) {
      console.warn('Telegram notification failed:', error.message);
    }
  } catch (error) {
    console.warn('Telegram notification invocation failed:', error);
  }
};
