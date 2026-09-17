import { useEffect, useState } from 'react'
import { participantAppApi } from '../services/api'

// Push notifications for the participant app. Same browser flow as the staff
// usePushNotifications hook, but the subscription is saved against the
// participant's session instead of a staff user.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type ParticipantPushStatus = 'unsupported' | 'blocked' | 'ready' | 'saving' | 'enabled' | 'failed'

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const canUsePush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY

const register = async () => {
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
  })
  await participantAppApi.savePushSubscription(subscription.toJSON())
}

export const useParticipantPush = () => {
  const [status, setStatus] = useState<ParticipantPushStatus>(() => {
    if (!canUsePush()) return 'unsupported'
    if (Notification.permission === 'denied') return 'blocked'
    return Notification.permission === 'granted' ? 'saving' : 'ready'
  })

  // Already allowed: quietly refresh the saved subscription.
  useEffect(() => {
    if (!canUsePush() || Notification.permission !== 'granted') return
    register().then(() => setStatus('enabled')).catch(() => setStatus('failed'))
  }, [])

  const enable = async () => {
    if (!canUsePush()) { setStatus('unsupported'); return }
    try {
      setStatus('saving')
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('blocked'); return }
      await register()
      setStatus('enabled')
    } catch {
      setStatus('failed')
    }
  }

  return { status, enable }
}
