const CACHE_NAME = 'skymap-v2';
const STATIC_ASSETS = [
    '/app.html',
    '/skymap.js',
    '/styles.css',
    '/favicon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
    '/data/stars_bright.json',
    '/data/constellations.json',
    '/data/deep_sky_objects.json',
    '/data/named_objects.json'
];

// External resources to cache on first use
const EXTERNAL_CACHE_PATTERNS = [
    'cdnjs.cloudflare.com',
    'upload.wikimedia.org',
    'cdn.esahubble.org',
    'esawebb.org'
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip API queries and dynamic image sources - always fetch fresh
    if (url.hostname.includes('simbad') ||
        url.hostname.includes('vizier') ||
        url.hostname.includes('archive.stsci.edu') ||  // DSS images
        url.hostname.includes('skyview.gsfc.nasa.gov') ||  // NASA SkyView
        url.hostname.includes('images-api.nasa.gov') ||  // NASA Images API
        url.hostname.includes('skyserver.sdss.org') ||  // SDSS images
        (url.hostname.includes('wikipedia.org') && url.pathname.includes('/api/'))) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Cache external resources that match our patterns
                        const shouldCache = EXTERNAL_CACHE_PATTERNS.some(
                            pattern => url.hostname.includes(pattern)
                        );

                        if (shouldCache || url.origin === self.location.origin) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseToCache));
                        }

                        return response;
                    })
                    .catch(() => {
                        // Offline fallback for HTML pages
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('/app.html');
                        }
                    });
            })
    );
});
