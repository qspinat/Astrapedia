const CACHE_NAME = 'skymap-v3';
const CACHE_VERSION = 3;

// Cache TTL in milliseconds (24 hours for external resources)
const EXTERNAL_CACHE_TTL = 24 * 60 * 60 * 1000;

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

// External resources to cache on first use (with TTL)
const EXTERNAL_CACHE_PATTERNS = [
    'cdnjs.cloudflare.com',
    'upload.wikimedia.org',
    'cdn.esahubble.org',
    'esawebb.org'
];

// Cache metadata store for TTL tracking
const CACHE_METADATA_KEY = 'skymap-cache-metadata';

/**
 * Get cache metadata from IndexedDB or localStorage fallback.
 * @returns {Promise<Object>} Cache metadata object
 */
async function getCacheMetadata() {
    try {
        const stored = localStorage.getItem(CACHE_METADATA_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Save cache metadata.
 * @param {Object} metadata - Metadata to save
 */
async function saveCacheMetadata(metadata) {
    try {
        localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(metadata));
    } catch (e) {
        // Ignore storage errors
    }
}

/**
 * Check if a cached response is still valid based on TTL.
 * @param {string} url - URL to check
 * @param {Object} metadata - Cache metadata
 * @returns {boolean} True if cache is still valid
 */
function isCacheValid(url, metadata) {
    const entry = metadata[url];
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    return age < EXTERNAL_CACHE_TTL;
}

/**
 * Validate response before caching.
 * @param {Response} response - Response to validate
 * @returns {boolean} True if response should be cached
 */
function shouldCacheResponse(response) {
    // Only cache successful responses
    if (!response || response.status !== 200) return false;

    // Don't cache error pages
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') && response.url.includes('error')) {
        return false;
    }

    // Check for no-store directive
    const cacheControl = response.headers.get('cache-control') || '';
    if (cacheControl.includes('no-store')) return false;

    return true;
}

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
        Promise.all([
            // Delete old cache versions
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('skymap-') && name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            }),
            // Clean up old metadata
            getCacheMetadata().then(metadata => {
                const now = Date.now();
                const cleaned = {};
                for (const [url, entry] of Object.entries(metadata)) {
                    if (now - entry.timestamp < EXTERNAL_CACHE_TTL * 2) {
                        cleaned[url] = entry;
                    }
                }
                return saveCacheMetadata(cleaned);
            }),
            self.clients.claim()
        ])
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
        url.hostname.includes('archive.stsci.edu') ||
        url.hostname.includes('skyview.gsfc.nasa.gov') ||
        url.hostname.includes('images-api.nasa.gov') ||
        url.hostname.includes('skyserver.sdss.org') ||
        (url.hostname.includes('wikipedia.org') && url.pathname.includes('/api/'))) {
        return;
    }

    // Check if this is an external resource we should cache
    const isExternal = EXTERNAL_CACHE_PATTERNS.some(
        pattern => url.hostname.includes(pattern)
    );

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(event.request);

            // For external resources, check TTL
            if (cachedResponse && isExternal) {
                const metadata = await getCacheMetadata();
                if (isCacheValid(event.request.url, metadata)) {
                    return cachedResponse;
                }
                // Cache expired, delete it
                await cache.delete(event.request);
            } else if (cachedResponse) {
                // Static assets don't expire
                return cachedResponse;
            }

            try {
                const response = await fetch(event.request);

                // Validate before caching
                if (shouldCacheResponse(response)) {
                    const shouldCache = isExternal || url.origin === self.location.origin;

                    if (shouldCache) {
                        const responseToCache = response.clone();
                        await cache.put(event.request, responseToCache);

                        // Update metadata for external resources
                        if (isExternal) {
                            const metadata = await getCacheMetadata();
                            metadata[event.request.url] = {
                                timestamp: Date.now(),
                                size: parseInt(response.headers.get('content-length') || '0', 10)
                            };
                            await saveCacheMetadata(metadata);
                        }
                    }
                }

                return response;
            } catch (error) {
                // Offline fallback for HTML pages
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return cache.match('/app.html');
                }
                throw error;
            }
        })()
    );
});
