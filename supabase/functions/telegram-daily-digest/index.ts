import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

type DigestAction = 'send' | 'status' | 'restart';

type DigestRequestBody = {
  force?: boolean;
  action?: DigestAction;
  advance?: boolean;
  pdfUrl?: string;
};

type WeekRow = {
  id: number;
  weekNumber: number;
  Day?: Array<{
    id: number;
    dayName: string;
    Activity?: any[];
  }>;
};

type DigestCursor = {
  weekNumber: number;
  dayIndex: number;
  completed: boolean;
  lastStatus?: 'SENT' | 'FAILED' | 'SKIPPED';
  lastAttemptAt?: string;
  lastSentAt?: string;
};

const DIGEST_TIMEZONE = 'Africa/Lagos';
const DAILY_DIGEST_ENABLED_KEY = 'daily_digest_enabled';
const DAILY_DIGEST_CURSOR_KEY = 'daily_digest_cursor';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
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

const parseDigestAction = (value: unknown): DigestAction => {
  if (typeof value !== 'string') return 'send';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'status' || normalized === 'restart' || normalized === 'send') {
    return normalized;
  }
  return 'send';
};

const parseDailyDigestEnabled = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  if (value && typeof value === 'object') {
    const enabled = (value as { enabled?: unknown }).enabled;
    if (typeof enabled === 'boolean') return enabled;
  }
  return true;
};

const formatRunDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

const getMinutesFromTime = (time: string): number | null => {
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
};

type PeriodKey = 'MORNING' | 'AFTERNOON' | 'EVENING';

const resolvePeriod = (activity: any): PeriodKey => {
  const rawPeriod = typeof activity?.period === 'string' ? activity.period.trim().toUpperCase() : '';
  if (rawPeriod.includes('MORNING')) return 'MORNING';
  if (rawPeriod.includes('AFTERNOON')) return 'AFTERNOON';
  if (rawPeriod.includes('EVENING')) return 'EVENING';

  const minutes = getMinutesFromTime(String(activity?.time || ''));
  if (minutes === null) return 'EVENING';
  if (minutes < 12 * 60) return 'MORNING';
  if (minutes < 18 * 60) return 'AFTERNOON';
  return 'EVENING';
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

const getDayIndex = (dayName: string | undefined): number | null => {
  if (!dayName) return null;
  const normalized = dayName.trim().toLowerCase();
  const idx = DAY_NAMES.findIndex((name) => name.toLowerCase() === normalized);
  return idx >= 0 ? idx : null;
};

const clampDayIndex = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  if (value < 0) return 0;
  if (value > 6) return 6;
  return value;
};

const buildCursorView = (cursor: DigestCursor) => ({
  weekNumber: cursor.weekNumber,
  dayName: DAY_NAMES[cursor.dayIndex] || 'Sunday',
  completed: cursor.completed,
});

const getNextActionLabel = (cursor: DigestCursor): 'Send Digest Now' | 'Restart Digest' => {
  return cursor.completed ? 'Restart Digest' : 'Send Digest Now';
};

const getDefaultCursor = (weeks: WeekRow[]): DigestCursor => {
  return {
    weekNumber: weeks[0].weekNumber,
    dayIndex: 0,
    completed: false,
  };
};

const normalizeCursorForWeeks = (cursor: DigestCursor, weeks: WeekRow[]): DigestCursor => {
  const dayIndex = clampDayIndex(cursor.dayIndex);
  const hasWeek = weeks.some((week) => week.weekNumber === cursor.weekNumber);
  if (hasWeek) {
    return {
      ...cursor,
      dayIndex,
    };
  }

  return {
    ...getDefaultCursor(weeks),
    lastStatus: cursor.lastStatus,
    lastAttemptAt: cursor.lastAttemptAt,
    lastSentAt: cursor.lastSentAt,
  };
};

