import https from 'https';

type ChangeType = 'ADD' | 'EDIT' | 'DELETE';
type ActorRole = 'ADMIN' | 'SUPPORT' | 'SYSTEM';

export interface TelegramNotificationEvent {
  event: 'CHANGE_REQUEST_CREATED' | 'CHANGE_APPROVED' | 'CHANGE_REJECTED';
  changeType: ChangeType;
  actorName: string;
  actorRole: ActorRole;
  requestId: string;
  weekId?: number;
  dayName?: string;
  summary?: string;
  timestamp?: string;
}

const isTelegramEnabled = (): boolean => {
  const enabled = (process.env.TELEGRAM_ENABLED || '').toLowerCase();
  return enabled === 'true' || enabled === '1' || enabled === 'yes';
};

const toTelegramMessage = (payload: TelegramNotificationEvent): string => {
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

  return lines.join('\n');
};

export const sendTelegramNotification = async (payload: TelegramNotificationEvent): Promise<void> => {
  if (!isTelegramEnabled()) {
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  try {
    const requestBody = JSON.stringify({
      chat_id: chatId,
      text: toTelegramMessage(payload),
    });

    await new Promise<void>((resolve) => {
      const request = https.request(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
          },
        },
        (response) => {
          let responseBody = '';

          response.on('data', (chunk) => {
            responseBody += chunk;
          });

          response.on('end', () => {
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              console.error('Telegram API error:', {
                status: response.statusCode,
                body: responseBody,
              });
            }
            resolve();
          });
        }
      );

      request.on('error', (error) => {
        console.error('Telegram request failed:', error);
        resolve();
      });

      request.write(requestBody);
      request.end();
    });
  } catch (error) {
    console.error('Telegram send failed:', error);
  }
};
