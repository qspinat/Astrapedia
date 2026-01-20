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

// IndexedDB configuration for cache metadata
const IDB_NAME = 'skymap-cache-db';
const IDB_VERSION = 1;
const IDB_STORE = 'cache-metadata';

/**
 * Open IndexedDB connection.
 * @returns {Promise<IDBDatabase>} Database connection
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);

        request.onerror = () => reject(request.error);
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
 * Get cache metadata for a URL from IndexedDB.
 * @param {string} url - URL to look up
 * @returns {Promise<Object|null>} Metadata entry or null
 */
async function getCacheEntry(url) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const request = store.get(url);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (e) {
        console.warn('IndexedDB read error:', e);
        return null;
    }
}

/**
 * Save cache metadata for a URL to IndexedDB.
 * @param {string} url - URL to save
 * @param {number} timestamp - Cache timestamp
 * @param {number} size - Response size in bytes
 */
async function saveCacheEntry(url, timestamp, size) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const request = store.put({ url, timestamp, size });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (e) {
        console.warn('IndexedDB write error:', e);
    }
}

/**
 * Delete cache metadata for a URL from IndexedDB.
 * @param {string} url - URL to delete
 */
async function deleteCacheEntry(url) {
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

/**
 * Clean up expired entries from IndexedDB.
 */
async function cleanupExpiredEntries() {
    try {
        const db = await openDB();
        const now = Date.now();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const request = store.openCursor();

            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const entry = cursor.value;
                    // Delete entries older than 2x TTL
                    if (now - entry.timestamp > EXTERNAL_CACHE_TTL * 2) {
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
            // Clean up expired metadata entries
            cleanupExpiredEntries(),
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
                const valid = await isCacheValid(event.request.url);
                if (valid) {
                    return cachedResponse;
                }
                // Cache expired, delete it
                await cache.delete(event.request);
                await deleteCacheEntry(event.request.url);
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
                            const size = parseInt(
                                response.headers.get('content-length') || '0',
                                10
                            );
                            await saveCacheEntry(event.request.url, Date.now(), size);
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
