importScripts('./config.js');

const CACHE_VERSION = 'v3';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMG_CACHE = `img-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const API_TTL = 24 * 60 * 60 * 1000;
const RSS_TTL = 1 * 60 * 60 * 1000;
const IMG_TTL = 7 * 24 * 60 * 60 * 1000;

function isExpired(cached, ttl) {
  if (!cached) return true;
  return Date.now() - cached.timestamp > ttl;
}

async function cacheWithTimestamp(cache, request, response) {
  const cloned = response.clone();
  const headers = new Headers(cloned.headers);
  headers.set('sw-cache-timestamp', Date.now().toString());
  await cache.put(request, new Response(cloned.body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers,
  }));
}

function getCacheTimestamp(response) {
  const ts = response?.headers?.get('sw-cache-timestamp');
  return ts ? parseInt(ts, 10) : null;
}

// Cache First strategy (for shell assets and images)
async function cacheFirst(request, cacheName, ttl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    const ts = getCacheTimestamp(cached);
    if (!ttl || !isExpired({ timestamp: ts }, ttl)) {
      return cached;
    }
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheWithTimestamp(cache, request, response);
      return response;
    }
    return cached || response;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

// Network First strategy (for API responses)
async function networkFirst(request, cacheName, ttl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheWithTimestamp(cache, request, response);
      return response;
    }
    throw new Error('Non-ok response');
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const ts = getCacheTimestamp(cached);
      const expired = isExpired({ timestamp: ts }, ttl);
      // Return even if expired when offline
      const headers = new Headers(cached.headers);
      headers.delete('sw-cache-timestamp');
      if (expired) {
        headers.set('sw-cache-stale', 'true');
      }
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: 'Offline and no cache' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, API_CACHE, IMG_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // App Shell
  if (url.origin === self.location.origin) {
    if (
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('index.html') ||
      url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('.png')
    ) {
      if (url.pathname.endsWith('.png')) {
        event.respondWith(cacheFirst(event.request, IMG_CACHE, IMG_TTL));
      } else {
        event.respondWith(cacheFirst(event.request, SHELL_CACHE, null));
      }
      return;
    }
  }

  // iTunes API
  if (url.hostname === 'itunes.apple.com') {
    event.respondWith(networkFirst(event.request, API_CACHE, API_TTL));
    return;
  }

  // Podcast artwork images (must be before generic checks — image Accept headers contain "xml")
  if (url.hostname.includes('mzstatic.com') || url.hostname.includes('apple.com')) {
    event.respondWith(cacheFirst(event.request, IMG_CACHE, IMG_TTL));
    return;
  }

  // RSS feeds and CORS proxies
  const corsProxyHost = CONFIG.CORS_PROXY_URL ? new URL(CONFIG.CORS_PROXY_URL).hostname : '';
  if (
    (corsProxyHost && url.hostname === corsProxyHost) ||
    url.hostname === 'api.allorigins.win'
  ) {
    event.respondWith(networkFirst(event.request, API_CACHE, RSS_TTL));
    return;
  }

  // Default: try network
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
