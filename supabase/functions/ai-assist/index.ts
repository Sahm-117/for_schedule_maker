/**
 * AI help for the participant app, through OpenRouter's free models.
 *
 * POST { action, token, ... } — `token` is the caller's app session token.
 *   participant-summary  (participant, opted in, cohort in its last week)
 *       → end-of-FOF summary of their own reflections, saved in ReflectionSummary
 *   recap-draft          (admin) { weekTitle, notes }
 *       → a short recap summary and a discussion prompt, not saved
 *   feedback-themes      (admin) { cohortId }
 *       → themes from the cohort's anonymous feedback, saved in FeedbackThemes
 *
 * Principle agreed with leadership: AI summarises, organises and highlights; it
 * never scores faith or judges anyone's spiritual growth.
 *
 * Models come from AppSetting 'ai_settings' ({ enabled, models }) and are tried in
 * order, because free models are often rate-limited or overloaded.
 *
 * Required secrets: OPENROUTER_API_KEY (plus the auto-injected SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Keep in sync with DEFAULT_AI_MODELS in frontend/src/services/supabase-api.ts.
const DEFAULT_MODELS = ['nex-agi/nex-n2.5-pro:free', 'poolside/laguna-s-2.1:free', 'inclusionai/ling-3.0-flash-vl:free', 'google/gemma-4-31b-it:free']

const loadSettings = async () => {
  const { data } = await supabase.from('AppSetting').select('value').eq('settingKey', 'ai_settings').maybeSingle()
  const value = (data?.value ?? {}) as { enabled?: boolean; models?: unknown }
  const models = Array.isArray(value.models) ? value.models.map(String).map((m) => m.trim()).filter(Boolean) : []
  return { enabled: value.enabled !== false, models: models.length ? models : DEFAULT_MODELS }
}

class AiError extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}

// Try each model until one answers with text.
const complete = async (models: string[], system: string, user: string, maxTokens: number) => {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new AiError('AI_NOT_CONFIGURED', 500)
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'FOF IKD' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(75000),
      })
      const data = await res.json().catch(() => null)
      const raw = data?.choices?.[0]?.message?.content
      const text = typeof raw === 'string' ? raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : ''
      if (res.ok && text) return { text, model }
      console.error(`ai-assist: ${model} gave no answer`, res.status, JSON.stringify(data?.error ?? '').slice(0, 300))
    } catch (error) {
      console.error(`ai-assist: ${model} failed`, String(error))
    }
  }
  throw new AiError('AI_BUSY', 503)
}

const participantFromToken = async (token: string) => {
  const { data } = await supabase.rpc('app_participant_id', { p_token: token })
  if (!data) throw new AiError('SESSION_EXPIRED', 401)
  return String(data)
}

const adminFromToken = async (token: string) => {
  const { data } = await supabase.rpc('app_staff', { p_token: token })
  if (!data?.id) throw new AiError('SESSION_EXPIRED', 401)
  if (data.role !== 'ADMIN') throw new AiError('NOT_ALLOWED', 403)
  return data
}

const SUMMARY_SYSTEM = [
  'You help a participant in Foundation of Faith (FOF), a church class on the foundations of Christian faith, look back on their own weekly reflections.',
  'Write to them in the second person, warmly and plainly, in British English. Use their own words where you can, in quotation marks.',
  'Summarise and organise: what kept coming up, the goals they set and which they marked as done, and one or two things worth revisiting.',
  'Never score or judge their faith or spiritual growth, never diagnose, never preach, and never add anything that is not in their entries.',
  'Keep it under 220 words. Use these three headings, each on its own line: What kept coming up, What you set out to do, Worth revisiting.',
].join(' ')

const RECAP_SYSTEM = [
  'You help the Foundation of Faith (FOF) team at a church write the weekly class recap for participants.',
  'From the class notes you are given, write a recap summary of 3 to 5 sentences in plain British English, and one open discussion question for small groups.',
  'Only use what is in the notes. Do not add Bible verses or claims that are not there.',
  'Reply with JSON only, in this shape: {"summary": "...", "prompt": "..."}',
].join(' ')

const THEMES_SYSTEM = [
  'You help the Foundation of Faith (FOF) programme team at a church read anonymous participant feedback.',
  'Group the comments into the main themes: what is working well, and what needs attention. For each theme give a short plain name, how many comments mention it, and one short example in the participants\' own words.',
  'Do not guess who wrote anything, do not invent comments, and keep it under 250 words in British English.',
  'Use two headings, each on its own line: Working well, Needs attention. Use short bullet points starting with "- ".',
].join(' ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const token = String(body.token || '')
    const settings = await loadSettings()
    if (!settings.enabled) throw new AiError('AI_DISABLED', 403)

    if (body.action === 'participant-summary') {
      const participantId = await participantFromToken(token)
      const { data: state } = await supabase.rpc('participant_summary', { p_token: token })
      if (!state?.optedIn) throw new AiError('AI_NOT_OPTED_IN', 403)
      if (!state?.unlocked) throw new AiError('SUMMARY_LOCKED', 403)
      // One new summary a day at most, to stay inside the free daily limit.
      if (state.summary && Date.now() - new Date(state.summary.createdAt).getTime() < 86400000) {
        return json({ ok: true, summary: state.summary })
      }

      const { data: person } = await supabase.from('Participant').select('cohortId').eq('id', participantId).single()
      const { data: rows } = await supabase
        .from('Reflection')
        .select('stoodOut, goal, goalCheck, goalDoneAt, week:Week!inner(weekNumber, title, cohortId)')
        .eq('participantId', participantId)
        .eq('week.cohortId', person?.cohortId)
      const entries = ((rows ?? []) as any[])
        .map((r) => ({ week: r.week.weekNumber, topic: r.week.title, stoodOut: r.stoodOut, goal: r.goal, knowItWhen: r.goalCheck, goalDone: !!r.goalDoneAt }))
        .sort((a, b) => a.week - b.week)
      if (entries.length === 0) throw new AiError('NO_REFLECTIONS', 400)

      const result = await complete(settings.models, SUMMARY_SYSTEM, `Here are my weekly reflections as JSON:\n${JSON.stringify(entries)}`, 1600)
      const createdAt = new Date().toISOString()
      const { error } = await supabase.from('ReflectionSummary').upsert(
        [{ participantId, cohortId: person?.cohortId, summary: result.text, model: result.model, createdAt }],
        { onConflict: 'participantId,cohortId' },
      )
      if (error) throw new Error(error.message)
      return json({ ok: true, summary: { text: result.text, createdAt } })
    }

    if (body.action === 'recap-draft') {
      await adminFromToken(token)
      const notes = String(body.notes || '').trim()
      if (notes.length < 40) throw new AiError('NOTES_TOO_SHORT', 400)
      const result = await complete(settings.models, RECAP_SYSTEM, `Class title: ${String(body.weekTitle || '').trim() || 'Not given'}\n\nClass notes:\n${notes.slice(0, 12000)}`, 1200)
      const match = result.text.match(/\{[\s\S]*\}/)
      let parsed: { summary?: string; prompt?: string } = {}
      try { parsed = match ? JSON.parse(match[0]) : {} } catch { parsed = {} }
      if (!parsed.summary) throw new AiError('AI_BUSY', 503)
      return json({ ok: true, summary: String(parsed.summary).trim(), prompt: String(parsed.prompt || '').trim() })
    }

    if (body.action === 'feedback-themes') {
      await adminFromToken(token)
      const round = 'GENERAL'
      const { data: results, error: resultsError } = await supabase.rpc('feedback_results', { p_token: token, p_cohort_id: body.cohortId })
      if (resultsError) throw new Error(resultsError.message)
      const answers = results?.answers as any[] | null
      if (!answers) throw new AiError('FEEDBACK_NOT_VISIBLE', 400)
      const comments = answers.flatMap((a) => [
        a.workingWell ? `Working well: ${a.workingWell}` : '',
        a.needsAttention ? `Needs attention: ${a.needsAttention}` : '',
      ]).filter(Boolean)
      if (comments.length === 0) throw new AiError('NO_COMMENTS', 400)
      const result = await complete(settings.models, THEMES_SYSTEM, `Anonymous comments, one per line:\n${comments.join('\n').slice(0, 15000)}`, 1800)
      const createdAt = new Date().toISOString()
      const { error } = await supabase.from('FeedbackThemes').upsert(
        [{ cohortId: body.cohortId, round, themes: result.text, model: result.model, createdAt }],
        { onConflict: 'cohortId,round' },
      )
      if (error) throw new Error(error.message)
      return json({ ok: true, themes: result.text, createdAt })
    }

    throw new AiError('UNKNOWN_ACTION', 400)
  } catch (error) {
    if (error instanceof AiError) return json({ ok: false, error: error.code }, error.status)
    console.error('ai-assist error:', String(error))
    return json({ ok: false, error: 'AI_FAILED' }, 500)
  }
})
