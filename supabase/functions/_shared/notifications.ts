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

/** An admin, or a Team member (STAFF), who acts as an admin everywhere. */
export const isAdminRole = (role: string | null | undefined): boolean => role === 'ADMIN' || role === 'STAFF'

/**
 * Everyone who should get the admin notifications of a module: every admin, plus Team members whose roles let them
 * See it (database function module_viewers). If the lookup fails, falls back to the admins so a hiccup never silences them.
 * `module` is a permission module key, e.g. 'follow_ups', 'groups', 'participants', 'supports', 'birthdays', 'feedback'.
 */
export async function moduleViewerIds(supabase: SupabaseClient, module: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('module_viewers', { p_module: module })
  if (!error && Array.isArray(data)) {
    return Array.from(new Set((data as unknown[]).map((id) => String(id)).filter(Boolean)))
  }
  console.error('moduleViewerIds failed, falling back to admins:', error?.message)
  const { data: admins } = await supabase.from('User').select('id').eq('role', 'ADMIN').neq('isActive', false)
  return Array.from(new Set(((admins ?? []) as Array<{ id: string }>).map((a) => a.id).filter(Boolean)))
}

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

export interface ParticipantNotificationRow {
  participantId: string
  title: string
  body: string
  /** Participant-app deep link; keep in sync with the push payload's data.path. */
  path?: string | null
  type?: string
}

/**
 * Participant-bell counterpart of insertNotifications: one row per targeted
 * participant in ParticipantNotification, whether or not they have push on.
 * Deduplicates participantIds. Logs and returns 0 on failure, never throws.
 */
export async function insertParticipantNotifications(
  supabase: SupabaseClient,
  rows: ParticipantNotificationRow[],
): Promise<number> {
  const seen = new Set<string>()
  const payload = (rows ?? [])
    .filter((r) => r.participantId && !seen.has(r.participantId) && seen.add(r.participantId))
    .map((r) => ({
      participantId: r.participantId,
      title: r.title,
      body: r.body,
      path: r.path ?? null,
      type: r.type ?? 'GENERAL',
    }))
  if (payload.length === 0) return 0
  try {
    const { error } = await supabase.from('ParticipantNotification').insert(payload)
    if (error) {
      console.error('insertParticipantNotifications failed:', error.message)
      return 0
    }
    return payload.length
  } catch (err) {
    console.error('insertParticipantNotifications threw:', String(err))
    return 0
  }
}
