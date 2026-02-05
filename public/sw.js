/* Minimal service worker (online-first).
 * - Required for "Install app" criteria on some browsers.
 * - Does NOT cache or provide offline behavior.
 */

self.addEventListener('install', (_event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (_event) => {
  _event.waitUntil(self.clients.claim())
})

// Passthrough fetch (no caching)
self.addEventListener('fetch', () => {})

