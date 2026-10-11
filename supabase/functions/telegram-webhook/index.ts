/**
 * The FOF Ops Telegram bot's inbox. Telegram calls this for every message to the bot.
 *
 *   /start <code>   connects the chat to the person who made the code in the app (Profile -> Connect Telegram)
 *   /start          turns notifications back on for a chat that is already connected
 *   /stop           pauses them
 *   (blocking the bot) switches the link off, so nothing is sent to a chat that cannot receive it
 *
 * Deployed without JWT verification (Telegram has no Supabase key); instead every request must carry the secret token set when
 * the webhook was registered (X-Telegram-Bot-Api-Secret-Token).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')

const reply = async (chatId: number, text: string) => {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((error) => console.error('telegram-webhook reply failed:', String(error)))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' || !WEBHOOK_SECRET || !BOT_TOKEN) return new Response('Not allowed', { status: 403 })
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) return new Response('Not allowed', { status: 403 })

  // Always answer 200 once the request is authentic, so Telegram does not keep retrying a message we cannot handle.
  try {
    const update = await req.json()

    const memberChange = update?.my_chat_member
    if (memberChange?.chat?.type === 'private') {
      const status = memberChange?.new_chat_member?.status
      if (status === 'kicked' || status === 'left') {
        await supabase.rpc('telegram_set_chat_enabled', { p_chat_id: memberChange.chat.id, p_enabled: false, p_blocked: true })
      }
      return new Response('ok')
    }

    const message = update?.message
    if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return new Response('ok')
    const chatId = message.chat.id as number
    const [command, argument] = message.text.trim().split(/\s+/, 2)

    if (command === '/start' && argument) {
      const { data } = await supabase.rpc('telegram_link_chat', { p_code: argument, p_chat_id: chatId })
      await reply(chatId, data === 'OK'
        ? '✅ Connected. You will now get your FOF Ops notifications here too. Send /stop to pause them.'
        : 'That connect link has expired or was already used. In the FOF Ops app, open your profile and tap Connect Telegram again.')
    } else if (command === '/start') {
      const { data: changed } = await supabase.rpc('telegram_set_chat_enabled', { p_chat_id: chatId, p_enabled: true, p_blocked: false })
      await reply(chatId, changed
        ? '✅ Notifications are on.'
        : 'Welcome to FOF Ops. To connect, open the FOF Ops app, go to your profile and tap Connect Telegram.')
    } else if (command === '/stop') {
      const { data: changed } = await supabase.rpc('telegram_set_chat_enabled', { p_chat_id: chatId, p_enabled: false, p_blocked: false })
      await reply(chatId, changed ? 'Paused. Send /start to turn them back on.' : 'Nothing is connected to this chat yet.')
    } else {
      await reply(chatId, 'This bot sends your FOF Ops notifications. Open the FOF Ops app to respond to them.')
    }
  } catch (error) {
    console.error('telegram-webhook error:', String(error))
  }
  return new Response('ok')
})
