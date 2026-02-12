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
  dayName?: string;
  summary?: string;
  timestamp?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const toMessage = (payload: TelegramNotificationEvent): string => {
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
