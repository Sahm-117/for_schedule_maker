import { useEffect, useRef, useState } from 'react'
import { pushSubscriptionsApi } from '../services/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
// Dismissing the prompt ("Not now") or the blocked notice only hides it for the
// rest of this app session — sessionStorage clears on the next launch, so it
// comes back rather than being gated forever (that was the old PROMPTED_KEY
// localStorage behaviour, now removed).
const SESSION_DISMISS_KEY = 'fof_notif_dismissed_session'

export type PushNotificationStatus = 'unsupported' | 'blocked' | 'ready' | 'saving' | 'enabled' | 'failed'

const wasDismissedThisSession = (): boolean => {
  try { return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1' } catch { return false }
}
const markDismissedThisSession = (): void => {
  try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1') } catch { /* private browsing etc. */ }
}

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const canUsePush = () =>
  'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY

const registerSubscription = async (userId: string) => {
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
  })
  await pushSubscriptionsApi.save(userId, subscription.toJSON())
}

export const usePushNotifications = (userId: string | undefined) => {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showBlocked, setShowBlocked] = useState(false)
  const [status, setStatus] = useState<PushNotificationStatus>('ready')
  const registered = useRef(false)

  useEffect(() => {
    if (!userId) return
    if (!canUsePush()) {
      setStatus('unsupported')
      return
    }
    if (registered.current) return
    registered.current = true

    const permission = Notification.permission
    const dismissed = wasDismissedThisSession()

    if (permission === 'granted') {
      // Already allowed — silently re-register to refresh stale endpoints
      registerSubscription(userId)
        .then(() => setStatus('enabled'))
        .catch(() => setStatus('failed'))
    } else if (permission === 'denied') {
      setStatus('blocked')
      // Ask every launch, unless dismissed earlier this session.
      if (!dismissed) setShowBlocked(true)
    } else if (permission === 'default') {
      setStatus('ready')
      // Ask every launch, unless dismissed earlier this session.
      if (!dismissed) setShowPrompt(true)
    } else {
      setStatus('ready')
    }
  }, [userId])

  const enable = async () => {
    setShowPrompt(false)
    markDismissedThisSession()
    if (!userId) return
    if (!canUsePush()) {
      setStatus('unsupported')
      return
    }
    try {
      setStatus('saving')
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
      if (permission === 'granted') {
        await registerSubscription(userId)
        setStatus('enabled')
      } else {
        setStatus('blocked')
      }
    } catch (err) {
      setStatus('failed')
      console.warn('Push notification setup failed:', err)
    }
  }

  const dismiss = () => {
    setShowPrompt(false)
    markDismissedThisSession()
  }

  const dismissBlocked = () => {
    setShowBlocked(false)
    markDismissedThisSession()
  }

  return { showPrompt, showBlocked, enable, dismiss, dismissBlocked, status }
}
