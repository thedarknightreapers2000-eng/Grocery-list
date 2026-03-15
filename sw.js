// ── ದಿನಸಿ ಪಟ್ಟಿ Service Worker v2.6 ──────────────────
// Strategy:
//   HTML/JS  → Network-first (always get latest from server)
//   Images   → Cache-first  (icons don't change)
// localStorage is NEVER touched by the SW — credentials are safe.

const CACHE_NAME    = 'dinasi-patti-v2';
const STATIC_ASSETS = ['./icon-192.png', './icon-512.png', './manifest.json'];

// ── INSTALL: pre-cache only static assets (not HTML) ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: remove ALL old caches ───────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin (GitHub API calls etc.)
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const isHTML = e.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/');

  if (isHTML) {
    // ── NETWORK-FIRST for HTML ──────────────────────
    // Always try to get the latest version from GitHub Pages.
    // Only fall back to cache if completely offline.
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          // Store a fresh copy in cache for offline fallback
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => {
          // Offline — serve cached version
          return caches.match(e.request)
            .then(cached => cached || caches.match('./index.html'));
        })
    );
  } else {
    // ── CACHE-FIRST for images/icons/manifest ───────
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        });
      })
    );
  }
});

// ── NOTIFICATION CLICK ────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      if (wins.length) return wins[0].focus();
      return clients.openWindow('./index.html');
    })
  );
});
