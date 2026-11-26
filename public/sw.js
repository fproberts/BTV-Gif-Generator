/*
 * Boogie Board service worker: makes the app work with no signal or very slow signal.
 *
 *   App page ("/")          network first, but give up after NAV_TIMEOUT_MS and use the saved copy
 *                           (the network reply still refreshes the saved copy for next time)
 *   /_next/static, /fonts,  cache first (file names never change)
 *   icons, manifest
 *   /uploads/*              cache first (each upload has a unique name); the app asks for the whole
 *                           library to be saved ahead of time via a "cache-urls" message
 *   everything else         straight to the network (server actions, uploads, deletes)
 */
const VERSION = 'v1';
const SHELL = `bb-shell-${VERSION}`;
const STATIC = `bb-static-${VERSION}`;
const MEDIA = `bb-media-${VERSION}`;
const NAV_TIMEOUT_MS = 2500;
const PRECACHE = ['/', '/manifest.json', '/fonts/GoogleSans-Medium.ttf', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC).then((c) => Promise.allSettled(PRECACHE.filter((u) => u !== '/').map((u) => c.add(u))))
            .then(() => caches.open(SHELL))
            .then((c) => c.add('/').catch(() => {}))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    const keep = new Set([SHELL, STATIC, MEDIA]);
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

function isStatic(url) {
    return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') ||
        /^\/(icon-\d+|icon-maskable-\d+|apple-touch-icon|icon)\.png$/.test(url.pathname) || url.pathname === '/manifest.json';
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
}

async function appPage(request) {
    const cache = await caches.open(SHELL);
    const network = fetch(request)
        .then((res) => {
            if (res.ok) cache.put('/', res.clone());
            return res;
        });
    const saved = await cache.match('/', { ignoreVary: true });
    if (!saved) return network; // first visit: nothing saved yet, wait for the network
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
    const winner = await Promise.race([network.catch(() => null), timeout]);
    if (winner) return winner;
    network.catch(() => {}); // keep refreshing the saved copy in the background
    return saved;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate' && url.pathname === '/') {
        event.respondWith(appPage(request));
    } else if (isStatic(url)) {
        event.respondWith(cacheFirst(request, STATIC));
    } else if (url.pathname.startsWith('/uploads/')) {
        event.respondWith(cacheFirst(request, MEDIA));
    }
});

// The page asks us to save a list of URLs (library pictures, scripts it loaded before we were installed).
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
        const media = await caches.open(MEDIA);
        const stat = await caches.open(STATIC);
        let done = 0;
        let failed = 0;
        for (const raw of data.urls) {
            try {
                const url = new URL(raw, self.location.origin);
                if (url.origin !== self.location.origin) continue;
                const cache = url.pathname.startsWith('/uploads/') ? media : stat;
                if (!(await cache.match(url.pathname, { ignoreVary: true }))) {
                    const res = await fetch(url.pathname);
                    if (res.ok) await cache.put(url.pathname, res);
                    else failed++;
                }
            } catch {
                failed++;
            }
            done++;
            if (port && (done % 5 === 0 || done === data.urls.length)) port.postMessage({ done, failed, total: data.urls.length });
        }
        if (port) port.postMessage({ done, failed, total: data.urls.length, finished: true });
    })());
});