const computeNextCursor = (cursor: DigestCursor, weeks: WeekRow[]): DigestCursor => {
  if (weeks.length === 0) return cursor;
  if (cursor.completed) return cursor;

  const normalized = normalizeCursorForWeeks(cursor, weeks);

  if (normalized.dayIndex < 6) {
    return {
      ...normalized,
      dayIndex: normalized.dayIndex + 1,
      completed: false,
    };
  }

  const currentWeekIndex = weeks.findIndex((week) => week.weekNumber === normalized.weekNumber);
  if (currentWeekIndex >= 0 && currentWeekIndex < weeks.length - 1) {
    return {
      ...normalized,
      weekNumber: weeks[currentWeekIndex + 1].weekNumber,
      dayIndex: 0,
      completed: false,
    };
  }

  return {
    ...normalized,
    weekNumber: weeks[weeks.length - 1].weekNumber,
    dayIndex: 6,
    completed: true,
  };
};

const parseCursorValue = (value: unknown): DigestCursor | null => {
  if (!value || typeof value !== 'object') return null;

  const raw = value as {
    weekNumber?: unknown;
    dayIndex?: unknown;
    completed?: unknown;
    lastStatus?: unknown;
    lastAttemptAt?: unknown;
    lastSentAt?: unknown;
  };

  if (typeof raw.weekNumber !== 'number' || !Number.isInteger(raw.weekNumber) || raw.weekNumber <= 0) {
    return null;
  }

  return {
    weekNumber: raw.weekNumber,
    dayIndex: clampDayIndex(raw.dayIndex),
    completed: parseBoolean(raw.completed),
    lastStatus: raw.lastStatus === 'SENT' || raw.lastStatus === 'FAILED' || raw.lastStatus === 'SKIPPED'
      ? raw.lastStatus
      : undefined,
    lastAttemptAt: typeof raw.lastAttemptAt === 'string' ? raw.lastAttemptAt : undefined,
    lastSentAt: typeof raw.lastSentAt === 'string' ? raw.lastSentAt : undefined,
  };
};

const upsertDigestCursor = async (supabase: ReturnType<typeof createClient>, cursor: DigestCursor): Promise<void> => {
  const { error } = await supabase
    .from('AppSetting')
    .upsert(
      [{
        settingKey: DAILY_DIGEST_CURSOR_KEY,
        value: cursor,
        updatedAt: new Date().toISOString(),
      }],
      { onConflict: 'settingKey' }
    );
  if (error) {
    throw new Error(error.message);
  }
};

