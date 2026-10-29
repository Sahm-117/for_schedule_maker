/**
 * The FOF public API, v1: how other church apps ask FOF questions.
 *
 * Callers never read FOF tables. Each connecting app has its own key (ApiClient, only its hash is stored) with
 * scopes saying which questions it may ask. Every request made with a valid key is recorded in ApiRequestLog
 * (requests with no key or an unknown key are refused and not recorded). Deployed with JWT checks off, because
 * callers present their FOF key, not a Supabase session.
 *
 *   GET /v1/health                      no key needed
 *   GET /v1/openapi.json                no key needed: the description of this API (openapi.json beside this file)
 *   GET /v1/cohorts/current             cohorts:read
 *   GET /v1/people/lookup?phone=&email= people:lookup
 *   GET /v1/people/{id}                 people:read
 *   GET /v1/people/{id}/programme       people:read
 *
 * Keys go in `Authorization: Bearer fof_live_…` (or `X-API-Key`). 60 requests a minute per key.
 * Answers come from the api_* database functions (migration 20261029120000_public_api_foundation.sql).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import openapi from './openapi.json' with { type: 'json' }

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const VERSION = '1.0.0'
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

const route = async (req: Request, path: string, url: URL, client: () => Promise<Client>): Promise<Response> => {
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
  const person = /^\/v1\/people\/([^/]+)(\/programme)?$/.exec(path)
  if (person) {
    requireScope(who, 'people:read')
    if (!UUID.test(person[1])) throw new ApiError(404, 'not_found', 'No such person.')
    const data = await call(person[2] ? 'api_person_programme' : 'api_person', { p_participant_id: person[1] })
    if (!data) throw new ApiError(404, 'not_found', 'No such person.')
    return json(data)
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
  let response: Response
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Only GET is available in v1.')
    response = await route(req, path, url, async () => {
      const client = await authenticate(req, path)
      requestId = client.requestId
      return client
    })
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(500, 'server_error', 'Something went wrong on our side. Please try again.')
    if (!(err instanceof ApiError)) console.error('public-api', err)
    response = json({ error: { code: e.code, message: e.message } }, e.status, e.status === 429 ? { 'Retry-After': '60' } : {})
  }
  // A request booked by api_authenticate gets its outcome filled in (a 429 is already recorded as such).
  if (requestId !== null && response.status !== 429) {
    const { error } = await supabase.rpc('api_finish_request', {
      p_request_id: requestId, p_status: response.status, p_duration_ms: Date.now() - started,
    })
    if (error) console.error('public-api log', error.message)
  }
  return response
})
