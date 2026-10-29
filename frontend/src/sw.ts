/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Big, rarely used files (PDF tools, class manuals) are not saved on the first visit. They are
// saved the first time they are opened and then work offline. Their names change with every build.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'runtime-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 })],
  }),
)

// The guides (/guides/: the app guide's page, words and screenshots, the welcome and role guides) keep
// their names when they are edited, so they are shown from the saved copy straight away and refreshed in
// the background: an edited guide shows on the next open, offline still works, and no version is needed.
// Their own cache, so the app guide's many screenshots never push the class manuals out of runtime-assets.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/guides/'),
  new StaleWhileRevalidate({
    cacheName: 'guides',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 })],
  }),
)

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
      // Tell the app which push was tapped (its title and text), so the matching bell copy counts as read.
      // On a shared phone the title carries the person's name; readTitle is the bell copy's own title.
      const readTitle = typeof event.notification.data?.readTitle === 'string' ? event.notification.data.readTitle : event.notification.title
      const tap = targetPath.includes('#') ? '' : `#fof-tap=${encodeURIComponent(JSON.stringify({ t: readTitle, b: event.notification.body }))}`
      const targetUrl = `${self.location.origin}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}${tap}`
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
