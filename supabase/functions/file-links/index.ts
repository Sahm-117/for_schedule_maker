/**
 * Signed links to private files (FLOW_MAP rule 129).
 *
 * Files added under Resources live in the private "private-files" bucket; their Resource.url is
 * "fof-private:<path>". The app sends the ids of the resources (or earlier versions) it is about to show, with the
 * caller's session (x-session-token). The database decides which of them this person may see
 * (private_file_paths: the same rules as the Resources lists), and this function signs only those, for two hours.
 *
 * POST { kind: 'resource' | 'version', ids: string[] }  ->  { urls: { [id]: signedUrl } }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const LINK_SECONDS = 2 * 60 * 60
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const token = req.headers.get('x-session-token')
  if (!token) return json({ ok: false, error: 'SESSION_EXPIRED' }, 401)

  let kind: string
  let ids: string[]
  try {
    const body = await req.json() as { kind?: string; ids?: unknown }
    kind = body.kind === 'version' ? 'version' : 'resource'
    ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 200) : []
  } catch {
    return json({ ok: false, error: 'Bad request' }, 400)
  }
  if (ids.length === 0) return json({ ok: true, urls: {} })

  // Ask as the caller, so the database's own session checks decide what they may open.
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { 'x-session-token': token } },
  })
  const { data: rows, error } = await asCaller.rpc('private_file_paths', { p_kind: kind, p_ids: ids })
  if (error) return json({ ok: false, error: 'Could not check access' }, 500)
  const allowed = (rows ?? []) as Array<{ id: string; path: string }>
  if (allowed.length === 0) return json({ ok: true, urls: {} })

  const { data: signed, error: signError } = await service.storage.from('private-files')
    .createSignedUrls(allowed.map((r) => r.path), LINK_SECONDS)
  if (signError || !signed) return json({ ok: false, error: 'Could not create links' }, 500)

  const urls: Record<string, string> = {}
  allowed.forEach((r, i) => { if (signed[i]?.signedUrl) urls[r.id] = signed[i].signedUrl })
  return json({ ok: true, urls })
})
