/**
 * Sends one in-app notification to a person's Telegram chat.
 *
 * Called by the database (invoke_telegram_send, from the triggers on "Notification" and "ParticipantNotification") with the
 * service-role key, so only the database can use it. Telegram is a backup copy: same title and message as the app, with a
 * line telling the person to open the app (a link would open a browser, not the installed app).
 * If the person blocked the bot, their link is switched off so we stop trying.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const jwtRole = (header: string | null): string | null => {
  try {
    const payload = (header ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null
  } catch {
    return null
  }
}

interface SendRequest {
  kind?: 'USER' | 'PARTICIPANT'
  ownerId?: string
  title?: string
  body?: string
}

const sendMessage = async (chatId: number, text: string): Promise<Response> =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  // Only the database may call this. The platform has already checked the token's signature; the anon key is also a valid
  // token, so insist on the service_role claim.
  if (jwtRole(req.headers.get('Authorization')) !== 'service_role') return json({ ok: false, error: 'Not allowed' }, 401)
  if (!BOT_TOKEN) return json({ ok: false, error: 'Bot is not set up' }, 500)

  try {
    const input = await req.json() as SendRequest
    if ((input.kind !== 'USER' && input.kind !== 'PARTICIPANT') || !input.ownerId || !input.title || input.body === undefined || input.body === null) {
      return json({ ok: false, error: 'kind, ownerId, title and body are required' }, 400)
    }

    const table = input.kind === 'USER' ? 'TelegramLink' : 'ParticipantTelegramLink'
    const ownerColumn = input.kind === 'USER' ? 'userId' : 'participantId'
    const { data: link } = await supabase.from(table).select('chatId, enabled').eq(ownerColumn, input.ownerId).maybeSingle()
    if (!link || !link.enabled) return json({ ok: true, sent: false })

    // Cut the raw text before escaping and adding the footer, so a cut can never split an HTML tag or entity (Telegram's limit is 4096).
    const text = `<b>${escapeHtml(input.title.slice(0, 200))}</b>\n${escapeHtml(String(input.body).slice(0, 3000))}\n\n<i>Open the FOF Ops app to respond.</i>`
    let res = await sendMessage(link.chatId, text)
    if (res.status === 429) {
      const wait = Number((await res.json().catch(() => ({})))?.parameters?.retry_after ?? 1)
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 5) * 1000))
      res = await sendMessage(link.chatId, text)
    }
    if (res.status === 403) {
      // Blocked the bot (or deleted the chat): stop trying until they press Start again.
      await supabase.from(table).update({ enabled: false, blockedAt: new Date().toISOString() }).eq(ownerColumn, input.ownerId)
      return json({ ok: true, sent: false, blocked: true })
    }
    if (!res.ok) {
      console.error('telegram-send failed:', res.status, await res.text().catch(() => ''))
      return json({ ok: false, error: `Telegram ${res.status}` }, 502)
    }
    return json({ ok: true, sent: true })
  } catch (error) {
    console.error('telegram-send error:', String(error))
    return json({ ok: false, error: String(error) }, 500)
  }
})
