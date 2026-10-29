/**
 * The FOF public API, v1: how other church apps ask FOF questions.
 *
 * Callers never read FOF tables. Each connecting app has its own key (ApiClient, only its hash is stored) with
 * scopes saying which questions it may ask. Every request made with a valid key is recorded in ApiRequestLog
 * (requests with no key or an unknown key are refused and not recorded). Deployed with JWT checks off, because
 * callers present their FOF key, not a Supabase session.
 *
 *   GET /v1/health, /v1/openapi.json             no key needed
 *   GET /v1/cohorts/current                      cohorts:read
 *   GET /v1/people/lookup?phone=&email=          people:lookup
 *   GET /v1/people/{id}[/programme|/attendance]  people:read
 *   GET /v1/people/{id}/faith-project            faith:read
 *   GET /v1/cohorts/{cohort}/participants        people:read      ({cohort} is a cohort id or "current")
 *   GET /v1/cohorts/{cohort}/team                team:read
 *   GET /v1/cohorts/{cohort}/groups|hubs         groups:read
 *   GET /v1/cohorts/{cohort}/weeks|schedule      schedule:read
 *   GET /v1/planner?until=YYYY-MM-DD             planner:read
 *   GET /v1/scriptures|announcements|resources   content:read
 *   GET /v1/birthdays?days=                      birthdays:read
 *   GET /v1/birthdays/{kind}/{id}/graphic.png    birthdays:read   (kind: participant or team)
 *
 * Teenagers come back as name, cohort and `restricted` unless the key also has `teens:read`; every answer's count of
 * teen records shown in full is recorded with the request. Keys go in `Authorization: Bearer fof_live_…` (or
 * `X-API-Key`). 60 requests a minute per key. Answers come from the api_* database functions (migrations
 * 20261029120000_public_api_foundation.sql and 20261029140000_public_api_v1_1.sql).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import openapi from './openapi.json' with { type: 'json' }
import { plannerCohorts, type PlannerInputs } from './planner.ts'
import { BIRTHDAY_QUOTES, birthdayPng } from './birthday.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const VERSION = '1.1.0'
const RATE_LIMIT_PER_MINUTE = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

type Client = { id: string; name: string; scopes: string[]; requestId: number; limited: boolean }

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } })

const sha256Hex = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const keyFrom = (req: Request): string | null => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
  return bearer ?? req.headers.get('x-api-key')
}

// Checks the key and books the request against the key's limit (api_authenticate does both in one step).
const authenticate = async (req: Request, path: string): Promise<Client> => {
  const key = keyFrom(req)
  if (!key || !key.startsWith('fof_live_')) throw new ApiError(401, 'missing_key', 'Send your FOF API key as "Authorization: Bearer <key>".')
  const { data, error } = await supabase.rpc('api_authenticate', {
    p_key_hash: await sha256Hex(key), p_method: req.method, p_path: path, p_limit: RATE_LIMIT_PER_MINUTE,
  })
  if (error) throw new ApiError(500, 'server_error', 'Could not check the key. Please try again.')
  if (!data) throw new ApiError(401, 'invalid_key', 'This key is not recognised or has been switched off.')
  return data as Client
}

const requireScope = (client: Client, scope: string) => {
  if (!client.scopes.includes(scope)) throw new ApiError(403, 'missing_scope', `This key may not do that. It needs the "${scope}" scope.`)
}

const call = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (/Give a phone number or an email/.test(error.message)) throw new ApiError(400, 'bad_request', 'Give a phone number or an email.')
    if (/not one FOF can read/.test(error.message)) throw new ApiError(400, 'bad_request', 'That phone number is not one FOF can read. Use a Nigerian number (080…) or a full international number.')
    throw new ApiError(500, 'server_error', 'Something went wrong on our side. Please try again.')
  }
  return data
}

// How many teen records an answer shows in full (the key had teens:read): recorded with the request.
const countTeens = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((n: number, v) => n + countTeens(v), 0)
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const own = o.isTeen === true && o.restricted !== true ? 1 : 0
    return own + Object.values(o).reduce((n: number, v) => n + countTeens(v), 0)
  }
  return 0
}

const lagosToday = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10)

const found = (data: unknown, what: string) => {
  if (!data) throw new ApiError(404, 'not_found', `No such ${what}.`)
  return data
}

const intParam = (url: URL, name: string, fallback: number, min: number, max: number) => {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, 'bad_request', `"${name}" must be a whole number from ${min} to ${max}.`)
  return n
}

const route = async (req: Request, path: string, url: URL, client: () => Promise<Client>, teens: { count: number }): Promise<Response> => {
  if (path === '/v1/health') return json({ ok: true, version: VERSION })
  if (path === '/v1/openapi.json') return json(openapi)

  const who = await client()
  if (who.limited) throw new ApiError(429, 'rate_limited', `Too many requests. The limit is ${RATE_LIMIT_PER_MINUTE} a minute.`)
  if (path === '/v1/cohorts/current') {
    requireScope(who, 'cohorts:read')
    return json(await call('api_cohorts_current'))
  }
  if (path === '/v1/people/lookup') {
    requireScope(who, 'people:lookup')
    const phone = url.searchParams.get('phone')
    const email = url.searchParams.get('email')
    if (!phone && !email) throw new ApiError(400, 'bad_request', 'Give a phone number or an email.')
    return json(await call('api_people_lookup', { p_phone: phone, p_email: email }))
  }
  const canSeeTeens = who.scopes.includes('teens:read')
  const shown = (data: unknown) => { if (canSeeTeens) teens.count = countTeens(data); return json(data) }

  const person = /^\/v1\/people\/([^/]+)(?:\/(programme|attendance|faith-project))?$/.exec(path)
  if (person) {
    requireScope(who, person[2] === 'faith-project' ? 'faith:read' : 'people:read')
    if (!UUID.test(person[1])) throw new ApiError(404, 'not_found', 'No such person.')
    const fns: Record<string, string> = { programme: 'api_person_programme_for', attendance: 'api_person_attendance', 'faith-project': 'api_person_faith_project' }
    const fn = fns[person[2] ?? ''] ?? 'api_person'
    return shown(found(await call(fn, { p_participant_id: person[1], p_teens: canSeeTeens }), 'person'))
  }

  const cohort = /^\/v1\/cohorts\/([^/]+)\/(participants|team|groups|hubs|weeks|schedule)$/.exec(path)
  if (cohort) {
    const [, which, part] = cohort
    if (which !== 'current' && !UUID.test(which)) throw new ApiError(404, 'not_found', 'No such cohort.')
    if (part === 'participants') {
      requireScope(who, 'people:read')
      const group = url.searchParams.get('group')
      if (group && !UUID.test(group)) throw new ApiError(400, 'bad_request', '"group" must be a group id.')
      return shown(found(await call('api_cohort_participants', {
        p_cohort: which, p_teens: canSeeTeens, p_group_id: group || null,
        p_limit: intParam(url, 'limit', 100, 1, 200), p_offset: intParam(url, 'offset', 0, 0, 100000),
      }), 'cohort'))
    }
    const scopes: Record<string, string> = { team: 'team:read', groups: 'groups:read', hubs: 'groups:read', weeks: 'schedule:read', schedule: 'schedule:read' }
    const scope = scopes[part]
    requireScope(who, scope)
    return json(found(await call(`api_cohort_${part}`, { p_cohort: which }), 'cohort'))
  }

  if (path === '/v1/planner') {
    requireScope(who, 'planner:read')
    const until = url.searchParams.get('until') ?? `${Number(lagosToday().slice(0, 4)) + 1}-12-31`
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T00:00:00Z`) : null
    const real = !!parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === until
    if (!real || until > '2100-12-31') throw new ApiError(400, 'bad_request', '"until" must be a real date like 2027-12-31.')
    const inputs = await call('api_planner_inputs') as PlannerInputs
    return json({ cohorts: plannerCohorts(inputs, until), churchEvents: inputs.churchEvents, publicHolidays: inputs.publicHolidays })
  }

  if (path === '/v1/scriptures' || path === '/v1/announcements' || path === '/v1/resources') {
    requireScope(who, 'content:read')
    if (path === '/v1/announcements') return json(await call('api_announcements', { p_limit: intParam(url, 'limit', 50, 1, 200) }))
    return json(await call(path === '/v1/scriptures' ? 'api_scriptures' : 'api_resources'))
  }

  if (path === '/v1/birthdays') {
    requireScope(who, 'birthdays:read')
    return shown(await call('api_birthdays', { p_days: intParam(url, 'days', 0, 0, 366), p_teens: canSeeTeens }))
  }
  const graphic = /^\/v1\/birthdays\/(participant|team)\/([^/]+)\/graphic\.png$/.exec(path)
  if (graphic) {
    requireScope(who, 'birthdays:read')
    if (!UUID.test(graphic[2])) throw new ApiError(404, 'not_found', 'No such person.')
    const person = found(await call('api_birthday_person', { p_kind: graphic[1], p_id: graphic[2], p_teens: canSeeTeens }), 'person with a birthday') as
      { name: string; photoUrl: string | null; month: number; day: number; roleLabel: string; isTeen: boolean }
    if (person.isTeen) teens.count = 1
    const quoteIndex = intParam(url, 'quote', [...graphic[2]].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % BIRTHDAY_QUOTES.length, 0, BIRTHDAY_QUOTES.length - 1)
    // Render the whole picture before answering, so a drawing error becomes a 500 rather than a broken 200.
    let bytes: ArrayBuffer
    try {
      const png = await birthdayPng({ ...person, quoteIndex })
      if (!png.ok) throw new Error(`render ${png.status}`)
      bytes = await png.arrayBuffer()
      if (bytes.byteLength < 1000) throw new Error('empty picture')
    } catch (err) {
      console.error('public-api birthday', err)
      throw new ApiError(500, 'server_error', 'Could not draw the birthday picture. Please try again.')
    }
    return new Response(bytes, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
  }
  throw new ApiError(404, 'not_found', 'There is no such address in the FOF API. See /v1/openapi.json.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const started = Date.now()
  const url = new URL(req.url)
  // The function is served under /functions/v1/public-api (or /public-api locally); keep what follows.
  const path = url.pathname.replace(/^.*?\/public-api(?=\/|$)/, '').replace(/\/+$/, '') || '/'
  let requestId: number | null = null
  const teens = { count: 0 }
  let response: Response
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Only GET is available in v1.')
    response = await route(req, path, url, async () => {
      const client = await authenticate(req, path)
      requestId = client.requestId
      return client
    }, teens)
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(500, 'server_error', 'Something went wrong on our side. Please try again.')
    if (!(err instanceof ApiError)) console.error('public-api', err)
    response = json({ error: { code: e.code, message: e.message } }, e.status, e.status === 429 ? { 'Retry-After': '60' } : {})
  }
  // A request booked by api_authenticate gets its outcome filled in (a 429 is already recorded as such).
  if (requestId !== null && response.status !== 429) {
    const { error } = await supabase.rpc('api_finish_request', {
      p_request_id: requestId, p_status: response.status, p_duration_ms: Date.now() - started, p_teen_records: teens.count,
    })
    if (error) console.error('public-api log', error.message)
  }
  return response
})
