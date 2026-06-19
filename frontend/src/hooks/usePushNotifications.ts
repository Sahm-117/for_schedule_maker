import { useEffect, useRef, useState } from 'react'
import { pushSubscriptionsApi } from '../services/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const PROMPTED_KEY = 'fof_notif_prompted'

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
  // Always get a fresh subscription so stale endpoints are replaced
  const existing = await registration.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
  })
  await pushSubscriptionsApi.save(userId, subscription.toJSON())
}

export const usePushNotifications = (userId: string | undefined) => {
  const [showPrompt, setShowPrompt] = useState(false)
  const registered = useRef(false)

  useEffect(() => {
    if (!userId || !canUsePush() || registered.current) return
    registered.current = true

    const permission = Notification.permission

    if (permission === 'granted') {
      // Already allowed — silently re-register to refresh stale endpoints
      registerSubscription(userId).catch(() => {})
    } else if (permission === 'default' && !localStorage.getItem(PROMPTED_KEY)) {
      // Haven't asked yet — show our prompt
      setShowPrompt(true)
    }
  }, [userId])

  const enable = async () => {
    setShowPrompt(false)
    localStorage.setItem(PROMPTED_KEY, '1')
    if (!userId || !canUsePush()) return
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await registerSubscription(userId)
      }
    } catch (err) {
      console.warn('Push notification setup failed:', err)
    }
  }

  const dismiss = () => {
    setShowPrompt(false)
    localStorage.setItem(PROMPTED_KEY, '1')
  }

  return { showPrompt, enable, dismiss }
}
