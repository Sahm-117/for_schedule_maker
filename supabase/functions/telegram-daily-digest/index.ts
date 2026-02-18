import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

type DigestRequestBody = {
  force?: boolean;
  weekNumber?: number;
  pdfUrl?: string;
};

const DIGEST_TIMEZONE = 'Africa/Lagos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

const parseWeekNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const formatRunDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const getDayName = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TIMEZONE,
    weekday: 'long',
  }).format(date);
};

const formatTime = (time: string): string => {
  const parts = time.split(':');
  if (parts.length < 2) return time;

  const hour24 = Number.parseInt(parts[0], 10);
  const minute = parts[1];
  if (!Number.isFinite(hour24)) return time;

  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
};

const getPdfUrl = (weekNumber: number, bodyPdfUrl?: string): string | undefined => {
  if (typeof bodyPdfUrl === 'string' && bodyPdfUrl.trim().length > 0) {
    return bodyPdfUrl.trim();
  }

  const sopUrl = Deno.env.get('TELEGRAM_DIGEST_SOP_URL')?.trim();
  if (sopUrl) return sopUrl;

  const direct = Deno.env.get('TELEGRAM_DIGEST_PDF_URL')?.trim();
  if (direct) return direct;

  const template = Deno.env.get('PDF_URL_TEMPLATE')?.trim();
  if (!template) return undefined;

  return template.replaceAll('{weekNumber}', String(weekNumber));
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

  let body: DigestRequestBody = {};
  try {
    body = (await req.json()) as DigestRequestBody;
  } catch {
    body = {};
  }

  const force = parseBoolean(body.force) || parseBoolean(new URL(req.url).searchParams.get('force'));

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Supabase environment configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const runDate = formatRunDate(now);
  const dayName = getDayName(now);

  const { data: existingLog, error: logCheckError } = await supabase
    .from('TelegramDigestLog')
    .select('id, status')
    .eq('runDate', runDate)
    .eq('timezone', DIGEST_TIMEZONE)
    .maybeSingle();

  if (logCheckError) {
    return new Response(JSON.stringify({ ok: false, error: logCheckError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (existingLog && !force) {
    return new Response(JSON.stringify({
      ok: true,
      status: 'SKIPPED',
      reason: `Digest already processed for ${runDate} (${DIGEST_TIMEZONE})`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: weeks, error: weeksError } = await supabase
    .from('Week')
    .select('id, weekNumber, Day(id, dayName, Activity(id, time, description, orderIndex, period, ActivityLabel(Label(name))))')
    .order('weekNumber', { ascending: true });

  if (weeksError || !weeks || weeks.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: weeksError?.message || 'No week data found' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bodyWeekNumber = parseWeekNumber(body.weekNumber);
  const envWeekNumber = parseWeekNumber(Deno.env.get('TELEGRAM_DIGEST_WEEK_NUMBER'));
  const targetWeekNumber = bodyWeekNumber || envWeekNumber || 1;

  const sortedWeeks = [...weeks].sort((a: any, b: any) => (a.weekNumber as number) - (b.weekNumber as number));
  const selectedWeek = sortedWeeks.find((week: any) => week.weekNumber === targetWeekNumber) || sortedWeeks[0];

  const selectedDay = ((selectedWeek as any).Day || []).find((day: any) => day.dayName === dayName);
  const dayActivities = selectedDay ? ((selectedDay.Activity || []) as any[]) : [];

  const sortedActivities = [...dayActivities].sort((a, b) => {
    if (a.time !== b.time) return String(a.time).localeCompare(String(b.time));
    const ai = typeof a.orderIndex === 'number' ? a.orderIndex : 0;
    const bi = typeof b.orderIndex === 'number' ? b.orderIndex : 0;
    return ai - bi;
  });

  const digestLines: string[] = sortedActivities.length === 0
    ? ['😌 No scheduled activities for today.']
    : sortedActivities.map((activity) => {
        const labels = ((activity.ActivityLabel || []) as any[])
          .map((entry) => entry?.Label?.name)
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

        const labelsText = labels.length > 0
          ? `\n🏷️ ${labels.join(', ')}`
          : '';

        return `🕒 ${formatTime(String(activity.time))} - ${String(activity.description || '')}${labelsText}`;
      });

  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim();
  const payload = {
    event: 'DAILY_DIGEST',
    weekId: (selectedWeek as any).id as number,
    weekNumber: (selectedWeek as any).weekNumber as number,
    dayName,
    timestamp: now.toISOString(),
    digestTitle: '✨ FOF IKD - SOP Manager',
    digestLines,
    pdfUrl: getPdfUrl((selectedWeek as any).weekNumber as number, body.pdfUrl),
    loginUrl: appBaseUrl,
  };

  const notifyRes = await fetch(`${url}/functions/v1/notify-telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });

  const notifyBody = await notifyRes.json().catch(() => ({}));
  const status = notifyRes.ok && (notifyBody as any)?.ok ? 'SENT' : 'FAILED';

  if (existingLog?.id) {
    await supabase
      .from('TelegramDigestLog')
      .update({
        weekNumber: (selectedWeek as any).weekNumber as number,
        dayName,
        status,
        details: notifyBody,
      })
      .eq('id', existingLog.id);
  } else {
    await supabase
      .from('TelegramDigestLog')
      .insert([{
        runDate,
        timezone: DIGEST_TIMEZONE,
        weekNumber: (selectedWeek as any).weekNumber as number,
        dayName,
        status,
        details: notifyBody,
      }]);
  }

  if (!notifyRes.ok || !(notifyBody as any)?.ok) {
    const details = typeof notifyBody === 'object' ? notifyBody : { raw: String(notifyBody) };
    return new Response(JSON.stringify({
      ok: false,
      status: 'FAILED',
      error: 'Daily digest dispatch failed',
      details,
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    status: 'SENT',
    runDate,
    timezone: DIGEST_TIMEZONE,
    weekNumber: (selectedWeek as any).weekNumber,
    dayName,
    digestCount: sortedActivities.length,
    notify: notifyBody,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
