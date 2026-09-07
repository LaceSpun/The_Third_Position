// Bump this whenever any cached asset changes — it's what forces old
// clients to drop stale files instead of serving them from cache forever.
const CACHE_NAME = "third-position-v11";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/dilemmas.js",
  "js/mechanisms.js",
  "js/db.js",
  "js/discovery.js",
  "js/map.js",
  "js/exportImport.js",
  "js/groq.js",
  "js/oddOneOut.js",
  "js/patternCheck.js",
  "js/app.js",
  "icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only manage this app's own same-origin assets. Cross-origin requests —
  // every call this app makes to the optional Groq API, GET or POST — fall
  // through completely untouched: never cached, never served stale, never
  // routed through this cache-first logic at all. Handling those here was a
  // real bug: it silently wrapped third-party API calls in asset-caching
  // behavior they were never meant to have (stale-serving a live models
  // list, polluting this app's own cache with API responses, and risking
  // "Failed to fetch" if this handler's own network attempt fails with
  // nothing cached to fall back to).
  if (new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