const loadOrBootstrapCursor = async (
  supabase: ReturnType<typeof createClient>,
  weeks: WeekRow[]
): Promise<DigestCursor> => {
  const defaultCursor = getDefaultCursor(weeks);

  const { data: cursorData, error: cursorError } = await supabase
    .from('AppSetting')
    .select('value')
    .eq('settingKey', DAILY_DIGEST_CURSOR_KEY)
    .maybeSingle();

  if (!cursorError) {
    const parsedCursor = parseCursorValue((cursorData as any)?.value);
    if (parsedCursor) {
      return normalizeCursorForWeeks(parsedCursor, weeks);
    }
  } else if ((cursorError as any).code !== '42P01') {
    throw new Error(cursorError.message);
  }

  const { data: latestSentLog, error: latestSentError } = await supabase
    .from('TelegramDigestLog')
    .select('weekNumber, dayName')
    .eq('status', 'SENT')
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSentError && (latestSentError as any).code !== '42P01') {
    throw new Error(latestSentError.message);
  }

  if (latestSentLog && typeof (latestSentLog as any).weekNumber === 'number') {
    const dayIndex = getDayIndex((latestSentLog as any).dayName as string | undefined);
    if (dayIndex !== null) {
      const next = computeNextCursor(
        {
          weekNumber: (latestSentLog as any).weekNumber,
          dayIndex,
          completed: false,
        },
        weeks
      );
      await upsertDigestCursor(supabase, next);
      return next;
    }
  }

  await upsertDigestCursor(supabase, defaultCursor);
  return defaultCursor;
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

  const query = new URL(req.url).searchParams;
  const action = parseDigestAction(body.action || query.get('action'));
  const force = parseBoolean(body.force) || parseBoolean(query.get('force'));
  const advance = typeof body.advance === 'boolean' ? body.advance : !force;

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

  const { data: digestSettingData, error: digestSettingError } = await supabase
    .from('AppSetting')
    .select('value')
    .eq('settingKey', DAILY_DIGEST_ENABLED_KEY)
    .maybeSingle();

  if (digestSettingError && (digestSettingError as any).code !== '42P01') {
    return new Response(JSON.stringify({ ok: false, error: digestSettingError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const digestEnabled = parseDailyDigestEnabled((digestSettingData as any)?.value);

  const { data: weeksRaw, error: weeksError } = await supabase
    .from('Week')
    .select('id, weekNumber, Day(id, dayName, Activity(id, time, description, orderIndex, period, ActivityLabel(Label(name))))')
    .order('weekNumber', { ascending: true });

  if (weeksError || !weeksRaw || weeksRaw.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: weeksError?.message || 'No week data found' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sortedWeeks = [...(weeksRaw as WeekRow[])].sort((a, b) => a.weekNumber - b.weekNumber);

  let cursor: DigestCursor;
  try {
    cursor = await loadOrBootstrapCursor(supabase, sortedWeeks);
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Failed to load digest cursor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  cursor = normalizeCursorForWeeks(cursor, sortedWeeks);

  if (action === 'status') {
    return new Response(JSON.stringify({
      ok: true,
      status: cursor.completed ? 'COMPLETED' : 'READY',
      enabled: digestEnabled,
      cursor: buildCursorView(cursor),
      nextActionLabel: getNextActionLabel(cursor),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (action === 'restart') {
    const restartCursor = {
      ...getDefaultCursor(sortedWeeks),
      lastStatus: 'SKIPPED' as const,
      lastAttemptAt: new Date().toISOString(),
    };
    await upsertDigestCursor(supabase, restartCursor);

    return new Response(JSON.stringify({
      ok: true,
      status: 'RESTARTED',
      enabled: digestEnabled,
      cursor: buildCursorView(restartCursor),
      nextActionLabel: getNextActionLabel(restartCursor),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!digestEnabled && !force) {
    const skippedCursor: DigestCursor = {
      ...cursor,
      lastStatus: 'SKIPPED',
      lastAttemptAt: new Date().toISOString(),
    };
    await upsertDigestCursor(supabase, skippedCursor);

    return new Response(JSON.stringify({
      ok: true,
      status: 'SKIPPED',
      reason: 'Daily digest is disabled by admin setting.',
      enabled: digestEnabled,
      cursor: buildCursorView(skippedCursor),
      nextActionLabel: getNextActionLabel(skippedCursor),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (cursor.completed) {
    return new Response(JSON.stringify({
      ok: true,
      status: 'COMPLETED',
      enabled: digestEnabled,
      cursor: buildCursorView(cursor),
      nextActionLabel: getNextActionLabel(cursor),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const runDate = formatRunDate(now);

  let existingLog: { id: string } | null = null;
  const { data: existingLogData, error: logCheckError } = await supabase
    .from('TelegramDigestLog')
    .select('id')
    .eq('runDate', runDate)
    .eq('timezone', DIGEST_TIMEZONE)
    .maybeSingle();

  if (logCheckError && (logCheckError as any).code !== '42P01') {
    return new Response(JSON.stringify({ ok: false, error: logCheckError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!logCheckError) {
    existingLog = (existingLogData as { id: string } | null) || null;
  }

  if (existingLog && !force) {
    return new Response(JSON.stringify({
      ok: true,
      status: 'SKIPPED',
      reason: `Digest already processed for ${runDate} (${DIGEST_TIMEZONE})`,
      enabled: digestEnabled,
      cursor: buildCursorView(cursor),
      nextActionLabel: getNextActionLabel(cursor),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const currentCursor = { ...cursor };
  const currentDayName = DAY_NAMES[currentCursor.dayIndex] || 'Sunday';
  const selectedWeek = sortedWeeks.find((week) => week.weekNumber === currentCursor.weekNumber) || sortedWeeks[0];

  const selectedDay = ((selectedWeek.Day || []) as any[]).find((day: any) => day.dayName === currentDayName);
  const dayActivities = selectedDay ? ((selectedDay.Activity || []) as any[]) : [];

  const sortedActivities = [...dayActivities].sort((a, b) => {
    if (a.time !== b.time) return String(a.time).localeCompare(String(b.time));
    const ai = typeof a.orderIndex === 'number' ? a.orderIndex : 0;
    const bi = typeof b.orderIndex === 'number' ? b.orderIndex : 0;
    return ai - bi;
  });

  const digestLines: string[] = sortedActivities.length === 0
    ? ['😌 No scheduled activities for today.']
    : (() => {
        const grouped: Record<PeriodKey, any[]> = {
          MORNING: [],
          AFTERNOON: [],
          EVENING: [],
        };

        for (const activity of sortedActivities) {
          grouped[resolvePeriod(activity)].push(activity);
        }

        const sections: Array<{ key: PeriodKey; title: string; divider: string }> = [
          { key: 'MORNING', title: '🌅 Morning', divider: '────────────' },
          { key: 'AFTERNOON', title: '☀️ Afternoon', divider: '────────────' },
          { key: 'EVENING', title: '🌙 Evening', divider: '────────────' },
        ];

        const lines: string[] = [];

        for (const section of sections) {
          const sectionActivities = grouped[section.key];
          if (sectionActivities.length === 0) continue;

          if (lines.length > 0) lines.push('');
          lines.push(section.title);
          lines.push(section.divider);

          for (const activity of sectionActivities) {
            lines.push(`🕒 ${formatTime(String(activity.time))} - ${String(activity.description || '')}`);

            const labels = ((activity.ActivityLabel || []) as any[])
              .map((entry) => entry?.Label?.name)
              .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

            if (labels.length > 0) {
              lines.push(`🏷️ ${labels.join(', ')}`);
            }

            lines.push('');
          }

          while (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
          }
        }

        return lines;
      })();

  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim();
  const payload = {
    event: 'DAILY_DIGEST',
    weekId: selectedWeek.id,
    weekNumber: selectedWeek.weekNumber,
    dayName: currentDayName,
    timestamp: now.toISOString(),
    digestTitle: '✨ FOF IKD - SOP Manager',
    digestLines,
    pdfUrl: getPdfUrl(selectedWeek.weekNumber, body.pdfUrl),
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
  const sendSuccess = notifyRes.ok && (notifyBody as any)?.ok === true;
  const sendStatus = sendSuccess ? 'SENT' : 'FAILED';

  if ((logCheckError as any)?.code !== '42P01') {
    if (existingLog?.id) {
      await supabase
        .from('TelegramDigestLog')
        .update({
          weekNumber: selectedWeek.weekNumber,
          dayName: currentDayName,
          status: sendStatus,
          details: notifyBody,
        })
        .eq('id', existingLog.id);
    } else {
      await supabase
        .from('TelegramDigestLog')
        .insert([{
          runDate,
          timezone: DIGEST_TIMEZONE,
          weekNumber: selectedWeek.weekNumber,
          dayName: currentDayName,
          status: sendStatus,
          details: notifyBody,
        }]);
    }
  }

  const nextCursor = sendSuccess
    ? (() => {
        const moved = advance ? computeNextCursor(currentCursor, sortedWeeks) : currentCursor;
        return {
          ...moved,
          lastStatus: 'SENT' as const,
          lastAttemptAt: now.toISOString(),
          lastSentAt: now.toISOString(),
        };
      })()
    : {
        ...currentCursor,
        lastStatus: 'FAILED' as const,
        lastAttemptAt: now.toISOString(),
      };

  await upsertDigestCursor(supabase, nextCursor);

  if (!sendSuccess) {
    const details = typeof notifyBody === 'object' ? notifyBody : { raw: String(notifyBody) };
    return new Response(JSON.stringify({
      ok: false,
      status: 'FAILED',
      error: 'Daily digest dispatch failed',
      details,
      enabled: digestEnabled,
      current: buildCursorView(currentCursor),
      next: buildCursorView(nextCursor),
      cursor: buildCursorView(nextCursor),
      nextActionLabel: getNextActionLabel(nextCursor),
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    status: nextCursor.completed ? 'COMPLETED' : 'SENT',
    runDate,
    timezone: DIGEST_TIMEZONE,
    weekNumber: selectedWeek.weekNumber,
    dayName: currentDayName,
    digestCount: sortedActivities.length,
    notify: notifyBody,
    enabled: digestEnabled,
    advance,
    current: buildCursorView(currentCursor),
    next: buildCursorView(nextCursor),
    cursor: buildCursorView(nextCursor),
    nextActionLabel: getNextActionLabel(nextCursor),
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
