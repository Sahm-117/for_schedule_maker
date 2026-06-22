// Shared in-app notification writer.
//
// Why this exists: every push notification should ALSO be recorded as an in-app
// notification, so users who miss the push (data off, push denied, expired
// subscription) still see an unread badge + feed when they open the app. This
// is intentionally decoupled from push delivery — it writes the feed rows for
// the *targeted* users, regardless of whether a push subscription exists.
//
// One bad insert never blocks push delivery: callers should `await` this but it
// swallows/logs its own errors and returns a count.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export interface NotificationRow {
  userId: string
  title: string
  body: string
  /** In-app deep-link target; keep in sync with the push payload's data.path. */
  path?: string | null
  /** ANNOUNCEMENT | FOLLOWUP_ASSIGNMENT | FOLLOWUP_ISSUE | FOLLOWUP_TERMINAL | REMINDER | GENERAL */
  type?: string
}

/**
 * Insert one in-app notification per targeted user. Deduplicates userIds.
 * Returns the number of rows inserted (0 on any failure — logged, not thrown).
 */
export async function insertNotifications(
  supabase: SupabaseClient,
  rows: NotificationRow[],
): Promise<number> {
  if (!rows || rows.length === 0) return 0

  const payload = rows
    .filter((r) => r.userId)
    .map((r) => ({
      userId: r.userId,
      title: r.title,
      body: r.body,
      path: r.path ?? null,
      type: r.type ?? 'GENERAL',
    }))

  if (payload.length === 0) return 0

  try {
    const { error } = await supabase.from('Notification').insert(payload)
    if (error) {
      console.error('insertNotifications failed:', error.message)
      return 0
    }
    return payload.length
  } catch (err) {
    console.error('insertNotifications threw:', String(err))
    return 0
  }
}
