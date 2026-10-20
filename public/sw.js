const STATIC_CACHE = "colapso-static-v5";
const RUNTIME_CACHE = "colapso-runtime-v5";
const FONT_CACHE = "colapso-fonts-v5";

const APP_SHELL_FILES = [
  "./",
  "./index.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, FONT_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Same origin: shell (HTML) network-first, assets update-in-background
  // (stale-while-revalidate) so a new release always reaches the device
  // while still working fully offline afterwards.
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache Google Fonts to keep typography available offline after first load.
  if (url.origin.includes("fonts.googleapis.com") || url.origin.includes("fonts.gstatic.com")) {
    event.respondWith(staleWhileRevalidate(event.request, FONT_CACHE));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (shouldCacheResponse(request, response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const shell = await caches.match("./index.html");
    if (shell) return shell;

    throw new Error("Offline and no cached shell available");
  }
}

// Nunca guardar no cache uma resposta que nao corresponde ao tipo de asset
// pedido (ex.: o Vite em desenvolvimento devolve CSS embrulhado em JavaScript).
function shouldCacheResponse(request, response) {
  if (!response || !response.ok) return false;

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const path = new URL(request.url).pathname.toLowerCase();

  if (path.endsWith(".css")) return contentType.includes("text/css");
  if (path.endsWith(".js") || path.endsWith(".mjs")) return contentType.includes("javascript");
  if (path.endsWith(".html") || path.endsWith(".htm")) return contentType.includes("text/html");

  return true;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || networkFetch;
}