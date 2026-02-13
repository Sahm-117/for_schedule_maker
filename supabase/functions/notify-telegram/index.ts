import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type ChangeType = 'ADD' | 'EDIT' | 'DELETE';
type ActorRole = 'ADMIN' | 'SUPPORT' | 'SYSTEM';

interface TelegramNotificationEvent {
  event: 'CHANGE_REQUEST_CREATED' | 'CHANGE_APPROVED' | 'CHANGE_REJECTED';
  changeType: ChangeType;
  actorName: string;
  actorRole: ActorRole;
  requestId: string;
  weekId?: number;
  weekNumber?: number;
  dayName?: string;
  summary?: string;
  timestamp?: string;
  loginUrl?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const formatTimestamp = (raw?: string): string => {
  if (!raw) return new Date().toLocaleString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  // Keep it human readable without being overly verbose.
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toMessage = (payload: TelegramNotificationEvent): string => {
  const eventLabel = payload.event.split('_').join(' ');
  const lines = [
    `FOF Scheduler: ${eventLabel}`,
    `Action: ${payload.changeType}`,
    `Actor: ${payload.actorName} (${payload.actorRole})`,
  ];

  if (typeof payload.weekNumber === 'number') {
    lines.push(`Week: ${payload.weekNumber}`);
  } else if (typeof payload.weekId === 'number') {
    // Fallback if weekNumber isn't provided.
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
    const body = (await req.json()) as TelegramNotificationEvent;
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
      return new Response(JSON.stringify({ error: 'Missing Telegram secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: toMessage(body),
        ...(body.loginUrl
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: 'Open App', url: body.loginUrl }]],
              },
            }
          : {}),
      }),
    });

    if (!telegramRes.ok) {
      const err = await telegramRes.text();
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
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
