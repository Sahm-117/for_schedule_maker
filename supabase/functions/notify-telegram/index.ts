import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type ChangeType = 'ADD' | 'EDIT' | 'DELETE';
type ActorRole = 'ADMIN' | 'SUPPORT' | 'SYSTEM';
type TelegramEvent =
  | 'CHANGE_REQUEST_CREATED'
  | 'CHANGE_APPROVED'
  | 'CHANGE_REJECTED'
  | 'DAILY_DIGEST';

interface TelegramNotificationEvent {
  event: TelegramEvent;
  changeType?: ChangeType;
  actorName?: string;
  actorRole?: ActorRole;
  requestId?: string;
  weekId?: number;
  weekNumber?: number;
  dayName?: string;
  summary?: string;
  timestamp?: string;
  loginUrl?: string;
  digestTitle?: string;
  digestLines?: string[];
  pdfUrl?: string;
}

interface SendResult {
  chatId: string;
  status: number;
  body: unknown;
}

interface SendFailure {
  chatId: string;
  status: number;
  error: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DIGEST_TIMEZONE = 'Africa/Lagos';

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const parseChatIds = (raw?: string | null): string[] => {
  if (!raw) return [];

  const seen = new Set<string>();
  const chatIds: string[] = [];

  for (const part of raw.split(',')) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    chatIds.push(value);
  }

  return chatIds;
};

const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const splitMessageByLines = (text: string, maxLength = 3500): string[] => {
  if (text.length <= maxLength) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current.length > 0 ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    let remainder = line;
    while (remainder.length > maxLength) {
      chunks.push(remainder.slice(0, maxLength));
      remainder = remainder.slice(maxLength);
    }
    current = remainder;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
};

