const CACHE_VERSION = 'v2';
const OFFLINE_CACHE = `offline-${CACHE_VERSION}`;
const ASSET_CACHE = `asset-${CACHE_VERSION}`;
const IMAGE_CACHE = `image-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [OFFLINE_URL, '/icon-192.png', '/icon-512.png'];
const SW_CACHE_TIME_HEADER = 'x-sw-cache-time';
const NAVIGATION_NETWORK_TIMEOUT_MS = 4500;
const ASSET_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const ASSET_MAX_ENTRIES = 120;
const IMAGE_MAX_ENTRIES = 120;
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'signature',
  'sig',
  'expires',
  'x-amz-signature',
  'x-amz-security-token',
  'x-goog-signature',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = new Set([OFFLINE_CACHE, ASSET_CACHE, IMAGE_CACHE]);
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !expectedCaches.has(name))
          .map((name) => caches.delete(name)),
      );
      await pruneCacheByPolicy(await caches.open(ASSET_CACHE), {
        maxEntries: ASSET_MAX_ENTRIES,
        maxAgeMs: ASSET_MAX_AGE_MS,
      });
      await pruneCacheByPolicy(await caches.open(IMAGE_CACHE), {
        maxEntries: IMAGE_MAX_ENTRIES,
        maxAgeMs: IMAGE_MAX_AGE_MS,
      });
      await self.clients.claim();
    })(),
  );
});

function isSensitiveRequest(request, requestUrl, isSameOrigin) {
  if (!isSameOrigin) {
    return false;
  }

  if (request.headers.has('authorization')) {
    return true;
  }

  if (
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname.startsWith('/auth/') ||
    requestUrl.pathname.startsWith('/_next/data/')
  ) {
    return true;
  }

  for (const key of requestUrl.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function isCacheableResponse(response) {
  if (!response) {
    return false;
  }
  return response.ok || response.type === 'opaque';
}

function withCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set(SW_CACHE_TIME_HEADER, Date.now().toString());
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isExpired(response, maxAgeMs) {
  if (!response || maxAgeMs <= 0) {
    return false;
  }
  const value = response.headers.get(SW_CACHE_TIME_HEADER);
  const cachedAt = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(cachedAt)) {
    return false;
  }
  return Date.now() - cachedAt > maxAgeMs;
}

async function pruneCacheByPolicy(cache, policy) {
  const { maxEntries, maxAgeMs } = policy;

  if (maxAgeMs > 0) {
    const requests = await cache.keys();
    await Promise.all(
      requests.map(async (request) => {
        const response = await cache.match(request);
        if (response && isExpired(response, maxAgeMs)) {
          await cache.delete(request);
        }
      }),
    );
  }

  if (maxEntries > 0) {
    const keys = await cache.keys();
    const overflow = keys.length - maxEntries;
    if (overflow > 0) {
      await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
    }
  }
}

async function putWithPolicy(cache, request, response, policy) {
  if (!isCacheableResponse(response)) {
    return;
  }
  await cache.put(request, withCacheTimestamp(response));
  await pruneCacheByPolicy(cache, policy);
}

async function staleWhileRevalidate(request, cacheName, policy) {
  const cache = await caches.open(cacheName);
  const cachedResponseRaw = await cache.match(request);
  const cachedResponse =
    cachedResponseRaw && !isExpired(cachedResponseRaw, policy.maxAgeMs)
      ? cachedResponseRaw
      : null;

  const networkPromise = fetch(request).then(async (response) => {
      await putWithPolicy(cache, request, response, policy);
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    // Allow background refresh without blocking current render.
    void networkPromise;
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return cachedResponseRaw || Response.error();
}

async function cacheFirst(request, cacheName, policy) {
  const cache = await caches.open(cacheName);
  const cachedResponseRaw = await cache.match(request);
  const cachedResponse =
    cachedResponseRaw && !isExpired(cachedResponseRaw, policy.maxAgeMs)
      ? cachedResponseRaw
      : null;

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    await putWithPolicy(cache, request, response, policy);
    return response;
  } catch (error) {
    if (cachedResponseRaw) {
      return cachedResponseRaw;
    }
    throw error;
  }
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleNavigationRequest(request) {
  try {
    return await fetchWithTimeout(request, NAVIGATION_NETWORK_TIMEOUT_MS);
  } catch (error) {
    const cache = await caches.open(OFFLINE_CACHE);
    const offlineResponse = await cache.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isSensitiveRequest(request, requestUrl, isSameOrigin)) {
    return;
  }

  const isStaticAsset =
    isSameOrigin &&
    (requestUrl.pathname.startsWith('/_next/static/') ||
      requestUrl.pathname.startsWith('/_next/image') ||
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      request.destination === 'worker');

  if (isStaticAsset) {
    event.respondWith(
      staleWhileRevalidate(request, ASSET_CACHE, {
        maxEntries: ASSET_MAX_ENTRIES,
        maxAgeMs: ASSET_MAX_AGE_MS,
      }),
    );
    return;
  }

  if (isSameOrigin && request.destination === 'image') {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE, {
        maxEntries: IMAGE_MAX_ENTRIES,
        maxAgeMs: IMAGE_MAX_AGE_MS,
      }),
    );
  }
});

function parsePushPayload(payload) {
  if (!payload) {
    return null;
  }

  try {
    return payload.json();
  } catch (error) {
    return {
      title: 'KU BAZAR',
      body: payload.text(),
    };
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data);
  if (!payload) {
    return;
  }

  const title = payload.title || 'KU BAZAR';
  const options = {
    body: payload.body || 'You have a new notification.',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/', self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url === targetUrl || client.url.startsWith(`${targetUrl}#`)) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return null;
    })(),
  );
});
