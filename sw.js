// The release preparation script replaces the version with the build digest.
importScripts('web-config.js');
const CACHE_NAME = 'hsi-pwa-fa77205583ca9bd3';
const IMAGE_CACHE = 'hsi-public-carousel-v1';
const API_ORIGIN = new URL(self.HSI_WEB_CONFIG.apiBase).origin;
const IMAGE_MAX_ENTRIES = 24;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_FRESH_MS = 60 * 60 * 1000;
const IMAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const imageUpdates = new Map();
const ROOT = new URL('./', self.location.href);
const CORE = ['./', 'offline.html', 'manifest.json', 'pwa.js',
  'flutter_bootstrap.js', 'main.dart.js', 'icons/Icon-192.png',
  'vendor/cropper.min.js', 'vendor/cropper.min.css', 'install.css', 'install.js', 'web-config.js', 'notification-audio.js'];

function isPublicCarousel(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && !request.headers.has('Authorization') &&
    url.origin === API_ORIGIN && !url.search &&
    url.pathname.startsWith('/media/carousel_banners/') &&
    /\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname);
}

async function refreshImage(request, cache) {
  if (imageUpdates.has(request.url)) return (await imageUpdates.get(request.url)).clone();
  const update = (async () => {
    const response = await fetch(request);
    if (response.status === 404 || response.status === 410) await cache.delete(request);
    // Cache only readable, public image responses; never opaque error pages.
    if (response.ok && response.headers.get('Content-Type')?.startsWith('image/') &&
        !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
      try {
        const bytes = await response.clone().blob();
        if (bytes.size <= IMAGE_MAX_BYTES) {
          const headers = new Headers(response.headers);
          headers.set('X-HSI-Cached-At', String(Date.now()));
          await cache.put(request, new Response(bytes, {status: 200, headers}));
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - IMAGE_MAX_ENTRIES))) await cache.delete(key);
        }
      } catch (_) { /* Quota/storage errors must never hide a downloaded image. */ }
    }
    return response;
  })();
  imageUpdates.set(request.url, update);
  try { return (await update).clone(); } finally { imageUpdates.delete(request.url); }
}

async function carouselImage(event) {
  let cache;
  try { cache = await caches.open(IMAGE_CACHE); } catch (_) { return fetch(event.request); }
  const cached = await cache.match(event.request);
  const age = cached ? Date.now() - Number(cached.headers.get('X-HSI-Cached-At') || 0) : Infinity;
  if (cached && age < IMAGE_MAX_AGE_MS) {
    if (age >= IMAGE_FRESH_MS) event.waitUntil(refreshImage(event.request, cache).catch(() => {}));
    return cached;
  }
  if (cached) await cache.delete(event.request);
  return refreshImage(event.request, cache);
}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(CORE.map((path) => new URL(path, ROOT).href))));
  // Keep a new release waiting until existing application windows are closed.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('hsi-pwa-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (isPublicCarousel(request)) {
    event.respondWith(carouselImage(event));
    return;
  }
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('Authorization') ||
      url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  const path = url.pathname.slice(ROOT.pathname.length);
  // Never put account responses, uploaded media or JWT-bearing URLs in CacheStorage.
  if (url.search || /^(api|media|admin|ws)(\/|$)/.test(path)) return;
  const isStatic = /^(assets|icons|canvaskit|vendor)\//.test(path) ||
    /^(|index.html|offline.html|main.dart.js|flutter_bootstrap.js|flutter.js|pwa.js|install.js|install.css|web-config.js|notification-audio.js|manifest.json|version.json|favicon.png)$/.test(path);
  if (!isStatic && request.mode !== 'navigate') return;
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE_NAME); } catch (_) { return fetch(request); }
    // Bundled images/fonts belong to this release's content fingerprint.
    if (/^(assets|icons|canvaskit|vendor)\//.test(path)) {
      const stored = await cache.match(request);
      if (stored) return stored;
    }
    try {
      const response = await fetch(request);
      if (response.ok && isStatic) {
        try { await cache.put(request, response.clone()); } catch (_) {}
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await cache.match(new URL('./', ROOT).href)) ||
          (await cache.match(new URL('offline.html', ROOT).href));
      }
      throw error;
    }
  })());
});
