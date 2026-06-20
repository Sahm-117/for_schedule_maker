// Shared web-push delivery helper for all edge functions.
//
// Why this exists: every function previously had its own send loop that only
// handled HTTP 410 (expired subscription) and silently swallowed every other
// error — so transient blips and broken keys lost notifications with zero
// visibility. This centralizes reliable delivery so the behaviour is identical
// everywhere and fixed in one place.
//
// Behaviour:
//   - 404 / 410          -> subscription is permanently gone; delete it.
//   - 429 / 5xx / network -> transient; retry with linear backoff.
//   - anything else (e.g. 400 bad VAPID key) -> count as failed + log.
// One bad endpoint never aborts the rest of the batch. Returns a summary so
// callers can surface { sent, failed, removed } in their response + logs.

// deno-lint-ignore no-explicit-any
type WebPush = any
// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export interface PushSubRow {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface DeliverySummary {
  sent: number
  failed: number
  removed: number
  errors: { endpoint: string; statusCode?: number; message: string }[]
}

// Only log the tail of an endpoint — never the full URL (it's a capability).
const endpointTail = (endpoint: string) => endpoint.slice(-12)

/**
 * Send one payload to many subscriptions reliably.
 * @param notifiedUserIds optional array that receives the userId of each
 *        successful delivery (some callers track who was reached).
 */
export async function sendToSubscriptions(
  webPush: WebPush,
  supabase: SupabaseClient,
  subs: PushSubRow[],
  payload: string,
  notifiedUserIds?: string[],
): Promise<DeliverySummary> {
  const summary: DeliverySummary = { sent: 0, failed: 0, removed: 0, errors: [] }
  const maxAttempts = 3

  for (const sub of subs) {
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
    let delivered = false
    // deno-lint-ignore no-explicit-any
    let lastErr: any = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await webPush.sendNotification(pushSub, payload)
        delivered = true
        break
      } catch (err) {
        lastErr = err
        // deno-lint-ignore no-explicit-any
        const status = (err as any)?.statusCode

        if (status === 404 || status === 410) {
          await supabase
            .from('PushSubscription')
            .delete()
            .eq('userId', sub.userId)
            .eq('endpoint', sub.endpoint)
          summary.removed++
          break
        }

        const transient = status === 429 || (typeof status === 'number' && status >= 500) || status === undefined
        if (transient && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 500))
          continue
        }
        break
      }
    }

    if (delivered) {
      summary.sent++
      if (notifiedUserIds) notifiedUserIds.push(sub.userId)
    } else {
      summary.failed++
      summary.errors.push({
        endpoint: endpointTail(sub.endpoint),
        // deno-lint-ignore no-explicit-any
        statusCode: (lastErr as any)?.statusCode,
        // deno-lint-ignore no-explicit-any
        message: String((lastErr as any)?.body || (lastErr as any)?.message || lastErr),
      })
    }
  }

  return summary
}
