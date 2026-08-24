// Bump on every release that changes any precached asset. Cached same-origin
// responses have no TTL and are evicted only when this name changes, so a
// returning user otherwise keeps the old JS, the old modules and the old star
// catalog indefinitely.
const CACHE_NAME = 'astrapedia-v9';

// Cache TTL in milliseconds (24 hours for external resources)
const EXTERNAL_CACHE_TTL = 24 * 60 * 60 * 1000;

// Multiplier for cleanup threshold (entries older than TTL * this are deleted)
// Using 2x means we keep entries up to 48 hours before cleanup
const CLEANUP_TTL_MULTIPLIER = 2;

// build:web deploys the app as both index.html (the entry point) and
// app.html (the path used when serving the repo directly in development).
// cache.addAll is atomic: one 404 here rejects the whole install and leaves
// the app with no offline cache at all, warned about only in the console.
// scripts/verify-precache.mjs checks this list against a built www/.
const STATIC_ASSETS = [
    '/index.html',
    '/app.html',
    '/main.js',
    '/skymap.js',
    '/styles.css',
    '/lib/three.min.js',
    '/lib/astronomy.browser.min.js',
    '/favicon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
    '/data/stars_medium.json',
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

// IndexedDB configuration for cache metadata
const IDB_NAME = 'astrapedia-cache-db';
const IDB_VERSION = 1;
const IDB_STORE = 'cache-metadata';

// In-memory fallback for cache metadata when IndexedDB is unavailable
const memoryCache = new Map();
let idbAvailable = true;

/**
 * Open IndexedDB connection.
 * @returns {Promise<IDBDatabase>} Database connection
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (!idbAvailable) {
            reject(new Error('IndexedDB unavailable'));
            return;
        }

        const request = indexedDB.open(IDB_NAME, IDB_VERSION);

        request.onerror = () => {
            idbAvailable = false;
            console.warn('IndexedDB unavailable, using in-memory fallback');
            reject(request.error);
        };
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'url' });
            }
        };
    });
}

/**
 * Get cache metadata for a URL from IndexedDB or memory fallback.
 * @param {string} url - URL to look up
 * @returns {Promise<Object|null>} Metadata entry or null
 */
async function getCacheEntry(url) {
    // Try memory cache first (fast path)
    if (memoryCache.has(url)) {
        return memoryCache.get(url);
    }

    // Try IndexedDB if available
    if (idbAvailable) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const request = store.get(url);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const result = request.result || null;
                    // Populate memory cache for fast subsequent access
                    if (result) {
                        memoryCache.set(url, result);
                    }
                    resolve(result);
                };
            });
        } catch (e) {
            console.warn('IndexedDB read error:', e);
        }
    }

    return null;
}

/**
 * Save cache metadata for a URL to IndexedDB and memory.
 * @param {string} url - URL to save
 * @param {number} timestamp - Cache timestamp
 * @param {number} size - Response size in bytes
 */
async function saveCacheEntry(url, timestamp, size) {
    const entry = { url, timestamp, size };

    // Always save to memory cache
    memoryCache.set(url, entry);

    // Try IndexedDB if available
    if (idbAvailable) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                const request = store.put(entry);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (e) {
            console.warn('IndexedDB write error:', e);
        }
    }
}

/**
 * Delete cache metadata for a URL from IndexedDB and memory.
 * @param {string} url - URL to delete
 */
async function deleteCacheEntry(url) {
    // Always remove from memory cache
    memoryCache.delete(url);

    // Try IndexedDB if available
    if (idbAvailable) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                const request = store.delete(url);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (e) {
            console.warn('IndexedDB delete error:', e);
        }
    }
}

/**
 * Clean up expired entries from IndexedDB and memory.
 */
async function cleanupExpiredEntries() {
    const now = Date.now();
    const cleanupThreshold = EXTERNAL_CACHE_TTL * CLEANUP_TTL_MULTIPLIER;

    // Clean up memory cache
    for (const [url, entry] of memoryCache.entries()) {
        if (now - entry.timestamp > cleanupThreshold) {
            memoryCache.delete(url);
        }
    }

    // Clean up IndexedDB if available
    if (idbAvailable) {
        try {
            const db = await openDB();

            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                const request = store.openCursor();

                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const entry = cursor.value;
                        // Delete entries older than TTL * CLEANUP_TTL_MULTIPLIER
                        if (now - entry.timestamp > cleanupThreshold) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
            });
        } catch (e) {
            console.warn('IndexedDB cleanup error:', e);
        }
    }
}

/**
 * Check if a cached response is still valid based on TTL.
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} True if cache is still valid
 */
async function isCacheValid(url) {
    const entry = await getCacheEntry(url);
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

/**
 * Create a network error response.
 * @param {string} message - Error message
 * @returns {Response} Error response
 */
function createNetworkErrorResponse(message) {
    return new Response(
        JSON.stringify({ error: 'Network error', message }),
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
        }
    );
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
        (async () => {
            // Delete old cache versions
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => (name.startsWith('astrapedia-') || name.startsWith('skymap-')) && name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );

            // Clean up expired metadata entries
            await cleanupExpiredEntries();

            // Take control of all clients
            await self.clients.claim();

            console.log('Service worker activated, old caches cleaned');
        })()
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

            // Same-origin app assets (HTML/CSS/JS/data): NETWORK-FIRST. The app
            // is bundled in the APK, so "network" is the always-current local
            // copy. Cache-first here was the bug behind a broken layout after
            // updates: a new build's HTML would load while a stale cached
            // stylesheet was served, so nothing lined up. Cache is now only the
            // offline fallback.
            if (!isExternal) {
                try {
                    const response = await fetch(event.request);
                    if (shouldCacheResponse(response) &&
                        url.origin === self.location.origin) {
                        await cache.put(event.request, response.clone());
                    }
                    return response;
                } catch (error) {
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        const fallback = await cache.match('/app.html');
                        if (fallback) return fallback;
                    }
                    return createNetworkErrorResponse(error.message);
                }
            }

            // External resources (CDN images, etc.): cache-first with TTL —
            // this is the real offline benefit.
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                const valid = await isCacheValid(event.request.url);
                if (valid) return cachedResponse;
                await cache.delete(event.request);
                await deleteCacheEntry(event.request.url);
            }

            try {
                const response = await fetch(event.request);
                if (shouldCacheResponse(response)) {
                    await cache.put(event.request, response.clone());
                    const size = parseInt(
                        response.headers.get('content-length') || '0', 10);
                    await saveCacheEntry(event.request.url, Date.now(), size);
                }
                return response;
            } catch (error) {
                console.warn('Fetch failed:', event.request.url, error.message);
                return cachedResponse ||
                    createNetworkErrorResponse(error.message);
            }
        })()
    );
});
