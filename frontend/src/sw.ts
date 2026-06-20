/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  // Always show *something* — a push that arrives with a missing or malformed
  // payload should still surface a notification rather than vanish silently.
  type PushPayload = {
    title?: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: Record<string, unknown>
  }

  let data: PushPayload = {}
  if (event.data) {
    try {
      data = event.data.json() as PushPayload
    } catch {
      // Non-JSON payload — fall back to raw text as the body.
      try {
        data = { body: event.data.text() }
      } catch {
        data = {}
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'FOF Ops', {
      body: data.body || 'You have a new update.',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || 'fof-reminder',
      data: data.data,
    })
  )
})

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const targetPath = typeof event.notification.data?.path === 'string' ? event.notification.data.path : '/'
      const targetUrl = `${self.location.origin}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            void client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
