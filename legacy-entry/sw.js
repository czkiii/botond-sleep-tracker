// Transition from the old cached app without taking over an open sleep diary.
// Existing windows must close before this worker activates.
const cacheName = 'solemi-legacy-entry-v1'
const base = self.registration.scope
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([
    new URL('index.html', base).href,
    new URL('entry.js', base).href,
    new URL('entry.css', base).href,
  ])))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !url.href.startsWith(base)) return
  const relative = url.pathname.slice(new URL(base).pathname.length)
  const asset = ['entry.js', 'entry.css'].includes(relative)
  if (event.request.mode !== 'navigate' && !asset) return
  event.respondWith(fetch(event.request).then(response => {
    if (!response.ok) throw new Error('Entry unavailable')
    return response
  }).catch(async () => {
    const cache = await caches.open(cacheName)
    return await cache.match(new URL(asset ? relative : 'index.html', base).href) || Response.error()
  }))
})