const formatTimestamp = (raw?: string, timeZone?: string): string => {
  if (!raw) {
    return new Date().toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
};

const toModerationMessage = (payload: TelegramNotificationEvent): string => {
  const eventLabel = payload.event.split('_').join(' ');
  const lines = [
    `FOF Scheduler: ${eventLabel}`,
    `Action: ${payload.changeType ?? 'N/A'}`,
    `Actor: ${payload.actorName ?? 'Unknown'} (${payload.actorRole ?? 'SYSTEM'})`,
  ];

  if (typeof payload.weekNumber === 'number') {
    lines.push(`Week: ${payload.weekNumber}`);
  } else if (typeof payload.weekId === 'number') {
    lines.push(`Week: ${payload.weekId}`);
  }

  if (payload.dayName) {
    lines.push(`Day: ${payload.dayName}`);
  }

  if (payload.summary) {
    lines.push(`Summary: ${payload.summary}`);
  }

  lines.push(`At: ${formatTimestamp(payload.timestamp)}`);
  return lines.join('\n');
};

const formatDigestLineHtml = (line: string): string => {
  const trimmed = line.trim();

  if (!trimmed) return '';

  if (trimmed === '🌅 Morning' || trimmed === '☀️ Afternoon' || trimmed === '🌙 Evening') {
    return `<b>${escapeHtml(trimmed)}</b>`;
  }

  if (trimmed.startsWith('🕒 ')) {
    const body = trimmed.slice(3).trim();
    const [timePart, ...descriptionParts] = body.split(' - ');
    const time = timePart?.trim() || '';
    const description = descriptionParts.join(' - ').trim();

    if (description) {
      return `🕒 <b>${escapeHtml(time)}</b> - ${escapeHtml(description)}`;
    }

    return `🕒 <b>${escapeHtml(body)}</b>`;
  }

  if (trimmed.startsWith('🏷️ ')) {
    return `🏷️ <b>${escapeHtml(trimmed.slice(3).trim())}</b>`;
  }

  return escapeHtml(trimmed);
};

const toDailyDigestMessage = (payload: TelegramNotificationEvent): string => {
  const title = payload.digestTitle || 'FOF IKD - SOP Manager';
  const lines = [
    `<b>${escapeHtml(title)}</b>`,
    `🗓️ <i>${escapeHtml(formatTimestamp(payload.timestamp, DIGEST_TIMEZONE))}</i>`,
  ];

  if (typeof payload.weekNumber === 'number' && payload.dayName) {
    lines.push(`📚 <b>Week ${payload.weekNumber} • ${escapeHtml(payload.dayName)}</b>`);
  } else if (typeof payload.weekNumber === 'number') {
    lines.push(`📚 <b>Week ${payload.weekNumber}</b>`);
  } else if (payload.dayName) {
    lines.push(`📚 <b>${escapeHtml(payload.dayName)}</b>`);
  }

  lines.push('━━━━━━━━━━━━━━');
  lines.push('🌟 <b>Activities for today</b>');

  if (Array.isArray(payload.digestLines) && payload.digestLines.length > 0) {
    lines.push('');
    lines.push(...payload.digestLines.map(formatDigestLineHtml));
  } else if (payload.summary) {
    lines.push(escapeHtml(payload.summary));
  }

  return lines.join('\n');
};

const resolveTargetChatIds = (payload: TelegramNotificationEvent): string[] => {
  const legacy = parseChatIds(Deno.env.get('TELEGRAM_CHAT_ID'));
  const alertChatIds = parseChatIds(Deno.env.get('TELEGRAM_ALERT_CHAT_IDS'));
  const dailyChatIds = parseChatIds(Deno.env.get('TELEGRAM_DAILY_CHAT_IDS'));

  if (payload.event === 'DAILY_DIGEST') {
    return dailyChatIds.length > 0 ? dailyChatIds : legacy;
  }

  return alertChatIds.length > 0 ? alertChatIds : legacy;
};

const getOpenAppUrl = (payload: TelegramNotificationEvent): string | undefined => {
  if (payload.loginUrl) return payload.loginUrl;
  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim();
  return appBaseUrl || undefined;
};

const getDigestPdfUrl = (payload: TelegramNotificationEvent): string | undefined => {
  if (payload.pdfUrl && payload.pdfUrl.trim().length > 0) {
    return payload.pdfUrl.trim();
  }

  const direct = Deno.env.get('TELEGRAM_DIGEST_SOP_URL')?.trim();
  if (direct) return direct;

  const template = Deno.env.get('PDF_URL_TEMPLATE')?.trim();
  if (template && typeof payload.weekNumber === 'number') {
    return template.replaceAll('{weekNumber}', String(payload.weekNumber));
  }

  return undefined;
};

const getReplyMarkup = (payload: TelegramNotificationEvent): Record<string, unknown> | undefined => {
  if (payload.event === 'DAILY_DIGEST') {
    const digestPdfUrl = getDigestPdfUrl(payload);
    if (!digestPdfUrl || !isValidHttpUrl(digestPdfUrl)) return undefined;
    return {
      inline_keyboard: [[{ text: '📄 Download SOP', url: digestPdfUrl }]],
    };
  }

  const openAppUrl = getOpenAppUrl(payload);
  if (openAppUrl && isValidHttpUrl(openAppUrl)) {
    return {
      inline_keyboard: [[{ text: 'Open App', url: openAppUrl }]],
    };
  }

  return undefined;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as TelegramNotificationEvent;
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatIds = resolveTargetChatIds(payload);

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing TELEGRAM_BOT_TOKEN secret' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (chatIds.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No Telegram chat IDs configured. Set TELEGRAM_ALERT_CHAT_IDS/TELEGRAM_DAILY_CHAT_IDS or TELEGRAM_CHAT_ID.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isDailyDigest = payload.event === 'DAILY_DIGEST';
    const text = isDailyDigest
      ? toDailyDigestMessage(payload)
      : toModerationMessage(payload);

    const replyMarkup = getReplyMarkup(payload);

    const sent: SendResult[] = [];
    const failed: SendFailure[] = [];

    for (const chatId of chatIds) {
      const messageChunks = isDailyDigest ? splitMessageByLines(text, 3500) : [text];

      try {
        let chatHadFailure = false;

        for (let i = 0; i < messageChunks.length; i += 1) {
          const chunk = messageChunks[i];
          const chunkReplyMarkup = i === messageChunks.length - 1 ? replyMarkup : undefined;

          const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              ...(isDailyDigest
                ? {
                    parse_mode: 'HTML',
                  }
                : {}),
              ...(chunkReplyMarkup
                ? {
                    reply_markup: chunkReplyMarkup,
                  }
                : {}),
            }),
          });

          const body = await telegramRes.json().catch(async () => ({ raw: await telegramRes.text().catch(() => '') }));

          if (!telegramRes.ok) {
            failed.push({
              chatId,
              status: telegramRes.status,
              error: typeof body === 'string' ? body : JSON.stringify(body),
            });
            chatHadFailure = true;
            break;
          }

          sent.push({
            chatId,
            status: telegramRes.status,
            body,
          });
        }

        if (chatHadFailure) {
          continue;
        }
      } catch (error) {
        failed.push({
          chatId,
          status: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const ok = sent.length > 0;

    return new Response(JSON.stringify({ ok, sent, failed }), {
      status: ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
