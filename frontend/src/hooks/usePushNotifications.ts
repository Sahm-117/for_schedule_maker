import { useEffect, useRef } from 'react'
import { pushSubscriptionsApi } from '../services/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const usePushNotifications = (userId: string | undefined, role: string | undefined) => {
  const attempted = useRef(false)

  useEffect(() => {
    if (!userId || role !== 'SUPPORT' || attempted.current) return
    if (!VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    attempted.current = true

    const register = async () => {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()

        const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })

        await pushSubscriptionsApi.save(userId, subscription.toJSON())
      } catch (err) {
        console.warn('Push notification setup failed:', err)
      }
    }

    void register()
  }, [userId, role])
}
